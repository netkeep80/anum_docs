import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { READER_G42_PATH, loadReaderG42, parseReaderG42, renderReaderG42Preview } from "../src/tooling/mts-reader-g42.js";
import { loadReaderG20, loadReaderG41 } from "../src/tooling/mts-reader-g20.js";

const root=resolve("..");
const original=readFileSync(resolve(root,READER_G42_PATH),"utf8");
const plan=loadReaderG42(root),draft=loadReaderG20(root),g41=loadReaderG41(root);
assert.equal(plan.chapters.length,10);
assert.equal(plan.order.length,119);
assert.equal(new Set(plan.order).size,119);
assert.deepEqual(new Set(plan.order),new Set(draft.ordered.map(n=>n.id)));
assert.deepEqual(plan.findings.corrected,["R40-05"]);
assert.equal(plan.findings.mitigated.length,5);
assert.equal(plan.findings.open.length,9);
assert.equal(g41.publication,"blocked");
assert.deepEqual(plan.proofCases.map(p=>p.id),["FRM-03","FRM-04","FRM-07"]);
assert.equal(plan.proofCases[1]!.classification,"PROVED_UNDER_EXACT_SEQUENCE_INJECTIVITY");
assert.ok(plan.proofCases[1]!.exclusions.some(x=>x.includes("production ExactSequence encoder")));
assert.ok(plan.proofCases[2]!.premises.length===3);
const preview=renderReaderG42Preview(root);
assert.equal((preview.match(/^\*\*(?:g4:|g7:|g8:|g10:|g11:|basis:|concept:|editorial:)/gm)??[]).length,119);
assert.equal((preview.match(/^## (?!Редакционные ограничения)/gm)??[]).length,10);
assert.ok(preview.includes("ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА"));
assert.ok(preview.includes("### Точные внешние доказательные свидетельства"));
assert.ok(preview.includes("FRM-04 — PROVED_UNDER_EXACT_SEQUENCE_INJECTIVITY"));
assert.ok(preview.indexOf("#### Первое определение Q") <
  preview.indexOf("**g7:recursive-codec**"));
for(const basis of g41.deferred) {
  assert.equal(preview.split(basis.sourceExplanationRu).length-1,1,
    "G42 lost or duplicated deferred "+basis.symbol+" original explanation");
}
for(const id of draft.ordered.map(n=>n.id)) assert.ok(preview.includes("**"+id+"**"));
const p=(text:string)=>parseReaderG42(text,root);
assert.throws(()=>p(original.replace("publication: blocked","publication: ready")),/cannot upgrade/);
assert.throws(()=>p(original.replace("author_approval: not-recorded","author_approval: approved")),/cannot upgrade/);
assert.throws(()=>p(original.replace("status: proposed","status: accepted")),/cannot upgrade/);
assert.throws(()=>p(original.replace("  atoms: 119","  atoms: 118")),/source coverage drift/);
assert.throws(()=>p(original.replace("dispositions: [proof-evidence]","dispositions: [governance-appendix]")),/repeated disposition|lost reviewed source atoms/);
assert.throws(()=>p(original.replace("positions: [1, 11]","positions: [1, 10]")),/lost reviewed source atoms/);
assert.throws(()=>p(original.replace("already_corrected: [R40-05]","already_corrected: [R40-14]")),/R40 findings not independently tracked/);
assert.throws(()=>p(original+"publication: ready\n"),/malformed\/duplicate YAML/);
console.log("G42: 119 source-owned paragraphs, ten distinct academic chapters, R40 15 findings, exact FRM-03/04/07 premises/exclusions, fail-closed approval and no accepted semantics.");
