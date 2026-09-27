// mts-version-evidence: candidate-from=0.14
// research-owner: #1666

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Memory, ensureRootBasis } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 N18 readiness audit: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function sameSet(
  actual: readonly string[],
  expected: readonly string[],
  message: string,
): void {
  const a = [...new Set(actual)].sort();
  const e = [...new Set(expected)].sort();
  assert(a.length === actual.length, message + ": duplicate actual values");
  assert(e.length === expected.length, message + ": duplicate expected values");
  assert(JSON.stringify(a) === JSON.stringify(e), message);
}

const repoRoot = resolve(process.cwd(), "..");
const readJson = (path: string): any =>
  JSON.parse(readFileSync(join(repoRoot, path), "utf8"));

const contract = readJson("contracts/mts-contract-v0.14.json");
const conformance = readJson("contracts/mts-conformance-v0.14.json");
const traceability = readJson("traceability/mts-v0.14.json");
const policy = readJson("repo-policy.json");
const acceptance13 = readJson("cutover/typescript-c1-acceptance-v0.6.json");

// Live-kernel anchor: readiness is not a paper-only JSON transition.
const memory = new Memory();
const basis = ensureRootBasis(memory);
assert(basis.R !== basis.O && basis.O !== basis.C, "live kernel root basis remains proper");

// Candidate identities and readiness state.
same(contract.schema, "mts-contract/v0.14", "contract identity");
same(conformance.schema, "mts-conformance/v0.14", "conformance identity");
same(traceability.schema, "mts-traceability/v0.2", "traceability identity");
same(contract.status, "candidate", "contract status");
same(conformance.status, "candidate", "conformance status");
same(traceability.status, "candidate", "traceability status");
same(contract.accepted, false, "contract remains nonaccepted");
same(conformance.accepted, false, "conformance remains nonaccepted");
same(traceability.accepted, false, "traceability remains nonaccepted");
same(contract.acceptanceReady, true, "contract is readiness-complete");
same(conformance.acceptanceReady, true, "conformance is readiness-complete");
same(traceability.acceptanceReady, true, "traceability is readiness-complete");
same(traceability.acceptance, null, "ready candidate still has no acceptance manifest");

// Candidate lifecycle completeness within the declared v0.14 acceptance scope.
same(contract.candidateState.researchEvidenceSubstantial, true, "research evidence substantial");
same(contract.candidateState.arithmeticAcceptanceScopeClosed, true, "arithmetic scope closed");
same(contract.candidateState.foundationOrientationFinalChoiceComplete, true, "A4' choice frozen");
same(contract.candidateState.formalSurfaceGrammarComplete, true, "FORMAL grammar complete");
same(contract.candidateState.traceabilityComplete, true, "traceability complete");
same(contract.candidateState.readinessAuditComplete, true, "readiness audit complete");
same(contract.candidateState.explicitAuthorAcceptanceRecorded, false, "author acceptance remains absent");

// Documentation is intentionally downstream of acceptance (#1585), so false
// is the expected pre-acceptance state rather than a readiness failure.
same(contract.candidateState.documentationComplete, false, "docs remain post-acceptance");
same(
  contract.acceptanceBoundary.documentationReconstructionUnblocked,
  false,
  "documentation reconstruction remains blocked before acceptance",
);
same(
  contract.acceptanceBoundary.documentationReconstructionIssue,
  1585,
  "post-acceptance documentation issue is explicit",
);

// A4' exact author-frozen foundation semantics.
same(
  contract.foundationOrientation.finalNormativeChoice,
  "A4_PRIME_CHIRAL_TORSOR_DERIVED_START_END",
  "A4' final normative choice",
);
same(contract.foundationOrientation.normativeStatus, "AUTHOR_FROZEN", "A4' author freeze status");
same(contract.foundationOrientation.preOrientationPoleModel, "GLOBAL_Z2_TORSOR", "pre-orientation model");
same(contract.foundationOrientation.unorderedPoleQuotientUsed, false, "unordered quotient forbidden");
same(contract.foundationOrientation.absolutePoleNamesBeforeWitness, false, "no primitive absolute pole names");
same(contract.foundationOrientation.witnessDefinedBeforeStartEnd, true, "W precedes START/END naming");
same(
  contract.foundationOrientation.technicalCarrierCoordinatesAreSemanticAuthority,
  false,
  "technical .start/.end are not pre-orientation semantic authority",
);

// FORMAL / arithmetic / execution acceptance scope.
same(contract.ostensiveFormalNotation.finalSurfaceGrammar, "GREEN_RESEARCH", "FORMAL grammar green");
same(contract.natTheory.status, "GREEN_RESEARCH", "Nat green");
same(contract.addTheory.constructiveTotality, "GREEN_RESEARCH", "Add totality green");
same(contract.addTheory.functionality, "GREEN_RESEARCH", "Add functionality green");
same(contract.orderTheory.status, "GREEN_RESEARCH", "Order green");
same(contract.multiplicationScope.status, "EXPLICITLY_DEFERRED", "Mul is explicitly deferred");
same(contract.multiplicationScope.requiredForV014Acceptance, false, "Mul is outside v0.14 acceptance scope");
same(contract.generalizedMpNonRegression.status, "GREEN_RESEARCH", "generalized MP non-regression green");
same(contract.generalizedMpNonRegression.newV014ExecutionLaw, false, "no new v0.14 execution law");
same(contract.executionProfileNonRegression.status, "GREEN_RESEARCH", "execution profile non-regression green");

// Runtime boundary: semantic readiness does not silently invent a second
// production runtime or claim that downstream cutover is already complete.
same(contract.implementation.acceptedRuntime, "mts-contract/v0.13", "accepted runtime remains v0.13");
same(contract.implementation.candidateRuntimeSelectable, false, "candidate runtime is not selectable");
same(contract.implementation.implementationComplete, true, "declared candidate implementation scope is complete");
same(contract.implementation.candidateKernelBehaviorImplemented, true, "candidate kernel behavior is implementation-complete");
same(
  contract.implementation.implementationCompleteMeaning,
  "declared-v0.14-candidate-scope complete with all mandatory executable gates; production cutover/current-pointer rotation not yet performed",
  "implementationComplete does not imply cutover",
);
same(contract.implementation.productionBehaviorChanged, false, "no production behavior delta");
same(contract.implementation.singleLiveSemanticRuntime, true, "single live semantic runtime retained");

// Exact law/traceability graph.
const lawIds = Object.keys(contract.requiredSemanticLaws).sort();
const invariantIds = Object.keys(traceability.invariants).sort();
same(lawIds.length, 12, "v0.14 law count");
sameSet(invariantIds, lawIds, "traceability law identity");

for (const id of lawIds) {
  const invariant = traceability.invariants[id];
  assert(invariant !== undefined, id + " traceability entry exists");
  assert(
    typeof invariant.status === "string" &&
      !/BLOCKING|PENDING/.test(invariant.status),
    id + " has no blocking/pending traceability status",
  );
  same(
    invariant.contractPointer,
    "/requiredSemanticLaws/" + id,
    id + " exact contract pointer",
  );
  assert(
    Array.isArray(invariant.requiredExecutableGates) &&
      invariant.requiredExecutableGates.length > 0,
    id + " has executable evidence",
  );
}
same(
  traceability.invariants["V14-L10"].status,
  "EXPLICITLY_DEFERRED_SCOPE",
  "Mul law remains explicit scope defer",
);
same(
  traceability.invariants["V14-L12"].status,
  "GREEN_AUTHOR_FROZEN",
  "A4' law is author frozen",
);

// Every declared mandatory gate exists, including this independent audit.
const gates = conformance.requiredExecutableGates as string[];
assert(Array.isArray(gates) && gates.length > 0, "required gate set is non-empty");
assert(
  gates.includes("ts/test/v014-independent-readiness-audit.test.ts"),
  "readiness audit is itself mandatory",
);
assert(
  gates.includes("ts/test/research-v014-a4prime-chiral-torsor-bootstrap.test.ts"),
  "A4' chiral bootstrap remains mandatory",
);
for (const gate of gates) {
  assert(existsSync(join(repoRoot, gate)), "declared gate exists: " + gate);
}
same(conformance.coverageState, "complete", "ready candidate has complete executable coverage");
same((conformance.plannedExecutableGates as unknown[]).length, 0, "no planned executable gates remain");

// Cross-repository accelerator evidence may remain pending only when it is
// explicitly non-kernel-gating.
for (const dependency of conformance.crossRepositoryAcceptanceDependencies ?? []) {
  if (dependency.status === "PENDING") {
    same(dependency.kernelGate, false, "pending cross-repo dependency is non-kernel-gating");
  }
}

// Readiness blockers collapse to explicit author acceptance only.
same(conformance.blockers.a4FinalChoice, "GREEN_AUTHOR_FROZEN", "A4 blocker closed");
same(conformance.blockers.formalSurfaceGrammar, "GREEN_RESEARCH", "FORMAL blocker closed");
same(conformance.blockers.traceability, "GREEN_CANDIDATE", "traceability blocker closed");
same(conformance.blockers.readinessAudit, "GREEN_INDEPENDENT_AUDIT", "readiness blocker closed");
same(conformance.blockers.explicitAuthorAcceptance, "BLOCKING_PENDING", "author acceptance remains blocking");
sameSet(
  contract.acceptanceBoundary.blockers,
  ["explicit author acceptance"],
  "only explicit author acceptance remains",
);
same(contract.acceptanceBoundary.acceptanceReady, true, "acceptance boundary is ready");
same(contract.acceptanceBoundary.accepted, false, "acceptance boundary remains nonaccepted");
same(contract.acceptanceBoundary.automaticAcceptanceForbidden, true, "automatic acceptance forbidden");
same(contract.acceptanceBoundary.explicitAuthorApprovalRequired, true, "explicit author approval required");
same(contract.acceptanceBoundary.authorDecisionRequired, "ACCEPT MTS v0.14", "exact author decision phrase");

// Accepted v0.13 remains current; no v0.14 cutover exists.
const pack = policy.packs["contract-conformance"];
same(pack.current.contract.path, "contracts/mts-contract-v0.13.json", "policy current contract remains v0.13");
same(pack.current.conformance.path, "contracts/mts-conformance-v0.13.json", "policy current conformance remains v0.13");
same(acceptance13.current.contract, "contracts/mts-contract-v0.13.json", "cutover current contract remains v0.13");
same(acceptance13.current.conformance, "contracts/mts-conformance-v0.13.json", "cutover current conformance remains v0.13");
assert(
  !existsSync(join(repoRoot, "cutover/typescript-c1-acceptance-v0.7.json")),
  "readiness must not create v0.14 acceptance cutover",
);

console.log([
  "MTS v0.14 N18: INDEPENDENT_READINESS_AUDIT=GREEN",
  "LAW_COUNT=12",
  `REQUIRED_GATE_COUNT=${gates.length}`,
  "A4_PRIME=GREEN_AUTHOR_FROZEN",
  "FORMAL=GREEN",
  "ARITHMETIC_ACCEPTANCE_SCOPE=CLOSED",
  "MUL=EXPLICITLY_DEFERRED_NONBLOCKING",
  "GENERALIZED_MP_NON_REGRESSION=GREEN",
  "EXECUTION_PROFILE_NON_REGRESSION=GREEN",
  "CANDIDATE_RUNTIME_SELECTABLE=FALSE",
  "PRODUCTION_BEHAVIOR_CHANGED=FALSE",
  "DOCUMENTATION=POST_ACCEPTANCE_1585",
  "PLANNED_GATES=0",
  "ONLY_REMAINING_BLOCKER=EXPLICIT_AUTHOR_ACCEPTANCE",
  "ACCEPTANCE_READY=TRUE",
  "V014_ACCEPTED=FALSE",
  "V013_CURRENT_POINTER_UNCHANGED=TRUE",
].join(" "));
