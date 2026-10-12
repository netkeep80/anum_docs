import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseDocument} from "yaml";
import {loadReaderM05} from "./mts-reader-review-m05.js";

// A scientific inventory of original reader questions, not an accepted answer.
export const REVIEW_M06_PATH="requirements/mts-source/MTS-READER-QUESTIONS-M06-INDEX.yaml";
const pin="c64b7e21340c6add248c8f380f3fef1292616ac6";
const inventoryBlob="a25977884c19e589700080d542396b768a980799";
const paths={
 B:"reviews/m06/reviewer-b-97-indexed-extraction.txt",
 C:"reviews/m06/reviewer-c-43-indexed-extraction.txt",
} as const;
const originalBlob={
 B:"80fa8d078da9647030d323e12c96d8c50e849309",
 C:"df05bb5da124ddb113fee28c6f8f77654c1eb2f5",
} as const;
const sourceCommits={
 B:"6ca3992d32c54d371c5ffe28a8894a47e5d398f6",
 C:"ffb8e38898fe23e6f5281e7ca5ab49a41a199861",
} as const;
const filenames={
 B:"mts-v015-reader-questions.pdf",
 C:"mts_v015_voprosy_nezavisimogo_matematika.pdf",
} as const;
const pages={B:8,C:6} as const;
const counts={A:38,B:97,C:43} as const;
const allowedOwners=[
 "F01","F02","F03","F04","F05","F06","F07",
 "R01","R02","R03","R04","L01","L02","L03",
 "G01","G02","G03","P01","P02","P03","M01","M02","M03","M04",
] as const; // M05/M06 transversal, no question primary owner.
const open=[
 "M06_A_38_ORIGINAL_QUESTION_TEXT_NOT_RECOVERED",
 "M06_BC_140_PDF_BYTES_NOT_MATERIALIZED",
 "M06_INDIVIDUAL_178_QUESTION_REVIEW_NOT_COMPLETED",
 "M06_NINE_R40_STILL_OPEN",
 "M06_AUTHOR_PUBLICATION_ACCEPTANCE_NOT_RECORDED",
] as const;
type Row=Record<string,unknown>;
type Tag="A"|"B"|"C";
interface Location{readonly page:number;readonly line:number;readonly anchor:string;}
export interface M06Entry{
 readonly id:string;
 readonly reviewer:Tag;
 readonly questionId:string;
 readonly owner:string;
 readonly status:"SOURCE_RECOVERY_REQUIRED"|"PDF_INDEXED_EXTRACTION";
 readonly page:number|null;
 readonly line:number|null;
 readonly anchor:string|null;
 readonly scientificStatus:"OPEN";
}
export interface M06{
 readonly archiveMd:string;
 readonly entries:readonly M06Entry[];
 readonly indexed:140;
 readonly unrecovered:38;
 readonly openObligations:readonly string[];
 readonly publication:"blocked";
}
function ok(v:unknown,message:string):asserts v{if(!v)throw Error("review-M06: "+message);}
function map(v:unknown,message:string):Row{
 ok(v!==null&&typeof v==="object"&&!Array.isArray(v),message+" mapping");
 return v as Row;
}
function same(a:unknown,b:unknown,message:string){
 ok(JSON.stringify(a)===JSON.stringify(b),message);
}
function keys(v:Row,expect:readonly string[],label:string){
 same(Object.keys(v).sort(),[...expect].sort(),label+" exact fields");
}
function blob(bytes:Uint8Array){
 return createHash("sha1").update("blob "+bytes.byteLength+"\0").update(bytes).digest("hex");
}
function read(root:string,path:string){return readFileSync(resolve(root,path));}
function collectLocations(text:string,tag:"B"|"C"){
 const found=new Map<string,Location>();let page=0;
 const lines=text.split("\n");
 for(let i=0;i<lines.length;i++){
  const pageMatch=lines[i]!.match(/^<<<<<<<< M06 PAGE (\d+) BEGIN >>>>>>>>$/);
  if(pageMatch)page=Number(pageMatch[1]);
  const m=lines[i]!.match(tag==="B"?
   /^\s*(\d{1,2}\.\d{1,2})\s+(.+)/:
   /^\s*(\d{2})\s*·\s*P[0-2]\s*·\s*(.+)/);
  if(m){
   ok(page>=1&&page<=pages[tag]&&!found.has(m[1]!),
    "duplicate or pageless original question heading "+tag+"-"+m[1]);
   found.set(m[1]!,{page,line:i+1,anchor:m[2]!.trim()});
  }
 }
 ok((text.match(/<<<<<<<< M06 PAGE \d+ BEGIN >>>>>>>>/g)||[]).length===pages[tag]&&
    found.size===counts[tag],"incomplete PDF-derived source transcription "+tag);
 return found;
}
function sourceLink(tag:"B"|"C",line:number){
 return "https://github.com/netkeep80/anum_docs/blob/"+
 sourceCommits[tag]+"/"+paths[tag]+"#L"+line;
}
export function parseReaderM06(raw:string,root:string):M06{
 const m05=loadReaderM05(root);
 ok(m05.publication==="blocked"&&m05.originals.length===29,
  "M05 protected archive required");
 const parsed=parseDocument(raw,{strict:true,uniqueKeys:true});
 ok(!parsed.errors.length&&!parsed.warnings.length,"invalid or duplicate YAML");
 const d=map(parsed.toJS({maxAliasCount:0}),"inventory");
 keys(d,["schema","status","author_approval","publication","semantic_change",
 "accepted_main_sha","master_issue","package_issue","upstream_review","owner_plan",
 "classification","question_verdict","source_recovery","source_documents",
 "expected_question_counts","work_package_count","historical_r40_open",
 "claims_of_scientific_resolution","entries","open_obligations"],"root");
 ok(d.schema==="mts-v015-review-questions-m06-inventory/v0.1"&&
  d.status==="proposed"&&d.author_approval==="not-recorded"&&
  d.publication==="blocked"&&d.semantic_change===false&&
  d.accepted_main_sha===pin&&d.master_issue===2217&&d.package_issue===2259&&
  d.upstream_review==="requirements/mts-source/MTS-READER-HISTORICAL-IMAGES-M05.yaml"&&
  String(d.owner_plan).includes("MTS_v015_единый_план_по_трём_рецензиям.md")&&
  d.classification==="UNREVIEWED"&&d.question_verdict==="OPEN"&&
  d.work_package_count===26&&d.historical_r40_open===9&&
  d.claims_of_scientific_resolution===0,
  "unapproved scientific status, owner model, or authority escalation");
 const recovery=map(d.source_recovery,"reviewer recovery statuses");
 keys(recovery,["A","B","C"],"recovery");
 same(recovery,{
  A:"CHAT_ORIGINAL_FULL_TEXT_NOT_RECOVERED",
  B:"INDEXED_PDF_TEXT_TRANSCRIPTION_NOT_ORIGINAL_BYTES",
  C:"INDEXED_PDF_TEXT_TRANSCRIPTION_NOT_ORIGINAL_BYTES",
 },"source recovery cannot be fabricated");
 const expect=map(d.expected_question_counts,"question counts");
 same(expect,{A:38,B:97,C:43,total:178},"expected 178 reviews");
 same(d.open_obligations,open,"five open M06 proof/authority obligations");
 const docs=map(d.source_documents,"PDF source documents");
 keys(docs,["B","C"],"PDF source keys");
 const found={} as Record<"B"|"C",Map<string,Location>>;
 for(const tag of ["B","C"] as const){
  const x=map(docs[tag],tag+" PDF");
  keys(x,["source_filename","extracted_text_path","git_blob_sha1",
   "page_count","question_count"],tag+" PDF");
  ok(x.source_filename===filenames[tag]&&x.extracted_text_path===paths[tag]&&
   x.git_blob_sha1===originalBlob[tag]&&x.page_count===pages[tag]&&
   x.question_count===counts[tag],"original PDF source metadata drift "+tag);
  const bytes=read(root,paths[tag]);
  ok(blob(bytes)===originalBlob[tag],"indexed PDF transcription Git blob drift "+tag);
  const text=bytes.toString("utf8");
  ok(text.includes("NOT ORIGINAL PDF BYTES")&&text.includes("no claim of PDF-byte identity"),
   "PDF original bytes must not be falsely claimed");
  found[tag]=collectLocations(text,tag);
 }
 ok(Array.isArray(d.entries)&&d.entries.length===178,"exact 178 individual question slots");
 const seen=new Set<string>(),by={A:0,B:0,C:0},owners=new Set<string>();
 const result:M06Entry[]=[];
 for(const item of d.entries as unknown[]){
  const row=map(item,"question");
  keys(row,["id","reviewer","question_id","primary_package","source_status",
   "extracted_page","extracted_line","first_line_ru","scientific_status"],"question");
  const reviewer=row.reviewer as Tag,id=row.question_id as string;
  ok(["A","B","C"].includes(reviewer)&&typeof id==="string"&&
   row.id===reviewer+"-"+id&&!seen.has(row.id as string),
   "question ID duplication or owner ID forgery");
  if(reviewer==="C")ok(/^\d{2}$/.test(id),"C question ID format");
  else ok(/^\d{1,2}\.\d{1,2}$/.test(id),"A/B question ID format");
  ok(allowedOwners.includes(row.primary_package as typeof allowedOwners[number]),
   "primary owner outside 24 responsible packages");
  ok(row.scientific_status==="OPEN","unsupported question-level scientific acceptance");
  seen.add(row.id as string);by[reviewer]++;owners.add(row.primary_package as string);
  const location=reviewer==="A"?undefined:found[reviewer].get(id);
  if(reviewer==="A"){
   ok(row.source_status==="SOURCE_RECOVERY_REQUIRED"&&row.extracted_page===null&&
    row.extracted_line===null&&row.first_line_ru===null,
    "A must retain explicit source recovery gap, not invented text");
  }else{
   ok(!!location&&row.source_status==="PDF_INDEXED_EXTRACTION"&&
    row.extracted_page===location.page&&row.extracted_line===location.line&&
    row.first_line_ru===location.anchor,
    "PDF heading/line provenance mismatch "+reviewer+"-"+id);
  }
  result.push({id:row.id as string,reviewer,questionId:id,
   owner:row.primary_package as string,
   status:row.source_status as M06Entry["status"],
   page:location?.page??null,line:location?.line??null,
   anchor:location?.anchor??null,scientificStatus:"OPEN"});
 }
 same(by,counts,"all 38+97+43 questions represented exactly once");
 ok(owners.size===24&&[...found.B.keys()].every(id=>seen.has("B-"+id))&&
  [...found.C.keys()].every(id=>seen.has("C-"+id)),
  "owner coverage or exact PDF IDs incomplete");
 const lines=[
 "## Приложение И. M06 — исходные вопросы и открытые научные обязательства","",
 "Модель содержит **178/178 уникальных идентификаторов и единственных первичных исполнителей** по мастер-плану "+
 "[#2217](https://github.com/netkeep80/anum_docs/issues/2217). "+
 "Доказательные ответы **не проведены**; ни один вопрос не закрыт. "+
 "У рецензии A исходные 38 формулировок сохранены в прежнем чате, но полный текст в доступном архиве "+
 "пока не восстановлен. У рецензий B/C доступна постраничная **текстовая транскрипция** "+
 "97+43 вопросов; оригинальные байты PDF не предоставлены этому репозиторию.","",
 "**А = 38/38 ID, исходный текст восстановить; B = 97/97 PDF-индексов; C = 43/43 PDF-индексов; "+
 "26 пакетов (24 содержательных владельца, M05/M06 поперечные); 9 исторических R40 отдельно OPEN.**","",
 "| ID | Пакет | Первоисточник | Научный статус |",
 "|---|---|---|---|"
 ];
 for(const entry of result){
  const evidence=entry.reviewer==="A"?"исходная запись чата: полный текст не восстановлен":
    "[PDF-транскрипция, с. "+entry.page+"]("+
    sourceLink(entry.reviewer,entry.line!)+")";
  lines.push("| "+entry.id+" | "+entry.owner+" | "+evidence+" | OPEN |");
 }
 lines.push("","**Предел:** это индекс вопросов, а не доказательная матрица ответов. "+
  "Принятая v0.15 и нормативные FORMAL/JSON не менялись. "+
  "Открытые обязательства: "+open.join("; ")+".","");
 return {archiveMd:lines.join("\n"),entries:result,indexed:140,unrecovered:38,
  openObligations:[...open],publication:"blocked"};
}
export function loadReaderM06(root:string):M06{
 const bytes=read(root,REVIEW_M06_PATH);
 ok(blob(bytes)===inventoryBlob,"M06 reviewed 178-slot inventory byte pin drift");
 return parseReaderM06(bytes.toString("utf8"),root);
}
