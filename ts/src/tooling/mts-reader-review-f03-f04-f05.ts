import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseDocument} from "yaml";
import {loadReaderF01F02P01} from "./mts-reader-review-f01-f02-p01.js";

export const REVIEW_F03_F04_F05_PATH="requirements/mts-source/MTS-READER-BASIS-GROUNDED-IDENTITY-F03-F04-F05.yaml";
type Row=Record<string,unknown>;
export interface F03F05 {
 readonly basisMd:string;readonly groundedMd:string;readonly identityMd:string;
 readonly pairs:readonly string[];readonly obligations:readonly string[];
 readonly publication:"blocked";
}
const files={
 foundation_lean:"proofs/lean4/MtsFoundation.lean",
 foundation_rocq:"proofs/coq/MtsFoundation.v",
 explicit_lean:"proofs/lean4/MtsExplicitModel.lean",
 explicit_rocq:"proofs/coq/MtsExplicitModel.v"
};
const base="c64b7e21340c6add248c8f380f3fef1292616ac6";
const f03=["notation_ru","equations_ru","proof_ru","nat_degree_corollary_ru","limit_ru","model_ru"];
const f04=["logic_ru","induction_ru","distinction_ru","realization_ru","cycle_ru","limit_ru"];
const f05=["a1_ru","root_ru","injection_ru","fnd13_ru","model_ru","counterexample_ru","open_ru"];
const bSymbols=["F2F3OneSidedExistence","f2f3_start_root_pattern","f2f3_finish_root_pattern",
 "f2f3_pair_pattern","f2f3_reverse_pair_pattern","fnd13_form_injective",
 "FND_04_u_is_ordinary_pair","INV_06_root_basis"];
const gSymbols=["LocalSelfDecision","local_self_incidence_exhaustive",
 "local_self_incidence_exclusive","Grounded","Distinguishable",
 "A1RecursiveSeparation","FND_01_grounded_realizability",
 "FND_01_four_structural_cases"];
const iSymbols=["fnd13_form_injective","FND_13_identity_by_poles",
 "FND_02_unique_root","F2F3GroundedNormalization","explicit_fnd13_replay"];
const xSymbols=["badStart_not_grounded","badFinish_not_grounded","fallback_cycle_not_grounded"];
const xRocqSymbols=["model_bad_start_not_grounded","model_bad_finish_not_grounded","fallback_cycle_not_grounded"];
const pairNames=["R/O","R/C","R/L","R/U","O/C","O/L","O/U","C/L","C/U","L/U"];
const pairReasons=["E.startRootNeRoot","E.finishRootNeRoot",
 "FullSelf(R) versus PairLocal(L)","FullSelf(R) versus PairLocal(U)",
 "StartOnly(O) versus FinishOnly(C)","StartOnly(O) versus PairLocal(L)",
 "StartOnly(O) versus PairLocal(U)","FinishOnly(C) versus PairLocal(L)",
 "FinishOnly(C) versus PairLocal(U)","fnd13_form_injective and O != C"];
const open=["A1_INDEPENDENCE","GLOBAL_POLE_EXTENTIONALITY","BASIS_PAIRWISE_KERNEL_LEMMA"];
function guard(c:unknown,m:string):asserts c{if(!c)throw Error("mts-reader-F03-F05: "+m);}
function rec(x:unknown,m:string):Row{guard(x!==null&&typeof x==="object"&&!Array.isArray(x),m+" mapping");return x as Row;}
function exactKeys(r:Row,keys:readonly string[],m:string){
 guard(Object.keys(r).sort().join("|")===[...keys].sort().join("|"),m+" exact keys");
}
function eqList(x:unknown,expected:readonly string[],m:string){
 guard(Array.isArray(x)&&JSON.stringify(x)===JSON.stringify(expected),m+" expected ordered list");
}
function prose(x:unknown,m:string,min=145):string{
 guard(typeof x==="string"&&x.trim().length>=min,m+" substantive explanation");return x;
}
function read(root:string,path:string){return readFileSync(resolve(root,path),"utf8");}
function link(path:string){return "https://github.com/netkeep80/anum_docs/blob/"+base+"/"+path;}
function symbols(text:string,expected:readonly string[],file:string){
 for(const name of expected)guard(text.includes(name),"accepted symbol missing "+file+"/"+name);
}
function sections(r:Row,fields:readonly string[],prefix:string){
 return fields.flatMap(x=>[prose(r[x],prefix+"."+x),""]);
}
function parse(source:string):Row{
 const d=parseDocument(source,{strict:true,uniqueKeys:true});
 guard(!d.errors.length&&!d.warnings.length,"malformed or duplicate YAML");
 return rec(d.toJS({maxAliasCount:0}),"F03/F04/F05");
}
export function parseReaderF03F04F05(source:string,root:string):F03F05{
 const prior=loadReaderF01F02P01(root);
 guard(prior.publication==="blocked"&&prior.statuses.length===8,
  "previous pinned Lean4/Rocq source chain");
 const d=parse(source);
 exactKeys(d,["schema","status","author_approval","publication","semantic_change",
 "accepted_main_sha","master_issue","upstream_review","review_packages",
 "reviewer_question_refs","source_files","basis","grounded","identity"],"F03-F05");
 guard(d.schema==="mts-v015-review-basis-grounded-identity-f03-f04-f05/v0.1"&&
  d.status==="proposed"&&d.author_approval==="not-recorded"&&
  d.publication==="blocked"&&d.semantic_change===false&&
  d.accepted_main_sha===base&&d.master_issue===2217&&
  d.upstream_review==="requirements/mts-source/MTS-READER-FOUNDATION-MODEL-PROOF-F01-F02-P01.yaml",
  "no authority or publication elevation");
 eqList(d.review_packages,["F03","F04","F05"],"wave order");
 eqList(d.reviewer_question_refs,["1.3","1.4","1.5","2.1","2.2","2.3","4.2","10.1"],"question crossref");
 const p=rec(d.source_files,"proof sources");
 exactKeys(p,Object.keys(files),"proof sources");
 for(const [k,v] of Object.entries(files))guard(p[k]===v,"source path drift "+k);
 const fl=read(root,files.foundation_lean),fc=read(root,files.foundation_rocq);
 const ml=read(root,files.explicit_lean),mc=read(root,files.explicit_rocq);
 symbols(fl,bSymbols,"Foundation Lean");
 symbols(fc,bSymbols,"Foundation Rocq");
 symbols(fl,gSymbols,"Grounded Lean");
 symbols(fc,gSymbols,"Grounded Rocq");
 symbols(fl,iSymbols.slice(0,4),"FND-13 Lean");
 symbols(fc,iSymbols.slice(0,4),"FND-13 Rocq");
 symbols(ml,[...xSymbols,"explicit_fnd13_replay"],"Explicit model Lean");
 symbols(mc,[...xRocqSymbols,"explicit_fnd13_replay"],"Explicit model Rocq");
 const b=rec(d.basis,"F03"),g=rec(d.grounded,"F04"),i=rec(d.identity,"F05");
 exactKeys(b,["heading_ru","status",...f03,"table","lean_symbols","rocq_symbols"],"F03");
 exactKeys(g,["heading_ru",...f04,"lean_symbols","rocq_symbols","model_lean_symbols","model_rocq_symbols"],"F04");
 exactKeys(i,["heading_ru",...f05,"lean_symbols","rocq_symbols","open_obligations"],"F05");
 guard(b.status==="CONDITIONAL_DERIVATION_FROM_ACCEPTED_THEOREMS_NOT_NEW_KERNEL_CERTIFICATE",
  "pairwise table is a derived proposition, not independently accepted kernel proof");
 eqList(b.lean_symbols,bSymbols,"F03 Lean");
 eqList(b.rocq_symbols,bSymbols,"F03 Rocq");
 eqList(g.lean_symbols,gSymbols,"F04 Lean");
 eqList(g.rocq_symbols,gSymbols,"F04 Rocq");
 eqList(g.model_lean_symbols,xSymbols,"F04 Lean cyclic witnesses");
 eqList(g.model_rocq_symbols,xRocqSymbols,"F04 Rocq cyclic witnesses");
 eqList(i.lean_symbols,iSymbols,"F05 Lean");
 eqList(i.rocq_symbols,iSymbols,"F05 Rocq");
 eqList(i.open_obligations,open,"F05 open problems");
 guard(Array.isArray(b.table)&&b.table.length===10,"ten pairwise difference cases");
 const rows=b.table.map((t,ix)=>{
  const r=rec(t,"basis inequality");exactKeys(r,["pair","reason"],"basis inequality");
  guard(r.pair===pairNames[ix]&&r.reason===pairReasons[ix],
   "incorrect basis equality/inequality rationale for "+pairNames[ix]);
  return {pair:r.pair as string,reason:r.reason as string};
 });
 const heading=(s:Row,where:string)=>"### "+prose(s.heading_ru,where+" heading",35);
 const basisText=[
  heading(b,"F03"),"",...sections(b,f03,"F03"),
  "| Пара разных Link | Точное основание различимости |",
  "|---|---|",...rows.map(x=>"| "+x.pair+" | "+x.reason+" |"),"",
  "**Граница доказательства:** отдельная совместная Lean4/Rocq-лемма для таблицы десяти пар пока не принята.","",
  "[Foundation Lean4]("+link(files.foundation_lean)+") · [Rocq]("+link(files.foundation_rocq)+")",""
 ].join("\n");
 const groundedText=[
  heading(g,"F04"),"",...sections(g,f04,"F04"),
  "| Локальный класс | start(x)=x | finish(x)=x |",
  "|---|---|---|",
  "| FullSelf | да | да |","| StartOnly | да | нет |",
  "| FinishOnly | нет | да |","| PairLocal | нет | нет |","",
  "[Grounded Lean4]("+link(files.foundation_lean)+") · "+
  "[проверка циклов]("+link(files.explicit_lean)+")",""
 ].join("\n");
 const identityText=[
  heading(i,"F05"),"",...sections(i,f05,"F05"),
  "| Утверждение | Точные предпосылки |","|---|---|",
  "| fnd13_form_injective | Только Foundation |",
  "| FND_02_unique_root | Foundation; A1; FullSelf(x) |",
  "| FND_13_identity_by_poles | Foundation; N:F2F3GroundedNormalization; Grounded(x); Grounded(y) |",
  "| explicit_fnd13_replay | Явная модель; ExplicitGroundedNormalization; Grounded(x); Grounded(y) |","",
  "**Открытые задачи:** "+open.join(", ")+".","",
  "[Принятые доказательства]("+link(files.foundation_lean)+") · "+
  "[конкретная модель]("+link(files.explicit_lean)+")",""
 ].join("\n");
 guard(basisText.includes("L/U")&&groundedText.includes("LocalSelfDecision")&&
  identityText.includes("FND_13_identity_by_poles"),"fundamental contrasts lost");
 return {basisMd:basisText,groundedMd:groundedText,identityMd:identityText,
  pairs:pairNames,obligations:open,publication:"blocked"};
}
export function loadReaderF03F04F05(root:string):F03F05{
 return parseReaderF03F04F05(read(root,REVIEW_F03_F04_F05_PATH),root);
}
