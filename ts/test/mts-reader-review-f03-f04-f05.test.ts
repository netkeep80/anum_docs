import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {loadReaderG20} from "../src/tooling/mts-reader-g20.js";
import {renderReaderW6} from "../src/tooling/mts-reader-r44-w6.js";
import {loadReaderF03F04F05,parseReaderF03F04F05,REVIEW_F03_F04_F05_PATH}
 from "../src/tooling/mts-reader-review-f03-f04-f05.js";

const root=resolve("..");
const raw=readFileSync(resolve(root,REVIEW_F03_F04_F05_PATH),"utf8");
const dossier=loadReaderF03F04F05(root);
assert.equal(dossier.publication,"blocked");
assert.deepEqual(dossier.pairs,["R/O","R/C","R/L","R/U","O/C","O/L","O/U","C/L","C/U","L/U"]);
assert.deepEqual(dossier.obligations,["A1_INDEPENDENCE",
 "GLOBAL_POLE_EXTENTIONALITY","BASIS_PAIRWISE_KERNEL_LEMMA"]);
assert.equal((dossier.basisMd.match(/^\| [ROCLU]\/[ROCLU] \|/gm)??[]).length,10);
assert.ok(dossier.basisMd.includes("F2F3OneSidedExistence"));
assert.ok(dossier.basisMd.includes("fnd13_form_injective"));
assert.ok(dossier.basisMd.includes("отдельная совместная Lean4/Rocq-лемма"));
assert.ok(dossier.groundedMd.includes("Distinguishable"));
assert.ok(dossier.groundedMd.includes("fallback_cycle_not_grounded"));
assert.ok(dossier.groundedMd.includes("LocalSelfDecision"));
assert.ok(dossier.identityMd.includes("explicit_fnd13_replay"));
assert.ok(dossier.identityMd.includes("отсутствуют A1 и FND-02"));
assert.ok(dossier.identityMd.includes("A1_INDEPENDENCE"));
const book=renderReaderW6(root);
assert.equal(book.publication,"blocked");
assert.ok(book.mainText.includes("### F03. Основания R, O, C, L, U:"));
assert.ok(book.mainText.includes("### F04. Конструктивная локальная классификация"));
assert.ok(book.mainText.includes("### F05. A1, FND-02 и FND-13"));
assert.ok(book.mainText.indexOf("### F03.")<book.mainText.indexOf("**1.1."));
assert.ok(book.mainText.indexOf("### F04.")<book.mainText.indexOf("**2.1."));
assert.ok(book.mainText.indexOf("### F05.")<book.mainText.indexOf("**2.1."));
assert.ok(book.mainText.indexOf("### F03.")>book.mainText.indexOf("### F02."));
assert.ok(book.mainText.indexOf("### F05.")>book.mainText.indexOf("### F04."));
assert.equal((book.mainText.match(/^## \d+\. /gm)??[]).length,10);
assert.equal((book.annexes.match(/^\| \d+ \| /gm)??[]).length,119);
assert.equal((book.annexes.match(/^### R40-(?:06|07|09|10|11|12|13|14|15) /gm)??[]).length,9);
assert.equal(book.sourceFragments.size,119);
for(const x of loadReaderG20(root).ordered)
 assert.equal(book.sourceFragments.get(x.id)?.join(""),x.textRu,"source atom altered "+x.id);
assert.ok(!book.mainText.includes("editorial:foundation-ontology"));
assert.ok(!book.mainText.includes("V15-READY-03"));
assert.ok(book.markdown.includes("ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА"));

const bad=(a:string,b:string)=>parseReaderF03F04F05(raw.replace(a,b),root);
assert.throws(()=>bad("author_approval: not-recorded","author_approval: recorded"),/no authority/);
assert.throws(()=>bad("publication: blocked","publication: accepted"),/no authority/);
assert.throws(()=>bad("semantic_change: false","semantic_change: true"),/no authority/);
assert.throws(()=>bad("master_issue: 2217","master_issue: 10"),/no authority/);
assert.throws(()=>bad('pair: "L/U"','pair: "L/L"'),/basis equality\/inequality rationale/);
assert.throws(()=>bad('reason: "fnd13_form_injective and O != C"','reason: "associativity"'),/basis equality\/inequality rationale/);
assert.throws(()=>bad("A1_INDEPENDENCE","A1_PROVED"),/F05 open problems/);
assert.throws(()=>bad("proofs/lean4/MtsFoundation.lean","proofs/coq/MtsFoundation.v"),/source path drift/);
assert.throws(()=>bad("CONDITIONAL_DERIVATION_FROM_ACCEPTED_THEOREMS_NOT_NEW_KERNEL_CERTIFICATE","KERNEL_PROVED"),
 /not independently accepted kernel proof/);
assert.throws(()=>parseReaderF03F04F05(raw+"\npublication: accepted\n",root),
 /malformed or duplicate YAML/);
console.log("F03/F04/F05: ten conditional basis inequalities, six Distinguishable constructors, constructively scoped Grounded/A1/FND-13, 119 untouched sources, 9 OPEN R40.");
