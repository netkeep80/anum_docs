import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseDocument} from "yaml";
import {loadReaderM02} from "./mts-reader-review-m02.js";

// M03 is editorial, not a change to accepted Link/FORMAL/Γ semantics.
export const REVIEW_M03_PATH =
  "requirements/mts-source/MTS-READER-NOTATION-SEMANTICS-M03.yaml";
const pin="c64b7e21340c6add248c8f380f3fef1292616ac6";
const sources={
  foundation:"proofs/lean4/MtsFoundation.lean",
  roles:"ts/src/v015-formal-roles.ts",
  formal:"formal/v0.15/regression/compact-and.formal",
  json:"formal/v0.15/regression/compact-and.json",
  sequence:"ts/src/exact-sequence.ts",
  anet:"ts/src/v015-source-anet.ts",
  kernel:"profiles/mts-v015-meta-interpreter-kernel.json",
  m02:"requirements/mts-source/MTS-READER-WORKED-FOUNDATION-GAMMA-M02.yaml",
} as const;
const expected=[
  ["M03-LINK","foundation",["foundation","formal"]],
  ["M03-EQUALITY","meta-vs-object",["foundation","roles"]],
  ["M03-BINDING","formal",["formal","anet"]],
  ["M03-ASSOCIATION","formal",["roles","formal"]],
  ["M03-ROOT","foundation-vs-representation",["foundation","formal"]],
  ["M03-SEQUENCE","representation",["sequence","formal"]],
  ["M03-BUNDLE","formal-json",["formal","json","anet"]],
  ["M03-ANET","semantics",["anet","formal","json"]],
  ["M03-RESULT","execution",["kernel","formal"]],
  ["M03-GAMMA","semantics-vs-implementation",["kernel","m02"]],
] as const;
const needles={
  foundation:"form_start",
  roles:"LINK_IDENTITY_EQUALITY",
  formal:"Theory->RuleTT",
  json:'"Theory->RuleTT": null',
  sequence:"readExactSequence",
  anet:"denoteV015ResolvedSourceAnet",
  kernel:"noMatchPreservesCurrentMembership",
  m02:"M02_FULL_GAMMA_TRANSITION_EXECUTABLE_WITNESS",
} as const;
const obligations=[
 "M03_SCIENTIFIC_NOTATION_INDIVIDUAL_REVIEW",
 "M03_OBJECT_LANGUAGE_META_LANGUAGE_SCOPE_AUDIT",
 "M03_PRODUCTION_GAMMA_REFINEMENT_STILL_OPEN",
 "M03_AUTHOR_ACCEPTANCE_NOT_RECORDED",
] as const;
type Row=Record<string,unknown>;
export interface M03 {
 readonly notationMd:string;
 readonly terms:readonly string[];
 readonly openObligations:readonly string[];
 readonly publication:"blocked";
}
function check(condition:unknown,msg:string):asserts condition{
 if(!condition)throw Error("review-M03: "+msg);
}
function object(x:unknown,msg:string):Row{
 check(x!==null&&typeof x==="object"&&!Array.isArray(x),msg+" must be mapping");
 return x as Row;
}
function fields(x:Row,keys:readonly string[],msg:string){
 check(Object.keys(x).sort().join("|")===[...keys].sort().join("|"),msg+" exact keys");
}
function same(x:unknown,y:unknown,msg:string){
 check(JSON.stringify(x)===JSON.stringify(y),msg);
}
function ru(x:unknown,msg:string,min=110):string{
 check(typeof x==="string"&&x.length>=min&&/[А-Яа-яЁё]/u.test(x),
  msg+" requires substantive Russian definition");
 return x;
}
function read(root:string,path:string){return readFileSync(resolve(root,path),"utf8");}
function sourceUrl(path:string){
 return "https://github.com/netkeep80/anum_docs/blob/"+pin+"/"+path;
}
export function parseReaderM03(raw:string,root:string):M03{
 const parent=loadReaderM02(root);
 check(parent.publication==="blocked"&&parent.evidence.length===10,
  "M02 verified source is required; never promote its production claims");
 const doc=parseDocument(raw,{strict:true,uniqueKeys:true});
 check(doc.errors.length===0&&doc.warnings.length===0,"invalid or duplicated YAML");
 const data=object(doc.toJS({maxAliasCount:0}),"M03 source");
 fields(data,["schema","status","author_approval","publication","semantic_change",
  "accepted_main_sha","master_issue","package_issue","upstream_review",
  "heading_ru","intro_ru","source_paths","entries","open_obligations"],"root");
 check(data.schema==="mts-v015-review-notation-m03/v0.1"&&
  data.status==="proposed"&&data.author_approval==="not-recorded"&&
  data.publication==="blocked"&&data.semantic_change===false&&
  data.accepted_main_sha===pin&&data.master_issue===2217&&
  data.package_issue===2252&&
  data.upstream_review==="requirements/mts-source/MTS-READER-WORKED-FOUNDATION-GAMMA-M02.yaml",
  "M03 cannot modify accepted semantics or acquire publication authority");
 const src=object(data.source_paths,"source paths");
 fields(src,Object.keys(sources),"sources");
 for(const [key,path] of Object.entries(sources)){
  check(src[key]===path,"accepted source path mismatch "+key);
  check(read(root,path).includes(needles[key as keyof typeof sources]),
    "exact accepted evidence missing from "+key);
 }
 const title=ru(data.heading_ru,"title",55);
 check(title.startsWith("M03."),"M03 heading");
 const intro=ru(data.intro_ru,"metalevel introduction",280);
 check(Array.isArray(data.entries)&&data.entries.length===expected.length,
  "10 exact, individually reviewed notation entries");
 const pieces=["### "+title,"",intro,""];
 const ids:string[]=[];
 (data.entries as unknown[]).forEach((item,i)=>{
  const x=object(item,"notation entry"),spec=expected[i]!;
  fields(x,["id","level","notation","definition_ru","example_ru","exclusion_ru",
   "source_keys"],"notation entry "+i);
  check(x.id===spec[0]&&x.level===spec[1],
   "entry order/id or language level drift "+spec[0]);
  same(x.source_keys,spec[2],"exact evidence owners "+spec[0]);
  const label=ru(x.notation,"notation",1);
  const definition=ru(x.definition_ru,"definition "+spec[0],190);
  const example=ru(x.example_ru,"example "+spec[0],95);
  const exclusion=ru(x.exclusion_ru,"false inference "+spec[0],90);
  check(!definition.includes("впервые в математике"),
   "unfounded originality claim "+spec[0]);
  ids.push(spec[0]);
  pieces.push("#### "+spec[0]+" · "+label,"",definition,"",
    "**Пример:** "+example,"",
    "**Неверный вывод:** "+exclusion,"",
    "**Принятые исходники:** "+spec[2].map(k=>
     "["+k+"]("+sourceUrl(sources[k as keyof typeof sources])+ ")").join(" · ")+".","");
 });
 check(new Set(ids).size===expected.length,"notation IDs must be unique");
 same(data.open_obligations,obligations,"four open scientific gates");
 pieces.push("**Открытые обязательства:** "+obligations.join("; ")+".","",
   "**Статус:** только предложенная научная редакция; accepted v0.15 неизменна, "+
   "независимая математическая рецензия и авторская приёмка не выполнены.","");
 return {notationMd:pieces.join("\n"),terms:ids,openObligations:[...obligations],
  publication:"blocked"};
}
export function loadReaderM03(root:string):M03 {
 return parseReaderM03(read(root,REVIEW_M03_PATH),root);
}
