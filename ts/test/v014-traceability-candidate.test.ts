// research-owner: #1658
// Candidate traceability audit. This gate remains fail-closed and does not accept v0.14.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Memory, ensureRootBasis } from "../src/memory.js";

type JsonRecord = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 candidate traceability: " + message);
}
function record(value: unknown, message: string): JsonRecord {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), message);
  return value as JsonRecord;
}
function strings(value: unknown, message: string): readonly string[] {
  assert(Array.isArray(value) && value.every((item) => typeof item === "string"), message);
  return value as readonly string[];
}
function text(value: unknown, message: string): string {
  assert(typeof value === "string", message);
  return value;
}
function bool(value: unknown, message: string): boolean {
  assert(typeof value === "boolean", message);
  return value;
}
function json(path: string): JsonRecord {
  return JSON.parse(readFileSync(path, "utf8")) as JsonRecord;
}
function resolvePointer(root: unknown, pointer: string): unknown {
  assert(pointer.startsWith("/"), "pointer must start with /: " + pointer);
  let current: unknown = root;
  for (const encoded of pointer.slice(1).split("/")) {
    assert(!/~(?:[^01]|$)/.test(encoded), "invalid JSON Pointer escape: " + pointer);
    const token = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    const owner = record(current, "unresolved JSON Pointer: " + pointer);
    assert(Object.prototype.hasOwnProperty.call(owner, token), "unresolved JSON Pointer: " + pointer);
    current = owner[token];
  }
  return current;
}
function sameSet(actual: readonly string[], expected: readonly string[], message: string): void {
  const a = [...new Set(actual)].sort();
  const e = [...new Set(expected)].sort();
  assert(a.length === actual.length, message + ": duplicate actual values");
  assert(e.length === expected.length, message + ": duplicate expected values");
  assert(JSON.stringify(a) === JSON.stringify(e), message);
}
function subset(values: readonly string[], authority: ReadonlySet<string>, message: string): void {
  for (const value of values) assert(authority.has(value), message + ": " + value);
}

const repoRoot = resolve(process.cwd(), "..");
const contractPath = join(repoRoot, "contracts/mts-contract-v0.14.json");
const conformancePath = join(repoRoot, "contracts/mts-conformance-v0.14.json");
const traceabilityPath = join(repoRoot, "traceability/mts-v0.14.json");
const policyPath = join(repoRoot, "repo-policy.json");
const acceptance13Path = join(repoRoot, "cutover/typescript-c1-acceptance-v0.6.json");
const requirements14Path = join(repoRoot, "requirements/mts-v0.14.json");

const contract = json(contractPath);
const conformance = json(conformancePath);
const traceability = json(traceabilityPath);
const policy = json(policyPath);
const acceptance13 = json(acceptance13Path);
const requirements14 = json(requirements14Path);

// This audit is still attached to the live @mts/core kernel rather than being
// a paper-only JSON assertion.
const kernel = new Memory();
const basis = ensureRootBasis(kernel);
assert(basis.R !== basis.O && basis.O !== basis.C, "live kernel RootBasis remains proper");

assert(text(contract.schema, "contract schema") === "mts-contract/v0.14", "contract identity");
assert(text(conformance.schema, "conformance schema") === "mts-conformance/v0.14", "conformance identity");
assert(text(traceability.schema, "traceability schema") === "mts-traceability/v0.2", "traceability schema");
assert(bool(contract.accepted, "contract accepted") === false, "candidate contract must remain nonaccepted");
assert(bool(conformance.accepted, "conformance accepted") === false, "candidate conformance must remain nonaccepted");
assert(bool(traceability.accepted, "traceability accepted") === false, "candidate traceability must remain nonaccepted");
assert(bool(contract.acceptanceReady, "contract readiness") === false, "N20/N20b invalidates previous readiness");
assert(bool(conformance.acceptanceReady, "conformance readiness") === false, "N20b conformance awaits re-audit");
assert(bool(traceability.acceptanceReady, "traceability readiness") === false, "N20b traceability awaits re-audit");
assert(traceability.acceptance === null, "candidate traceability must not claim an acceptance manifest");

assert(
  text(contract.traceabilityManifest, "contract traceability manifest") === "traceability/mts-v0.14.json",
  "contract must point to candidate traceability",
);
assert(
  text(conformance.traceabilityManifest, "conformance traceability manifest") === "traceability/mts-v0.14.json",
  "conformance must point to candidate traceability",
);

const laws = record(contract.requiredSemanticLaws, "contract laws");
const invariants = record(traceability.invariants, "traceability invariants");
sameSet(Object.keys(invariants), Object.keys(laws), "traceability invariant identity must equal contract law identity");

const positiveAuthority = new Set(strings(conformance.requiredPositiveVectors, "required positive vectors"));
const negativeAuthority = new Set(strings(conformance.requiredNegativeVectors, "required negative vectors"));
const gateAuthority = new Set(strings(conformance.requiredExecutableGates, "required executable gates"));
const traceabilityGate = "ts/test/v014-traceability-candidate.test.ts";
assert(gateAuthority.has(traceabilityGate), "traceability audit itself must be a required candidate gate");
const requirementEntries = record(requirements14, "v0.14 requirement registry");
const requirementList = requirementEntries.requirements;
assert(Array.isArray(requirementList), "v0.14 requirement registry entries");
const requirementsById = new Map((requirementList as JsonRecord[]).map((item) => [text(item.id, "requirement id"), item] as const));
sameSet([...requirementsById.keys()], Object.keys(laws), "every law has exactly one predeclared documentation owner");

for (const id of Object.keys(laws).sort()) {
  const invariant = record(invariants[id], id + " invariant");
  const pointer = text(invariant.contractPointer, id + " contract pointer");
  assert(pointer === "/requiredSemanticLaws/" + id, id + " must point to its exact law");
  assert(resolvePointer(contract, pointer) === laws[id], id + " pointer must resolve to exact law value");

  const positive = record(invariant.positive, id + " positive");
  const positiveVectors = strings(positive.requiredPositiveVectors, id + " positive vectors");
  assert(positiveVectors.length > 0, id + " must have positive evidence vectors");
  subset(positiveVectors, positiveAuthority, id + " positive vector outside conformance authority");

  const negative = record(invariant.negative, id + " negative");
  const negativeVectors = strings(negative.requiredNegativeVectors, id + " negative vectors");
  subset(negativeVectors, negativeAuthority, id + " negative vector outside conformance authority");

  const gates = strings(invariant.requiredExecutableGates, id + " gates");
  assert(gates.length > 0, id + " must have executable evidence");
  subset(gates, gateAuthority, id + " gate outside conformance authority");
  for (const gate of gates) assert(existsSync(join(repoRoot, gate)), id + " missing gate path: " + gate);

  const requirement = record(requirementsById.get(id), id + " requirement projection");
  const docProjection = record(requirement.docProjection, id + " doc projection");
  const docOwner = record(invariant.documentationOwner, id + " trace documentation owner");
  assert(text(docOwner.registry, id + " owner registry") === "requirements/mts-v0.14.json", id + " owner registry");
  assert(text(docOwner.path, id + " owner path") === text(docProjection.path, id + " projection path"), id + " owner path matches registry");
  assert(text(docOwner.anchor, id + " owner anchor") === text(docProjection.anchor, id + " projection anchor"), id + " owner anchor matches registry");
  assert(existsSync(join(repoRoot, text(docProjection.path, id + " projection path"))), id + " owner document exists");
}

assert(
  text(record(invariants["V14-L12"], "V14-L12").status, "V14-L12 status") ===
    "GREEN_AUTHOR_REFINED_N20B",
  "A4' context-relative author refinement must be projected",
);

const orientation = record(contract.foundationOrientation, "foundation orientation");
assert(bool(orientation.contextRelativeOrientation, "context-relative orientation") === true, "A4 prime is context-relative");
assert(bool(orientation.globalSelectedWitnessRequired, "global selected witness") === false, "global selected W is not authority");
const contextCarrier = record(orientation.contextOrientationCarrier, "Context orientation carrier");
assert(text(contextCarrier.kind, "Context carrier kind") === "ONE_SIDED_SELF_INCIDENCE_LINK", "Context carrier is Link-native one-sided self-incidence");
assert(bool(contextCarrier.exactSequenceDependency, "ExactSequence dependency") === false, "Context orientation does not depend on ExactSequence");
const relativeTransport = record(orientation.relativeTransport, "relative transport");
assert(text(relativeTransport.group, "transport group") === "Z2 = {Id,J}", "relative transport is Z2");
assert(text(relativeTransport.composition, "transport composition") === "g_AB ∘ g_BC = g_AC", "relative transport composition is explicit");

const candidateState = record(contract.candidateState, "candidate state");
assert(bool(candidateState.traceabilityComplete, "traceabilityComplete") === true, "candidate traceability graph is complete");
assert(bool(candidateState.foundationOrientationFinalChoiceComplete, "orientation freeze") === true, "A4' author choice is frozen");
assert(bool(candidateState.adversarialClosureComplete, "N20 adversarial closure") === true, "N20 closure is implemented");
assert(bool(candidateState.documentationOwnershipMapComplete, "documentation ownership map") === true, "v0.14 owner map is complete");
assert(bool(candidateState.a4ContextRelativeClosureComplete, "N20b A4 closure") === true, "context-relative A4 prime closure is implemented");
assert(bool(candidateState.a4GlobalSelectedWitnessModelSuperseded, "global selected-W supersession") === true, "global selected-W model is superseded");
assert(bool(candidateState.readinessAuditComplete, "readiness audit") === false, "post-N20b independent readiness audit remains pending");
assert(bool(candidateState.explicitAuthorAcceptanceRecorded, "author acceptance") === false, "author acceptance remains absent");

const blockers = record(conformance.blockers, "conformance blockers");
assert(text(blockers.traceability, "traceability blocker") === "GREEN_CANDIDATE", "traceability blocker closes only as candidate");
assert(text(blockers.a4FinalChoice, "A4 blocker") === "GREEN_AUTHOR_REFINED_CONTEXT_RELATIVE_N20B", "A4 blocker reflects context-relative N20b refinement");
assert(text(blockers.readinessAudit, "readiness blocker") === "BLOCKING_PENDING_POST_N20B_REAUDIT", "post-N20b readiness audit remains blocking");
assert(text(blockers.explicitAuthorAcceptance, "author blocker") === "BLOCKING_PENDING", "author acceptance blocker remains");

const planned = strings(conformance.plannedExecutableGates, "planned gates");
assert(!planned.includes("pending:v014-traceability"), "traceability must no longer be planned-only");
assert(!planned.includes("pending:v014-a4-semantic-freeze-projection"), "A4 freeze is no longer planned-only");
assert(!planned.includes("pending:v014-independent-readiness-audit"), "superseded N18 pending token is absent");
assert(!planned.includes("pending:v014-post-n20-independent-readiness-audit"), "superseded post-N20 audit token is absent");
assert(planned.includes("pending:v014-post-n20b-independent-readiness-audit"), "new post-N20b independent readiness audit is explicit");
assert(planned.length === 1, "exactly one planned executable gate remains");

const current = record(record(policy.packs, "policy packs")["contract-conformance"], "contract pack");
const currentPair = record(current.current, "current contract pair");
assert(
  text(record(currentPair.contract, "current contract").path, "current contract path") ===
    "contracts/mts-contract-v0.13.json",
  "repo-policy current contract remains v0.13",
);
assert(
  text(record(currentPair.conformance, "current conformance").path, "current conformance path") ===
    "contracts/mts-conformance-v0.13.json",
  "repo-policy current conformance remains v0.13",
);
const acceptedCurrent = record(acceptance13.current, "accepted current");
assert(text(acceptedCurrent.contract, "accepted contract") === "contracts/mts-contract-v0.13.json", "cutover current contract remains v0.13");
assert(text(acceptedCurrent.conformance, "accepted conformance") === "contracts/mts-conformance-v0.13.json", "cutover current conformance remains v0.13");
assert(!existsSync(join(repoRoot, "cutover/typescript-c1-acceptance-v0.7.json")), "N16 must not create a v0.14 cutover");

console.log([
  "MTS v0.14 N16: CANDIDATE_TRACEABILITY=GREEN",
  "INVARIANT_IDENTITY_EXACT=TRUE",
  "LAW_COUNT=14",
  "CONTRACT_POINTERS_RESOLVE=TRUE",
  "POSITIVE_VECTORS_RESOLVE=TRUE",
  "NEGATIVE_VECTORS_RESOLVE=TRUE",
  "EXECUTABLE_GATES_RESOLVE=TRUE",
  "A4_FINAL_CHOICE=GREEN_AUTHOR_REFINED_CONTEXT_RELATIVE_N20B",
  "A4_PRIME_MODEL=GLOBAL_Z2_TORSOR_WITH_CONTEXT_RELATIVE_LOCAL_FRAMES",
  "A4_CONTEXT_CARRIER=ONE_SIDED_SELF_INCIDENCE_LINK",
  "GLOBAL_SELECTED_W_REQUIRED=FALSE",
  "N20_ADVERSARIAL_CLOSURE=GREEN",
  "DOCUMENTATION_OWNER_MAP=GREEN",
  "READINESS_AUDIT=BLOCKING_PENDING_POST_N20B_REAUDIT",
  "ACCEPTANCE_READY=FALSE",
  "EXPLICIT_AUTHOR_ACCEPTANCE=BLOCKING_PENDING",
  "V014_ACCEPTED=FALSE",
  "V013_CURRENT_POINTER_UNCHANGED=TRUE",
].join(" "));
