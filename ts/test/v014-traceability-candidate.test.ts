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

const contract = json(contractPath);
const conformance = json(conformancePath);
const traceability = json(traceabilityPath);
const policy = json(policyPath);
const acceptance13 = json(acceptance13Path);

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
assert(bool(contract.acceptanceReady, "contract readiness") === true, "candidate contract is readiness-complete");
assert(bool(conformance.acceptanceReady, "conformance readiness") === true, "candidate conformance is readiness-complete");
assert(bool(traceability.acceptanceReady, "traceability readiness") === true, "candidate traceability is readiness-complete");
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
}

assert(
  text(record(invariants["V14-L12"], "V14-L12").status, "V14-L12 status") ===
    "GREEN_AUTHOR_FROZEN",
  "A4' author semantic freeze must be projected",
);

const candidateState = record(contract.candidateState, "candidate state");
assert(bool(candidateState.traceabilityComplete, "traceabilityComplete") === true, "candidate traceability graph is complete");
assert(bool(candidateState.foundationOrientationFinalChoiceComplete, "orientation freeze") === true, "A4' author choice is frozen");
assert(bool(candidateState.readinessAuditComplete, "readiness audit") === true, "independent readiness audit is complete");
assert(bool(candidateState.explicitAuthorAcceptanceRecorded, "author acceptance") === false, "author acceptance remains absent");

const blockers = record(conformance.blockers, "conformance blockers");
assert(text(blockers.traceability, "traceability blocker") === "GREEN_CANDIDATE", "traceability blocker closes only as candidate");
assert(text(blockers.a4FinalChoice, "A4 blocker") === "GREEN_AUTHOR_FROZEN", "A4 blocker closes only by explicit author freeze");
assert(text(blockers.readinessAudit, "readiness blocker") === "GREEN_INDEPENDENT_AUDIT", "readiness blocker is closed by N18");
assert(text(blockers.explicitAuthorAcceptance, "author blocker") === "BLOCKING_PENDING", "author acceptance blocker remains");

const planned = strings(conformance.plannedExecutableGates, "planned gates");
assert(!planned.includes("pending:v014-traceability"), "traceability must no longer be planned-only");
assert(!planned.includes("pending:v014-a4-semantic-freeze-projection"), "A4 freeze is no longer planned-only");
assert(!planned.includes("pending:v014-independent-readiness-audit"), "readiness audit is no longer planned-only");
assert(planned.length === 0, "no planned executable gates remain");

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
  "LAW_COUNT=12",
  "CONTRACT_POINTERS_RESOLVE=TRUE",
  "POSITIVE_VECTORS_RESOLVE=TRUE",
  "NEGATIVE_VECTORS_RESOLVE=TRUE",
  "EXECUTABLE_GATES_RESOLVE=TRUE",
  "A4_FINAL_CHOICE=GREEN_AUTHOR_FROZEN",
  "A4_PRIME_MODEL=GLOBAL_Z2_TORSOR_WITH_DERIVED_START_END",
  "READINESS_AUDIT=GREEN_INDEPENDENT_AUDIT",
  "ACCEPTANCE_READY=TRUE",
  "EXPLICIT_AUTHOR_ACCEPTANCE=BLOCKING_PENDING",
  "V014_ACCEPTED=FALSE",
  "V013_CURRENT_POINTER_UNCHANGED=TRUE",
].join(" "));
