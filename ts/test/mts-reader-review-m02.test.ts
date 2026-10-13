import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {renderReaderW6} from "../src/tooling/mts-reader-r44-w6.js";
import {loadReaderG20} from "../src/tooling/mts-reader-g20.js";
import {loadReaderM02,parseReaderM02,REVIEW_M02_PATH}
 from "../src/tooling/mts-reader-review-m02.js";
const root=resolve(".."),raw=readFileSync(resolve(root,REVIEW_M02_PATH),"utf8");
const m=loadReaderM02(root);
assert.equal(m.publication,"blocked");
assert.equal(m.evidence.length,10);
assert.deepEqual(m.openObligations,["M02_FULL_GAMMA_TRANSITION_EXECUTABLE_WITNESS",
 "M02_FORMAL_TO_GAMMA_PRODUCTION_REFINEMENT",
 "M02_EXACTSEQUENCE_UNIVERSAL_CODEC_PROOF",
 "M02_INDEPENDENT_MATH_REVIEW_AND_AUTHOR_ACCEPT"]);
for(const token of ["O=♂∞","C=∞♀","L=form(O,C)","U=form(C,O)",
 "AND_SEED=form(R,L)","ArgsTT","ImageT","RuleTT",
 "Theory->RuleTT","compileV015DirectFormalSourceAnet",
 "NO_MATCH","reactGeneric","Mₜ₊₁={T}","GPR_01_gamma_successor_unique"])
 assert.ok(m.walkthroughMd.includes(token),"missing M02 full pathway "+token);
const reader=renderReaderW6(root);
assert.equal(reader.publication,"blocked");
assert.equal(reader.mainText.split("### M02.").length-1,1);
assert.ok(reader.mainText.indexOf("### M02.")>reader.mainText.indexOf("### M01."));
assert.ok(reader.mainText.indexOf("### M02.")<reader.mainText.indexOf("**8.1."));
assert.equal(reader.sourceFragments.size,119);
assert.equal(reader.mainIds.length,102);
assert.equal(reader.annexIds.length,17);
for(const atom of loadReaderG20(root).ordered)
 assert.equal(reader.sourceFragments.get(atom.id)?.join(""),atom.textRu,
  "unchanged source atom "+atom.id);
assert.equal((reader.annexes.match(/^### R40-(?:06|07|09|10|11|12|13|14|15) /gm)??[]).length,9);
const mutate=(a:string,b:string)=>parseReaderM02(raw.replace(a,b),root);
assert.throws(()=>mutate("author_approval: not-recorded","author_approval: accepted"),/cannot acquire author acceptance/);
assert.throws(()=>mutate("publication: blocked","publication: accepted"),/cannot acquire author acceptance/);
assert.throws(()=>mutate("semantic_change: false","semantic_change: true"),/cannot acquire author acceptance/);
assert.throws(()=>mutate("review_packages: [M02]","review_packages: [M03]"),/exact M02 package/);
assert.throws(()=>mutate("scope: four-local-matcher-rows",
 "scope: full-atomic-production-gamma"),/individual evidence drift/);
assert.throws(()=>mutate("json_sha256: cf5028",
 "json_sha256: 000000"),/canonical digest drift/);
assert.throws(()=>mutate("A1_MATCHER_NOT_PRODUCTION_GAMMA",
 "A1_MATCHER_PROVES_GAMMA"),/10 explicit false inference/);
assert.throws(()=>mutate("M02_FULL_GAMMA_TRANSITION_EXECUTABLE_WITNESS",
 "GAMMA_FULLY_VERIFIED"),/four open production/);
assert.throws(()=>parseReaderM02(raw+"\npublication: accepted\n",root),/malformed\/duplicate YAML/);
console.log("M02: 10 step-by-step grounded sources, 10 negative inferential boundaries, 4 open proof/refinement gates, 119 original atoms unchanged.");
