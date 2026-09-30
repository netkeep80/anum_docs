import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Json = Record<string, any>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.14 P0 theorem inventory: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} != ${String(expected)}`);
}

function sameSet(
  actual: readonly string[],
  expected: readonly string[],
  message: string,
): void {
  const a = [...new Set(actual)].sort();
  const b = [...new Set(expected)].sort();
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    `${message}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`,
  );
}

const root = resolve(process.cwd(), "..");
const readJson = (path: string): Json =>
  JSON.parse(readFileSync(join(root, path), "utf8")) as Json;

const inventory = readJson("theorems/p0-v0.14.json");
const registry = readJson("theorems/registry.json");
const contract = readJson("contracts/mts-contract-v0.14.json");
const traceability = readJson("traceability/mts-v0.14.json");
const premiseMatrix = readJson("proofs/premise-classification-v0.14.json");

same(inventory.schema, "mts-theorem-inventory/v0.1", "inventory schema");
same(inventory.status, "p0-frozen", "inventory status");
same(inventory.mtsVersion, "v0.14", "inventory MTS version");
same(inventory.acceptedContract, "contracts/mts-contract-v0.14.json", "accepted contract path");
same(inventory.acceptedTraceability, "traceability/mts-v0.14.json", "traceability path");
same(
  inventory.acceptedFreezeMainSha,
  contract.acceptance.preAcceptanceReadyMainSha,
  "accepted freeze SHA",
);
same(contract.acceptance.acceptedMtsVersion, "mts-contract/v0.14", "accepted v0.14 contract");
same(traceability.accepted, true, "traceability accepted");

same(
  inventory.premiseClassification,
  "proofs/premise-classification-v0.14.json",
  "P0 premise-classification binding",
);
same(inventory.boundaryFreeze.status, "STABILIZED", "P0 boundary freeze status");
same(inventory.boundaryFreeze.issue, 1820, "P0 freeze owner");
same(inventory.boundaryFreeze.predecessorHardening, 1789, "hardening predecessor");
same(
  inventory.boundaryFreeze.cycleBoundaryOutcome,
  "NECESSARY_RESTRICTION",
  "resolved cycle-boundary outcome",
);
same(
  premiseMatrix.cycleBoundaryDecision.outcome,
  "NECESSARY_RESTRICTION",
  "P0 cycle boundary agrees with premise matrix",
);
same(
  inventory.boundaryFreeze.strongerGlobalNormalization,
  "ISOLATED_AUXILIARY_UNRESOLVED",
  "stronger global normalization remains isolated",
);
same(inventory.boundaryFreeze.acceptedSemanticDelta, "NONE", "P0 freeze semantic delta");
assert(
  Array.isArray(inventory.boundaryFreeze.errata) &&
    inventory.boundaryFreeze.errata.some(
      (entry: Json) =>
        entry.issue === 1830 &&
        entry.pullRequest === 1832 &&
        entry.kind === "SEMANTIC_PRESERVING_PROOF_PROJECTION_CORRECTION" &&
        entry.acceptedSemanticDelta === "NONE",
    ),
  "post-freeze FND-08/FND-09 projection correction is explicit rather than silent",
);
same(inventory.boundaryFreeze.externalProversNormativeAuthority, false, "external provers remain non-normative");
same(inventory.boundaryFreeze.jsonProofAuthority, false, "P0 JSON is not proof authority");
same(
  inventory.constraints.allLinkFiniteDerivationTotalityClaimAllowed,
  false,
  "all-Link finite-derivation totality remains forbidden",
);
same(
  inventory.constraints.groundedBoundaryRequiredForCurrentFiniteDerivationTotality,
  true,
  "Grounded remains required for current finite-derivation totality",
);

same(registry.schema, "mts-theorem-registry/v0.1", "historical registry schema");
same(registry.version, "v0.13", "historical registry remains v0.13");
same(registry.theorems.length, 25, "historical theorem count");
same(
  inventory.historicalRegistry.expectedRecordCount,
  registry.theorems.length,
  "inventory historical record count",
);

const historicalIds = registry.theorems.map((theorem: Json) => theorem.id as string);
const dispositions = inventory.historicalDispositions as Json[];
same(dispositions.length, 25, "historical disposition count");
sameSet(
  dispositions.map((entry) => entry.id as string),
  historicalIds,
  "every historical theorem is dispositioned exactly once",
);

const allowedDispositions = new Set([
  "CURRENT_RESTATE",
  "CURRENT_SUPPORTING",
  "META_BOUNDARY_RETAINED",
  "HISTORICAL_DIFFERENTIAL",
  "SUPERSEDED_BY_V014",
]);
for (const entry of dispositions) {
  assert(
    allowedDispositions.has(entry.disposition as string),
    `unknown disposition ${String(entry.disposition)} for ${String(entry.id)}`,
  );
}
same(
  dispositions.find((entry) => entry.id === "INV-08")?.disposition,
  "SUPERSEDED_BY_V014",
  "INV-08 is resolved/superseded by accepted v0.14 orientation law",
);

sameSet(
  inventory.proposedNewIds as string[],
  ["CTX-03", "EXE-02", "FND-11", "FND-12"],
  "exact genuinely new v0.14 theorem IDs",
);
sameSet(
  inventory.recoveredHistoricalIds as string[],
  ["FND-13"],
  "exact recovered historical theorem IDs",
);

const targets = inventory.targets as Json[];
same(targets.length, 21, "current P0 target count");
const targetIds = targets.map((target) => target.id as string);
same(new Set(targetIds).size, targetIds.length, "target IDs unique");

const formalPremises = new Map(
  targets.map((target) => [target.id as string, target.formalPremises as string[] | undefined]),
);
const expectedWaveAFormalPremises: Record<string, string[]> = {
  "FND-02": ["A1RecursiveSeparation"],
  "FND-13": ["F2F3GroundedNormalization", "Grounded:x", "Grounded:y"],
  "FND-01": ["A1RecursiveSeparation", "F2F3OneSidedExistence", "LocalSelfDecision:x"],
  "INV-01": ["A1RecursiveSeparation", "F2F3OneSidedExistence", "RecursiveInversionDomain", "Grounded:x"],
  "INV-02": ["A1RecursiveSeparation", "F2F3GroundedNormalization", "F2F3OneSidedExistence", "RecursiveInversionDomain", "Grounded:x"],
  "CTX-03": ["A1RecursiveSeparation", "F2F3GroundedNormalization", "F2F3OneSidedExistence", "RecursiveInversionDomain"],
  "FND-07": ["F2F3OneSidedExistence", "CurrentScopeMember", "ContextualScopeCompositionLaw"],
  "FND-11": ["AcceptedV014RepresentationDefinitions", "FND05Canonicality"],
};
for (const [id, expected] of Object.entries(expectedWaveAFormalPremises)) {
  assert(Array.isArray(formalPremises.get(id)), `${id} formalPremises required by frozen P0`);
  sameSet(formalPremises.get(id)!, expected, `${id} exact frozen formal premises`);
}

const historicalIdSet = new Set(historicalIds);
for (const target of targets) {
  const id = target.id as string;
  const isNew = (inventory.proposedNewIds as string[]).includes(id);
  const isRecovered = (inventory.recoveredHistoricalIds as string[]).includes(id);
  assert(
    isNew || isRecovered || historicalIdSet.has(id),
    `${id} must be a historical stable ID, recovered historical ID, or explicitly proposed new ID`,
  );
  assert(target.wave === "A" || target.wave === "B", `${id} wave must be A or B`);
  assert(
    typeof target.statement === "string" && target.statement.length > 20,
    `${id} statement required`,
  );
  assert(
    typeof target.scope === "string" && target.scope.length > 0,
    `${id} scope required`,
  );
  assert(Array.isArray(target.assumptions), `${id} assumptions required`);
  assert(Array.isArray(target.dependsOn), `${id} dependencies required`);
  assert(Array.isArray(target.lawRefs) && target.lawRefs.length > 0, `${id} lawRefs required`);
  assert(
    Array.isArray(target.typescriptEvidence) && target.typescriptEvidence.length > 0,
    `${id} TypeScript evidence required`,
  );

  for (const lawId of target.lawRefs as string[]) {
    assert(
      Object.hasOwn(contract.requiredSemanticLaws, lawId),
      `${id} references unknown accepted law ${lawId}`,
    );
  }
  for (const dependency of target.dependsOn as string[]) {
    assert(targetIds.includes(dependency), `${id} dependency ${dependency} is not a current target`);
  }
  for (const path of target.typescriptEvidence as string[]) {
    assert(existsSync(join(root, path)), `${id} missing evidence path ${path}`);
  }
}

const firstWave = inventory.firstDifferentialWave as string[];
same(firstWave.length, 8, "first differential wave size");
same(new Set(firstWave).size, 8, "first differential wave unique IDs");
sameSet(
  firstWave,
  ["FND-02", "FND-13", "FND-01", "INV-01", "INV-02", "CTX-03", "FND-07", "FND-11"],
  "first differential wave exact target set",
);
same(
  JSON.stringify(firstWave.slice(0, 3)),
  JSON.stringify(["FND-02", "FND-13", "FND-01"]),
  "foundation differential review order remains FND-02 -> FND-13 -> FND-01 without implying dependency",
);
for (const id of firstWave) {
  const target = targets.find((candidate) => candidate.id === id);
  assert(target !== undefined, `first-wave target ${id} exists`);
  same(target.wave, "A", `${id} first-wave marker`);
}

const fnd02 = targets.find((target) => target.id === "FND-02")!;
const fnd13 = targets.find((target) => target.id === "FND-13")!;
const fnd01 = targets.find((target) => target.id === "FND-01")!;
const fnd08 = targets.find((target) => target.id === "FND-08")!;
const fnd09 = targets.find((target) => target.id === "FND-09")!;

const inv01 = targets.find((target) => target.id === "INV-01")!;
const inv02 = targets.find((target) => target.id === "INV-02")!;
const ctx03 = targets.find((target) => target.id === "CTX-03")!;
const fnd07 = targets.find((target) => target.id === "FND-07")!;
const fnd11 = targets.find((target) => target.id === "FND-11")!;
sameSet(fnd13.dependsOn as string[], [], "FND-13 has no fake FND-02 dependency");
sameSet(
  fnd01.dependsOn as string[],
  ["FND-02"],
  "FND-01 structural classification depends only on unique ROOT",
);
assert(
  !(fnd02.dependsOn as string[]).includes("FND-13"),
  "FND-02 must not depend on downstream A6/FND-13",
);

sameSet(
  fnd02.assumptions as string[],
  ["A1RecursiveSeparation"],
  "FND-02 frozen assumptions do not smuggle normalization",
);
assert(
  !(inv01.assumptions as string[]).some((value) => /Normalization/.test(value)),
  "INV-01 does not consume normalization",
);
assert(
  (inv01.assumptions as string[]).includes("Grounded source Link"),
  "INV-01 exact Grounded totality domain is explicit",
);
assert(
  (inv02.assumptions as string[]).includes("F2F3GroundedNormalization"),
  "INV-02 consumes Grounded normalization only",
);
assert(
  !(inv02.assumptions as string[]).some((value) => value === "F2F3Normalization"),
  "INV-02 cannot reacquire stronger global normalization",
);
assert(
  (ctx03.assumptions as string[]).includes("F2F3GroundedNormalization"),
  "CTX-03 structural/semantic capstone is pinned to Grounded normalization",
);
assert(
  (fnd07.assumptions as string[]).includes("ContextualScopeCompositionLaw as the accepted A16 semantic premise"),
  "FND-07 accepted semantic premise is explicit",
);
assert(
  (fnd11.assumptions as string[]).includes("FND05Canonicality witness"),
  "FND-11 exact FND-05 dependency witness is explicit",
);
same(fnd08.wave, "B", "FND-08 moves behind the foundation wave");
assert(!firstWave.includes("FND-08"), "FND-08 is not in the first differential wave");
assert(
  (fnd08.assumptions as string[]).includes(
    "SelectedTheoryReactionSemantics as the accepted V14-L11/V14-L4 admission/match/emission premise",
  ),
  "FND-08 names selected-Theory reaction semantics explicitly",
);
sameSet(
  fnd08.formalPremises as string[],
  ["SelectedTheoryReactionSemantics"],
  "FND-08 formal premise keeps admission/match/emission distinct from FND-07",
);
assert(
  /unmatched current members survive/i.test(fnd08.statement as string) &&
    /matched empty image remains distinct from no match/i.test(fnd08.statement as string) &&
    /reaction occurrence remains distinct from extensional successor membership/i.test(
      fnd08.statement as string,
    ),
  "FND-08 frozen statement retains image, no-match and reaction-event distinctions",
);
assert(
  !(fnd08.statement as string).includes("admitted relations {A_i ⟼ B_j}"),
  "FND-08 no longer encodes explicit 1->0 as absence of binary A->B pairs",
);
assert(
  (fnd08.typescriptEvidence as string[]).includes(
    "ts/test/research-v013-explicit-zero-image-a72y.test.ts",
  ),
  "FND-08 pins the explicit-zero/no-match witness",
);
assert(
  /NO MATCH preserves currentness/i.test(fnd09.statement as string) &&
    /explicit ZERO is a matched empty image/i.test(fnd09.statement as string),
  "FND-09 distinguishes no-match from ZERO",
);
assert(
  /absence of emitted B/i.test(fnd09.exclusions as string),
  "FND-09 forbids inferring no admitted match from an empty emitted image",
);
same(
  contract.reactionResultBasis.emptySuccessEqualsNoRelation,
  false,
  "accepted v0.14 keeps successful empty distinct from no relation",
);
same(
  contract.reactionResultBasis.identityTransitionEqualsQuiescence,
  false,
  "accepted v0.14 keeps active identity distinct from quiescence",
);
same(
  inventory.constraints.poleExtensionalityRequiresExplicitFnd13,
  true,
  "pole extensionality requires explicit FND-13 theorem target",
);
same(
  inventory.constraints.poleExtensionalityAvailableAfterFnd02,
  false,
  "completing FND-02 alone does not make pole extensionality available",
);

const blockedFromFirstWave = new Set(
  dispositions
    .filter((entry) =>
      entry.disposition === "HISTORICAL_DIFFERENTIAL" ||
      entry.disposition === "SUPERSEDED_BY_V014"
    )
    .map((entry) => entry.id as string),
);
for (const id of firstWave) {
  assert(!blockedFromFirstWave.has(id), `${id} historical/superseded theorem entered first wave`);
}

same(inventory.metaBoundaries.length, 1, "meta-boundary count");
same(inventory.metaBoundaries[0].id, "FND-10", "self-hosting boundary remains explicit");

const lawIds = Object.keys(contract.requiredSemanticLaws).sort();
const dispositionLawIds = Object.keys(inventory.lawDispositions).sort();
sameSet(dispositionLawIds, lawIds, "all accepted v0.14 laws have P0 disposition");

const allowedLawKinds = new Set([
  "THEOREM_TARGET",
  "PROTOCOL_OR_NOTATION",
  "DERIVED_LATER",
  "SCOPE_BOUNDARY",
]);
for (const [lawId, lawDisposition] of Object.entries(inventory.lawDispositions) as [string, Json][]) {
  assert(
    allowedLawKinds.has(lawDisposition.kind as string),
    `${lawId} has unknown law disposition ${String(lawDisposition.kind)}`,
  );
  assert(Array.isArray(lawDisposition.targetIds), `${lawId} targetIds array required`);
  for (const id of lawDisposition.targetIds as string[]) {
    assert(targetIds.includes(id), `${lawId} references unknown theorem target ${id}`);
    const target = targets.find((candidate) => candidate.id === id)!;
    assert(
      (target.lawRefs as string[]).includes(lawId),
      `${lawId}/${id} coverage must be symmetric`,
    );
  }
  if (lawDisposition.kind === "THEOREM_TARGET") {
    assert(lawDisposition.targetIds.length > 0, `${lawId} theorem disposition needs targets`);
  } else {
    same(lawDisposition.targetIds.length, 0, `${lawId} non-target disposition must not name theorem IDs`);
  }
}

same(inventory.lawDispositions["V14-L2"].kind, "PROTOCOL_OR_NOTATION", "ostensive grammar stays protocol/notation");
same(inventory.lawDispositions["V14-L3"].kind, "PROTOCOL_OR_NOTATION", "Q14 version split stays protocol");
same(inventory.lawDispositions["V14-L6"].kind, "DERIVED_LATER", "Nat/Degree deferred from first proof corpus");
same(inventory.lawDispositions["V14-L7"].kind, "DERIVED_LATER", "Count theorem deferred");
same(inventory.lawDispositions["V14-L8"].kind, "DERIVED_LATER", "Add theorem deferred");
same(inventory.lawDispositions["V14-L9"].kind, "DERIVED_LATER", "Le theorem deferred");
same(inventory.lawDispositions["V14-L10"].kind, "SCOPE_BOUNDARY", "multiplication remains explicit scope boundary");

same(inventory.constraints.mutateHistoricalRegistry, false, "registry mutation forbidden in P0 slice");
same(inventory.constraints.installLean4, false, "Lean4 install deferred");
same(inventory.constraints.installCoq, false, "Coq install deferred");
same(inventory.constraints.repinAprover, false, "aprover repin deferred");
same(inventory.constraints.jsonIsProofAuthority, false, "JSON is not proof authority");
same(inventory.constraints.externalProversAreNormativeAuthority, false, "external provers are not normative authority");
same(
  inventory.constraints.mtsNativeAuthorityRequiresExactTheoryReplay,
  true,
  "native authority requires exact Theory replay",
);

console.log([
  "MTS #1431 P0 v0.14 theorem inventory:",
  `HISTORICAL=${historicalIds.length}`,
  `TARGETS=${targets.length}`,
  `NEW_IDS=${inventory.proposedNewIds.length}`,
  `RECOVERED_IDS=${inventory.recoveredHistoricalIds.length}`,
  `FIRST_WAVE=${firstWave.length}`,
  `V14_LAWS=${lawIds.length}`,
  "REGISTRY_MUTATION=NO",
  "LEAN_COQ_INSTALL=DEFERRED",
  "APROVER_REPIN=DEFERRED",
  "BOUNDARY_FREEZE=STABILIZED",
  "CYCLE_BOUNDARY=NECESSARY_RESTRICTION",
  "SEMANTIC_DELTA=NONE",
].join(" "));
