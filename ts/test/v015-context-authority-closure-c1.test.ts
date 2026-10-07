// mts-version-evidence: candidate-v0.15-context-authority-closure-c1
// owner: #2007
//
// Clean-main composition gate for contextual execution authority.
// This test does not implement a second executor and does not repeat the
// executable witnesses. It binds the already integrated A5/A6/A8/A9/M5/DAS
// evidence to the compact pre-acceptance kernel and paired GPR assurance.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Json = Record<string, unknown>;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 CTX authority C1: " + message);
}

function record(value: unknown, message: string): Json {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), message);
  return value as Json;
}

function text(value: unknown, message: string): string {
  assert(typeof value === "string" && value.length > 0, message);
  return value;
}

function strings(value: unknown, message: string): readonly string[] {
  assert(Array.isArray(value) && value.every((item) => typeof item === "string"), message);
  return value as string[];
}

function read(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function json(root: string, path: string): Json {
  return JSON.parse(read(root, path)) as Json;
}

function includesAll(source: string, markers: readonly string[], label: string): void {
  for (const marker of markers) assert(source.includes(marker), label + " marker: " + marker);
}

function sameStringSet(
  actual: readonly string[],
  expected: readonly string[],
  message: string,
): void {
  const a = [...new Set(actual)].sort();
  const e = [...new Set(expected)].sort();
  assert(a.length === e.length, message + " cardinality");
  for (let index = 0; index < a.length; index += 1) {
    assert(a[index] === e[index], message + " value[" + index + "]");
  }
}

const root = resolve(process.cwd(), "..");

const a5 = read(root, "ts/test/v015-self-contained-context-freeze-resume-a5.test.ts");
const a6 = read(root, "ts/test/v015-context-theory-self-contained-a6.test.ts");
const a8 = read(root, "ts/test/v015-positive-aset-currentness-a8.test.ts");
const a9a = read(root, "ts/test/v015-structural-aset-gamma-core-a9a.test.ts");
const a9b = read(root, "ts/test/v015-structural-aset-role-bundle-a9b.test.ts");
const a9c = read(root, "ts/test/v015-structural-aset-gamma-antidrift-a9c.test.ts");
const m5 = read(root, "ts/test/v015-variadic-grounding-m5.test.ts");
const dasA2a = read(root, "ts/test/v015-source-anet-denotation-core-das-a2a.test.ts");
const dasA2b = read(root, "ts/test/v015-direct-json-denotation-das-a2b.test.ts");
const dasA2c = read(root, "ts/test/v015-rule-bundle-denotation-das-a2c.test.ts");

includesAll(a5, [
  "DIRECT_GAUGE_CONTEXT_BOUNDARY=C_DERIVED_FROM_ROOT_TO_END_SELF_CLOSURE",
  "DIRECT_GAUGE_C_AUTHOR_DECISION=APPROVED_FOR_V015",
  "EXTERNAL_CURRENT_CONTEXT_POINTER=0",
  "EXTERNAL_CURRENT_SCOPE_POINTER=0",
  "EXTERNAL_PROGRAM_COUNTER=0",
  "WHOLE_MEMORY_CANONICAL_FREEZE_TRANSFER_RESTORE=GREEN",
  "RESUME_WITHOUT_SERIALIZED_CONTEXT_HANDLE=GREEN",
  "ACCEPTED_V014_UNCHANGED",
], "A5");

includesAll(a6, [
  "EXECUTION_ENVIRONMENT=C_TO_THEORY",
  "EXTERNAL_SELECTED_THEORY_POINTER=0",
  "EXTERNAL_CURRENT_SCOPE_POINTER=0",
  "THEORY_DERIVED_FROM_CONTEXT_ANCESTRY=TRUE",
  "REACTION_START_THEORY_SNAPSHOT=TRUE",
  "SAME_REACTION_NEW_ADMISSION_EXECUTABLE=FALSE",
  "NEXT_REACTION_NEW_ADMISSION_EXECUTABLE=TRUE",
  "FOREIGN_THEORY_ISOLATION=TRUE",
  "ACCEPTED_V014_UNCHANGED",
], "A6");

includesAll(a8, [
  "CURRENTNESS=POSITIVE_ASET_MEMBERSHIP",
  "EXTERNAL_CURRENT_POINTER=0",
  "EXTERNAL_SCOPE_POINTER=0",
  "APPEND_ONLY_PHYSICAL_LINK_PRESENCE_IS_CURRENTNESS_AUTHORITY=FALSE",
  "REACTION_ATOMICALLY_REPLACES_SEMANTIC_MEMBERSHIP=TRUE",
  "THEORY_AUTHORITY=ASET_MEMBERSHIP",
  "CURRENT_TRUTHS_RECONSTRUCT_WITHOUT_POINTER=TRUE",
  "ACCEPTED_V014_UNCHANGED",
], "A8");

includesAll(a9a, [
  "MTS_V015_A9_CORE=GREEN",
  "COMMAND=GAMMA_STRUCTURAL_ASET_OF_M",
  "EXTERNAL_CURRENT_POINTER=0",
  "EXTERNAL_SCOPE_POINTER=0",
  "EXTERNAL_SELECTED_THEORY_POINTER=0",
  "PRE_GROUNDER_COMMAND=0_FOR_TESTED_VECTOR",
  "CURRENTNESS=POSITIVE_ASET_MEMBERSHIP_WITNESS",
  "THEORY_AUTHORITY=REACTION_START_ASET_MEMBERSHIP_SNAPSHOT",
  "S1_MATCH_BIND=READ_ONLY_COMPLETE_PLAN",
  "S2_INSTANTIATION=AFTER_COMPLETE_PLAN",
  "PUBLICATION=ATOMIC_SEMANTIC_MEMBERSHIP_REWRITE",
  "SAME_REACTION_NEW_ADMISSION_EXECUTABLE=FALSE",
  "NEXT_REACTION_NEW_ADMISSION_EXECUTABLE=TRUE",
  "CROSS_MEMBER_JOIN=0",
], "A9a");

includesAll(a9b, [
  "MTS_V015_A9_ROLE_BUNDLE=GREEN",
  "NATIVE_ROLE_BUNDLE_RULE=GREEN",
  "NATIVE_ROLE_BUNDLE_ARCHITECTURE=AUTHOR_APPROVED_GAMMA_KERNEL_PROOF_GREEN",
  "DEDICATED_ROLE_DICTIONARY_NECESSITY=FALSIFIED_FOR_TESTED_VECTOR",
  "ROLE_ORDER_SEMANTIC=FALSE",
  "AMBIENT_OUTGOING_LINK_IS_ROLE=FALSE",
  "GROUNDED_RULE=EMPTY_ROLE_BUNDLE_REFINEMENT",
  "NATIVE_ROLE_BUNDLE_A72R_SHAPE=GREEN",
  "CROSS_MEMBER_JOIN=0",
], "A9b");

includesAll(a9c, [
  "MTS_V015_A9_ANTIDRIFT=GREEN",
  "THEORY_AUTHORITY=ASET_MEMBERSHIP_ONLY",
  "S1_PLAN=READ_ONLY_POINTER_FREE",
  "S2_AFTER_COMPLETE_PLAN=TRUE",
  "LEGACY_RUNTIME_AUTHORITY=0",
  "OPCODE_DISPATCH=0",
], "A9c");

includesAll(m5, [
  "MTS_V015_META_M5=VARIADIC_GROUNDING_GREEN",
  "GENERIC_SOURCE_RULE_COUNT=3",
  "TESTED_ARITIES=1_2_3_5",
  "GROUNDED_RULE_PER_INPUT_TUPLE_AUTHORED=0",
  "CROSS_MEMBER_JOIN_REQUIRED=FALSE",
  "VARIABLE_ARITY_DOES_NOT_IMPLY_STRONGER_MP=TRUE",
], "M5");

includesAll(dasA2a, [
  "SOURCE_CARRIER=NATIVE_SYNTAX_ANET",
  "PHYSICAL_EXISTENCE_IMPLIES_MEMBERSHIP=FALSE",
  "CURRENTNESS_REQUIRES_MEMBERSHIP=TRUE",
], "DAS-A2a");

includesAll(dasA2b, [
  "DIRECT_JSON_TO_NATIVE_SOURCE_ANET=GREEN",
  "CURRENTNESS_MEMBERSHIP_MOVE=GREEN",
  "PRESENTATION_RENAME_MEMBERSHIP_INVARIANT=GREEN",
], "DAS-A2b");

includesAll(dasA2c, [
  "ROLE_BUNDLE_MEMBERS=ROLES_PLUS_ADMISSION_ONLY",
  "HELPER_BINDINGS_ERASE_BEFORE_EXECUTION=TRUE",
  "GENERIC_STRUCTURAL_MATCH_BIND=GREEN",
  "GROUNDED_EMPTY_ROLE_BUNDLE=ADMISSION_ONLY",
  "GROUNDED_ROLE_COUNT=0",
], "DAS-A2c");

const kernel = json(root, "profiles/mts-v015-meta-interpreter-kernel.json");
assert(
  text(kernel.status, "kernel status") === "ACCEPTED_EXECUTION_AUTHORITY",
  "kernel is accepted execution authority",
);
const semanticAuthority = record(kernel.semanticAuthority, "kernel semanticAuthority");
assert(semanticAuthority.versionAccepted === true, "kernel accepts v0.15");
assert(semanticAuthority.authorAcceptanceRequired === false, "explicit Author acceptance satisfied");
assert(
  strings(semanticAuthority.excludes, "kernel semantic exclusions").includes("unresolved sequence-carrier research"),
  "sequence-carrier research excluded from kernel authority",
);

const command = record(kernel.command, "kernel command");
assert(command.repeatedCommandCount === 1, "one repeated semantic command");
assert(text(command.localReaction, "local reaction") === "STRUCTURAL_UNARY_J0", "J0 structural-unary selected");
assert(text(command.crossMemberJoin, "cross-member join") === "J1_NOT_REQUIRED", "J1 not required");
assert(command.externalSemanticGrounderAllowed === false, "external semantic grounder forbidden");
assert(command.programSpecificDispatchAllowed === false, "program-specific dispatch forbidden");

const phases = record(kernel.phases, "kernel phases");
const analysis = record(phases.analysis, "analysis phase");
const synthesis = record(phases.synthesis, "synthesis phase");
const publication = record(phases.publication, "publication phase");
assert(analysis.readOnly === true && analysis.completePlanBeforeSynthesis === true, "S1 is complete read-only plan");
assert(synthesis.startsAfterCompleteAnalysisPlan === true, "S2 starts after complete S1");
assert(publication.completeSuccessorBeforePublication === true, "complete successor precedes publication");
assert(publication.sameGenerationReadOwnWrites === false, "no same-generation read-own-writes");

const authority = record(kernel.authority, "kernel authority");
assert(text(authority.currentness, "currentness") === "POSITIVE_SEMANTIC_ANET_MEMBERSHIP", "positive semantic currentness");
assert(authority.physicalLinkExistenceAlone === false, "physical existence alone has no authority");
assert(authority.hostNameAuthority === false, "host names have no semantic authority");
for (const key of [
  "externalCurrentPointer",
  "externalScopePointer",
  "externalSelectedTheoryPointer",
  "externalProgramCounter",
]) {
  assert(authority[key] === false, "kernel excludes " + key);
}

const context = record(kernel.context, "kernel context");
assert(text(context.directGaugeBoundary, "context boundary") === "C", "direct-gauge C boundary");
assert(text(context.rootRelation, "context root relation") === "C = END(R)", "C=END(R)");
assert(context.versionAcceptance === false, "Context design does not accept v0.15");
assert(context.foundationGlobalPrivilege === false, "C is not Foundation-global privilege");
assert(context.chiralityCovariantMirrorRequired === true, "chirality covariance required");

const decisionById = new Map(
  (kernel.resolvedDecisions as Json[]).map((item) => [
    text(item.id, "decision id"),
    text(item.decision, "decision value"),
  ] as const),
);
assert(decisionById.get("MI-D02") === "POSITIVE_SEMANTIC_ANET_MEMBERSHIP", "MI-D02");
assert(decisionById.get("MI-D03") === "LINK_STRUCTURE_AND_SEMANTIC_MEMBERSHIP_AUTHORITY", "MI-D03");
assert(decisionById.get("MI-D04") === "AUTHOR_APPROVED_GAMMA_GPR01_09_PROOF_GREEN", "MI-D04");
assert(decisionById.get("MI-D05") === "STRUCTURAL_UNARY_GAMMA_S1_S2_INTERNAL_NO_EXTERNAL_GROUNDER", "MI-D05");

const cleanEvidence = strings(kernel.cleanMainExecutableEvidence, "clean-main executable evidence");
for (const path of [
  "ts/test/v015-positive-aset-currentness-a8.test.ts",
  "ts/test/v015-context-theory-self-contained-a6.test.ts",
  "ts/test/v015-variadic-grounding-m5.test.ts",
  "ts/test/v015-structural-aset-gamma-core-a9a.test.ts",
  "ts/test/v015-structural-aset-role-bundle-a9b.test.ts",
  "ts/test/v015-structural-aset-gamma-antidrift-a9c.test.ts",
]) {
  assert(cleanEvidence.includes(path), "kernel pins clean evidence: " + path);
}
assert(
  !cleanEvidence.includes("ts/test/v015-structural-aset-one-command-a9.test.ts"),
  "obsolete A9 monolith is not clean kernel evidence",
);

const unresolved = kernel.unresolvedExcludedFromKernel;
assert(Array.isArray(unresolved), "kernel unresolved exclusions");
const sequenceBoundary = (unresolved as Json[]).find((item) =>
  item.id === "SEQUENCE_CARRIER_SOURCE_PROVENANCE"
);
assert(sequenceBoundary !== undefined, "sequence-carrier exclusion exists");
assert(
  text(sequenceBoundary.status, "sequence-carrier status") === "AUTHOR_REVIEW_REQUIRED",
  "sequence-carrier/source-provenance remains Author-review-required",
);

const gammaProfile = json(root, "profiles/mts-v015-generalized-reaction-candidate.json");
const integrationBoundary = record(gammaProfile.integrationBoundary, "Gamma integration boundary");
assert(
  text(integrationBoundary.classification, "Gamma classification") === "ARCHITECTURE_DESIGN_EVIDENCE",
  "Gamma profile is design evidence",
);
assert(integrationBoundary.soleAcceptanceAuthority === false, "Gamma profile is not sole acceptance authority");

const gammaDecision = record(gammaProfile.decision, "Gamma decision");
assert(
  text(gammaDecision.minimalCompleteLocalReaction, "selected local reaction") === "STRUCTURAL_UNARY_J0_SELECTED",
  "structural-unary J0 selected",
);
assert(text(gammaDecision.trueCrossMemberJoin, "J1 decision") === "J1_NOT_REQUIRED", "J1 not required");

const grounding = record(gammaProfile.metaGroundingBoundary, "meta-grounding boundary");
assert(
  text(grounding.status, "meta-grounding status") === "RESOLVED_STRUCTURAL_UNARY_GAMMA",
  "meta-grounding boundary resolved",
);
assert(grounding.runtimeExternalGrounderCommandAllowed === false, "runtime external grounder forbidden");
const selectedGamma = record(grounding.structuralAsetOneCommand, "selected one-Gamma evidence");
assert(
  text(selectedGamma.evidence, "one-Gamma core evidence") ===
    "ts/test/v015-structural-aset-gamma-core-a9a.test.ts",
  "Gamma profile points to A9a",
);
sameStringSet(
  strings(selectedGamma.cleanMainEvidence, "one-Gamma clean evidence"),
  [
    "ts/test/v015-structural-aset-role-bundle-a9b.test.ts",
    "ts/test/v015-structural-aset-gamma-antidrift-a9c.test.ts",
  ],
  "Gamma profile split evidence",
);

const sequenceProfile = record(gammaProfile.sequenceCarrierBoundary, "sequence-carrier profile");
assert(
  text(sequenceProfile.status, "sequence-carrier profile status") === "AUTHOR_REVIEW_REQUIRED",
  "Gamma profile does not silently resolve sequence-carrier provenance",
);

const gpr = json(root, "proofs/v015-external-proof-assurance.json");
const allowed = record(gpr.allowedGlobalAxioms, "GPR allowedGlobalAxioms");
assert(Array.isArray(allowed.lean4) && allowed.lean4.length === 0, "Lean global axiom allowlist empty");
assert(Array.isArray(allowed.rocq) && allowed.rocq.length === 0, "Rocq global axiom allowlist empty");
const targets = gpr.targets;
assert(Array.isArray(targets), "GPR targets");
sameStringSet(
  (targets as Json[]).map((item) => text(item.id, "GPR id")),
  ["GPR-01", "GPR-02", "GPR-03", "GPR-04", "GPR-05", "GPR-06", "GPR-07", "GPR-08", "GPR-09"],
  "GPR target set",
);
for (const target of targets as Json[]) {
  assert(text(target.classification, "GPR classification").startsWith("PROVED_"), "GPR target proof-classified");
  assert(strings(target.lean4, "GPR Lean symbols").length > 0, "GPR Lean symbols nonempty");
  assert(strings(target.rocq, "GPR Rocq symbols").length > 0, "GPR Rocq symbols nonempty");
}

const ci = read(root, ".github/workflows/ci.yml");
includesAll(ci, [
  "proofs/v015-external-proof-assurance.json",
  "MtsV015GeneralizedReactionCore.lean",
  "MtsV015GeneralizedReactionRefinement.lean",
  "MtsV015GeneralizedReaction.lean",
  "MtsV015GeneralizedReactionCore.v",
  "MtsV015GeneralizedReactionRefinement.v",
  "MtsV015GeneralizedReaction.v",
  "#print axioms",
  "Print Assumptions",
  "v0.15 Lean assurance found sorryAx",
  "V015_KERNEL_ASSUMPTIONS_LEAN=CHECKED",
  "V015_KERNEL_ASSUMPTIONS_ROCQ=CHECKED",
], "paired GPR CI assurance");

console.log([
  "MTS_V015_CTX_AUTHORITY_C1=CLEAN_MAIN_COMPONENT_GREEN",
  "CURRENTNESS=POSITIVE_SEMANTIC_ANET_MEMBERSHIP",
  "THEORY_AUTHORITY=LINK_STRUCTURE_PLUS_REACTION_START_MEMBERSHIP",
  "PHYSICAL_EXISTENCE_ALONE=NO_AUTHORITY",
  "HOST_POINTER_AUTHORITY=0",
  "HOST_NAME_AUTHORITY=0",
  "FOREIGN_THEORY=INERT",
  "FREEZE_RESUME_WITHOUT_SIDECAR=GREEN",
  "ONE_GAMMA_STRUCTURAL_EXECUTION=GREEN",
  "EXTERNAL_GROUNDER_COMMAND=0",
  "J1_REQUIRED=FALSE",
  "VARIADIC_A72R_CLASS=GREEN",
  "GPR01_09_PAIRED_ASSURANCE=BOUND_TO_CLEAN_MAIN_CI",
  "SEQUENCE_CARRIER_SOURCE_PROVENANCE=AUTHOR_REVIEW_REQUIRED",
  "VERSION_ACCEPTED=FALSE",
  "AUTHOR_ACCEPTANCE_REQUIRED=TRUE",
  "ACCEPTED_BASELINE=MTS_V0_14",
].join(" "));
