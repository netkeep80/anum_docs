import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {loadReaderG20} from "../src/tooling/mts-reader-g20.js";
import {renderReaderW6} from "../src/tooling/mts-reader-r44-w6.js";
import {loadReaderF06F07,parseReaderF06F07,REVIEW_F06_F07_PATH}
 from "../src/tooling/mts-reader-review-f06-f07.js";

const root=resolve("..");
const original=readFileSync(resolve(root,REVIEW_F06_F07_PATH),"utf8");
const wave=loadReaderF06F07(root);
assert.equal(wave.publication,"blocked");
assert.equal(wave.theorems.length,14);
assert.deepEqual(wave.openObligations,["INVERSION_NON_GROUNDED_EXTENSION",
 "CTX_GAMMA_REFINEMENT_BRIDGE","GLOBAL_Z2_ACTION_NOT_CLAIMED"]);
assert.deepEqual(wave.theorems.find(x=>x.id==="INV-01-TOTAL")?.assumptions,
 ["A1","E","D","Grounded"]);
assert.deepEqual(wave.theorems.find(x=>x.id==="INV-02-TOTAL")?.assumptions,
 ["A1","N","E","D","Grounded"]);
assert.deepEqual(wave.theorems.find(x=>x.id==="CTX-03-Z2")?.assumptions,
 ["A1","N","E","D"]);
assert.deepEqual(wave.theorems.find(x=>x.id==="CTX-03-MARKER")?.assumptions,
 ["A1","E","D","ContextOrientationMarker"]);
assert.ok(wave.inversionMd.includes("∃! y"));
assert.ok(wave.inversionMd.includes("INV_01_recursive_inversion_unique_total"));
assert.ok(wave.inversionMd.includes("INV_02_recursive_inversion_involutive"));
assert.ok(wave.inversionMd.includes("N:F2F3GroundedNormalization"));
assert.ok(wave.inversionMd.includes("J(L)=L"));
assert.ok(wave.orientationMd.includes("RelativeZ2Law"));
assert.ok(wave.orientationMd.includes("SameChiralClass"));
assert.ok(wave.orientationMd.includes("ContextOrientationMarker"));
assert.ok(wave.orientationMd.includes("CTX_03_semantic_covariance_capstone"));
assert.ok(wave.orientationMd.includes("не доказательство реализации полного исполнительного пути Γ"));
assert.ok(wave.orientationMd.includes("GLOBAL_Z2_ACTION_NOT_CLAIMED"));
assert.ok(!wave.orientationMd.includes("свидетельство полной корректности TypeScript"));

const book=renderReaderW6(root);
assert.equal(book.publication,"blocked");
assert.ok(book.mainText.includes("### F06. Структурная инверсия J:"));
assert.ok(book.mainText.includes("### F07. Хиральность, относительная Z₂-симметрия"));
assert.ok(book.mainText.indexOf("### F06.")>book.mainText.indexOf("### F05."));
assert.ok(book.mainText.indexOf("### F07.")>book.mainText.indexOf("### F06."));
assert.ok(book.mainText.indexOf("### F07.")<book.mainText.indexOf("**2.1."));
assert.equal((book.mainText.match(/^## \d+\. /gm)??[]).length,10);
assert.equal((book.annexes.match(/^\| \d+ \| /gm)??[]).length,119);
assert.equal((book.annexes.match(/^### R40-(?:06|07|09|10|11|12|13|14|15) /gm)??[]).length,9);
assert.equal(book.sourceFragments.size,119);
for(const x of loadReaderG20(root).ordered)
 assert.equal(book.sourceFragments.get(x.id)?.join(""),x.textRu,"source atom changed "+x.id);
assert.ok(book.markdown.includes("ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА"));

const fail=(from:string,to:string)=>parseReaderF06F07(original.replace(from,to),root);
assert.throws(()=>fail("publication: blocked","publication: approved"),/acceptance\/publication authority/);
assert.throws(()=>fail("author_approval: not-recorded","author_approval: recorded"),/acceptance\/publication authority/);
assert.throws(()=>fail("semantic_change: false","semantic_change: true"),/acceptance\/publication authority/);
assert.throws(()=>fail("master_issue: 2217","master_issue: 7777"),/acceptance\/publication authority/);
assert.throws(()=>fail("CTX_GAMMA_REFINEMENT_BRIDGE","CTX_GAMMA_PROVED"),/open scientific obligations/);
assert.throws(()=>fail("exists-image-grounded","globally-total"),/theorem identity or scope drift/);
assert.throws(()=>fail("assumptions: [A1, N, E, D, Grounded]","assumptions: [A1, E, D, Grounded]"),
 /proof hypotheses INV-02-TOTAL/);
assert.throws(()=>fail("id: CTX-03-Z2, symbol: CTX_03_relational_z2_support","id: CTX-03-Z2, symbol: CTX_03_abs_orientation"),
 /theorem identity or scope drift/);
assert.throws(()=>fail("proofs/coq/MtsFoundation.v","proofs/lean4/MtsFoundation.lean"),
 /source redirected/);
assert.throws(()=>parseReaderF06F07(original+"\npublication: published\n",root),
 /invalid or duplicated YAML/);
console.log("F06/F07: 14 source-backed INV/CTX theorem scopes, correct A1/N/E/D domain, relational Z2 without global primitive, Γ refinement remains OPEN, 119 exact atoms.");
