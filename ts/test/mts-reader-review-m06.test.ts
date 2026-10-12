import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {loadReaderG20} from "../src/tooling/mts-reader-g20.js";
import {renderReaderW6} from "../src/tooling/mts-reader-r44-w6.js";
import {loadReaderM06,parseReaderM06,REVIEW_M06_PATH}
 from "../src/tooling/mts-reader-review-m06.js";

const root=resolve(".."),original=readFileSync(resolve(root,REVIEW_M06_PATH),"utf8");
const m=loadReaderM06(root);
assert.equal(m.publication,"blocked");
assert.equal(m.indexed,140);
assert.equal(m.unrecovered,38);
assert.equal(m.entries.length,178);
assert.equal(new Set(m.entries.map(x=>x.id)).size,178);
assert.equal(m.openObligations.length,5);
const grouped=Object.fromEntries(["A","B","C"].map(x=>
 [x,m.entries.filter(r=>r.reviewer===x).length]));
assert.deepEqual(grouped,{A:38,B:97,C:43});
assert.equal(m.entries.filter(x=>x.status==="SOURCE_RECOVERY_REQUIRED").length,38);
assert.equal(m.entries.filter(x=>x.status==="PDF_INDEXED_EXTRACTION").length,140);
assert.equal(m.entries.filter(x=>x.scientificStatus==="OPEN").length,178);
assert.equal(new Set(m.entries.map(x=>x.owner)).size,24);
for(const entry of m.entries){
 assert.equal((m.archiveMd.match(new RegExp("^\\| "+entry.id.replace(".","\\.")+" \\|","gm"))||[]).length,1);
 if(entry.reviewer!=="A"){
  assert.ok(entry.page!==null&&entry.line!==null);
  assert.ok(entry.anchor&&entry.anchor.length>6);
  assert.ok(m.archiveMd.includes(entry.id));
 }else{
  assert.equal(entry.page,null);
  assert.equal(entry.anchor,null);
 }
}
const r=renderReaderW6(root);
assert.equal(r.publication,"blocked");
assert.equal(r.annexes.split("## Приложение И.").length-1,1);
assert.equal(r.mainText.includes("## Приложение И."),false);
assert.equal(r.sourceFragments.size,119);
assert.equal(r.mainIds.length,102);
assert.equal(r.annexIds.length,17);
for(const atom of loadReaderG20(root).ordered)
 assert.equal(r.sourceFragments.get(atom.id)?.join(""),atom.textRu);
assert.equal((r.annexes.match(/^### R40-(?:06|07|09|10|11|12|13|14|15) /gm)??[]).length,9);
function mutation(a:string,b:string){
 assert.ok(original.includes(a),"M06 fixture missing "+a);
 return parseReaderM06(original.replace(a,b),root);
}
assert.throws(()=>mutation("publication: blocked","publication: ready"),
 /authority escalation/);
assert.throws(()=>mutation("author_approval: not-recorded","author_approval: accepted"),
 /authority escalation/);
assert.throws(()=>mutation("classification: UNREVIEWED","classification: PROVED"),
 /authority escalation/);
assert.throws(()=>mutation("question_verdict: OPEN","question_verdict: RESOLVED"),
 /authority escalation/);
assert.throws(()=>mutation("claims_of_scientific_resolution: 0","claims_of_scientific_resolution: 178"),
 /authority escalation/);
assert.throws(()=>mutation("A: CHAT_ORIGINAL_FULL_TEXT_NOT_RECOVERED",
 "A: FULL_ORIGINAL_AVAILABLE"),/source recovery cannot be fabricated/);
assert.throws(()=>mutation("source_status: SOURCE_RECOVERY_REQUIRED",
 "source_status: PDF_INDEXED_EXTRACTION"),/A must retain explicit source recovery gap/);
assert.throws(()=>mutation("scientific_status: OPEN","scientific_status: RESOLVED"),
 /unsupported question-level scientific acceptance/);
assert.throws(()=>mutation("git_blob_sha1: 80fa8d078da9647030d323e12c96d8c50e849309",
 "git_blob_sha1: 0000000000000000000000000000000000000000"),
 /original PDF source metadata drift/);
assert.throws(()=>mutation("id: \"B-1.1\"","id: \"B-1.2\""),
 /question ID duplication or owner ID forgery/);
assert.throws(()=>mutation("first_line_ru:","first_line_ru_bogus:"),
 /question exact fields/);
assert.throws(()=>parseReaderM06(original+"\npublication: ready\n",root),
 /invalid or duplicate YAML/);
console.log("M06: 178 unique review source slots, 140 PDF heading anchors, "+
 "38 unrecovered chat originals, 26 work packages, 9 R40 open, 119 science atoms intact.");
