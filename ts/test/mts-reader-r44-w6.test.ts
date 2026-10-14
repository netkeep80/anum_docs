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
const actualModel=parseReaderW6Model(source);
assert.equal(actualModel.headings.length,9);
assert.equal(actualModel.headings.flat().length,102);
assert.equal(new Set(actualModel.headings.flat()).size,102);
assert.equal((document.mainText.match(/^\*\*\d+\.\d+\. /gm)??[]).length,102);
assert.ok(document.mainText.includes("**1.1. Внешний математический интерфейс Foundation.**"));
const basisPrelude=document.mainText.indexOf("**Предпосылка корневого базиса.**");
assert.ok(basisPrelude>document.mainText.indexOf("**1.4.")&&
 basisPrelude<document.mainText.indexOf("**1.5.")&&
 document.mainText.indexOf("**1.5.")<document.mainText.indexOf("**1.6."),
 "the conditional basis premise must precede the first named root/basis equations");
assert.ok(document.mainText.slice(basisPrelude,document.mainText.indexOf("**1.5.")).includes("F2F3OneSidedExistence(F)")&&
 document.mainText.slice(basisPrelude,document.mainText.indexOf("**1.5.")).includes("O≠R")&&
 document.mainText.slice(basisPrelude,document.mainText.indexOf("**1.5.")).includes("C≠R"),
 assert.ok(document.mainText.slice(basisPrelude,document.mainText.indexOf("**1.5.")).includes("не оператором = исполняемой МТС, возвращающим L/U.")&&
 document.mainText.slice(basisPrelude,document.mainText.indexOf("**1.5.")).includes("одноэлементная внешняя модель"),
 "external equality and singleton Foundation countermodel must be explicit before O/C");
 "reader must explicitly disclose conditional nontrivial basis witnesses before use");
const foundationStart=document.mainText.indexOf("**1.1. ");
const foundationLast=document.mainText.indexOf("**1.9. ");
const foundationReview=document.mainText.indexOf("### F01. ");
const modelReview=document.mainText.indexOf("### F02. ");
const nextChapter=document.mainText.indexOf("## 2. ");
assert.ok(foundationStart>=0&&foundationStart<foundationLast&&
 foundationLast<foundationReview&&foundationReview<modelReview&&modelReview<nextChapter,
 "the nine source-owned Foundation definitions must precede F01/F02 reviews in the rendered manuscript");
assert.ok(document.mainText.indexOf("LocalSelfDecision")>=foundationStart&&
 document.mainText.indexOf("LocalSelfDecision")<foundationReview,
 "LocalSelfDecision must be introduced before its extended F01 analysis");
const representation=document.mainText.indexOf("## 3. ");
const representationSourceStart=document.mainText.indexOf("**3.1. ");
const representationSourceLast=document.mainText.indexOf("**3.12. ");
const anetIntro=document.mainText.indexOf("**3.4. ");
const exactSequenceIntro=document.mainText.indexOf("**3.5. ");
const anetReview=document.mainText.indexOf("### R01. ");
const sequenceReview=document.mainText.indexOf("### R02. ");
const codeReview=document.mainText.indexOf("### R03. ");
const formalReview=document.mainText.indexOf("### L01. ");
const dasReview=document.mainText.indexOf("### L02. ");
const nextRepresentation=document.mainText.indexOf("## 4. ");
assert.ok(nextChapter<representation&&representation<representationSourceStart&&
 representationSourceStart<anetIntro&&anetIntro<exactSequenceIntro&&
 exactSequenceIntro<representationSourceLast&&representationSourceLast<anetReview&&
 anetReview<sequenceReview&&sequenceReview<codeReview&&
 codeReview<formalReview&&formalReview<dasReview&&
 dasReview<nextRepresentation,
 "chapter-3 scientific reviews must follow their source-owned definitions in R01/R02/R03/L01/L02 order");
assert.ok(document.mainText.slice(0,representation).indexOf("### R01. ")===-1,
 "ANet scientific review must not be emitted in Foundation");
assert.ok(document.mainText.includes("**2.14. Объективная хиральная пара без выбора контекста.**"));
assert.ok(!document.mainText.includes("**1.1. Определение и математическое положение.**"));
assert.ok(!document.mainText.includes("**7.1. Нормативное положение.**"));
assert.ok(document.mainText.includes("## 4. Производные шкалы, преобразования и контекстная ориентация"));
assert.ok(document.mainText.includes("## 5. Нотация, профили Q, историческая арифметика и Modus Ponens"));
assert.ok(document.mainText.includes("## 10. Статус принятия, нормативные границы и история релизов"));
const history=document.mainText.slice(document.mainText.indexOf("## 10. "));
assert.ok(history.length>900,"chapter 10 must have substantive accepted history, not an empty bridge");
assert.ok(history.includes("### Принятие v0.15 и пределы авторского решения"));
assert.ok(history.includes("ACCEPT_MTS_V0_15"));
assert.ok(history.includes("813a1569300b241a3b70eb282eecd8231db15e4b"));
assert.ok(history.includes("issue #1876"));
assert.ok(history.includes("PR #2078"));
assert.ok(history.includes("https://github.com/netkeep80/anum_docs/issues/1876#issuecomment-6046228475"));
assert.ok(!document.mainText.includes("\n\n Правила Q"),
 "trim display-only Q leading whitespace while keeping exact original source fragments");
const example=document.mainText.slice(document.mainText.indexOf("### Пример на принятых источниках: AND"),
 document.mainText.indexOf("## 8. "));
assert.equal((example.match(/NO_MATCH/g)??[]).length,1,"do not repeat the same NO_MATCH caveat in the worked example");
const parse=(x:string)=>parseReaderW6Model(x);
assert.throws(()=>parse(source.replace("author_approval: not-recorded","author_approval: recorded")),/cannot promote/);
assert.throws(()=>parse(source.replace("publication: blocked","publication: ready")),/cannot promote/);
assert.throws(()=>parse(source.replace("primary_text_atoms: 102","primary_text_atoms: 101")),/source-preserving layout/);
assert.throws(()=>parse(source.replace("historical_g16_atoms: 5","historical_g16_atoms: 0")),/source-preserving layout/);
assert.throws(()=>parse(source.replace("original_source_atoms: 119","original_source_atoms: 118")),/source-preserving layout/);
assert.throws(()=>parse(source+"\npublication: ready\n"),/malformed\/duplicate YAML/);

assert.throws(()=>parse(source.replace("author_comment: 6046228475","author_comment: 0000000000")),/history must identify actual author acceptance/);
assert.throws(()=>parse(source.replace('        - "Корневая Связь R"','        - "Внешний математический интерфейс Foundation"')),/distinct scientific titles/);
console.log("R44-W6 reader revision: 102 named source-owned paragraphs, nonempty witnessed acceptance chapter, unique AND caveat, exact 119 atom reassembly, 17 archival atoms, 48 science review records, publication blocked.\n");
console.log("R44-W6 readable preview: all 119 source fragments reconstruct byte-identical text; 102 primary / 17 historical+governance annex; 10 chapters, 48 reviews and 9 open findings.");
