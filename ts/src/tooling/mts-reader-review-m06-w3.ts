import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseDocument} from "yaml";
import {loadReaderM06} from "./mts-reader-review-m06.js";
import {loadReaderM06W2} from "./mts-reader-review-m06-w2.js";

export const REVIEW_M06_W3_PATH="requirements/mts-source/MTS-READER-QUESTION-RESPONSES-M06-W3.yaml";
type Rec=Record<string,unknown>;
const ids=["B-1.1","B-1.2","B-1.5","B-1.6","B-1.9","B-1.10"] as const;
const owners=["F01","F05","F01","F02","F03","F01"] as const;
const grades=["TOTAL_ONE_SORTED_SIGNATURE","GENERAL_INJECTIVITY_THEOREM",
 "MODEL_UNIVERSE_BOUNDARY","JOINT_EXPLICIT_MODEL_WITH_SCOPE_LIMIT",
 "CONDITIONAL_FIVE_BASIS_DISTINCTNESS",
 "CONSTRUCTIVE_CORE_EXPLICIT_META_AXIOMS"] as const;
const symbols=[
 ["Foundation","form_start","form_finish","root_self"],
 ["fnd13_form_injective","form_start","form_finish"],
 ["Foundation","ExplicitFoundation","ModelLink","decode_form"],
 ["ExplicitFoundation","ExplicitOneSided","ExplicitInversionDomain",
  "ExplicitGroundedNormalization","explicit_a1",
  "M06_W2_joint_model_witness","F03_basis_five_pairwise_distinct"],
 ["F2F3OneSidedExistence","f2f3_start_root_pattern",
  "f2f3_finish_root_pattern","f2f3_pair_pattern",
  "f2f3_reverse_pair_pattern","F03_basis_five_pairwise_distinct"],
 ["Foundation","LocalSelfDecision","local_self_incidence_exhaustive",
  "M06_W2_two_distinct_implies_nat_injection","M06_W2_joint_model_witness"]
] as const;
const obligations=["M06_W3_SIX_INDEPENDENT_SCIENTIFIC_VERDICTS_PENDING",
 "M06_W3_COMPLETE_MANUSCRIPT_META_LOGIC_DECLARATION_PENDING",
 "M06_W3_ALL_LATER_INTERFACES_NOT_JOINTLY_CERTIFIED",
 "M06_A_38_ORIGINALS_STILL_NOT_RECOVERED",
 "M06_BC_ORIGINAL_PDF_BYTES_UNAVAILABLE"] as const;
const paths={
 lean_foundation:"proofs/lean4/MtsFoundation.lean",
 rocq_foundation:"proofs/coq/MtsFoundation.v",
 lean_explicit_model:"proofs/lean4/MtsExplicitModel.lean",
 rocq_explicit_model:"proofs/coq/MtsExplicitModel.v",
 lean_five_distinct:"proofs/lean4/MtsBasisFiveDistinct.lean",
 rocq_five_distinct:"proofs/coq/MtsBasisFiveDistinct.v",
 lean_m06_w2:"proofs/lean4/MtsM06W2External.lean",
 rocq_m06_w2:"proofs/coq/MtsM06W2External.v"
} as const;
const pins={
 lean_foundation:"f283192148ef5381f02a0b23d50b9884cf10b0c0",
 rocq_foundation:"66db1fb851724898112cfcd9ba5022c4d766b35d",
 lean_explicit_model:"744309364e08dc9b554bde7c3138b7ba84387a72",
 rocq_explicit_model:"6dd9823754e3ac52d8cd7f4184ff8b71d496f8c3",
 lean_five_distinct:"2f64125d74ff7779893854a75479380b2df8049c",
 rocq_five_distinct:"fbfe56265400db98abd4d524f2a2cc832ebb735f",
 lean_m06_w2:"75433cb107048148cefe12630e59b4042f550dd3",
 rocq_m06_w2:"f9e45f6d5808258e64b4c84450e70b011c4a208a"
} as const;
const transcriptPath="reviews/m06/reviewer-b-97-indexed-extraction.txt";
const transcriptPin="80fa8d078da9647030d323e12c96d8c50e849309";
export interface W3Entry{
 readonly id:string;readonly question:string;readonly answer:string;
 readonly limitation:string;readonly classification:string;readonly status:"OPEN";
}
export interface W3{
 readonly entries:readonly W3Entry[];readonly archiveMd:string;readonly publication:"blocked";
}
function ok(x:unknown,m:string):asserts x{if(!x)throw Error("review-M06-W3: "+m);}
function map(x:unknown,m:string):Rec{ok(!!x&&typeof x==="object"&&!Array.isArray(x),m+" map");return x as Rec;}
function eq(a:unknown,b:unknown,m:string){ok(JSON.stringify(a)===JSON.stringify(b),m);}
function keys(x:Rec,expected:readonly string[],m:string){eq(Object.keys(x).sort(),[...expected].sort(),m+" exact fields");}
function ru(v:unknown,m:string,min:number):string{
 ok(typeof v==="string"&&v.length>=min&&/[А-Яа-яЁё]/u.test(v),m+" Russian source text");
 return v;
}
function read(root:string,path:string){return readFileSync(resolve(root,path),"utf8");}
function blob(source:string):string{
 const bytes=Buffer.from(source,"utf8");
 return createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex");
}
function compact(s:string):string{return s.replace(/\s+/gu,"");}
export function parseReaderM06W3(raw:string,root:string):W3{
 const index=loadReaderM06(root),w2=loadReaderM06W2(root);
 ok(index.entries.length===178&&index.indexed===140&&index.unrecovered===38&&
  index.publication==="blocked"&&w2.entries.length===4&&w2.publication==="blocked",
  "source inventory/W2 stable prerequisite");
 const doc=parseDocument(raw,{strict:true,uniqueKeys:true});
 ok(!doc.errors.length&&!doc.warnings.length,"invalid or duplicate YAML");
 const d=map(doc.toJS({maxAliasCount:0}),"W3");
 keys(d,["schema","status","author_approval","publication","semantic_change",
  "accepted_main_sha","master_issue","review_issue","upstream_inventory",
  "upstream_wave","review_scope","verdict","question_status","source_note",
  "reviewer_b_transcript_blob","source_blobs","proof_runs","logic_boundary",
  "cases","open_obligations"],"W3");
 ok(d.schema==="mts-v015-m06-question-specific-replies-w3/v0.1"&&
  d.status==="proposed"&&d.author_approval==="not-recorded"&&
  d.publication==="blocked"&&d.semantic_change===false&&
  d.accepted_main_sha==="c64b7e21340c6add248c8f380f3fef1292616ac6"&&
  d.master_issue===2217&&d.review_issue===2259&&
  d.upstream_inventory==="requirements/mts-source/MTS-READER-QUESTIONS-M06-INDEX.yaml"&&
  d.upstream_wave==="requirements/mts-source/MTS-READER-QUESTION-RESPONSES-M06-W2.yaml"&&
  d.verdict==="INDIVIDUAL_EVIDENCE_REVIEW_PENDING"&&d.question_status==="OPEN",
  "scientific/author/publication authority escalation");
 eq(d.review_scope,ids,"exact six W3 sources");
 eq(d.open_obligations,obligations,"open obligations cannot be auto-closed");
 ok(String(d.source_note).includes("байтовое совпадение НЕ доказано"),
  "must not claim original PDF byte provenance");
 const transcript=read(root,transcriptPath);
 eq(d.reviewer_b_transcript_blob,transcriptPin,"original page extraction pin");
 ok(blob(transcript)===transcriptPin,"Git blob PDF transcription changed");
 const bs=map(d.source_blobs,"proof blob pins");
 keys(bs,Object.keys(pins),"accepted/candidate proof pins");
 const files={} as Record<keyof typeof paths,string>;
 for(const key of Object.keys(paths) as (keyof typeof paths)[]){
  eq(bs[key],pins[key],"exact proof SHA "+key);
  const source=read(root,paths[key]);
  ok(blob(source)===pins[key],"proof bytes changed "+key);
  files[key]=source;
 }
 const runs=map(d.proof_runs,"source proof runs");
 keys(runs,["five_distinct_ci","w2_exact_head_ci"],"runs");
 ok(runs.five_distinct_ci===38318851278&&runs.w2_exact_head_ci===38320270123,
  "kernel evidence run must be pinned");
 const logic=map(d.logic_boundary,"logical metatheory boundary");
 keys(logic,["weak_foundation_no_classical_axiom",
  "local_self_decision_explicit_premise","model_specific_lean_propext",
  "whole_mts_classical_free_not_proved"],"logic scope");
 for(const k of Object.keys(logic))ok(logic[k]===true,"logical boundary not preserved "+k);
 for(const f of [files.lean_foundation,files.rocq_foundation]){
  for(const sym of ["Foundation","form_start","form_finish",
   "fnd13_form_injective","LocalSelfDecision","F2F3OneSidedExistence",
   "local_self_incidence_exhaustive"])
   ok(f.includes(sym),"paired weak Foundation symbol absent: "+sym);
 }
 ok(files.lean_foundation.includes("structure Foundation where")&&
  files.rocq_foundation.includes("Record Foundation : Type :="),
  "one-sorted total signature mismatch");
 for(const f of [files.lean_explicit_model,files.rocq_explicit_model]){
  for(const sym of ["ExplicitFoundation","ExplicitOneSided",
   "ExplicitInversionDomain","ExplicitGroundedNormalization","explicit_a1"])
   ok(f.includes(sym),"single explicit model witness missing "+sym);
 }
 ok(files.lean_five_distinct.includes("theorem F03_basis_five_pairwise_distinct")&&
  files.rocq_five_distinct.includes("Theorem F03_basis_five_pairwise_distinct")&&
  files.lean_m06_w2.includes("theorem M06_W2_joint_model_witness")&&
  files.rocq_m06_w2.includes("Theorem M06_W2_joint_model_witness")&&
  files.lean_m06_w2.includes("theorem M06_W2_two_distinct_implies_nat_injection")&&
  files.rocq_m06_w2.includes("Theorem M06_W2_two_distinct_implies_nat_injection"),
  "paired theorem/proof-grade mismatch");
 ok(Array.isArray(d.cases)&&d.cases.length===6,"six independent questions");
 const entries:W3Entry[]=[];
 for(let i=0;i<6;i++){
  const e=map(d.cases[i],"case "+i);
  keys(e,["id","owner","original_question_ru","classification",
   "evidence_symbols","answer_ru","limitation_ru","scientific_status"],
   "case "+i);
  const id=ids[i]!;
  ok(e.id===id&&e.owner===owners[i]&&e.classification===grades[i]&&
   e.scientific_status==="OPEN","case owner/grade/status "+id);
  eq(e.evidence_symbols,symbols[i],"per-case exact proof symbols "+id);
  const source=index.entries.find(q=>q.id===id);
  ok(source!==undefined&&source.reviewer==="B"&&
   source.status==="PDF_INDEXED_EXTRACTION"&&
   source.owner===owners[i]&&source.page!==null&&source.line!==null&&
   source.anchor!==null,"original B indexed provenance "+id);
  const page=transcript.match(new RegExp("<<<<<<<< M06 PAGE "+source.page+
   " BEGIN >>>>>>>>([\\s\\S]*?)<<<<<<<< M06 PAGE "+source.page+" END >>>>>>>>"))?.[1];
  const question=ru(e.original_question_ru,"verbatim question "+id,110);
  ok(page!==undefined&&compact(page).includes(compact(question))&&
   compact(page).includes(compact(source.anchor)),
   "verbatim PDF-derived question mismatch "+id);
  const answer=ru(e.answer_ru,"independent answer "+id,300);
  const limitation=ru(e.limitation_ru,"per-case limits "+id,170);
  entries.push({id,question,answer,limitation,
   classification:e.classification as string,status:"OPEN"});
 }
 const lines=["## Приложение М. M06-W3 — сигнатура, модели, логика и пять базисных Связей","",
  "**Все шесть научных вердиктов OPEN.** Включены только предложенные индивидуальные математические ответы; отдельной авторской приёмки нет.",
  "Источник вопросов B: зафиксированная постраничная транскрипция, не оригинальные PDF-байты. Полные 38 вопросов рецензента A не восстановлены.",
  "Статус доказательств: все восемь внешних исходников строго сверены по Git blob SHA; для R/O/C/L/U доказательство десяти различий условно на F2F3OneSidedExistence.",
  "Логический статус: общий Foundation не требует закона исключённого третьего; локальная разрешимость равенств вводится отдельно. Четыре модельные Lean-теоремы W2 используют propext, общая C-03 не использует аксиом.",""];
 for(const e of entries)lines.push("### "+e.id+" · "+e.classification,"",
  "**Исходный вопрос (дословная транскрипция PDF):** "+e.question,"",
  "**Предлагаемый ответ:** "+e.answer,"",
  "**Что не доказано:** "+e.limitation,"",
  "**Научный вердикт:** OPEN.","");
 lines.push("**Открытые обязательства:** "+obligations.join("; ")+".",
  "**Верифицированные кандидаты:** [Foundation Lean4](https://github.com/netkeep80/anum_docs/blob/c64b7e21340c6add248c8f380f3fef1292616ac6/proofs/lean4/MtsFoundation.lean), [Foundation Rocq](https://github.com/netkeep80/anum_docs/blob/c64b7e21340c6add248c8f380f3fef1292616ac6/proofs/coq/MtsFoundation.v), [пять различий Lean4](https://github.com/netkeep80/anum_docs/blob/ed65661fddaf22d6727232c5e4653e82151e4e8d/proofs/lean4/MtsBasisFiveDistinct.lean), [Rocq](https://github.com/netkeep80/anum_docs/blob/ed65661fddaf22d6727232c5e4653e82151e4e8d/proofs/coq/MtsBasisFiveDistinct.v), [W2 Lean4](https://github.com/netkeep80/anum_docs/blob/ed65661fddaf22d6727232c5e4653e82151e4e8d/proofs/lean4/MtsM06W2External.lean), [W2 Rocq](https://github.com/netkeep80/anum_docs/blob/ed65661fddaf22d6727232c5e4653e82151e4e8d/proofs/coq/MtsM06W2External.v).",
  "**CI:** [полная Lean4/Rocq проверка #38320270123](https://github.com/netkeep80/anum_docs/actions/runs/38320270123). Публикация и научное закрытие запрещены.","");
 return {entries,archiveMd:lines.join("\n"),publication:"blocked"};
}
export function loadReaderM06W3(root:string):W3{
 return parseReaderM06W3(read(root,REVIEW_M06_W3_PATH),root);
}
