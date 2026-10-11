import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";
import { loadReaderG41 } from "./mts-reader-g20.js";
import { loadReaderG42, renderReaderG42Preview } from "./mts-reader-g42.js";
import { loadReaderR42 } from "./mts-reader-r42.js";

export const READER_R43_PATH="requirements/mts-source/MTS-READER-SOURCE-ATTRIBUTION-R43.yaml";
function valid(ok:unknown,why:string):asserts ok{
  if(!ok)throw new Error("mts-reader-r43: "+why);
}
function map(v:unknown,where:string):Record<string,unknown>{
  valid(v!==null&&typeof v==="object"&&!Array.isArray(v),where+" mapping expected");
  return v as Record<string,unknown>;
}
function txt(v:unknown,where:string,min=1):string{
  valid(typeof v==="string"&&v.trim().length>=min,where+" text missing");
  return v;
}
function list(v:unknown,where:string):unknown[]{
  valid(Array.isArray(v),where+" array expected");return v;
}
function shape(v:Record<string,unknown>,all:string[],where:string):void{
  valid(Object.keys(v).sort().join("|")===all.sort().join("|"),where+" unexpected keys");
}
function occurOnce(big:string,small:string,where:string):void{
  valid(big.split(small).length===2,where+" must appear exactly once");
}
const shaPin="c64b7e21340c6add248c8f380f3fef1292616ac6";
function link(path:string):string{return "https://github.com/netkeep80/anum_docs/blob/"+shaPin+"/"+path;}
interface Owner {symbol:string;owner:string;atom:string;accepted:string;heading:string;scope:string;}
interface ProofFiles {lean4:string;rocq:string;bootstrap:string;refinement:string;inventory:string;}
interface Examples {formal:string;json:string;negative:string;exact:string;andRu:string;exactRu:string;exclusions:string;}
export interface ReaderR43 {
  readonly q:Owner;readonly basis:readonly Owner[];readonly proofFiles:ProofFiles;
  readonly examples:Examples;readonly boundary:string;readonly publication:"blocked";
}
function owner(v:unknown,symbol:string,own:string,atom:string,id:string,basis:boolean):Owner{
  const x=map(v,"source attribution");
  shape(x,basis?["symbol","owner","source_atom","accepted_id","heading_ru","scope_ru"]:
    ["source_owner","source_atom","accepted_id","heading_ru","scope_ru"],"source attribution");
  valid((basis?x.symbol:symbol)===symbol&&(basis?x.owner:x.source_owner)===own&&
    x.source_atom===atom&&x.accepted_id===id,"source owner drift for "+symbol);
  const heading=txt(x.heading_ru,"attributed heading",35);
  valid(heading.includes(atom)&&heading.includes(id),"attribution heading lacks owner");
  return {symbol,owner:own,atom,accepted:id,heading,scope:txt(x.scope_ru,"source scope",75)};
}
function file(root:string,path:string):string{return readFileSync(resolve(root,path),"utf8");}
export function parseReaderR43(source:string,root:string):ReaderR43{
  const doc=parseDocument(source,{strict:true,uniqueKeys:true});
  valid(doc.errors.length===0&&doc.warnings.length===0,"malformed/duplicate YAML");
  const r=map(doc.toJS({maxAliasCount:0}),"R43");
  shape(r,["schema","status","author_approval","publication","semantic_change","review_status",
    "source_composition","source_review","first_use_model","main_source_sha",
    "q_attribution","basis_attributions","proof_sources","examples","outstanding"],"R43");
  valid(r.schema==="mts-reader-source-attribution-r43/v0.1"&&r.status==="proposed"&&
    r.author_approval==="not-recorded"&&r.publication==="blocked"&&
    r.semantic_change===false&&r.review_status==="editorial-candidate-requires-author-review"&&
    r.main_source_sha===shaPin&&
    r.source_composition==="requirements/mts-source/MTS-READER-ACADEMIC-COMPOSITION-G42.yaml"&&
    r.source_review==="requirements/mts-source/MTS-READER-SCIENTIFIC-SECOND-PASS-R42.yaml"&&
    r.first_use_model==="requirements/mts-source/MTS-READER-FIRST-USE-REPAIR-G41.yaml",
    "no implicit approval, new semantics or moving accepted main authority");
  const g41=loadReaderG41(root),g42=loadReaderG42(root),r42=loadReaderR42(root);
  valid(g41.publication==="blocked"&&g42.publication==="blocked"&&r42.publication==="blocked",
    "source model publication boundary");
  const q=owner(r.q_attribution,"Q","G7","g7:q-codec","V14-L13",false);
  valid(q.scope.includes("Q13/Q14"),"Q scope boundary lost");
  const b=list(r.basis_attributions,"deferred basis");
  valid(b.length===2,"exactly two original G15 source attributions");
  const basis=b.map((v,i)=>owner(v,i===0?"L":"U","G15",
    i===0?"basis:L":"basis:U","V14-L1",true));
  for(let i=0;i<2;i++){
    const first=g41.deferred[i]!,entry=basis[i]!;
    valid(entry.symbol===first.symbol&&
      entry.scope.includes(i===0?"Degree":"ExactSequence"),"basis scope mismatch");
    valid(g42.order.indexOf(first.afterNode)>g42.order.indexOf(first.firstUseNode),
      "basis commentary before first use");
    valid(g42.order.indexOf(i===0?"g7:degree-one":"concept:exact-sequence-first-use") <
      g42.order.indexOf(first.afterNode),"scientific prerequisite missing for "+entry.symbol);
  }
  const f=map(r.proof_sources,"proof sources");
  shape(f,["lean4","rocq","bootstrap","refinement","inventory","cases"],"proof sources");
  valid(f.lean4==="proofs/lean4/MtsV015Formal.lean"&&f.rocq==="proofs/coq/MtsV015Formal.v"&&
    f.bootstrap==="proofs/v015-evidence/formal-bootstrap-frm01-06.json"&&
    f.refinement==="proofs/v015-evidence/formal-refinement-frm07-08.json"&&
    f.inventory==="proofs/v015-formal-proof-assurance.json"&&
    JSON.stringify(f.cases)===JSON.stringify(["FRM-03","FRM-04","FRM-07"]),
    "proof source and theorem identity drift");
  const proofFiles:ProofFiles={lean4:f.lean4 as string,rocq:f.rocq as string,
    bootstrap:f.bootstrap as string,refinement:f.refinement as string,inventory:f.inventory as string};
  const lean=file(root,proofFiles.lean4),rocq=file(root,proofFiles.rocq);
  const bEvidence=JSON.parse(file(root,proofFiles.bootstrap)) as {targets:{id:string}[]};
  const rEvidence=JSON.parse(file(root,proofFiles.refinement)) as {targets:{id:string}[]};
  valid(g42.proofCases.length===3,"proof coverage drift");
  for(const p of g42.proofCases){
    valid((p.id==="FRM-07"?rEvidence.targets:bEvidence.targets).some(x=>x.id===p.id),
      "proof not in accepted evidence "+p.id);
    valid(p.lean4.every(x=>lean.includes(x.split(".").at(-1)!)) &&
      p.rocq.every(x=>rocq.includes(x.split(".").at(-1)!)),
      "Lean4/Rocq symbol missing for "+p.id);
    valid(p.exclusions.length>0&&p.classification.length>0,"proof scope missing");
  }
  valid(g42.proofCases[1]?.classification==="PROVED_UNDER_EXACT_SEQUENCE_INJECTIVITY"&&
    g42.proofCases[2]?.classification==="PROVED_UNDER_EXPLICIT_PRODUCTION_REFINEMENT_PREMISES",
    "production injectivity/TS proof must not be invented");
  const e=map(r.examples,"examples");
  shape(e,["formal","json","negative","exact","and_ru","exact_ru","exclusions_ru"],"examples");
  valid(e.formal==="formal/v0.15/regression/compact-and.formal"&&
    e.json==="formal/v0.15/regression/compact-and.json"&&
    e.negative==="ts/test/v015-compact-and-role-bundle-a1.test.ts"&&
    e.exact==="ts/test/v015-formal-exact-sequence-b7.test.ts",
    "new executable artifact not approved");
  const examples:Examples={formal:e.formal as string,json:e.json as string,
    negative:e.negative as string,exact:e.exact as string,
    andRu:txt(e.and_ru,"AND explanation",95),exactRu:txt(e.exact_ru,"ExactSequence explanation",95),
    exclusions:txt(e.exclusions_ru,"example exclusions",95)};
  valid(examples.andRu.includes("NO_MATCH")&&examples.exactRu.includes("F_R")&&
    examples.exclusions.includes("F_R")&&examples.exclusions.includes("не доказывают"),
    "example evidence cannot become a theorem");
  const end=map(r.outstanding,"open findings");
  shape(end,["open_findings","boundary_ru"],"R40 outstanding");
  valid(JSON.stringify(end.open_findings)===JSON.stringify(r42.findings.filter(x=>x.state==="open").map(x=>x.id)),
    "cannot promote R40 findings");
  return {q,basis,proofFiles,examples,boundary:txt(end.boundary_ru,"R43 caveat",95),publication:"blocked"};
}
export function loadReaderR43(root:string):ReaderR43{
  return parseReaderR43(file(root,READER_R43_PATH),root);
}
export function renderReaderR43Preview(root:string):string{
  const m=loadReaderR43(root),g41=loadReaderG41(root),g42=loadReaderG42(root),
    r42=loadReaderR42(root);
  let draft=renderReaderG42Preview(root);
  valid(m.publication==="blocked"&&draft.includes("ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА"),
    "publication must remain blocked");
  const qOld="#### Первое определение Q (точный фрагмент G7)";
  occurOnce(draft,qOld,"first-use Q");
  draft=draft.replace(qOld,"### "+m.q.heading+"\n\n"+
    "*Граница: "+m.q.scope+"*\n\nИсточник: G7 / "+m.q.atom+" / "+m.q.accepted+".");
  valid(draft.indexOf("### "+m.q.heading)<draft.indexOf("**g7:recursive-codec**"),
    "Q first definition must precede codec comparison");
  for(let i=0;i<2;i++){
    const item=m.basis[i]!,original=g41.deferred[i]!;
    const old="#### Отложенное пояснение к "+item.symbol+" (исходный G15)";
    occurOnce(draft,old,"original G15 delayed heading");
    draft=draft.replace(old,"### "+item.heading+"\n\n"+
      "*Граница: "+item.scope+"*\n\nИсточник: G15 / "+item.atom+" / "+item.accepted+".");
    occurOnce(draft,original.sourceExplanationRu,"G15 complete unaltered commentary");
    valid(draft.indexOf("**"+original.afterNode+"**")<draft.indexOf("### "+item.heading),
      "basis commentary must follow mathematical introduction");
  }
  for(const p of g42.proofCases){
    const marker="**"+p.id+" — "+p.classification+"**";
    occurOnce(draft,marker,"exact proof case");
    const ev=p.id==="FRM-07"?m.proofFiles.refinement:m.proofFiles.bootstrap;
    const citation="\n\nИсходный файл: [Lean4]("+link(m.proofFiles.lean4)+
      "), [Rocq]("+link(m.proofFiles.rocq)+"), [реестр предпосылок]("+
      link(m.proofFiles.inventory)+"), [свидетельство]("+link(ev)+").";
    draft=draft.replace(marker,marker+citation);
  }
  const proofTitle="## Формально проверенный фрагмент и пределы свидетельств";
  occurOnce(draft,proofTitle,"academic proof chapter");
  const rows=r42.truth.map(t=>"| "+t.case+" | "+t.rule+" | "+t.image+" |");
  const insert=["### Исполняемый пример из принятого корпуса: AND","",
    m.examples.andRu,"","[FORMAL]("+link(m.examples.formal)+"), [канонический JSON]("+
      link(m.examples.json)+"), [тест NO_MATCH]("+link(m.examples.negative)+").","",
    "| Вход | Правило | Результат |","|---|---|---|",...rows,"",r42.negativeRu,"",
    "### Точная позиционная последовательность ExactSequence и F_R","",
    m.examples.exactRu,"","[Тест B7]("+link(m.examples.exact)+").","",
    ...r42.sequenceObservations.map(x=>"- "+x),"",
    m.examples.exclusions,"",r42.forbiddenRu,""].join("\n");
  draft=draft.replace(proofTitle,insert+"\n"+proofTitle);
  const closing="## Редакционные ограничения R40";
  occurOnce(draft,closing,"scientific status boundary");
  draft=draft.replace(closing,"### Статус R43\n\n"+m.boundary+"\n\n"+closing);
  const atoms=(draft.match(/^\*\*(?:g4:|g7:|g8:|g10:|g11:|basis:|concept:|editorial:)/gm)??[]).length;
  valid(atoms===119,"R43 cannot remove or duplicate any of 119 sources");
  return draft;
}
