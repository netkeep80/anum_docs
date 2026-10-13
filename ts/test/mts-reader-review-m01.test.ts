import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {renderReaderW6} from "../src/tooling/mts-reader-r44-w6.js";
import {loadReaderG20} from "../src/tooling/mts-reader-g20.js";
import {loadReaderM01,parseReaderM01,REVIEW_M01_PATH}
 from "../src/tooling/mts-reader-review-m01.js";
const root=resolve(".."),raw=readFileSync(resolve(root,REVIEW_M01_PATH),"utf8");
const v=loadReaderM01(root);
assert.equal(v.publication,"blocked");
assert.equal(v.evidence.length,6);
assert.deepEqual(v.openObligations,["PRECISE_CATEGORY_OF_MTS_MODELS",
 "COMPARATOR_FUNCTOR_AND_PRESERVATION","ISOMORPHISM_OR_INVARIANT_COUNTERMODEL",
 "INDEPENDENT_LITERATURE_AND_NOVELTY_REVIEW"]);
for(const x of ["n²≤n","form(R,R)=R","badStart","Grounded",
 "fnd13_form_injective","explicit_a1","GPR_01_gamma_successor_unique",
 "FREE_MAGMA_NOT_EQUAL_FOUNDATION","FINITE_SINGLETON_FOUNDATION_POSSIBLE",
 "https://plato.stanford.edu/entries/nonwellfounded-set-theory/"])
 assert.ok(v.noveltyMd.includes(x),"M01 scientific validation "+x);
const doc=renderReaderW6(root);
assert.equal(doc.publication,"blocked");
assert.equal(doc.mainText.split("### M01.").length-1,1);
assert.ok(doc.mainText.indexOf("### M01.")>doc.mainText.indexOf("### P03."));
assert.ok(doc.mainText.indexOf("### M01.")<doc.mainText.indexOf("**8.1."));
assert.equal(doc.mainIds.length,102);
assert.equal(doc.annexIds.length,17);
assert.equal(doc.sourceFragments.size,119);
for(const atom of loadReaderG20(root).ordered)
 assert.equal(doc.sourceFragments.get(atom.id)?.join(""),atom.textRu,
  "unchanged source atom "+atom.id);
assert.equal((doc.annexes.match(/^### R40-(?:06|07|09|10|11|12|13|14|15) /gm)??[]).length,9);
const bad=(a:string,b:string)=>parseReaderM01(raw.replace(a,b),root);
assert.throws(()=>bad("author_approval: not-recorded","author_approval: approved"),/mathematical originality/);
assert.throws(()=>bad("publication: blocked","publication: published"),/mathematical originality/);
assert.throws(()=>bad("semantic_change: false","semantic_change: true"),/mathematical originality/);
assert.throws(()=>bad("review_packages: [M01]","review_packages: [M02]"),/exact package M01/);
assert.throws(()=>bad("scope: constructor-injectivity-only","scope: all-pole-extensionality"),/exact proof scope drift/);
assert.throws(()=>bad("nonclaim: sharing-and-rewriting-not-intrinsically-new",
 "nonclaim: first-ever-sharing-and-rewriting"),/mathematical comparator changed/);
assert.throws(()=>bad("FORMAL_MODEL_NOT_PRODUCTION_PROOF","FORMAL_MODEL_IS_PRODUCTION_PROOF"),/ten documented negative/);
assert.throws(()=>bad("ISOMORPHISM_OR_INVARIANT_COUNTERMODEL","MTS_ALREADY_PROVEN_UNIQUE"),/four unsettled/);
assert.throws(()=>parseReaderM01(raw+"\npublication: accepted\n",root),/malformed\/duplicate YAML/);
console.log("M01: 4 externally documented comparators, 6 paired exact-scope sources; 10 negative guards, 4 open research tasks; 119 original atoms preserved.");
