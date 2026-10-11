import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseDocument} from "yaml";

export const REVIEW_F01_F02_P01_PATH="requirements/mts-source/MTS-READER-FOUNDATION-MODEL-PROOF-F01-F02-P01.yaml";
const accepted="c64b7e21340c6add248c8f380f3fef1292616ac6";
const blobs:Record<string,string>={
 "proofs/lean4/MtsFoundation.lean":"f283192148ef5381f02a0b23d50b9884cf10b0c0",
 "proofs/coq/MtsFoundation.v":"66db1fb851724898112cfcd9ba5022c4d766b35d",
 "proofs/lean4/MtsExplicitModel.lean":"744309364e08dc9b554bde7c3138b7ba84387a72",
 "proofs/coq/MtsExplicitModel.v":"6dd9823754e3ac52d8cd7f4184ff8b71d496f8c3",
 "proofs/lean4/MtsV015Formal.lean":"35a3a348376c5b734c63fc399ce2d295d15f7c9d",
 "proofs/coq/MtsV015Formal.v":"9bfe4c053dcee8b90f58215bffa0029a2d27cb39",
 "proofs/v015-formal-proof-assurance.json":"e348e8419669a956d211e91302b9122ee49f881c"
};
type Row=Record<string,unknown>;
export interface ReviewDossier {
 readonly foundationMd:string;readonly modelMd:string;readonly assuranceMd:string;
 readonly statuses:readonly {id:string;classification:string;premises:readonly string[];exclusions:readonly string[]}[];
 readonly publication:"blocked";
}
function guard(v:unknown,m:string):asserts v{if(!v)throw Error("review-F01-F02-P01: "+m);}
function map(v:unknown,m:string):Row{guard(v!==null&&typeof v==="object"&&!Array.isArray(v),m+" mapping");return v as Row;}
function shape(v:Row,keys:readonly string[],m:string):void{
 guard(Object.keys(v).sort().join("|")===[...keys].sort().join("|"),m+" exact keys");
}
function text(v:unknown,m:string,min=145):string{
 guard(typeof v==="string"&&v.trim().length>=min,m+" substantial Russian prose");
 return v;
}
function arr(v:unknown,m:string):unknown[]{guard(Array.isArray(v),m+" array");return v;}
function exact(v:unknown,expected:readonly string[],m:string):void{
 guard(JSON.stringify(arr(v,m))===JSON.stringify(expected),m+" exact order");
}
function parse(s:string):Row{
 const d=parseDocument(s,{strict:true,uniqueKeys:true});
 guard(d.errors.length===0&&d.warnings.length===0,"malformed/duplicate YAML");
 return map(d.toJS({maxAliasCount:0}),"review");
}
function local(root:string,p:string){return readFileSync(resolve(root,p),"utf8");}
function anchored(root:string,p:string){
 const content=local(root,p),blob=blobs[p];
 guard(typeof blob==="string","source path not approved: "+p);
 const b=Buffer.from(content,"utf8");
 const actual=createHash("sha1").update("blob "+b.byteLength+"\0").update(b).digest("hex");
 guard(actual===blob,"proof SHA drift: "+p);
 return content;
}
function symbols(source:string,expected:readonly string[],p:string){
 for(const name of expected)guard(source.includes(name),"proof symbol missing "+name+" in "+p);
}
function link(p:string){return "https://github.com/netkeep80/anum_docs/blob/"+accepted+"/"+p;}
const fFields=["carrier_ru","axioms_ru","logic_ru","injectivity_ru","root_ru",
 "cardinality_ru","grounded_ru","no_overclaim_ru"];
const mFields=["carrier_ru","form_ru","witnesses_ru","grounding_ru","basis_ru",
 "provenance_ru","remaining_ru"];
const fSym=["Foundation","fnd13_form_injective","FND_02_unique_root","Grounded",
 "A1RecursiveSeparation","F2F3GroundedNormalization","FND_13_identity_by_poles"];
const mSym=["ExplicitFoundation","ExplicitOneSided","ExplicitInversionDomain",
 "ExplicitGroundedNormalization","explicit_a1","fallback_cycle_not_grounded"];
const pSym=["FRM_01_absolute_contextual_name","FRM_02_root_source_role_separation",
 "FRM_03_direct_sequential_association_three","FRM_04_single_root_distinct_from_empty",
 "FRM_05_shared_source_implies_shared_denotation","FRM_06_metacompiler_preserves_semantics",
 "FRM_07_approved_artifact_refinement","FRM_08_structural_aspect_denotation"];
const classes=[
 "PROVED_IN_SELECTED_MATHEMATICAL_MODEL",
 "PROVED_IN_SELECTED_MATHEMATICAL_MODEL",
 "PROVED_IN_SELECTED_MATHEMATICAL_MODEL",
 "PROVED_UNDER_EXACT_SEQUENCE_INJECTIVITY",
 "PROVED_UNDER_SHARED_NATIVE_SOURCE_PREMISE",
 "PROVED_UNDER_METACOMPILER_ROUNDTRIP_PREMISE",
 "PROVED_UNDER_EXPLICIT_PRODUCTION_REFINEMENT_PREMISES",
 "PROVED_IN_SELECTED_MATHEMATICAL_MODEL_WITH_PRODUCTION_WITNESS"
];
export function parseReaderF01F02P01(source:string,root:string):ReviewDossier{
 const d=parse(source);
 shape(d,["schema","status","author_approval","publication","semantic_change",
 "accepted_main_sha","master_issue","original_questions","review_packages",
 "provenance","foundation","explicit_model","assurance"],"dossier");
 guard(d.schema==="mts-v015-review-foundation-model-proof-dossier/v0.1"&&
 d.status==="proposed"&&d.author_approval==="not-recorded"&&d.publication==="blocked"&&
 d.semantic_change===false&&d.accepted_main_sha===accepted&&d.master_issue===2217&&
 d.original_questions===178,"accepted authority / review status");
 exact(d.review_packages,["F01","F02","P01"],"selected wave");
 const p=map(d.provenance,"source provenance");
 const files={foundation_lean:"proofs/lean4/MtsFoundation.lean",
 foundation_rocq:"proofs/coq/MtsFoundation.v",
 model_lean:"proofs/lean4/MtsExplicitModel.lean",
 model_rocq:"proofs/coq/MtsExplicitModel.v",
 formal_lean:"proofs/lean4/MtsV015Formal.lean",
 formal_rocq:"proofs/coq/MtsV015Formal.v",
 assurance:"proofs/v015-formal-proof-assurance.json",
 requirement_registry:"requirements/mts-v0.15.json"};
 shape(p,Object.keys(files),"source provenance");
 for(const [key,path] of Object.entries(files))guard(p[key]===path,"source authority redirected: "+key);
 const f=map(d.foundation,"F01"),m=map(d.explicit_model,"F02"),a=map(d.assurance,"P01");
 shape(f,["heading_ru",...fFields,"lean_symbols","rocq_symbols"],"Foundation");
 shape(m,["heading_ru",...mFields,"lean_symbols","rocq_symbols"],"Explicit model");
 shape(a,["heading_ru","intro_ru","note_ru","cases","production_gate_ru",
 "formal_lean_symbols","formal_rocq_symbols"],"FRM assurance");
 const fh=text(f.heading_ru,"Foundation heading",45),
 mh=text(m.heading_ru,"Model heading",45),
 ah=text(a.heading_ru,"P01 heading",45);
 exact(f.lean_symbols,fSym,"Lean Foundation symbols");
 exact(f.rocq_symbols,fSym,"Rocq Foundation symbols");
 exact(m.lean_symbols,mSym,"Lean model symbols");
 exact(m.rocq_symbols,mSym,"Rocq model symbols");
 exact(a.formal_lean_symbols,pSym,"Lean FRM symbols");
 exact(a.formal_rocq_symbols,pSym,"Rocq FRM symbols");
 const found=[files.foundation_lean,files.foundation_rocq,files.model_lean,
  files.model_rocq,files.formal_lean,files.formal_rocq,files.assurance];
 const src=found.map(path=>anchored(root,path));
 symbols(src[0]!,fSym,found[0]!);symbols(src[1]!,fSym,found[1]!);
 symbols(src[2]!,mSym,found[2]!);symbols(src[3]!,mSym,found[3]!);
 symbols(src[4]!,pSym,found[4]!);symbols(src[5]!,pSym,found[5]!);
 const proof=JSON.parse(src[6]!) as {status:string;targets:Array<{
  id:string;classification:string;premises:string[];exclusions:string[];
  lean4:string[];rocq:string[]}>};
 guard(proof.status==="EXECUTION_CORE_PROOF_GREEN"&&proof.targets.length===8,
 "accepted assurance registry");
 const registry=JSON.parse(local(root,files.requirement_registry)) as {
  mtsVersion:string;status:string;accepted:boolean};
 guard(registry.mtsVersion==="v0.15"&&registry.status==="accepted"&&registry.accepted===true,
 "normative registry anchor");
 const cases=arr(a.cases,"FRM case reviews").map((v,i)=>{
  const r=map(v,"FRM case");shape(r,["id","meaning_ru"],"individual FRM");
  guard(r.id==="FRM-0"+(i+1),"individual FRM order");
  return {id:r.id as string,ru:text(r.meaning_ru,"FRM scientific review",140)};
 });
 guard(cases.length===8,"exact eight FRM cases");
 const statuses=proof.targets.map((t,i)=>{
  guard(t.id===cases[i]!.id&&t.classification===classes[i]&&
    Array.isArray(t.premises)&&Array.isArray(t.exclusions)&&
    t.lean4.some(x=>x.includes(pSym[i]!))&&t.rocq.some(x=>x.includes(pSym[i]!)),
   "FRM classification or proof signature drift: "+t.id);
  return {id:t.id,classification:t.classification,premises:t.premises,exclusions:t.exclusions};
 });
 const ftext=["### "+fh,"",...fFields.flatMap(k=>[text(f[k],"Foundation "+k),""]),
 "[Lean4 Foundation]("+link(files.foundation_lean)+") · [Rocq Foundation]("+link(files.foundation_rocq)+")",""].join("\n");
 const mtext=["### "+mh,"",...mFields.flatMap(k=>[text(m[k],"Model "+k),""]),
 "[Lean4 explicit model]("+link(files.model_lean)+") · [Rocq explicit model]("+link(files.model_rocq)+")",""].join("\n");
 const rows=["| FRM | Класс из принятого assurance | Явные предпосылки | Ограничения |",
 "|---|---|---|---|"];
 for(const s of statuses)rows.push("| "+s.id+" | "+s.classification+" | "+
   (s.premises.join("; ")||"нет дополнительных гипотез в реестре").replaceAll("|","/")+" | "+
   (s.exclusions.join("; ")||"—").replaceAll("|","/")+" |");
 const atext=["### "+ah,"",text(a.intro_ru,"P01 scope"),"",
 text(a.note_ru,"P01 epistemic logic"),"",...rows,"",
 ...cases.flatMap(x=>["**"+x.id+".** "+x.ru,""]),
 text(a.production_gate_ru,"P01 production gate"),"",
 "[Proof assurance]("+link(files.assurance)+") · [Lean4 FRM]("+link(files.formal_lean)+") · [Rocq FRM]("+link(files.formal_rocq)+")",""].join("\n");
 return {foundationMd:ftext,modelMd:mtext,assuranceMd:atext,statuses,publication:"blocked"};
}
export function loadReaderF01F02P01(root:string):ReviewDossier{
 return parseReaderF01F02P01(local(root,REVIEW_F01_F02_P01_PATH),root);
}
