import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";
import { loadReaderG20, loadReaderG41, renderReaderG41Preview } from "./mts-reader-g20.js";

export const READER_G42_PATH = "requirements/mts-source/MTS-READER-ACADEMIC-COMPOSITION-G42.yaml";

interface ReviewAtom { position: number; node: string; disposition: string; }
interface Chapter {
  id: string; titleRu: string; bridgeRu: string; scopeRu: string; boundaryRu: string;
  positions?: readonly number[] | undefined; dispositions?: readonly string[] | undefined;
  atomIds: readonly string[];
}
interface ProofCase {
  id: string; classification: string; premises: readonly string[]; exclusions: readonly string[];
  lean4: readonly string[]; rocq: readonly string[];
}
export interface ReaderG42Plan {
  readonly chapters: readonly Chapter[];
  readonly proofCases: readonly ProofCase[];
  readonly findings: Readonly<{ corrected: readonly string[]; mitigated: readonly string[]; open: readonly string[]; }>;
  readonly order: readonly string[];
  readonly publication: "blocked";
}

function check(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error("mts-reader-g42: " + msg);
}
function object(value: unknown, at: string): Record<string, unknown> {
  check(value !== null && typeof value === "object" && !Array.isArray(value), at + " must be mapping");
  return value as Record<string, unknown>;
}
function keys(raw: Record<string,unknown>, exact: readonly string[], at: string): void {
  check(Object.keys(raw).sort().join("|") === [...exact].sort().join("|"), at + " keys mismatch");
}
function readYaml(content: string, label: string): Record<string,unknown> {
  const doc = parseDocument(content, { strict: true, uniqueKeys: true });
  check(doc.errors.length === 0 && doc.warnings.length === 0, label + " malformed/duplicate YAML");
  return object(doc.toJS({ maxAliasCount: 0 }), label);
}
function strings(value: unknown, at: string): string[] {
  check(Array.isArray(value) && value.every(v => typeof v === "string"), at + " needs strings");
  return value as string[];
}

export function parseReaderG42(source: string, root: string): ReaderG42Plan {
  const draft = loadReaderG20(root);
  const g41 = loadReaderG41(root);
  check(draft.publication === "blocked" && g41.publication === "blocked", "source approval boundary");
  const raw = readYaml(source, "G42");
  keys(raw, ["schema","status","author_approval","publication","semantic_change",
    "scientific_review","source_reader","first_use_projection","r40_reviews",
    "proof_inventory","coverage","proof_cases","chapters","finding_policy"], "G42");
  check(raw.schema === "mts-reader-academic-composition/v0.1" &&
    raw.status === "proposed" && raw.author_approval === "not-recorded" &&
    raw.publication === "blocked" && raw.semantic_change === false &&
    raw.scientific_review === "pending-independent-second-pass" &&
    raw.source_reader === "requirements/mts-source/MTS-READER-FIRST-USE-G20.yaml" &&
    raw.first_use_projection === "requirements/mts-source/MTS-READER-FIRST-USE-REPAIR-G41.yaml" &&
    raw.proof_inventory === "proofs/v015-formal-proof-assurance.json",
    "cannot upgrade G42 into accepted science or publication");
  const coverage = object(raw.coverage, "coverage");
  keys(coverage, ["atoms","findings","reader_edges","inherited_edges"], "coverage");
  check(coverage.atoms === 119 && coverage.findings === 15 &&
    coverage.reader_edges === draft.edges && coverage.inherited_edges === 57,
    "source coverage drift");
  const expectedReviews = ["W1","W2","W3"].map(w =>
    "requirements/mts-source/MTS-READER-PROSE-AUDIT-R40-" + w + ".yaml");
  check(JSON.stringify(strings(raw.r40_reviews,"reviews")) === JSON.stringify(expectedReviews),
    "R40 source owner drift");
  const entries: ReviewAtom[] = [], knownFindings: string[] = [];
  for (const path of expectedReviews) {
    const audit = readYaml(readFileSync(resolve(root,path),"utf8"), path);
    check(audit.schema === "mts-reader-prose-audit/v0.1" &&
      audit.status === "proposed" && audit.author_approval === "not-recorded" &&
      audit.publication === "blocked", "R40 boundary drift");
    check(Array.isArray(audit.entries) && Array.isArray(audit.findings), "R40 row shape");
    for(const e of audit.entries as unknown[]) {
      const row = object(e,"R40 atom");
      check(Number.isInteger(row.position) && typeof row.node === "string" &&
        typeof row.disposition === "string", "R40 atom malformed");
      entries.push({position: row.position as number, node: row.node as string,
        disposition: row.disposition as string});
    }
    for(const f of audit.findings as unknown[]) {
      const finding = object(f,"R40 finding");
      check(typeof finding.id === "string","R40 finding identifier missing");
      knownFindings.push(finding.id as string);
    }
  }
  check(entries.length === 119 && new Set(entries.map(e=>e.node)).size === 119 &&
    new Set(knownFindings).size === 15, "R40 completeness/uniqueness");
  for(let i=0;i<119;i++){
    check(entries[i]?.position === i+1 && entries[i]?.node === draft.ordered[i]?.id,
      "R40 individual order not exact G20 order at " + (i+1));
  }
  const chaptersRaw = raw.chapters;
  check(Array.isArray(chaptersRaw) && chaptersRaw.length === 10,
    "G42 requires exactly ten domain chapters");
  const used = new Set<string>(), categories = new Set<string>();
  const chapters: Chapter[] = chaptersRaw.map((v, index) => {
    const ch = object(v,"G42 chapter");
    const hasRange = Object.hasOwn(ch,"positions");
    keys(ch, ["id","title_ru","bridge_ru","scope_ru","boundary_ru",
      hasRange ? "positions" : "dispositions"], "G42 chapter");
    for(const field of ["id","title_ru","bridge_ru","scope_ru","boundary_ru"]) {
      check(typeof ch[field] === "string" && (ch[field] as string).trim().length >= (field==="id"?4:45),
        "G42 chapter needs substantive " + field);
    }
    check(typeof ch.id === "string" && !chaptersRaw.slice(0,index).some(x => object(x,"chapter").id === ch.id),
      "G42 duplicate chapter");
    let selected: ReviewAtom[];
    if(hasRange){
      const span=ch.positions;
      check(Array.isArray(span) && span.length===2 &&
        span.every(n=>Number.isInteger(n)),"G42 position span");
      const a = (span as number[])[0]!; const b = (span as number[])[1]!;
      check(a>=1 && b<=71 && a<=b,"G42 range must stay inside v0.14 71-entry review");
      selected=entries.filter(e=>e.position>=a && e.position<=b);
    } else {
      const ds = strings(ch.dispositions, "G42 dispositions");
      check(ds.length>0 && new Set(ds).size===ds.length,"G42 duplicate dispositions");
      for(const d of ds) {check(!categories.has(d),"G42 repeated disposition");categories.add(d);}
      selected=entries.filter(e=>e.position>71 && ds.includes(e.disposition));
    }
    check(selected.length>0,"G42 empty chapter");
    for(const e of selected) {
      check(!used.has(e.node),"G42 atom repeated: "+e.node); used.add(e.node);
    }
    return {id:ch.id as string,titleRu:ch.title_ru as string,bridgeRu:ch.bridge_ru as string,
      scopeRu:ch.scope_ru as string,boundaryRu:ch.boundary_ru as string,
      positions:hasRange ? ch.positions as number[] : undefined,
      dispositions:hasRange ? undefined : strings(ch.dispositions,"G42 dispositions"),
      atomIds:selected.map(e=>e.node)};
  });
  check(used.size===119, "G42 lost reviewed source atoms; left: " +
    entries.filter(e=>!used.has(e.node)).map(e=>e.node).join(","));
  const order = chapters.flatMap(c=>c.atomIds);
  const rank = new Map(order.map((id,i)=>[id,i]));
  for(const atom of draft.ordered){
    for(const prereq of atom.readerRequires) {
      check(rank.has(prereq) && rank.get(prereq)! < rank.get(atom.id)!,
        "G42 academic reorder violates G20 reader prerequisite: "+prereq+" -> "+atom.id);
    }
  }
  const policy = object(raw.finding_policy,"G42 finding_policy");
  keys(policy,["already_corrected","mitigated_needs_rereview",
    "open_for_scientific_second_pass"],"G42 finding_policy");
  const corrected=strings(policy.already_corrected,"corrected");
  const mitigated=strings(policy.mitigated_needs_rereview,"mitigated");
  const open=strings(policy.open_for_scientific_second_pass,"open");
  check(JSON.stringify(corrected)===JSON.stringify(["R40-05"]) &&
    corrected.length+mitigated.length+open.length===15 &&
    new Set([...corrected,...mitigated,...open]).size===15 &&
    knownFindings.every(id=>[...corrected,...mitigated,...open].includes(id)),
    "G42 R40 findings not independently tracked");
  const proofs=JSON.parse(readFileSync(resolve(root,raw.proof_inventory as string),"utf8")) as unknown;
  const proofRegistry=object(proofs,"accepted proof inventory");
  check(Array.isArray(proofRegistry.targets), "accepted proof registry targets missing");
  const requested = strings(raw.proof_cases,"proof cases");
  check(JSON.stringify(requested)===JSON.stringify(["FRM-03","FRM-04","FRM-07"]),
    "G42 proof cases not reviewed");
  const proofCases = requested.map(id=>{
    const target=object((proofRegistry.targets as unknown[]).find(t=>object(t,"proof").id===id),"proof "+id);
    check(typeof target.classification==="string","proof classification missing");
    const premises=strings(target.premises,"proof premises"),exclusions=strings(target.exclusions,"proof exclusions");
    const lean4=strings(target.lean4,"Lean4"),rocq=strings(target.rocq,"Rocq");
    check(lean4.length>0 && rocq.length>0 && exclusions.length>0,"proof witness incomplete");
    return {id,classification:target.classification as string,premises,exclusions,lean4,rocq};
  });
  check(proofCases[1]?.classification==="PROVED_UNDER_EXACT_SEQUENCE_INJECTIVITY" &&
    proofCases[1]?.premises.length===2 &&
    proofCases[2]?.classification==="PROVED_UNDER_EXPLICIT_PRODUCTION_REFINEMENT_PREMISES",
    "FRM-04/07 mathematical assurance must not be inflated");
  return {chapters,proofCases,findings:{corrected,mitigated,open},order,publication:"blocked"};
}
export function loadReaderG42(root: string): ReaderG42Plan {
  return parseReaderG42(readFileSync(resolve(root,READER_G42_PATH),"utf8"),root);
}
export function renderReaderG42Preview(root: string): string {
  const plan=loadReaderG42(root);
  const draft=loadReaderG20(root);
  check(plan.publication==="blocked","G42 publication forbidden");
  const original=renderReaderG41Preview(root);
  const marks=[...original.matchAll(/^## ([^\n]+)\n/gm)];
  check(marks.length===119,"G41 119 source sections missing");
  const blocks = new Map<string,string>();
  for(let i=0;i<marks.length;i++){
    const a=marks[i]!, start=a.index!+a[0].length;
    const end=i+1<marks.length ? marks[i+1]!.index! : original.length;
    check(!blocks.has(a[1]!),"G41 duplicate atom");
    blocks.set(a[1]!,original.slice(start,end).trim().replace(/^### /gm,"#### "));
  }
  const byId=new Map(draft.ordered.map(x=>[x.id,x]));
  const lines=[
    "# Метатеория связей v0.15 — научная композиция G42",
    "",
    "**ПРЕДЛОЖЕНИЕ. НЕ УТВЕРЖДЕНО АВТОРОМ. ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА.**",
    "",
    "Главы и переходы предложены редакционной моделью. Оригинальные тексты взяты из G41/G20 владельцев; proof conditions — из принятого реестра. Это НЕ новый закон и НЕ независимая научная приёмка.",
    ""
  ];
  for (const chapter of plan.chapters) {
    lines.push("## "+chapter.titleRu,"",chapter.bridgeRu,"",
      "*Область: "+chapter.scopeRu+"*","",
      "*Ограничение: "+chapter.boundaryRu+"*","");
    for(const id of chapter.atomIds){
      const atom=byId.get(id),body=blocks.get(id);
      check(atom && body!==undefined,"G42 lost G41 original source "+id);
      lines.push("**"+id+"** · "+atom.acceptedId+" · источник "+atom.sourceOwner+"/"+atom.sourceAtom,
        "",body,"");
    }
    if(chapter.id==="proof-and-refinement"){
      lines.push("### Точные внешние доказательные свидетельства (выбранный фрагмент)","");
      for(const p of plan.proofCases){
        lines.push("**"+p.id+" — "+p.classification+"**","",
          "Предпосылки: "+(p.premises.join("; ")||"в данном реестре не перечислены")+".",
          "Исключения: "+p.exclusions.join("; ")+".",
          "Lean4: "+p.lean4.join(", ")+".",
          "Rocq: "+p.rocq.join(", ")+".","");
      }
    }
  }
  lines.push("## Редакционные ограничения R40","",
    "Исправлено ранее: "+plan.findings.corrected.join(", ")+".",
    "Смягчено G41, требуется повторная индивидуальная проверка: "+plan.findings.mitigated.join(", ")+".",
    "Открыто ко второй научной рецензии: "+plan.findings.open.join(", ")+".","");
  return lines.join("\n");
}
