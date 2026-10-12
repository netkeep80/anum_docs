import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseDocument} from "yaml";
import {loadReaderM03} from "./mts-reader-review-m03.js";

// M04 classifies strength of existing results, not accepted mathematical semantics.
export const REVIEW_M04_PATH=
 "requirements/mts-source/MTS-READER-EPISTEMIC-CLAIMS-M04.yaml";
type Row=Record<string,unknown>;
const pin="c64b7e21340c6add248c8f380f3fef1292616ac6";
const branch="post-v015-g19-first-use-russian-glossary";
const paths={
 foundation_lean:"proofs/lean4/MtsFoundation.lean",
 foundation_rocq:"proofs/coq/MtsFoundation.v",
 f03_lean:"proofs/lean4/MtsBasisFiveDistinct.lean",
 f03_rocq:"proofs/coq/MtsBasisFiveDistinct.v",
 assurance:"proofs/v015-formal-proof-assurance.json",
 formal_lean:"proofs/lean4/MtsV015Formal.lean",
 formal_rocq:"proofs/coq/MtsV015Formal.v",
 gamma_lean:"proofs/lean4/MtsV015GeneralizedReactionCore.lean",
 gamma_rocq:"proofs/coq/MtsV015GeneralizedReactionCore.v",
 exact_f1:"ts/test/v015-formal-production-refinement-f1.test.ts",
 and_a1:"ts/test/v015-compact-and-role-bundle-a1.test.ts",
 kernel:"profiles/mts-v015-meta-interpreter-kernel.json",
 release:"traceability/mts-v0.15.json",
 m01:"requirements/mts-source/MTS-READER-MATHEMATICAL-POSITION-M01.yaml",
 m02:"requirements/mts-source/MTS-READER-WORKED-FOUNDATION-GAMMA-M02.yaml",
 m03:"requirements/mts-source/MTS-READER-NOTATION-SEMANTICS-M03.yaml",
} as const;
type SourceKey=keyof typeof paths;
const levels=["KERNEL_THEOREM","CONDITIONAL_THEOREM","EXECUTABLE_WITNESS",
 "ACCEPTED_SEMANTIC_CONTRACT","OPEN_RESEARCH","AUTHOR_DECISION",
 "AUTHOR_DECISION_PENDING"] as const;
const claims=[
 ["M04-FND","KERNEL_THEOREM","fnd13_form_injective",["foundation_lean","foundation_rocq"]],
 ["M04-F03","CONDITIONAL_THEOREM","F03_basis_five_pairwise_distinct",["f03_lean","f03_rocq"]],
 ["M04-FRM03","KERNEL_THEOREM","FRM_03_direct_sequential_association_three",["formal_lean","formal_rocq","assurance"]],
 ["M04-FRM04","CONDITIONAL_THEOREM","FRM_04_single_root_distinct_from_empty",["formal_lean","formal_rocq","assurance"]],
 ["M04-FRM05","CONDITIONAL_THEOREM","FRM_05_shared_source_implies_shared_denotation",["formal_lean","formal_rocq","assurance"]],
 ["M04-FRM06","CONDITIONAL_THEOREM","FRM_06_metacompiler_preserves_semantics",["formal_lean","formal_rocq","assurance"]],
 ["M04-FRM07","CONDITIONAL_THEOREM","FRM_07_approved_artifact_refinement",["formal_lean","formal_rocq","assurance"]],
 ["M04-FRM08","KERNEL_THEOREM","FRM_08_structural_aspect_denotation",["formal_lean","formal_rocq","assurance"]],
 ["M04-F1","EXECUTABLE_WITNESS","EXACT_SEQUENCE_LEFT_INVERSE_SAMPLED=156",["exact_f1"]],
 ["M04-A1","EXECUTABLE_WITNESS","MTS_V015_COMPACT_AND_A1=GREEN",["and_a1"]],
 ["M04-GPR01","KERNEL_THEOREM","GPR_01_gamma_successor_unique",["gamma_lean","gamma_rocq"]],
 ["M04-GAMMA","ACCEPTED_SEMANTIC_CONTRACT","GAMMA_STRUCTURAL_ASET",["kernel"]],
 ["M04-NOVELTY","OPEN_RESEARCH","PRECISE_CATEGORY_OF_MTS_MODELS",["m01"]],
 ["M04-REFINEMENT","OPEN_RESEARCH","M02_FULL_GAMMA_TRANSITION_EXECUTABLE_WITNESS",["m02"]],
 ["M04-ACCEPT","AUTHOR_DECISION","ACCEPT_MTS_V0_15",["release"]],
 ["M04-READER","AUTHOR_DECISION_PENDING","author_approval: not-recorded",["m03"]],
] as const;
const frmClass={
 "FRM-03":"PROVED_IN_SELECTED_MATHEMATICAL_MODEL",
 "FRM-04":"PROVED_UNDER_EXACT_SEQUENCE_INJECTIVITY",
 "FRM-05":"PROVED_UNDER_SHARED_NATIVE_SOURCE_PREMISE",
 "FRM-06":"PROVED_UNDER_METACOMPILER_ROUNDTRIP_PREMISE",
 "FRM-07":"PROVED_UNDER_EXPLICIT_PRODUCTION_REFINEMENT_PREMISES",
 "FRM-08":"PROVED_IN_SELECTED_MATHEMATICAL_MODEL_WITH_PRODUCTION_WITNESS",
} as const;
const obligations=[
 "M04_INDIVIDUAL_MATH_REVIEW_OF_ALL_CLAIMS",
 "M04_PRODUCTION_REFINEMENT_NOT_PROVED",
 "M04_178_QUESTIONS_AND_NINE_R40_NOT_DISCHARGED",
 "M04_AUTHOR_SCIENTIFIC_ACCEPT_NOT_RECORDED",
] as const;
export interface M04 {
 readonly evidenceMd:string;
 readonly claims:readonly {id:string;grade:string;symbol:string}[];
 readonly openObligations:readonly string[];
 readonly publication:"blocked";
}
function check(x:unknown,m:string):asserts x{if(!x)throw Error("review-M04: "+m);}
function map(x:unknown,m:string):Row{
 check(x!==null&&typeof x==="object"&&!Array.isArray(x),m+" mapping");
 return x as Row;
}
function shape(x:Row,k:readonly string[],m:string){
 check(Object.keys(x).sort().join("|")===[...k].sort().join("|"),m+" exact fields");
}
function same(a:unknown,b:unknown,m:string){
 check(JSON.stringify(a)===JSON.stringify(b),m);
}
function russian(x:unknown,m:string,min=100):string{
 check(typeof x==="string"&&x.length>=min&&/[А-Яа-яЁё]/u.test(x),m+" requires scoped Russian argument");
 return x;
}
function read(root:string,path:string){return readFileSync(resolve(root,path),"utf8");}
function url(key:SourceKey){
 const target=key==="f03_lean"||key==="f03_rocq"?
  "0437724bb54bb75b11c564d6b957f1f3cc3b954a":
  key==="m01"||key==="m02"||key==="m03"?branch:pin;
 return "https://github.com/netkeep80/anum_docs/blob/"+target+"/"+paths[key];
}
function evidenceGate(root:string):void{
 const src=Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,read(root,p)])) as Record<SourceKey,string>;
 for(const spec of claims)for(const key of spec[3])
  check(src[key].includes(spec[2]),"exact evidence symbol missing "+spec[0]+"/"+key);
 const assurance=map(JSON.parse(src.assurance),"FRM assurance");
 check(assurance.status==="EXECUTION_CORE_PROOF_GREEN","proof manifest status drift");
 const targets=assurance.targets;
 check(Array.isArray(targets)&&targets.length===8,"eight original FRM targets");
 for(const [id,classification] of Object.entries(frmClass)){
  const t=map(targets.find((v:unknown)=>map(v,"target").id===id),id);
  check(t.classification===classification,"false upgrade of "+id+" proof classification");
  check(Array.isArray(t.lean4)&&Array.isArray(t.rocq),
   "missing paired kernel proof references "+id);
 }
 const frm07=map(targets.find((v:unknown)=>map(v,"target").id==="FRM-07"),"FRM-07");
 check(Array.isArray(frm07.premises)&&frm07.premises.length===3,
  "FRM-07 assurance conditions missing");
 const prod=map(assurance.productionRefinement,"production refinement evidence");
 check(prod.status==="GREEN_FOR_DECLARED_V015_EXECUTION_FRAGMENT"&&
  String(prod.note).includes("does not claim a mechanized proof"),
  "production TS proof must remain unclaimed");
 const kernel=map(JSON.parse(src.kernel),"accepted Gamma contract");
 const phase=map(kernel.phases,"Gamma phases"),s1=map(phase.analysis,"S1"),
   s2=map(phase.synthesis,"S2"),publication=map(phase.publication,"atomic");
 const causal=map(kernel.causalLaws,"Gamma causal laws");
 check(kernel.status==="ACCEPTED_EXECUTION_AUTHORITY"&&s1.id==="S1"&&s1.readOnly===true&&
  s2.id==="S2"&&publication.completeSuccessorBeforePublication===true&&
  publication.sameGenerationReadOwnWrites===false&&
  causal.noMatchPreservesCurrentMembership===true&&
  causal.matchedEmptyProducesZeroSuccessorContribution===true,
  "Gamma accepted causal/execution scope drift");
 const release=map(JSON.parse(src.release),"v0.15 accepted trace");
 const decision=map(release.authorDecision,"Author decision");
 check(release.status==="accepted"&&decision.state==="ACCEPTED"&&
  decision.decision==="ACCEPT_MTS_V0_15"&&decision.ownerIssue===1876,
  "accepted release boundary missing");
}
export function parseReaderM04(raw:string,root:string):M04{
 const m03=loadReaderM03(root);
 check(m03.publication==="blocked"&&m03.terms.length===10,"M03 prerequisite");
 const doc=parseDocument(raw,{strict:true,uniqueKeys:true});
 check(doc.errors.length===0&&doc.warnings.length===0,"invalid or duplicated YAML");
 const rootRow=map(doc.toJS({maxAliasCount:0}),"M04 source");
 shape(rootRow,["schema","status","author_approval","publication","semantic_change",
  "accepted_main_sha","master_issue","package_issue","upstream_review",
  "heading_ru","intro_ru","legend","source_paths","claims","open_obligations"],"root");
 check(rootRow.schema==="mts-v015-review-epistemic-m04/v0.1"&&
  rootRow.status==="proposed"&&rootRow.author_approval==="not-recorded"&&
  rootRow.publication==="blocked"&&rootRow.semantic_change===false&&
  rootRow.accepted_main_sha===pin&&rootRow.master_issue===2217&&
  rootRow.package_issue===2254&&
  rootRow.upstream_review==="requirements/mts-source/MTS-READER-NOTATION-SEMANTICS-M03.yaml",
  "new scientific edition cannot become accepted authority");
 const pathsRow=map(rootRow.source_paths,"sources");
 shape(pathsRow,Object.keys(paths),"source paths");
 for(const [k,p] of Object.entries(paths))check(pathsRow[k]===p,"source path drift "+k);
 evidenceGate(root);
 const legend=map(rootRow.legend,"evidence grades");
 shape(legend,[...levels],"grades");
 for(const grade of levels)russian(legend[grade],"grade "+grade,135);
 const title=russian(rootRow.heading_ru,"title",55);
 check(title.startsWith("M04."),"M04 heading");
 const intro=russian(rootRow.intro_ru,"intro",300);
 const items=rootRow.claims;
 check(Array.isArray(items)&&items.length===claims.length,"exact 16 individually classified claims");
 const parts=["### "+title,"",intro,"","#### Шкала доказательных статусов",""];
 for(const grade of levels)parts.push("**"+grade+".** "+String(legend[grade]),"");
 parts.push("#### Матрица утверждений, посылок и исключений","");
 const parsed:{id:string;grade:string;symbol:string}[]=[];
 (items as unknown[]).forEach((item,index)=>{
  const row=map(item,"individual claim"),target=claims[index]!;
  shape(row,["id","grade","evidence_symbol","source_keys","thesis_ru","premises_ru","nonclaim_ru"],
   "claim "+index);
  check(row.id===target[0]&&row.grade===target[1]&&row.evidence_symbol===target[2],
   "claim identity, status or theorem scope drift "+target[0]);
  same(row.source_keys,target[3],"claim evidence owners "+target[0]);
  const thesis=russian(row.thesis_ru,"thesis "+target[0],180);
  const premise=russian(row.premises_ru,"premises "+target[0],125);
  const nonclaim=russian(row.nonclaim_ru,"exclusion "+target[0],95);
  parsed.push({id:target[0],grade:target[1],symbol:target[2]});
  parts.push("##### "+target[0]+" · "+target[1],"",
    "**Утверждение:** "+thesis,"",
    "**Предпосылки и точная область:** "+premise,"",
    "**Что не следует:** "+nonclaim,"",
    "**Свидетель:** `"+target[2]+"` · "+target[3].map(k=>
      "["+k+"]("+url(k)+")").join(" · ")+".","");
 });
 check(new Set(parsed.map(x=>x.id)).size===claims.length,"duplicate scientific claim id");
 same(rootRow.open_obligations,obligations,"open M04 gates");
 parts.push("#### Вывод о научной достаточности","",
  "Ни одна строка не переводит результаты с конечной проверенной области на произвольные Link и не присваивает статус Автор ACCEPT предлагаемому русскому тексту. Открытые задачи: "+
  obligations.join("; ")+".","",
  "**Статус:** proposed; accepted v0.15 unchanged; 178 вопросов и девять R40 требуют самостоятельного построчного решения.","");
 return {evidenceMd:parts.join("\n"),claims:parsed,
  openObligations:[...obligations],publication:"blocked"};
}
export function loadReaderM04(root:string):M04{
 return parseReaderM04(read(root,REVIEW_M04_PATH),root);
}
