import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseDocument} from "yaml";
import {loadReaderG20,loadReaderG41} from "./mts-reader-g20.js";
import {loadReaderG42} from "./mts-reader-g42.js";
import {loadReaderR43} from "./mts-reader-r43.js";
import {loadReaderR44W3} from "./mts-reader-r44-w3.js";
import {loadReaderR44W4} from "./mts-reader-r44-w4.js";
import {loadReaderR44W5} from "./mts-reader-r44-w5.js";
import {loadReaderF01F02P01} from "./mts-reader-review-f01-f02-p01.js";
import {loadReaderF03F04F05} from "./mts-reader-review-f03-f04-f05.js";
import {loadReaderF06F07} from "./mts-reader-review-f06-f07.js";
import {loadReaderR01R02} from "./mts-reader-review-r01-r02.js";
import {loadReaderR03R04} from "./mts-reader-review-r03-r04.js";
import {loadReaderL01L03} from "./mts-reader-review-l01-l02-l03.js";
import {loadReaderG01G03} from "./mts-reader-review-g01-g02-g03.js";
import {loadReaderP02P03} from "./mts-reader-review-p02-p03.js";
import {loadReaderM01} from "./mts-reader-review-m01.js";
import {loadReaderM02} from "./mts-reader-review-m02.js";
import {loadReaderM03} from "./mts-reader-review-m03.js";
import {loadReaderM04} from "./mts-reader-review-m04.js";
import {loadReaderM05} from "./mts-reader-review-m05.js";
import {loadReaderM06} from "./mts-reader-review-m06.js";
import {loadReaderM06W1} from "./mts-reader-review-m06-w1.js";
import {loadReaderM06W2} from "./mts-reader-review-m06-w2.js";
import {loadReaderM06W3} from "./mts-reader-review-m06-w3.js";

export const READER_W6_PATH="requirements/mts-source/MTS-READER-HUMAN-EDITION-R44-W6.yaml";
type Dict=Record<string,unknown>;
export interface ReaderW6Document {
 readonly markdown:string;readonly mainText:string;readonly annexes:string;
 readonly mainIds:readonly string[];readonly annexIds:readonly string[];
 readonly sourceFragments:ReadonlyMap<string,readonly string[]>;readonly publication:"blocked";
}
function check(c:unknown,m:string):asserts c{if(!c)throw Error("mts-reader-r44-w6: "+m);}
function map(c:unknown,m:string):Dict{check(!!c&&typeof c==="object"&&!Array.isArray(c),m+" mapping");return c as Dict;}
function shape(x:Dict,keys:string[],m:string){check(Object.keys(x).sort().join("|")===keys.sort().join("|"),m+" keys");}
function str(c:unknown,m:string,min:number):string{check(typeof c==="string"&&c.trim().length>=min,m+" text");return c;}
function parse(s:string):Dict{const d=parseDocument(s,{strict:true,uniqueKeys:true});
 check(d.errors.length===0&&d.warnings.length===0,"malformed/duplicate YAML");return map(d.toJS({maxAliasCount:0}),"W6");}
function read(root:string,p:string){return readFileSync(resolve(root,p),"utf8");}
const pin="c64b7e21340c6add248c8f380f3fef1292616ac6";
function evidence(path:string){return "https://github.com/netkeep80/anum_docs/blob/"+pin+"/"+path;}
export function parseReaderW6Model(source:string){
 const doc=parse(source);
 shape(doc,["schema","status","author_approval","publication","semantic_change","source_academic_model",
  "source_editing_model","source_review_model","source_first_use","source_v015_review","source_main_pin","layout","scholarly_repairs"],"W6");
 check(doc.schema==="mts-reader-human-edition-r44-w6/v0.1"&&doc.status==="proposed"&&
 doc.author_approval==="not-recorded"&&doc.publication==="blocked"&&doc.semantic_change===false&&
 doc.source_main_pin===pin&&
 doc.source_academic_model==="requirements/mts-source/MTS-READER-ACADEMIC-COMPOSITION-G42.yaml"&&
 doc.source_editing_model==="requirements/mts-source/MTS-READER-SCIENTIFIC-CONTINUITY-R44-W4.yaml"&&
 doc.source_review_model==="requirements/mts-source/MTS-READER-SCIENTIFIC-FINAL-REVIEW-R44-W5.yaml"&&
 doc.source_first_use==="requirements/mts-source/MTS-READER-FIRST-USE-REPAIR-G41.yaml"&&
 doc.source_v015_review==="requirements/mts-source/MTS-READER-V015-INDIVIDUAL-AUDIT-R44-W3.yaml",
 "cannot promote W6 publication or change authority");
 const l=map(doc.layout,"layout");
 shape(l,["target","chapter_count","original_source_atoms","primary_text_atoms",
 "archival_appendix_atoms","historical_g16_atoms","administrative_g11_atoms",
 "individual_v015_reviews","proof_catalogue","scientific_open_findings",
 "main_id_policy","provenance_policy","source_preservation","q_first_use",
 "l_u_first_use","historic_image_policy","body_ru","caveat_ru","archive_ru","assurance_ru"],"layout");
 check(l.target==="a-single-manuscript-with-main-text-and-audit-appendices"&&
 l.chapter_count===10&&l.original_source_atoms===119&&l.primary_text_atoms===102&&
 l.archival_appendix_atoms===17&&l.historical_g16_atoms===5&&
 l.administrative_g11_atoms===12&&l.individual_v015_reviews===48&&
 l.proof_catalogue===8&&l.scientific_open_findings===9&&
 l.main_id_policy==="numbered-paragraphs-no-technical-owner-headings"&&
 l.provenance_policy==="every-original-atom-listed-once-in-appendix"&&
 l.source_preservation==="exact-source-strings-reconstruct-from-ordered-fragments"&&
 l.q_first_use==="show-prefix-once-before-recursive-codec-and-suffix-at-full-source-owner"&&
 l.l_u_first_use==="show-source-equation-then-delay-original-explanation"&&
 l.historic_image_policy==="preserve-original-image-bytes-and-provenance",
 "source-preserving layout invariants");
 const introduction=str(l.body_ru,"introduction",160),caveat=str(l.caveat_ru,"caveat",160),
 archive=str(l.archive_ru,"archive",160),assurance=str(l.assurance_ru,"assurance",115);
 check(archive.includes("119")&&archive.includes("102")&&archive.includes("17")&&
 caveat.includes("девять")&&assurance.includes("48"),"scientific source count or status drift");
 const repair=map(doc.scholarly_repairs,"direct-render scientific repair");
 shape(repair,["status","author_approval","publication","observation","reason_ru",
  "chapter_labels","chapter_title_overrides","historic_acceptance",
  "no_match_duplicate_policy","q_display_normalization"],"scholarly repair");
 check(repair.status==="proposed"&&repair.author_approval==="not-recorded"&&
  repair.publication==="blocked"&&
  repair.observation==="direct-inspection-of-generated-W6-main-text"&&
  repair.no_match_duplicate_policy==="one-source-comment-plus-one-four-row-table"&&
  repair.q_display_normalization==="display-trim-leading-space-while-source-fragments-remain-identical",
  "direct scholarly repair cannot change accepted text");
 str(repair.reason_ru,"actual rendered-text critique",180);
 check(Array.isArray(repair.chapter_labels),"nine chapter-specific heading lists missing");
 const chapterIds=["foundational-forms","grounded-inverse-context","representation-first-use",
  "derived-and-context","grammar-and-historical-mp","v015-ontology",
  "v015-execution","proof-and-refinement","reproducibility-assurance"];
 const counts=[9,16,12,13,16,6,13,2,15];
 const headings=(repair.chapter_labels as unknown[]).map((item,i)=>{
  const c=map(item,"chapter labels");shape(c,["id","headings_ru"],"chapter labels");
  check(c.id===chapterIds[i]&&Array.isArray(c.headings_ru),"chapter heading sequence or owner changed");
  const list=(c.headings_ru as unknown[]).map(x=>str(x,"individual Russian heading",12));
  check(list.length===counts[i]&&new Set(list).size===list.length,
   "all "+counts[i]+" chapter paragraphs need distinct scientific titles");
  return list;
 });
 check(headings.length===9&&headings.flat().length===102,"all 102 source-owned paragraphs require titles");
 check(Array.isArray(repair.chapter_title_overrides),"two amended chapter titles");
 const renamed=(repair.chapter_title_overrides as unknown[]).map((item,i)=>{
  const v=map(item,"chapter title override");shape(v,["id","title_ru"],"override");
  const target=["derived-and-context","grammar-and-historical-mp"][i];
  check(v.id===target,"only the two historically heterogeneous chapters can be renamed");
  return {id:target!,title:str(v.title_ru,"chapter title",35)};
 });
 check(renamed.length===2,"two chapter titles required");
 const h=map(repair.historic_acceptance,"accepted v0.15 decision");
 shape(h,["evidence_source","author_issue","author_comment","pull_request",
  "merged_at_utc","merge_sha","accepted_ru","meaning_ru","source_ru","provenance_ru"],"history");
 check(h.evidence_source==="traceability/mts-v0.15.json"&&h.author_issue===1876&&
  h.author_comment===6046228475&&h.pull_request===2078&&
  h.merged_at_utc==="2026-10-07T23:17:15Z"&&
  h.merge_sha==="813a1569300b241a3b70eb282eecd8231db15e4b",
  "history must identify actual author acceptance and exact release merge");
 const history={evidenceSource:h.evidence_source as string,mergeSha:h.merge_sha as string,
  acceptedRu:str(h.accepted_ru,"exact acceptance history",240),
  meaningRu:str(h.meaning_ru,"scope of ACCEPT",220),
  sourceRu:str(h.source_ru,"V15-READY-03 historical contrast",210),
  provenanceRu:str(h.provenance_ru,"merge SHA distinction",170)};
 return {introduction,caveat,archive,assurance,headings,renamed,history,publication:"blocked" as const};
}
export function renderReaderW6(root:string):ReaderW6Document{
 const model=parseReaderW6Model(read(root,READER_W6_PATH));
 const graph=loadReaderG20(root),g41=loadReaderG41(root),g42=loadReaderG42(root);
 const r43=loadReaderR43(root),w3=loadReaderR44W3(root),w4=loadReaderR44W4(root),w5=loadReaderR44W5(root);
 const scientificReview=loadReaderF01F02P01(root);
 const structuralReview=loadReaderF03F04F05(root);
 const inversionReview=loadReaderF06F07(root);
 const relationalReview=loadReaderR01R02(root);
 const representationReview=loadReaderR03R04(root);
 const languageReview=loadReaderL01L03(root);
 const gammaReview=loadReaderG01G03(root);
 const assuranceReview=loadReaderP02P03(root);
 const mathematicalPosition=loadReaderM01(root);
 const workedExample=loadReaderM02(root);
 const notationReview=loadReaderM03(root);
 const epistemicReview=loadReaderM04(root);
 const historicalImages=loadReaderM05(root);
 const sourceQuestions=loadReaderM06(root);
 const questionWave1=loadReaderM06W1(root);
 const questionWave2=loadReaderM06W2(root);
 const questionWave3=loadReaderM06W3(root);
 const v015=JSON.parse(read(root,model.history.evidenceSource)) as {
   status:string;currentAccepted:{mtsVersion:string};
   authorDecision:{state:string;decision:string;ownerIssue:number;decisionEvidence:string}};
 check(v015.status==="accepted"&&v015.currentAccepted.mtsVersion==="v0.15"&&
   v015.authorDecision.state==="ACCEPTED"&&v015.authorDecision.decision==="ACCEPT_MTS_V0_15"&&
   v015.authorDecision.ownerIssue===1876&&
   v015.authorDecision.decisionEvidence==="netkeep80/anum_docs#1876 issuecomment-6046228475",
   "scientific history is not supported by accepted author evidence");
 check(graph.publication==="blocked"&&w3.publication==="blocked"&&w4.publication==="blocked"&&
 w5.publication==="blocked"&&graph.ordered.length===119&&w3.rows.length===48&&
 w4.proofs.length===8&&w5.cases.length===9,"source science acceptance gate");
 const byId=new Map(graph.ordered.map(x=>[x.id,x]));
 const reviews=new Map(w3.rows.map(x=>[x.atom,x]));
 const toAnnex=new Set(graph.ordered.filter(x=>x.sourceOwner==="G16"||
   (x.sourceOwner==="G11"&&reviews.get(x.id.substring(4))?.kind==="governance-rule")).map(x=>x.id));
 check(toAnnex.size===17&&graph.ordered.filter(x=>x.sourceOwner==="G16").length===5,
 "five historical and twelve administrative original atoms must move to annex");
 const parts=new Map(graph.ordered.map(x=>[x.id,[] as string[]]));
 function emit(id:string,s:string){const p=parts.get(id);check(p!==undefined,"unknown atom "+id);p.push(s);}
 const mainIds:string[]=[],annexIds:string[]=[];
 const main=["# "+w4.title,"",
 "**ПРЕДЛОЖЕНИЕ. НЕ УТВЕРЖДЕНО АВТОРОМ. ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА.**","",
 "## Аннотация","",w4.abstract,"",
 "## Как читать рукопись","",w4.introduction,"",
 model.introduction,"",model.caveat,""];
 const deferred=new Map(g41.deferred.map(x=>[x.firstUseNode,x]));
 const releases=new Map(g41.deferred.map(x=>[x.afterNode,x]));
 for(let ci=0;ci<g42.chapters.length;ci++){
  const chapter=g42.chapters[ci]!,transition=w4.chapters[ci]!;
  check(chapter.id===transition.id,"academic chapter source order changed");
  const titleOverride=model.renamed.find(x=>x.id===chapter.id)?.title;
  main.push("## "+(ci+1)+". "+(titleOverride??chapter.titleRu),"",transition.reading,"",
    "**Граница применимости.** "+transition.limit,"");
  if(chapter.id==="foundational-forms"){
   main.push(scientificReview.foundationMd,"",scientificReview.modelMd,"",structuralReview.basisMd,"",
    relationalReview.anetMd,"");
  }
  if(chapter.id==="representation-first-use"){
   main.push(relationalReview.sequenceMd,"",representationReview.representationMd,"",
    languageReview.formalMd,"",languageReview.dasMd,"");
  }
  if(chapter.id==="derived-and-context"){
   main.push(representationReview.arithmeticMd,"");
  }
  if(chapter.id==="v015-execution"){
   main.push(languageReview.executionMd,"",gammaReview.transitionMd,"",gammaReview.reductionMd,"");
  }
  if(chapter.id==="grounded-inverse-context"){
   main.push(structuralReview.groundedMd,"",structuralReview.identityMd,"",
    inversionReview.inversionMd,"",inversionReview.orientationMd,"");
  }
  if(chapter.id==="proof-and-refinement"){
   main.push(scientificReview.assuranceMd,"",assuranceReview.refinementMd,"",assuranceReview.reproducibilityMd,"",mathematicalPosition.noveltyMd,"",workedExample.walkthroughMd,"",notationReview.notationMd,"",epistemicReview.evidenceMd,"");
  }
  let paragraph=0;
  for(const id of chapter.atomIds){
   const node=byId.get(id)!;check(node!==undefined,"missing source "+id);
   if(toAnnex.has(id))continue;
   paragraph++;mainIds.push(id);
   if(id===g41.earlyQ.insertBefore){
    const owner=byId.get("g7:q-codec")!;
    check(owner.textRu.startsWith(g41.earlyQ.exactSourceOpeningRu),"Q source prefix changed");
    main.push("**Предварительное определение Q.** "+g41.earlyQ.exactSourceOpeningRu,"");
    emit("g7:q-codec",g41.earlyQ.exactSourceOpeningRu);
   }
   const humanHeading=model.headings[ci]?.[paragraph-1];
   check(humanHeading!==undefined,"unreviewed or reordered paragraph "+chapter.id+"/"+paragraph);
   main.push("**"+(ci+1)+"."+(paragraph)+". "+humanHeading+".**","");
   const b=deferred.get(id);
   if(b){
    check(node.textRu===b.exactEquation+". "+b.sourceExplanationRu,"G15 exact equation changed");
    main.push(b.exactEquation+".","");emit(id,b.exactEquation+". ");
   }else if(id==="g7:q-codec"){
    const remainder=node.textRu.slice(g41.earlyQ.exactSourceOpeningRu.length);
    main.push(remainder.trimStart(),"");emit(id,remainder);
   }else{main.push(node.textRu,"");emit(id,node.textRu);}
   const rel=releases.get(id);
   if(rel){main.push("**Пояснение к "+rel.symbol+" после введения необходимых понятий.**","",
     rel.sourceExplanationRu,"");emit(rel.firstUseNode,rel.sourceExplanationRu);}
  }
  check(ci===9||paragraph===model.headings[ci]?.length,
   "chapter paragraph count invalid after editorial repair");
  if(chapter.id==="governance-and-history"){
   check(paragraph===0&&chapter.atomIds.every(id=>toAnnex.has(id)),
    "historical chapter must be filled with attributed narrative, not duplicated governance axioms");
   main.push("### Принятие v0.15 и пределы авторского решения","",
    model.history.acceptedRu,"",model.history.meaningRu,"",
    "### Историческое правило авторского перехода","",model.history.sourceRu,"",
    "### Проверяемые контрольные точки","",model.history.provenanceRu,"",
    "Первоисточники: [принятый реестр]("+evidence(model.history.evidenceSource)+
    "), [авторское решение #1876](https://github.com/netkeep80/anum_docs/issues/1876#issuecomment-6046228475), "+
    "[релизный PR #2078](https://github.com/netkeep80/anum_docs/pull/2078).","");
  }
  if(chapter.id==="v015-execution"){
   main.push(gammaReview.andMd,"","### Пример на принятых источниках: AND","",r43.examples.andRu,"",
   "| Вход | Правило | Результат |","|---|---|---|",
   "| F,F | RuleFF | F |","| F,T | RuleFT | F |",
   "| T,F | RuleTF | F |","| T,T | RuleTT | T |","",
   "[FORMAL]("+evidence(r43.examples.formal)+"), [JSON]("+evidence(r43.examples.json)+
   "), [отрицательный тест]("+evidence(r43.examples.negative)+").","");
  }
  if(chapter.id==="proof-and-refinement"){
   main.push("### Доказанные фрагменты и их предпосылки","",
   "Ниже указаны области внешних математических свидетельств, а не доказательства произвольной production-реализации.","");
   for(const p of w4.proofs)main.push("**"+p.id+".** "+p.reading,"",
     "**Предпосылки:** "+(p.premises.join("; ")||"в реестре не перечислены")+".","",
     "**Ограничение:** "+p.limit,"",
     "Lean4: "+p.lean4.join(", ")+". Rocq: "+p.rocq.join(", ")+".","");
  }
 }
 const annex=["## Приложение А. Исторические пояснения об основаниях","",
   "Редакционные тексты G16 остаются дословными пояснениями и не заменяют аксиоматику G4.",""];
 for(const id of g42.order.filter(x=>toAnnex.has(x)&&byId.get(x)?.sourceOwner==="G16")){
  const node=byId.get(id)!;annexIds.push(id);emit(id,node.textRu);
  annex.push("### Историческое пояснение "+annexIds.length,"",node.textRu,"");
 }
 annex.push("## Приложение Б. Административные требования","",
   "Следующие положения регулируют статус и управление репозиторием, а не вводят дополнительные математические сорта.","");
 for(const id of g42.order.filter(x=>toAnnex.has(x)&&byId.get(x)?.sourceOwner==="G11")){
  const node=byId.get(id)!;annexIds.push(id);emit(id,node.textRu);
  annex.push("### Процедура "+(annexIds.length-5),"",node.textRu,"");
 }
 check(mainIds.length===102&&annexIds.length===17&&new Set([...mainIds,...annexIds]).size===119,
   "source coverage not exactly 102+17");
 for(const node of graph.ordered)check(parts.get(node.id)?.join("")===node.textRu,
   "original Russian source altered or lost: "+node.id);
 annex.push("## Приложение В. Реестр происхождения текста","",model.archive,"",
 "| № | Размещение | Исходный атом | Владелец | Нормативный ID |","|---:|---|---|---|---|");
 let i=0;
 for(const ch of g42.chapters)for(const id of ch.atomIds){
  const x=byId.get(id)!;i++;
  annex.push("| "+i+" | "+(toAnnex.has(id)?"приложение":"научный текст")+
    " | "+x.id+" | "+x.sourceOwner+"/"+x.sourceAtom+" | "+x.acceptedId+" |");
 }
 annex.push("","## Приложение Г. Рецензии требований v0.15","",model.assurance,"");
 for(const row of w3.rows)annex.push("**"+row.id+" · "+row.kind+" · "+row.requirementState+"**","",
   row.assessmentRu,"","**Ограничение:** "+row.limitationRu,"");
 annex.push("## Приложение Д. Незакрытые вопросы научной экспертизы","",
   "Содержательная авторская приёмка не выполнена. Все девять замечаний остаются открытыми.","");
 for(const c of w5.cases)annex.push("### "+c.id+" — "+c.title,"",c.assessment,"",
   "**Не решено:** "+c.gap,"","**Вопрос Автору:** "+c.question,"");
 annex.push("## Приложение Е. Доказательные источники","",
  "[Lean4]("+evidence("proofs/lean4/MtsV015Formal.lean")+
  "), [Rocq]("+evidence("proofs/coq/MtsV015Formal.v")+
  "), [реестр FRM]("+evidence("proofs/v015-formal-proof-assurance.json")+").","",
  "**Исторические изображения:** "+w4.images,"");
 annex.push(historicalImages.archiveMd);
 annex.push(sourceQuestions.archiveMd);
 annex.push(questionWave1.archiveMd);
 annex.push(questionWave2.archiveMd);
 annex.push(questionWave3.archiveMd);
 const mainText=main.join("\n"),annexes=annex.join("\n");
 check(!/^\*\*(?:g4:|g7:|g8:|g10:|g11:|basis:|concept:|editorial:)/m.test(mainText),
   "source metadata appears as a reader-body heading");
 check(!mainText.includes("editorial:foundation-ontology")&&!mainText.includes("V15-READY-03"),
   "technical origin leaked into body");
 check(annexes.includes("g4:foundation")&&annexes.includes("V15-READY-03"),
   "full source index omitted");
 return {markdown:mainText+"\n\n"+annexes,mainText,annexes,
  mainIds,annexIds,sourceFragments:parts,publication:"blocked"};
}
