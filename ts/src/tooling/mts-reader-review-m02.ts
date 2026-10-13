import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseDocument} from "yaml";
import {loadReaderM01} from "./mts-reader-review-m01.js";

export const REVIEW_M02_PATH=
 "requirements/mts-source/MTS-READER-WORKED-FOUNDATION-GAMMA-M02.yaml";
type RecordMap=Record<string,unknown>;
export interface M02{
 readonly walkthroughMd:string;
 readonly evidence:readonly {id:string;symbol:string;scope:string}[];
 readonly openObligations:readonly string[];
 readonly publication:"blocked";
}
const pin="c64b7e21340c6add248c8f380f3fef1292616ac6";
const paths={
 foundation_lean:"proofs/lean4/MtsFoundation.lean",
 foundation_rocq:"proofs/coq/MtsFoundation.v",
 exact_sequence_ts:"ts/src/exact-sequence.ts",
 formal:"formal/v0.15/regression/compact-and.formal",
 json:"formal/v0.15/regression/compact-and.json",
 recursive:"formal/v0.15/regression/compact-and.recursive",
 approved_integrity:"ts/test/v015-compact-and-approved-source-integrity.test.ts",
 and_test:"ts/test/v015-compact-and-role-bundle-a1.test.ts",
 and_package_test:"ts/test/v015-boolean-package-replay-a2.test.ts",
 source_formal_ts:"ts/src/v015-direct-formal-source.ts",
 source_json_ts:"ts/src/v015-direct-json-source.ts",
 source_anet_ts:"ts/src/v015-source-anet.ts",
 gamma_kernel:"profiles/mts-v015-meta-interpreter-kernel.json",
 gamma_lean:"proofs/lean4/MtsV015GeneralizedReactionCore.lean",
 gamma_rocq:"proofs/coq/MtsV015GeneralizedReactionCore.v",
 gamma_refinement_lean:"proofs/lean4/MtsV015GeneralizedReactionRefinement.lean",
 gamma_refinement_rocq:"proofs/coq/MtsV015GeneralizedReactionRefinement.v",
 historical_version:"requirements/mts-v0.15.json"
} as const;
const hashes={
 formal_sha256:"4a5bc92e661ee1d4e0c2c5d51769805b5406651bb491345200d088c9ad23e5f3",
 json_sha256:"cf5028f68500bba04ee10e06ac5512eec223078d8b428f4d5de1de6433ba5941",
 recursive_sha256:"37b2c02b927eed6cdd061931b60930d0a31d674a49bc585b075401a5cb5ddcb0"
} as const;
const fields=["aim_ru","foundation_ru","operator_ru","positional_ru","rule_ru",
 "source_ru","run_ru","transition_ru","negatives_ru","replay_ru","verdict_ru"] as const;
const evidence=[
 ["M02-FOUNDATION","foundation","fnd13_form_injective","link-constructor-not-codec"],
 ["M02-POSITIONS","exact","materializeExactSequence","positions-two-T-and-one-T"],
 ["M02-FORMAL","compiler","compileV015DirectFormalSourceAnet","same-fixture-source-anet"],
 ["M02-JSON","compiler","compileV015DirectJsonSourceAnet","approved-json-only"],
 ["M02-DENOTE","anet","denoteV015ResolvedSourceAnet","four-theory-admissions"],
 ["M02-AND-MATCH","a1","MTS_V015_COMPACT_AND_A1=GREEN","four-local-matcher-rows"],
 ["M02-AND-REPLAY","a2","compact-and.recursive","approved-artifact-replay"],
 ["M02-GAMMA-STEP","gamma","GPR_01_decomposition_iff_single_gamma_step","conditional-pure-gamma-step"],
 ["M02-GAMMA-UNIQUE","gamma","GPR_01_gamma_successor_unique","fixed-decomposition-only"],
 ["M02-GAMMA-CONTRACT","kernel","GAMMA_STRUCTURAL_ASET","j0-snapshot-s1-s2-atomic"]
] as const;
const negative=["EXACTSEQUENCE_TT_NOT_SET_T","FOUR_BINDINGS_NOT_FOUR_ADMISSIONS",
 "SOURCE_PARITY_NOT_BYTE_PARITY","A1_MATCHER_NOT_PRODUCTION_GAMMA",
 "NO_MATCH_NOT_FALSE_OUTPUT","REMOVE_TT_ADMISSION_ONLY",
 "FOREIGN_THEORY_NOT_AUTHORITY","PHYSICAL_RULE_NOT_SEMANTIC_ADMISSION",
 "NO_NEW_JSON_WITHOUT_AUTHOR","CONDITIONAL_GAMMA_STEP_NOT_E2E_PROOF"] as const;
const gaps=["M02_FULL_GAMMA_TRANSITION_EXECUTABLE_WITNESS",
 "M02_FORMAL_TO_GAMMA_PRODUCTION_REFINEMENT",
 "M02_EXACTSEQUENCE_UNIVERSAL_CODEC_PROOF",
 "M02_INDEPENDENT_MATH_REVIEW_AND_AUTHOR_ACCEPT"] as const;
function require_(v:unknown,m:string):asserts v{if(!v)throw Error("review-M02: "+m);}
function object(v:unknown,m:string):RecordMap{require_(v!==null&&typeof v==="object"&&!Array.isArray(v),m+" object");return v as RecordMap;}
function keys(v:RecordMap,k:readonly string[],m:string){
 require_(Object.keys(v).sort().join("|")===[...k].sort().join("|"),m+" exact fields");
}
function eq(a:unknown,b:unknown,m:string){require_(JSON.stringify(a)===JSON.stringify(b),m);}
function prose(v:unknown,m:string,min=165):string{
 require_(typeof v==="string"&&v.length>=min&&/[А-Яа-яЁё]/u.test(v),m+" substantial Russian text");
 return v;
}
function read(root:string,path:string){return readFileSync(resolve(root,path),"utf8");}
function github(path:string){return "https://github.com/netkeep80/anum_docs/blob/"+pin+"/"+path;}
function gate(root:string){
 const f=Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,read(root,p)]));
 for(const [field,h] of Object.entries(hashes)){
  const which=field.slice(0,-7);
  require_(createHash("sha256").update(f[which]!).digest("hex")===h,
   "Author-approved artifact digest drift "+which);
  require_(f.approved_integrity?.includes(h),"frozen integrity test missing "+which);
 }
 const formal=f.formal!;
 for(const exact of ["O : ♂∞","C : ∞♀","L : O->C","U : C->O",
   "T : L","F : U","AND_SEED : R->L","AND : AND_SEED->O","V0 : {}",
   "ArgsFF : [F,F]","ArgsFT : [F,T]","ArgsTF : [T,F]","ArgsTT : [T,T]",
   "ImageF : [F]","ImageT : [T]",
   "RuleFF : V0->((AND->ArgsFF)->ImageF)",
   "RuleFT : V0->((AND->ArgsFT)->ImageF)",
   "RuleTF : V0->((AND->ArgsTF)->ImageF)",
   "RuleTT : V0->((AND->ArgsTT)->ImageT)",
   "Theory->RuleFF","Theory->RuleFT","Theory->RuleTF","Theory->RuleTT"])
  require_(formal.includes(exact),"canonical FORMAL clause missing "+exact);
 const json=JSON.parse(f.json!) as Record<string,unknown>;
 require_(json["Theory->RuleTT"]===null&&json["Theory->RuleTF"]===null&&
  json["V0"]!==null&&Array.isArray(json["ArgsTT"])&&
  (json["ArgsTT"] as unknown[]).join(",")==="T,T",
  "canonical JSON bare/ExactSequence role boundary");
 const foundation=[f.foundation_lean!,f.foundation_rocq!];
 for(const proof of foundation)require_(proof.includes("fnd13_form_injective"),"pair Foundation theorem missing");
 for(const proof of [f.gamma_lean!,f.gamma_rocq!])
  for(const name of ["GPR_01_decomposition_iff_single_gamma_step","GPR_01_gamma_successor_unique"])
   require_(proof.includes(name),"paired Gamma theorem missing "+name);
 for(const [key,symbols] of [
  ["exact_sequence_ts",["materializeExactSequence","readExactSequence","memory.root"]],
  ["and_test",["same(fromFormal.sourceAset, fromJson.sourceAset",
   "denotation.members","reactGeneric","unifyStructuralRuleTemplate",
   "instantiateV013StructuralTemplate","materializeExactSequence(f.memory, [left, right])",
   "MTS_V015_COMPACT_AND_A1=GREEN","TRUTH_TABLE=4_OF_4",
   "NON_BOOLEAN_OPERANDS=NO_MATCH","DELETE_RULE_TT_ADMISSION=ONLY_TT_DISABLED",
   "FOREIGN_THEORY=INERT","SEMANTIC_MEMBER_COUNT=4"]],
  ["and_package_test",["compileV015DirectFormalSourceAnet",
   "compileV015DirectJsonSourceAnet","serializeV013HierarchicalCarrier"]],
  ["source_formal_ts",["compileV015DirectFormalSourceAnet"]],
  ["source_json_ts",["compileV015DirectJsonSourceAnet"]],
  ["source_anet_ts",["denoteV015ResolvedSourceAnet"]]
 ] as const)
  for(const s of symbols)require_(f[key]?.includes(s),"executable scope missing "+key+"/"+s);
 const kernel=object(JSON.parse(f.gamma_kernel!),"accepted execution kernel"),
  cmd=object(kernel.command,"J0"),phase=object(kernel.phases,"S1/S2"),
  a=object(phase.analysis,"analysis"),b=object(phase.synthesis,"synthesis"),
  pub=object(phase.publication,"publication"),causal=object(kernel.causalLaws,"causality");
 require_(kernel.status==="ACCEPTED_EXECUTION_AUTHORITY"&&
 cmd.name==="GAMMA_STRUCTURAL_ASET"&&cmd.localReaction==="STRUCTURAL_UNARY_J0"&&
 a.id==="S1"&&a.readOnly===true&&b.id==="S2"&&
 pub.completeSuccessorBeforePublication===true&&
 pub.sameGenerationReadOwnWrites===false&&
 causal.noMatchPreservesCurrentMembership===true,"Gamma authority contract drift");
 const accepted=object(JSON.parse(f.historical_version!),"accepted source");
 require_(accepted.accepted===true&&accepted.status==="accepted",
  "accepted v0.15 semantics cannot change");
}
export function parseReaderM02(raw:string,root:string):M02{
 const upstream=loadReaderM01(root);
 require_(upstream.publication==="blocked"&&upstream.evidence.length===6,"M01 prerequisite");
 const doc=parseDocument(raw,{strict:true,uniqueKeys:true});
 require_(doc.errors.length===0&&doc.warnings.length===0,"malformed/duplicate YAML");
 const v=object(doc.toJS({maxAliasCount:0}),"M02");
 keys(v,["schema","status","author_approval","publication","semantic_change",
  "accepted_main_sha","master_issue","upstream_review","review_packages",
  "source_paths","artifact_pins","scientific","evidence","negative_cases",
  "open_obligations"],"root");
 require_(v.schema==="mts-v015-review-worked-foundation-gamma-m02/v0.1"&&
  v.status==="proposed"&&v.author_approval==="not-recorded"&&
  v.publication==="blocked"&&v.semantic_change===false&&
  v.accepted_main_sha===pin&&v.master_issue===2217&&
  v.upstream_review==="requirements/mts-source/MTS-READER-MATHEMATICAL-POSITION-M01.yaml",
  "proposed worked example cannot acquire author acceptance");
 eq(v.review_packages,["M02"],"exact M02 package");
 const refs=object(v.source_paths,"references");keys(refs,Object.keys(paths),"source reference closure");
 for(const [k,p] of Object.entries(paths))require_(refs[k]===p,"source path drift "+k);
 const digests=object(v.artifact_pins,"artifact hashes");keys(digests,Object.keys(hashes),"artifact pin closure");
 for(const [k,h] of Object.entries(hashes))require_(digests[k]===h,"canonical digest drift "+k);
 gate(root);
 const source=object(v.scientific,"Russian scientific source");
 keys(source,["heading_ru",...fields],"exact paragraph set");
 const title=prose(source.heading_ru,"scientific heading",51);
 require_(title.startsWith("M02."),"wrong package heading");
 require_(Array.isArray(v.evidence)&&v.evidence.length===evidence.length,"10 grounded proof/source rows");
 const scopes=v.evidence.map((x,i)=>{
  const e=object(x,"evidence scope"),want=evidence[i]!;
  keys(e,["id","source","symbol","scope"],"evidence row");
  require_(e.id===want[0]&&e.source===want[1]&&e.symbol===want[2]&&e.scope===want[3],
   "individual evidence drift "+want[0]);
  return{id:want[0] as string,symbol:want[2] as string,scope:want[3] as string};
 });
 eq(v.negative_cases,negative,"10 explicit false inference gates");
 eq(v.open_obligations,gaps,"four open production/mathematics obligations");
 const text=["### "+title,"",...fields.flatMap(k=>[prose(source[k],"M02."+k,210),""]),
  "#### Схема сквозного свидетельства","",
  "| Шаг | Наблюдаемое свидетельство | Точная доказательная область |",
  "|---|---|---|",
  ...scopes.map(r=>"| "+r.id+" | "+r.symbol+" | "+r.scope+" |"),"",
  "**Заведомо неверные усиления:** "+negative.join("; ")+".","",
  "**Ещё не доказано:** "+gaps.join("; ")+".","",
  "Принятые автором исходники: [FORMAL]("+github(paths.formal)+
  ") · [JSON]("+github(paths.json)+") · [recursive]("+github(paths.recursive)+").","",
  "Исполняемый маршрут: [A1 compact AND]("+github(paths.and_test)+
  ") · [A2 replay]("+github(paths.and_package_test)+
  ") · [Γ accepted kernel]("+github(paths.gamma_kernel)+").","",
  "**Вердикт:** example evidence for a declared fragment, not an unconditional production Γ proof. **Не опубликовано, не принято Автором.**",""].join("\n");
 require_(text.includes("MATCH")||text.includes("NO_MATCH"),"negative match boundary not explained");
 require_(text.includes("Mₜ₊₁={T}")&&text.includes("reactGeneric")&&
  text.includes("119")===false,"explicit conditional successor / tester distinction");
 return{walkthroughMd:text,evidence:scopes,openObligations:[...gaps],publication:"blocked"};
}
export function loadReaderM02(root:string):M02{
 return parseReaderM02(read(root,REVIEW_M02_PATH),root);
}
