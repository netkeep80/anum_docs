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
const leanModel = read("proofs/lean4/MtsExplicitModel.lean");
const rocqModel = read("proofs/coq/MtsExplicitModel.v");

same(matrix.schema, "mts-proof-premise-classification/v0.1", "schema");
same(matrix.mtsVersion, "v0.14", "MTS version");
same(matrix.status, "accepted-chain-converged", "matrix convergence status");
same(matrix.convergence.acceptedChain, "CONVERGED", "accepted-chain convergence");
same(
  matrix.convergence.strongerGlobalNormalization,
  "ISOLATED_AUXILIARY_UNRESOLVED",
  "stronger global normalization remains explicitly isolated",
);
same(matrix.convergence.acceptedSemanticDelta, "NONE", "no accepted semantic delta");
assert(
  Array.isArray(matrix.postConvergenceErrata) &&
    matrix.postConvergenceErrata.some(
      (entry: Json) =>
        entry.issue === 1830 &&
        entry.pullRequest === 1832 &&
        entry.premise === "SelectedTheoryReactionSemantics" &&
        entry.acceptedSemanticDelta === "NONE" &&
        typeof entry.correction === "string" &&
        entry.correction.includes("ContextualScopeCompositionLaw") &&
        entry.correction.includes("FND-07") &&
        entry.correction.includes("FND-08"),
    ),
  "post-convergence reaction projection erratum is explicit",
);
same(matrix.convergence.nextBoundaryIssue, 1797, "next cyclic boundary owner");
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
  "SelectedTheoryReactionSemantics",
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
same(
  byId.get("SelectedTheoryReactionSemantics")?.classification,
  "INDEPENDENT_MODEL_CHOICE",
  "selected-Theory reaction semantics is an explicit accepted semantic premise",
);
sameSet(
  byId.get("SelectedTheoryReactionSemantics")?.consumedBy as string[],
  ["FND-08"],
  "selected-Theory reaction semantics is consumed directly by FND-08 only",
);
same(
  byId.get("SelectedTheoryReactionSemantics")?.falsificationTarget?.target,
  "ts/test/research-v013-explicit-zero-image-a72y.test.ts",
  "reaction premise is falsified by the explicit-zero/no-match executable vector",
);
assert(
  /identity transition with quiescence/i.test(
    byId.get("SelectedTheoryReactionSemantics")?.falsificationTarget?.condition as string,
  ),
  "reaction premise also guards active identity versus quiescence",
);
assert(
  !(byId.get("A16ContextualTruthSemantics")?.consumedBy as string[]).includes("FND-09"),
  "FND-09 consumes FND-08 rather than re-importing A16 directly",
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
sameSet(
  byId.get("ContextualScopeCompositionLaw")?.consumedBy as string[],
  ["FND-07"],
  "A16 current-Scope closure is not reused as selected-Theory reaction authority",
);
assert(
  /selected Theory relations are a distinct authority frontier/i.test(
    byId.get("ContextualScopeCompositionLaw")?.rationale as string,
  ),
  "premise matrix separates current Scope composition from selected Theory",
);
assert(
  /coerce selected-Theory admission into CurrentScopeMember\/ContextualRule/i.test(
    byId.get("SelectedTheoryReactionSemantics")?.falsificationTarget?.condition as string,
  ),
  "FND-08 rejects the false admitted-rule-to-currentness bridge",
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

same(
  matrix.modelObligation.evidenceStatus,
  "CONSTRUCTIVELY_PROVEN",
  "ambient infinitude model obligation is machine-closed",
);
same(
  matrix.explicitModelEvidence.ambientCarrier,
  "INFINITE_BY_EXPLICIT_NAT_INJECTION",
  "explicit model records constructive ambient infinitude",
);
same(
  matrix.explicitModelEvidence.pairedKernelStatus,
  "GREEN",
  "explicit model is paired-kernel checked",
);
same(
  matrix.explicitModelEvidence.groundedReplay,
  "FINITE_INDUCTIVE_GROUNDED_EVIDENCE",
  "finite Grounded replay boundary recorded",
);

for (const source of [leanModel, rocqModel]) {
  for (const symbol of [
    "HasNatInjection",
    "one_sided_existence_implies_nat_injection",
    "grounded_is_canonical",
    "ExplicitGroundedNormalization",
    "explicit_fnd13_replay",
    "explicit_a1",
    "explicit_fnd02_replay",
    "explicit_fnd01_replay",
    "explicit_fnd05_replay",
    "explicit_inv01_replay",
    "explicit_inv02_replay",
    "explicit_inv06_replay",
    "explicit_inv07_replay",
    "explicit_ctx03_replay",
    "explicit_ctx03_semantic_replay",
  ]) {
    assert(source.includes(symbol), `explicit model source missing convergence evidence ${symbol}`);
  }
}

for (const entry of premises) {
  const target = entry.falsificationTarget as Json | undefined;
  assert(target && typeof target.kind === "string", `${entry.id} falsification target required`);
  assert(
    typeof target.condition === "string" && target.condition.length > 20,
    `${entry.id} falsification condition required`,
  );
  assert(
    typeof target.status === "string" && target.status.length > 5,
    `${entry.id} falsification status required`,
  );
  assert(
    typeof entry.explicitModelStatus === "string" && entry.explicitModelStatus.length > 10,
    `${entry.id} explicit-model disposition required`,
  );
  if (target.kind === "EXECUTABLE_SEMANTIC_VECTOR") {
    assert(typeof target.target === "string", `${entry.id} executable target path required`);
    assert(read(target.target as string).length > 0, `${entry.id} executable target must resolve`);
  }
}

same(
  byId.get("F2F3Normalization")?.explicitModelStatus,
  "NOT_REQUIRED_BY_ACCEPTED_CHAIN",
  "stronger global normalization is not smuggled back through model closure",
);
same(
  byId.get("F2F3Normalization.complete")?.explicitModelStatus,
  "NOT_REQUIRED_BY_ACCEPTED_CHAIN",
  "stronger global completeness is not smuggled back through model closure",
);
same(
  byId.get("Grounded")?.falsificationTarget?.ownerIssue,
  1797,
  "cyclic/non-well-founded boundary owner remains #1797",
);
same(
  byId.get("Grounded")?.falsificationTarget?.status,
  "RESOLVED_NECESSARY_RESTRICTION",
  "cyclic/non-well-founded boundary is resolved",
);
same(
  byId.get("Grounded")?.falsificationTarget?.outcome,
  "NECESSARY_RESTRICTION",
  "Grounded restriction is retained for totality/existence",
);
same(
  matrix.cycleBoundaryDecision?.outcome,
  "NECESSARY_RESTRICTION",
  "cycle boundary records exactly one allowed closure outcome",
);
same(
  matrix.cycleBoundaryDecision?.totality,
  "GROUNDED_REQUIRED_AND_EXACT_FOR_EXISTENCE",
  "finite inductive description/inversion existence domain is exactly Grounded",
);
same(
  matrix.cycleBoundaryDecision?.functionality,
  "GLOBAL_WHEN_DERIVATIONS_EXIST",
  "functionality remains global conditional on derivation existence",
);
same(
  matrix.cycleBoundaryDecision?.sharing,
  "GROUNDED_SHARED_SUBSTRUCTURE_IS_NOT_A_TRUE_CYCLE",
  "shared Grounded substructure is separated from true non-well-founded cycles",
);
same(
  matrix.cycleBoundaryDecision?.coinductionBisimulation,
  "NOT_INTRODUCED",
  "no coinductive/bisimulation extension is smuggled into accepted semantics",
);
same(
  matrix.cycleBoundaryDecision?.acceptedSemanticDelta,
  "NONE",
  "cycle-boundary closure does not mutate accepted v0.14 semantics",
);
same(
  matrix.cycleBoundaryDecision?.evidence?.pairedKernelStatus,
  "GREEN",
  "cycle-boundary decision is backed by paired kernels",
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
  `v0.14 proof premise classification: ${premises.length} premises, accepted-chain=CONVERGED, cycle-boundary=NECESSARY_RESTRICTION, global-normalization=ISOLATED_UNRESOLVED, ambient=NAT_INJECTION_PROVEN`,
);
