// mts-version-evidence: candidate-from=0.14
// historical research-owner: #1666
// superseding convergence owner: #1677
//
// N18 remains executable historical evidence, but its readiness verdict is
// invalidated by N20c and MUST NOT be reused for author acceptance.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Memory, ensureRootBasis } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 historical N18 readiness guard: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}

const repoRoot = resolve(process.cwd(), "..");
const readJson = (path: string): any =>
  JSON.parse(readFileSync(join(repoRoot, path), "utf8"));

const contract = readJson("contracts/mts-contract-v0.14.json");
const conformance = readJson("contracts/mts-conformance-v0.14.json");
const traceability = readJson("traceability/mts-v0.14.json");
const policy = readJson("repo-policy.json");
const acceptance13 = readJson("cutover/typescript-c1-acceptance-v0.6.json");

const memory = new Memory();
const basis = ensureRootBasis(memory);
assert(basis.R !== basis.O && basis.O !== basis.C, "live kernel RootBasis remains proper");
same(memory.ensure(basis.O, basis.C), basis.L, "live kernel L remains canonical");
same(memory.ensure(basis.C, basis.O), basis.U, "live kernel U remains canonical");

same(contract.accepted, false, "v0.14 remains nonaccepted");
same(conformance.accepted, false, "conformance remains nonaccepted");
same(traceability.accepted, false, "traceability remains nonaccepted");

same(contract.acceptanceReady, false, "N18 readiness verdict is superseded");
same(conformance.acceptanceReady, false, "conformance requires post-N20c re-audit");
same(traceability.acceptanceReady, false, "traceability requires post-N20c re-audit");
same(contract.candidateState.readinessAuditComplete, false, "live readiness audit is pending");

same(contract.readinessAudit.status, "BLOCKING_PENDING_POST_N20C_REAUDIT", "contract readiness status");
same(contract.readinessAudit.previousAudit.issue, 1666, "historical N18 issue");
same(contract.readinessAudit.previousAudit.status, "HISTORICAL_SUPERSEDED_BY_N20C", "N18 superseded");
same(contract.readinessAudit.previousAudit.frozenDossier, 1668, "historical frozen dossier");
same(contract.readinessAudit.previousAudit.validForAcceptance, false, "old freeze invalid for acceptance");
same(conformance.lifecycle.preN20Freeze1668ValidForAcceptance, false, "conformance invalidates old freeze");

same(contract.foundationOrientation.finalNormativeChoice, "A4_PRIME_CONTEXT_RELATIVE_Z2_GAUGE", "current A4 model");
same(contract.foundationOrientation.contextRelativeFrame, true, "Context-relative frame");
same(contract.foundationOrientation.globalSelectedWitnessRequired, false, "global selected W rejected");
same(contract.foundationOrientation.contextOrientationCarrier, "ONE_SIDED_SELF_INCIDENCE_LINK", "Link-native Context marker");
same(contract.foundationOrientation.exactSequenceOrientationAuthority, false, "ExactSequence not orientation authority");

same(contract.recursiveAlphabet.abstractLinkFormingPrimitiveCount, 1, "one abstract Link primitive");
same(contract.recursiveAlphabet.emergentStructuralCaseCount, 4, "four emergent structural cases");
same(contract.recursiveAlphabet.preOrientedJOrbitClassCount, 3, "three pre-oriented J classes");
same(contract.recursiveAlphabet.primitivePhysicalOpcodes, false, "not four primitive physical opcodes");

const laws = Object.keys(contract.requiredSemanticLaws);
same(laws.length, 14, "N20c law count");
same(Object.keys(traceability.invariants).length, 14, "N20c traceability law count");

const gates = conformance.requiredExecutableGates as string[];
same(gates.length, 69, "N20c mandatory executable gate count");
assert(gates.includes("ts/test/research-v014-context-relative-a4prime.test.ts"), "Context-relative A4 witness mandatory");
assert(gates.includes("ts/test/research-v014-preacceptance-closure.test.ts"), "N20c closure witness mandatory");
assert(gates.includes("ts/test/research-v013-root-asymmetry-chirality-a14.test.ts"), "A14 evidence mandatory");
assert(gates.includes("ts/test/research-v013-contextual-truth-dynamic-duality-a16.test.ts"), "A16 evidence mandatory");
assert(gates.includes("ts/test/research-v013-application-closed-frontier-a17.test.ts"), "A17 evidence mandatory");
assert(gates.includes("ts/test/research-v013-flat-generalized-modus-ponens-a72w.test.ts"), "A72w evidence mandatory");
for (const gate of gates) assert(existsSync(join(repoRoot, gate)), "declared gate exists: " + gate);

same(conformance.plannedExecutableGates.length, 1, "one future audit gate planned");
same(
  conformance.plannedExecutableGates[0],
  "pending:v014-post-n20c-independent-readiness-audit",
  "post-N20c readiness token",
);

same(contract.candidateState.documentationComplete, false, "prose remains post-acceptance");
same(contract.acceptanceBoundary.documentationReconstructionUnblocked, false, "#1585 still blocked");
same(contract.implementation.acceptedRuntime, "mts-contract/v0.13", "accepted runtime remains v0.13");
same(contract.implementation.candidateRuntimeSelectable, false, "candidate runtime not selectable");
same(contract.implementation.productionBehaviorChanged, false, "candidate convergence changes no production behavior");
same(contract.implementation.singleLiveSemanticRuntime, true, "single live runtime retained");

same(
  policy.packs["contract-conformance"].current.contract.path,
  "contracts/mts-contract-v0.13.json",
  "policy current remains v0.13",
);
same(
  acceptance13.current.contract,
  "contracts/mts-contract-v0.13.json",
  "accepted cutover current remains v0.13",
);
assert(!existsSync(join(repoRoot, "cutover/typescript-c1-acceptance-v0.7.json")), "no v0.14 cutover exists");

console.log([
  "MTS v0.14 N18: HISTORICAL_READINESS_SUPERSEDED=GREEN",
  "SUPERSEDED_BY=N20C_1677",
  "OLD_FREEZE_1668_ACCEPTABLE=FALSE",
  "LAW_COUNT=14",
  "REQUIRED_GATE_COUNT=69",
  "CONTEXT_RELATIVE_A4_PRIME=TRUE",
  "N20C_PREACCEPTANCE_CLOSURE=GREEN",
  "POST_N20C_INDEPENDENT_READINESS=PENDING",
  "ACCEPTANCE_READY=FALSE",
  "V014_ACCEPTED=FALSE",
].join(" "));
