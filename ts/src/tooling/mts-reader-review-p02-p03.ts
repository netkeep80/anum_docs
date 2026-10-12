import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseDocument} from "yaml";
import {loadReaderG01G03} from "./mts-reader-review-g01-g02-g03.js";

export const REVIEW_P02_P03_PATH=
 "requirements/mts-source/MTS-READER-REFINEMENT-REPRODUCIBILITY-P02-P03.yaml";
type Dict=Record<string,unknown>;
export interface P02P03{
 readonly refinementMd:string;readonly reproducibilityMd:string;
 readonly evidence:readonly {id:string;key:string;scope:string}[];
 readonly openObligations:readonly string[];readonly publication:"blocked";
}
const pin="c64b7e21340c6add248c8f380f3fef1292616ac6";
const paths={
 formal_assurance:"proofs/v015-formal-proof-assurance.json",
 formal_evidence:"proofs/v015-evidence/formal-bootstrap-frm01-06.json",
 accepted_registry:"requirements/mts-v0.15.json",
 formal_lean:"proofs/lean4/MtsV015Formal.lean",
 formal_rocq:"proofs/coq/MtsV015Formal.v",
 production_ts:"ts/test/v015-formal-production-refinement-f1.test.ts",
 formal_guard:"ts/test/v015-formal-proof-assurance-f0.test.ts",
 replay_guard:"ts/test/v015-frozen-replay-artifact-integrity.test.ts",
 replay_package:"ts/test/v015-boolean-package-replay-a2.test.ts",
 proof_toolchains:"proofs/external-toolchains.json",
 ci:".github/workflows/ci.yml",
 observer:".github/workflows/contract-observatory-pages.yml",
 pdf_workflow:".github/workflows/reader-preview.yml",
 pdf_renderer:"tools/reader-preview/render.mjs",
 human_reader:"requirements/mts-source/MTS-READER-HUMAN-EDITION-R44-W6.yaml"
} as const;
const fields={
 refinement:["scope_ru","formal_ru","exact_ru","samples_ru","artifacts_ru","verdict_ru","missing_ru"],
 reproducibility:["tooling_ru","evidence_ru","time_ru","evidence_ladder_ru","manuscript_ru","publication_ru"]
} as const;
const rows=[
 ["P02-FRM05","formal","FRM_05_shared_source_implies_shared_denotation","same-native-source-premise"],
 ["P02-FRM06","formal","FRM_06_metacompiler_preserves_semantics","explicit-roundtrip-record"],
 ["P02-FRM07","formal","FRM_07_approved_artifact_refinement","same-source-plus-recursive-left-inverse"],
 ["P02-SEQ","formal","FRM_07_exact_sequence_injective_from_left_inverse","separate-left-inverse-premise"],
 ["P02-EXACT-156","executable","EXACT_SEQUENCE_LEFT_INVERSE_SAMPLED=156","five-basis-length-zero-to-three"],
 ["P02-ARTIFACTS-2","executable","APPROVED_ARTIFACTS=2","grounded-and-two-role-fixtures-only"],
 ["P02-FRESH","executable","FRESH_MEMORY_RECONSTRUCTION=GREEN","recursive-wire-identity-fresh-memory"],
 ["P03-PROOF-CI","workflow","Print Assumptions","pinned-two-kernels-current-head"],
 ["P03-REPLAY","replay","packageSha256","frozen-six-artifact-integrity-only"],
 ["P03-PDF","pdf","all_pages_inspected_as_images","non-authoritative-preview-QA"]
] as const;
const negatives=["FRM07_NOT_TYPESCRIPT_PROOF","EXACT_156_NOT_UNIVERSAL",
 "TWO_ARTIFACTS_NOT_SIX_F1","SEMANTIC_ROUNDTRIP_NOT_ORIGINAL_BYTES",
 "FRM05_REQUIRES_SAME_SOURCE","FRM06_REQUIRES_ROUNDTRIP",
 "NO_FICTIONAL_EXACT_PREMISE_IN_FRM07_SIGNATURE",
 "HASH_NOT_SEMANTIC_TRUTH","PAST_CI_NOT_CURRENT_HEAD",
 "GREEN_NOT_AUTHOR_ACCEPT","ZERO_AX_ALLOWLIST_NOT_NO_HYPOTHESES",
 "PDF_NOT_INDEPENDENT_MATH_REVIEW"] as const;
const gaps=["FRM07_FULL_PRODUCTION_REFINEMENT",
 "EXACT_SEQUENCE_UNIVERSAL_LEFT_INVERSE",
 "ALL_APPROVED_CORPUS_EXTENDED_REFINEMENT_SCOPE",
 "INDIVIDUAL_178_QUESTION_REVIEW_AND_AUTHOR_DECISION"] as const;
function ok(x:unknown,m:string):asserts x{if(!x)throw Error("review-P02-P03: "+m);}
function map(x:unknown,m:string):Dict{ok(x!==null&&typeof x==="object"&&!Array.isArray(x),m+" mapping");return x as Dict;}
function shape(x:Dict,k:readonly string[],m:string){ok(Object.keys(x).sort().join("|")===[...k].sort().join("|"),m+" exact keys");}
function same(a:unknown,b:unknown,m:string){ok(JSON.stringify(a)===JSON.stringify(b),m);}
function prose(v:unknown,m:string,min=150):string{ok(typeof v==="string"&&v.trim().length>=min,m+" substantive Russian statement");return v;}
function read(root:string,p:string){return readFileSync(resolve(root,p),"utf8");}
function cite(path:string){return "https://github.com/netkeep80/anum_docs/blob/"+pin+"/"+path;}
function verifySources(root:string){
 const src=Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,read(root,p)]));
 const assurance=map(JSON.parse(src.formal_assurance!),"accepted proof assurance");
 const targets=assurance.targets;ok(Array.isArray(targets)&&targets.length===8,"eight accepted FRM proof targets");
 const r07=map(targets.find((x:unknown)=>map(x,"target").id==="FRM-07"),"FRM07 target");
 ok(r07.classification==="PROVED_UNDER_EXPLICIT_PRODUCTION_REFINEMENT_PREMISES",
  "exact accepted conditional proof category");
 const prem=r07.premises;ok(Array.isArray(prem)&&prem.length===3,"three assurance premises");
 ok(String(prem[0]).includes("same native source ANet")&&
  String(prem[1]).includes("semantic left inverse")&&
  String(prem[2]).includes("ExactSequence"),"premise ordering/meaning");
 const prod=map(assurance.productionRefinement,"production evidence boundary");
 ok(prod.status==="GREEN_FOR_DECLARED_V015_EXECUTION_FRAGMENT"&&
  String(prod.note).includes("does not claim a mechanized proof"),
  "production evidence cannot be promoted to theorem");
 const ax=map(assurance.allowedGlobalAxioms,"axiom allowlist");
 same(ax.lean4,[],"Lean4 axiom allowlist");same(ax.rocq,[],"Rocq axiom allowlist");
 const lean=src.formal_lean!,rocq=src.formal_rocq!;
 for(const row of rows.slice(0,4))
  for(const s of [lean,rocq])ok(s.includes(row[2]),"pair theorem absent "+row[2]);
 for(const [f,names] of [
  ["production_ts",["EXACT_SEQUENCE_LEFT_INVERSE_SAMPLED=156","APPROVED_ARTIFACTS=2",
    "FRESH_MEMORY_RECONSTRUCTION=GREEN","GENERAL_TYPESCRIPT_CORRECTNESS_PROOF=NOT_CLAIMED",
    "const artifacts = [","for (let length = 1; length <= 3;",
    "grounded-zero-role","two-role-meta-rule"]],
  ["formal_guard",["FRM-07","PROVED_UNDER_EXPLICIT_PRODUCTION_REFINEMENT_PREMISES"]],
  ["replay_guard",["packageSha256","evidenceSha256"]],
  ["replay_package",["compileV015DirectFormalSourceAnet","compileV015DirectJsonSourceAnet"]],
  ["ci",["Compile pinned Lean external foundation","Compile pinned Rocq external foundation","Print Assumptions"]],
  ["pdf_renderer",["all_pages_inspected_as_images","AND worked example/table split across print pages"]],
  ["pdf_workflow",["mts-reader-preview","render.mjs"]]
 ] as const)for(const symbol of names)
  ok(src[f]?.includes(symbol),"source evidence missing "+f+"/"+symbol);
 const f1=src.production_ts!;
 ok(f1.includes("same(formal.sourceAset,")||
  f1.includes("formal.sourceAset,\n    json.sourceAset"),"native source parity actual test absent");
 ok(f1.includes("fresh semantic left-inverse")&&f1.includes("memberCount: 3"),
   "production exact two artifacts scope changed");
 const lit=lean.slice(lean.indexOf("theorem FRM_07_approved_artifact_refinement"),
  lean.indexOf("structure ExactSequenceLeftInverse"));
 ok(lit.includes("sameSource")&&lit.includes("P.recursiveLeftInverse")&&
  !lit.includes("ExactSequenceLeftInverse"),"FRM07 theorem exact two semantic premises");
 const rocqBody=rocq.slice(rocq.indexOf("Theorem FRM_07_approved_artifact_refinement"),
  rocq.indexOf("End ProductionRefinement"));
 ok(rocqBody.includes("same_source")&&rocqBody.includes("pr_recursive_left_inverse")&&
  !rocqBody.includes("es_left_inverse"),"Rocq FRM07 semantic premise boundary");
 const tools=map(JSON.parse(src.proof_toolchains!),"toolchain");
 const leanTool=map(tools.lean4,"Lean"),rocqTool=map(tools.rocq,"Rocq");
 ok(leanTool.version==="4.34.1"&&rocqTool.version==="9.2.0"&&
  String(leanTool.linuxReleaseSha256).length===64&&
  String(rocqTool.dockerManifestSha256).length===64,
  "reproducible external tools/pinned SHA");
 const reg=map(JSON.parse(src.accepted_registry!),"accepted v015");
 ok(reg.status==="accepted"&&reg.accepted===true,"accepted history");
 const boot=map(JSON.parse(src.formal_evidence!),"FRM bootstrap evidence");
 ok(boot.status==="PAIRED_BOOTSTRAP_GREEN_PRODUCTION_REFINEMENT_OPEN",
  "historical bootstrap evidence remains open");
 const reader=src.human_reader!;
 ok(reader.includes("publication: blocked")||reader.includes("publication:")&&reader.includes("blocked"),
  "source-owned reader must not be published");
 ok(src.observer!.includes("Contract Observatory"),"observatory workflow missing");
}
export function parseReaderP02P03(raw:string,root:string):P02P03{
 const previous=loadReaderG01G03(root);
 ok(previous.publication==="blocked"&&previous.evidence.length===11,"G01/G02/G03 unverified");
 const doc=parseDocument(raw,{strict:true,uniqueKeys:true});
 ok(doc.errors.length===0&&doc.warnings.length===0,"malformed/duplicate YAML");
 const row=map(doc.toJS({maxAliasCount:0}),"review");
 shape(row,["schema","status","author_approval","publication","semantic_change",
 "accepted_main_sha","master_issue","upstream_review","review_packages","source_paths",
 "refinement","reproducibility","evidence","negative_cases","open_obligations"],"root");
 ok(row.schema==="mts-v015-review-refinement-reproducibility-p02-p03/v0.1"&&
  row.status==="proposed"&&row.author_approval==="not-recorded"&&
  row.publication==="blocked"&&row.semantic_change===false&&
  row.accepted_main_sha===pin&&row.master_issue===2217&&
  row.upstream_review==="requirements/mts-source/MTS-READER-GAMMA-AND-G01-G02-G03.yaml",
  "no scientific author or release authority");
 same(row.review_packages,["P02","P03"],"review package scope");
 const refs=map(row.source_paths,"sources");shape(refs,Object.keys(paths),"exact references");
 for(const [k,p] of Object.entries(paths))ok(refs[k]===p,"source redirect "+k);
 verifySources(root);
 const sec=[map(row.refinement,"P02"),map(row.reproducibility,"P03")];
 const names=["refinement","reproducibility"] as const;
 const titles=sec.map((s,i)=>{
  shape(s,["heading_ru",...fields[names[i]!]],"paragraph sources");
  const title=prose(s.heading_ru,"title",48);
  ok(title.startsWith(["P02.","P03."][i]!),"wrong section heading");
  return title;
 });
 ok(Array.isArray(row.evidence)&&row.evidence.length===rows.length,"ten individually scoped evidence entries");
 const evidence=row.evidence.map((r,i)=>{
  const e=map(r,"evidence"),want=rows[i]!;
  shape(e,["id","origin","key","scope"],"source evidence");
  ok(e.id===want[0]&&e.origin===want[1]&&e.key===want[2]&&e.scope===want[3],
   "individual theorem/test scope drift "+want[0]);
  return {id:want[0] as string,key:want[2] as string,scope:want[3] as string};
 });
 same(row.negative_cases,negatives,"twelve invalid scientific claim exclusions");
 same(row.open_obligations,gaps,"four unresolved research obligations");
 const render=(i:number)=>{
  const source=sec[i]!,name=names[i]!;
  return ["### "+titles[i],"",...fields[name].flatMap(k=>[prose(source[k],name+"."+k,220),""])].join("\n");
 };
 const proof=["| Пакет | Проверяемое theorem/evidence | Ограниченная область |",
 "|---|---|---|",...evidence.map(x=>"| "+x.id+" | "+x.key+" | "+x.scope+" |")];
 const refinementMd=[render(0),"","#### Индивидуальные связки P02/P03","",...proof,"",
  "**Недопустимые выводы:** "+negatives.join("; ")+".","",
  "**Открытые задачи:** "+gaps.join("; ")+".","",
  "Первоисточники: [FRM Lean4]("+cite(paths.formal_lean)+") · [Rocq]("+cite(paths.formal_rocq)+
  ") · [точный executable F1]("+cite(paths.production_ts)+") · [assurance]("+
  cite(paths.formal_assurance)+").",""].join("\n");
 const reproducibilityMd=[render(1),"","Первоисточники: [toolchains]("+
  cite(paths.proof_toolchains)+") · [CI]("+cite(paths.ci)+
  ") · [frozen replay guard]("+cite(paths.replay_guard)+
  ") · [preview renderer]("+cite(paths.pdf_renderer)+").","",
  "**Статус:** предложено; самостоятельная публикация и авторская приёмка отсутствуют.",""].join("\n");
 ok(refinementMd.includes("156")&&
  refinementMd.includes("FRM_07_exact_sequence_injective_from_left_inverse")&&
  reproducibilityMd.includes("178"),"critical proof/reproducibility limits missing");
 return {refinementMd,reproducibilityMd,evidence,openObligations:[...gaps],publication:"blocked"};
}
export function loadReaderP02P03(root:string):P02P03{
 return parseReaderP02P03(read(root,REVIEW_P02_P03_PATH),root);
}
