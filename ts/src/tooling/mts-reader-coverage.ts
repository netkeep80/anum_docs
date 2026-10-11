// G5 proposed reader coverage. Accepted registries are normative; these routes are not.
import { loadMtsSemanticIr, type MtsRequirementProjection } from "./mts-compiler.js";

export type ReaderSection = "foundations" | "inversion-and-context" | "representation" |
  "arithmetic" | "formal-notation" | "execution" | "architecture" |
  "worked-examples" | "assurance" | "governance" | "documentation" | "terminology";

const V14: Readonly<Record<string, ReaderSection>> = Object.freeze({
  "V14-L1": "foundations",
  "V14-L2": "formal-notation",
  "V14-L3": "representation",
  "V14-L4": "execution",
  "V14-L5": "foundations",
  "V14-L6": "arithmetic",
  "V14-L7": "representation",
  "V14-L8": "arithmetic",
  "V14-L9": "arithmetic",
  "V14-L10": "arithmetic",
  "V14-L11": "execution",
  "V14-L12": "inversion-and-context",
  "V14-L13": "representation",
  "V14-L14": "architecture",
});
const V15: Readonly<Record<string, ReaderSection>> = Object.freeze({
  TERM: "terminology", AUTH: "architecture", ONTO: "foundations",
  STRUCT: "foundations", CLOSE: "architecture", FRESH: "assurance",
  NAME: "formal-notation", JSON: "formal-notation", VERT: "assurance",
  AND: "worked-examples", CTX: "execution", GAMMA: "execution",
  FORMAL_PROOF: "assurance", STAGE: "architecture", FALS: "assurance",
  GOV: "governance", CORPUS: "assurance", DOCS: "documentation",
  READY: "governance", AUTHOR_JSON: "governance", REG: "assurance",
});
export interface ReaderCoverageRow {
  readonly id: string;
  readonly release: "v0.14" | "v0.15";
  readonly acceptedAuthority: { readonly path: string; readonly pointer: string };
  readonly currentDocOwner: { readonly path: string; readonly anchor: string };
  readonly normativeDependsOn: readonly string[];
  readonly proposedSection: ReaderSection;
  readonly readerDependsOn: "scientific-review-pending";
  readonly russianAtomicReview: "pilot-proposed" | "not-started";
  readonly authorApproval: "not-recorded";
  readonly publication: "blocked";
}
export interface ReaderCoveragePlan {
  readonly schema: "mts-reader-coverage-plan/v0.1";
  readonly status: "proposed";
  readonly semanticChange: false;
  readonly authority: "accepted-registries-only";
  readonly v014Count: 14;
  readonly v015Count: 48;
  readonly rows: readonly ReaderCoverageRow[];
}
function fail(message: string): never {
  throw new Error("mts-reader-coverage: " + message);
}
export function projectReaderCoverage(
  v14: readonly MtsRequirementProjection[],
  v15: readonly MtsRequirementProjection[],
): ReaderCoveragePlan {
  if (v14.length !== 14 || v15.length !== 48) fail("expected exact 14 + 48 accepted ID coverage");
  const ids = new Set<string>();
  const convert = (item: MtsRequirementProjection, release: ReaderCoverageRow["release"]): ReaderCoverageRow => {
    if (ids.has(item.id) || item.status !== "accepted") fail("duplicate or non-accepted ID " + item.id);
    if (!item.authorityDocument || item.authorityPointer !== "/requiredSemanticLaws/" + item.id ||
        !item.docPath || !item.docAnchor) {
      fail("missing accepted authority or current documentation owner for " + item.id);
    }
    let proposedSection: ReaderSection | undefined;
    if (release === "v0.14") proposedSection = V14[item.id];
    else {
      if (!item.classificationPath.startsWith("v015/")) fail("unrecognized v0.15 grouping: " + item.id);
      const group = item.classificationPath.slice(5).toUpperCase().replace(/-/g, "_");
      proposedSection = V15[group];
    }
    if (!proposedSection) fail("scientific chapter routing has no owner for " + item.id);
    ids.add(item.id);
    return Object.freeze({
      id: item.id, release,
      acceptedAuthority: Object.freeze({path: item.authorityDocument, pointer: item.authorityPointer}),
      currentDocOwner: Object.freeze({path: item.docPath, anchor: item.docAnchor}),
      normativeDependsOn: Object.freeze([...item.dependsOn]),
      proposedSection,
      readerDependsOn: "scientific-review-pending" as const,
      russianAtomicReview: (item.id === "V14-L1" ? "pilot-proposed" : "not-started") as
        ReaderCoverageRow["russianAtomicReview"],
      authorApproval: "not-recorded" as const,
      publication: "blocked" as const,
    });
  };
  const rows = [...v14.map(x => convert(x, "v0.14")), ...v15.map(x => convert(x, "v0.15"))];
  const allIds = new Set(rows.map(x => x.id));
  for (const row of rows) for (const dep of row.normativeDependsOn) {
    if (!allIds.has(dep)) fail(row.id + " has unresolved normative dependency " + dep);
  }
  if (ids.size !== 62 || Object.keys(V14).length !== 14 || Object.keys(V15).length !== 21) {
    fail("incomplete scientific section coverage");
  }
  return Object.freeze({
    schema: "mts-reader-coverage-plan/v0.1",
    status: "proposed", semanticChange: false, authority: "accepted-registries-only",
    v014Count: 14, v015Count: 48, rows: Object.freeze(rows),
  });
}
export function loadReaderCoverage(root: string): ReaderCoveragePlan {
  return projectReaderCoverage(
    loadMtsSemanticIr(root, "requirements/mts-v0.14.json").requirements,
    loadMtsSemanticIr(root).requirements,
  );
}
export function renderReaderCoverageAudit(plan: ReaderCoveragePlan): string {
  const bySection = new Map<ReaderSection, number>();
  for (const row of plan.rows) bySection.set(row.proposedSection, (bySection.get(row.proposedSection) ?? 0) + 1);
  return [
    "schema=" + plan.schema, "status=" + plan.status,
    "accepted_ids=" + plan.rows.length,
    "inherited_v014=" + plan.v014Count, "accepted_v015=" + plan.v015Count,
    "author_approved=" + plan.rows.filter(r => r.authorApproval !== "not-recorded").length,
    "publication_ready=" + plan.rows.filter(r => r.publication !== "blocked").length,
    "reader_edges_verified=0", "atomic_pilot=V14-L1",
    ...[...bySection].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) =>
      "proposed_section." + key + "=" + count),
  ].join("\n");
}
