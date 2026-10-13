import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseDocument} from "yaml";
import {loadReaderF03F04F05} from "./mts-reader-review-f03-f04-f05.js";

export const REVIEW_F06_F07_PATH="requirements/mts-source/MTS-READER-INVERSION-ORIENTATION-F06-F07.yaml";
type Row=Record<string,unknown>;
export interface F06F07 {
 readonly inversionMd:string;
 readonly orientationMd:string;
 readonly theorems:readonly {id:string;symbol:string;scope:string;assumptions:readonly string[]}[];
 readonly openObligations:readonly string[];
 readonly publication:"blocked";
}
const mainSha="c64b7e21340c6add248c8f380f3fef1292616ac6";
const paths={lean:"proofs/lean4/MtsFoundation.lean",rocq:"proofs/coq/MtsFoundation.v"};
const invFields=["signature_ru","rules_ru","functional_ru","involution_ru","scope_ru","example_ru","gap_ru"];
const oriFields=["classes_ru","z2_ru","mirror_ru","context_ru","chi_ru","semantic_ru","boundary_ru","gap_ru"];
const cases=[
 ["INV-01-TOTAL","INV_01_recursive_inversion_total",["A1","E","D","Grounded"],"exists-image-grounded"],
 ["INV-01-FUNCTIONAL","recursive_inversion_functional",["D","Edge(x,y)","Edge(x,z)"],"unique-existing-image"],
 ["INV-01-UNIQUE","INV_01_recursive_inversion_unique_total",["A1","E","D","Grounded"],"unique-total-grounded"],
 ["INV-02-RELATIONAL","INV_02_recursive_inversion_involutive",["A1","N","E","D","Edge(x,y)","Edge(y,z)"],"involution-two-edges"],
 ["INV-02-TOTAL","INV_02_unique_total_involution",["A1","N","E","D","Grounded"],"total-involution-grounded"],
 ["INV-06","INV_06_root_basis",["A1","N","E","D"],"root-basis-evidence"],
 ["INV-07","INV_07_objective_chirality",["A1","N","E","D","Edge(x,y)"],"one-sided-chiral-mirror"],
 ["CTX-03-Z2","CTX_03_relational_z2_support",["A1","N","E","D"],"proper-one-sided-relational-z2"],
 ["CTX-03-MARKER","CTX_03_context_selection_induces_local_roles",["A1","E","D","ContextOrientationMarker"],"local-role-existence"],
 ["CTX-03-ORBIT","CTX_03_objective_chiral_orbit_before_context",["A1","N","E","D"],"objective-chiral-two-element-orbit"],
 ["CTX-03-CHI","CTX_03_context_marker_selects_unique_chi",["A1","E","D","ContextOrientationMarker"],"unique-local-chi"],
 ["CTX-03-COVARIANCE","CTX_03_simultaneous_inversion_covariance",["A1","N","E","D","Edge(a,ja)","Edge(b,jb)"],"same-opposite-covariance"],
 ["CTX-03-GAUGE","CTX_03_context_relative_gauge",["A1","N","E","D"],"context-relative-gauge"],
 ["CTX-03-SEMANTIC","CTX_03_semantic_covariance_capstone",["A1","N","E","D"],"chosen-semantic-mp-slice"]
] as const;
const obligations=["INVERSION_NON_GROUNDED_EXTENSION","CTX_GAMMA_REFINEMENT_BRIDGE",
 "GLOBAL_Z2_ACTION_NOT_CLAIMED"] as const;
function guard(v:unknown,m:string):asserts v{if(!v)throw Error("review-F06-F07: "+m);}
function rec(v:unknown,m:string):Row{
 guard(v!==null&&typeof v==="object"&&!Array.isArray(v),m+" mapping");
 return v as Row;
}
function shape(v:Row,keys:readonly string[],m:string){
 guard(Object.keys(v).sort().join("|")===[...keys].sort().join("|"),m+" exact keys");
}
function equal(v:unknown,x:unknown,m:string){
 guard(JSON.stringify(v)===JSON.stringify(x),m+" changed");
}
function prose(v:unknown,m:string,min=150):string{
 guard(typeof v==="string"&&v.trim().length>=min,m+" substantive statement absent");
 return v;
}
function read(root:string,p:string){return readFileSync(resolve(root,p),"utf8");}
function href(p:string){return "https://github.com/netkeep80/anum_docs/blob/"+mainSha+"/"+p;}
function checkSymbols(src:string,where:string){
 const names=["RecursiveInversion","RecursiveInversionDomain","ContextOrientationMarker",
  "SameChiralClass","OppositeChiralClass","ContextLocalStartRole","ContextLocalEndRole",
  ...cases.map(x=>x[1])];
 for(const name of names)guard(src.includes(name),"missing accepted proof "+where+"/"+name);
}
function paragraphList(v:Row,keys:readonly string[],m:string){
 return keys.flatMap(x=>[prose(v[x],m+"."+x),""]);
}
export function parseReaderF06F07(source:string,root:string):F06F07{
 const previous=loadReaderF03F04F05(root);
 guard(previous.publication==="blocked"&&previous.pairs.length===10,
  "F03/F04/F05 proof-pinned prerequisite");
 const document=parseDocument(source,{strict:true,uniqueKeys:true});
 guard(!document.errors.length&&!document.warnings.length,"invalid or duplicated YAML");
 const doc=rec(document.toJS({maxAliasCount:0}),"review");
 shape(doc,["schema","status","author_approval","publication","semantic_change",
  "accepted_main_sha","master_issue","upstream_review","review_packages",
  "reviewer_question_refs","proof_sources","inversion","orientation",
  "theorem_evidence","open_obligations"],"F06-F07 root");
 guard(doc.schema==="mts-v015-review-inversion-chirality-orientation-f06-f07/v0.1"&&
  doc.status==="proposed"&&doc.author_approval==="not-recorded"&&
  doc.publication==="blocked"&&doc.semantic_change===false&&
  doc.accepted_main_sha===mainSha&&doc.master_issue===2217&&
  doc.upstream_review==="requirements/mts-source/MTS-READER-BASIS-GROUNDED-IDENTITY-F03-F04-F05.yaml",
  "acceptance/publication authority");
 equal(doc.review_packages,["F06","F07"],"work package order");
 equal(doc.reviewer_question_refs,["2.4","2.5","6.2","10.2","10.3"],"question coverage");
 const proof=rec(doc.proof_sources,"proof owner");
 shape(proof,Object.keys(paths),"proof owners");
 for(const [key,path] of Object.entries(paths))
  guard(proof[key]===path,"source redirected "+key);
 checkSymbols(read(root,paths.lean),"Lean4");
 checkSymbols(read(root,paths.rocq),"Rocq");
 const inv=rec(doc.inversion,"F06"),ori=rec(doc.orientation,"F07");
 shape(inv,["heading_ru",...invFields],"F06");
 shape(ori,["heading_ru",...oriFields],"F07");
 const invTitle=prose(inv.heading_ru,"F06 title",35);
 const oriTitle=prose(ori.heading_ru,"F07 title",35);
 guard(Array.isArray(doc.theorem_evidence)&&doc.theorem_evidence.length===14,
  "14 individualized theorem signatures required");
 const rows=doc.theorem_evidence.map((entry,index)=>{
  const item=rec(entry,"theorem evidence");
  shape(item,["id","symbol","assumptions","scope"],"theorem scope");
  const wanted=cases[index]!;
  guard(item.id===wanted[0]&&item.symbol===wanted[1]&&item.scope===wanted[3],
   "theorem identity or scope drift: "+wanted[0]);
  equal(item.assumptions,wanted[2],"proof hypotheses "+wanted[0]);
  return {id:wanted[0] as string,symbol:wanted[1] as string,
   assumptions:[...wanted[2]] as string[],scope:wanted[3] as string};
 });
 equal(doc.open_obligations,obligations,"open scientific obligations");
 const table=["| Результат | Принятый формальный символ | Предпосылки | Область |",
  "|---|---|---|---|"];
 for(const x of rows)
  table.push("| "+x.id+" | "+x.symbol+" | "+x.assumptions.join(", ")+" | "+x.scope+" |");
 const citations="[Lean4: принятые INV/CTX]("+href(paths.lean)+") · "+
  "[Rocq: независимое доказательство]("+href(paths.rocq)+")";
 const inversionMd=["### "+invTitle,"",...paragraphList(inv,invFields,"F06"),
  "#### Проверенная таблица областей INV/CTX","",...table,"",citations,""].join("\n");
 const orientationMd=["### "+oriTitle,"",...paragraphList(ori,oriFields,"F07"),
  "**Открытые научные границы:** "+obligations.join("; ")+".","",citations,""].join("\n");
 guard(inversionMd.includes("INV_02_recursive_inversion_involutive")&&
  orientationMd.includes("RelativeZ2Law")&&
  orientationMd.includes("ContextOrientationMarker")&&
  orientationMd.includes("Γ"),"core inversion/chirality distinctions missing");
 return {inversionMd,orientationMd,theorems:rows,
  openObligations:[...obligations],publication:"blocked"};
}
export function loadReaderF06F07(root:string):F06F07{
 return parseReaderF06F07(read(root,REVIEW_F06_F07_PATH),root);
}
