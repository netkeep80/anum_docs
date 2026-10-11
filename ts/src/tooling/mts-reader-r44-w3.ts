import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";
import { loadReaderG42 } from "./mts-reader-g42.js";
import { loadReaderR44W2, renderReaderR44W2Preview } from "./mts-reader-r44-w2.js";

export const READER_R44_W3_PATH="requirements/mts-source/MTS-READER-V015-INDIVIDUAL-AUDIT-R44-W3.yaml";
type Obj=Record<string,unknown>;
interface Atom { id:string;accepted_id:string;source_quote:string;ru:string;domain:string;exclusions:string[]; }
export interface IndividualReview {
  id:string;atom:string;wave:string;requirementState:string;kind:string;
  assessmentRu:string;limitationRu:string;
}
export interface ReaderR44W3 {
  readonly rows:readonly IndividualReview[];
  readonly mp:Readonly<{scientificRu:string;exclusionRu:string}>;
  readonly proof:Readonly<{scientificRu:string;exclusionRu:string}>;
  readonly authority:Readonly<{scientificRu:string;exclusionRu:string}>;
  readonly publication:"blocked";
}
const mainSha="c64b7e21340c6add248c8f380f3fef1292616ac6";
const draftSourceSha="632be4ff018e813ce4dca46ed926bdbc25fc3c7c";
const sourcePaths=["W1","W2","W3","W4"].map(x=>"requirements/mts-source/MTS-READER-V15-G11-"+x+".yaml");
function must(b:unknown,why:string):asserts b{if(!b)throw new Error("mts-reader-r44-w3: "+why);}
function ob(v:unknown,label:string):Obj {must(v!==null&&typeof v==="object"&&!Array.isArray(v),label+" mapping");return v as Obj;}
function array(v:unknown,label:string):unknown[]{must(Array.isArray(v),label+" array");return v;}
function str(v:unknown,label:string,min=1):string {must(typeof v==="string"&&v.trim().length>=min,label+" nontrivial text");return v;}
function keys(x:Obj,expected:string[],label:string):void {must(Object.keys(x).sort().join("|")===expected.sort().join("|"),label+" exact keys");}
function parse(s:string):Obj{
  const d=parseDocument(s,{strict:true,uniqueKeys:true});
  must(d.errors.length===0&&d.warnings.length===0,"malformed/duplicate YAML");
  return ob(d.toJS({maxAliasCount:0}),"document");
}
function read(root:string,path:string):string {return readFileSync(resolve(root,path),"utf8");}
function pin(path:string,sha:string):string {return "https://github.com/netkeep80/anum_docs/blob/"+sha+"/"+path;}
export function parseReaderR44W3(documentText:string,root:string):ReaderR44W3{
  const doc=parse(documentText);
  keys(doc,["schema","status","author_approval","publication","semantic_change","coverage",
    "accepted_registry","accepted_main_sha","proposed_source_sha","upstream_science","source_waves","historical_cutover_exception","historical_mp",
    "proof_scope","authority_boundary","reviews","unresolved_r40"],"R44-W3");
  must(doc.schema==="mts-reader-v015-individual-audit-r44-w3/v0.1"&&
    doc.status==="proposed"&&doc.author_approval==="not-recorded"&&doc.publication==="blocked"&&
    doc.semantic_change===false&&
    doc.coverage==="source-attributed-forty-eight-editorial-judgements-not-forty-eight-formal-proofs"&&
    doc.accepted_registry==="requirements/mts-v0.15.json"&&doc.accepted_main_sha===mainSha&&
    doc.proposed_source_sha==="632be4ff018e813ce4dca46ed926bdbc25fc3c7c"&&
    doc.upstream_science==="requirements/mts-source/MTS-READER-INDIVIDUAL-MATH-REVIEW-R44-W2.yaml"&&
    JSON.stringify(doc.source_waves)===JSON.stringify(sourcePaths),
    "no editor can accept, publish, redefine or overstate v0.15 proof coverage");
  const upstream=loadReaderR44W2(root),composition=loadReaderG42(root);
  must(upstream.publication==="blocked"&&composition.publication==="blocked","upstream authority gate");
  const accepted=JSON.parse(read(root,doc.accepted_registry as string)) as {
    accepted:boolean;mtsVersion:string;requirements:Array<{
      id:string;summary:string;state:string;mandatory:boolean;group:string;
    }>;
  };
  must(accepted.accepted===true&&accepted.mtsVersion==="v0.15"&&
    accepted.requirements.length===48&&accepted.requirements.every(x=>x.mandatory===true),
    "accepted registry must have exactly 48 mandatory nodes");
  const source:Atom[]=[];
  const sourceWave:string[]=[];
  for(let w=0;w<4;w++){
    const path=sourcePaths[w]!;
    const contents=parse(read(root,path));
    must(contents.schema==="mts-reader-v15-wave/v0.1"&&contents.wave==="W"+(w+1)&&
      contents.author_approval==="not-recorded"&&contents.publication==="blocked",
      "G11 source ownership or publication drift: "+path);
    const atoms=array(contents.atoms,"G11 source atoms").map(x=>ob(x,"atom"));
    must(atoms.length===12,"each original G11 wave has exactly 12 individual owner atoms");
    for(const atom of atoms){
      keys(atom,["id","accepted_id","source_quote","ru","domain","exclusions"],"G11 source atom");
      const id=str(atom.accepted_id,"accepted owner ID");
      must(atom.id===id.toLowerCase()&&id.startsWith("V15-"),"G11 atom identity mismatch: "+id);
      source.push({id:str(atom.id,"atom"),accepted_id:id,source_quote:str(atom.source_quote,"quotation"),
        ru:str(atom.ru,"Russian owned prose",100),domain:str(atom.domain,"domain",10),
        exclusions:array(atom.exclusions,"exclusions").map(x=>str(x,"exclusion",10))});
      sourceWave.push("W"+(w+1));
    }
  }
  must(source.length===48&&new Set(source.map(x=>x.accepted_id)).size===48,
    "duplicate/omitted V15 source atoms");
  const historical=ob(doc.historical_cutover_exception,"historical cutover");
  keys(historical,["id","source_wave","historical_quote","accepted_summary",
    "author_decision_source","interpretation_ru"],"v0.15 historical quote exception");
  must(historical.id==="V15-READY-03"&&historical.source_wave==="W4"&&
    historical.historical_quote==="Only explicit Author ACCEPT/REJECT can change accepted/current from v0.14 to v0.15."&&
    historical.accepted_summary==="Explicit Author ACCEPT changes accepted/current from v0.14 to v0.15."&&
    historical.author_decision_source==="traceability/mts-v0.15.json"&&
    str(historical.interpretation_ru,"historical quote commentary",190).includes("уже состоявшийся ACCEPT"),
    "historical quote exception must be exact and explicit, not a generic bypass");
  const traced=JSON.parse(read(root,historical.author_decision_source as string)) as {
    status:string; authorDecision:{state:string;decision:string;decisionEvidence:string};
  };
  must(traced.status==="accepted"&&traced.authorDecision.state==="ACCEPTED"&&
    traced.authorDecision.decision==="ACCEPT_MTS_V0_15"&&
    traced.authorDecision.decisionEvidence==="netkeep80/anum_docs#1876 issuecomment-6046228475",
    "historical exception needs accepted Author evidence");
  const raw=array(doc.reviews,"individual reviews");
  must(raw.length===48,"every one of the 48 v0.15 requirements needs its own signed editorial judgement");
  const permitted=new Set(["terminology","semantic-contract","execution-contract","evidence-condition","governance-rule"]);
  let sourceQuoteExceptions=0;
  const reviewed=raw.map((v,i)=>{
    const row=ob(v,"review "+i);
    keys(row,["id","source_wave","source_atom","source_authority_state","type",
      "audit_state","assessment_ru","limitation_ru"],"individual review");
    const canonical=accepted.requirements[i]!,original=source[i]!;
    must(row.id===canonical.id&&row.source_atom===original.id&&row.source_wave===sourceWave[i]&&
      original.accepted_id===canonical.id&&
      (original.source_quote===canonical.summary||
        (canonical.id===historical.id&&sourceWave[i]===historical.source_wave&&
          original.source_quote===historical.historical_quote&&
          canonical.summary===historical.accepted_summary&&++sourceQuoteExceptions===1))&&
      row.source_authority_state===canonical.state,
      "review cannot detach source or misquote accepted requirement: "+canonical.id);
    must(row.audit_state==="individually-scoped-editorial-review-pending-author"&&
      permitted.has(row.type as string),"cannot self-promote 48 editor judgements");
    must(composition.chapters.some(ch=>ch.atomIds.includes("g11:"+original.id)),
      "reviewed requirement missing from G42 119-atom source: "+canonical.id);
    const assessmentRu=str(row.assessment_ru,"individual assessment",90);
    const limitationRu=str(row.limitation_ru,"individual exclusion",60);
    // A distinct, original assessment and limitation must exist for each, not one generic batch template.
    must(assessmentRu!==original.ru&&limitationRu!==original.exclusions.join(" "),
      "editorial judgement cannot merely duplicate G11 unchanged");
    return {id:canonical.id,atom:original.id,wave:sourceWave[i]!,requirementState:canonical.state,
      kind:row.type as string,assessmentRu,limitationRu};
  });
  must(sourceQuoteExceptions===1,"G11 v0.15 47/48 exact quotes plus one historically explained author cutover");
  must(new Set(reviewed.map(x=>x.assessmentRu)).size===48&&
    new Set(reviewed.map(x=>x.limitationRu)).size===48,
    "all 48 judgements must be distinct");
  must(reviewed.find(x=>x.id==="V15-READY-03")?.requirementState==="ACCEPTED",
    "historical author cutover must remain accepted");
  const mp=ob(doc.historical_mp,"MP / Gamma");
  keys(mp,["source","source_atom","scientific_ru","exclusion_ru"],"MP historical boundary");
  must(mp.source==="requirements/mts-source/MTS-READER-V14-G10.yaml"&&mp.source_atom==="v14-l11",
    "must use historical accepted MP owner's exact scientific atom");
  const g10=parse(read(root,mp.source as string));
  const mpAtom=array(g10.atoms,"G10 atoms").map(x=>ob(x,"G10 atom")).find(x=>x.id===mp.source_atom);
  must(mpAtom&&mpAtom.accepted_id==="V14-L11"&&
    (mpAtom.ru as string).includes("A14→A16→A17→A72w"),
    "MP must originate from the actual earlier chain");
  const gamma=source.find(x=>x.accepted_id==="V15-GAMMA-01");
  must(gamma?.ru.includes("J0")&&gamma.ru.includes("S1")&&gamma.ru.includes("S2")&&
    gamma.ru.includes("атомарно"),"v0.15 Γ exact source is absent");
  const mpRu=str(mp.scientific_ru,"MP comparison",230),mpEx=str(mp.exclusion_ru,"MP exclusion",145);
  must(mpRu.includes("A14→A16→A17→A72w")&&
    ["J0","S1","S2","v0.15"].every(x=>mpRu.includes(x))&&
    mpEx.includes("Γ предпосылкой"),"no unproven MP/Γ equivalence or retroactive theory claim");
  const proof=ob(doc.proof_scope,"formal scope");
  keys(proof,["inventory","authoritative_cases","scientific_ru","exclusion_ru"],"proof case");
  must(proof.inventory==="proofs/v015-formal-proof-assurance.json"&&
    JSON.stringify(proof.authoritative_cases)===
      JSON.stringify(["FRM-01","FRM-02","FRM-03","FRM-04","FRM-05","FRM-06","FRM-07","FRM-08"]),
    "paired proof scope cannot drop a conditional theorem");
  const assurance=JSON.parse(read(root,proof.inventory as string)) as {
    targets:Array<{id:string;classification:string;premises:string[];exclusions:string[]}>;
  };
  must(JSON.stringify(assurance.targets.map(x=>x.id))===JSON.stringify(proof.authoritative_cases)&&
    assurance.targets.length===8,"exact accepted theorem inventory");
  for(const id of ["FRM-04","FRM-05","FRM-06","FRM-07"]){
    const theorem=assurance.targets.find(x=>x.id===id);
    must(theorem&&theorem.classification.startsWith("PROVED_UNDER_")&&theorem.premises.length>0,
      "conditional proof cannot be advertised unconditional: "+id);
  }
  const proofRu=str(proof.scientific_ru,"proof scope",275),proofEx=str(proof.exclusion_ru,"proof exclusions",145);
  must(["FRM-04","FRM-05","FRM-06","FRM-07"].every(x=>proofRu.includes(x))&&
    proofEx.includes("TypeScript"),"theorem premise qualification required");
  const authority=ob(doc.authority_boundary,"governance boundary");
  keys(authority,["scientific_ru","exclusion_ru"],"governance");
  const authRu=str(authority.scientific_ru,"authority meaning",250);
  const authEx=str(authority.exclusion_ru,"authority exclusions",135);
  must(["COMPONENT_GREEN","VERTICAL_GREEN","RELEASE_READY","ACCEPTED"].every(x=>authRu.includes(x))&&
    authEx.includes("авторского"),"requirements states are not theorems");
  const unresolved=ob(doc.unresolved_r40,"scientific findings");
  keys(unresolved,["corrected_previously","needs_rereview","open"],"R40");
  must(JSON.stringify(unresolved.corrected_previously)===JSON.stringify(composition.findings.corrected)&&
    JSON.stringify(unresolved.needs_rereview)===JSON.stringify(composition.findings.mitigated)&&
    JSON.stringify(unresolved.open)===JSON.stringify(composition.findings.open),
    "48 reviews cannot silently close R40");
  return {rows:reviewed,mp:{scientificRu:mpRu,exclusionRu:mpEx},
    proof:{scientificRu:proofRu,exclusionRu:proofEx},
    authority:{scientificRu:authRu,exclusionRu:authEx},publication:"blocked"};
}
export function loadReaderR44W3(root:string):ReaderR44W3 {
  return parseReaderR44W3(read(root,READER_R44_W3_PATH),root);
}
export function renderReaderR44W3Preview(root:string):string {
  const review=loadReaderR44W3(root);
  const base=renderReaderR44W2Preview(root);
  must(review.publication==="blocked"&&base.includes("ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА"),
    "blocked publication and acceptance authority must remain");
  const anchor="## Редакционные ограничения R40";
  must(base.split(anchor).length===2,"exact one reader R40 boundary");
  const appendix=["## R44-W3 — индивидуальная научно-редакционная проверка требований v0.15","",
    "Все 48 обязательных требований сопоставлены с принятым реестром и первичными формулировками G11. У 47 цитат дословное совпадение; у V15-READY-03 зафиксирована историческая разница между правилом допуска ACCEPT/REJECT и уже принятым решением ACCEPT. Эти редакционные оценки не заменяют формального доказательства или решения Автора.","",
    "### Исторические MP и Γ: переход нормативных областей","",review.mp.scientificRu,"",
    "**Не следует:** "+review.mp.exclusionRu,"",
    "### Парные FORMAL-свидетельства и их реальные пределы","",review.proof.scientificRu,"",
    "**Не следует:** "+review.proof.exclusionRu,"",
    "### Принятая семантика и статусная инфраструктура","",review.authority.scientificRu,"",
    "**Не следует:** "+review.authority.exclusionRu,""];
  for(let i=0;i<review.rows.length;i++){
    const r=review.rows[i]!;
    if(i%12===0)appendix.push("### Рецензии исходной волны G11/"+r.wave,"");
    const source=sourcePaths[Math.floor(i/12)]!;
    appendix.push("**"+r.id+"** · "+r.kind+" · реестр: "+r.requirementState+
      " · редакционный статус: требуется авторская рецензия","",
      r.assessmentRu,"",
      "**Граница и дальнейшая проверка.** "+r.limitationRu,"",
      "Источник: [точный G11/"+r.wave+" / "+r.atom+"]("+pin(source,draftSourceSha)+
      "); [утверждённое требование]("+pin("requirements/mts-v0.15.json",mainSha)+").","");
  }
  const manuscript=base.replace(anchor,appendix.join("\n")+"\n"+anchor);
  must((manuscript.match(/^\*\*(?:g4:|g7:|g8:|g10:|g11:|basis:|concept:|editorial:)/gm)??[]).length===119,
    "R44-W3 cannot silently remove source-owned prose");
  must((manuscript.match(/^\*\*V15-[A-Z0-9-]+\*\* · /gm)??[]).length===48,
    "R44-W3 must render each independent review");
  return manuscript;
}
