import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadReaderG42, renderReaderG42Preview } from "../src/tooling/mts-reader-g42.js";
import { loadReaderG41 } from "../src/tooling/mts-reader-g20.js";
import { loadReaderR42 } from "../src/tooling/mts-reader-r42.js";
import { READER_R43_PATH, loadReaderR43, parseReaderR43, renderReaderR43Preview } from "../src/tooling/mts-reader-r43.js";
const root=resolve(".."),raw=readFileSync(resolve(root,READER_R43_PATH),"utf8");
const m=loadReaderR43(root),g41=loadReaderG41(root),g42=loadReaderG42(root),r42=loadReaderR42(root);
const before=renderReaderG42Preview(root),after=renderReaderR43Preview(root);
assert.equal(m.publication,"blocked");
assert.equal((after.match(/^\*\*(?:g4:|g7:|g8:|g10:|g11:|basis:|concept:|editorial:)/gm)??[]).length,119);
assert.equal((after.match(/^## /gm)??[]).length,(before.match(/^## /gm)??[]).length);
for(const id of g42.order) assert.ok(after.includes("**"+id+"**"));
assert.ok(after.includes("### "+m.q.heading));
assert.ok(after.indexOf("### "+m.q.heading)<after.indexOf("**g7:recursive-codec**"));
assert.equal(after.split(g41.earlyQ.exactSourceOpeningRu).length,
  before.split(g41.earlyQ.exactSourceOpeningRu).length);
for(const src of g41.deferred){
  const row=m.basis.find(x=>x.symbol===src.symbol)!;
  assert.ok(after.includes("### "+row.heading));
  assert.equal(after.split(src.sourceExplanationRu).length,2);
  assert.ok(after.indexOf("**"+src.afterNode+"**")<after.indexOf("### "+row.heading));
}
for(const p of g42.proofCases){
  assert.ok(after.includes("**"+p.id+" — "+p.classification+"**"));
  for(const name of [...p.lean4,...p.rocq]) assert.ok(after.includes(name));
}
assert.ok(after.includes("MtsV015Formal.lean"));
assert.ok(after.includes("proofs/coq/MtsV015Formal.v"));
for(const row of r42.truth)assert.ok(after.includes("| "+row.case+" | "+row.rule+" | "+row.image+" |"));
for(const value of r42.sequenceObservations)assert.ok(after.includes(value));
assert.ok(after.includes("публикация".toUpperCase().slice(0,4))||after.includes("ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА"));
assert.ok(after.includes("не предъявлен и поэтому не утверждается"));
const p=(value:string)=>parseReaderR43(value,root);
assert.throws(()=>p(raw.replace("author_approval: not-recorded","author_approval: recorded")),/no implicit approval/);
assert.throws(()=>p(raw.replace("publication: blocked","publication: published")),/no implicit approval/);
assert.throws(()=>p(raw.replace("source_atom: g7:q-codec","source_atom: g7:exact-sequence")),/source owner drift/);
assert.throws(()=>p(raw.replace("main_source_sha: c64b7e2","main_source_sha: 00000000")),/moving accepted main/);
assert.throws(()=>p(raw.replace("proofs/lean4/MtsV015Formal.lean","proofs/lean4/MtsFoundation.lean")),/proof source and theorem identity/);
assert.throws(()=>p(raw.replace("open_findings: [R40-06","open_findings: [R40-01")),/cannot promote R40/);
assert.throws(()=>p(raw.replace("json: formal/v0.15/regression/compact-and.json","json: formal/v0.15/regression/new.json")),/new executable artifact/);
assert.throws(()=>p(raw+"\npublication: published\n"),/malformed\/duplicate YAML/);
console.log("R43: academic first-use Q/L/U attribution, exact 119 atoms, paired theorem source locators, witnessed AND/ExactSequence, blocked publication.");
