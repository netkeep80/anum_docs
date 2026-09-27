import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Memory, ensureRootBasis } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 A75 cutover: " + message);
}
function negativeVector(id: string, condition: boolean): void {
  assert(condition, "negative vector failed: " + id);
}
const root = resolve(process.cwd(), "..");
const readJson = (path: string): any =>
  JSON.parse(readFileSync(resolve(root, path), "utf8"));

const contract = readJson("contracts/mts-contract-v0.14.json");
const conformance = readJson("contracts/mts-conformance-v0.14.json");
const traceability = readJson("traceability/mts-v0.14.json");
const requirements = readJson("requirements/mts-v0.14.json");
const acceptance = readJson("cutover/typescript-c1-acceptance-v0.7.json");
const previousAcceptance = readJson("cutover/typescript-c1-acceptance-v0.6.json");
const policy = readJson("repo-policy.json");

const memory = new Memory();
const basis = ensureRootBasis(memory);
assert(memory.ensure(basis.O, basis.C) === basis.L, "live kernel L remains canonical");
assert(memory.ensure(basis.C, basis.O) === basis.U, "live kernel U remains canonical");

assert(contract.status === "accepted" && contract.accepted === true, "v0.14 contract accepted");
assert(conformance.status === "accepted" && conformance.accepted === true, "v0.14 conformance accepted");
assert(traceability.status === "accepted" && traceability.accepted === true, "v0.14 traceability accepted");
assert(contract.acceptanceReady === true && conformance.acceptanceReady === true, "readiness retained");
assert(conformance.requiredExecutableGates.length === 70, "70 mandatory gates retained");
assert(conformance.plannedExecutableGates.length === 0, "no planned gates");
assert(contract.implementation.acceptedRuntime === "mts-contract/v0.14", "accepted runtime rotated");
assert(contract.implementation.singleLiveSemanticRuntime === true, "single live runtime");
assert(contract.implementation.candidateRuntimeSelectable === false, "candidate runtime remains nonselectable");

assert(policy.packs["contract-conformance"].current.contract.path === "contracts/mts-contract-v0.14.json", "policy current v0.14");
assert(policy.packs["contract-conformance"].previous.contract.path === "contracts/mts-contract-v0.13.json", "policy previous v0.13");
assert(policy.packs["contract-conformance"].acceptance.document.path === "cutover/typescript-c1-acceptance-v0.7.json", "policy acceptance v0.7");
assert(acceptance.schema === "typescript-c1-acceptance/v0.7", "acceptance schema");
assert(acceptance.decision === "ACCEPT_MTS_V0_14", "explicit decision");
assert(acceptance.current.contract === "contracts/mts-contract-v0.14.json", "manifest current contract");
assert(acceptance.current.conformance === "contracts/mts-conformance-v0.14.json", "manifest current conformance");
assert(acceptance.previousReleaseEvidence.contract === "contracts/mts-contract-v0.13.json", "manifest previous contract");
assert(acceptance.previousReleaseEvidence.acceptance === "cutover/typescript-c1-acceptance-v0.6.json", "manifest previous acceptance");
assert(acceptance.evidence.preAcceptanceReadyMainSha === "05c4bf3362b559d67dafd2892b937f14c2b89f18", "frozen candidate SHA");
assert(acceptance.evidence.authorDecisionComment === 5858021017, "author decision witness");
assert(acceptance.evidence.mandatoryExecutableGateCount === 70, "manifest gate count");
assert(acceptance.acceptance.cutoverPerformed === true, "cutover performed");
assert(acceptance.acceptance.explicitAuthorDecisionRecordedBeforeCutover === true, "decision precedes cutover");
assert(contract.acceptanceBoundary.documentationReconstructionUnblocked === true, "post-acceptance docs unblocked");

function mapped(id: string): boolean {
  if (!conformance.requiredNegativeVectors.includes(id)) return false;
  const gates = new Set<string>(conformance.requiredExecutableGates);
  return Object.values(traceability.invariants as Record<string, any>).some((invariant: any) =>
    (invariant.negative?.requiredNegativeVectors ?? []).includes(id)
      && (invariant.requiredExecutableGates ?? []).some((gate: string) => gates.has(gate)),
  );
}

negativeVector("v014-local-unordered-collapses-o-c-l-u-and-orientation-orbit", mapped("v014-local-unordered-collapses-o-c-l-u-and-orientation-orbit"));
negativeVector("v014-raw-inr-outr-presence-is-not-orientation-authority", mapped("v014-raw-inr-outr-presence-is-not-orientation-authority"));
negativeVector("v014-recursive-alphabet-is-not-anum-q-alphabet", mapped("v014-recursive-alphabet-is-not-anum-q-alphabet"));
negativeVector("v014-q14-rejects-legacy-1-0-source", mapped("v014-q14-rejects-legacy-1-0-source"));
negativeVector("v014-q13-rejects-t-f-source", mapped("v014-q13-rejects-t-f-source"));
negativeVector("v014-mixed-q13-q14-source-rejected", mapped("v014-mixed-q13-q14-source-rejected"));
negativeVector("v014-successful-empty-is-not-nat-zero-or-no-relation", mapped("v014-successful-empty-is-not-nat-zero-or-no-relation"));
negativeVector("v014-ambient-nat-membership-is-not-canonical-authority", mapped("v014-ambient-nat-membership-is-not-canonical-authority"));
negativeVector("v014-ambient-add-link-is-not-canonical-proof-authority", mapped("v014-ambient-add-link-is-not-canonical-proof-authority"));
negativeVector("v014-forged-add-constructor-cannot-witness-functionality", mapped("v014-forged-add-constructor-cannot-witness-functionality"));
negativeVector("v014-forged-add-constructor-cannot-witness-le", mapped("v014-forged-add-constructor-cannot-witness-le"));
negativeVector("v014-legacy-succ-u-equals-l-rejected", mapped("v014-legacy-succ-u-equals-l-rejected"));
negativeVector("v014-candidate-does-not-change-current-accepted-pointer",
  previousAcceptance.current.contract === "contracts/mts-contract-v0.13.json"
    && acceptance.evidence.preAcceptanceReadyMainSha === "05c4bf3362b559d67dafd2892b937f14c2b89f18"
    && acceptance.evidence.authorDecisionComment === 5858021017);
negativeVector("v014-global-selected-w-required-rejected", mapped("v014-global-selected-w-required-rejected"));
negativeVector("v014-exact-sequence-is-not-orientation-authority", mapped("v014-exact-sequence-is-not-orientation-authority"));
negativeVector("v014-four-recursive-forms-are-not-primitive-opcodes", mapped("v014-four-recursive-forms-are-not-primitive-opcodes"));
negativeVector("v014-anum-exact-sequence-is-not-fold-denotation", mapped("v014-anum-exact-sequence-is-not-fold-denotation"));
negativeVector("v014-recursive-codec-is-not-anum-carrier", mapped("v014-recursive-codec-is-not-anum-carrier"));
negativeVector("v014-representation-layer-does-not-create-ontology-sort", mapped("v014-representation-layer-does-not-create-ontology-sort"));

const requirementIds = requirements.requirements.map((item: any) => String(item.id)).sort();
const lawIds = Object.keys(contract.requiredSemanticLaws).sort();
const ownerKeys = requirements.requirements.map(
  (item: any) => String(item.docProjection?.path) + "#" + String(item.docProjection?.anchor),
);
negativeVector("v014-accepted-law-without-doc-owner-rejected",
  requirements.status === "accepted"
    && JSON.stringify(requirementIds) === JSON.stringify(lawIds)
    && new Set(ownerKeys).size === ownerKeys.length
    && ownerKeys.every((key: string) => !key.includes("undefined")));

console.log([
  "MTS v0.14 A75: ACCEPTANCE_CUTOVER=GREEN",
  "CURRENT=v0.14",
  "PREVIOUS=v0.13",
  "LAW_COUNT=14",
  "REQUIRED_GATE_COUNT=70",
  "AUTHOR_DECISION=5858021017",
  "DOC_RECONSTRUCTION_1585=UNBLOCKED",
].join(" "));
