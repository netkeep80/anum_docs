import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {loadReaderG20,loadReaderG41} from "../src/tooling/mts-reader-g20.js";
import {loadReaderG42} from "../src/tooling/mts-reader-g42.js";
import {loadReaderR44W3} from "../src/tooling/mts-reader-r44-w3.js";
import {READER_W6_PATH,parseReaderW6Model,renderReaderW6} from "../src/tooling/mts-reader-r44-w6.js";
const root=resolve(".."),source=readFileSync(resolve(root,READER_W6_PATH),"utf8");
const document=renderReaderW6(root),g20=loadReaderG20(root),g41=loadReaderG41(root),
 g42=loadReaderG42(root),w3=loadReaderR44W3(root);
assert.equal(document.publication,"blocked");
assert.equal(document.mainIds.length,102);
assert.equal(document.annexIds.length,17);
assert.equal(document.sourceFragments.size,119);
assert.equal(new Set([...document.mainIds,...document.annexIds]).size,119);
assert.equal(document.annexIds.filter(x=>x.startsWith("editorial:")).length,5);
assert.equal(document.annexIds.filter(x=>x.startsWith("g11:")).length,12);
for(const node of g20.ordered){
 assert.equal(document.sourceFragments.get(node.id)?.join(""),node.textRu,
  "exact source text differs: "+node.id);
 const combined=document.mainText+"\n"+document.annexes;
 if(["g7:q-codec","basis:L","basis:U"].includes(node.id)){
  assert.equal(document.sourceFragments.get(node.id)?.length,2);
 }else{
  assert.equal(document.sourceFragments.get(node.id)?.length,1);
  assert.equal(combined.split(node.textRu).length-1,1,"duplicate or lost original "+node.id);
 }
}
const codec=g20.nodes.find(x=>x.id==="g7:recursive-codec")!;
assert.ok(document.mainText.indexOf(g41.earlyQ.exactSourceOpeningRu)<
 document.mainText.indexOf(codec.textRu));
for(const item of g41.deferred){
 assert.equal(document.mainText.split(item.exactEquation).length-1,1);
 assert.equal(document.mainText.split(item.sourceExplanationRu).length-1,1);
 assert.ok(document.mainText.indexOf(item.exactEquation)<document.mainText.indexOf(item.sourceExplanationRu));
}
assert.equal((document.mainText.match(/^## \d+\. /gm)??[]).length,10);
assert.equal((document.annexes.match(/^\| \d+ \| /gm)??[]).length,119);
assert.equal((document.annexes.match(/^\*\*V15-[A-Z0-9-]+ · /gm)??[]).length,48);
assert.equal((document.annexes.match(/^### R40-(?:06|07|09|10|11|12|13|14|15) /gm)??[]).length,9);
assert.ok(document.mainText.includes("NO_MATCH"));
assert.ok(document.mainText.includes("RuleTT"));
assert.ok(document.mainText.includes("FRM-04"));
assert.ok(document.mainText.includes("FRM-07"));
assert.ok(document.markdown.includes("ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА"));
assert.ok(!document.mainText.includes("editorial:foundation-ontology"));
assert.ok(!document.mainText.includes("V15-READY-03"));
assert.ok(document.annexes.includes("V15-READY-03"));
assert.deepEqual(w3.rows.filter(x=>x.kind==="governance-rule").map(x=>x.atom).sort(),
 document.annexIds.filter(x=>x.startsWith("g11:")).map(x=>x.slice(4)).sort());
const parse=(x:string)=>parseReaderW6Model(x);
assert.throws(()=>parse(source.replace("author_approval: not-recorded","author_approval: recorded")),/cannot promote/);
assert.throws(()=>parse(source.replace("publication: blocked","publication: ready")),/cannot promote/);
assert.throws(()=>parse(source.replace("primary_text_atoms: 102","primary_text_atoms: 101")),/source-preserving layout/);
assert.throws(()=>parse(source.replace("historical_g16_atoms: 5","historical_g16_atoms: 0")),/source-preserving layout/);
assert.throws(()=>parse(source.replace("original_source_atoms: 119","original_source_atoms: 118")),/source-preserving layout/);
assert.throws(()=>parse(source+"\npublication: ready\n"),/malformed\/duplicate YAML/);
console.log("R44-W6 readable preview: all 119 source fragments reconstruct byte-identical text; 102 primary / 17 historical+governance annex; 10 chapters, 48 reviews and 9 open findings.");
