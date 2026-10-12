import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {loadReaderG20} from "../src/tooling/mts-reader-g20.js";
import {renderReaderW6} from "../src/tooling/mts-reader-r44-w6.js";
import {loadReaderM04,parseReaderM04,REVIEW_M04_PATH}
 from "../src/tooling/mts-reader-review-m04.js";

const root=resolve(".."),raw=readFileSync(resolve(root,REVIEW_M04_PATH),"utf8");
const m=loadReaderM04(root);
assert.equal(m.publication,"blocked");
assert.equal(m.claims.length,16);
assert.equal(new Set(m.claims.map(r=>r.id)).size,16);
assert.deepEqual(
 Object.fromEntries([...new Set(m.claims.map(r=>r.grade))].map(g=>
  [g,m.claims.filter(r=>r.grade===g).length])),
 {
  KERNEL_THEOREM:4,CONDITIONAL_THEOREM:5,EXECUTABLE_WITNESS:2,
  ACCEPTED_SEMANTIC_CONTRACT:1,OPEN_RESEARCH:2,
  AUTHOR_DECISION:1,AUTHOR_DECISION_PENDING:1,
 });
assert.equal(m.openObligations.length,4);
for(const s of [
 "fnd13_form_injective","F03_basis_five_pairwise_distinct",
 "FRM_03_direct_sequential_association_three",
 "FRM_04_single_root_distinct_from_empty",
 "FRM_05_shared_source_implies_shared_denotation",
 "FRM_06_metacompiler_preserves_semantics",
 "FRM_07_approved_artifact_refinement",
 "FRM_08_structural_aspect_denotation",
 "EXACT_SEQUENCE_LEFT_INVERSE_SAMPLED=156",
 "MTS_V015_COMPACT_AND_A1=GREEN",
 "GPR_01_gamma_successor_unique",
 "GAMMA_STRUCTURAL_ASET",
 "PRECISE_CATEGORY_OF_MTS_MODELS",
 "M02_FULL_GAMMA_TRANSITION_EXECUTABLE_WITNESS",
 "ACCEPT_MTS_V0_15","M04_AUTHOR_SCIENTIFIC_ACCEPT_NOT_RECORDED",
])assert.ok(m.evidenceMd.includes(s),"M04 evidence absent "+s);
const reader=renderReaderW6(root);
assert.equal(reader.publication,"blocked");
assert.equal(reader.mainText.split("### M04.").length-1,1);
assert.ok(reader.mainText.indexOf("### M04.")>reader.mainText.indexOf("### M03."));
assert.ok(reader.mainText.indexOf("### M04.")<reader.mainText.indexOf("**8.1."));
for(const r of m.claims)assert.equal(
 reader.mainText.split("##### "+r.id+" ·").length-1,1);
assert.equal(reader.sourceFragments.size,119);
assert.equal(reader.mainIds.length,102);
assert.equal(reader.annexIds.length,17);
for(const atom of loadReaderG20(root).ordered)
 assert.equal(reader.sourceFragments.get(atom.id)?.join(""),atom.textRu,
  "original science fragment changed: "+atom.id);
assert.equal((reader.annexes.match(/^### R40-(?:06|07|09|10|11|12|13|14|15) /gm)??[]).length,9);
function mutate(before:string,after:string){
 assert.ok(raw.includes(before),"mutation fixture missing "+before);
 return parseReaderM04(raw.replace(before,after),root);
}
assert.throws(()=>mutate("author_approval: not-recorded","author_approval: accepted"),
 /cannot become accepted authority/);
assert.throws(()=>mutate("publication: blocked","publication: ready"),
 /cannot become accepted authority/);
assert.throws(()=>mutate("semantic_change: false","semantic_change: true"),
 /cannot become accepted authority/);
assert.throws(()=>mutate("package_issue: 2254","package_issue: 1"),
 /cannot become accepted authority/);
assert.throws(()=>mutate("id: M04-FRM07","id: M04-FRM07-FAKE"),
 /claim identity, status or theorem scope drift/);
assert.throws(()=>mutate("grade: CONDITIONAL_THEOREM","grade: KERNEL_THEOREM"),
 /claim identity, status or theorem scope drift/);
assert.throws(()=>mutate("evidence_symbol: \"FRM_07_approved_artifact_refinement\"",
 "evidence_symbol: \"FRM_07_full_TypeScript_proof\""),
 /claim identity, status or theorem scope drift/);
assert.throws(()=>mutate("source_keys: [formal_lean,formal_rocq,assurance]",
 "source_keys: [formal_lean,assurance]"),
 /claim evidence owners/);
assert.throws(()=>mutate("M04_PRODUCTION_REFINEMENT_NOT_PROVED",
 "M04_PRODUCTION_REFINEMENT_PROVED"),/open M04 gates/);
assert.throws(()=>parseReaderM04(raw+"\npublication: ready\n",root),
 /invalid or duplicated YAML/);
console.log("M04: 16 source-scoped epistemic claims, 7 evidence grades, "+
 "four open gates, 119 originals + nine open R40 retained.");
