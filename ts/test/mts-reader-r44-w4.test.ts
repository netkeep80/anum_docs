import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderReaderR44W3Preview } from "../src/tooling/mts-reader-r44-w3.js";
import { R44_W4_PATH,loadReaderR44W4,parseR44W4,renderReaderR44W4Preview } from "../src/tooling/mts-reader-r44-w4.js";
const root=resolve("..");
const source=readFileSync(resolve(root,R44_W4_PATH),"utf8");
const plan=loadReaderR44W4(root),before=renderReaderR44W3Preview(root),after=renderReaderR44W4Preview(root);
assert.equal(plan.publication,"blocked");
assert.equal(plan.overlaps.length,5);
assert.equal(plan.chapters.length,10);
assert.equal(plan.proofs.length,8);
assert.equal((after.match(/^## /gm)??[]).length,(before.match(/^## /gm)??[]).length+3);
assert.equal((after.match(/^\*\*(?:g4:|g7:|g8:|g10:|g11:|basis:|concept:|editorial:)/gm)??[]).length,119);
assert.equal((after.match(/^\*\*V15-[A-Z0-9-]+\*\* · /gm)??[]).length,48);
assert.equal((after.match(/^\*\*FRM-0[1-8] · точная область доказательства\*\*/gm)??[]).length,8);
for(const p of plan.overlaps){
  assert.ok(after.includes("**"+p.id+" · "+p.source+" → "+p.explanation+"**"));
  assert.ok(after.includes("**"+p.source+"**")&&after.includes("**"+p.explanation+"**"));
  assert.equal(after.split(p.reading).length,2);
}
for(const ch of plan.chapters){
  assert.equal(after.split(ch.reading).length,2);
  assert.equal(after.split(ch.limit).length,2);
}
for(const p of plan.proofs){
  assert.equal(after.split(p.reading).length,2);
  assert.equal(after.split(p.limit).length,2);
  assert.ok(after.includes(p.classification));
  for(const symbol of [...p.lean4,...p.rocq])assert.ok(after.includes(symbol));
}
assert.ok(after.startsWith("# "+plan.title));
assert.ok(after.includes("## Аннотация"));
assert.ok(after.includes("## Принципы чтения и статусы утверждений"));
assert.ok(after.includes("Исторические изображения:"));
assert.ok(after.includes("ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА"));
assert.ok(!after.includes("ПУБЛИКАЦИЯ РАЗРЕШЕНА"));
const parse=(x:string)=>parseR44W4(x,root);
assert.throws(()=>parse(source.replace("author_approval: not-recorded","author_approval: recorded")),/no self-approval/);
assert.throws(()=>parse(source.replace("publication: blocked","publication: ready")),/no self-approval/);
assert.throws(()=>parse(source.replace("source_atoms_preserved: 119","source_atoms_preserved: 118")),/author gate/);
assert.throws(()=>parse(source.replace('proof_atom: "g4:foundation"','proof_atom: "g4:context-roles"')),/five original overlaps/);
assert.throws(()=>parse(source.replace("retained: true","retained: false")),/five original overlaps/);
assert.throws(()=>parse(source.replace("  - id: FRM-05","  - id: FRM-04")),/FRM catalogue identity/);
assert.throws(()=>parse(source.replace("accepted_main_sha: c64b7e2","accepted_main_sha: 00000000")),/no self-approval/);
assert.throws(()=>parse(source+"\npublication: ready\n"),/malformed\/duplicate YAML/);
console.log("R44-W4: 10 chapter transitions, 5 G4/G16 overlaps, 8 source-scoped FRM witnesses, Russian edition metadata, retained 119 source atoms and 48 reviews; publication blocked.");
