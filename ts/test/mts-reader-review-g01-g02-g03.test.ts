import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {renderReaderW6} from "../src/tooling/mts-reader-r44-w6.js";
import {loadReaderG20} from "../src/tooling/mts-reader-g20.js";
import {loadReaderG01G03,parseReaderG01G03,REVIEW_G01_G03_PATH}
 from "../src/tooling/mts-reader-review-g01-g02-g03.js";
const root=resolve(".."),raw=readFileSync(resolve(root,REVIEW_G01_G03_PATH),"utf8");
const r=loadReaderG01G03(root);
assert.equal(r.publication,"blocked");
assert.equal(r.evidence.length,11);
assert.deepEqual(r.openObligations,["GAMMA_FULL_PRODUCTION_REFINEMENT",
 "CONCURRENT_ATOMIC_PUBLICATION_PROOF",
 "EXACT_PROVENANCE_ORDER_VS_SEMANTIC_CONVERGENCE",
 "CANONICAL_AND_RUNTIME_REFINEMENT"]);
assert.ok(r.transitionMd.includes("NO_MATCH"));
assert.ok(r.transitionMd.includes("MATCHED([])"));
assert.ok(r.transitionMd.includes("GPR_01_gamma_successor_unique"));
assert.ok(r.transitionMd.includes("sameGenerationReadOwnWrites"));
assert.ok(r.reductionMd.includes("(m₁∨m₂,O₁∪O₂)"));
assert.ok(r.reductionMd.includes("GPR_04_merge_commutative_observation"));
assert.ok(r.reductionMd.includes("GPR_04_local_no_match_cannot_publish_global_no_match"));
assert.ok(r.andMd.includes("RuleFF"));
assert.ok(r.andMd.includes("RuleFT"));
assert.ok(r.andMd.includes("RuleTF"));
assert.ok(r.andMd.includes("RuleTT"));
assert.ok(r.andMd.includes("AND(T,T)=T"));
assert.ok(r.andMd.includes("NO_MATCH"));
assert.ok(r.andMd.includes("GPR_07_grounded_zero_role_refinement"));
const doc=renderReaderW6(root);
assert.equal(doc.publication,"blocked");
for(const id of ["G01","G02","G03"])
 assert.equal(doc.mainText.split("### "+id+".").length-1,1,
  "one first-use scientific section "+id);
assert.ok(doc.mainText.indexOf("### G01.")>doc.mainText.indexOf("### L03."));
assert.ok(doc.mainText.indexOf("### G01.")<doc.mainText.indexOf("**7.1."));
assert.ok(doc.mainText.indexOf("### G02.")>doc.mainText.indexOf("### G01."));
assert.ok(doc.mainText.indexOf("### G03.")>doc.mainText.indexOf("### G02."));
assert.ok(doc.mainText.indexOf("### G03.")<doc.mainText.indexOf("### Пример на принятых источниках: AND"));
assert.equal(doc.mainIds.length,102);assert.equal(doc.annexIds.length,17);
assert.equal(doc.sourceFragments.size,119);
for(const atom of loadReaderG20(root).ordered)
 assert.equal(doc.sourceFragments.get(atom.id)?.join(""),atom.textRu,
   "original source atom changed "+atom.id);
assert.equal((doc.annexes.match(/^### R40-(?:06|07|09|10|11|12|13|14|15) /gm)??[]).length,9);
const bad=(a:string,b:string)=>parseReaderG01G03(raw.replace(a,b),root);
assert.throws(()=>bad("author_approval: not-recorded","author_approval: accepted"),/cannot accept/);
assert.throws(()=>bad("publication: blocked","publication: published"),/cannot accept/);
assert.throws(()=>bad("semantic_change: false","semantic_change: true"),/cannot accept/);
assert.throws(()=>bad("review_packages: [G01, G02, G03]","review_packages: [G03, G01, G02]"),/three scientific packages/);
assert.throws(()=>bad("scope: functional-gamma-fixed-state","scope: arbitrary-backend"),/proof domain mismatch/);
assert.throws(()=>bad("scope: matched-flag-plus-set-union","scope: ordered-exactsequence"),/proof domain mismatch/);
assert.throws(()=>bad("NO_MATCH_VS_MATCHED_EMPTY","NO_MATCH_EQUALS_MATCHED_EMPTY"),/twelve precise/);
assert.throws(()=>bad("GAMMA_FULL_PRODUCTION_REFINEMENT","GAMMA_PROVED_PRODUCTION"),/four unresolved/);
assert.throws(()=>bad("proofs/lean4/MtsV015GeneralizedReactionCore.lean",
 "proofs/coq/MtsV015GeneralizedReactionCore.v"),/source redirection/);
assert.throws(()=>parseReaderG01G03(raw+"\npublication: accepted\n",root),/malformed or duplicate YAML/);
console.log("G01/G02/G03: 11 scoped evidence, 12 negative gates; Gamma partition/AND source checked, 119 originals + 9 R40 intact.");
