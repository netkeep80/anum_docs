import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 C9 readiness audit: ${message}`);
}

const repoRoot = resolve(process.cwd(), "..");
const read = (path: string): string => readFileSync(join(repoRoot, path), "utf8");
const contract = JSON.parse(read("contracts/mts-contract-v0.12.json")) as any;
const conformance = JSON.parse(read("contracts/mts-conformance-v0.12.json")) as any;
const traceability = JSON.parse(read("traceability/mts-v0.12.json")) as any;
const acceptedContract = JSON.parse(read("contracts/mts-contract-v0.11.json")) as any;
const acceptedConformance = JSON.parse(read("contracts/mts-conformance-v0.11.json")) as any;
const acceptance12 = JSON.parse(read("cutover/typescript-c1-acceptance-v0.5.json")) as any;

const candidateLifecycle =
  contract.status === "candidate"
  && contract.accepted === false
  && conformance.status === "candidate"
  && conformance.accepted === false;
const acceptedLifecycle =
  contract.status === "accepted"
  && contract.accepted === true
  && conformance.status === "accepted"
  && conformance.accepted === true;
assert(candidateLifecycle || acceptedLifecycle, "v0.12 is either the ready candidate or the accepted release");
assert(contract.acceptanceReady === true, "v0.12 contract is acceptance-ready after C9");
if (candidateLifecycle) {
  assert(contract.implementation?.candidateRuntimeSelectable === false, "ready candidate remains non-selectable before cutover");
}
assert(contract.implementation?.implementationComplete === true, "declared candidate kernel scope remains complete");
assert(contract.candidateState?.publicFacadeComplete === true, "C7 public facade remains complete");
assert(contract.candidateState?.documentationComplete === true, "C8 documentation remains complete");
assert(contract.candidateState?.traceabilityComplete === true, "C8 traceability remains complete");


assert(conformance.acceptanceReady === true, "v0.12 conformance is acceptance-ready after C9");
assert(conformance.coverageState === "complete", "C9 establishes complete declared-scope coverage");
assert((conformance.plannedExecutableGates ?? []).length === 0, "no planned executable gates remain");
assert(conformance.evidenceState?.readinessC9 === "green-confirmed", "C9 is green-confirmed");
assert(
  candidateLifecycle
    ? conformance.evidenceState?.acceptanceC10 === "next"
    : conformance.evidenceState?.acceptanceC10 === "accepted",
  "C10 lifecycle projection matches candidate or accepted state",
);
assert(conformance.implementationSlices?.readinessAudit?.status === "green-confirmed", "readiness audit slice is complete");

const blockers = conformance.acceptanceBlockers ?? [];
if (candidateLifecycle) {
  assert(
    blockers.length === 1 && blockers[0] === "v0.12 has not passed explicit acceptance cutover",
    "only explicit C10 acceptance remains an acceptance blocker before cutover",
  );
} else {
  assert(blockers.length === 0, "accepted v0.12 has no acceptance blocker");
}
assert(!blockers.some((entry: string) => entry.includes("6/2")), "temporary contract budget debt is not a readiness/acceptance blocker");

assert(acceptedContract.schema === "mts-contract/v0.11", "accepted contract identity remains v0.11");
assert(acceptedContract.status === "accepted" && acceptedContract.accepted === true, "v0.11 contract remains accepted");
assert(acceptedConformance.schema === "mts-conformance/v0.11", "accepted conformance identity remains v0.11");
assert(acceptedConformance.status === "accepted" && acceptedConformance.accepted === true, "v0.11 conformance remains accepted");
const expectedCurrentContract = candidateLifecycle ? "mts-contract/v0.11" : "mts-contract/v0.12";
const expectedCurrentConformance = candidateLifecycle ? "mts-conformance/v0.11" : "mts-conformance/v0.12";
assert(contract.acceptedCurrent === expectedCurrentContract, "accepted-current contract pointer matches lifecycle");
assert(conformance.acceptedCurrent?.contract === expectedCurrentContract, "conformance current contract pointer matches lifecycle");
assert(conformance.acceptedCurrent?.conformance === expectedCurrentConformance, "conformance current corpus pointer matches lifecycle");

const marker = /\/\/ mts-version-evidence: required-from=(\d+)\.(\d+)/;
const mandatory = readdirSync(join(repoRoot, "ts/test"))
  .filter((name) => name.endsWith(".test.ts"))
  .filter((name) => {
    const source = readFileSync(join(repoRoot, "ts/test", name), "utf8");
    const match = marker.exec(source);
    if (match === null) return false;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    return major < 0 || (major === 0 && minor <= 12);
  })
  .map((name) => `ts/test/${name}`)
  .sort();

const declaredGates = [...(conformance.requiredExecutableGates ?? [])].sort();
for (const gate of mandatory) {
  assert(declaredGates.includes(gate), `required-from=0.12 kernel evidence is projected: ${gate}`);
}
for (const gate of declaredGates) {
  assert(existsSync(join(repoRoot, gate)), `declared executable gate exists: ${gate}`);
}

assert(traceability.schema === "mts-traceability/v0.2", "v0.12 traceability schema remains v0.2");
assert(traceability.contract === "contracts/mts-contract-v0.12.json", "traceability contract target is exact");
assert(traceability.conformance === "contracts/mts-conformance-v0.12.json", "traceability conformance target is exact");
assert(
  Object.keys(traceability.invariants ?? {}).sort().join("|") ===
    Object.keys(contract.requiredSemanticLaws ?? {}).sort().join("|"),
  "traceability invariant identity exactly matches required semantic laws",
);

assert(traceability.acceptance === "cutover/typescript-c1-acceptance-v0.5.json", "v0.12 traceability binds immutable acceptance");
assert(acceptance12.decision === "ACCEPT_MTS_V0_12", "v0.12 explicit acceptance decision");
assert(acceptance12.current?.contract === "contracts/mts-contract-v0.12.json", "v0.12 accepted current contract");
assert(acceptance12.current?.conformance === "contracts/mts-conformance-v0.12.json", "v0.12 accepted current conformance");
assert(acceptance12.previousReleaseEvidence?.contract === "contracts/mts-contract-v0.11.json", "v0.12 historical previous contract");
assert(acceptance12.previousReleaseEvidence?.conformance === "contracts/mts-conformance-v0.11.json", "v0.12 historical previous conformance");
assert(acceptance12.previousReleaseEvidence?.immutable === true, "v0.11 previous evidence is immutable");
assert(acceptance12.previousReleaseEvidence?.liveRuntimeSelectable === false, "v0.11 historical runtime is nonselectable");
assert(acceptance12.acceptance?.acceptanceReadyWasProvenBeforeCutover === true, "C9 readiness was proven before C10 cutover");
assert(acceptance12.acceptance?.explicitAuthorDecisionRecordedBeforeCutover === true, "explicit Author decision precedes cutover");
assert(acceptance12.evidence?.readinessIssue === 1222, "historical C9 readiness issue");
assert(acceptance12.evidence?.readinessPullRequest === 1226, "historical C9 readiness PR");
assert(acceptance12.evidence?.mandatoryExecutableGateCount === declaredGates.length, "accepted v0.12 gate count matches readiness evidence");
assert(conformance.implementationSlices?.readinessAudit?.status === "green-confirmed", "immutable v0.12 readiness audit remains green");
assert(conformance.implementationSlices?.acceptedCutover?.status === "accepted", "immutable v0.12 C10 cutover remains accepted");

console.log("MTS v0.12 C9 independent readiness audit: GREEN.");
