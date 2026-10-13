import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {renderReaderW6} from "../src/tooling/mts-reader-r44-w6.js";
import {loadReaderG20} from "../src/tooling/mts-reader-g20.js";
import {loadReaderM06W3,parseReaderM06W3,REVIEW_M06_W3_PATH}
 from "../src/tooling/mts-reader-review-m06-w3.js";
const root=resolve(".."),source=readFileSync(resolve(root,REVIEW_M06_W3_PATH),"utf8");
const w=loadReaderM06W3(root);
assert.equal(w.publication,"blocked");
assert.deepEqual(w.entries.map(x=>x.id),["B-1.1","B-1.2","B-1.5","B-1.6","B-1.9","B-1.10"]);
assert.equal(w.entries.filter(x=>x.status==="OPEN").length,6);
for(const text of ["LocalSelfDecision","propext","F03_basis_five_pairwise_distinct",
 "F2F3OneSidedExistence","fnd13_form_injective","M06_W2_joint_model_witness"])
 assert.ok(w.archiveMd.includes(text),"missing evidence in generated manuscript: "+text);
const reader=renderReaderW6(root);
assert.equal(reader.publication,"blocked");
for(const label of ["Приложение И.","Приложение К.","Приложение Л.","Приложение М."])
 assert.equal(reader.annexes.split("## "+label).length-1,1,"must have exactly one "+label);
assert.equal(reader.sourceFragments.size,119);
assert.equal(reader.mainIds.length,102);
assert.equal(reader.annexIds.length,17);
for(const a of loadReaderG20(root).ordered)
 assert.equal(reader.sourceFragments.get(a.id)?.join(""),a.textRu);
assert.equal((reader.annexes.match(/^### R40-(?:06|07|09|10|11|12|13|14|15) /gm)??[]).length,9);
const bad=(from:string,to:string)=>{
 assert.ok(source.includes(from),"fixture absent "+from);
 return parseReaderM06W3(source.replace(from,to),root);
};
assert.throws(()=>bad("publication: blocked","publication: published"),/authority escalation/);
assert.throws(()=>bad("author_approval: not-recorded","author_approval: approved"),/authority escalation/);
assert.throws(()=>bad("question_status: OPEN","question_status: CLOSED"),/authority escalation/);
assert.throws(()=>bad("scientific_status: OPEN","scientific_status: ACCEPTED"),/owner\/grade\/status/);
assert.throws(()=>bad("owner: F05","owner: F01"),/owner\/grade\/status/);
assert.throws(()=>bad("Правильно ли я понимаю Foundation","Правильно ли мы понимаем Foundation"),/verbatim PDF-derived question mismatch/);
assert.throws(()=>bad("reviewer_b_transcript_blob: 80fa8d078da9647030d323e12c96d8c50e849309",
 "reviewer_b_transcript_blob: 0000000000000000000000000000000000000000"),/page extraction pin/);
assert.throws(()=>bad("lean_five_distinct: 2f64125d74ff7779893854a75479380b2df8049c",
 "lean_five_distinct: 0000000000000000000000000000000000000000"),/exact proof SHA/);
assert.throws(()=>bad("rocq_m06_w2: f9e45f6d5808258e64b4c84450e70b011c4a208a",
 "rocq_m06_w2: 0000000000000000000000000000000000000000"),/exact proof SHA/);
assert.throws(()=>bad("five_distinct_ci: 38318851278","five_distinct_ci: 123"),/kernel evidence run/);
assert.throws(()=>bad("weak_foundation_no_classical_axiom: true",
 "weak_foundation_no_classical_axiom: false"),/logical boundary/);
assert.throws(()=>bad("M06_W3_ALL_LATER_INTERFACES_NOT_JOINTLY_CERTIFIED",
 "M06_W3_ALL_LATER_INTERFACES_ACCEPTED"),/open obligations/);
assert.throws(()=>parseReaderM06W3(source+"\npublication: released\n",root),/duplicate YAML/);
console.log("M06-W3: 6 independently OPEN source-transcribed reviewer B cases, 1 pinned B text and 8 exact proof sources, 119/119 original Russian atoms, 9 R40, blocked publication.");
