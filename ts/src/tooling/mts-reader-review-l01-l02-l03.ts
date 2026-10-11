import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseDocument} from "yaml";
import {loadReaderR03R04} from "./mts-reader-review-r03-r04.js";

export const REVIEW_L01_L03_PATH=
 "requirements/mts-source/MTS-READER-FORMAL-DAS-GAMMA-L01-L02-L03.yaml";
type MapRow=Record<string,unknown>;
export interface L01L03 {
 readonly formalMd:string; readonly dasMd:string; readonly executionMd:string;
 readonly evidence:readonly {id:string;key:string;scope:string}[];
 readonly openObligations:readonly string[];
 readonly publication:"blocked";
}
const pin="c64b7e21340c6add248c8f380f3fef1292616ac6";
const sources={
 accepted_registry:"requirements/mts-v0.15.json",
 accepted_formal:"docs/specs/Формальная нотация МТС.md",
 accepted_kernel:"profiles/mts-v015-meta-interpreter-kernel.json",
 formal_lean:"proofs/lean4/MtsV015Formal.lean",
 formal_rocq:"proofs/coq/MtsV015Formal.v",
 gamma_lean:"proofs/lean4/MtsV015GeneralizedReactionRefinement.lean",
 gamma_rocq:"proofs/coq/MtsV015GeneralizedReactionRefinement.v",
 source_common:"ts/src/v015-direct-source.ts",
 source_formal:"ts/src/v015-direct-formal-source.ts",
 source_json:"ts/src/v015-direct-json-source.ts",
 semantic_das:"ts/src/v015-source-anet.ts",
 association_ts:"ts/src/v015-direct-association.ts",
 exact_sequence:"ts/src/exact-sequence.ts",
 dual_regression:"ts/test/v015-direct-json-denotation-das-a2b.test.ts",
 formal_refinement:"ts/test/v015-formal-production-refinement-f1.test.ts",
 semantic_regression:"ts/test/v015-source-anet-denotation-core-das-a2a.test.ts",
 gamma_regression:"ts/test/v015-structural-aset-gamma-core-a9a.test.ts",
 gamma_authority:"docs/specs/Апамять и управление сетью связей.md"
} as const;
const fields={
 formal:["grammar_ru","association_ru","empty_ru","proof_ru","expression_ru","errors_ru","limits_ru"],
 das:["pipeline_ru","roles_ru","json_ru","equality_ru","examples_ru","limits_ru"],
 execution:["history_ru","profile_ru","result_ru","snapshot_ru","causal_ru","limitations_ru"]
} as const;
const rows=[
 ["L01-NAME","formal","FRM_01_absolute_contextual_name","absolute-one-step-name"],
 ["L01-DSA","formal","FRM_03_direct_sequential_association_three","three-terms-only"],
 ["L01-DIRECT-TS","executable","directSequentialAssociation","nonempty-list-left-fold"],
 ["L01-ASPECT","formal","FRM_08_structural_aspect_denotation","declared-aspect-fragment"],
 ["L02-ROOT","formal","FRM_02_root_source_role_separation","root-roles-only"],
 ["L02-NESTED","formal","FRM_02_nested_source_role_membership","selected-nested-roles"],
 ["L02-DUAL","formal","FRM_05_shared_source_implies_shared_denotation","common-source-common-denotation"],
 ["L02-COMPILER","formal","FRM_06_metacompiler_preserves_semantics","conditional-preservation-premise"],
 ["L02-REFINEMENT","formal","FRM_07_approved_artifact_refinement","conditional-refinement-premise"],
 ["L02-JSON","registry","V15-JSON-02","declared-direct-json-formal-parity"],
 ["L03-SNAPSHOT","gamma","GPR_03_prepublication_current_is_reaction_start","projection-on-before-staged"],
 ["L03-STAGING","gamma","GPR_03_analysis_ignores_staged_candidate","no-read-own-writes"],
 ["L03-NO-MATCH","gamma","GPR_04_local_no_match_cannot_publish_global_no_match","global-partition-completion"],
 ["L03-EXECUTION","kernel","GAMMA_STRUCTURAL_ASET","accepted-one-command-J0-S1-S2"]
] as const;
const negatives=["DSA_NO_EMPTY_UNIT","DSA_NOT_ALGEBRAIC_ASSOCIATIVITY",
 "FRM03_NOT_ALL_N_KERNEL","MTS_EQUALITY_NOT_META_EQUALITY","BARE_NOT_BINDING",
 "EMPTY_BUNDLE_NOT_BARE","JSON_DUPLICATE_KEY_REJECT","JSON_NULL_ARRAY_REJECT",
 "JSON_NOT_SECOND_LANGUAGE","COMMON_DENOTATION_NOT_BYTES",
 "NO_MATCH_NOT_MATCHED_EMPTY","ACTIVE_IDENTITY_NOT_QUIESCENCE",
 "NO_READ_OWN_WRITES","HISTORICAL_MP_NOT_FORMAL_SOURCE"] as const;
const gaps=["FRM03_GENERAL_N_INDUCTION_PAIR",
 "UNIVERSAL_GRAMMAR_CYCLIC_NAME_BOUNDARY",
 "GLOBAL_FORMAL_JSON_COMPILER_REFINEMENT",
 "GAMMA_END_TO_END_PRODUCTION_REFINEMENT"] as const;
function check(x:unknown,m:string):asserts x{if(!x)throw Error("review-L01-L03: "+m);}
function rec(x:unknown,m:string):MapRow{check(x!==null&&typeof x==="object"&&!Array.isArray(x),m+" object");return x as MapRow;}
function keys(x:MapRow,k:readonly string[],m:string){check(Object.keys(x).sort().join("|")===[...k].sort().join("|"),m+" exact source fields");}
function eq(x:unknown,y:unknown,m:string){check(JSON.stringify(x)===JSON.stringify(y),m);}
function prose(x:unknown,m:string,min=145):string{check(typeof x==="string"&&x.trim().length>=min,m+" Russian explanation");return x;}
function read(root:string,path:string){return readFileSync(resolve(root,path),"utf8");}
function link(path:string){return "https://github.com/netkeep80/anum_docs/blob/"+pin+"/"+path;}
function verifySources(root:string){
 const text=Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,read(root,v)]));
 const reg=rec(JSON.parse(text.accepted_registry!),"accepted registry");
 check(Array.isArray(reg.requirements)&&reg.requirements.length===48,"accepted v0.15 exact mandatory registry");
 for(const id of ["V15-JSON-01","V15-JSON-02","V15-JSON-03","V15-JSON-04",
  "V15-FORMAL-PROOF-01","V15-FORMAL-PROOF-02","V15-AUTH-01","V15-CTX-01"]){
  check(reg.requirements.some((x:unknown)=>rec(x,"registry row").id===id),"missing accepted "+id);
 }
 const ker=rec(JSON.parse(text.accepted_kernel!),"Gamma kernel");
 const cmd=rec(ker.command,"J0 authority"),phase=rec(ker.phases,"Gamma phases");
 const analysis=rec(phase.analysis,"S1"),synthesis=rec(phase.synthesis,"S2");
 const publish=rec(phase.publication,"publication");
 check(ker.status==="ACCEPTED_EXECUTION_AUTHORITY"&&cmd.name==="GAMMA_STRUCTURAL_ASET"&&
  cmd.repeatedCommandCount===1&&cmd.localReaction==="STRUCTURAL_UNARY_J0"&&
  cmd.crossMemberJoin==="J1_NOT_REQUIRED"&&
  analysis.id==="S1"&&analysis.readOnly===true&&
  synthesis.id==="S2"&&publish.completeSuccessorBeforePublication===true&&
  publish.sameGenerationReadOwnWrites===false,"accepted Gamma execution law drift");
 const laws=rec(ker.causalLaws,"Gamma causal laws");
 check(laws.noMatchPreservesCurrentMembership===true&&
  laws.matchedEmptyProducesZeroSuccessorContribution===true&&
  laws.newTheoryAdmissionVisibleSameReaction===false&&
  laws.newTheoryAdmissionVisibleNextReaction===true,"NoMatch and publication distinctions");
 for(const row of rows){
  const symbol=row[2],origin=row[1];
  if(origin==="formal"||origin==="gamma"){
   const key=origin==="formal"?"formal":"gamma";
   for(const lang of ["lean","rocq"])
    check(text[key+"_"+lang]?.includes(symbol),
     "missing exact paired proof symbol "+symbol+"/"+lang);
  }else if(origin==="executable")check(text.association_ts?.includes(symbol),
   "missing direct association source");
  else if(origin==="kernel")check(cmd.name===symbol,
   "missing accepted Gamma structural authority");
  else check(reg.requirements.some((x:unknown)=>rec(x,"accepted row").id===symbol),
   "missing v0.15 normative source");
 }
 for(const [source,tokens] of [
  ["source_common",["compileV015DirectSourceEntries","validateEntries","duplicate-local-name"]],
  ["source_formal",["compileV015DirectFormalSourceAnet","invalid-formal","duplicate-local-name"]],
  ["source_json",["compileV015DirectJsonSourceAnet","duplicate-key","invalid-null-position"]],
  ["semantic_das",["denoteV015ResolvedSourceAnet","V015SourceAnetDenotation"]],
  ["association_ts",["directSequentialAssociation","empty-semantic-source-order","values.length"]],
  ["dual_regression",["compileV015DirectJsonSourceAnet","denoteV015ResolvedSourceAnet"]],
  ["formal_refinement",["compileV015DirectFormalSourceAnet","compileV015DirectJsonSourceAnet"]],
  ["semantic_regression",["denoteV015ResolvedSourceAnet"]],
  ["gamma_regression",["materializeExactSequence","readExactSequence"]]
 ] as const){
  for(const word of tokens)check(text[source]?.includes(word),"accepted production evidence absent "+source+"/"+word);
 }
 check(text.accepted_formal?.includes("A->B->C")&&
  text.gamma_authority?.includes("Theory ⟼ relation"),"accepted Russian source missing");
}
export function parseReaderL01L03(raw:string,root:string):L01L03{
 const old=loadReaderR03R04(root);
 check(old.publication==="blocked"&&old.evidence.length===11,"prior review not verified");
 const doc=parseDocument(raw,{strict:true,uniqueKeys:true});
 check(doc.errors.length===0&&doc.warnings.length===0,"malformed or duplicate YAML");
 const m=rec(doc.toJS({maxAliasCount:0}),"L01/L02/L03");
 keys(m,["schema","status","author_approval","publication","semantic_change",
 "accepted_main_sha","master_issue","upstream_review","review_packages",
 "source_paths","formal","das","execution","evidence","negative_cases",
 "open_obligations"],"root");
 check(m.schema==="mts-v015-review-formal-das-gamma-l01-l02-l03/v0.1"&&
  m.status==="proposed"&&m.author_approval==="not-recorded"&&
  m.publication==="blocked"&&m.semantic_change===false&&
  m.accepted_main_sha===pin&&m.master_issue===2217&&
  m.upstream_review==="requirements/mts-source/MTS-READER-REPRESENTATION-ARITHMETIC-R03-R04.yaml",
  "scientific authority and publication remain blocked");
 eq(m.review_packages,["L01","L02","L03"],"three reviewer packages");
 const paths=rec(m.source_paths,"exact source ownership");
 keys(paths,Object.keys(sources),"source ownership");
 for(const [k,v] of Object.entries(sources))
  check(paths[k]===v,"source redirection "+k);
 verifySources(root);
 const sections=[rec(m.formal,"L01"),rec(m.das,"L02"),rec(m.execution,"L03")];
 const labels=["L01","L02","L03"] as const;
 const titles=sections.map((s,i)=>{
  keys(s,["heading_ru",...fields[["formal","das","execution"][i] as keyof typeof fields]],labels[i]!);
  const title=prose(s.heading_ru,labels[i]+" heading",49);
  check(title.startsWith(labels[i]!+"."),"wrong reviewer heading");
  return title;
 });
 check(Array.isArray(m.evidence)&&m.evidence.length===rows.length,"14 proof/evidence classification rows");
 const evidence=m.evidence.map((entry,i)=>{
  const v=rec(entry,"evidence row"),want=rows[i]!;
  keys(v,["id","origin","key","scope"],"evidence row");
  check(v.id===want[0]&&v.origin===want[1]&&v.key===want[2]&&v.scope===want[3],
   "exact symbol/scope mismatch "+want[0]);
  return {id:want[0] as string,key:want[2] as string,scope:want[3] as string};
 });
 eq(m.negative_cases,negatives,"14 individualized false-assumption guards");
 eq(m.open_obligations,gaps,"four still open proof obligations");
 const table=["| Рецензия | Доказательство или источник | Область |",
 "|---|---|---|",...evidence.map(r=>"| "+r.id+" | "+r.key+" | "+r.scope+" |")];
 const make=(i:number)=>{
  const name=(["formal","das","execution"] as const)[i]!;
  const s=sections[i]!,items=fields[name];
  return ["### "+titles[i],"",...items.flatMap(k=>[prose(s[k],name+"."+k,200),""]),
   ...(i===0?["**Отличие от алгебраической ассоциативности:** "+
    "для списка длины n≥1 применяется строго заданное левое свертывание, "+
    "а FRM-03 в ядрах доказывает пока лишь n=3.",""]:[]),
   ...(i===1?["**Доказательный маршрут:** [DAS source ANet]("+link(sources.semantic_das)+
    "), [FORMAL compiler]("+link(sources.source_formal)+
    "), [JSON compiler]("+link(sources.source_json)+").",""]:[]),
   ...(i===2?["**Ядро и исторические границы:** [Γ профиль]("+link(sources.accepted_kernel)+
    "), [Lean4 GPR]("+link(sources.gamma_lean)+
    "), [Rocq GPR]("+link(sources.gamma_rocq)+").",""]:[]),
  ].join("\n");
 };
 const formalMd=make(0),dasMd=make(1),executionMd=make(2);
 const evidenceMd=["#### Точные области проверяемых утверждений","",...table,"",
 "**Проверки недопустимых усилений:** "+negatives.join("; ")+".","",
 "**Открытые proof/production обязательства:** "+gaps.join("; ")+".","",
 "**Источник:** [принятые FRM Lean4]("+link(sources.formal_lean)+
 "), [Rocq]("+link(sources.formal_rocq)+").","",
 "**Статус:** proposed, авторская приёмка отсутствует, публикация заблокирована.",""].join("\n");
 check(formalMd.includes("n≥1")&&dasMd.includes("compileV015DirectSourceEntries")&&
  executionMd.includes("NO_MATCH")&&evidenceMd.includes("FRM03_GENERAL_N_INDUCTION_PAIR"),
  "crucial academic boundaries must be visible");
 return {formalMd, dasMd:dasMd+"\n\n"+evidenceMd,
  executionMd,evidence,openObligations:[...gaps],publication:"blocked"};
}
export function loadReaderL01L03(root:string):L01L03{
 return parseReaderL01L03(read(root,REVIEW_L01_L03_PATH),root);
}
