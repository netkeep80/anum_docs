import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";
import { loadReaderG42 } from "./mts-reader-g42.js";
import { loadReaderR42 } from "./mts-reader-r42.js";
import { renderReaderR43Preview } from "./mts-reader-r43.js";

export const READER_R44_W1_PATH="requirements/mts-source/MTS-READER-INDEPENDENT-MATH-AUDIT-R44-W1.yaml";
function demand(c:unknown,why:string):asserts c{if(!c)throw new Error("mts-reader-r44: "+why);}
function map(v:unknown,at:string):Record<string,unknown>{
  demand(v!==null&&typeof v==="object"&&!Array.isArray(v),at+" mapping");return v as Record<string,unknown>;
}
function text(v:unknown,at:string,n=1):string{
  demand(typeof v==="string"&&v.trim().length>=n,at+" missing text");return v;
}
function arr(v:unknown,at:string):unknown[]{demand(Array.isArray(v),at+" array");return v;}
function keys(v:Record<string,unknown>,want:readonly string[],at:string):void{
  demand(Object.keys(v).sort().join("|")===[...want].sort().join("|"),at+" unexpected keys");
}
function one(s:string,needle:string,at:string):void{demand(s.split(needle).length===2,at+" exact occurrence");}
function read(root:string,path:string):string{return readFileSync(resolve(root,path),"utf8");}
type ReviewCase={id:string;chapter:string;state:string;finding:string;judgement:string;next:string;basis:string[]};
export interface ReaderR44W1 {
  readonly grammar:{v014:string;v015:string;nonidentity:string};
  readonly history:{prose:string;evidence:string;pr:number;mergeSha:string;utc:string};
  readonly reviews:readonly ReviewCase[];
  readonly publication:"blocked";
}
export function parseReaderR44W1(source:string,root:string):ReaderR44W1{
  const parsed=parseDocument(source,{strict:true,uniqueKeys:true});
  demand(parsed.errors.length===0&&parsed.warnings.length===0,"malformed/duplicate YAML");
  const r=map(parsed.toJS({maxAliasCount:0}),"R44");
  keys(r,["schema","status","author_approval","publication","semantic_change","scientific_coverage",
    "source_composition","source_preview","grammar","historical_acceptance","review_cases","remaining_r40"],"R44");
  demand(r.schema==="mts-reader-independent-mathematical-audit-r44-w1/v0.1"&&
    r.status==="proposed"&&r.author_approval==="not-recorded"&&r.publication==="blocked"&&
    r.semantic_change===false&&r.scientific_coverage==="targeted-first-wave-not-119-full-review"&&
    r.source_composition==="requirements/mts-source/MTS-READER-ACADEMIC-COMPOSITION-G42.yaml"&&
    r.source_preview==="requirements/mts-source/MTS-READER-SOURCE-ATTRIBUTION-R43.yaml",
    "cannot self-approve mathematical audit or claim full coverage");
  const g42=loadReaderG42(root),r42=loadReaderR42(root);
  const g=map(r.grammar,"grammar");
  keys(g,["source_owner","source_atom","accepted_id","accepted_contract","accepted_property",
    "accepted_value","source_yaml","v014_ru","v015_ru","nonidentity_ru","proof_case","finding"],"grammar");
  demand(g.source_owner==="G8"&&g.source_atom==="g8:no-implicit-associativity"&&
    g.accepted_id==="V14-L2"&&g.accepted_contract==="contracts/mts-contract-v0.14.json"&&
    g.source_yaml==="requirements/mts-source/MTS-READER-V14-G8.yaml"&&
    g.accepted_property==="ostensiveFormalNotation.implicitPairAssociativity"&&
    g.accepted_value==="NONE"&&g.proof_case==="FRM-03"&&g.finding==="R40-09",
    "version authority lost");
  const contract=JSON.parse(read(root,g.accepted_contract as string)) as
    {accepted:boolean;ostensiveFormalNotation:{implicitPairAssociativity:string}};
  const prose=read(root,g.source_yaml as string);
  demand(contract.accepted===true&&contract.ostensiveFormalNotation.implicitPairAssociativity==="NONE"&&
    prose.includes("оно не утверждает и не опровергает отдельного алгебраического закона"),
    "accepted v0.14 grammar NOT an algebraic associativity theorem");
  const v014=text(g.v014_ru,"version14",180),v015=text(g.v015_ru,"version15",190),
    nonidentity=text(g.nonidentity_ru,"nonidentity",110);
  demand(v014.includes("implicitPairAssociativity=NONE")&&
    v014.includes("не выводится ни ассоциативность") &&
    v015.includes("A⟼B⟼C")&&v015.includes("(A⟼B)⟼C")&&
    v015.includes("A⟼(B⟼C)")&&
    nonidentity.includes("FRM-03")&&nonidentity.includes("не следует"),
    "syntactic DSA vs algebraic law unguarded");
  const chapter=g42.chapters.find(c=>c.id==="grammar-and-historical-mp");
  demand(chapter?.scopeRu.includes("implicitPairAssociativity=NONE") &&
    !chapter.scopeRu.includes("неявная алгебраическая ассоциативность") &&
    chapter.atomIds.includes("g8:no-implicit-associativity"),
    "R44 G42 science repair missing or drifted");
  const frm=g42.proofCases.find(p=>p.id==="FRM-03");
  demand(frm?.classification==="PROVED_IN_SELECTED_MATHEMATICAL_MODEL" &&
    frm.exclusions.some(x=>x.includes("does not assert algebraic associativity")),
    "FRM-03 proof scope falsely upgraded");
  const h=map(r.historical_acceptance,"history");
  keys(h,["source","owner_issue","decision","recorded_evidence","acceptance_pr",
    "exact_merge_sha","merged_at_utc","historical_ru","evidence_ru","finding"],"history");
  demand(h.source==="traceability/mts-v0.15.json"&&h.owner_issue===1876&&
    h.decision==="ACCEPT_MTS_V0_15"&&
    h.recorded_evidence==="netkeep80/anum_docs#1876 issuecomment-6046228475"&&
    h.acceptance_pr===2078&&h.exact_merge_sha==="813a1569300b241a3b70eb282eecd8231db15e4b"&&
    h.merged_at_utc==="2026-10-07T23:17:15Z"&&h.finding==="R40-11",
    "historical v0.15 acceptance provenance drift");
  const tr=JSON.parse(read(root,h.source as string)) as
    {status:string;currentAccepted:{mtsVersion:string};authorDecision:{state:string;decision:string;decisionEvidence:string;ownerIssue:number}};
  demand(tr.status==="accepted"&&tr.currentAccepted.mtsVersion==="v0.15"&&
    tr.authorDecision.state==="ACCEPTED"&&tr.authorDecision.decision===h.decision&&
    tr.authorDecision.decisionEvidence===h.recorded_evidence&&tr.authorDecision.ownerIssue===1876,
    "historical author decision not witnessed by accepted source");
  const history=text(h.historical_ru,"historical narrative",160),
    evidence=text(h.evidence_ru,"acceptance evidence boundary",120);
  demand(history.includes("7 октября 2026")&&history.includes("23:17:15 UTC") &&
    evidence.includes("могут отличаться"),"history must distinguish acceptance merge from current main");
  const cases=arr(r.review_cases,"reviews").map(v=>{
    const c=map(v,"review case");
    keys(c,["id","chapter","state","source_basis","finding","judgement_ru","next_ru"],"case");
    const id=text(c.id,"id"),ch=text(c.chapter,"chapter"),finding=text(c.finding,"finding");
    demand(g42.chapters.some(x=>x.id===ch),"review references nonexistent chapter");
    const basis=arr(c.source_basis,"basis").map(x=>text(x,"source node"));
    demand(basis.length>=2 && new Set(basis).size===basis.length,"review missing distinct sources");
    const state=text(c.state,"bounded state");
    demand(state!=="accepted"&&state!=="closed"&&state!=="proved","review cannot self-promote");
    return {id,chapter:ch,state,finding,basis,judgement:text(c.judgement_ru,"individual review",145),
      next:text(c.next_ru,"remaining proof work",125)};
  });
  demand(JSON.stringify(cases.map(c=>c.id))===JSON.stringify(["R44-W1-01","R44-W1-02","R44-W1-03","R44-W1-04"]) &&
    JSON.stringify(cases.map(c=>c.finding))===JSON.stringify(["R40-09","R40-11","R40-13","R40-15"]),
    "R44 limited wave individual review identities");
  const rest=map(r.remaining_r40,"remaining R40");
  keys(rest,["corrected_previously","mitigated_needs_rereview","open"],"R40");
  demand(JSON.stringify(rest.corrected_previously)===JSON.stringify(g42.findings.corrected) &&
    JSON.stringify(rest.mitigated_needs_rereview)===JSON.stringify(g42.findings.mitigated) &&
    JSON.stringify(rest.open)===JSON.stringify(g42.findings.open) &&
    r42.findings.length===15,"remaining R40 may not close automatically");
  return {grammar:{v014,v015,nonidentity},
    history:{prose:history,evidence,pr:2078,mergeSha:h.exact_merge_sha as string,utc:h.merged_at_utc as string},
    reviews:cases,publication:"blocked"};
}
export function loadReaderR44W1(root:string):ReaderR44W1{
  return parseReaderR44W1(read(root,READER_R44_W1_PATH),root);
}
export function renderReaderR44W1Preview(root:string):string{
  const plan=loadReaderR44W1(root);
  let manuscript=renderReaderR43Preview(root);
  demand(manuscript.includes("ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА") &&plan.publication==="blocked",
    "manuscript acceptance boundary");
  const grammarTitle="## Нотация, последовательная ассоциация и историческое развитие MP";
  one(manuscript,grammarTitle,"grammar chapter");
  const paragraph=[
    "### Синтаксис и группировка: v0.14 ↔ v0.15","",
    plan.grammar.v014,"",plan.grammar.v015,"",plan.grammar.nonidentity,"",
    "Основания: [контракт v0.14](https://github.com/netkeep80/anum_docs/blob/c64b7e21340c6add248c8f380f3fef1292616ac6/contracts/mts-contract-v0.14.json), G8 / g8:no-implicit-associativity, FRM-03.",""
  ].join("\n");
  manuscript=manuscript.replace(grammarTitle,grammarTitle+"\n\n"+paragraph);
  const govTitle="## Статус принятия, нормативные границы и история релизов";
  one(manuscript,govTitle,"history chapter");
  manuscript=manuscript.replace(govTitle,govTitle+"\n\n### История принятия версии v0.15\n\n"+
    plan.history.prose+"\n\n"+plan.history.evidence+"\n\n"+
    "Исторический merge SHA: `"+plan.history.mergeSha+"` (не тождественен автоматически текущему main).\n\n"+
    "Источник: [PR #2078](https://github.com/netkeep80/anum_docs/pull/2078), "+
    "[зафиксированный реестр](https://github.com/netkeep80/anum_docs/blob/c64b7e21340c6add248c8f380f3fef1292616ac6/traceability/mts-v0.15.json).");
  const tail="## Редакционные ограничения R40";
  one(manuscript,tail,"R40 conclusion");
  const audited=["## Первый независимый математический проход R44-W1","",
    "Этот проход проверил четыре конкретных места и не заменяет независимую научную проверку всех 119 исходных утверждений.",""];
  for(const c of plan.reviews)audited.push("**"+c.id+" / "+c.finding+" / "+c.state+"**","",
    "Раздел: "+c.chapter+". Опорные источники: "+c.basis.join(", ")+".","",
    c.judgement,"","**Осталось:** "+c.next,"");
  manuscript=manuscript.replace(tail,audited.join("\n")+"\n"+tail);
  const count=(manuscript.match(/^\*\*(?:g4:|g7:|g8:|g10:|g11:|basis:|concept:|editorial:)/gm)??[]).length;
  demand(count===119,"R44 may not erase/duplicate source atoms");
  return manuscript;
}
