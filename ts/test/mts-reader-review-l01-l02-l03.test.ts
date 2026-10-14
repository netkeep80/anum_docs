import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {renderReaderW6} from "../src/tooling/mts-reader-r44-w6.js";
import {loadReaderG20} from "../src/tooling/mts-reader-g20.js";
import {loadReaderL01L03,parseReaderL01L03,REVIEW_L01_L03_PATH}
 from "../src/tooling/mts-reader-review-l01-l02-l03.js";
const root=resolve(".."),raw=readFileSync(resolve(root,REVIEW_L01_L03_PATH),"utf8");
const science=loadReaderL01L03(root);
assert.equal(science.publication,"blocked");
assert.equal(science.evidence.length,14);
assert.deepEqual(science.openObligations,[
 "FRM03_GENERAL_N_INDUCTION_PAIR","UNIVERSAL_GRAMMAR_CYCLIC_NAME_BOUNDARY",
 "GLOBAL_FORMAL_JSON_COMPILER_REFINEMENT","GAMMA_END_TO_END_PRODUCTION_REFINEMENT"]);
assert.ok(science.formalMd.includes("n≥1"));
assert.ok(science.formalMd.includes("FRM_03_direct_sequential_association_three"));
assert.ok(science.formalMd.includes("empty-semantic-source-order"));
assert.ok(science.formalMd.includes("L/U"));
assert.ok(science.dasMd.includes("compileV015DirectSourceEntries"));
assert.ok(science.dasMd.includes("FRM_07_approved_artifact_refinement"));
assert.ok(science.dasMd.includes("JSON.parse"));
assert.ok(science.executionMd.includes("NO_MATCH"));
assert.ok(science.executionMd.includes("ExactSequence([])"));
assert.ok(science.executionMd.includes("GPR_03_analysis_ignores_staged_candidate"));
assert.ok(science.executionMd.includes("J1"));
const doc=renderReaderW6(root);
assert.equal(doc.publication,"blocked");
for(const id of ["L01","L02","L03"])
 assert.equal(doc.mainText.split("### "+id+".").length-1,1,"one first-use scientific section "+id);
assert.ok(doc.mainText.indexOf("### L01.")>doc.mainText.indexOf("### R03."));
assert.ok(doc.mainText.indexOf("### L01.")>doc.mainText.indexOf("**3.12."));
assert.ok(doc.mainText.indexOf("### L02.")>doc.mainText.indexOf("### L01."));
assert.ok(doc.mainText.indexOf("### L02.")<doc.mainText.indexOf("## 4. "));
assert.ok(doc.mainText.indexOf("### L03.")>doc.mainText.indexOf("### R04."));
assert.ok(doc.mainText.indexOf("### L03.")<doc.mainText.indexOf("**7.1."));
assert.equal(doc.mainIds.length,102);assert.equal(doc.annexIds.length,17);
assert.equal(doc.sourceFragments.size,119);
for(const atom of loadReaderG20(root).ordered)
 assert.equal(doc.sourceFragments.get(atom.id)?.join(""),atom.textRu,"unaltered accepted Russian atom "+atom.id);
assert.equal((doc.annexes.match(/^### R40-(?:06|07|09|10|11|12|13|14|15) /gm)??[]).length,9);
assert.ok(doc.mainText.includes("NO_MATCH"));
assert.ok(doc.markdown.includes("ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА"));
const edit=(a:string,b:string)=>parseReaderL01L03(raw.replace(a,b),root);
assert.throws(()=>edit("author_approval: not-recorded","author_approval: accepted"),/scientific authority/);
assert.throws(()=>edit("publication: blocked","publication: ready"),/scientific authority/);
assert.throws(()=>edit("semantic_change: false","semantic_change: true"),/scientific authority/);
assert.throws(()=>edit("review_packages: [L01, L02, L03]","review_packages: [L03, L01, L02]"),/three reviewer packages/);
assert.throws(()=>edit("scope: three-terms-only","scope: all-finite-lists"),/exact symbol\/scope/);
assert.throws(()=>edit("key: FRM_07_approved_artifact_refinement","key: FRM_01_absolute_contextual_name"),/exact symbol\/scope/);
assert.throws(()=>edit("scope: accepted-one-command-J0-S1-S2","scope: separate-MP-command"),/exact symbol\/scope/);
assert.throws(()=>edit("NO_READ_OWN_WRITES","READ_OWN_WRITES_ALLOWED"),/14 individualized/);
assert.throws(()=>edit("FRM03_GENERAL_N_INDUCTION_PAIR","FRM03_PROVED_UNCONDITIONAL"),/four still open/);
assert.throws(()=>edit("proofs/lean4/MtsV015Formal.lean","proofs/coq/MtsV015Formal.v"),/source redirection/);
assert.throws(()=>parseReaderL01L03(raw+"\npublication: accepted\n",root),/malformed or duplicate YAML/);
console.log("L01/L02/L03: 14 exact proof/source scopes, 14 mutation boundaries; formal/JSON/DAS/J0-S1-S2 separated; 119/119 original atoms and 9 R40 open.");
