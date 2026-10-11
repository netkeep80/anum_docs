import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";
import { loadReaderG20 } from "./mts-reader-g20.js";
import { loadReaderG42 } from "./mts-reader-g42.js";
import { loadReaderR44W3, renderReaderR44W3Preview } from "./mts-reader-r44-w3.js";

export const R44_W4_PATH="requirements/mts-source/MTS-READER-SCIENTIFIC-CONTINUITY-R44-W4.yaml";
const acceptedSha="c64b7e21340c6add248c8f380f3fef1292616ac6";
const draftSha="7f56affeff393017bd9004de131b712e29d0e5a0";
type Entry=Record<string,unknown>;
type Overlap={id:string;source:string;explanation:string;reading:string;rule:string};
type Chapter={id:string;title:string;atom:string;reading:string;limit:string};
type Proof={id:string;classification:string;premises:string[];exclusions:string[];lean4:string[];rocq:string[];reading:string;limit:string};
export interface R44W4 {title:string;abstract:string;introduction:string;policy:string;images:string;
  overlaps:Overlap[];chapters:Chapter[];proofs:Proof[];conclusion:string;publication:"blocked";}
function insist(x:unknown,m:string):asserts x{if(!x)throw Error("mts-reader-r44-w4: "+m);}
function obj(x:unknown,m:string):Entry{insist(!!x&&typeof x==="object"&&!Array.isArray(x),m+" mapping");return x as Entry;}
function list(x:unknown,m:string):unknown[]{insist(Array.isArray(x),m+" array");return x;}
function phrase(x:unknown,m:string,min=1):string{insist(typeof x==="string"&&x.trim().length>=min,m+" text");return x;}
function exact(o:Entry,names:string[],m:string):void{insist(Object.keys(o).sort().join("|")===names.sort().join("|"),m+" keys");}
function load(root:string,path:string):string{return readFileSync(resolve(root,path),"utf8");}
function yaml(src:string):Entry {const d=parseDocument(src,{strict:true,uniqueKeys:true});
  insist(d.errors.length===0&&d.warnings.length===0,"malformed/duplicate YAML");return obj(d.toJS({maxAliasCount:0}),"YAML");}
function link(path:string,sha:string):string{return "https://github.com/netkeep80/anum_docs/blob/"+sha+"/"+path;}
function once(s:string,needle:string,m:string):void{insist(s.split(needle).length===2,m+" must occur exactly once");}
export function parseR44W4(src:string,root:string):R44W4 {
  const r=yaml(src);
  exact(r,["schema","status","author_approval","publication","semantic_change","coverage",
    "source_manuscript","source_graph","source_composition","source_foundation","source_editorial_opening",
    "source_proofs","evidence_bootstrap","evidence_refinement","accepted_proof_lean4",
    "accepted_proof_rocq","accepted_main_sha","source_draft_sha","publication_template",
    "foundation_overlap","chapter_transitions","formal_catalogue","review_gate"],"W4");
  insist(r.schema==="mts-reader-scientific-continuity-r44-w4/v0.1"&&
    r.status==="proposed"&&r.author_approval==="not-recorded"&&r.publication==="blocked"&&
    r.semantic_change===false&&r.coverage==="ten-chapter-transitions-five-overlaps-eight-formal-cases"&&
    r.source_manuscript==="requirements/mts-source/MTS-READER-V015-INDIVIDUAL-AUDIT-R44-W3.yaml"&&
    r.source_graph==="requirements/mts-source/MTS-READER-FIRST-USE-G20.yaml"&&
    r.source_composition==="requirements/mts-source/MTS-READER-ACADEMIC-COMPOSITION-G42.yaml"&&
    r.source_foundation==="requirements/mts-source/MTS-FND-V14-L1.yaml"&&
    r.source_editorial_opening==="requirements/mts-source/MTS-READER-FOUNDATION-OPENING-G16.yaml"&&
    r.source_proofs==="proofs/v015-formal-proof-assurance.json"&&
    r.evidence_bootstrap==="proofs/v015-evidence/formal-bootstrap-frm01-06.json"&&
    r.evidence_refinement==="proofs/v015-evidence/formal-refinement-frm07-08.json"&&
    r.accepted_proof_lean4==="proofs/lean4/MtsV015Formal.lean"&&
    r.accepted_proof_rocq==="proofs/coq/MtsV015Formal.v"&&
    r.accepted_main_sha===acceptedSha&&r.source_draft_sha===draftSha,
    "no self-approval, publication or new source authority");
  const graph=loadReaderG20(root),composition=loadReaderG42(root),upstream=loadReaderR44W3(root);
  insist(graph.ordered.length===119&&composition.chapters.length===10&&upstream.rows.length===48&&
    upstream.publication==="blocked","119 source atoms and 48 independent reviews must remain");
  const templ=obj(r.publication_template,"publication template");
  exact(templ,["title_ru","annotation_ru","introduction_ru","presentation_policy","images_policy"],"template");
  const title=phrase(templ.title_ru,"title",36),abstract=phrase(templ.annotation_ru,"abstract",170);
  const introduction=phrase(templ.introduction_ru,"introduction",180);
  const policy=phrase(templ.presentation_policy,"editorial policy",185);
  const images=phrase(templ.images_policy,"historical images",145);
  insist(title.includes("Связей")&&abstract.includes("v0.15")&&
    abstract.includes("не является")&&policy.includes("G16")&&
    images.includes("сохраняются неизменными"),"reader metadata or historical image preservation missing");
  const g4=yaml(load(root,r.source_foundation as string));
  insist(obj(g4.reader_science,"G4 science").proof_check==="declarations-only"&&
    obj(g4.reader_science,"G4 science").publication==="blocked",
    "G4 proof review cannot be upgraded");
  const g16=yaml(load(root,r.source_editorial_opening as string));
  insist(g16.publication==="blocked"&&g16.author_approval==="not-recorded"&&
    phrase(g16.candidate_ru,"historical G16",100).includes("LocalSelfDecision"),
    "G16 monolithic editorial history remains noncanonical");
  const nodes=new Map(graph.ordered.map(x=>[x.id,x]));
  const pairIds=[
    ["g4:foundation","editorial:foundation-ontology"],
    ["g4:incidence","editorial:local-self-classification"],
    ["g4:one-sided-realizability","editorial:root-basis-witnesses"],
    ["g4:context-roles","editorial:relative-chiral-orientation"],
    ["g7:recursive-codec","editorial:representation-boundary"]];
  const overlaps=list(r.foundation_overlap,"five duplicate-boundary cases").map((x,i)=>{
    const o=obj(x,"G4/G16 overlap");
    exact(o,["id","proof_atom","explanation_atom","relationship_ru","editorial_rule_ru","retained"],"overlap");
    const [source,explanation]=pairIds[i]??[];
    insist(!!source&&o.id==="R44-W4-F0"+(i+1)&&o.proof_atom===source&&
      o.explanation_atom===explanation&&o.retained===true,
      "five original overlaps immutable and retained");
    const a=nodes.get(source)!,b=nodes.get(explanation!)!;
    insist(a&&b&&["G4","G7"].includes(a.sourceOwner)&&b.sourceOwner==="G16"&&
      graph.ordered.indexOf(a)<graph.ordered.indexOf(b)&&b.acceptedId==="V14-L1",
      "G16 must be downstream editorial explanation, not another axiom");
    return {id:o.id as string,source,explanation:explanation!,reading:phrase(o.relationship_ru,"source distinction",155),
      rule:phrase(o.editorial_rule_ru,"editorial nonduplication",110)};
  });
  insist(overlaps.length===5&&graph.ordered.filter(x=>x.sourceOwner==="G16").length===5,
    "no G16 source may be dropped or duplicated");
  const chapters=list(r.chapter_transitions,"chapter transitions").map((x,i)=>{
    const o=obj(x,"chapter");exact(o,["chapter","evidence_atom","transition_ru","limit_ru"],"chapter");
    const c=composition.chapters[i];
    insist(c&&o.chapter===c.id&&c.atomIds.includes(o.evidence_atom as string),
      "chapter-level citation must refer to actual chapter node");
    const reading=phrase(o.transition_ru,"scientific transition",150);
    const limit=phrase(o.limit_ru,"chapter boundary",100);
    insist(reading!==c.bridgeRu&&limit!==c.boundaryRu,
      "chapter must be reviewed, not boilerplate G42");
    return {id:c.id,title:c.titleRu,atom:o.evidence_atom as string,reading,limit};
  });
  insist(chapters.length===10,"all ten chapter transitions required");
  const inventory=JSON.parse(load(root,r.source_proofs as string)) as {
    targets:Array<{id:string;classification:string;premises:string[];exclusions:string[];lean4:string[];rocq:string[]}>};
  const evidenceOne=JSON.parse(load(root,r.evidence_bootstrap as string)) as {targets:Array<{id:string;classification:string}>};
  const evidenceTwo=JSON.parse(load(root,r.evidence_refinement as string)) as {targets:Array<{id:string;classification:string}>};
  const lean=load(root,r.accepted_proof_lean4 as string),rocq=load(root,r.accepted_proof_rocq as string);
  const proofs=list(r.formal_catalogue,"FRM catalogue").map((x,i)=>{
    const o=obj(x,"FRM");exact(o,["id","scientific_ru","exclusion_ru"],"FRM");
    const p=inventory.targets[i]!;
    insist(p&&o.id===p.id&&p.id==="FRM-0"+(i+1),"FRM catalogue identity or order");
    const witness=(i<6?evidenceOne:evidenceTwo).targets.find(w=>w.id===p.id);
    insist(witness?.classification===p.classification&&p.lean4.length>0&&p.rocq.length>0&&
      p.exclusions.length>0,"FRM witness classification and exclusions must match evidence");
    for(const symbol of p.lean4)insist(lean.includes(symbol.split(".").at(-1)!),"Lean4 declaration missing "+symbol);
    for(const symbol of p.rocq)insist(rocq.includes(symbol.split(".").at(-1)!),"Rocq declaration missing "+symbol);
    const reading=phrase(o.scientific_ru,"individual theorem science",105);
    const limit=phrase(o.exclusion_ru,"individual proof limitation",95);
    if(i>=3&&i<=6)insist(p.classification.startsWith("PROVED_UNDER_")&&p.premises.length>0,
      "conditional FRM-04/05/06/07 may not be made unconditional");
    if(i===6)insist(reading.includes("left inverse")&&limit.includes("TypeScript"),
      "FRM-07 does not verify production TS");
    if(i===7)insist(p.classification==="PROVED_IN_SELECTED_MATHEMATICAL_MODEL_WITH_PRODUCTION_WITNESS",
      "FRM-08 has a witness, not arbitrary production proof");
    return {id:p.id,classification:p.classification,premises:p.premises,exclusions:p.exclusions,
      lean4:p.lean4,rocq:p.rocq,reading,limit};
  });
  insist(proofs.length===8,"complete eight-FRM catalogue required");
  const gate=obj(r.review_gate,"author and science boundary");
  exact(gate,["state","final_r40_states_unchanged","source_atoms_preserved",
    "individually_reviewed_v015_requirements_preserved","statement_ru"],"gate");
  insist(gate.state==="independent-author-scientific-revision-still-required"&&
    gate.final_r40_states_unchanged===true&&gate.source_atoms_preserved===119&&
    gate.individually_reviewed_v015_requirements_preserved===48,
    "author gate or R40 states cannot change from editorial W4");
  const conclusion=phrase(gate.statement_ru,"remaining science",170);
  insist(conclusion.includes("не закрывает девять")&&conclusion.includes("экспертизу"),
    "nine R40 findings remain open");
  return {title,abstract,introduction,policy,images,overlaps,chapters,proofs,conclusion,publication:"blocked"};
}
export function loadReaderR44W4(root:string):R44W4{
  return parseR44W4(load(root,R44_W4_PATH),root);
}
export function renderReaderR44W4Preview(root:string):string{
  const m=loadReaderR44W4(root);
  let manuscript=renderReaderR44W3Preview(root);
  insist(m.publication==="blocked"&&manuscript.includes("ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА"),
    "cannot publish reader");
  const heading="# Метатеория связей v0.15 — научная композиция G42";
  once(manuscript,heading,"original H1");
  const prelude=["# "+m.title,"","*Научная редакция v0.15 — только предложение; не принято*","",
    "## Аннотация","",m.abstract,"",
    "## Принципы чтения и статусы утверждений","",m.introduction,"",
    "*Правило изложения:* "+m.policy,"",
    "*Исторические изображения:* "+m.images,""];
  manuscript=manuscript.replace(heading,prelude.join("\n"));
  for(const ch of m.chapters){
    const h="## "+ch.title;once(manuscript,h,"chapter "+ch.id);
    const note=["### Научный переход и область утверждений","",ch.reading,"",
      "**Не следует:** "+ch.limit,"","Исходный научный атом: "+ch.atom+".",""];
    manuscript=manuscript.replace(h,h+"\n\n"+note.join("\n"));
  }
  const proofsTitle="## Формально проверенный фрагмент и пределы свидетельств";
  once(manuscript,proofsTitle,"formal chapter");
  const catalogue=["### Каталог FRM-01–08: доказательства, предпосылки, ограничения","",
    "| Идентификатор | Статус принятого свидетельства | Источник |","|---|---|---|"];
  for(const p of m.proofs){
    const evidence=Number(p.id.slice(-2))<=6?
      "proofs/v015-evidence/formal-bootstrap-frm01-06.json":
      "proofs/v015-evidence/formal-refinement-frm07-08.json";
    catalogue.push("| "+p.id+" | "+p.classification+" | [Свидетельство]("+link(evidence,acceptedSha)+") |");
  }
  catalogue.push("");
  for(const p of m.proofs){
    catalogue.push("**"+p.id+" · точная область доказательства**","",p.reading,"",
      "**Предпосылки:** "+(p.premises.length?p.premises.join("; "):"в реестре не перечислены")+".","",
      "**Исключения из реестра:** "+p.exclusions.join("; ")+".","",
      "**Граница редакционного вывода:** "+p.limit,"",
      "Lean4: "+p.lean4.join(", ")+". Rocq: "+p.rocq.join(", ")+".","");
  }
  catalogue.push("Первичные исходники: [Lean4]("+link("proofs/lean4/MtsV015Formal.lean",acceptedSha)+
    "), [Rocq]("+link("proofs/coq/MtsV015Formal.v",acceptedSha)+
    "), [реестр FRM]("+link("proofs/v015-formal-proof-assurance.json",acceptedSha)+").","");
  manuscript=manuscript.replace(proofsTitle,proofsTitle+"\n\n"+catalogue.join("\n"));
  const end="## Редакционные ограничения R40";once(manuscript,end,"R40 conclusion");
  const overlap=["## Разграничение исходной математики G4 и пояснений G16","",
    "Все исходные атомы остаются в тексте: G4 задаёт определения и условия доказательств; G16 объясняет эти условия читателю и не создаёт вторую систему аксиом.",""];
  for(const o of m.overlaps)overlap.push("**"+o.id+" · "+o.source+" → "+o.explanation+"**","",
    o.reading,"","**Редакционное правило:** "+o.rule,"");
  overlap.push("**Не закрыто:** "+m.conclusion,"");
  manuscript=manuscript.replace(end,overlap.join("\n")+"\n"+end);
  insist((manuscript.match(/^\*\*(?:g4:|g7:|g8:|g10:|g11:|basis:|concept:|editorial:)/gm)??[]).length===119,
    "must preserve all 119 exact atom blocks");
  insist((manuscript.match(/^\*\*V15-[A-Z0-9-]+\*\* · /gm)??[]).length===48,
    "all 48 v0.15 individual reviews remain");
  insist((manuscript.match(/^\*\*FRM-0[1-8] · точная область доказательства\*\*/gm)??[]).length===8,
    "eight scoped mathematical cases must be visible");
  return manuscript;
}
