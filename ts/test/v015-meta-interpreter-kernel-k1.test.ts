import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// This gate validates only pre-acceptance execution-kernel authority; final MTS v0.15 acceptance remains an explicit Author decision.
// repo-guard boundary: this executable gate and the compact profile form one atomic clean-main kernel slice.
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 meta-interpreter kernel: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}

const root = resolve(process.cwd(), "..");
const profilePath = resolve(root, "profiles/mts-v015-meta-interpreter-kernel.json");
const profile = JSON.parse(readFileSync(profilePath, "utf8")) as {
  status: string;
  semanticAuthority: {
    versionAccepted: boolean;
    authorAcceptanceRequired: boolean;
    excludes: readonly string[];
  };
  command: {
    name: string;
    repeatedCommandCount: number;
    localReaction: string;
    scalarPositiveLaw: string;
    crossMemberJoin: string;
    externalSemanticGrounderAllowed: boolean;
    programSpecificDispatchAllowed: boolean;
  };
  phases: {
    analysis: { id: string; readOnly: boolean; completePlanBeforeSynthesis: boolean };
    synthesis: { id: string; startsAfterCompleteAnalysisPlan: boolean };
    publication: { completeSuccessorBeforePublication: boolean; sameGenerationReadOwnWrites: boolean };
  };
  authority: {
    currentness: string;
    theory: string;
    physicalLinkExistenceAlone: boolean;
    hostNameAuthority: boolean;
    externalCurrentPointer: boolean;
    externalScopePointer: boolean;
    externalSelectedTheoryPointer: boolean;
    externalProgramCounter: boolean;
  };
  context: {
    directGaugeBoundary: string;
    rootRelation: string;
    authorDecision: string;
    versionAcceptance: boolean;
    designAcceptanceScope: string;
    foundationGlobalPrivilege: boolean;
    chiralityCovariantMirrorRequired: boolean;
  };
  resolvedDecisions: readonly { id: string; decision: string }[];
  cleanMainExecutableEvidence: readonly string[];
  unresolvedExcludedFromKernel: readonly { id: string; status: string }[];
};

same(profile.status, "PRE_ACCEPTANCE_EXECUTION_AUTHORITY_CANDIDATE", "pre-acceptance status");
same(profile.semanticAuthority.versionAccepted, false, "kernel cannot accept version");
same(profile.semanticAuthority.authorAcceptanceRequired, true, "explicit Author acceptance remains required");

same(profile.command.name, "GAMMA_STRUCTURAL_ASET", "one Gamma command");
same(profile.command.repeatedCommandCount, 1, "exactly one repeated semantic command");
same(profile.command.localReaction, "STRUCTURAL_UNARY_J0", "selected J0 reaction");
same(profile.command.scalarPositiveLaw, "MP0_RETAINED", "MP0 retained");
same(profile.command.crossMemberJoin, "J1_NOT_REQUIRED", "J1 remains unnecessary");
same(profile.command.externalSemanticGrounderAllowed, false, "external semantic grounder forbidden");
same(profile.command.programSpecificDispatchAllowed, false, "program-specific dispatch forbidden");

same(profile.phases.analysis.id, "S1", "analysis phase is S1");
same(profile.phases.analysis.readOnly, true, "S1 is read-only");
same(profile.phases.analysis.completePlanBeforeSynthesis, true, "S1 plan completes before S2");
same(profile.phases.synthesis.id, "S2", "synthesis phase is S2");
same(profile.phases.synthesis.startsAfterCompleteAnalysisPlan, true, "S2 starts after full S1 plan");
same(profile.phases.publication.completeSuccessorBeforePublication, true, "complete successor before publication");
same(profile.phases.publication.sameGenerationReadOwnWrites, false, "no same-generation read-own-writes");

same(profile.authority.currentness, "POSITIVE_SEMANTIC_ANET_MEMBERSHIP", "currentness authority");
same(profile.authority.physicalLinkExistenceAlone, false, "physical Link existence is not authority");
same(profile.authority.hostNameAuthority, false, "host name is not authority");
same(profile.authority.externalCurrentPointer, false, "no current pointer authority");
same(profile.authority.externalScopePointer, false, "no Scope pointer authority");
same(profile.authority.externalSelectedTheoryPointer, false, "no selected-Theory pointer authority");
same(profile.authority.externalProgramCounter, false, "no external program counter");

same(profile.context.directGaugeBoundary, "C", "direct-gauge Context boundary");
same(profile.context.rootRelation, "C = END(R)", "Context boundary root relation");
same(profile.context.authorDecision, "APPROVED_FOR_V015_DESIGN", "Context design decision");
same(profile.context.versionAcceptance, false, "Context design decision is not version acceptance");
same(
  profile.context.designAcceptanceScope,
  "V0.15_DESIGN_DECISION_NOT_FULL_VERSION_ACCEPTANCE",
  "Context design acceptance scope",
);
same(profile.context.foundationGlobalPrivilege, false, "C is not Foundation-global privilege");
same(profile.context.chiralityCovariantMirrorRequired, true, "chirality-covariant mirror equivalence remains required");

const decisionById = new Map(profile.resolvedDecisions.map((item) => [item.id, item.decision]));
same(decisionById.get("MI-D01"), "AUTHOR_APPROVED_FOR_V015", "MI-D01");
same(decisionById.get("MI-D02"), "POSITIVE_SEMANTIC_ANET_MEMBERSHIP", "MI-D02");
same(decisionById.get("MI-D03"), "LINK_STRUCTURE_AND_SEMANTIC_MEMBERSHIP_AUTHORITY", "MI-D03");
same(decisionById.get("MI-D04"), "AUTHOR_APPROVED_GAMMA_GPR01_09_PROOF_GREEN", "MI-D04");
same(decisionById.get("MI-D05"), "STRUCTURAL_UNARY_GAMMA_S1_S2_INTERNAL_NO_EXTERNAL_GROUNDER", "MI-D05");

for (const evidence of profile.cleanMainExecutableEvidence) {
  assert(existsSync(resolve(root, evidence)), "clean-main evidence exists: " + evidence);
}

const unresolved = new Map(profile.unresolvedExcludedFromKernel.map((item) => [item.id, item.status]));
same(
  unresolved.get("SEQUENCE_CARRIER_SOURCE_PROVENANCE"),
  "AUTHOR_REVIEW_REQUIRED",
  "unresolved sequence-carrier research remains excluded",
);

const raw = readFileSync(profilePath, "utf8");
for (const forbidden of [
  '"sequenceCarrierBoundary"',
  '"formalJsonExamples"',
  '"parallelReactionReduction"',
  '"finiteMaterializedReaction"',
  '"historicalAlternatives"',
]) {
  assert(!raw.includes(forbidden), "research-only field excluded from kernel: " + forbidden);
}

console.log([
  "MTS_V015_META_INTERPRETER_KERNEL=GREEN",
  "VERSION_ACCEPTED=FALSE",
  "AUTHOR_ACCEPTANCE_REQUIRED=TRUE",
  "COMMAND=ONE_GAMMA_STRUCTURAL_J0",
  "S1=READ_ONLY_COMPLETE_PLAN",
  "S2=AFTER_S1",
  "PUBLICATION=COMPLETE_SUCCESSOR_ATOMIC",
  "CURRENTNESS=POSITIVE_SEMANTIC_ANET_MEMBERSHIP",
  "EXTERNAL_SEMANTIC_POINTERS=0",
  "EXTERNAL_GROUNDER=0",
  "PROGRAM_SPECIFIC_DISPATCH=0",
  "J1_REQUIRED=FALSE",
  "CONTEXT_GAUGE_PRIVILEGE=RELATIVE_NOT_GLOBAL",
  "CHIRALITY_COVARIANT_MIRROR=REQUIRED",
  "UNRESOLVED_SEQUENCE_CARRIER=EXCLUDED",
].join(" "));
