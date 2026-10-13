import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {renderReaderW6} from "../src/tooling/mts-reader-r44-w6.js";
import {loadReaderG20} from "../src/tooling/mts-reader-g20.js";
import {loadReaderR03R04,parseReaderR03R04,REVIEW_R03_R04_PATH}
 from "../src/tooling/mts-reader-review-r03-r04.js";
const root=resolve(".."),raw=readFileSync(resolve(root,REVIEW_R03_R04_PATH),"utf8");
const r=loadReaderR03R04(root);
assert.equal(r.publication,"blocked");
assert.equal(r.evidence.length,11);
assert.deepEqual(r.openObligations,["GLOBAL_NON_GROUNDED_RECURSIVE_CODEC",
 "Q_CROSS_VERSION_BYTES_NOT_PRESERVED","NAT_ADD_LE_PAIRED_KERNEL_FORMALIZATION",
 "PRODUCTION_ARITHMETIC_REFINEMENT"]);
assert.ok(r.representationMd.includes("19868"));
assert.ok(r.representationMd.includes("S ::= 8 | 9 S | 6 S | 1 S S"));
assert.ok(r.representationMd.includes("Grounded(x)"));
assert.ok(r.representationMd.includes("Q14"));
assert.ok(r.representationMd.includes("Q13"));
assert.ok(r.representationMd.includes("Roundtrip")||
 r.representationMd.includes("roundtrip"));
assert.ok(r.representationMd.includes("equal_denotation"));
assert.ok(r.arithmeticMd.includes("N₀=U"));
assert.ok(r.arithmeticMd.includes("D₁=L"));
assert.ok(r.arithmeticMd.includes("Count([R,R])=N₂"));
assert.ok(r.arithmeticMd.includes("Add(N₁,N₁,N₂)"));
assert.ok(r.arithmeticMd.includes("EXPLICITLY_DEFERRED"));
assert.ok(r.arithmeticMd.includes("kernel-ассуранса"));
const book=renderReaderW6(root);
assert.equal(book.publication,"blocked");
assert.ok(book.mainText.includes("### R03. Структурный код"));
assert.ok(book.mainText.includes("### R04. Производные Nat"));
assert.ok(book.mainText.indexOf("### R03.")>book.mainText.indexOf("### R02."));
assert.ok(book.mainText.indexOf("### R03.")>book.mainText.indexOf("**3.12."));
assert.ok(book.mainText.indexOf("### R03.")<book.mainText.indexOf("## 4. "));
assert.ok(book.mainText.indexOf("### R04.")>book.mainText.indexOf("### R03."));
assert.ok(book.mainText.indexOf("### R04.")<book.mainText.indexOf("**4.1."));
assert.equal((book.mainText.match(/^## \d+\. /gm)??[]).length,10);
assert.equal(book.mainIds.length,102);assert.equal(book.annexIds.length,17);
assert.equal(book.sourceFragments.size,119);
for(const x of loadReaderG20(root).ordered)
 assert.equal(book.sourceFragments.get(x.id)?.join(""),x.textRu,"original atom changed "+x.id);
assert.equal((book.annexes.match(/^### R40-(?:06|07|09|10|11|12|13|14|15) /gm)??[]).length,9);
const bad=(a:string,b:string)=>parseReaderR03R04(raw.replace(a,b),root);
assert.throws(()=>bad("author_approval: not-recorded","author_approval: recorded"),/no acceptance or publication authority/);
assert.throws(()=>bad("publication: blocked","publication: accepted"),/no acceptance or publication authority/);
assert.throws(()=>bad("semantic_change: false","semantic_change: true"),/no acceptance or publication authority/);
assert.throws(()=>bad("master_issue: 2217","master_issue: 2000"),/no acceptance or publication authority/);
assert.throws(()=>bad("review_packages: [R03, R04]","review_packages: [R04, R03]"),/R03\/R04 package order/);
assert.throws(()=>bad("scope: selected-nat-evidence","scope: global-nat-peano"),/source\/scope drift/);
assert.throws(()=>bad("key: natTheory","key: semiringTheory"),/source\/scope drift/);
assert.throws(()=>bad("NAT_ADD_LE_PAIRED_KERNEL_FORMALIZATION","NAT_KERNEL_PROVED"),/unresolved proof gaps/);
assert.throws(()=>bad("SEMIRING_NOT_ACCEPTED","SEMIRING_PROVED"),/11 distinct negative/);
assert.throws(()=>bad("proofs/lean4/MtsFoundation.lean",
 "proofs/coq/MtsFoundation.v"),/source ref changed/);
assert.throws(()=>parseReaderR03R04(raw+"\npublication: accepted\n",root),/invalid\/duplicate YAML/);
console.log("R03/R04: 11 accepted evidence scopes, 11 negative guards, 4 unresolved proof obligations; 119/119 original atoms retained and 9 R40 OPEN.");
