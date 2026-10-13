import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseDocument} from "yaml";
import {loadReaderG42} from "./mts-reader-g42.js";
import {loadReaderR44W4,renderReaderR44W4Preview} from "./mts-reader-r44-w4.js";

export const R44_W5_PATH="requirements/mts-source/MTS-READER-SCIENTIFIC-FINAL-REVIEW-R44-W5.yaml";
type Dict=Record<string,unknown>;
export interface Case{readonly id:string;readonly wave:string;readonly atom:string;readonly title:string;readonly assessment:string;readonly gap:string;readonly question:string;}
export interface R44W5{readonly cases:readonly Case[];readonly stack:readonly {pr:number;head:string;commits:number;basePr:number}[];readonly merge:string;readonly exclusion:string;readonly gate:string;readonly publication:"blocked";}
function guard(c:unknown,m:string):asserts c{if(!c)throw Error("mts-reader-r44-w5: "+m);}
function mapping(v:unknown,m:string):Dict{guard(!!v&&typeof v==="object"&&!Array.isArray(v),m+" mapping");return v as Dict;}
function values(v:unknown,m:string):unknown[]{guard(Array.isArray(v),m+" array");return v;}
function prose(v:unknown,m:string,min=1):string{guard(typeof v==="string"&&v.trim().length>=min,m+" substantive prose");return v;}
function keys(v:Dict,e:string[],m:string){guard(Object.keys(v).sort().join("|")===e.sort().join("|"),m+" exact keys");}
function parse(text:string):Dict{const d=parseDocument(text,{strict:true,uniqueKeys:true});guard(!d.errors.length&&!d.warnings.length,"malformed or duplicate YAML");return mapping(d.toJS({maxAliasCount:0}),"W5");}
function get(root:string,p:string){return readFileSync(resolve(root,p),"utf8");}
const current="c64b7e21340c6add248c8f380f3fef1292616ac6";
const previous="2501f9e82d9b06ac2035c93ccb187dc842ce2904";
const original=[
"requirements/mts-source/MTS-READER-PROSE-AUDIT-R40-W1.yaml",
"requirements/mts-source/MTS-READER-PROSE-AUDIT-R40-W2.yaml",
"requirements/mts-source/MTS-READER-PROSE-AUDIT-R40-W3.yaml"];
const nine=["R40-06","R40-07","R40-09","R40-10","R40-11","R40-12","R40-13","R40-14","R40-15"];
const modes=["technical-prose-remains","duplicate-opening-still-visible","source-scoped-fix-pending-author",
"continuity-not-formal-equivalence","documented-await-author-reader-review","category-separated-await-author-review",
"eight-source-references-await-reader-check","approved-source-example-await-science-review",
"positional-test-not-general-theorem"];
const prs=[2138,2153,2164,2173],counts=[55,15,9,79],
heads=["c3dad577e40d0929a9f740038b56285dfffceef7",
"a82f7a8a4d5c792adee0e11f7d32ee93ec496143",
"431ebbd0d8dbf0c202bedf0faaca8f85f38c04ef",previous];
export function parseR44W5(sourceText:string,root:string):R44W5{
 const d=parse(sourceText);
 keys(d,["schema","status","author_approval","publication","semantic_change","scope","upstream_reader",
 "upstream_reader_source_sha","accepted_main_sha","review_basis","review_cases",
 "stack_checkpoint","author_science_gate"],"W5");
 guard(d.schema==="mts-reader-scientific-final-review-r44-w5/v0.1"&&d.status==="proposed"&&
 d.author_approval==="not-recorded"&&d.publication==="blocked"&&d.semantic_change===false&&
 d.scope==="nine-open-r40-individual-audit-plus-merging-preconditions"&&
 d.upstream_reader==="requirements/mts-source/MTS-READER-SCIENTIFIC-CONTINUITY-R44-W4.yaml"&&
 d.upstream_reader_source_sha===previous&&d.accepted_main_sha===current&&
 JSON.stringify(d.review_basis)===JSON.stringify([...original,
 "requirements/mts-source/MTS-READER-SCIENTIFIC-SECOND-PASS-R42.yaml"]),
 "W5 cannot self-approve or change authority");
 const upstream=loadReaderR44W4(root),g42=loadReaderG42(root);
 guard(upstream.publication==="blocked"&&upstream.chapters.length===10&&upstream.proofs.length===8&&
 g42.findings.open.length===9,"W4 and original science pending");
 const findings=new Map<string,{wave:string;atom:string;state:string}>();
 for(let i=0;i<original.length;i++){
   const w=parse(get(root,original[i]!));
   for(const raw of values(w.findings,"historical R40 findings")){
     const row=mapping(raw,"historical finding"),id=prose(row.id,"id");
     guard(!findings.has(id),"duplicate original finding");
     findings.set(id,{wave:"R40-W"+(i+1),atom:prose(row.first_use_consumer,"consumer"),state:prose(row.state,"historical state")});
   }
 }
 guard(findings.size===15,"R40 original fifteen findings require retention");
 const rs=values(d.review_cases,"nine individual cases");
 guard(rs.length===9,"all nine open findings required");
 const cases=rs.map((v,i)=>{
   const r=mapping(v,"case");keys(r,["id","original_wave","source_atom","title_ru","original_status",
   "editorial_assessment","assessment_ru","outstanding_ru","author_question_ru"],"individual R40");
   const id=nine[i]!,orig=findings.get(id)!;
   guard(r.id===id&&r.original_wave===orig.wave&&r.source_atom===orig.atom&&
     orig.state==="proposed"&&r.original_status==="open"&&r.editorial_assessment===modes[i],
     "R40 original authority, open status or order drift");
   return {id,wave:orig.wave,atom:orig.atom,title:prose(r.title_ru,"case title",14),
     assessment:prose(r.assessment_ru,"case assessment",155),
     gap:prose(r.outstanding_ru,"case gap",135),
     question:prose(r.author_question_ru,"author question",80)};
 });
 guard(JSON.stringify(cases.map(x=>x.id))===JSON.stringify(g42.findings.open),
 "W5 may not close or reorder scientific findings");
 guard(new Set(cases.map(x=>x.assessment)).size===9&&new Set(cases.map(x=>x.gap)).size===9,
 "each open case requires independent analysis");
 const snap=mapping(d.stack_checkpoint,"historical PR snapshot");
 keys(snap,["snapshot_kind","original_main_sha","branch_hygiene_pr",
 "branch_hygiene_head","sequence","safe_gate_ru","premerge_ru","exclusions_ru"],"PR snapshot");
 guard(snap.snapshot_kind==="audited-live-github-not-a-future-execution-license"&&
 snap.original_main_sha===current&&snap.branch_hygiene_pr===2157&&
 snap.branch_hygiene_head==="7dac7cc1629803a755cc6d47e9ea8f02b532add9",
 "snapshot cannot authorize GitHub action");
 const ss=values(snap.sequence,"four PRs");
 guard(ss.length===4,"four independent PR boundaries required");
 const stack=ss.map((r,i)=>{
  const v=mapping(r,"snapshot entry");keys(v,["pr","commits","head","base_pr"],"PR row");
  guard(v.pr===prs[i]&&v.commits===counts[i]&&v.head===heads[i]&&
  v.base_pr===(i?prs[i-1]:0),"exact contiguous PR checkpoint drift");
  return {pr:prs[i]!,head:heads[i]!,commits:counts[i]!,basePr:i?prs[i-1]!:0};
 });
 guard(stack.reduce((n,x)=>n+x.commits,0)===158,"stack count discrepancy");
 const safe=prose(snap.safe_gate_ru,"checks verdict",190),
 merge=prose(snap.premerge_ru,"safe merge plan",260),
 exclusion=prose(snap.exclusions_ru,"merge prohibitions",165);
 guard(safe.includes("SKIPPED")&&merge.includes("не SKIPPED")&&
 merge.includes("#2157")&&merge.includes("#2138 → #2153 → #2164 → #2173")&&
 exclusion.includes("автоматически"),"draft checks are not merge permission");
 const gate=mapping(d.author_science_gate,"author gate");
 keys(gate,["state","required_before_publication","source_atoms","accepted_requirements",
 "formal_cases","remaining_open","statement_ru"],"author gate");
 guard(gate.state==="hold-for-author-science-review"&&
 JSON.stringify(gate.required_before_publication)===
 JSON.stringify(["source-provenance-review","complete-mathematical-claim-review",
 "nine-open-r40-individual-decisions","explicit-author-publication-approval"])&&
 gate.source_atoms===119&&gate.accepted_requirements===48&&gate.formal_cases===8&&
 JSON.stringify(gate.remaining_open)===JSON.stringify(nine),
 "scientific publication cannot bypass nine R40");
 const conclusion=prose(gate.statement_ru,"scientific conclusion",170);
 guard(conclusion.includes("Девять")&&conclusion.includes("не превращают"),
 "a review is not proof of all MTS");
 return {cases,stack,merge,exclusion,gate:conclusion,publication:"blocked"};
}
export function loadReaderR44W5(root:string):R44W5{
 return parseR44W5(get(root,R44_W5_PATH),root);
}
export function renderReaderR44W5Preview(root:string):string{
 const r=loadReaderR44W5(root);let out=renderReaderR44W4Preview(root);
 guard(r.publication==="blocked"&&out.includes("ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА"),
 "author manuscript review cannot be bypassed");
 const at="## Редакционные ограничения R40";
 guard(out.split(at).length===2,"one R40 scientific boundary");
 const s=["## R44-W5 — девять открытых замечаний научной редакции","",
 "Проверены исходные формулировки R40, внесённые редакционные уточнения и оставшиеся доказательные обязательства. Каждый пункт сохраняет OPEN до индивидуального решения Автора.",""];
 for(const c of r.cases)s.push("### "+c.id+" — "+c.title,"",
 "Первичный аудит: "+c.wave+" / "+c.atom+".","",
 "**Что уже предъявлено:** "+c.assessment,"",
 "**Что ещё отсутствует:** "+c.gap,"",
 "**Вопрос для Автора:** "+c.question,"");
 s.push("## R44-W5 — условия будущего слияния научного стека","",
 "Историческая последовательность веток:");
 for(const x of r.stack)s.push("- PR #"+x.pr+": "+x.commits+" коммитов, head "+x.head);
 s.push("",r.merge,"","**Не разрешено:** "+r.exclusion,"",
 "**Статус научной приёмки:** "+r.gate,"");
 out=out.replace(at,s.join("\n")+"\n"+at);
 guard((out.match(/^\*\*(?:g4:|g7:|g8:|g10:|g11:|basis:|concept:|editorial:)/gm)??[]).length===119,
 "W5 cannot lose historical source atoms");
 guard((out.match(/^\*\*V15-[A-Z0-9-]+\*\* · /gm)??[]).length===48,
 "W5 cannot lose v0.15 individual reviews");
 guard((out.match(/^\*\*FRM-0[1-8] · точная область доказательства\*\*/gm)??[]).length===8,
 "W5 cannot lose FRM proof cases");
 return out;
}
