import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {renderReaderR44W4Preview} from "../src/tooling/mts-reader-r44-w4.js";
import {R44_W5_PATH,loadReaderR44W5,parseR44W5,renderReaderR44W5Preview} from "../src/tooling/mts-reader-r44-w5.js";
const root=resolve(".."),source=readFileSync(resolve(root,R44_W5_PATH),"utf8");
const w=loadReaderR44W5(root),prev=renderReaderR44W4Preview(root),txt=renderReaderR44W5Preview(root);
assert.equal(w.publication,"blocked");
assert.equal(w.cases.length,9);
assert.deepEqual(w.cases.map(x=>x.id),
 ["R40-06","R40-07","R40-09","R40-10","R40-11","R40-12","R40-13","R40-14","R40-15"]);
assert.deepEqual(w.stack.map(x=>x.pr),[2138,2153,2164,2173]);
assert.equal(w.stack.reduce((s,x)=>s+x.commits,0),158);
assert.equal((txt.match(/^## /gm)??[]).length,(prev.match(/^## /gm)??[]).length+2);
assert.equal((txt.match(/^\*\*(?:g4:|g7:|g8:|g10:|g11:|basis:|concept:|editorial:)/gm)??[]).length,119);
assert.equal((txt.match(/^\*\*V15-[A-Z0-9-]+\*\* · /gm)??[]).length,48);
assert.equal((txt.match(/^\*\*FRM-0[1-8] · точная область доказательства\*\*/gm)??[]).length,8);
for(const c of w.cases){
 assert.ok(txt.includes("### "+c.id+" — "+c.title));
 assert.equal(txt.split(c.assessment).length-1,1);
 assert.equal(txt.split(c.gap).length-1,1);
}
assert.ok(txt.includes("#2138 → #2153 → #2164 → #2173"));
assert.ok(txt.includes("не SKIPPED"));
assert.ok(txt.includes("ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА"));
const parse=(s:string)=>parseR44W5(s,root);
assert.throws(()=>parse(source.replace("author_approval: not-recorded","author_approval: recorded")),/cannot self-approve/);
assert.throws(()=>parse(source.replace("publication: blocked","publication: ready")),/cannot self-approve/);
assert.throws(()=>parse(source.replace("original_status: open","original_status: closed")),/R40 original authority/);
assert.throws(()=>parse(source.replace('source_atom: "renderReaderG20Preview"','source_atom: "g4:foundation"')),/R40 original authority/);
assert.throws(()=>parse(source.replace("commits: 79","commits: 80")),/exact contiguous/);
assert.throws(()=>parse(source.replace("branch_hygiene_pr: 2157","branch_hygiene_pr: 2173")),/snapshot cannot authorize/);
assert.throws(()=>parse(source.replace("source_atoms: 119","source_atoms: 118")),/scientific publication/);
assert.throws(()=>parse(source.replace("remaining_open: [R40-06","remaining_open: [R40-09")),/scientific publication/);
assert.throws(()=>parse(source+"\npublication: ready\n"),/malformed or duplicate YAML/);
console.log("R44-W5: 9 original open R40 items, exact 4-PR checkpoint, 119/48/8 evidence preservation, no merge authorization.");
