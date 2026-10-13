import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {renderReaderW6} from "../src/tooling/mts-reader-r44-w6.js";
import {loadReaderG20} from "../src/tooling/mts-reader-g20.js";
import {loadReaderM06W2,parseReaderM06W2,REVIEW_M06_W2_PATH}
 from "../src/tooling/mts-reader-review-m06-w2.js";

const root=resolve(".."),original=readFileSync(resolve(root,REVIEW_M06_W2_PATH),"utf8");
const w=loadReaderM06W2(root);
assert.equal(w.publication,"blocked");
assert.deepEqual(w.entries.map(e=>e.id),["C-01","B-1.3","C-02","C-03"]);
assert.equal(w.entries.filter(e=>e.status==="OPEN").length,4);
assert.ok(w.archiveMd.includes("CI #38318851278"),"exact-head paired kernel assurance link missing");
assert.ok(w.archiveMd.includes("propext"),"model-only external axiom disclosure missing");
assert.ok(w.archiveMd.includes("M06_W2_two_distinct_implies_nat_injection"),
 "C-03 constructive Foundation result missing");
assert.ok(w.archiveMd.includes("все четыре научных вердикта OPEN") ||
 w.archiveMd.includes("Все четыре научных вердикта OPEN"),
 "no scientific acceptance escalation");
for(const s of ["badStart","badFinish","ExplicitGroundedNormalization","n²≤n","finite→singleton"])
 assert.ok(w.archiveMd.includes(s),"W2 output omitted "+s);
const reader=renderReaderW6(root);
assert.equal(reader.publication,"blocked");
for(const section of ["Приложение И.","Приложение К.","Приложение Л."])
 assert.equal(reader.annexes.split("## "+section).length-1,1);
assert.equal(reader.sourceFragments.size,119);
assert.equal(reader.mainIds.length,102);
assert.equal(reader.annexIds.length,17);
for(const a of loadReaderG20(root).ordered)
 assert.equal(reader.sourceFragments.get(a.id)?.join(""),a.textRu);
assert.equal((reader.annexes.match(/^### R40-(?:06|07|09|10|11|12|13|14|15) /gm)??[]).length,9);
const bad=(from:string,to:string)=>{
 assert.ok(original.includes(from),"missing mutation fixture "+from);
 return parseReaderM06W2(original.replace(from,to),root);
};
assert.throws(()=>bad("publication: blocked","publication: ready"),/authority escalation/);
assert.throws(()=>bad("author_approval: not-recorded","author_approval: accepted"),/authority escalation/);
assert.throws(()=>bad("scientific_verdict: OPEN","scientific_verdict: RESOLVED"),/authority escalation/);
assert.throws(()=>bad("scientific_status: OPEN","scientific_status: ACCEPTED"),/evidence\/status mismatch/);
assert.throws(()=>bad("owner: F02","owner: F01"),/evidence\/status mismatch/);
assert.throws(()=>bad("Принято ли также уравнение","Принято ли другое уравнение"),/verbatim PDF-derived question mismatch C-01/);
assert.throws(()=>bad("evidence_class: FINITE_CARDINALITY_CONSEQUENCE_OF_ACCEPTED_INJECTION","evidence_class: NEW_FINITE_THEOREM"),/evidence\/status mismatch/);
assert.throws(()=>bad("f283192148ef5381f02a0b23d50b9884cf10b0c0","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),/accepted evidence pin/);
assert.throws(()=>bad("M06_W2_KERNEL_RESULTS_REQUIRE_INDEPENDENT_SCIENTIFIC_REVIEW","M06_W2_ALL_QUESTIONS_SCIENTIFICALLY_CLOSED"),/six open scientific obligations/);
assert.throws(()=>bad("75433cb107048148cefe12630e59b4042f550dd3","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),/candidate proof pin/);
assert.throws(()=>bad("run_id: 38318851278","run_id: 123456"),/unverified kernel run/);
assert.throws(()=>bad("lean_model_axioms: [propext]","lean_model_axioms: []"),/four model-only Lean axiom scopes/);
assert.throws(()=>bad("lean_foundation_injection_axioms: []","lean_foundation_injection_axioms: [propext]"),/weak Foundation axiom-free/);
assert.throws(()=>bad("rocq_global_assumptions: []","rocq_global_assumptions: [custom_ax]"),/paired Rocq global assumptions/);
assert.throws(()=>bad("M06_W2_poles_nonextensional","M06_W2_UNVERIFIED_REPLACEMENT"),/exact reviewed Lean theorem set B-1.3/);
assert.throws(()=>parseReaderM06W2(original+"\npublication: released\n",root),/duplicate or invalid source YAML/);
console.log("M06-W2: 4 source-exact questions OPEN, 4 accepted+2 candidate proof pins, 5 paired verified kernel theorems, 4 model-only propext/1 zero Lean and 5 zero Rocq, 119 atoms, 9 R40; publication blocked.");
