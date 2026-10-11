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
  readonly completeness: "partial-candidate-bridges";
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
      raw.publication !== "blocked" || raw.completeness !== "partial-candidate-bridges") {
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
    completeness: "partial-candidate-bridges" as const,
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


export const READER_ATOMIC_V14_G7_PATH = "requirements/mts-source/MTS-READER-V14-G7.yaml";
export interface ReaderG7Atom {
  readonly id: string;
  readonly acceptedId: "V14-L5" | "V14-L6" | "V14-L13" | "V14-L12";
  readonly role: "accepted-contract" | "scope-boundary" | "conditional-theorem";
  readonly sourceQuote: string;
  readonly ru: string;
  readonly domain: string;
  readonly exclusions: readonly string[];
  readonly requires: readonly string[];
  readonly g4ScienceStep: string | null;
  readonly proofSymbol: string | null;
  readonly proofPremises: readonly string[];
}
export interface ReaderG7Plan {
  readonly schema: "mts-reader-atomic-v14/v0.1";
  readonly status: "proposed";
  readonly authorApproval: "not-recorded";
  readonly publication: "blocked";
  readonly proofCheck: "declarations-only";
  readonly atoms: readonly ReaderG7Atom[];
}
export function parseReaderG7(
  text: string,
  acceptedLaws: ReadonlyMap<string, string>,
  g4: NonNullable<ReturnType<typeof loadMtsSourceRequirement>["readerScience"]>,
): ReaderG7Plan {
  const doc = parseDocument(text, { strict: true, uniqueKeys: true });
  if (doc.errors.length || doc.warnings.length) fail("invalid G7 atomic YAML");
  const raw = object(doc.toJS({maxAliasCount: 0}), "G7 model");
  exactFields(raw, ["schema", "status", "semantic_change", "author_approval", "publication",
    "proof_check", "accepted_scope", "atoms"], "G7 model");
  if (raw.schema !== "mts-reader-atomic-v14/v0.1" || raw.status !== "proposed" ||
      raw.semantic_change !== false || raw.author_approval !== "not-recorded" ||
      raw.publication !== "blocked" || raw.proof_check !== "declarations-only") {
    fail("G7 cannot promote scientific prose or proof status");
  }
  const scope = ["V14-L5", "V14-L6", "V14-L13", "V14-L12"];
  if (!Array.isArray(raw.accepted_scope) || raw.accepted_scope.join(",") !== scope.join(",")) {
    fail("G7 accepted scope mismatch");
  }
  if (!Array.isArray(raw.atoms) || raw.atoms.length !== 17) fail("G7 requires exactly 17 source-owned atoms");
  const used = new Set<string>();
  const texts = new Set<string>();
  const owners = new Set<string>();
  const g4ById = new Map(g4.steps.map(step => [step.id, step]));
  const atoms: ReaderG7Atom[] = raw.atoms.map((value, index) => {
    const label = "G7.atom[" + index + "]";
    const item = object(value, label);
    const role = item.role;
    const conditional = role === "conditional-theorem";
    if (role !== "accepted-contract" && role !== "scope-boundary" && !conditional) fail(label + " invalid role");
    const keys = ["id", "accepted_id", "role", "source_quote", "ru", "domain", "exclusions", "requires"];
    if (conditional) keys.push("g4_science_step", "proof_symbol", "proof_premises");
    exactFields(item, keys, label);
    const id = item.id;
    const acceptedId = item.accepted_id;
    if (typeof id !== "string" || !/^[a-z][a-z0-9-]+$/.test(id) || used.has(id)) fail(label + " duplicate/invalid id");
    if (typeof acceptedId !== "string" || !scope.includes(acceptedId)) fail(label + " unknown accepted law");
    const normative = acceptedLaws.get(acceptedId);
    if (!normative || typeof item.source_quote !== "string" ||
        item.source_quote.length < 20 || !normative.includes(item.source_quote)) {
      fail(label + " source quote not exact in accepted contract");
    }
    if (typeof item.ru !== "string" || item.ru.trim().length < 100 || texts.has(item.ru.trim())) {
      fail(label + " scientific Russian prose missing or duplicated");
    }
    if (typeof item.domain !== "string" || !item.domain.trim() ||
        !Array.isArray(item.exclusions) || item.exclusions.length === 0 ||
        item.exclusions.some(e => typeof e !== "string" || !e.trim())) {
      fail(label + " domain and exclusions must be explicit");
    }
    if (!Array.isArray(item.requires) || new Set(item.requires).size !== item.requires.length ||
        item.requires.some(dep => typeof dep !== "string" || !used.has(dep))) {
      fail(label + " requires unique earlier G7 atoms");
    }
    let g4ScienceStep: string | null = null;
    let proofSymbol: string | null = null;
    let proofPremises: string[] = [];
    if (conditional) {
      const g4Step = g4ById.get(String(item.g4_science_step));
      if (!g4Step || g4Step.role !== "conditional-theorem" ||
          typeof item.proof_symbol !== "string" || g4Step.proofSymbol !== item.proof_symbol ||
          !Array.isArray(item.proof_premises) || item.proof_premises.join(",") !== g4Step.premises.join(",")) {
        fail(label + " conditional theorem fails exact G4 signature/premises bridge");
      }
      g4ScienceStep = g4Step.id;
      proofSymbol = g4Step.proofSymbol;
      proofPremises = [...g4Step.premises];
    }
    used.add(id);
    texts.add(item.ru.trim());
    owners.add(acceptedId);
    return Object.freeze({
      id, acceptedId: acceptedId as ReaderG7Atom["acceptedId"],
      role: role as ReaderG7Atom["role"], sourceQuote: item.source_quote,
      ru: item.ru, domain: item.domain, exclusions: Object.freeze([...item.exclusions]) as readonly string[],
      requires: Object.freeze([...item.requires]) as readonly string[],
      g4ScienceStep, proofSymbol, proofPremises: Object.freeze(proofPremises),
    });
  });
  if (owners.size !== 4 || scope.some(id => !owners.has(id))) fail("G7 incomplete accepted-law coverage");
  return Object.freeze({
    schema: "mts-reader-atomic-v14/v0.1" as const, status: "proposed" as const,
    authorApproval: "not-recorded" as const, publication: "blocked" as const,
    proofCheck: "declarations-only" as const, atoms: Object.freeze(atoms),
  });
}
export function loadReaderG7(root: string): ReaderG7Plan {
  const acceptedLaws = new Map(
    loadMtsSemanticIr(root, "requirements/mts-v0.14.json").requirements.map(l => [l.id, l.statement]),
  );
  const g4 = loadMtsSourceRequirement(root, "requirements/mts-source/MTS-FND-V14-L1.yaml");
  if (!g4.readerScience || g4.readerScience.publication !== "blocked") {
    fail("G7 requires unapproved but verified G4 source-owner science");
  }
  return parseReaderG7(readFileSync(resolve(root, READER_ATOMIC_V14_G7_PATH), "utf8"),
    acceptedLaws, g4.readerScience);
}


export const READER_ATOMIC_V14_G8_PATH = "requirements/mts-source/MTS-READER-V14-G8.yaml";
export interface ReaderG8Atom {
  readonly id: string;
  readonly acceptedId: "V14-L2" | "V14-L14";
  readonly section: ReaderSection;
  readonly role: "accepted-contract" | "scope-boundary" | "version-boundary";
  readonly sourceQuote: string;
  readonly acceptedDetailPointer: string;
  readonly ru: string;
  readonly domain: string;
  readonly exclusions: readonly string[];
  readonly requires: readonly string[];
  readonly relatedAcceptedId: string | null;
}
export interface ReaderG8Plan {
  readonly schema: "mts-reader-atomic-v14/v0.2";
  readonly status: "proposed";
  readonly authorApproval: "not-recorded";
  readonly publication: "blocked";
  readonly proofCheck: "contract-trace-only";
  readonly atoms: readonly ReaderG8Atom[];
}
function resolveReaderContractPointer(contract: Record<string, unknown>, pointer: string): unknown {
  if (!/^\/(ostensiveFormalNotation|representationLayers)\/[A-Za-z][A-Za-z0-9]*$/.test(pointer)) {
    fail("G8 disallowed contract detail pointer");
  }
  const parts = pointer.slice(1).split("/");
  let value: unknown = contract;
  for (const part of parts) {
    if (value === null || typeof value !== "object" || Array.isArray(value) ||
        !Object.prototype.hasOwnProperty.call(value, part)) fail("G8 accepted detail pointer unresolved");
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}
function verifyG8AcceptedLayerFacts(contract: Record<string, unknown>): void {
  const notation = object(contract.ostensiveFormalNotation, "accepted ostensive notation");
  const glyphs = object(notation.synonyms, "accepted glyph synonyms");
  const pairs: Readonly<Record<string, string>> = { "∞": "8", "♂": "9", "♀": "6", "⟼": "1" };
  if (Object.keys(glyphs).length !== 4 ||
      Object.entries(pairs).some(([glyph, value]) => glyphs[glyph] !== value)) {
    fail("G8 source model glyph-to-recursive-alphabet mismatch");
  }
  if (notation.implicitPairAssociativity !== "NONE" ||
      notation.ambiguousUngroupedFormsRejected !== true ||
      notation.finalSurfaceGrammar !== "GREEN_RESEARCH" ||
      JSON.stringify(notation.positionalForms) !== JSON.stringify(["∞", "♂S", "S♀", "A ⟼ B"])) {
    fail("G8 accepted v0.14 ostensive grammar scope has changed");
  }
  const layers = object(contract.representationLayers, "accepted representation layers");
  const expected = [
    ["ontology", 0, true, ["Link"]],
    ["recursiveStructure", 1, false, ["8", "9", "6", "1"]],
    ["representationsAndCodecs", 2, false, ["recursive Link codec", "Anum", "ExactSequence", "Q"]],
    ["byteText", 3, false, ["STRING", "UTF-8"]],
    ["symbolicMetanotation", 4, false, ["names", "Dictionary", "Grammar", "Theory", "FORMAL"]],
  ] as const;
  for (const [name, level, introducesOntology, members] of expected) {
    const layer = object(layers[name], "accepted " + name);
    if (layer.level !== level || layer.introducesOntologyEntity !== introducesOntology ||
        JSON.stringify(layer.members) !== JSON.stringify(members)) {
      fail("G8 accepted representation layer facts changed: " + name);
    }
  }
}

export function parseReaderG8(
  text: string,
  acceptedLaws: ReadonlyMap<string, string>,
  contract: Record<string, unknown>,
  coverage: ReaderCoveragePlan,
  v015Laws: ReadonlyMap<string, string>,
): ReaderG8Plan {
  const doc = parseDocument(text, { strict: true, uniqueKeys: true });
  if (doc.errors.length || doc.warnings.length) fail("invalid G8 atomic YAML");
  const raw = object(doc.toJS({maxAliasCount: 0}), "G8 model");
  exactFields(raw, ["schema", "status", "semantic_change", "author_approval", "publication",
    "proof_check", "accepted_scope", "atoms"], "G8 model");
  if (raw.schema !== "mts-reader-atomic-v14/v0.2" || raw.status !== "proposed" ||
      raw.semantic_change !== false || raw.author_approval !== "not-recorded" ||
      raw.publication !== "blocked" || raw.proof_check !== "contract-trace-only") {
    fail("G8 cannot promote editorial prose to accepted or proven");
  }
  verifyG8AcceptedLayerFacts(contract);
  const scope = ["V14-L2", "V14-L14"];
  if (!Array.isArray(raw.accepted_scope) || raw.accepted_scope.join(",") !== scope.join(",")) {
    fail("G8 accepted law scope mismatch");
  }
  if (!Array.isArray(raw.atoms) || raw.atoms.length !== 12) fail("G8 requires exactly 12 source-owned atoms");
  const used = new Set<string>();
  const texts = new Set<string>();
  const owners = new Set<string>();
  const sections = new Map(coverage.rows.map(row => [row.id, row.proposedSection]));
  const atoms: ReaderG8Atom[] = raw.atoms.map((entry, index) => {
    const item = object(entry, "G8.atom[" + index + "]");
    const role = item.role;
    if (role !== "accepted-contract" && role !== "scope-boundary" && role !== "version-boundary") {
      fail("G8 unknown atom role");
    }
    const fields = ["id", "accepted_id", "section", "role", "source_quote", "accepted_detail_pointer",
      "ru", "domain", "exclusions", "requires"];
    if (role === "version-boundary") fields.push("related_accepted_id");
    exactFields(item, fields, "G8.atom[" + index + "]");
    const id = item.id;
    if (typeof id !== "string" || !/^[a-z][a-z0-9-]+$/.test(id) || used.has(id)) {
      fail("G8 duplicate/invalid atom id");
    }
    const law = item.accepted_id;
    if (typeof law !== "string" || !scope.includes(law)) fail("G8 atom unknown accepted law");
    if (item.section !== sections.get(law)) fail("G8 atom mismatched G5 reader section");
    const statement = acceptedLaws.get(law);
    if (typeof item.source_quote !== "string" || item.source_quote.length < 20 ||
        !statement?.includes(item.source_quote)) fail("G8 accepted law source quote not exact");
    const pointer = item.accepted_detail_pointer;
    if (typeof pointer !== "string" ||
        !pointer.startsWith(law === "V14-L2" ? "/ostensiveFormalNotation/" : "/representationLayers/") ||
        resolveReaderContractPointer(contract, pointer) === undefined) {
      fail("G8 mismatched accepted detail source");
    }
    if (typeof item.ru !== "string" || item.ru.trim().length < 125 || texts.has(item.ru.trim())) {
      fail("G8 missing/duplicate scientific Russian prose");
    }
    if (typeof item.domain !== "string" || !item.domain.trim() ||
        !Array.isArray(item.exclusions) || !item.exclusions.length ||
        item.exclusions.some(x => typeof x !== "string" || !x.trim())) {
      fail("G8 missing domain or exclusions");
    }
    if (!Array.isArray(item.requires) || new Set(item.requires).size !== item.requires.length ||
        item.requires.some(x => typeof x !== "string" || !used.has(x))) {
      fail("G8 forward/cyclic/duplicate reader atom edge");
    }
    const related = item.related_accepted_id;
    if (role === "version-boundary" && (related !== "V15-JSON-02" || !v015Laws.has(related))) {
      fail("G8 version bridge must cite exact accepted v0.15 denotation law");
    }
    used.add(id);
    texts.add(item.ru.trim());
    owners.add(law);
    return Object.freeze({
      id, acceptedId: law as ReaderG8Atom["acceptedId"], section: item.section as ReaderSection,
      role: role as ReaderG8Atom["role"], sourceQuote: item.source_quote,
      acceptedDetailPointer: pointer, ru: item.ru, domain: item.domain,
      exclusions: Object.freeze([...item.exclusions]) as readonly string[],
      requires: Object.freeze([...item.requires]) as readonly string[],
      relatedAcceptedId: role === "version-boundary" ? related as string : null,
    });
  });
  if (owners.size !== 2 || scope.some(id => !owners.has(id))) fail("G8 incomplete accepted law coverage");
  return Object.freeze({
    schema: "mts-reader-atomic-v14/v0.2" as const, status: "proposed" as const,
    authorApproval: "not-recorded" as const, publication: "blocked" as const,
    proofCheck: "contract-trace-only" as const, atoms: Object.freeze(atoms),
  });
}
export function loadReaderG8(root: string): ReaderG8Plan {
  const v14 = loadMtsSemanticIr(root, "requirements/mts-v0.14.json").requirements;
  const v015 = loadMtsSemanticIr(root).requirements;
  const contract = object(
    JSON.parse(readFileSync(resolve(root, "contracts/mts-contract-v0.14.json"), "utf8")),
    "accepted v0.14 contract",
  );
  if (contract.schema !== "mts-contract/v0.14" || contract.accepted !== true) {
    fail("G8 source contract must be accepted v0.14");
  }
  return parseReaderG8(
    readFileSync(resolve(root, READER_ATOMIC_V14_G8_PATH), "utf8"),
    new Map(v14.map(row => [row.id, row.statement])),
    contract, loadReaderCoverage(root),
    new Map(v015.map(row => [row.id, row.statement])),
  );
}


/** G9: computed science-owner presence, not a statement of scientific completeness or author acceptance. */
export interface ReaderScienceOwnerPresence {
  readonly id: string;
  readonly release: "v0.14" | "v0.15";
  readonly section: ReaderSection;
  readonly atomicTextCount: number;
  readonly sourceOwnerPaths: readonly string[];
  readonly scienceSourceState: "proposed" | "not-started";
  readonly completeScientificArgument: false;
  readonly authorApproval: "not-recorded";
  readonly publication: "blocked";
}
export interface ReaderScienceCensus {
  readonly schema: "mts-reader-science-census/v0.1";
  readonly acceptedIds: 62;
  readonly proposedTextAtoms: number;
  readonly withSourceOwnedAtoms: number;
  readonly withoutSourceOwnedAtoms: number;
  readonly authorApproved: 0;
  readonly publicationReady: 0;
  readonly rows: readonly ReaderScienceOwnerPresence[];
}
/** The only admissible inputs are independently source-parsed G4/G7/G8 models. */
export function projectReaderScienceCensus(
  coverage: ReaderCoveragePlan,
  g4: ReturnType<typeof loadMtsSourceRequirement>,
  g7: ReaderG7Plan,
  g8: ReaderG8Plan,
): ReaderScienceCensus {
  if (coverage.rows.length !== 62 || coverage.rows.some(x => x.authorApproval !== "not-recorded" ||
      x.publication !== "blocked" || x.release !== "v0.14" && x.release !== "v0.15")) {
    fail("G9 accepted-law coverage or publication boundary changed");
  }
  if (g4.id !== "MTS-FND-V14-L1" || g4.modelStatus !== "proposed" ||
      !g4.readerScience || g4.readerScience.status !== "proposed" ||
      g4.readerScience.publication !== "blocked" || g4.readerScience.authorApproval !== "not-recorded" ||
      g7.status !== "proposed" || g7.publication !== "blocked" || g7.authorApproval !== "not-recorded" ||
      g8.status !== "proposed" || g8.publication !== "blocked" || g8.authorApproval !== "not-recorded") {
    fail("G9 only collects proposed unapproved science owners");
  }
  const accepted = new Set(coverage.rows.map(x => x.id));
  if (accepted.size !== 62) fail("G9 duplicate accepted ID in projection");
  const entries = new Map<string, { count: number; paths: Set<string> }>();
  const atomIds = new Set<string>();
  const add = (id: string, sourcePath: string, atomId: string) => {
    if (!accepted.has(id)) fail("G9 unknown accepted scientific owner " + id);
    if (!atomId || atomIds.has(atomId)) fail("G9 duplicate/empty source atom ID " + atomId);
    atomIds.add(atomId);
    const owner = entries.get(id) ?? { count: 0, paths: new Set<string>() };
    owner.count += 1;
    owner.paths.add(sourcePath);
    entries.set(id, owner);
  };
  for (const atom of g4.readerScience.steps) add("V14-L1", "requirements/mts-source/MTS-FND-V14-L1.yaml", atom.id);
  for (const atom of g7.atoms) add(atom.acceptedId, READER_ATOMIC_V14_G7_PATH, atom.id);
  for (const atom of g8.atoms) add(atom.acceptedId, READER_ATOMIC_V14_G8_PATH, atom.id);
  const rows = coverage.rows.map(row => {
    const owner = entries.get(row.id);
    return Object.freeze({
      id: row.id, release: row.release, section: row.proposedSection,
      atomicTextCount: owner?.count ?? 0,
      sourceOwnerPaths: Object.freeze(owner ? [...owner.paths].sort() : []),
      scienceSourceState: owner ? "proposed" as const : "not-started" as const,
      completeScientificArgument: false as const, authorApproval: "not-recorded" as const,
      publication: "blocked" as const,
    });
  });
  const total = rows.reduce((sum,row)=>sum + row.atomicTextCount, 0);
  if (total !== atomIds.size) fail("G9 scientific text ID census not injective");
  const withSourceOwnedAtoms = rows.filter(row=>row.atomicTextCount > 0).length;
  return Object.freeze({
    schema: "mts-reader-science-census/v0.1" as const,
    acceptedIds: 62 as const,
    proposedTextAtoms: total, withSourceOwnedAtoms,
    withoutSourceOwnedAtoms: rows.length - withSourceOwnedAtoms,
    authorApproved: 0 as const, publicationReady: 0 as const,
    rows: Object.freeze(rows),
  });
}
export function loadReaderScienceCensus(root: string): ReaderScienceCensus {
  return projectReaderScienceCensus(
    loadReaderCoverage(root),
    loadMtsSourceRequirement(root, "requirements/mts-source/MTS-FND-V14-L1.yaml"),
    loadReaderG7(root), loadReaderG8(root),
  );
}
export function renderReaderScienceCensus(census: ReaderScienceCensus): string {
  return [
    "schema=" + census.schema, "accepted_ids=" + census.acceptedIds,
    "proposed_science_atoms=" + census.proposedTextAtoms,
    "id_with_proposed_atoms=" + census.withSourceOwnedAtoms,
    "id_without_proposed_atoms=" + census.withoutSourceOwnedAtoms,
    "scientifically_complete_id=0", "author_approved=" + census.authorApproved,
    "publication_ready=" + census.publicationReady,
    ...census.rows.filter(x=>x.atomicTextCount > 0)
      .map(x=>"source_owned." + x.id + "=" + x.atomicTextCount),
  ].join("\n");
}


/** G10: every remaining v0.14 law gets one source-exact Russian EXPLANATORY atom. */
export const READER_V14_G10_PATH="requirements/mts-source/MTS-READER-V14-G10.yaml";
export interface ReaderV14G10Atom {
  readonly id:string; readonly acceptedId:string; readonly sourceQuote:string;
  readonly ru:string; readonly domain:string; readonly exclusions:readonly string[];
}
export interface ReaderV14G10 {
  readonly schema:"mts-reader-v14-remaining/v0.1";
  readonly status:"proposed"; readonly argumentCompleteness:"unverified";
  readonly authorApproval:"not-recorded"; readonly publication:"blocked";
  readonly proofCheck:"accepted-contract-only";
  readonly atoms:readonly ReaderV14G10Atom[];
}
export function parseReaderV14G10(text:string, coverage:ReaderCoveragePlan,
  previous:ReaderScienceCensus, acceptedLaws:ReadonlyMap<string,string>):ReaderV14G10{
  const doc=parseDocument(text,{strict:true,uniqueKeys:true});
  if(doc.errors.length||doc.warnings.length)fail("G10 invalid YAML");
  const raw=object(doc.toJS({maxAliasCount:0}),"G10 model");
  exactFields(raw,["schema","status","semantic_change","author_approval","publication",
    "argument_completeness","proof_check","atoms"],"G10 model");
  if(raw.schema!=="mts-reader-v14-remaining/v0.1"||raw.status!=="proposed"||
    raw.semantic_change!==false||raw.author_approval!=="not-recorded"||
    raw.publication!=="blocked"||raw.argument_completeness!=="unverified"||
    raw.proof_check!=="accepted-contract-only")
    fail("G10 science not approved or argument not complete");
  const remaining=coverage.rows.filter(x=>x.release==="v0.14"&&
    previous.rows.find(y=>y.id===x.id)?.atomicTextCount===0);
  if(remaining.length!==7||!Array.isArray(raw.atoms)||raw.atoms.length!==remaining.length)
    fail("G10 v0.14 remaining scope incomplete");
  const eligible=new Set(remaining.map(x=>x.id));
  const ids=new Set<string>();
  const atoms:ReaderV14G10Atom[]=raw.atoms.map((entry,index)=>{
    const x=object(entry,"G10.atom["+index+"]");
    exactFields(x,["id","accepted_id","source_quote","ru","domain","exclusions"],"G10.atom");
    if(typeof x.id!=="string"||typeof x.accepted_id!=="string"||
       x.id!==x.accepted_id.toLowerCase()||ids.has(x.id)||!eligible.has(x.accepted_id))
      fail("G10 duplicate, unknown or already-owned accepted ID");
    if(typeof x.source_quote!=="string"||acceptedLaws.get(x.accepted_id)!==x.source_quote)
      fail("G10 exact accepted law quote mismatch");
    if(typeof x.ru!=="string"||x.ru.length<140||typeof x.domain!=="string"||!x.domain.trim()||
       !Array.isArray(x.exclusions)||x.exclusions.length!==1||
       typeof x.exclusions[0]!=="string"||x.exclusions[0].length<25)
      fail("G10 incomplete scientific text and exclusions");
    ids.add(x.id);
    return Object.freeze({id:x.id,acceptedId:x.accepted_id,sourceQuote:x.source_quote,
      ru:x.ru,domain:x.domain,exclusions:Object.freeze([...x.exclusions])});
  });
  if(ids.size!==7)fail("G10 missing law");
  return Object.freeze({schema:"mts-reader-v14-remaining/v0.1" as const,
    status:"proposed" as const, argumentCompleteness:"unverified" as const,
    authorApproval:"not-recorded" as const, publication:"blocked" as const,
    proofCheck:"accepted-contract-only" as const,atoms:Object.freeze(atoms)});
}
export function loadReaderV14G10(root:string):ReaderV14G10{
  return parseReaderV14G10(readFileSync(resolve(root,READER_V14_G10_PATH),"utf8"),
    loadReaderCoverage(root),loadReaderScienceCensus(root),
    new Map(loadMtsSemanticIr(root,"requirements/mts-v0.14.json").requirements
      .map(x=>[x.id,x.statement])));
}
