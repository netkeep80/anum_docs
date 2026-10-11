import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";
import { loadReaderG42 } from "./mts-reader-g42.js";

export const READER_R42_PATH = "requirements/mts-source/MTS-READER-SCIENTIFIC-SECOND-PASS-R42.yaml";
interface R42Chapter { chapter: string; evidenceNodes: string[]; assessmentRu: string; outstandingRu: string; }
interface R42Finding { id: string; state: string; judgementRu: string; }
interface R42Truth { case: string; args: string; image: string; rule: string; }
export interface R42ScientificReview {
  readonly chapters: readonly R42Chapter[];
  readonly findings: readonly R42Finding[];
  readonly truth: readonly R42Truth[];
  readonly negativeRu: string;
  readonly sequenceObservations: readonly string[];
  readonly forbiddenRu: string;
  readonly scientificReview: "requires-independent-author-review";
  readonly publication: "blocked";
}
function demand(value: unknown, msg: string): asserts value {
  if (!value) throw new Error("mts-reader-r42: "+msg);
}
function obj(value: unknown, at: string): Record<string,unknown> {
  demand(value!==null && typeof value==="object" && !Array.isArray(value),at+" object expected");
  return value as Record<string,unknown>;
}
function arr(value: unknown, at: string): unknown[] {
  demand(Array.isArray(value), at+" array expected"); return value;
}
function string(value: unknown, at: string, min=1): string {
  demand(typeof value==="string" && value.trim().length>=min, at+" missing/short text");
  return value;
}
function pin(root: string, path: string, digest: string): string {
  const b=readFileSync(resolve(root,path));
  demand(createHash("sha256").update(b).digest("hex")===digest,
    "approved external artifact bytes changed: "+path);
  return b.toString("utf8");
}
function exactKeys(row: Record<string,unknown>, expected: readonly string[], at: string): void {
  demand(Object.keys(row).sort().join("|")===[...expected].sort().join("|"),at+" unexpected keys");
}

export function parseReaderR42(text: string, root: string): R42ScientificReview {
  const doc=parseDocument(text,{strict:true,uniqueKeys:true});
  demand(doc.errors.length===0 && doc.warnings.length===0,"R42 malformed/duplicate YAML");
  const raw=obj(doc.toJS({maxAliasCount:0}),"R42 root");
  exactKeys(raw,["schema","status","author_approval","publication","semantic_change",
    "scientific_review","source_composition","prose_basis","reviewed_scope","not_claimed",
    "chapter_reviews","finding_reviews","existing_example_sources"],"R42");
  demand(raw.schema==="mts-reader-scientific-second-pass/v0.1" &&
    raw.status==="proposed" && raw.author_approval==="not-recorded" &&
    raw.publication==="blocked" && raw.semantic_change===false &&
    raw.scientific_review==="requires-independent-author-review" &&
    raw.source_composition==="requirements/mts-source/MTS-READER-ACADEMIC-COMPOSITION-G42.yaml" &&
    raw.prose_basis==="R40-individual-119-of-119" &&
    raw.reviewed_scope==="ten-G42-chapters-and-fifteen-R40-findings",
    "R42 may neither self-approve nor declare scientific completeness");
  const denied=arr(raw.not_claimed,"not claimed").map(x=>string(x,"denial"));
  demand(denied.includes("globally-injective-F_R") &&
    denied.includes("proof-of-production-TypeScript"),"R42 proof boundary missing");
  const composition=loadReaderG42(root);
  const chapters=arr(raw.chapter_reviews,"reviews").map(value=>{
    const r=obj(value,"chapter review");
    exactKeys(r,["chapter","evidence_nodes","assessment_ru","outstanding_ru","verdict"],"chapter");
    demand(r.verdict==="revision-required","chapter cannot be approved automatically");
    return {chapter:string(r.chapter,"chapter"), evidenceNodes:arr(r.evidence_nodes,"nodes").map(x=>string(x,"node")),
      assessmentRu:string(r.assessment_ru,"scientific assessment",95),
      outstandingRu:string(r.outstanding_ru,"individual remedial plan",75)};
  });
  demand(chapters.length===10 &&
    JSON.stringify(chapters.map(r=>r.chapter))===JSON.stringify(composition.chapters.map(c=>c.id)),
    "ten reviewed chapters must match the exact G42 order");
  for(let i=0;i<10;i++){
    const chapter=composition.chapters[i]!, review=chapters[i]!;
    demand(review.evidenceNodes.length>=3 && new Set(review.evidenceNodes).size===review.evidenceNodes.length &&
      review.evidenceNodes.every(id=>chapter.atomIds.includes(id)),
      "R42 chapter evidence must be actually located in that academic chapter: "+chapter.id);
  }
  const findings=arr(raw.finding_reviews,"finding reviews").map(value=>{
    const r=obj(value,"finding review");
    exactKeys(r,["id","state","judgement_ru"],"finding");
    return {id:string(r.id,"finding ID"),state:string(r.state,"finding state"),
      judgementRu:string(r.judgement_ru,"finding scope",65)};
  });
  demand(findings.length===15 && findings.map(r=>r.id).join("|")===
    Array.from({length:15},(_,i)=>"R40-"+String(i+1).padStart(2,"0")).join("|"),
    "R42 cannot omit, duplicate or reorder the 15 R40 findings");
  for(const f of findings) {
    const expected=f.id==="R40-05"?"corrected-in-previous-draft":
      composition.findings.mitigated.includes(f.id)?"mitigated-await-rereview":"open";
    demand(f.state===expected,"R42 cannot inflate finding "+f.id);
  }
  const sources=obj(raw.existing_example_sources,"example sources");
  exactKeys(sources,["compact_and","positional_sequences"],"R42 examples");
  const and=obj(sources.compact_and,"compact-and");
  exactKeys(and,["formal","formal_sha256","json","json_sha256","acceptance_test",
    "execution_test","truth_table","extra_observation_ru"],"compact AND");
  demand(and.formal==="formal/v0.15/regression/compact-and.formal" &&
    and.json==="formal/v0.15/regression/compact-and.json" &&
    and.acceptance_test==="ts/test/v015-compact-and-approved-source-integrity.test.ts" &&
    and.execution_test==="ts/test/v015-compact-and-role-bundle-a1.test.ts",
    "R42 may only cite the existing approved AND artifacts");
  const formal=pin(root,and.formal as string,string(and.formal_sha256,"FORMAL SHA",64));
  const json=JSON.parse(pin(root,and.json as string,string(and.json_sha256,"JSON SHA",64))) as Record<string,unknown>;
  const integrity=readFileSync(resolve(root,and.acceptance_test as string),"utf8");
  const test=readFileSync(resolve(root,and.execution_test as string),"utf8");
  demand(integrity.includes(and.formal_sha256 as string) &&
    integrity.includes(and.json_sha256 as string),"Author-approved digest test mismatch");
  const truth=arr(and.truth_table,"truth table").map(value=>{
    const row=obj(value,"truth row");
    exactKeys(row,["case","args","image","rule"],"truth row");
    const c=string(row.case,"case");
    const args=string(row.args,"args"), image=string(row.image,"image");
    const rule=string(row.rule,"rule");
    demand(c==="FF"||c==="FT"||c==="TF"||c==="TT","unexpected Boolean case");
    demand(args==="Args"+c && rule==="Rule"+c,"AND trace not canonical");
    const expectedImage=c==="TT"?"ImageT":"ImageF";
    demand(image===expectedImage && Array.isArray(json[args]) &&
      JSON.stringify(json[args])===JSON.stringify(c.split("").map(ch=>ch==="T"?"T":"F")) &&
      json[rule]==="V0->((AND->"+args+")->"+image+")" &&
      json["Theory->"+rule]===null &&
      formal.includes(rule+" : V0->((AND->"+args+")->"+image+")") &&
      formal.includes("Theory->"+rule),
      "R42 AND example not anchored in approved source: "+c);
    return {case:c,args,image,rule};
  });
  demand(truth.map(x=>x.case).join(",")==="FF,FT,TF,TT","not the complete approved AND truth table");
  demand(test.includes("non-Boolean operand is NO_MATCH") &&
    test.includes("[F, \"FX\"]") && test.includes("[T, \"TX\"]"),
    "NO_MATCH negative example must be found in executable test, not the canonical JSON");
  const neg=string(and.extra_observation_ru,"NO_MATCH boundary",95);
  demand(neg.includes("NO_MATCH") && neg.includes("не новый утверждённый JSON"),
    "NO_MATCH claim must retain test-only qualification");
  const ex=obj(sources.positional_sequences,"ExactSequence cases");
  exactKeys(ex,["execution_test","observations","forbidden_claim_ru"],"ExactSequence");
  demand(ex.execution_test==="ts/test/v015-formal-exact-sequence-b7.test.ts",
    "R42 ExactSequence source changed");
  const exact=readFileSync(resolve(root,ex.execution_test as string),"utf8");
  const anchors=["\"EMPTY : []\"","\"PAIR_FT : [F,T]\"","\"PAIR_TF : [T,F]\"",
    "\"DUP_FF : [F,F]\"","\"LINK_FT : F->T\"",
    "same(empty, f.basis.R","pairFT !== pairTF","dupFF !== singleF","linkFT !== pairFT"];
  demand(anchors.every(s=>exact.includes(s)),"R42 ExactSequence witness source not complete");
  const obs=arr(ex.observations,"observations").map(v=>string(v,"observation",35));
  demand(obs.length===4 && obs[0]!.includes("R") && obs[1]!.includes("[F,T]") &&
    obs[2]!.includes("[F,F]") && obs[3]!.includes("F->T"),
    "R42 sequential test cases missing");
  const forbidden=string(ex.forbidden_claim_ru,"proof negative",95);
  demand(forbidden.includes("F_R") && forbidden.includes("не следуют"),
    "unwitnessed fold collision must not be asserted");
  const proof=JSON.parse(readFileSync(resolve(root,"proofs/v015-formal-proof-assurance.json"),"utf8")) as
    {targets: Array<{id:string,classification:string,exclusions:string[]}>};
  demand(proof.targets.find(p=>p.id==="FRM-04")?.classification===
    "PROVED_UNDER_EXACT_SEQUENCE_INJECTIVITY","cannot upgrade FRM-04 proof");
  return {chapters,findings,truth,negativeRu:neg,sequenceObservations:obs,
    forbiddenRu:forbidden,scientificReview:"requires-independent-author-review",
    publication:"blocked"};
}
export function loadReaderR42(root: string): R42ScientificReview {
  return parseReaderR42(readFileSync(resolve(root,READER_R42_PATH),"utf8"),root);
}
export function renderReaderR42Review(root: string): string {
  const model=loadReaderR42(root);
  demand(model.publication==="blocked","R42 publication gate");
  const lines=["# R42 — вторая научно-редакционная проверка МТС v0.15","",
    "**ПРЕДЛОЖЕНИЕ. АВТОР НЕ УТВЕРЖДАЛ. ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА.**","",
    "Проверены композиция десяти глав и пятнадцать замечаний R40. Это не новый полный независимый проход доказательств всех 119 исходных утверждений.",""];
  for(const ch of model.chapters) lines.push("## "+ch.chapter,"",
    "Опорные атомы: "+ch.evidenceNodes.join(", ")+".","",ch.assessmentRu,"",
    "**Осталось:** "+ch.outstandingRu,"");
  lines.push("## Утверждённый исходный пример: AND","",
    "Исходники: formal/v0.15/regression/compact-and.formal и compact-and.json; точные SHA-256 проверяются при генерации.",
    "Таблица извлекается из четырёх zero-role правил, а не сочиняется вручную.","",
    "| Аргументы | Правило | Проверяемый образ |","|---|---|---|");
  for(const r of model.truth) lines.push("| "+r.case+" | "+r.rule+" | "+r.image+" |");
  lines.push("",model.negativeRu,"","## Исполняемые позиционные примеры ExactSequence","");
  for(const o of model.sequenceObservations) lines.push("- "+o);
  lines.push("",model.forbiddenRu,"","## Остаточные замечания R40","");
  for(const f of model.findings) lines.push("- "+f.id+" / "+f.state+": "+f.judgementRu);
  return lines.join("\n");
}
