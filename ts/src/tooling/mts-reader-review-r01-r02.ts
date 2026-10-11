import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseDocument} from "yaml";
import {loadReaderF06F07} from "./mts-reader-review-f06-f07.js";

export const REVIEW_R01_R02_PATH=
 "requirements/mts-source/MTS-READER-ANET-EXACTSEQUENCE-R01-R02.yaml";
type Row=Record<string,unknown>;
export interface R01R02 {
 readonly anetMd:string;
 readonly sequenceMd:string;
 readonly catalog:readonly {id:string;symbol:string;scope:string;assumptions:readonly string[]}[];
 readonly openObligations:readonly string[];
 readonly publication:"blocked";
}
const main="c64b7e21340c6add248c8f380f3fef1292616ac6";
const sourcePaths={
 gpr_lean:"proofs/lean4/MtsV015GeneralizedReactionRefinement.lean",
 gpr_rocq:"proofs/coq/MtsV015GeneralizedReactionRefinement.v",
 formal_lean:"proofs/lean4/MtsV015Formal.lean",
 formal_rocq:"proofs/coq/MtsV015Formal.v",
 foundation_lean:"proofs/lean4/MtsFoundation.lean",
 foundation_rocq:"proofs/coq/MtsFoundation.v",
 semantic_ts:"ts/src/v015-source-anet.ts",
 exact_ts:"ts/src/exact-sequence.ts",
 regression:"ts/test/v015-formal-exact-sequence-b7.test.ts",
 gpr_evidence:"proofs/v015-evidence/gpr02-canonical-anet-convergence.json",
 registry:"requirements/mts-v0.15.json"
} as const;
const aFields=["universe_ru","equality_ru","membership_ru","layers_ru","provenance_ru","context_ru","decidability_ru","limits_ru"] as const;
const sFields=["definition_ru","construction_ru","examples_ru","proof_ru","fold_ru","surface_ru","counterexample_ru","limits_ru"] as const;
const expected=[
 ["R01-ADD-IDEMPOTENCE","gpr","GPR_02_duplicate_membership_idempotent",
  ["Link","member","derived","value"],"extensional-pointwise"],
 ["R01-ADD-COMMUTATIVITY","gpr","GPR_02_membership_contribution_commutes",
  ["Link","member","first","second","value"],"extensional-pointwise"],
 ["R01-EVENTS","gpr","GPR_02_duplicate_provenance_events_are_preserved",
  ["Link","Provenance","value","first_provenance","second_provenance"],"two-list-occurrences"],
 ["R02-MULTIPLICITY","gpr","GPR_02_exact_sequence_multiplicity_not_collapsed",
  ["Atom","ExactPackedLink"],"recursive-positional-carrier"],
 ["R02-EMPTY","formal","FRM_04_empty_exact_sequence_is_root",
  ["ExactSequenceKernel"],"empty-root-premise"],
 ["R02-SINGLE","formal","FRM_04_single_root_distinct_from_empty",
  ["ExactSequenceKernel","injective"],"conditional-injectivity"],
 ["R02-DOUBLE","formal","FRM_04_two_roots_distinct_from_one",
  ["ExactSequenceKernel","injective"],"conditional-injectivity"],
 ["R02-LEFT-INVERSE","formal","FRM_07_exact_sequence_injective_from_left_inverse",
  ["ExactSequenceLeftInverse","leftInverse"],"conditional-left-inverse"],
 ["R02-FOLD-COLLISION","foundation","exact_sequence_fold_collision",
  ["Foundation","AcceptedV014RepresentationDefinitions"],"conditional-rooted-fold"]
] as const;
const negatives=["R01-EQUALITY","R01-PROVENANCE","R01-CONTEXT",
 "R02-ONE-ROOT","R02-GLOBAL-CODEC","R02-MEMBERSHIP"] as const;
const obligations=["ANET_GLOBAL_MEMBERSHIP_DECIDABILITY",
 "PRODUCTION_CODEC_TOTAL_KERNEL_REFINEMENT",
 "CONTEXT_ROLE_GAMMA_REFINEMENT_BRIDGE"] as const;
function guard(c:unknown,m:string):asserts c{if(!c)throw Error("review-R01-R02: "+m);}
function rec(x:unknown,m:string):Row{guard(x!==null&&typeof x==="object"&&!Array.isArray(x),m+" mapping");return x as Row;}
function shape(o:Row,k:readonly string[],m:string){guard(Object.keys(o).sort().join("|")===[...k].sort().join("|"),m+" exact keys");}
function eq(x:unknown,y:unknown,m:string){guard(JSON.stringify(x)===JSON.stringify(y),m+" changed");}
function prose(x:unknown,m:string,min=150):string{
 guard(typeof x==="string"&&x.trim().length>=min,m+" substantial Russian text");
 return x;
}
function read(root:string,p:string){return readFileSync(resolve(root,p),"utf8");}
function link(p:string){return "https://github.com/netkeep80/anum_docs/blob/"+main+"/"+p;}
function inspectSources(root:string){
 const texts=Object.fromEntries(Object.entries(sourcePaths).map(([k,p])=>[k,read(root,p)]));
 for(const [group,left,right] of [
  ["gpr","gpr_lean","gpr_rocq"],["formal","formal_lean","formal_rocq"],
  ["foundation","foundation_lean","foundation_rocq"]
 ]){
  for(const [,source,symbol] of expected.filter(x=>x[1]===group)){
   for(const p of [left,right])guard(texts[p]?.includes(symbol),
    "missing accepted "+symbol+" in "+p);
  }
 }
 for(const [key,names] of [
  ["exact_ts",["materializeExactSequence","readExactSequence","ensureStartSelfClosed","visited.has"]],
  ["semantic_ts",["V015SourceAnetDenotation","denoteV015ResolvedSourceAnet"]],
  ["regression",["PAIR_FT","PAIR_TF","DUP_FF","readExactSequence"]]
 ] as const)for(const s of names)guard(texts[key]?.includes(s),
  "missing executable source "+key+"/"+s);
 const evidence=rec(JSON.parse(texts.gpr_evidence!),"accepted GPR-02 evidence");
 guard(evidence.id==="GPR-02"&&
  evidence.status==="PROVED_FOR_CANONICAL_ANET_MEMBERSHIP_CONVERGENCE_WITH_SEPARATE_PROVENANCE_AND_EXACTSEQUENCE_MULTIPLICITY",
  "accepted GPR-02 scope");
 const registry=rec(JSON.parse(texts.registry!),"accepted registry");
 const rows=registry.requirements;
 guard(Array.isArray(rows),"missing accepted requirement registry");
 for(const id of ["V15-TERM-01","V15-AUTH-01","V15-CTX-01",
  "V15-CTX-02","V15-JSON-04","V15-ONTO-02"]){
  guard(rows.some((v:unknown)=>{const r=rec(v,"registry row");return r.id===id;}),
   "missing accepted "+id);
 }
}
export function parseReaderR01R02(source:string,root:string):R01R02 {
 const prior=loadReaderF06F07(root);
 guard(prior.publication==="blocked"&&prior.theorems.length===14,
  "missing previous F06/F07 review");
 const parsed=parseDocument(source,{strict:true,uniqueKeys:true});
 guard(parsed.errors.length===0&&parsed.warnings.length===0,"invalid or duplicate YAML");
 const doc=rec(parsed.toJS({maxAliasCount:0}),"R01/R02");
 shape(doc,["schema","status","author_approval","publication","semantic_change",
  "accepted_main_sha","master_issue","remediation_issue","upstream_review",
  "review_packages","sources","anet","sequence","proof_catalogue",
  "negative_cases","open_obligations"],"R01/R02");
 guard(doc.schema==="mts-v015-review-anet-exactsequence-r01-r02/v0.1"&&
  doc.status==="proposed"&&doc.author_approval==="not-recorded"&&
  doc.publication==="blocked"&&doc.semantic_change===false&&
  doc.accepted_main_sha===main&&doc.master_issue===2217&&
  doc.remediation_issue===2231&&
  doc.upstream_review===
   "requirements/mts-source/MTS-READER-INVERSION-ORIENTATION-F06-F07.yaml",
  "cannot promote or change scientific authority");
 eq(doc.review_packages,["R01","R02"],"research package order");
 const sources=rec(doc.sources,"source map");
 shape(sources,Object.keys(sourcePaths),"source map");
 for(const [key,p] of Object.entries(sourcePaths))guard(sources[key]===p,
  "source redirection "+key);
 inspectSources(root);
 const anet=rec(doc.anet,"R01"),sequence=rec(doc.sequence,"R02");
 shape(anet,["heading_ru",...aFields],"R01");
 shape(sequence,["heading_ru",...sFields],"R02");
 const aTitle=prose(anet.heading_ru,"R01 heading",45);
 const sTitle=prose(sequence.heading_ru,"R02 heading",45);
 guard(aTitle.startsWith("R01.")&&sTitle.startsWith("R02."),
  "scientific package headings");
 guard(Array.isArray(doc.proof_catalogue)&&doc.proof_catalogue.length===9,
  "exact 9 proof premises/scope entries");
 const catalog=doc.proof_catalogue.map((entry,index)=>{
  const e=rec(entry,"proof evidence row"),w=expected[index]!;
  shape(e,["id","source","symbol","assumptions","scope"],"proof evidence");
  guard(e.id===w[0]&&e.source===w[1]&&e.symbol===w[2]&&e.scope===w[4],
   "theorem identity/scope drift "+w[0]);
  eq(e.assumptions,w[3],"theorem premises "+w[0]);
  return {id:w[0] as string,symbol:w[2] as string,scope:w[4] as string,
   assumptions:[...w[3]] as string[]};
 });
 guard(Array.isArray(doc.negative_cases)&&doc.negative_cases.length===6,
  "individualized counterexample cases required");
 const cases=doc.negative_cases.map((item,i)=>{
  const c=rec(item,"negative case");
  shape(c,["id","forbidden","remedy"],"negative case");
  guard(c.id===negatives[i],"negative case order/drift");
  return {id:c.id as string,forbidden:prose(c.forbidden,"forbidden",37),
   remedy:prose(c.remedy,"remedy",25)};
 });
 eq(doc.open_obligations,obligations,"unresolved scientific obligations");
 const text=(d:Row,fields:readonly string[],scope:string)=>
  fields.flatMap(k=>[prose(d[k],scope+"."+k,170),""]);
 const table=["| Код | Принятая Lean4/Rocq-лемма | Предпосылки | Точная область |",
  "|---|---|---|---|",...catalog.map(x=>
   "| "+x.id+" | "+x.symbol+" | "+x.assumptions.join(", ")+" | "+x.scope+" |")];
 const sourcesMd="[GPR-02 Lean4]("+link(sourcePaths.gpr_lean)+") · "+
  "[Rocq]("+link(sourcePaths.gpr_rocq)+") · "+
  "[точный evidence]("+link(sourcePaths.gpr_evidence)+")";
 const sectionA=["### "+aTitle,"",...text(anet,aFields,"R01"),
  "#### Формально проверенные области R01/R02","",
  ...table,"",sourcesMd,"",
  "**Отрицательные случаи, не допускающие подмены границ:**","",
  ...cases.map(c=>"- **"+c.id+":** "+c.forbidden+". Корректная граница: "+c.remedy+"."),
  "","**Открытые вопросы:** "+obligations.join("; ")+".","",
  "**Статус:** научное предложение; отсутствие авторской приёмки и запрет публикации сохраняются.",""].join("\n");
 const sectionS=["### "+sTitle,"",...text(sequence,sFields,"R02"),
  "**Точный источник левого обратного:** [FRM-04 / FRM-07 Lean4]("+
   link(sourcePaths.formal_lean)+") · [Rocq]("+link(sourcePaths.formal_rocq)+").","",
  "**Строгий контрпример для производной F_R:** [FND-11 Lean4]("+
   link(sourcePaths.foundation_lean)+") · [Rocq]("+link(sourcePaths.foundation_rocq)+").","",
  "**Исполняемый выбранный профиль:** [ExactSequence TS]("+
   link(sourcePaths.exact_ts)+") · [B7 тест]("+link(sourcePaths.regression)+").","",
  "**Граница:** conditional proof ≠ globally certified production codec; "+
   "semantic ANet membership ≠ ExactSequence multiplicity.",""].join("\n");
 guard(sectionA.includes("A≈B")&&sectionS.includes("exact_sequence_fold_collision")&&
  sectionS.includes("FRM_07_exact_sequence_injective_from_left_inverse"),
  "essential mathematical distinctions lost");
 return {anetMd:sectionA,sequenceMd:sectionS,catalog,
  openObligations:[...obligations],publication:"blocked"};
}
export function loadReaderR01R02(root:string):R01R02{
 return parseReaderR01R02(read(root,REVIEW_R01_R02_PATH),root);
}
