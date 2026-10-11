#!/usr/bin/env node
/* MTS reader preview: JavaScript orchestration of external document-rendering
 * tools. No Python implementation or accepted MTS runtime changes in this repo.
 * Output is a NON-AUTHORITATIVE draft; source Markdown is never edited.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function fail(message) { throw Error("reader-preview: " + message); }
function run(command, args, opts = {}) {
  const r = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    ...opts });
  if (r.error || r.status !== 0) fail(command + " exited " + r.status +
    "\n" + String(r.error ?? "") + "\n" + String(r.stderr ?? "").slice(-4500));
  return String(r.stdout ?? "");
}
function args() {
  const items = process.argv.slice(2);
  const obj = new Map();
  for (let i=0; i<items.length; i+=2) {
    if (!items[i].startsWith("--") || items[i+1] === undefined) fail("paired CLI args required");
    obj.set(items[i].slice(2), items[i+1]);
  }
  const input=obj.get("input"), css=obj.get("css"), output=obj.get("output-dir");
  const root=obj.get("repo-root"), sha=obj.get("source-sha");
  if (![input,css,output,root,sha].every(Boolean)) fail("missing path/SHA argument");
  if (!/^[0-9a-f]{40}$/.test(sha)) fail("exact SHA is required");
  return { input:path.resolve(input), css:path.resolve(css), output:path.resolve(output),
    root:path.resolve(root), sha };
}
function required(condition, message) { if (!condition) fail(message); }
function count(text, regex) { return [...text.matchAll(regex)].length; }
function transformHTML(text, style) {
  const header=/<header id="title-block-header">[\s\S]*?<\/header>\s*/;
  required(header.test(text), "Pandoc metadata title not found");
  text=text.replace(header,"");
  const toc=/<nav id="TOC"[\s\S]*?<\/nav>/;
  const match=text.match(toc);
  required(match,"Pandoc HTML has no table of contents");
  text=text.replace(toc,"");
  const cover=/<h1 id="[^"]+">[\s\S]*?<\/h1>\s*<p><strong>ПРЕДЛОЖЕНИЕ[\s\S]*?<\/strong><\/p>/;
  const m=text.match(cover);
  required(m,"publication-blocked cover missing");
  text=text.replace(cover,m[0]+"\n"+match[0]);
  let headings=0;
  text=text.replace(/<h2 id="((?:[1-9]|10)-[^"]+|приложение-[абвгд]-[^"]+)">/g, (_s,id)=>{
    headings++;return '<h2 class="chapter-break" id="'+id+'">';
  });
  required(headings===15, "required exactly 10 chapter and 5 full appendix page starts; got "+headings);
  let small=0;
  text=text.replace(/<table>[\s\S]*?<\/table>/g, table=>{
    if (count(table,/<tr/g)<=8) {small++;return table.replace("<table>",'<table class="compact-table">');}
    return table;
  });
  required(small===1, "expected one small AND example table");
  required(text.includes("</head>"),"missing HTML head");
  text=text.replace("</head>","<style>\n"+style+"\n</style>\n</head>");
  return text;
}
function inspectHTML(html) {
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  const refs=new Set([...html.matchAll(/href="#([^"]+)"/g)].map(m=>m[1]));
  const unresolved=[...refs].filter(id=>!ids.has(id));
  required(!unresolved.length,"invalid internal HTML links: "+unresolved.slice(0,4));
  required(!/<img[^>]+src=["']https?:/i.test(html),"remote image source not allowed");
  required(html.indexOf("<h1")<html.indexOf('<nav id="TOC"'),"title must precede TOC");
  return {toc_targets:refs.size,known_anchors:ids.size,unresolved:0};
}
function pdfQA(pdf,md) {
  const info=run("pdfinfo",[pdf]);
  const n=Number(info.match(/^Pages:\s*(\d+)/m)?.[1]||0);
  const p=info.match(/^Page size:\s*([\d.]+) x ([\d.]+)/m);
  required(n>=10&&n<=160,"wrong PDF page count");
  required(p && Math.abs(Number(p[1])-595.276)<2 && Math.abs(Number(p[2])-841.89)<2,
    "PDF must be A4");
  const text=run("pdftotext",["-layout","-enc","UTF-8",pdf,"-"]);
  const pages=text.split("\f").filter(x=>x.trim().length>0);
  const cyrillic=count(text,/[А-Яа-яЁё]/g);
  const replacement=count(text,/\uFFFD/g);
  const necessary=["ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА","Метатеория Связей","FORMAL",
    "ExactSequence","NO_MATCH","FRM-07","ACCEPT_MTS_V0_15"];
  const missing=necessary.filter(s=>!text.includes(s));
  const glyphs=["⟼","Γ","∞","♂","♀","₀","₁"];
  const glyphsMissing=glyphs.filter(s=>!text.includes(s));
  const example=pages.findIndex(s=>s.includes("Пример на принятых источниках"));
  const table=pages.findIndex(s=>s.includes("RuleFF")&&s.includes("RuleTT"));
  const fontInfo=run("pdffonts",[pdf]);
  required(n===pages.length,"text-extraction page count must match PDF");
  required(text.trim().length>=55000 && cyrillic>=20000,"PDF missing Russian scientific text");
  required(!replacement&&!missing.length&&!glyphsMissing.length,"invalid text/glyph: "+missing+" "+glyphsMissing);
  required(example>=0&&example===table,"AND worked example/table split across print pages");
  required(pages[0].includes("Метатеория Связей"),"first page needs title");
  required(fontInfo.includes("Noto"),"embedded Unicode scientific text fonts absent");
  const blank=pages.flatMap((s,i)=>s.trim().length<35?[i+1]:[]);
  required(!blank.length,"blank PDF pages: "+blank);
  return {page_count:n,extracted_chars:text.trim().length,cyrillic_chars:cyrillic,
    first_page_contains_title:true,and_example_and_truth_table_same_page:true,
    required_math_glyphs_present:true,blank_pages:[],required_text_missing:[],
    unicode_replacement_characters:0,page_size:"A4",embedded_unicode_fonts:true};
}
function snapshots(pdf, dest, n) {
  fs.mkdirSync(dest,{recursive:true});
  // Poppler produces a separate PNG for each actual PDF page, not a fake mockup.
  run("pdftoppm",["-f","1","-l",String(n),"-scale-to","420","-png",pdf,path.join(dest,"page")]);
  const images=fs.readdirSync(dest).filter(f=>/^page-\d+\.png$/.test(f)).sort();
  required(images.length===n,"all PDF pages need rendered PNG inspection");
  const sheets=[];
  for(let i=0;i<images.length;i+=12) {
    const group=images.slice(i,i+12);
    const name="contact-"+String(i+1).padStart(3,"0")+"-"+String(Math.min(i+12,n)).padStart(3,"0")+".png";
    run("montage",[...group.map(x=>path.join(dest,x)),"-tile","3x4","-geometry","+4+18",
      "-background","white",path.join(dest,name)]);
    sheets.push(name);
  }
  run("pdftoppm",["-f","1","-l","1","-r","150","-singlefile","-png",pdf,path.join(dest,"first")]);
  run("pdftoppm",["-f",String(n),"-l",String(n),"-r","150","-singlefile","-png",pdf,path.join(dest,"last")]);
  // Keep contact sheets/high-quality first/last; individual thumbnails are staging files.
  for(const x of images)fs.rmSync(path.join(dest,x));
  return {generated:true,sheets,first_last:2,all_pages_inspected_as_images:n};
}
const p=args();
required(fs.existsSync(p.input)&&fs.existsSync(p.css),"Markdown and CSS are required");
fs.mkdirSync(p.output,{recursive:true});
const md=fs.readFileSync(p.input,"utf8");
const checks={
  ten_numbered_chapters:count(md,/^## (?:[1-9]|10)\. /gm)===10,
  source_registry_119:count(md,/^\| \d+ \| /gm)===119,
  nine_open_R40:count(md,/^### R40-(?:06|07|09|10|11|12|13|14|15) /gm)===9,
  publication_blocked:md.includes("ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА"),
  no_publication_permission:!md.includes("ПУБЛИКАЦИЯ РАЗРЕШЕНА") };
required(Object.values(checks).every(Boolean),"Markdown source/provenance checks failed");
const h=run("pandoc",[p.input,"--from=gfm+tex_math_dollars","--to=html5","--standalone",
  "--toc","--toc-depth=2","--metadata=lang:ru",
  "--metadata=title:Метатеория Связей — научный черновик v0.15","--mathml","--wrap=none"]);
const html=transformHTML(h,fs.readFileSync(p.css,"utf8"));
const links=inspectHTML(html);
const htmlPath=path.join(p.output,"mts-v015-reader-preview.html");
const pdfPath=path.join(p.output,"mts-v015-reader-preview.pdf");
fs.writeFileSync(htmlPath,html,"utf8");
fs.copyFileSync(p.input,path.join(p.output,"mts-v015-reader-preview.md"));
const wp=process.env.WEASYPRINT_BIN||"weasyprint";
run(wp,[htmlPath,pdfPath],{cwd:p.root});
const pdf=pdfQA(pdfPath,md);
const pics=snapshots(pdfPath,path.join(p.output,"contact-sheets"),pdf.page_count);
const images=count(md,/!\[[^\]]*\]\(([^)\s]+)\)/g);
const report={status:"GENERATED_PREVIEW_NOT_AUTHOR_ACCEPTED",source_commit:p.sha,
  renderer:"Node.js orchestration, Pandoc, external WeasyPrint CLI, Poppler, ImageMagick",
  checks,html:links,pdf,images:{markdown_references:images,
  historical_placement:"UNRESOLVED_WHEN_SOURCE_OWNER_HAS_NO_IMAGE_CITATIONS",
  note:"Do not delete or infer scientific meaning for historical images."},thumbnails:pics};
fs.writeFileSync(path.join(p.output,"quality-report.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
