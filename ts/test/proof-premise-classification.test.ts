import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Json = Record<string, any>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.14 proof premise classification: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} != ${String(expected)}`);
}

function sameSet(actual: readonly string[], expected: readonly string[], message: string): void {
  const a = [...new Set(actual)].sort();
  const b = [...new Set(expected)].sort();
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    `${message}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`,
  );
}

const root = resolve(process.cwd(), "..");
const read = (path: string): string => readFileSync(join(root, path), "utf8");
const matrix = JSON.parse(read("proofs/premise-classification-v0.14.json")) as Json;
const lean = read("proofs/lean4/MtsFoundation.lean");
const rocq = read("proofs/coq/MtsFoundation.v");

same(matrix.schema, "mts-proof-premise-classification/v0.1", "schema");
same(matrix.mtsVersion, "v0.14", "MTS version");
same(matrix.ownerIssue, 1796, "owner issue");
same(matrix.parentIssue, 1789, "parent hardening issue");
same(matrix.proofProgramIssue, 1431, "proof program issue");
same(
  matrix.authority,
  "external-proof-boundary-classification-only",
  "classification is not semantic authority",
);

const allowed = [
  "DERIVED",
  "INDEPENDENT_MODEL_CHOICE",
  "DOMAIN_RESTRICTION",
  "EXECUTION_REPRESENTATION_ASSUMPTION",
  "UNRESOLVED",
];
sameSet(matrix.classificationVocabulary as string[], allowed, "classification vocabulary");

const premises = matrix.premises as Json[];
assert(Array.isArray(premises) && premises.length >= 10, "premise matrix is non-trivial");
const ids = premises.map((entry) => entry.id as string);
same(new Set(ids).size, ids.length, "premise IDs unique");

const required = [
  "A1RecursiveSeparation",
  "F2F3OneSidedExistence",
  "F2F3GroundedNormalization",
  "F2F3GroundedNormalization.complete",
  "F2F3Normalization",
  "F2F3Normalization.complete",
  "Grounded",
  "LocalSelfDecision",
  "RecursiveInversionDomain.structuralForms",
  "RecursiveInversionDomain.decide",
  "A16ContextualTruthSemantics",
  "ContextualScopeCompositionLaw",
  "ContextOrientationChi",
];
for (const id of required) {
  assert(ids.includes(id), `missing required premise classification ${id}`);
}

for (const entry of premises) {
  assert(allowed.includes(entry.classification as string), `${entry.id} unknown classification`);
  assert(
    typeof entry.normativeRole === "string" && entry.normativeRole.length > 10,
    `${entry.id} normative role required`,
  );
  assert(
    typeof entry.rationale === "string" && entry.rationale.length > 20,
    `${entry.id} rationale required`,
  );
  assert(
    Array.isArray(entry.consumedBy) && entry.consumedBy.length > 0,
    `${entry.id} consumers required`,
  );
}

const byId = new Map(premises.map((entry) => [entry.id as string, entry]));

same(
  byId.get("A1RecursiveSeparation")?.classification,
  "INDEPENDENT_MODEL_CHOICE",
  "A1 is explicit relative to bare Foundation",
);
same(
  byId.get("F2F3OneSidedExistence")?.classification,
  "INDEPENDENT_MODEL_CHOICE",
  "one-sided existence is explicit",
);
same(
  byId.get("Grounded")?.classification,
  "DOMAIN_RESTRICTION",
  "Grounded is a theorem-domain restriction",
);
same(
  byId.get("LocalSelfDecision")?.classification,
  "EXECUTION_REPRESENTATION_ASSUMPTION",
  "local decision is proof/execution evidence",
);
same(
  byId.get("RecursiveInversionDomain.decide")?.classification,
  "EXECUTION_REPRESENTATION_ASSUMPTION",
  "inversion decision is proof/execution evidence",
);
same(
  byId.get("F2F3Normalization")?.classification,
  "UNRESOLVED",
  "strong global normalization remains unresolved",
);
same(
  byId.get("F2F3Normalization.complete")?.classification,
  "UNRESOLVED",
  "strong global normalization completeness remains unresolved",
);

assert(
  JSON.stringify(byId.get("F2F3Normalization")?.consumedBy) ===
    JSON.stringify(["global_identity_by_poles_from_complete_normalization", "poles_recompose_from_global_normalization"]),
  "strong global normalization is isolated to explicit auxiliary theorems",
);
assert(
  JSON.stringify(byId.get("F2F3Normalization.complete")?.consumedBy) ===
    JSON.stringify(["global_identity_by_poles_from_complete_normalization", "poles_recompose_from_global_normalization"]),
  "global completeness is outside accepted FND/INV/CTX capstones",
);
assert(
  !(byId.get("F2F3GroundedNormalization")?.consumedBy as string[]).includes("FND-01") &&
    !(byId.get("F2F3GroundedNormalization")?.consumedBy as string[]).includes("INV-01"),
  "FND-01 and INV-01 are normalization-free after premise minimization",
);
same(
  byId.get("ContextualScopeCompositionLaw")?.classification,
  "INDEPENDENT_MODEL_CHOICE",
  "A16 closure remains explicit semantic premise",
);

same(matrix.modelObligation.ambientLinkCarrier, "INFINITE_REQUIRED", "ambient carrier cardinality");
same(
  matrix.modelObligation.groundedReplayDomain,
  "FINITE_EXPLICIT_WITNESSES_REQUIRED",
  "finite replay witness boundary",
);
assert(
  (matrix.modelObligation.reason as string[]).some((line) => line.includes("form injective")),
  "finite-carrier impossibility records form injectivity",
);
assert(
  String(matrix.modelObligation.noBackflow).includes("external evidence only"),
  "model machinery cannot backflow into MTS ontology",
);

for (const source of [lean, rocq]) {
  for (const symbol of [
    "A1RecursiveSeparation",
    "F2F3OneSidedExistence",
    "F2F3GroundedNormalization",
    "F2F3Normalization",
    "Grounded",
    "LocalSelfDecision",
    "RecursiveInversionDomain",
    "ContextualScopeCompositionLaw",
    "FND_07_root_truth_aspect_L",
    "CTX_03_chi_direction_bridge",
  ]) {
    assert(source.includes(symbol), `proof source missing classified symbol ${symbol}`);
  }
}

assert(
  lean.includes("structure F2F3GroundedNormalization") &&
    lean.includes("structure F2F3Normalization"),
  "Lean keeps Grounded and global normalization strengths separate",
);
assert(
  rocq.includes("Record F2F3GroundedNormalization") &&
    rocq.includes("Record F2F3Normalization"),
  "Rocq keeps Grounded and global normalization strengths separate",
);
assert(
  lean.includes("does not claim arbitrary non-grounded Link extensionality") &&
    rocq.includes("R-grounded semantic domain"),
  "proof sources retain the finite Grounded FND-13 boundary",
);

console.log(
  `v0.14 proof premise classification: ${premises.length} premises, global-normalization=UNRESOLVED, finite-ambient=IMPOSSIBLE`,
);
