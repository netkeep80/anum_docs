import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";
import { loadReaderG42 } from "./mts-reader-g42.js";
import { loadReaderR42 } from "./mts-reader-r42.js";
import { loadReaderR44W1, renderReaderR44W1Preview } from "./mts-reader-r44.js";

export const READER_R44_W2_PATH="requirements/mts-source/MTS-READER-INDIVIDUAL-MATH-REVIEW-R44-W2.yaml";
type Dict=Record<string,unknown>;
interface Case {id:string;chapter:string;anchor:string;sourceStep:string;finding:string;scientificRu:string;boundaryRu:string;state:string;}
export interface ReaderR44W2 {readonly cases:readonly Case[];readonly conclusionRu:string;readonly publication:"blocked";}
function assert(v:unknown,m:string):asserts v{if(!v)throw new Error("mts-reader-r44-w2: "+m);}
function obj(v:unknown,m:string):Dict{assert(v!==null&&typeof v==="object"&&!Array.isArray(v),m+" object");return v as Dict;}
function arr(v:unknown,m:string):unknown[]{assert(Array.isArray(v),m+" array");return v;}
function words(v:unknown,m:string,min=1):string{assert(typeof v==="string"&&v.trim().length>=min,m+" text");return v;}
function exact(o:Dict,expected:string[],m:string):void{assert(Object.keys(o).sort().join("|")===expected.sort().join("|"),m+" keys");}
function read(root:string,path:string):string{return readFileSync(resolve(root,path),"utf8");}
function yaml(text:string):Dict{const d=parseDocument(text,{strict:true,uniqueKeys:true});assert(!d.errors.length&&!d.warnings.length,"malformed/duplicate YAML");return obj(d.toJS({maxAliasCount:0}),"YAML");}
const acceptedSha="c64b7e21340c6add248c8f380f3fef1292616ac6";
const proposedSha="cb78e6b448d77d738e69f6e3effb84ef0b15d23f";
function url(sha:string,path:string):string{return "https://github.com/netkeep80/anum_docs/blob/"+sha+"/"+path;}
function signature(s:string,name:string,lean:boolean):string{
  const prefix=(lean?"theorem ":"Theorem ")+name;
  const start=s.indexOf(prefix);
  assert(start>=0,"formal proof symbol absent: "+prefix);
  const end=lean?s.indexOf(":= ",start):s.indexOf("Proof.",start);
  assert(end>start,"formal proof body/signature absent: "+name);
  return s.slice(start,end);
}
function premises(sig:string,include:string[],exclude:string[],at:string):void{
  for(const token of include)assert(sig.includes(token),at+" missing premise "+token);
  for(const token of exclude)assert(!sig.includes(token),at+" invented premise "+token);
}
export function parseReaderR44W2(text:string,root:string):ReaderR44W2{
  const r=yaml(text);
  exact(r,["schema","status","author_approval","publication","semantic_change","scientific_coverage",
    "upstream_review","source_foundation","source_bootstrap","source_arithmetic",
    "accepted_contract","proof_lean4","proof_rocq","accepted_sha","proposed_source_sha",
    "scientific_cases","unresolved"],"root");
  assert(r.schema==="mts-reader-individual-math-review-r44-w2/v0.1"&&r.status==="proposed"&&
    r.author_approval==="not-recorded"&&r.publication==="blocked"&&r.semantic_change===false&&
    r.scientific_coverage==="six-targeted-claims-not-universal-119-atom-review"&&
    r.upstream_review==="requirements/mts-source/MTS-READER-INDEPENDENT-MATH-AUDIT-R44-W1.yaml"&&
    r.source_foundation==="requirements/mts-source/MTS-FND-V14-L1.yaml"&&
    r.source_bootstrap==="requirements/mts-source/MTS-READER-BOOTSTRAP-G15.yaml"&&
    r.source_arithmetic==="requirements/mts-source/MTS-READER-V14-G7.yaml"&&
    r.accepted_contract==="contracts/mts-contract-v0.14.json"&&
    r.proof_lean4==="proofs/lean4/MtsFoundation.lean"&&
    r.proof_rocq==="proofs/coq/MtsFoundation.v"&&
    r.accepted_sha===acceptedSha&&r.proposed_source_sha===proposedSha,
    "cannot publish, change authority or inflate scientific scope");
  const g42=loadReaderG42(root),r42=loadReaderR42(root),w1=loadReaderR44W1(root);
  assert(w1.publication==="blocked"&&r42.publication==="blocked","upstream review authority");
  const foundation=yaml(read(root,r.source_foundation as string));
  const reader=obj(foundation.reader_science,"G4 reader_science");
  assert(reader.proof_check==="declarations-only"&&reader.publication==="blocked",
    "source science review cannot claim full formal proof");
  const steps=arr(reader.steps,"G4 steps").map(x=>obj(x,"step"));
  const g7=yaml(read(root,r.source_arithmetic as string));
  const g15=yaml(read(root,r.source_bootstrap as string));
  const contract=JSON.parse(read(root,r.accepted_contract as string)) as {
    accepted:boolean;natTheory:{status:string;zero:string;one:string;successor:string;oneEqualsDegreeOne:boolean};
    connectivityDegreeTheory:{one:string;successor:string;preservedSeparately:boolean};
  };
  assert(contract.accepted&&contract.natTheory.status==="GREEN_RESEARCH"&&
    contract.natTheory.zero==="N0 = U"&&contract.natTheory.one==="N1 = U ⟼ L"&&
    contract.natTheory.successor==="Succ(N) = N ⟼ L"&&
    contract.natTheory.oneEqualsDegreeOne===false&&
    contract.connectivityDegreeTheory.one==="D1 = L"&&
    contract.connectivityDegreeTheory.successor==="NextDegree(D) = D ⟼ L"&&
    contract.connectivityDegreeTheory.preservedSeparately,"Nat/Degree accepted scope drift");
  const lean=read(root,r.proof_lean4 as string),rocq=read(root,r.proof_rocq as string);
  const names=["FND_02_unique_root","FND_13_identity_by_poles",
    "CTX_03_objective_chiral_orbit_before_context","CTX_03_context_selection_induces_local_roles"];
  const sl=new Map(names.map(n=>[n,signature(lean,n,true)]));
  const sc=new Map(names.map(n=>[n,signature(rocq,n,false)]));
  for(const proof of ["FND_02_unique_root"]) {
    premises(sl.get(proof)!,["A1RecursiveSeparation","FullSelf"],["F2F3GroundedNormalization"],"Lean root");
    premises(sc.get(proof)!,["A1RecursiveSeparation","FullSelf"],["F2F3GroundedNormalization"],"Rocq root");
  }
  premises(sl.get("FND_13_identity_by_poles")!,["F2F3GroundedNormalization","Grounded F x","Grounded F y"],[],"Lean FND13");
  premises(sc.get("FND_13_identity_by_poles")!,["F2F3GroundedNormalization","Grounded F x","Grounded F y"],[],"Rocq FND13");
  for(const n of names.slice(2)){
    const isOrbit=n.includes("objective");
    const required=["A1RecursiveSeparation","F2F3OneSidedExistence","RecursiveInversionDomain",
      ...(isOrbit?["F2F3GroundedNormalization"]:["ContextOrientationMarker"])];
    const forbidden=isOrbit?["ContextOrientationMarker"]:["F2F3GroundedNormalization"];
    premises(sl.get(n)!,required,forbidden,"Lean "+n);
    premises(sc.get(n)!,required,forbidden,"Rocq "+n);
  }
  assert(lean.includes("theorem local_self_incidence_exhaustive")&&
    rocq.includes("local_self_incidence_exhaustive")&&
    lean.includes("theorem FND_01_grounded_realizability")&&
    rocq.includes("Theorem FND_01_grounded_realizability"),
    "exhaustiveness/realizability proof witnesses absent");
  const expected=[
    ["R44-W2-01","foundational-forms","g4:foundation","foundation","R40-07"],
    ["R44-W2-02","foundational-forms","g4:local-exhaustiveness","local-exhaustiveness","R40-07"],
    ["R44-W2-03","grounded-inverse-context","g4:identity-by-poles","identity-by-poles","R40-12"],
    ["R44-W2-04","grounded-inverse-context","g4:chiral-orbit","chiral-orbit","R40-12"],
    ["R44-W2-05","grounded-inverse-context","g4:context-roles","context-roles","R40-12"],
    ["R44-W2-06","derived-and-context","g7:nat-degree-nonidentity","nat-degree-nonidentity","R40-12"]
  ] as const;
  const cases=arr(r.scientific_cases,"scientific_cases").map((v,i)=>{
    const c=obj(v,"case");exact(c,["id","chapter","anchor","source_step","finding",
      "state","scientific_ru","boundary_ru"],"case");
    const [id,chapter,anchor,step,finding]=expected[i]??[];
    assert(id!==undefined&&c.id===id&&c.chapter===chapter&&c.anchor===anchor&&
      c.source_step===step&&c.finding===finding&&
      c.state==="individual-reviewed-author-review-required","case identity/scope changed");
    assert(g42.chapters.find(x=>x.id===chapter)?.atomIds.includes(anchor),
      "scientific claim not in claimed academic chapter");
    const node=i!==5?steps.find(x=>x.id===step):
      arr(g7.atoms,"G7 atoms").map(v=>obj(v,"G7 atom")).find(x=>x.id===step);
    assert(node&&typeof node.ru==="string"&&(node.ru as string).length>100,
      "case not supported by exact source-owned paragraph");
    if(i===5)assert((node as Dict).accepted_id==="V14-L6","Nat/Degree must belong to V14-L6");
    const scientificRu=words(c.scientific_ru,"individual mathematical statement",190);
    const boundaryRu=words(c.boundary_ru,"epistemic exclusion",150);
    const required=[
      ["Foundation","A1RecursiveSeparation","FND_02_unique_root"],
      ["LocalSelfDecision","F2F3OneSidedExistence","FND_01_grounded_realizability"],
      ["FND_13_identity_by_poles","Grounded","F2F3GroundedNormalization"],
      ["CTX_03_objective_chiral_orbit_before_context","ContextOrientationMarker","F2F3GroundedNormalization"],
      ["CTX_03_context_selection_induces_local_roles","ContextOrientationMarker","F2F3GroundedNormalization"],
      ["N₀=U","D₁=L","oneEqualsDegreeOne=false"]
    ][i]!;
    assert(required.every(t=>scientificRu.includes(t)),"case scientific premises not individually documented: "+id);
    return {id,chapter,anchor,sourceStep:step,finding,state:c.state as string,scientificRu,boundaryRu};
  });
  assert(cases.length===6&&g15.schema==="mts-reader-bootstrap-symbols/v0.1"&&
    (g15.symbols as unknown[]).length===5,"six claims or accepted bootstrap basis drift");
  const rest=obj(r.unresolved,"R40");
  exact(rest,["prior_corrected","awaiting_rereview","remaining_open","conclusion_ru"],"R40");
  assert(JSON.stringify(rest.prior_corrected)===JSON.stringify(g42.findings.corrected)&&
    JSON.stringify(rest.awaiting_rereview)===JSON.stringify(g42.findings.mitigated)&&
    JSON.stringify(rest.remaining_open)===JSON.stringify(g42.findings.open),
    "R44-W2 may not close previously open R40");
  return {cases,conclusionRu:words(rest.conclusion_ru,"review conclusion",130),publication:"blocked"};
}
export function loadReaderR44W2(root:string):ReaderR44W2{
  return parseReaderR44W2(read(root,READER_R44_W2_PATH),root);
}
export function renderReaderR44W2Preview(root:string):string{
  const plan=loadReaderR44W2(root);
  let out=renderReaderR44W1Preview(root);
  assert(plan.publication==="blocked"&&out.includes("ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА"),
    "R44-W2 cannot publish");
  const g42=loadReaderG42(root);
  for(const review of plan.cases){
    const ch=g42.chapters.find(x=>x.id===review.chapter)!;
    const title="## "+ch.titleRu;
    assert(out.split(title).length===2,"academic chapter occurrence drift "+title);
    const at=review.id==="R44-W2-06"?"G7 / "+review.sourceStep:"G4 / "+review.sourceStep;
    const source=review.id==="R44-W2-06"?"requirements/mts-source/MTS-READER-V14-G7.yaml":
      "requirements/mts-source/MTS-FND-V14-L1.yaml";
    const para=["### "+review.id+" — проверка "+review.anchor,"",
      review.scientificRu,"", "**Область и исключения.** "+review.boundaryRu,"",
      "Первичный научный текст: ["+at+"]("+url(proposedSha,source)+
      "); [Lean4]("+url(acceptedSha,"proofs/lean4/MtsFoundation.lean")+
      "); [Rocq]("+url(acceptedSha,"proofs/coq/MtsFoundation.v")+
      "); [принятый контракт v0.14]("+url(acceptedSha,"contracts/mts-contract-v0.14.json")+").",""].join("\n");
    out=out.replace(title,title+"\n\n"+para);
  }
  const end="## Редакционные ограничения R40";
  assert(out.split(end).length===2,"final scientific boundary");
  out=out.replace(end,"### R44-W2 — граница научного подтверждения\n\n"+
    plan.conclusionRu+"\n\n"+end);
  assert((out.match(/^\*\*(?:g4:|g7:|g8:|g10:|g11:|basis:|concept:|editorial:)/gm)??[]).length===119,
    "all 119 original source paragraphs must remain");
  return out;
}
