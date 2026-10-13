import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {loadReaderG20} from "../src/tooling/mts-reader-g20.js";
import {renderReaderW6} from "../src/tooling/mts-reader-r44-w6.js";
import {loadReaderR01R02,parseReaderR01R02,REVIEW_R01_R02_PATH}
 from "../src/tooling/mts-reader-review-r01-r02.js";

const root=resolve(".."),raw=readFileSync(resolve(root,REVIEW_R01_R02_PATH),"utf8");
const wave=loadReaderR01R02(root);
assert.equal(wave.publication,"blocked");
assert.equal(wave.catalog.length,9);
assert.deepEqual(wave.catalog.map(x=>x.id),
 ["R01-ADD-IDEMPOTENCE","R01-ADD-COMMUTATIVITY","R01-EVENTS",
  "R02-MULTIPLICITY","R02-EMPTY","R02-SINGLE",
  "R02-DOUBLE","R02-LEFT-INVERSE","R02-FOLD-COLLISION"]);
assert.deepEqual(wave.openObligations,[
 "ANET_GLOBAL_MEMBERSHIP_DECIDABILITY",
 "PRODUCTION_CODEC_TOTAL_KERNEL_REFINEMENT",
 "CONTEXT_ROLE_GAMMA_REFINEMENT_BRIDGE"]);
assert.ok(wave.anetMd.includes("A≈B"));
assert.ok(wave.anetMd.includes("Link→Prop"));
assert.ok(wave.anetMd.includes("GPR_02_membership_contribution_commutes"));
assert.ok(wave.anetMd.includes("неравенство самих p₁ и p₂"));
assert.ok(wave.anetMd.includes("R01-EQUALITY"));
assert.ok(wave.sequenceMd.includes("[]"));
assert.ok(wave.sequenceMd.includes("[R]"));
assert.ok(wave.sequenceMd.includes("[R,R]"));
assert.ok(wave.sequenceMd.includes("exact_sequence_fold_collision"));
assert.ok(wave.sequenceMd.includes("FRM_07_exact_sequence_injective_from_left_inverse"));
assert.ok(wave.sequenceMd.includes("readExactSequence"));
assert.ok(wave.sequenceMd.includes("не является элементом позиционной последовательности"));
assert.equal(wave.catalog.find(x=>x.id==="R02-FOLD-COLLISION")?.scope,
 "conditional-rooted-fold");
const doc=renderReaderW6(root);
assert.equal(doc.publication,"blocked");
assert.ok(doc.mainText.includes("### R01. Асеть связей"));
assert.ok(doc.mainText.includes("### R02. ExactSequence и F_R"));
assert.ok(doc.mainText.indexOf("### R01.")>doc.mainText.indexOf("### F03."));
assert.ok(doc.mainText.indexOf("**1.9.")<doc.mainText.indexOf("### R01.")&&
 doc.mainText.indexOf("### R01.")<doc.mainText.indexOf("## 2. "));
assert.ok(doc.mainText.indexOf("### R02.")>doc.mainText.indexOf("### F07."));
assert.ok(doc.mainText.indexOf("### R02.")<doc.mainText.indexOf("**3.1."));
assert.equal(doc.mainIds.length,102);
assert.equal(doc.annexIds.length,17);
assert.equal(doc.sourceFragments.size,119);
for(const x of loadReaderG20(root).ordered)
 assert.equal(doc.sourceFragments.get(x.id)?.join(""),x.textRu,
  "modified original scientific atom "+x.id);
assert.equal((doc.annexes.match(/^### R40-(?:06|07|09|10|11|12|13|14|15) /gm)??[]).length,9);
assert.ok(doc.markdown.includes("ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА"));
const bad=(a:string,b:string)=>parseReaderR01R02(raw.replace(a,b),root);
assert.throws(()=>bad("author_approval: not-recorded","author_approval: approved"),/cannot promote/);
assert.throws(()=>bad("publication: blocked","publication: accepted"),/cannot promote/);
assert.throws(()=>bad("semantic_change: false","semantic_change: true"),/cannot promote/);
assert.throws(()=>bad("remediation_issue: 2231","remediation_issue: 888"),/cannot promote/);
assert.throws(()=>bad("review_packages: [R01, R02]","review_packages: [R02, R01]"),/research package order/);
assert.throws(()=>bad("symbol: exact_sequence_fold_collision",
 "symbol: fnd13_form_injective"),/theorem identity\/scope drift/);
assert.throws(()=>bad("assumptions: [ExactSequenceKernel, injective]",
 "assumptions: [ExactSequenceKernel, A1]"),/theorem premises/);
assert.throws(()=>bad("scope: conditional-rooted-fold",
 "scope: globally-injective-fold"),/theorem identity\/scope drift/);
assert.throws(()=>bad("R02-ONE-ROOT","R02-SAME-ROOT"),/negative case order\/drift/);
assert.throws(()=>bad("ANET_GLOBAL_MEMBERSHIP_DECIDABILITY",
 "ANET_MEMBERSHIP_DECIDABLE"),/unresolved scientific obligations/);
assert.throws(()=>bad("proofs/lean4/MtsV015Formal.lean",
 "proofs/coq/MtsFoundation.v"),/source redirection/);
assert.throws(()=>parseReaderR01R02(raw+"\npublication: published\n",root),
 /invalid or duplicate YAML/);
console.log("R01/R02: 9 exact accepted Lean/Rocq scopes, 6 negative boundaries, ANet != ExactSequence != F_R, 119 originals unchanged, 9 R40 OPEN.");
