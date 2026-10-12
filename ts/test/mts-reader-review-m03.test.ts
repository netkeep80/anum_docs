import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {loadReaderG20} from "../src/tooling/mts-reader-g20.js";
import {renderReaderW6} from "../src/tooling/mts-reader-r44-w6.js";
import {loadReaderM03,parseReaderM03,REVIEW_M03_PATH}
 from "../src/tooling/mts-reader-review-m03.js";

const root=resolve(".."),source=readFileSync(resolve(root,REVIEW_M03_PATH),"utf8");
const m=loadReaderM03(root);
assert.equal(m.publication,"blocked");
assert.equal(m.terms.length,10);
assert.equal(new Set(m.terms).size,10);
assert.equal(m.openObligations.length,4);
for(const phrase of ["Link", "form", "=", ":", "Theory->RuleTT",
 "A⟼B⟼C", "[T,T]", "NO_MATCH", "Matched([])", "J0", "S1", "S2", "reactGeneric"])
 assert.ok(m.notationMd.includes(phrase),"notation scope omitted "+phrase);
const rendered=renderReaderW6(root);
assert.equal(rendered.publication,"blocked");
assert.equal(rendered.mainText.split("### M03.").length-1,1);
assert.ok(rendered.mainText.indexOf("### M03.")>rendered.mainText.indexOf("### M02."));
assert.ok(rendered.mainText.indexOf("### M03.")<rendered.mainText.indexOf("**8.1."));
for(const id of m.terms) assert.equal(rendered.mainText.split("#### "+id+" ·").length-1,1);
assert.equal(rendered.sourceFragments.size,119);
assert.equal(rendered.mainIds.length,102);
assert.equal(rendered.annexIds.length,17);
for(const original of loadReaderG20(root).ordered)
 assert.equal(rendered.sourceFragments.get(original.id)?.join(""),original.textRu);
assert.equal((rendered.annexes.match(/^### R40-(?:06|07|09|10|11|12|13|14|15) /gm)??[]).length,9);
const replace=(before:string,after:string)=>parseReaderM03(source.replace(before,after),root);
assert.throws(()=>replace("author_approval: not-recorded","author_approval: accepted"),
 /cannot modify accepted semantics/);
assert.throws(()=>replace("publication: blocked","publication: ready"),
 /cannot modify accepted semantics/);
assert.throws(()=>replace("semantic_change: false","semantic_change: true"),
 /cannot modify accepted semantics/);
assert.throws(()=>replace("package_issue: 2252","package_issue: 1"),
 /cannot modify accepted semantics/);
assert.throws(()=>replace("id: M03-GAMMA","id: M03-FAKE"),
 /entry order\/id or language level drift/);
assert.throws(()=>replace("source_keys: [kernel, m02]","source_keys: [kernel]"),
 /exact evidence owners/);
assert.throws(()=>replace("M03_AUTHOR_ACCEPTANCE_NOT_RECORDED","M03_ACCEPTED"),
 /four open scientific gates/);
assert.throws(()=>parseReaderM03(source+"\npublication: ready\n",root),
 /invalid or duplicated YAML/);
console.log("M03: 10 typed notations / 10 examples / 10 false-inference checks; "+
 "119 original sources preserved; publication blocked.");
