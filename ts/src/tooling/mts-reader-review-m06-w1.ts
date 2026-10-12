import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseDocument} from "yaml";
import {loadReaderM06} from "./mts-reader-review-m06.js";

export const REVIEW_M06_W1_PATH="requirements/mts-source/MTS-READER-QUESTION-RESPONSES-M06-W1.yaml";
type Obj=Record<string,unknown>;
const pin="c64b7e21340c6add248c8f380f3fef1292616ac6";
const ids=["C-04","C-05","B-1.4","B-1.7","B-1.8"] as const;
const classifications=["CONDITIONAL_PROOF","EXISTING_MODEL_COUNTEREXAMPLE",
 "EXISTING_MODEL_COUNTEREXAMPLE","CONDITIONAL_PROOF","CONDITIONAL_PROOF"] as const;
const owner=["F03","F05","F05","F03","F03"] as const;
const eGrade=["ACCEPTED_EXTERNAL_THEOREMS_WITH_EXPLICIT_PREMISES",
 "COUNTEREXAMPLE_DERIVED_FROM_ACCEPTED_EXPLICIT_MODEL_DEFINITIONS",
 "COUNTEREXAMPLE_DERIVED_FROM_ACCEPTED_EXPLICIT_MODEL_DEFINITIONS",
 "ACCEPTED_EXTERNAL_THEOREMS_WITH_EXPLICIT_PREMISES",
 "ACCEPTED_PREMISE_NOT_UNCONDITIONAL_THEOREM"] as const;
const symbols=[
 ["F2F3OneSidedExistence","ContextOneSidedNames","FND_03_derived_aspect_basis","f2f3_start_root_pattern","f2f3_finish_root_pattern"],
 ["ExplicitFoundation","badStart","badFinish","decode","start","finish","FND_13_identity_by_poles","badStart_not_grounded","badFinish_not_grounded"],
 ["ExplicitFoundation","badStart","badFinish","decode","FND_13_identity_by_poles"],
 ["F2F3OneSidedExistence","ContextOneSidedNames","FND_01_context_names_only","FND_03_derived_aspect_basis"],
 ["F2F3OneSidedExistence","startRootNeRoot","finishRootNeRoot","f2f3_start_root_pattern","f2f3_finish_root_pattern"]
] as const;
const obligations=["M06_W1_FIVE_INDEPENDENT_QUESTION_VERDICTS_PENDING",
 "M06_W1_PAIRED_COUNTERMODEL_DERIVATION_NOT_NEW_KERNEL_THEOREM",
 "M06_A_38_ORIGINALS_STILL_NOT_RECOVERED",
 "M06_BC_ORIGINAL_PDF_BYTES_UNAVAILABLE"] as const;
export interface W1Entry{
 readonly id:string;readonly question:string;readonly answer:string;
 readonly limitation:string;readonly classification:string;readonly status:"OPEN";
}
export interface W1{
 readonly archiveMd:string;readonly entries:readonly W1Entry[];
 readonly publication:"blocked";
}
function check(x:unknown,m:string):asserts x{if(!x)throw Error("review-M06-W1: "+m);}
function map(x:unknown,m:string):Obj{check(x!==null&&typeof x==="object"&&!Array.isArray(x),m+" map");return x as Obj;}
function equal(a:unknown,b:unknown,m:string){check(JSON.stringify(a)===JSON.stringify(b),m);}
function exact(x:Obj,props:readonly string[],m:string){equal(Object.keys(x).sort(),[...props].sort(),m+" exact fields");}
function text(x:unknown,m:string,min=60):string{
 check(typeof x==="string"&&x.length>=min&&/[А-Яа-яЁё]/u.test(x),m+" Russian statement");return x;
}
function read(root:string,path:string){return readFileSync(resolve(root,path),"utf8");}
function norm(s:string){return s.replace(/\s+/gu,"");}
export function parseReaderM06W1(raw:string,root:string):W1{
 const inventory=loadReaderM06(root);
 check(inventory.entries.length===178&&inventory.unrecovered===38&&
  inventory.indexed===140&&inventory.publication==="blocked","pinned M06 prerequisite");
 const d=parseDocument(raw,{strict:true,uniqueKeys:true});
 check(d.errors.length===0&&d.warnings.length===0,"invalid or duplicated source YAML");
 const x=map(d.toJS({maxAliasCount:0}),"M06-W1");
 exact(x,["schema","status","author_approval","publication","semantic_change",
  "accepted_main_sha","master_issue","review_issue","upstream_inventory","review_scope",
  "verdict","question_status","source_note","cases","open_obligations"],"root");
 check(x.schema==="mts-v015-m06-question-specific-replies-w1/v0.1"&&
  x.status==="proposed"&&x.author_approval==="not-recorded"&&
  x.publication==="blocked"&&x.semantic_change===false&&
  x.accepted_main_sha===pin&&x.master_issue===2217&&x.review_issue===2259&&
  x.upstream_inventory==="requirements/mts-source/MTS-READER-QUESTIONS-M06-INDEX.yaml"&&
  x.verdict==="INDIVIDUAL_EVIDENCE_REVIEW_PENDING"&&x.question_status==="OPEN",
  "scientific authority/approval escalation");
 equal(x.review_scope,ids,"five exact source questions");
 equal(x.open_obligations,obligations,"four active provenance and proof gaps");
 check(String(x.source_note).includes("байтовое совпадение")&&
  String(x.source_note).includes("НЕ доказано"),"PDF-byte provenance not claimed");
 const trans={B:read(root,"reviews/m06/reviewer-b-97-indexed-extraction.txt"),
  C:read(root,"reviews/m06/reviewer-c-43-indexed-extraction.txt")};
 const lean=read(root,"proofs/lean4/MtsFoundation.lean"),
       rocq=read(root,"proofs/coq/MtsFoundation.v"),
       leanModel=read(root,"proofs/lean4/MtsExplicitModel.lean"),
       rocqModel=read(root,"proofs/coq/MtsExplicitModel.v");
 for(const s of ["F2F3OneSidedExistence","ContextOneSidedNames",
  "FND_01_context_names_only","FND_03_derived_aspect_basis",
  "f2f3_start_root_pattern","f2f3_finish_root_pattern",
  "FND_13_identity_by_poles"])
  check(lean.includes(s)&&rocq.includes(s),"paired theorem missing "+s);
 for(const s of ["badStart","badFinish","decode","ExplicitFoundation",
  "badStart_not_grounded","badFinish_not_grounded"])
  check(leanModel.includes(s),"explicit Lean model missing "+s);
 for(const s of ["model_bad_start","model_bad_finish","model_decode",
  "ExplicitFoundation","model_bad_start_not_grounded","model_bad_finish_not_grounded"])
  check(rocqModel.includes(s),"explicit Rocq model missing "+s);
 check(leanModel.includes("def badStart : ModelLink := [false]")&&
  leanModel.includes("def badFinish : ModelLink := [true]")&&
  leanModel.includes("| none => badStart")&&leanModel.includes("| none => badFinish")&&
  rocqModel.includes("model_bad_start : ModelLink := [false]")&&
  rocqModel.includes("model_bad_finish : ModelLink := [true]")&&
  rocqModel.includes("| None => model_bad_start")&&
  rocqModel.includes("| None => model_bad_finish"),
  "counterexample model poles and distinct singleton values changed");
 const cases=x.cases;
 check(Array.isArray(cases)&&cases.length===5,"five independent responses required");
 const entries:W1Entry[]=[];
 for(let i=0;i<5;i++){
  const e=map(cases[i],"question record "+i);
  exact(e,["id","reviewer","owner","original_question_ru","classification",
   "evidence_grade","evidence_symbols","answer_ru","limitation_ru",
   "scientific_status"],"entry");
  const id=ids[i]!;
  check(e.id===id&&e.reviewer===id[0]&&e.owner===owner[i]&&
   e.classification===classifications[i]&&e.evidence_grade===eGrade[i]&&
   e.scientific_status==="OPEN","individual M06 question class/owner/status mismatch "+id);
  equal(e.evidence_symbols,symbols[i],"exact sources for "+id);
  const source=inventory.entries.find(z=>z.id===id);
  check(source!==undefined&&source.status==="PDF_INDEXED_EXTRACTION"&&
   source.owner===owner[i]&&source.page!==null&&source.line!==null,
   "no matching immutable M06 source owner "+id);
  const body=text(e.original_question_ru,id+" literal text",88);
  const original=trans[source.reviewer as "B"|"C"];
  const page=original.match(new RegExp("<<<<<<<< M06 PAGE "+source.page+
   " BEGIN >>>>>>>>([\\s\\S]*?)<<<<<<<< M06 PAGE "+source.page+" END >>>>>>>>"))?.[1];
  check(page!==undefined&&norm(page).includes(norm(body)),
   "question literal must match verbatim PDF-derived transcription "+id);
  check(norm(page).includes(norm(source.anchor!)),"question heading provenance "+id);
  const answer=text(e.answer_ru,id+" mathematical answer",220);
  const limitation=text(e.limitation_ru,id+" exact limits",140);
  entries.push({id,question:body,answer,limitation,
   classification:e.classification as string,status:"OPEN"});
 }
 const out=["## Приложение К. M06-W1 — пять индивидуальных математических разборов","",
  "**Научная оценка каждого вопроса остаётся OPEN; доказательный ответ предложен, но не принят.**",
  "Оригинальные PDF-байты B/C не материализованы. Здесь используется зафиксированная "+
  "постраничная текстовая транскрипция GitHub. По рецензии A полный текст 38 вопросов ещё не восстановлен.",""];
 for(const entry of entries){
  out.push("### "+entry.id+" · "+entry.classification,"",
    "**Дословный вопрос по извлечению из PDF:** "+entry.question,"",
    "**Предлагаемый математический ответ:** "+entry.answer,"",
    "**Граница доказательства:** "+entry.limitation,"",
    "**Статус:** OPEN — независимая научная рецензия и решение Автора ещё не выполнены.","");
 }
 out.push("**Отдельные открытые обязанности:** "+obligations.join("; ")+".",
  "**Источники:** [Foundation Lean4](https://github.com/netkeep80/anum_docs/blob/"+
  pin+"/proofs/lean4/MtsFoundation.lean), [Rocq](https://github.com/netkeep80/anum_docs/blob/"+
  pin+"/proofs/coq/MtsFoundation.v), [explicit model Lean4](https://github.com/netkeep80/anum_docs/blob/"+
  pin+"/proofs/lean4/MtsExplicitModel.lean), [Rocq](https://github.com/netkeep80/anum_docs/blob/"+
  pin+"/proofs/coq/MtsExplicitModel.v).","");
 return {archiveMd:out.join("\n"),entries,publication:"blocked"};
}
export function loadReaderM06W1(root:string):W1{
 return parseReaderM06W1(read(root,REVIEW_M06_W1_PATH),root);
}
