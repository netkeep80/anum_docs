import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {renderReaderW6} from "../src/tooling/mts-reader-r44-w6.js";
import {loadReaderG20} from "../src/tooling/mts-reader-g20.js";
import {loadReaderP02P03,parseReaderP02P03,REVIEW_P02_P03_PATH}
 from "../src/tooling/mts-reader-review-p02-p03.js";
const root=resolve(".."),raw=readFileSync(resolve(root,REVIEW_P02_P03_PATH),"utf8");
const p=loadReaderP02P03(root);
assert.equal(p.publication,"blocked");
assert.equal(p.evidence.length,10);
assert.deepEqual(p.openObligations,["FRM07_FULL_PRODUCTION_REFINEMENT",
 "EXACT_SEQUENCE_UNIVERSAL_LEFT_INVERSE",
 "ALL_APPROVED_CORPUS_EXTENDED_REFINEMENT_SCOPE",
 "INDIVIDUAL_178_QUESTION_REVIEW_AND_AUTHOR_DECISION"]);
for(const s of ["FRM_07_approved_artifact_refinement",
 "FRM_07_exact_sequence_injective_from_left_inverse","156",
 "grounded-zero-role","two-role-meta-rule","APPROVED_ARTIFACTS"])
 assert.ok(p.refinementMd.includes(s),"P02 source/evidence detail "+s);
for(const s of ["Lean4 4.34.1","Rocq 9.2.0","178","119/119",
 "Docker","production","PDF"])
 assert.ok(p.reproducibilityMd.includes(s),"P03 reproduce "+s);
const book=renderReaderW6(root);
assert.equal(book.publication,"blocked");
assert.equal(book.mainText.split("### P02.").length-1,1);
assert.equal(book.mainText.split("### P03.").length-1,1);
assert.ok(book.mainText.indexOf("### P02.")>book.mainText.indexOf("### G03."));
assert.ok(book.mainText.indexOf("### P02.")<book.mainText.indexOf("**8.1."));
assert.ok(book.mainText.indexOf("### P03.")>book.mainText.indexOf("### P02."));
assert.ok(book.mainText.indexOf("### P03.")<book.mainText.indexOf("**8.1."));
assert.equal(book.mainIds.length,102);
assert.equal(book.annexIds.length,17);
assert.equal(book.sourceFragments.size,119);
for(const x of loadReaderG20(root).ordered)
 assert.equal(book.sourceFragments.get(x.id)?.join(""),x.textRu,
  "119/119 original source atoms must stay byte exact: "+x.id);
assert.equal((book.annexes.match(/^### R40-(?:06|07|09|10|11|12|13|14|15) /gm)??[]).length,9);
const bad=(a:string,b:string)=>parseReaderP02P03(raw.replace(a,b),root);
assert.throws(()=>bad("author_approval: not-recorded","author_approval: accepted"),/no scientific author/);
assert.throws(()=>bad("publication: blocked","publication: accepted"),/no scientific author/);
assert.throws(()=>bad("semantic_change: false","semantic_change: true"),/no scientific author/);
assert.throws(()=>bad("review_packages: [P02, P03]","review_packages: [P03, P02]"),/review package scope/);
assert.throws(()=>bad("scope: same-source-plus-recursive-left-inverse",
 "scope: unconditional-universal-correctness"),/individual theorem\/test scope drift/);
assert.throws(()=>bad("key: APPROVED_ARTIFACTS=2","key: APPROVED_ARTIFACTS=6"),/individual theorem\/test scope drift/);
assert.throws(()=>bad("FRM07_NOT_TYPESCRIPT_PROOF","FRM07_IS_TYPESCRIPT_PROOF"),/twelve invalid/);
assert.throws(()=>bad("FRM07_FULL_PRODUCTION_REFINEMENT","FRM07_FORMALLY_DISCHARGED"),/four unresolved/);
assert.throws(()=>bad("proofs/lean4/MtsV015Formal.lean",
 "proofs/coq/MtsV015Formal.v"),/source redirect/);
assert.throws(()=>parseReaderP02P03(raw+"\npublication: accepted\n",root),/malformed\/duplicate YAML/);
console.log("P02/P03: 10 exact-scope source/proof crosswalk; 12 negative guards; 119 source atoms, 9 OPEN R40 unchanged.");
