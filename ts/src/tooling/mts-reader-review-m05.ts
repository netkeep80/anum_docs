import {createHash} from "node:crypto";
import {readFileSync,readdirSync,statSync} from "node:fs";
import {resolve,basename} from "node:path";
import {parseDocument} from "yaml";
import {loadReaderM04} from "./mts-reader-review-m04.js";

export const REVIEW_M05_PATH="requirements/mts-source/MTS-READER-HISTORICAL-IMAGES-M05.yaml";
const pin="c64b7e21340c6add248c8f380f3fef1292616ac6";
const manifestPath="profiles/mts-historical-images.json";
const manifestBlob="4b2dd0522c0fb0d9dcc8b20b69be7c330e123263";
const bannerPath="docs/assets/anum_docs-banner.jpg";
const bannerBlob="13885bcd40c41c73959b8e7842285cbc8941beae";
const imageReadme="pics/README.md";
const imageGuard="ts/test/historical-images-protection.test.ts";
const open=[
 "M05_INDIVIDUAL_29_IMAGE_SCIENTIFIC_ATTRIBUTION",
 "M05_EDITORIAL_IMAGE_PLACEMENT_AND_VISUAL_REVIEW",
 "M05_INDEPENDENT_AUTHOR_IMAGE_DECISIONS",
 "M05_PUBLICATION_NOT_AUTHORIZED",
] as const;
type O=Record<string,unknown>;
export interface M05 {
 readonly archiveMd:string;
 readonly originals:readonly {path:string;gitBlobSha1:string}[];
 readonly banner:string;
 readonly publication:"blocked";
 readonly placement:"unresolved-without-source-owned-caption";
 readonly openObligations:readonly string[];
}
function ok(v:unknown,m:string):asserts v{if(!v)throw Error("review-M05: "+m);}
function object(v:unknown,m:string):O{
 ok(v!==null&&typeof v==="object"&&!Array.isArray(v),m+" mapping");
 return v as O;
}
function keys(v:O,k:readonly string[],m:string){
 ok(Object.keys(v).sort().join("|")===[...k].sort().join("|"),m+" exact keys");
}
function same(a:unknown,b:unknown,m:string){
 ok(JSON.stringify(a)===JSON.stringify(b),m);
}
function ru(v:unknown,m:string,min:number){
 ok(typeof v==="string"&&v.length>=min&&/[А-Яа-яЁё]/u.test(v),m+" Russian argument incomplete");
 return v as string;
}
function read(root:string,path:string){return readFileSync(resolve(root,path));}
function gitBlobSHA(bytes:Uint8Array){
 return createHash("sha1").update("blob "+bytes.byteLength+"\0").update(bytes).digest("hex");
}
function immutableURL(path:string){
 return "https://github.com/netkeep80/anum_docs/blob/"+pin+"/"+
 path.split("/").map(encodeURIComponent).join("/");
}
export function parseReaderM05(raw:string,root:string):M05{
 const m04=loadReaderM04(root);
 ok(m04.publication==="blocked"&&m04.claims.length===16,"M04 evidence prerequisite");
 const doc=parseDocument(raw,{strict:true,uniqueKeys:true});
 ok(doc.errors.length===0&&doc.warnings.length===0,"invalid or duplicated YAML");
 const row=object(doc.toJS({maxAliasCount:0}),"M05 YAML");
 keys(row,["schema","status","author_approval","publication","semantic_change",
  "accepted_main_sha","master_issue","package_issue","upstream_review",
  "canonical_historical_manifest","historical_manifest_git_blob",
  "historical_readme","historical_protection_test","banner_path","banner_git_blob",
  "history_count","banner_count","scientific_placement","archive_link_policy",
  "heading_ru","intro_ru","caption_ru","boundary_ru","open_obligations"],"root");
 ok(row.schema==="mts-v015-reader-image-archive-m05/v0.1"&&
  row.status==="proposed"&&row.author_approval==="not-recorded"&&
  row.publication==="blocked"&&row.semantic_change===false&&
  row.accepted_main_sha===pin&&row.master_issue===2217&&
  row.package_issue===2257&&
  row.upstream_review==="requirements/mts-source/MTS-READER-EPISTEMIC-CLAIMS-M04.yaml"&&
  row.canonical_historical_manifest===manifestPath&&
  row.historical_manifest_git_blob===manifestBlob&&
  row.historical_readme===imageReadme&&row.historical_protection_test===imageGuard&&
  row.banner_path===bannerPath&&row.banner_git_blob===bannerBlob&&
  row.history_count===29&&row.banner_count===1&&
  row.scientific_placement==="unresolved-without-source-owned-caption"&&
  row.archive_link_policy==="link-to-exact-accepted-git-blob-no-inline-reinterpretation",
  "M05 cannot alter historic original authority or invent image placement");
 same(row.open_obligations,open,"individual image provenance gates remain open");
 const manifestBytes=read(root,manifestPath);
 ok(gitBlobSHA(manifestBytes)===manifestBlob,"canonical manifest must stay byte-identical");
 const manifest=object(JSON.parse(manifestBytes.toString("utf8")),"accepted historic inventory");
 ok(manifest.schema==="mts-historical-images-protection/v0.1"&&
  manifest.ownerIssue===2080&&manifest.origin==="AUTHOR_DESIGNATED_HISTORICAL"&&
  manifest.status==="PERMANENT_HISTORICAL_RESEARCH_ASSETS_DO_NOT_DELETE"&&
  manifest.assetCount===29&&manifest.totalBytes===12292726,
  "historical manifest accepted status or count drift");
 const rules=object(manifest.rules,"immutable-asset policy");
 for(const rule of ["delete","rename","overwrite","compressInPlace","replaceWithGeneratedDiagram"])
  ok(rules[rule]==="FORBIDDEN","historic asset rule drift "+rule);
 const assets=manifest.assets;
 ok(Array.isArray(assets)&&assets.length===29,"exact 29 accepted historical assets");
 const seen=new Set<string>(),originals:{path:string;gitBlobSha1:string}[]=[];
 let total=0;
 for(const v of assets){
  const a=object(v,"historical original");
  keys(a,["path","sizeBytes","gitBlobSha1"],"historical original");
  const path=a.path,hash=a.gitBlobSha1,size=a.sizeBytes;
  ok(typeof path==="string"&&/^pics\/[^/]+\.(jpe?g|png|svg)$/i.test(path)&&
   typeof hash==="string"&&/^[0-9a-f]{40}$/.test(hash)&&
   Number.isSafeInteger(size)&&Number(size)>0&&!seen.has(path),
   "image manifest path/sha validation");
  seen.add(path);
  ok(statSync(resolve(root,path)).size===size,"protected image missing or wrong size "+path);
  originals.push({path,gitBlobSha1:hash});
  total+=Number(size);
 }
 ok(total===12292726&&seen.size===29,"historical asset sum");
 const files=readdirSync(resolve(root,"pics")).filter(x=>/\.(jpe?g|png|svg)$/i.test(x)).map(x=>"pics/"+x).sort();
 same(files,[...seen].sort(),"no unclassified image may be omitted");
 ok(gitBlobSHA(read(root,bannerPath))===bannerBlob,"README banner baseline drift");
 const readme=read(root,imageReadme).toString("utf8"),
   test=read(root,imageGuard).toString("utf8");
 ok(readme.includes("НЕ УДАЛЯТЬ")&&readme.includes(manifestPath)&&
  test.includes(manifestBlob)&&test.includes("gitBlobSha1(bytes)"),
  "historical source/test provenance missing");
 const title=ru(row.heading_ru,"heading",38);
 ok(title.startsWith("M05."),"M05 heading");
 const intro=ru(row.intro_ru,"archival context",300),
   caption=ru(row.caption_ru,"caption restraint",260),
   boundary=ru(row.boundary_ru,"non-placement boundary",250);
 const md=["## Приложение Ж. "+title,"",
  intro,"",caption,"",boundary,"",
  "### Оригиналы, защищённые историческим реестром (29/29)","",
  "Первоисточник: [неизменяемый перечень 29 оригиналов]("+immutableURL(manifestPath)+
  ") · [исторический статус]("+immutableURL(imageReadme)+
  ") · [тест побайтовой сохранности]("+immutableURL(imageGuard)+").","",
  ...originals.flatMap((a,i)=>[
   (i+1)+". ["+basename(a.path)+"]("+immutableURL(a.path)+
   ") — исторический Git blob `"+a.gitBlobSha1+"`; научная атрибуция не установлена.",""
  ]),
  "### Отдельный баннер, не входящий в реестр 29 оригиналов","",
  "[README banner]("+immutableURL(bannerPath)+") — Git blob `"+bannerBlob+"`; "+
  "отдельный оформительский файл, не атрибутированный как математическое доказательство.","",
  "**Нерешённые обязательства:** "+open.join("; ")+".","",
  "**Статус:** 30/30 файлов учтены и сохранены; научное размещение отдельных изображений "+
  "не доказано, авторская приёмка и публикация остаются заблокированными.",""
 ].join("\n");
 return {archiveMd:md,originals,banner:bannerPath,
  publication:"blocked",placement:"unresolved-without-source-owned-caption",
  openObligations:[...open]};
}
export function loadReaderM05(root:string):M05{
 return parseReaderM05(read(root,REVIEW_M05_PATH).toString("utf8"),root);
}
