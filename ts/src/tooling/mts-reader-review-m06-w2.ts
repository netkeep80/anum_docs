import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseDocument} from "yaml";
import {loadReaderM06} from "./mts-reader-review-m06.js";
import {loadReaderM06W1} from "./mts-reader-review-m06-w1.js";

export const REVIEW_M06_W2_PATH="requirements/mts-source/MTS-READER-QUESTION-RESPONSES-M06-W2.yaml";
type Obj=Record<string,unknown>;
const ids=["C-01","B-1.3","C-02","C-03"] as const;
const owners=["F01","F01","F02","F01"] as const;
const grades=["COUNTERMODEL_FROM_ACCEPTED_DEFINITIONS",
 "COUNTERMODEL_FROM_ACCEPTED_DEFINITIONS",
 "JOINT_TYPED_WITNESSES_IN_ACCEPTED_MODEL",
 "FINITE_CARDINALITY_CONSEQUENCE_OF_ACCEPTED_INJECTION"] as const;
const symbols=[
 ["ExplicitFoundation","badStart","badFinish","decode","decode_form","start","finish"],
 ["ExplicitFoundation","badStart","badFinish","badStart_ne_badFinish","FND_13_identity_by_poles"],
 ["ExplicitFoundation","ExplicitOneSided","ExplicitInversionDomain","ExplicitGroundedNormalization","explicit_a1"],
 ["fnd13_form_injective","form_start","form_finish"]
] as const;
const sourcePaths={
 lean_foundation:"proofs/lean4/MtsFoundation.lean",
 rocq_foundation:"proofs/coq/MtsFoundation.v",
 lean_model:"proofs/lean4/MtsExplicitModel.lean",
 rocq_model:"proofs/coq/MtsExplicitModel.v"
} as const;
const pins={
 lean_foundation:"f283192148ef5381f02a0b23d50b9884cf10b0c0",
 rocq_foundation:"66db1fb851724898112cfcd9ba5022c4d766b35d",
 lean_model:"744309364e08dc9b554bde7c3138b7ba84387a72",
 rocq_model:"6dd9823754e3ac52d8cd7f4184ff8b71d496f8c3"
} as const;
const obligations=["M06_W2_FOUR_SCIENTIFIC_VERDICTS_PENDING",
 "M06_W2_KERNEL_RESULTS_REQUIRE_INDEPENDENT_SCIENTIFIC_REVIEW",
 "M06_W2_PRODUCTION_REFINEMENT_NOT_ESTABLISHED",
 "M06_W2_WORKFLOW_GOVERNANCE_AUTHORIZATION_PENDING",
 "M06_A_38_VERBATIM_ORIGINALS_NOT_RECOVERED",
 "M06_BC_PDF_ORIGINAL_BYTES_UNAVAILABLE"] as const;
const candidatePaths={
 lean4:"proofs/lean4/MtsM06W2External.lean",
 rocq:"proofs/coq/MtsM06W2External.v"
} as const;
const candidatePins={
 lean4:"75433cb107048148cefe12630e59b4042f550dd3",
 rocq:"f9e45f6d5808258e64b4c84450e70b011c4a208a"
} as const;
const kernelSymbols=[
 {lean4:["M06_W2_badStart_not_form_image","M06_W2_reverse_law_fails"],
  rocq:["M06_W2_bad_start_not_form_image","M06_W2_reverse_law_fails"]},
 {lean4:["M06_W2_poles_nonextensional"],rocq:["M06_W2_poles_nonextensional"]},
 {lean4:["M06_W2_joint_model_witness"],rocq:["M06_W2_joint_model_witness"]},
 {lean4:["M06_W2_two_distinct_implies_nat_injection"],
  rocq:["M06_W2_two_distinct_implies_nat_injection"]}
] as const;
export interface W2Entry{
 readonly id:string;readonly original:string;readonly answer:string;
 readonly limitation:string;readonly grade:string;readonly status:"OPEN";
}
export interface W2{
 readonly entries:readonly W2Entry[];readonly archiveMd:string;readonly publication:"blocked";
}
function ok(v:unknown,m:string):asserts v{if(!v)throw Error("review-M06-W2: "+m);}
function map(v:unknown,m:string):Obj{
 ok(v!==null&&typeof v==="object"&&!Array.isArray(v),m+" map");return v as Obj;
}
function same(a:unknown,b:unknown,m:string):void{
 ok(JSON.stringify(a)===JSON.stringify(b),m);
}
function shape(v:Obj,expected:readonly string[],m:string):void{
 same(Object.keys(v).sort(),[...expected].sort(),m+" keys");
}
function ru(v:unknown,m:string,min:number):string{
 ok(typeof v==="string"&&v.length>=min&&/[А-Яа-яЁё]/u.test(v),m+" Russian text");
 return v;
}
function read(root:string,path:string):string{return readFileSync(resolve(root,path),"utf8");}
function blob(data:string):string{
 const bytes=Buffer.from(data,"utf8");
 return createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex");
}
function compact(v:string):string{return v.replace(/\s+/gu,"");}
export function parseReaderM06W2(raw:string,root:string):W2{
 const index=loadReaderM06(root),w1=loadReaderM06W1(root);
 ok(index.entries.length===178&&index.indexed===140&&index.unrecovered===38&&
  index.publication==="blocked"&&w1.entries.length===5&&w1.publication==="blocked",
  "M06 inventory/W1 prerequisite not stable");
 const parsed=parseDocument(raw,{strict:true,uniqueKeys:true});
 ok(!parsed.errors.length&&!parsed.warnings.length,"duplicate or invalid source YAML");
 const d=map(parsed.toJS({maxAliasCount:0}),"source W2");
 shape(d,["schema","status","author_approval","publication","semantic_change",
  "accepted_main_sha","master_issue","review_issue","upstream_inventory",
  "upstream_wave","review_scope","scientific_verdict","source_note",
  "source_blobs","candidate_proof_blobs","kernel_evidence","cases","open_obligations"],"root");
 ok(d.schema==="mts-v015-m06-question-replies-w2/v0.1"&&
  d.status==="proposed"&&d.author_approval==="not-recorded"&&
  d.publication==="blocked"&&d.semantic_change===false&&
  d.accepted_main_sha==="c64b7e21340c6add248c8f380f3fef1292616ac6"&&
  d.master_issue===2217&&d.review_issue===2259&&
  d.upstream_inventory==="requirements/mts-source/MTS-READER-QUESTIONS-M06-INDEX.yaml"&&
  d.upstream_wave==="requirements/mts-source/MTS-READER-QUESTION-RESPONSES-M06-W1.yaml"&&
  d.scientific_verdict==="OPEN",
  "scientific/author/publication authority escalation");
 same(d.review_scope,ids,"exact individual W2 questions");
 same(d.open_obligations,obligations,"six open scientific obligations");
 ok(String(d.source_note).includes("байтовое совпадение")&&
  String(d.source_note).includes("НЕ доказано"),"original PDF bytes cannot be asserted");
 const sources=map(d.source_blobs,"four proof blob pins");
 shape(sources,Object.keys(pins),"proof sources");
 for(const key of Object.keys(pins) as (keyof typeof pins)[]){
  same(sources[key],pins[key],"accepted evidence pin "+key);
  ok(blob(read(root,sourcePaths[key]))===pins[key],
   "accepted source blob changed "+key);
 }
 const candidate=map(d.candidate_proof_blobs,"M06-W2 candidate kernel proof blobs");
 shape(candidate,Object.keys(candidatePins),"candidate sources");
 for(const key of Object.keys(candidatePins) as (keyof typeof candidatePins)[]){
  same(candidate[key],candidatePins[key],"candidate proof pin "+key);
  ok(blob(read(root,candidatePaths[key]))===candidatePins[key],
   "candidate exact proof bytes changed "+key);
 }
 const ke=map(d.kernel_evidence,"external kernel evidence");
 shape(ke,["run_id","exact_head","ci_conclusion","lean_model_axioms",
  "lean_foundation_injection_axioms","rocq_global_assumptions","publication_authority"],
  "kernel evidence");
 ok(ke.run_id===38318851278&&
   ke.exact_head==="e0005cb07d67910a6b70321eccb415f01bd51f04"&&
   ke.ci_conclusion==="SUCCESS"&&ke.publication_authority==="none",
   "unverified kernel run or authority escalation");
 same(ke.lean_model_axioms,["propext"],"four model-only Lean axiom scopes");
 same(ke.lean_foundation_injection_axioms,[],"weak Foundation axiom-free");
 same(ke.rocq_global_assumptions,[],"paired Rocq global assumptions");
 const candidateSources={lean4:read(root,candidatePaths.lean4),
  rocq:read(root,candidatePaths.rocq)};
 for(const symbols of kernelSymbols)for(const prover of ["lean4","rocq"] as const)
  for(const sym of symbols[prover])
   ok(candidateSources[prover].includes("Theorem "+sym+" ")||
      candidateSources[prover].includes("Theorem "+sym+" :")||
      candidateSources[prover].includes("theorem "+sym+" ")||
      candidateSources[prover].includes("theorem "+sym+"\n"),
      "pair-specific candidate kernel theorem missing "+prover+" "+sym);
 const lf=read(root,sourcePaths.lean_foundation),rf=read(root,sourcePaths.rocq_foundation);
 const lm=read(root,sourcePaths.lean_model),rm=read(root,sourcePaths.rocq_model);
 for(const f of [lf,rf]){
  for(const s of ["fnd13_form_injective","FND_13_identity_by_poles",
   "form_start","form_finish","F2F3GroundedNormalization"])
    ok(f.includes(s),"paired Foundation evidence "+s);
 }
 for(const f of [lm,rm]){
  for(const s of ["ExplicitFoundation","ExplicitOneSided","ExplicitInversionDomain",
    "ExplicitGroundedNormalization","explicit_a1"])
   ok(f.includes(s),"joint typed model evidence "+s);
 }
 ok(lm.includes("def badStart : ModelLink := [false]")&&
  lm.includes("def badFinish : ModelLink := [true]")&&
  lm.includes("| none => badStart")&&lm.includes("| none => badFinish")&&
  lm.includes("badStart_not_grounded")&&lm.includes("badFinish_not_grounded")&&
  rm.includes("model_bad_start : ModelLink := [false]")&&
  rm.includes("model_bad_finish : ModelLink := [true]")&&
  rm.includes("| None => model_bad_start")&&
  rm.includes("| None => model_bad_finish")&&
  rm.includes("model_bad_start_not_grounded")&&
  rm.includes("model_bad_finish_not_grounded"),
  "accepted non-Grounded fallback countermodel changed");
 const texts={
  B:read(root,"reviews/m06/reviewer-b-97-indexed-extraction.txt"),
  C:read(root,"reviews/m06/reviewer-c-43-indexed-extraction.txt")
 };
 ok(Array.isArray(d.cases)&&d.cases.length===4,"exact four cases");
 const entries:W2Entry[]=[];
 for(let i=0;i<4;i++){
  const e=map(d.cases[i],"case "+i),id=ids[i]!;
  shape(e,["id","reviewer","owner","original_question_ru","evidence_class",
   "evidence_symbols","kernel_theorems","answer_ru","limitation_ru","scientific_status"],"case "+id);
  ok(e.id===id&&e.reviewer===id[0]&&e.owner===owners[i]&&
   e.evidence_class===grades[i]&&e.scientific_status==="OPEN",
   "question evidence/status mismatch "+id);
  same(e.evidence_symbols,symbols[i],"exact accepted evidence symbols "+id);
  const theoremPair=map(e.kernel_theorems,"case "+id+" paired kernel symbols");
  shape(theoremPair,["lean4","rocq"],"case "+id+" paired symbols");
  same(theoremPair.lean4,kernelSymbols[i]!.lean4,
   "exact reviewed Lean theorem set "+id);
  same(theoremPair.rocq,kernelSymbols[i]!.rocq,
   "exact reviewed Rocq theorem set "+id);
  const source=index.entries.find(x=>x.id===id);
  ok(source!==undefined&&source.status==="PDF_INDEXED_EXTRACTION"&&
   source.owner===owners[i]&&source.page!==null&&source.line!==null&&
   source.anchor!==null,"question source/owner not pinned "+id);
  const page=texts[source.reviewer as "B"|"C"].match(
   new RegExp("<<<<<<<< M06 PAGE "+source.page+
    " BEGIN >>>>>>>>([\\s\\S]*?)<<<<<<<< M06 PAGE "+source.page+" END >>>>>>>>"))?.[1];
  const original=ru(e.original_question_ru,"question "+id,120);
  ok(page!==undefined&&compact(page).includes(compact(original))&&
   compact(page).includes(compact(source.anchor)),
   "verbatim PDF-derived question mismatch "+id);
  entries.push({id,original,answer:ru(e.answer_ru,"answer "+id,350),
   limitation:ru(e.limitation_ru,"limits "+id,200),
   grade:e.evidence_class as string,status:"OPEN"});
 }
 ok(new Set(entries.map(x=>x.id)).size===4,"duplicate questions");
 const lines=["## Приложение Л. M06-W2 — четыре индивидуальных научных вопроса","",
  "**Все четыре научных вердикта OPEN; ответы предложены, но не приняты.**",
  "Исходные B/C PDF представлены вторичными постраничными текстовыми извлечениями, не оригинальными PDF-байтами. Полные тексты 38 вопросов A ещё не восстановлены.",
  "Принятые исходники Foundation/ExplicitModel сверены по четырём точным Git blob SHA. Дополнительные proof-candidate-файлы сверены по двум SHA.",
  "**Парная формальная проверка:** Lean4: четыре теоремы имеют внешнюю зависимость только от propext; конструктивная теорема C-03 не использует аксиом. Rocq: пять теорем закрыты без дополнительных глобальных предположений.",
  "Проверено в [CI #38318851278](https://github.com/netkeep80/anum_docs/actions/runs/38318851278) на точном head e0005cb07d67910a6b70321eccb415f01bd51f04. Проверка ядрами не является независимым научным вердиктом или решением Автора.",""];
 for(const e of entries)lines.push("### "+e.id+" · "+e.grade,"",
  "**Дословный вопрос по PDF-транскрипции:** "+e.original,"",
  "**Предлагаемый ответ:** "+e.answer,"",
  "**Доказательная граница:** "+e.limitation,"",
  "**Научный статус:** OPEN — независимая рецензия и решение Автора отсутствуют.","");
 lines.push("**Открытые обязательства:** "+obligations.join("; ")+".",
  "**Код проверенных кандидатных доказательств:** [Lean4](https://github.com/netkeep80/anum_docs/blob/e0005cb07d67910a6b70321eccb415f01bd51f04/proofs/lean4/MtsM06W2External.lean), [Rocq](https://github.com/netkeep80/anum_docs/blob/e0005cb07d67910a6b70321eccb415f01bd51f04/proofs/coq/MtsM06W2External.v).","");
 return {entries,archiveMd:lines.join("\n"),publication:"blocked"};
}
export function loadReaderM06W2(root:string):W2{
 return parseReaderM06W2(read(root,REVIEW_M06_W2_PATH),root);
}
