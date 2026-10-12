import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseDocument} from "yaml";
import {loadReaderL01L03} from "./mts-reader-review-l01-l02-l03.js";

export const REVIEW_G01_G03_PATH =
 "requirements/mts-source/MTS-READER-GAMMA-AND-G01-G02-G03.yaml";
type Row=Record<string,unknown>;
export interface G01G03 {
 readonly transitionMd:string;
 readonly reductionMd:string;
 readonly andMd:string;
 readonly evidence:readonly {id:string;symbol:string;scope:string}[];
 readonly openObligations:readonly string[];
 readonly publication:"blocked";
}
const pin="c64b7e21340c6add248c8f380f3fef1292616ac6";
const paths={
 accepted_kernel:"profiles/mts-v015-meta-interpreter-kernel.json",
 design_evidence:"profiles/mts-v015-generalized-reaction-candidate.json",
 core_lean:"proofs/lean4/MtsV015GeneralizedReactionCore.lean",
 core_rocq:"proofs/coq/MtsV015GeneralizedReactionCore.v",
 refinement_lean:"proofs/lean4/MtsV015GeneralizedReactionRefinement.lean",
 refinement_rocq:"proofs/coq/MtsV015GeneralizedReactionRefinement.v",
 reduction_ts:"ts/test/v015-parallel-reaction-reduction-a11.test.ts",
 gamma_ts:"ts/test/v015-structural-aset-gamma-core-a9a.test.ts",
 compact_and_ts:"ts/test/v015-compact-and-role-bundle-a1.test.ts",
 boolean_replay_ts:"ts/test/v015-boolean-package-replay-a2.test.ts",
 and_formal:"formal/v0.15/regression/compact-and.formal",
 and_json:"formal/v0.15/regression/compact-and.json",
 formal_spec:"docs/specs/Формальная нотация МТС.md"
} as const;
const fields={
 transition:["state_ru","cases_ru","phases_ru","identity_ru","proof_ru"],
 reduction:["model_ru","rules_ru","confluence_ru","limits_ru"],
 and:["construction_ru","table_ru","authority_ru","proof_ru"]
} as const;
const scope=[
 ["G01-STEP","core","GPR_01_decomposition_iff_single_gamma_step","declared-pure-decomposition"],
 ["G01-UNIQUE","core","GPR_01_gamma_successor_unique","functional-gamma-fixed-state"],
 ["G01-READ-ONLY","refinement","GPR_03_analysis_ignores_staged_candidate","fixed-snapshot-no-own-writes"],
 ["G01-BOUNDARY","refinement","GPR_03_one_generation_stops_at_B","bounded-generation-example"],
 ["G02-ASSOCIATIVE","refinement","GPR_04_merge_associative_observation","matched-flag-plus-set-union"],
 ["G02-COMMUTATIVE","refinement","GPR_04_merge_commutative_observation","matched-flag-plus-set-union"],
 ["G02-IDEMPOTENT","refinement","GPR_04_merge_idempotent_observation","matched-flag-plus-set-union"],
 ["G02-PARTITION","refinement","GPR_04_two_dimensional_partition_refinement","fixed-two-dimensional-partition"],
 ["G02-NO-MATCH","refinement","GPR_04_local_no_match_cannot_publish_global_no_match","complete-snapshot-only"],
 ["G03-ZERO-ROLE","core","GPR_07_grounded_zero_role_refinement","conditional-empty-role-laws"],
 ["G03-AND","executable","MTS_V015_COMPACT_AND_A1=GREEN","four-author-approved-boolean-vectors"]
] as const;
const negatives=["NO_MATCH_VS_MATCHED_EMPTY","NO_MATCH_VS_ACTIVE_IDENTITY",
 "NEW_THEORY_SAME_GENERATION","READ_OWN_WRITES_FORBIDDEN",
 "DETERMINISM_NOT_ANY_BACKEND","LOCAL_NO_MATCH_NOT_GLOBAL",
 "RULE_ORDER_NOT_PRIORITY","SEQUENCE_NOT_SEMANTIC_SET",
 "AND_NON_BOOLEAN_NO_MATCH","REMOVE_TT_ONLY",
 "FOREIGN_THEORY_NO_AUTHORITY","AND_NO_SPECIAL_OPCODE"] as const;
const gaps=["GAMMA_FULL_PRODUCTION_REFINEMENT","CONCURRENT_ATOMIC_PUBLICATION_PROOF",
 "EXACT_PROVENANCE_ORDER_VS_SEMANTIC_CONVERGENCE",
 "CANONICAL_AND_RUNTIME_REFINEMENT"] as const;
function require_(v:unknown,m:string):asserts v{if(!v)throw Error("review-G01-G03: "+m);}
function rec(v:unknown,m:string):Row{require_(v!==null&&typeof v==="object"&&!Array.isArray(v),m+" mapping");return v as Row;}
function keys(v:Row,k:readonly string[],m:string){require_(Object.keys(v).sort().join("|")===[...k].sort().join("|"),m+" exact schema");}
function equal(a:unknown,b:unknown,m:string){require_(JSON.stringify(a)===JSON.stringify(b),m);}
function paragraph(v:unknown,m:string,min=220):string{require_(typeof v==="string"&&v.trim().length>=min,m+" substantial text");return v;}
function read(root:string,p:string){return readFileSync(resolve(root,p),"utf8");}
function link(p:string){return "https://github.com/netkeep80/anum_docs/blob/"+pin+"/"+p;}
function evidenceGate(root:string){
 const files=Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,read(root,p)]));
 for(const [,origin,symbol] of scope){
  if(origin==="core"||origin==="refinement"){
   for(const language of ["lean","rocq"])
    require_(files[origin+"_"+language]?.includes(symbol),
      "missing exact paired theorem "+origin+"/"+language+"/"+symbol);
  }else require_(files.compact_and_ts?.includes(symbol),"AND executable witness");
 }
 const ker=rec(JSON.parse(files.accepted_kernel!),"accepted J0 kernel");
 const cmd=rec(ker.command,"Gamma command"),phases=rec(ker.phases,"phases");
 const s1=rec(phases.analysis,"S1"),s2=rec(phases.synthesis,"S2");
 const pub=rec(phases.publication,"atomic publication");
 const causal=rec(ker.causalLaws,"causal laws");
 require_(ker.status==="ACCEPTED_EXECUTION_AUTHORITY"&&
 cmd.name==="GAMMA_STRUCTURAL_ASET"&&cmd.localReaction==="STRUCTURAL_UNARY_J0"&&
 cmd.repeatedCommandCount===1&&cmd.crossMemberJoin==="J1_NOT_REQUIRED"&&
 cmd.programSpecificDispatchAllowed===false,"accepted Gamma command authority");
 require_(s1.id==="S1"&&s1.readOnly===true&&
 s1.completePlanBeforeSynthesis===true&&s2.id==="S2"&&
 pub.sameGenerationReadOwnWrites===false&&pub.completeSuccessorBeforePublication===true,
 "S1/S2 snapshot and publication authority");
 require_(causal.noMatchPreservesCurrentMembership===true&&
 causal.matchedEmptyProducesZeroSuccessorContribution===true&&
 causal.newTheoryAdmissionVisibleSameReaction===false&&
 causal.duplicateSuccessorsConvergeByCanonicalLinkIdentity===true,
 "NoMatch/matched-empty causal semantics");
 const design=rec(JSON.parse(files.design_evidence!),"development proof boundary");
 const decision=rec(design.decision,"decision");
 require_(design.status==="AUTHOR_APPROVED_DESIGN_PROOF_GREEN"&&
 decision.minimalCompleteLocalReaction==="STRUCTURAL_UNARY_J0_SELECTED"&&
 decision.trueCrossMemberJoin==="J1_NOT_REQUIRED","GPR scoped design evidence");
 const fm=files.and_formal!;
 for(const line of ["RuleFF : V0->((AND->ArgsFF)->ImageF)",
   "RuleFT : V0->((AND->ArgsFT)->ImageF)",
   "RuleTF : V0->((AND->ArgsTF)->ImageF)",
   "RuleTT : V0->((AND->ArgsTT)->ImageT)",
   "ArgsFF : [F,F]","ArgsFT : [F,T]","ArgsTF : [T,F]","ArgsTT : [T,T]",
   "Theory->RuleFF","Theory->RuleFT","Theory->RuleTF","Theory->RuleTT"])
  require_(fm.includes(line),"missing Author-approved AND source clause: "+line);
 equal(createHash("sha256").update(fm).digest("hex"),
  "4a5bc92e661ee1d4e0c2c5d51769805b5406651bb491345200d088c9ad23e5f3",
  "frozen Author-approved FORMAL hash");
 equal(createHash("sha256").update(files.and_json!).digest("hex"),
  "cf5028f68500bba04ee10e06ac5512eec223078d8b428f4d5de1de6433ba5941",
  "frozen Author-approved JSON hash");
 for(const [name,words] of [
  ["reduction_ts",["const ZERO_CONTRIBUTION","a.matched || b.matched",
    "reduced.matched","matchedCurrents","ruleShards"]],
  ["gamma_ts",["deriveEndBoundary","readExactSequence"]],
  ["compact_and_ts",["MTS_V015_COMPACT_AND_A1=GREEN","FOREIGN_THEORY=INERT",
    "NON_BOOLEAN_OPERANDS=NO_MATCH","DELETE_RULE_TT_ADMISSION=ONLY_TT_DISABLED"]],
  ["boolean_replay_ts",["compileV015DirectFormalSourceAnet","compileV015DirectJsonSourceAnet"]]
 ] as const){
  for(const w of words)require_(files[name]?.includes(w),"missing executable "+name+"/"+w);
 }
 require_(files.formal_spec?.includes("snapshot -> S1")&&
 files.formal_spec?.includes("J1 = NOT_REQUIRED"),"missing accepted FORMAL Gamma prose");
}
export function parseReaderG01G03(raw:string,root:string):G01G03{
 const prerequisite=loadReaderL01L03(root);
 require_(prerequisite.publication==="blocked"&&prerequisite.evidence.length===14,
   "L01/L02/L03 has not been verified");
 const doc=parseDocument(raw,{strict:true,uniqueKeys:true});
 require_(doc.errors.length===0&&doc.warnings.length===0,"malformed or duplicate YAML");
 const obj=rec(doc.toJS({maxAliasCount:0}),"G01/G02/G03");
 keys(obj,["schema","status","author_approval","publication","semantic_change",
  "accepted_main_sha","master_issue","upstream_review","review_packages","source_paths",
  "transition","reduction","and","evidence","negative_cases","open_obligations"],"root");
 require_(obj.schema==="mts-v015-review-gamma-determinism-and-g01-g02-g03/v0.1"&&
  obj.status==="proposed"&&obj.author_approval==="not-recorded"&&
  obj.publication==="blocked"&&obj.semantic_change===false&&
  obj.accepted_main_sha===pin&&obj.master_issue===2217&&
  obj.upstream_review==="requirements/mts-source/MTS-READER-FORMAL-DAS-GAMMA-L01-L02-L03.yaml",
  "cannot accept or publish proposed scientific material");
 equal(obj.review_packages,["G01","G02","G03"],"three scientific packages");
 const src=rec(obj.source_paths,"source paths");
 keys(src,Object.keys(paths),"source closure");
 for(const [k,p] of Object.entries(paths))require_(src[k]===p,"source redirection "+k);
 evidenceGate(root);
 const sections=[rec(obj.transition,"G01"),rec(obj.reduction,"G02"),rec(obj.and,"G03")];
 const ids=["G01","G02","G03"] as const,names=["transition","reduction","and"] as const;
 const titles=sections.map((s,i)=>{keys(s,["heading_ru",...fields[names[i]!]],ids[i]!);
   const h=paragraph(s.heading_ru,ids[i]+" heading",48);
   require_(h.startsWith(ids[i]!+"."),"wrong section "+ids[i]);return h;});
 require_(Array.isArray(obj.evidence)&&obj.evidence.length===scope.length,
   "eleven source-and-domain rows");
 const evidence=obj.evidence.map((v,i)=>{
  const r=rec(v,"proof/source entry"),want=scope[i]!;
  keys(r,["id","origin","symbol","scope"],"proof/source entry");
  require_(r.id===want[0]&&r.origin===want[1]&&
    r.symbol===want[2]&&r.scope===want[3],"proof domain mismatch "+want[0]);
  return {id:want[0] as string,symbol:want[2] as string,scope:want[3] as string};
 });
 equal(obj.negative_cases,negatives,"twelve precise false-claim guards");
 equal(obj.open_obligations,gaps,"four unresolved scientific obligations");
 const render=(i:number)=>{
  const s=sections[i]!,n=names[i]!;
  return ["### "+titles[i],"",...fields[n].flatMap(k=>[paragraph(s[k],n+"."+k,240),""])].join("\n");
 };
 const tab=["| Проверка | Источник или theorem | Доказательная область |",
  "|---|---|---|",...evidence.map(r=>"| "+r.id+" | "+r.symbol+" | "+r.scope+" |")];
 const transitionMd=render(0),reductionMd=render(1);
 const andMd=[render(2),"","#### Границы доказательств G01–G03","",...tab,"",
  "**Недопустимые усиления:** "+negatives.join("; ")+".","",
  "**Открытые обязательства:** "+gaps.join("; ")+".","",
  "**Источник формальных доказательств:** [GPR core Lean4]("+link(paths.core_lean)+
  ") · [Rocq]("+link(paths.core_rocq)+") · [GPR refinement Lean4]("+
  link(paths.refinement_lean)+") · [Rocq]("+link(paths.refinement_rocq)+").","",
  "**Исходные принятые файлы AND (неизменены):** [FORMAL]("+link(paths.and_formal)+
  ") · [JSON]("+link(paths.and_json)+") · [тест]("+link(paths.compact_and_ts)+").","",
  "**Статус:** предложенная научная редакция, без новой авторской приёмки и без публикации.",""].join("\n");
 require_(transitionMd.includes("MATCHED([])")&&
  reductionMd.includes("GPR_04_local_no_match_cannot_publish_global_no_match")&&
  andMd.includes("RuleTT")&&andMd.includes("GAMMA_FULL_PRODUCTION_REFINEMENT"),
   "mathematical counterexample omitted");
 return {transitionMd,reductionMd,andMd,evidence,
   openObligations:[...gaps],publication:"blocked"};
}
export function loadReaderG01G03(root:string):G01G03{
 return parseReaderG01G03(read(root,REVIEW_G01_G03_PATH),root);
}
