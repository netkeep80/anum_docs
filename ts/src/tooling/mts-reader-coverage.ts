import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";
// G5 proposed reader coverage. Accepted registries are normative; these routes are not.
import { loadMtsSemanticIr, type MtsRequirementProjection } from "./mts-compiler.js";
import { loadMtsSourceRequirement } from "./mts-source-requirement.js";

export type ReaderSection = "foundations" | "inversion-and-context" | "representation" |
  "arithmetic" | "formal-notation" | "execution" | "architecture" |
  "worked-examples" | "proofs" | "assurance" | "governance" | "documentation" | "terminology";

export const READER_ROUTE_MODEL_PATH = "requirements/mts-source/MTS-READER-ROUTE-PROPOSAL.yaml";
const CHAPTERS = [
  "foundations", "inversion-and-context", "representation", "arithmetic",
  "formal-notation", "execution", "architecture", "worked-examples",
  "proofs", "assurance", "governance", "documentation", "terminology",
] as const;

export interface ReaderRoutes {
  readonly chapters: Readonly<Record<ReaderSection, string>>;
  readonly v014: Readonly<Record<string, ReaderSection>>;
  readonly v015Groups: Readonly<Record<string, ReaderSection>>;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("mts-reader-coverage: " + label + " must be an object");
  }
  return value as Record<string, unknown>;
}
function exactFields(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  if (Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) {
    throw new Error("mts-reader-coverage: " + label + " field mismatch");
  }
}
export function parseReaderRoutes(text: string): ReaderRoutes {
  const doc = parseDocument(text, { strict: true, uniqueKeys: true });
  if (doc.errors.length || doc.warnings.length) fail("invalid editorial YAML source");
  const raw = object(doc.toJS({maxAliasCount: 0}), "route proposal");
  exactFields(raw, ["schema", "status", "semantic_change", "author_approval",
    "reader_edges", "chapters", "v014", "v015_groups"], "route proposal");
  if (raw.schema !== "mts-reader-route-proposal/v0.1" || raw.status !== "proposed" ||
      raw.semantic_change !== false || raw.author_approval !== "not-recorded" ||
      raw.reader_edges !== "scientific-review-pending") {
    fail("reader routes must remain proposed, unapproved, and not publishing");
  }
  const chapters = object(raw.chapters, "chapters");
  exactFields(chapters, CHAPTERS, "chapters");
  for (const chapter of CHAPTERS) {
    if (typeof chapters[chapter] !== "string" || !(chapters[chapter] as string).trim()) {
      fail("chapter needs nonempty Russian label: " + chapter);
    }
  }
  const readMap = (value: unknown, label: string, count: number) => {
    const map = object(value, label);
    if (Object.keys(map).length !== count) fail(label + " coverage must equal " + count);
    for (const [key, section] of Object.entries(map)) {
      if (!CHAPTERS.includes(section as ReaderSection)) fail(label + " invalid section for " + key);
      if (label === "v014" && !/^V14-L(?:[1-9]|1[0-4])$/.test(key)) {
        fail("v014 invalid semantic ID " + key);
      }
      if (label === "v015_groups" && !/^[A-Z]+(?:_[A-Z]+)*$/.test(key)) {
        fail("v015 invalid group " + key);
      }
    }
    return Object.freeze(map as Record<string, ReaderSection>);
  };
  return Object.freeze({
    chapters: Object.freeze(chapters as Record<ReaderSection, string>),
    v014: readMap(raw.v014, "v014", 14),
    v015Groups: readMap(raw.v015_groups, "v015_groups", 21),
  });
}
export function loadReaderRoutes(root: string): ReaderRoutes {
  return parseReaderRoutes(readFileSync(resolve(root, READER_ROUTE_MODEL_PATH), "utf8"));
}

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
  routes: ReaderRoutes,
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
    if (release === "v0.14") proposedSection = routes.v014[item.id];
    else {
      if (!item.classificationPath.startsWith("v015/")) fail("unrecognized v0.15 grouping: " + item.id);
      const group = item.classificationPath.slice(5).toUpperCase().replace(/-/g, "_");
      proposedSection = routes.v015Groups[group];
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
  if (ids.size !== 62 || Object.keys(routes.v014).length !== 14 || Object.keys(routes.v015Groups).length !== 21) {
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
    loadReaderRoutes(root),
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


// G6: point-of-introduction edges are editorial, never accepted 'dependsOn'.
// A chapter may recur between points; this is deliberately not a chapter-level DAG.
export const READER_INTRO_MODEL_PATH = "requirements/mts-source/MTS-READER-INTRO-PROPOSAL.yaml";
export interface ReaderIntroNode {
  readonly id: string;
  readonly acceptedId: string;
  readonly section: ReaderSection;
  readonly g4ScienceStep: string | null;
  readonly requires: readonly string[];
  readonly reasonRu: string;
  readonly review: "pending";
}
export interface ReaderIntroPlan {
  readonly schema: "mts-reader-intro-proposal/v0.1";
  readonly status: "proposed";
  readonly publication: "blocked";
  readonly completeness: "partial-reviewed-bridges";
  readonly nodes: readonly ReaderIntroNode[];
}
export function parseReaderIntro(
  yaml: string,
  coverage: ReaderCoveragePlan,
  g4Steps: readonly string[],
): ReaderIntroPlan {
  const doc = parseDocument(yaml, { strict: true, uniqueKeys: true });
  if (doc.errors.length || doc.warnings.length) fail("invalid introductory DAG YAML");
  const raw = object(doc.toJS({maxAliasCount: 0}), "intro proposal");
  exactFields(raw, ["schema", "status", "semantic_change", "author_approval",
    "publication", "completeness", "nodes"], "intro proposal");
  if (raw.schema !== "mts-reader-intro-proposal/v0.1" || raw.status !== "proposed" ||
      raw.semantic_change !== false || raw.author_approval !== "not-recorded" ||
      raw.publication !== "blocked" || raw.completeness !== "partial-reviewed-bridges") {
    fail("introductory DAG must remain partial, proposed, unapproved and blocked");
  }
  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) fail("intro nodes missing");
  const accepted = new Map(coverage.rows.map(row => [row.id, row]));
  const anchored = new Set(g4Steps);
  const declared = new Set<string>();
  const nodes = raw.nodes.map((item, index) => {
    const name = "intro.nodes[" + index + "]";
    const record = object(item, name);
    const allowed = ["id", "accepted_id", "section", "requires", "reason_ru", "review"];
    if (Object.prototype.hasOwnProperty.call(record, "g4_science_step")) allowed.push("g4_science_step");
    exactFields(record, allowed, name);
    const id = record.id;
    if (typeof id !== "string" || !/^[a-z][a-z0-9-]*$/.test(id) || declared.has(id)) {
      fail(name + " has duplicate/invalid ID");
    }
    const acceptedId = record.accepted_id;
    const row = accepted.get(String(acceptedId));
    if (!row || row.publication !== "blocked") fail(name + " references unknown/unblocked accepted ID");
    if (record.section !== row.proposedSection) fail(name + " mismatched proposed section for " + acceptedId);
    const anchor = record.g4_science_step;
    if (anchor !== undefined && (acceptedId !== "V14-L1" ||
        typeof anchor !== "string" || !anchored.has(anchor))) {
      fail(name + " forged or missing G4 science anchor");
    }
    if (!Array.isArray(record.requires) || new Set(record.requires).size !== record.requires.length ||
        record.requires.some(dep => typeof dep !== "string" || !declared.has(dep))) {
      fail(name + " reader prerequisites must be unique and precede their consumer");
    }
    if (typeof record.reason_ru !== "string" || record.reason_ru.trim().length < 30) {
      fail(name + " needs individual Russian pedagogical rationale");
    }
    if (record.review !== "pending") fail(name + " cannot claim approved science review");
    declared.add(id);
    return Object.freeze({
      id, acceptedId: String(acceptedId), section: row.proposedSection,
      g4ScienceStep: typeof anchor === "string" ? anchor : null,
      requires: Object.freeze([...record.requires]) as readonly string[],
      reasonRu: record.reason_ru as string,
      review: "pending" as const,
    });
  });
  if (!nodes.some(x => x.g4ScienceStep === "foundation")) fail("foundation anchor missing");
  return Object.freeze({
    schema: "mts-reader-intro-proposal/v0.1" as const,
    status: "proposed" as const,
    publication: "blocked" as const,
    completeness: "partial-reviewed-bridges" as const,
    nodes: Object.freeze(nodes),
  });
}
export function loadReaderIntro(root: string): ReaderIntroPlan {
  const g4 = loadMtsSourceRequirement(root, "requirements/mts-source/MTS-FND-V14-L1.yaml");
  if (!g4.readerScience || g4.readerScience.publication !== "blocked") fail("G4 reader science prerequisite is absent");
  return parseReaderIntro(
    readFileSync(resolve(root, READER_INTRO_MODEL_PATH), "utf8"),
    loadReaderCoverage(root),
    g4.readerScience.steps.map(step => step.id),
  );
}
