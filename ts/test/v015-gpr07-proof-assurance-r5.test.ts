import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 GPR proof assurance: " + message);
}

function root(): string {
  const candidates = [resolve(process.cwd(), ".."), process.cwd()];
  const found = candidates.find((candidate) =>
    existsSync(resolve(candidate, "proofs/v015-external-proof-assurance.json"))
  );
  assert(found !== undefined, "repository root");
  return found;
}

interface GprTarget {
  readonly id: string;
  readonly classification: string;
  readonly lean4: readonly string[];
  readonly rocq: readonly string[];
}

const repo = root();
const accepted = JSON.parse(
  readFileSync(resolve(repo, "proofs/external-proof-assurance.json"), "utf8"),
) as { targets: Array<{ id: string }> };
const v015 = JSON.parse(
  readFileSync(resolve(repo, "proofs/v015-external-proof-assurance.json"), "utf8"),
) as {
  allowedGlobalAxioms: { lean4: string[]; rocq: string[] };
  targets: GprTarget[];
};
const gpr01Evidence = JSON.parse(
  readFileSync(
    resolve(repo, "proofs/v015-evidence/gpr01-single-state-transformer.json"),
    "utf8",
  ),
) as {
  id: string;
  status: string;
  externalCrossCheck: { ciRun: number; exactHead: string };
  architecturalConsequence: {
    semanticCommandsPerReaction: number;
    analysisIsSeparateSemanticCommand: boolean;
    synthesisIsSeparateSemanticCommand: boolean;
    publicationIsSeparateSemanticCommand: boolean;
  };
  theoremProjection: { currentV014InventoryUnchanged: boolean };
};
const gpr02Evidence = JSON.parse(
  readFileSync(
    resolve(repo, "proofs/v015-evidence/gpr02-canonical-anet-convergence.json"),
    "utf8",
  ),
) as {
  id: string;
  status: string;
  externalCrossCheck: { ciRun: number; exactHead: string };
  architecturalConsequence: {
    duplicateCanonicalDerivationCreatesMultipleSemanticMemberships: boolean;
    membershipContributionOrderIsSemantic: boolean;
    provenanceOccurrencesMayRemainMultiple: boolean;
    exactSequenceMultiplicityCollapsedByAnetIdempotence: boolean;
  };
  theoremProjection: { currentV014InventoryUnchanged: boolean };
};
const gpr03Evidence = JSON.parse(
  readFileSync(
    resolve(repo, "proofs/v015-evidence/gpr03-generation-isolation.json"),
    "utf8",
  ),
) as {
  id: string;
  status: string;
  externalCrossCheck: { ciRun: number; exactHead: string };
  architecturalConsequence: {
    analysisReadsExactlyReactionStart: boolean;
    stagedEffectsVisibleAsCurrentWithinGeneration: boolean;
    readYourOwnWritesIsOneGenerationRefinement: boolean;
    publishedSuccessorMayBeNextGenerationInput: boolean;
  };
  theoremProjection: { currentV014InventoryUnchanged: boolean };
};
const gpr04Evidence = JSON.parse(
  readFileSync(
    resolve(repo, "proofs/v015-evidence/gpr04-partition-schedule-refinement.json"),
    "utf8",
  ),
) as {
  id: string;
  status: string;
  externalCrossCheck: { ciRun: number; exactHead: string };
  architecturalConsequence: {
    shardMergeOrderChangesSemanticReduction: boolean;
    duplicateContributionCreatesSemanticMultiplicity: boolean;
    twoDimensionalPartitionChangesSemanticReduction: boolean;
    localNoMatchMayPublishGlobalPreserveCurrent: boolean;
    runtimeUnionCommandRequired: boolean;
    concreteHardwareSynchronizationProved: boolean;
  };
  theoremProjection: { currentV014InventoryUnchanged: boolean };
};
const gpr05Evidence = JSON.parse(
  readFileSync(
    resolve(repo, "proofs/v015-evidence/gpr05-finite-completion-boundary.json"),
    "utf8",
  ),
) as {
  id: string;
  status: string;
  externalCrossCheck: { ciRun: number; exactHead: string };
  architecturalConsequence: {
    finiteAmbientLinkCarrierRequired: boolean;
    finiteConcreteComparisonBudgetDerived: boolean;
    finiteRawStagingBudgetDerived: boolean;
    atomicPublicationDerivedFromFiniteness: boolean;
    infiniteSemanticReactionRuledOut: boolean;
    physicalResourceCapacityProved: boolean;
  };
  theoremProjection: { currentV014InventoryUnchanged: boolean };
};
const gpr09Evidence = JSON.parse(
  readFileSync(
    resolve(repo, "proofs/v015-evidence/gpr09-c-boundary-chirality.json"),
    "utf8",
  ),
) as {
  id: string;
  status: string;
  externalCrossCheck: { ciRun: number; exactHead: string };
  architecturalConsequence: {
    directGaugeBoundary: string;
    mirrorGaugeUsesSameGamma: boolean;
    hostReverseDirectionModeRequired: boolean;
    cIsFoundationGlobalPrivilege: boolean;
    phaseCovarianceImpliesGammaCovariance: boolean;
    concreteHardwareCovarianceProved: boolean;
    j1Required: boolean;
  };
  theoremProjection: { currentV014InventoryUnchanged: boolean };
};
const gpr06Evidence = JSON.parse(
  readFileSync(
    resolve(repo, "proofs/v015-evidence/gpr06-exact-s0-opacity.json"),
    "utf8",
  ),
) as {
  id: string;
  status: string;
  externalCrossCheck: { ciRun: number; exactHead: string };
  architecturalConsequence: {
    pureExactS0SelfHosting: string;
    j1CrossCurrentJoinRequired: boolean;
    externalSemanticGrounderRequired: boolean;
  };
  theoremProjection: { currentV014InventoryUnchanged: boolean };
};
const gpr08Evidence = JSON.parse(
  readFileSync(
    resolve(repo, "proofs/v015-evidence/gpr08-j0-boundary.json"),
    "utf8",
  ),
) as {
  id: string;
  status: string;
  externalCrossCheck: { ciRun: number; exactHead: string };
  architecturalConsequence: {
    finiteArityImpliesJ1: boolean;
    exactSequenceRemainsLinkTopology: boolean;
    physicalRoleShapeImpliesAuthority: boolean;
  };
  theoremProjection: { currentV014InventoryUnchanged: boolean };
};
const evidence = JSON.parse(
  readFileSync(
    resolve(repo, "proofs/v015-evidence/gpr07-zero-role-refinement.json"),
    "utf8",
  ),
) as {
  id: string;
  status: string;
  externalCrossCheck: { ciRun: number };
  theoremProjection: { currentV014InventoryUnchanged: boolean };
};
const lean = readFileSync(
  resolve(repo, "proofs/lean4/MtsV015GeneralizedReaction.lean"),
  "utf8",
);
const rocq = readFileSync(
  resolve(repo, "proofs/coq/MtsV015GeneralizedReaction.v"),
  "utf8",
);
const ci = readFileSync(resolve(repo, ".github/workflows/ci.yml"), "utf8");

assert(accepted.targets.length === 21, "accepted v0.14 assurance remains 21 targets");
assert(
  !accepted.targets.some((target) => target.id.startsWith("GPR-")),
  "v0.15 GPR targets do not leak into accepted v0.14 assurance",
);

assert(v015.allowedGlobalAxioms.lean4.length === 0, "v0.15 Lean axiom allowlist empty");
assert(v015.allowedGlobalAxioms.rocq.length === 0, "v0.15 Rocq axiom allowlist empty");

const ids = v015.targets.map((target) => target.id);
assert(new Set(ids).size === ids.length, "v0.15 GPR target ids are unique");
assert(
  ids.length === 9 &&
    ids.includes("GPR-01") &&
    ids.includes("GPR-02") &&
    ids.includes("GPR-03") &&
    ids.includes("GPR-04") &&
    ids.includes("GPR-05") &&
    ids.includes("GPR-06") &&
    ids.includes("GPR-07") &&
    ids.includes("GPR-08") &&
    ids.includes("GPR-09"),
  "current paired proof manifest contains exactly GPR-01 through GPR-09",
);

function target(id: string): GprTarget {
  const found = v015.targets.find((candidate) => candidate.id === id);
  assert(found !== undefined, "missing target " + id);
  return found;
}

const gpr01 = target("GPR-01");
assert(
  gpr01.classification === "PROVED_AS_PURE_SINGLE_STATE_TRANSFORMER_REFINEMENT",
  "GPR-01 classification keeps the single-state-transformer boundary explicit",
);
assert(gpr01.lean4.length === 3, "GPR-01 paired Lean assurance symbols");
assert(gpr01.rocq.length === 3, "GPR-01 paired Rocq assurance symbols");

const gpr02 = target("GPR-02");
assert(
  gpr02.classification ===
    "PROVED_FOR_CANONICAL_ANET_MEMBERSHIP_CONVERGENCE_WITH_SEPARATE_PROVENANCE_AND_EXACTSEQUENCE_MULTIPLICITY",
  "GPR-02 classification keeps membership, provenance and ExactSequence layers distinct",
);
assert(gpr02.lean4.length === 4, "GPR-02 paired Lean assurance symbols");
assert(gpr02.rocq.length === 4, "GPR-02 paired Rocq assurance symbols");

const gpr03 = target("GPR-03");
assert(
  gpr03.classification ===
    "PROVED_UNDER_REACTION_START_SNAPSHOT_SEMANTICS_WITH_READ_YOUR_OWN_WRITES_FALSIFIER",
  "GPR-03 classification keeps snapshot semantics and the cascade falsifier explicit",
);
assert(gpr03.lean4.length === 4, "GPR-03 paired Lean assurance symbols");
assert(gpr03.rocq.length === 4, "GPR-03 paired Rocq assurance symbols");

const gpr04 = target("GPR-04");
assert(
  gpr04.classification ===
    "PROVED_AS_PARTITION_AND_SCHEDULE_REFINEMENT_UNDER_SNAPSHOT_EXTENTIONAL_REDUCTION",
  "GPR-04 classification keeps snapshot/extensional-reduction premises explicit",
);
assert(gpr04.lean4.length === 5, "GPR-04 paired Lean assurance symbols");
assert(gpr04.rocq.length === 5, "GPR-04 paired Rocq assurance symbols");

const gpr05 = target("GPR-05");
assert(
  gpr05.classification ===
    "PROVED_UNDER_FINITE_MATERIALIZATION_AND_LOCAL_TERMINATION_WITHOUT_FINITE_AMBIENT_LINK_CARRIER",
  "GPR-05 classification keeps finite execution premises separate from ambient Link cardinality",
);
assert(gpr05.lean4.length === 4, "GPR-05 paired Lean assurance symbols");
assert(gpr05.rocq.length === 4, "GPR-05 paired Rocq assurance symbols");

const gpr06 = target("GPR-06");
assert(
  gpr06.classification === "PROVED_UNDER_EXPLICIT_EXACT_S0_CLOSURE_LAW",
  "GPR-06 classification keeps the exact-S0 closure premise explicit",
);
assert(gpr06.lean4.length === 3, "GPR-06 paired Lean assurance symbols");
assert(gpr06.rocq.length === 3, "GPR-06 paired Rocq assurance symbols");

const gpr08 = target("GPR-08");
assert(
  gpr08.classification ===
    "PROVED_FOR_FINITE_EXACTSEQUENCE_J0_REPRESENTATION_AND_SEMANTIC_ROLE_AUTHORITY",
  "GPR-08 classification keeps the finite-J0 and semantic-membership boundary explicit",
);
assert(gpr08.lean4.length === 3, "GPR-08 paired Lean assurance symbols");
assert(gpr08.rocq.length === 3, "GPR-08 paired Rocq assurance symbols");

const gpr09 = target("GPR-09");
assert(
  gpr09.classification ===
    "PROVED_AS_COMPOSITIONAL_GAMMA_COVARIANCE_UNDER_EXPLICIT_PHASE_COVARIANCE_AND_ACCEPTED_CTX03_MIRROR_TRANSPORT",
  "GPR-09 classification keeps gauge covariance and CTX-03 premises explicit",
);
assert(gpr09.lean4.length === 4, "GPR-09 paired Lean assurance symbols");
assert(gpr09.rocq.length === 4, "GPR-09 paired Rocq assurance symbols");

const gpr07 = target("GPR-07");
assert(
  gpr07.classification === "PROVED_UNDER_EXPLICIT_GENERIC_KERNEL_LAWS",
  "GPR-07 classification keeps its premises explicit",
);
assert(gpr07.lean4.length === 2, "GPR-07 paired Lean assurance symbols");
assert(gpr07.rocq.length === 2, "GPR-07 paired Rocq assurance symbols");

for (const forbidden of ["sorry", "axiom "]) {
  assert(!lean.toLowerCase().includes(forbidden), "Lean source excludes " + forbidden);
}
for (const forbidden of ["admitted.", "axiom "]) {
  assert(!rocq.toLowerCase().includes(forbidden), "Rocq source excludes " + forbidden);
}

for (const proofTarget of v015.targets) {
  for (const symbol of proofTarget.lean4) {
    const local = symbol.split(".").at(-1);
    assert(local !== undefined && lean.includes(local), "Lean contains " + symbol);
  }
  for (const symbol of proofTarget.rocq) {
    assert(rocq.includes(symbol), "Rocq contains " + symbol);
  }
}

assert(
  ci.includes("MtsV015GeneralizedReaction.lean") &&
    ci.includes("MtsV015GeneralizedReaction.v") &&
    ci.includes("v015-external-proof-assurance.json"),
  "CI compiles and assures the separate v0.15 paired proof lane",
);

assert(gpr01Evidence.id === "GPR-01", "GPR-01 evidence id");
assert(
  gpr01Evidence.status === "PROVED_AS_PURE_SINGLE_STATE_TRANSFORMER_REFINEMENT",
  "GPR-01 evidence classification",
);
assert(gpr01Evidence.externalCrossCheck.ciRun === 37453206274, "GPR-01 exact proof CI is pinned");
assert(
  gpr01Evidence.externalCrossCheck.exactHead === "5d5b08c3fbdab5a9cfebd86c77cbe7aced37826b",
  "GPR-01 proof head is pinned",
);
assert(gpr01Evidence.architecturalConsequence.semanticCommandsPerReaction === 1, "Gamma is one semantic command");
assert(
  gpr01Evidence.architecturalConsequence.analysisIsSeparateSemanticCommand === false &&
    gpr01Evidence.architecturalConsequence.synthesisIsSeparateSemanticCommand === false &&
    gpr01Evidence.architecturalConsequence.publicationIsSeparateSemanticCommand === false,
  "analysis/synthesis/publication are internal refinement phases",
);
assert(
  gpr01Evidence.theoremProjection.currentV014InventoryUnchanged === true,
  "GPR-01 leaves accepted theorem inventory unchanged",
);

assert(gpr02Evidence.id === "GPR-02", "GPR-02 evidence id");
assert(
  gpr02Evidence.status ===
    "PROVED_FOR_CANONICAL_ANET_MEMBERSHIP_CONVERGENCE_WITH_SEPARATE_PROVENANCE_AND_EXACTSEQUENCE_MULTIPLICITY",
  "GPR-02 evidence classification",
);
assert(gpr02Evidence.externalCrossCheck.ciRun === 37454497074, "GPR-02 exact proof CI is pinned");
assert(
  gpr02Evidence.externalCrossCheck.exactHead === "7979c3fc64f1beb7859f005c468759deb2c708f3",
  "GPR-02 proof head is pinned",
);
assert(
  gpr02Evidence.architecturalConsequence.duplicateCanonicalDerivationCreatesMultipleSemanticMemberships === false &&
    gpr02Evidence.architecturalConsequence.membershipContributionOrderIsSemantic === false,
  "GPR-02 semantic ANet membership is idempotent and contribution-order independent",
);
assert(
  gpr02Evidence.architecturalConsequence.provenanceOccurrencesMayRemainMultiple === true &&
    gpr02Evidence.architecturalConsequence.exactSequenceMultiplicityCollapsedByAnetIdempotence === false,
  "GPR-02 preserves provenance occurrences and ExactSequence multiplicity",
);
assert(
  gpr02Evidence.theoremProjection.currentV014InventoryUnchanged === true,
  "GPR-02 leaves accepted theorem inventory unchanged",
);

assert(gpr03Evidence.id === "GPR-03", "GPR-03 evidence id");
assert(
  gpr03Evidence.status ===
    "PROVED_UNDER_REACTION_START_SNAPSHOT_SEMANTICS_WITH_READ_YOUR_OWN_WRITES_FALSIFIER",
  "GPR-03 evidence classification",
);
assert(gpr03Evidence.externalCrossCheck.ciRun === 37460965574, "GPR-03 exact proof CI is pinned");
assert(
  gpr03Evidence.externalCrossCheck.exactHead === "299a3965b9aa32e78967f534ddad8a561af508c8",
  "GPR-03 proof head is pinned",
);
assert(
  gpr03Evidence.architecturalConsequence.analysisReadsExactlyReactionStart === true &&
    gpr03Evidence.architecturalConsequence.stagedEffectsVisibleAsCurrentWithinGeneration === false,
  "GPR-03 keeps analysis on the immutable reaction-start snapshot",
);
assert(
  gpr03Evidence.architecturalConsequence.readYourOwnWritesIsOneGenerationRefinement === false &&
    gpr03Evidence.architecturalConsequence.publishedSuccessorMayBeNextGenerationInput === true,
  "GPR-03 rejects same-generation cascade but permits the next generation after publication",
);
assert(
  gpr03Evidence.theoremProjection.currentV014InventoryUnchanged === true,
  "GPR-03 leaves accepted theorem inventory unchanged",
);

assert(gpr04Evidence.id === "GPR-04", "GPR-04 evidence id");
assert(
  gpr04Evidence.status ===
    "PROVED_AS_PARTITION_AND_SCHEDULE_REFINEMENT_UNDER_SNAPSHOT_EXTENTIONAL_REDUCTION",
  "GPR-04 evidence classification",
);
assert(gpr04Evidence.externalCrossCheck.ciRun === 37463212259, "GPR-04 exact proof CI is pinned");
assert(
  gpr04Evidence.externalCrossCheck.exactHead === "d30bd1958d560921a32f11bd0cefb0805cbd64ed",
  "GPR-04 proof head is pinned",
);
assert(
  gpr04Evidence.architecturalConsequence.shardMergeOrderChangesSemanticReduction === false &&
    gpr04Evidence.architecturalConsequence.duplicateContributionCreatesSemanticMultiplicity === false &&
    gpr04Evidence.architecturalConsequence.twoDimensionalPartitionChangesSemanticReduction === false,
  "GPR-04 partitioning and merge order are nonsemantic under the stated reduction premises",
);
assert(
  gpr04Evidence.architecturalConsequence.localNoMatchMayPublishGlobalPreserveCurrent === false &&
    gpr04Evidence.architecturalConsequence.runtimeUnionCommandRequired === false &&
    gpr04Evidence.architecturalConsequence.concreteHardwareSynchronizationProved === false,
  "GPR-04 keeps global no-match, runtime UNION and hardware-refinement boundaries explicit",
);
assert(
  gpr04Evidence.theoremProjection.currentV014InventoryUnchanged === true,
  "GPR-04 leaves accepted theorem inventory unchanged",
);

assert(gpr05Evidence.id === "GPR-05", "GPR-05 evidence id");
assert(
  gpr05Evidence.status ===
    "PROVED_UNDER_FINITE_MATERIALIZATION_AND_LOCAL_TERMINATION_WITHOUT_FINITE_AMBIENT_LINK_CARRIER",
  "GPR-05 evidence classification",
);
assert(gpr05Evidence.externalCrossCheck.ciRun === 37475441663, "GPR-05 exact proof CI is pinned");
assert(
  gpr05Evidence.externalCrossCheck.exactHead === "52657fb3e7b4ccab1a18a967acfeff512e9637dd",
  "GPR-05 proof head is pinned",
);
assert(
  gpr05Evidence.architecturalConsequence.finiteAmbientLinkCarrierRequired === false &&
    gpr05Evidence.architecturalConsequence.finiteConcreteComparisonBudgetDerived === true &&
    gpr05Evidence.architecturalConsequence.finiteRawStagingBudgetDerived === true,
  "GPR-05 derives finite concrete work/staging without finite ambient Link carrier",
);
assert(
  gpr05Evidence.architecturalConsequence.atomicPublicationDerivedFromFiniteness === false &&
    gpr05Evidence.architecturalConsequence.infiniteSemanticReactionRuledOut === false &&
    gpr05Evidence.architecturalConsequence.physicalResourceCapacityProved === false,
  "GPR-05 preserves publication, denotational infinity and physical-resource boundaries",
);
assert(
  gpr05Evidence.theoremProjection.currentV014InventoryUnchanged === true,
  "GPR-05 leaves accepted theorem inventory unchanged",
);

assert(gpr09Evidence.id === "GPR-09", "GPR-09 evidence id");
assert(
  gpr09Evidence.status ===
    "PROVED_AS_COMPOSITIONAL_GAMMA_COVARIANCE_UNDER_EXPLICIT_PHASE_COVARIANCE_AND_ACCEPTED_CTX03_MIRROR_TRANSPORT",
  "GPR-09 evidence classification",
);
assert(gpr09Evidence.externalCrossCheck.ciRun === 37477112802, "GPR-09 exact proof CI is pinned");
assert(
  gpr09Evidence.externalCrossCheck.exactHead === "184c00fd9bfd46c86051fe585a8a35ba91567251",
  "GPR-09 proof head is pinned",
);
assert(
  gpr09Evidence.architecturalConsequence.directGaugeBoundary === "C=END(R)" &&
    gpr09Evidence.architecturalConsequence.mirrorGaugeUsesSameGamma === true &&
    gpr09Evidence.architecturalConsequence.hostReverseDirectionModeRequired === false &&
    gpr09Evidence.architecturalConsequence.cIsFoundationGlobalPrivilege === false,
  "GPR-09 preserves gauge-relative C boundary and one Gamma",
);
assert(
  gpr09Evidence.architecturalConsequence.phaseCovarianceImpliesGammaCovariance === true &&
    gpr09Evidence.architecturalConsequence.concreteHardwareCovarianceProved === false &&
    gpr09Evidence.architecturalConsequence.j1Required === false,
  "GPR-09 keeps abstract covariance, implementation and J1 boundaries explicit",
);
assert(
  gpr09Evidence.theoremProjection.currentV014InventoryUnchanged === true,
  "GPR-09 leaves accepted theorem inventory unchanged",
);

assert(gpr06Evidence.id === "GPR-06", "GPR-06 evidence id");
assert(
  gpr06Evidence.status === "PROVED_UNDER_EXPLICIT_EXACT_S0_CLOSURE_LAW",
  "GPR-06 evidence classification",
);
assert(gpr06Evidence.externalCrossCheck.ciRun === 37450135025, "GPR-06 exact proof CI is pinned");
assert(
  gpr06Evidence.externalCrossCheck.exactHead === "68a5104f50291c114f068799d0d3e30fcf910d50",
  "GPR-06 proof head is pinned",
);
assert(
  gpr06Evidence.architecturalConsequence.pureExactS0SelfHosting ===
    "FALSIFIED_UNDER_EXPLICIT_CLOSURE_LAW",
  "GPR-06 falsifies pure exact-S0 self-hosting under its explicit closure law",
);
assert(
  gpr06Evidence.architecturalConsequence.j1CrossCurrentJoinRequired === false,
  "GPR-06 does not require J1",
);
assert(
  gpr06Evidence.architecturalConsequence.externalSemanticGrounderRequired === false,
  "selected v0.15 architecture keeps structure-sensitive capability inside Gamma",
);
assert(
  gpr06Evidence.theoremProjection.currentV014InventoryUnchanged === true,
  "GPR-06 leaves accepted theorem inventory unchanged",
);

assert(gpr08Evidence.id === "GPR-08", "GPR-08 evidence id");
assert(
  gpr08Evidence.status ===
    "PROVED_FOR_FINITE_EXACTSEQUENCE_J0_REPRESENTATION_AND_SEMANTIC_ROLE_AUTHORITY",
  "GPR-08 evidence classification",
);
assert(gpr08Evidence.externalCrossCheck.ciRun === 37451545691, "GPR-08 exact proof CI is pinned");
assert(
  gpr08Evidence.externalCrossCheck.exactHead === "a01e6187e58d483ce33184950de0f83a5b43a137",
  "GPR-08 proof head is pinned",
);
assert(
  gpr08Evidence.architecturalConsequence.finiteArityImpliesJ1 === false,
  "finite arity does not imply J1",
);
assert(
  gpr08Evidence.architecturalConsequence.exactSequenceRemainsLinkTopology === true,
  "ExactSequence remains Link topology",
);
assert(
  gpr08Evidence.architecturalConsequence.physicalRoleShapeImpliesAuthority === false,
  "physical role-shaped Link does not grant semantic role authority",
);
assert(
  gpr08Evidence.theoremProjection.currentV014InventoryUnchanged === true,
  "GPR-08 leaves accepted theorem inventory unchanged",
);

assert(evidence.id === "GPR-07", "GPR-07 evidence id");
assert(
  evidence.status === "PROVED_UNDER_EXPLICIT_GENERIC_KERNEL_LAWS",
  "GPR-07 evidence classification",
);
assert(evidence.externalCrossCheck.ciRun === 37335710302, "GPR-07 exact proof CI is pinned");
assert(
  evidence.theoremProjection.currentV014InventoryUnchanged === true,
  "accepted theorem inventory remains unchanged",
);

console.log([
  "MTS_V015_GPR_PROOF_ASSURANCE=GREEN",
  "V014_ASSURANCE_TARGETS=21_UNCHANGED",
  "V015_GPR_TARGETS=9",
  "GPR01=PAIRED_LEAN_ROCQ",
  "GPR02=PAIRED_LEAN_ROCQ",
  "GPR03=PAIRED_LEAN_ROCQ",
  "GPR04=PAIRED_LEAN_ROCQ",
  "GPR05=PAIRED_LEAN_ROCQ",
  "GPR06=PAIRED_LEAN_ROCQ",
  "GPR07=PAIRED_LEAN_ROCQ",
  "GPR08=PAIRED_LEAN_ROCQ",
  "GPR09=PAIRED_LEAN_ROCQ",
  "GLOBAL_AXIOM_ALLOWLIST=EMPTY",
  "GPR01_CLASSIFICATION=PROVED_AS_PURE_SINGLE_STATE_TRANSFORMER_REFINEMENT",
  "GPR02_CLASSIFICATION=PROVED_FOR_CANONICAL_ANET_MEMBERSHIP_CONVERGENCE_WITH_SEPARATE_PROVENANCE_AND_EXACTSEQUENCE_MULTIPLICITY",
  "GPR03_CLASSIFICATION=PROVED_UNDER_REACTION_START_SNAPSHOT_SEMANTICS_WITH_READ_YOUR_OWN_WRITES_FALSIFIER",
  "GPR04_CLASSIFICATION=PROVED_AS_PARTITION_AND_SCHEDULE_REFINEMENT_UNDER_SNAPSHOT_EXTENTIONAL_REDUCTION",
  "GPR05_CLASSIFICATION=PROVED_UNDER_FINITE_MATERIALIZATION_AND_LOCAL_TERMINATION_WITHOUT_FINITE_AMBIENT_LINK_CARRIER",
  "GPR06_CLASSIFICATION=PROVED_UNDER_EXPLICIT_EXACT_S0_CLOSURE_LAW",
  "GPR07_CLASSIFICATION=PROVED_UNDER_EXPLICIT_GENERIC_KERNEL_LAWS",
  "GPR08_CLASSIFICATION=PROVED_FOR_FINITE_EXACTSEQUENCE_J0_REPRESENTATION_AND_SEMANTIC_ROLE_AUTHORITY",
  "GPR09_CLASSIFICATION=PROVED_AS_COMPOSITIONAL_GAMMA_COVARIANCE_UNDER_EXPLICIT_PHASE_COVARIANCE_AND_ACCEPTED_CTX03_MIRROR_TRANSPORT",
].join(" "));
