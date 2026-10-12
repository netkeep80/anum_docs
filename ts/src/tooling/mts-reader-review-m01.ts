import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseDocument} from "yaml";
import {loadReaderP02P03} from "./mts-reader-review-p02-p03.js";

export const REVIEW_M01_PATH=
 "requirements/mts-source/MTS-READER-MATHEMATICAL-POSITION-M01.yaml";
type Row=Record<string,unknown>;
export interface M01 {
 readonly noveltyMd:string;
 readonly evidence:readonly {id:string;symbol:string;scope:string}[];
 readonly openObligations:readonly string[];
 readonly publication:"blocked";
}
const pin="c64b7e21340c6add248c8f380f3fef1292616ac6";
const paths={
 foundation_lean:"proofs/lean4/MtsFoundation.lean",
 foundation_rocq:"proofs/coq/MtsFoundation.v",
 model_lean:"proofs/lean4/MtsExplicitModel.lean",
 model_rocq:"proofs/coq/MtsExplicitModel.v",
 theorem_assurance:"proofs/premise-classification-v0.14.json",
 gamma_core_lean:"proofs/lean4/MtsV015GeneralizedReactionCore.lean",
 gamma_core_rocq:"proofs/coq/MtsV015GeneralizedReactionCore.v",
 formal_assurance:"proofs/v015-formal-proof-assurance.json",
 accepted_registry:"requirements/mts-v0.15.json",
 model_test:"ts/test/proof-explicit-model.test.ts"
} as const;
const fields=["question_ru","signature_ru","finite_ru","free_ru","graph_ru",
 "afa_ru","computational_ru","candidate_ru","verdict_ru"] as const;
const comparisons=[
 ["FREE_MAGMA","https://agda-algebras.universalalgebra.org/Examples/Setoid/FreeMagma/",
  "finite-binary-term-algebra","Foundation-not-plain-free-magma-due-root-fixed-point"],
 ["TERM_GRAPH","https://eprints.whiterose.ac.uk/id/eprint/243318/",
  "shared-subexpressions-and-rule-based-graph-transformation",
  "sharing-and-rewriting-not-intrinsically-new"],
 ["NONWELLFOUNDED","https://web.stanford.edu/group/cslipublications/cslipublications/site/0937073229.shtml",
  "anti-foundation-cyclic-set-models","non-well-foundedness-not-unique-to-MTS"],
 ["BISIMULATION","https://plato.stanford.edu/entries/nonwellfounded-set-theory/",
  "accessible-pointed-graphs-bisimulation",
  "graph-bisimulation-not-proven-identical-to-link-equality"]
] as const;
const witness=[
 ["M01-FND","foundation","fnd13_form_injective","constructor-injectivity-only"],
 ["M01-ONE-SIDED","explicit","ExplicitOneSided","nondegenerate-accepted-model"],
 ["M01-MODEL","explicit","explicit_a1","concrete-infinite-carrier-and-A1"],
 ["M01-CYCLE","explicit","fallback_cycle_not_grounded","specific-two-link-obligation-cycle"],
 ["M01-SHARING","explicit","sharedGroundedParent_start","shared-child-need-not-be-cycle"],
 ["M01-GAMMA","gamma","GPR_01_gamma_successor_unique","fixed-functional-successor-only"]
] as const;
const negatives=["FREE_MAGMA_NOT_EQUAL_FOUNDATION","ROOT_FIXED_POINT_REQUIRED",
 "FINITE_SINGLETON_FOUNDATION_POSSIBLE","NONTRIVIAL_FINITE_FOUNDATION_IMPOSSIBLE",
 "PAIR_INJECTIVE_NOT_GLOBAL_POLE_EXT","GRAPH_SHARING_NOT_CYCLE","AFA_NOT_MTS_EQUALITY",
 "GAMMA_NOT_ALL_REWRITE_SYSTEMS","NO_UNPROVED_ORIGINALITY_PRIORITY",
 "FORMAL_MODEL_NOT_PRODUCTION_PROOF"] as const;
const gaps=["PRECISE_CATEGORY_OF_MTS_MODELS","COMPARATOR_FUNCTOR_AND_PRESERVATION",
 "ISOMORPHISM_OR_INVARIANT_COUNTERMODEL",
 "INDEPENDENT_LITERATURE_AND_NOVELTY_REVIEW"] as const;
function check(x:unknown,m:string):asserts x{if(!x)throw Error("review-M01: "+m);}
function rec(x:unknown,m:string):Row{check(x!==null&&typeof x==="object"&&!Array.isArray(x),m+" map");return x as Row;}
function exactKeys(x:Row,fields:readonly string[],m:string){
 check(Object.keys(x).sort().join("|")===[...fields].sort().join("|"),m+" exact fields");
}
function equal(x:unknown,y:unknown,m:string){check(JSON.stringify(x)===JSON.stringify(y),m);}
function prose(x:unknown,m:string,min=175):string{
 check(typeof x==="string"&&x.length>=min&&/[А-Яа-яЁё]/u.test(x),m+" proper Russian mathematical argument");
 return x;
}
function read(root:string,path:string){return readFileSync(resolve(root,path),"utf8");}
function repoLink(path:string){return "https://github.com/netkeep80/anum_docs/blob/"+pin+"/"+path;}
function verify(root:string){
 const sources=Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,read(root,p)]));
 for(const v of witness){
  const [id,kind,name]=v;
  const pair=kind==="foundation"?["foundation_lean","foundation_rocq"]:
    kind==="explicit"?["model_lean","model_rocq"]:["gamma_core_lean","gamma_core_rocq"];
  for(const p of pair)
   check(sources[p]?.includes(name),id+" paired theorem/source missing from "+p);
 }
 for(const [path,text] of [
  ["foundation_lean","root_self : form R R = R"],
  ["foundation_lean","form_start : ∀ a b"],
  ["foundation_lean","form_finish : ∀ a b"],
  ["model_lean","abbrev ModelLink := List Bool"],
  ["model_lean","badStart_not_grounded"],
  ["model_lean","badFinish_not_grounded"],
  ["model_lean","sharedGroundedParent"],
  ["model_rocq","fallback_cycle_not_grounded"],
  ["model_test","MtsExplicitModel.lean"]
 ] as const)check(sources[path]?.includes(text),"model assertion missing "+path+"/"+text);
 const reg=rec(JSON.parse(sources.accepted_registry!),"accepted v0.15");
 check(reg.accepted===true&&reg.status==="accepted","accepted authority drift");
 const formal=rec(JSON.parse(sources.formal_assurance!),"FRM formal evidence");
 check(formal.status==="EXECUTION_CORE_PROOF_GREEN","formal proof status drift");
 const premise=rec(JSON.parse(sources.theorem_assurance!),"foundation theorem assurance");
 check(Object.keys(premise).length>2,"foundation assumption classification missing");
}
export function parseReaderM01(raw:string,root:string):M01 {
 const earlier=loadReaderP02P03(root);
 check(earlier.publication==="blocked"&&earlier.evidence.length===10,
  "P02/P03 scientific prerequisite has not been verified");
 const doc=parseDocument(raw,{strict:true,uniqueKeys:true});
 check(doc.errors.length===0&&doc.warnings.length===0,"malformed/duplicate YAML");
 const m=rec(doc.toJS({maxAliasCount:0}),"M01 source");
 exactKeys(m,["schema","status","author_approval","publication","semantic_change",
  "accepted_main_sha","master_issue","upstream_review","review_packages","source_paths",
  "comparison","comparators","evidence","negative_cases","open_obligations"],"root");
 check(m.schema==="mts-v015-review-mathematical-position-m01/v0.1"&&
  m.status==="proposed"&&m.author_approval==="not-recorded"&&
  m.publication==="blocked"&&m.semantic_change===false&&
  m.accepted_main_sha===pin&&m.master_issue===2217&&
  m.upstream_review==="requirements/mts-source/MTS-READER-REFINEMENT-REPRODUCIBILITY-P02-P03.yaml",
  "mathematical originality claim must not acquire author authority");
 equal(m.review_packages,["M01"],"exact package M01");
 const refs=rec(m.source_paths,"source citations");
 exactKeys(refs,Object.keys(paths),"exact verified sources");
 for(const [k,p] of Object.entries(paths))check(refs[k]===p,"unverified reference "+k);
 verify(root);
 const paragraphs=rec(m.comparison,"scientific source");
 exactKeys(paragraphs,["heading_ru",...fields],"scientific paragraphs");
 const h=prose(paragraphs.heading_ru,"Russian section heading",48);
 check(h.startsWith("M01."),"wrong review section");
 check(Array.isArray(m.comparators)&&m.comparators.length===comparisons.length,
  "exact four independent mathematical comparators");
 const refsMd=m.comparators.map((x,i)=>{
  const e=rec(x,"comparator"),w=comparisons[i]!;
  exactKeys(e,["id","title","url","relation","nonclaim"],"comparator citation");
  check(e.id===w[0]&&e.url===w[1]&&e.relation===w[2]&&e.nonclaim===w[3],
   "mathematical comparator changed "+w[0]);
  const name=prose(e.title,"title",15);
  return "- ["+name+"]("+w[1]+"): "+w[2]+"; оговорка: "+w[3]+".";
 });
 check(Array.isArray(m.evidence)&&m.evidence.length===witness.length,
  "exact six paired internal evidence records");
 const evidence=m.evidence.map((x,i)=>{
  const e=rec(x,"theorem evidence"),want=witness[i]!;
  exactKeys(e,["id","source","symbol","scope"],"internal theorem link");
  check(e.id===want[0]&&e.source===want[1]&&
   e.symbol===want[2]&&e.scope===want[3],"exact proof scope drift "+want[0]);
  return{id:want[0] as string,symbol:want[2] as string,scope:want[3] as string};
 });
 equal(m.negative_cases,negatives,"ten documented negative novelty claims");
 equal(m.open_obligations,gaps,"four unsettled mathematical comparison obligations");
 const md=["### "+h,"",...fields.flatMap(f=>[prose(paragraphs[f],"M01."+f,230),""]),
  "#### Ближайшие известные математические конструкции","",...refsMd,"",
  "#### Проверяемые утверждения внутри принятого корпуса","",
  "| ID | Принятый исходник или theorem | Область |","|---|---|---|",
  ...evidence.map(x=>"| "+x.id+" | "+x.symbol+" | "+x.scope+" |"),"",
  "Парные proof sources: [Foundation Lean4]("+repoLink(paths.foundation_lean)+
  ") · [Rocq]("+repoLink(paths.foundation_rocq)+
  ") · [Explicit model Lean4]("+repoLink(paths.model_lean)+
  ") · [Rocq]("+repoLink(paths.model_rocq)+").","",
  "**Недопустимые утверждения о новизне:** "+negatives.join("; ")+".","",
  "**Открытые исследовательские задачи:** "+gaps.join("; ")+".","",
  "**Вердикт:** наличие сформулированной конструкции и проверяемых моделей не удостоверяет математическую приоритетность или неэквивалентность известным теориям; author approval отсутствует.",""].join("\n");
 check(md.includes("n²≤n")&&md.includes("form(R,R)=R")&&
  md.includes("бисимуляции")&&md.includes("PRECISE_CATEGORY_OF_MTS_MODELS"),
 "key novelty limitation omitted");
 return{noveltyMd:md,evidence,openObligations:[...gaps],publication:"blocked"};
}
export function loadReaderM01(root:string):M01 {
 return parseReaderM01(read(root,REVIEW_M01_PATH),root);
}
