// mts-version-evidence: candidate-from=0.14
// research-owner: #1677
// Candidate traceability audit. This gate is fail-closed and does not accept v0.14.

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
const contract = json(join(repoRoot, "contracts/mts-contract-v0.14.json"));
const conformance = json(join(repoRoot, "contracts/mts-conformance-v0.14.json"));
const traceability = json(join(repoRoot, "traceability/mts-v0.14.json"));
const requirements = json(join(repoRoot, "requirements/mts-v0.14.json"));
const policy = json(join(repoRoot, "repo-policy.json"));
const acceptance13 = json(join(repoRoot, "cutover/typescript-c1-acceptance-v0.6.json"));

// Mandatory semantic audit remains attached to the real kernel.
const kernel = new Memory();
const basis = ensureRootBasis(kernel);
assert(basis.R !== basis.O && basis.O !== basis.C, "live kernel RootBasis remains proper");
assert(kernel.ensure(basis.O, basis.C) === basis.L, "live kernel L remains canonical");
assert(kernel.ensure(basis.C, basis.O) === basis.U, "live kernel U remains canonical");

assert(text(contract.schema, "contract schema") === "mts-contract/v0.14", "contract identity");
assert(text(conformance.schema, "conformance schema") === "mts-conformance/v0.14", "conformance identity");
assert(text(traceability.schema, "traceability schema") === "mts-traceability/v0.2", "traceability identity");
assert(bool(contract.accepted, "contract accepted") === false, "candidate contract remains nonaccepted");
assert(bool(conformance.accepted, "conformance accepted") === false, "candidate conformance remains nonaccepted");
assert(bool(traceability.accepted, "traceability accepted") === false, "candidate traceability remains nonaccepted");
assert(bool(contract.acceptanceReady, "contract readiness") === false, "N20c requires fresh readiness audit");
assert(bool(conformance.acceptanceReady, "conformance readiness") === false, "N20c conformance requires fresh readiness audit");
assert(bool(traceability.acceptanceReady, "traceability readiness") === false, "N20c traceability requires fresh readiness audit");
assert(traceability.acceptance === null, "candidate traceability has no acceptance manifest");

const laws = record(contract.requiredSemanticLaws, "contract laws");
const invariants = record(traceability.invariants, "traceability invariants");
sameSet(Object.keys(invariants), Object.keys(laws), "traceability invariant identity equals law identity");
assert(Object.keys(laws).length === 14, "N20c law count is 14");

const requirementList = requirements.requirements;
assert(Array.isArray(requirementList), "v0.14 requirements registry");
const requirementIds = (requirementList as JsonRecord[]).map((item) => text(item.id, "requirement id"));
sameSet(requirementIds, Object.keys(laws), "one requirement projection per v0.14 law");

const positiveAuthority = new Set(strings(conformance.requiredPositiveVectors, "required positive vectors"));
const negativeAuthority = new Set(strings(conformance.requiredNegativeVectors, "required negative vectors"));
const gateAuthority = new Set(strings(conformance.requiredExecutableGates, "required executable gates"));

for (const id of Object.keys(laws).sort()) {
  const invariant = record(invariants[id], id + " invariant");
  const pointer = text(invariant.contractPointer, id + " contract pointer");
  assert(pointer === "/requiredSemanticLaws/" + id, id + " exact law pointer");
  assert(resolvePointer(contract, pointer) === laws[id], id + " pointer resolves exact law");

  const positive = record(invariant.positive, id + " positive");
  const positiveVectors = strings(positive.requiredPositiveVectors, id + " positive vectors");
  assert(positiveVectors.length > 0, id + " has positive evidence");
  subset(positiveVectors, positiveAuthority, id + " positive outside authority");

  const negative = record(invariant.negative, id + " negative");
  subset(strings(negative.requiredNegativeVectors, id + " negative vectors"), negativeAuthority, id + " negative outside authority");

  const gates = strings(invariant.requiredExecutableGates, id + " gates");
  assert(gates.length > 0, id + " has executable evidence");
  subset(gates, gateAuthority, id + " gate outside authority");
  for (const gate of gates) assert(existsSync(join(repoRoot, gate)), id + " missing gate " + gate);

  const owner = record(invariant.documentationOwner, id + " documentation owner");
  assert(text(owner.registry, id + " owner registry") === "requirements/mts-v0.14.json", id + " owner registry");
  assert(existsSync(join(repoRoot, text(owner.path, id + " owner path"))), id + " owner document exists");
}

assert(
  text(record(invariants["V14-L12"], "V14-L12").status, "V14-L12 status") ===
    "GREEN_AUTHOR_REFINED_CONTEXT_RELATIVE",
  "A4' context-relative decision projected",
);

const candidateState = record(contract.candidateState, "candidate state");
assert(bool(candidateState.foundationOrientationFinalChoiceComplete, "A4 choice") === true, "A4 context choice complete");
assert(bool(candidateState.traceabilityComplete, "traceability") === true, "traceability complete");
assert(bool(candidateState.documentationOwnershipMapComplete, "doc owners") === true, "doc ownership complete");
assert(bool(candidateState.readinessAuditComplete, "readiness audit") === false, "post-N20c readiness audit remains pending");
assert(bool(candidateState.explicitAuthorAcceptanceRecorded, "author acceptance") === false, "author acceptance absent");

const blockers = record(conformance.blockers, "conformance blockers");
assert(text(blockers.a4FinalChoice, "A4 blocker") === "GREEN_CONTEXT_RELATIVE_AUTHOR_REFINED", "A4 blocker closed by context-relative result");
assert(text(blockers.traceability, "traceability blocker") === "GREEN_CANDIDATE", "traceability candidate green");
assert(text(blockers.readinessAudit, "readiness blocker") === "BLOCKING_PENDING_POST_N20C_REAUDIT", "fresh readiness audit required");
assert(text(blockers.explicitAuthorAcceptance, "acceptance blocker") === "BLOCKING_PENDING", "explicit acceptance still required");

const planned = strings(conformance.plannedExecutableGates, "planned gates");
assert(planned.length === 1, "exactly one planned readiness gate remains");
assert(planned[0] === "pending:v014-post-n20c-independent-readiness-audit", "correct readiness pending token");

const current = record(record(policy.packs, "policy packs")["contract-conformance"], "contract pack");
const currentPair = record(current.current, "current pair");
assert(text(record(currentPair.contract, "current contract").path, "current contract path") === "contracts/mts-contract-v0.13.json", "repo-policy current remains v0.13");
assert(text(record(currentPair.conformance, "current conformance").path, "current conformance path") === "contracts/mts-conformance-v0.13.json", "repo-policy conformance remains v0.13");

const acceptedCurrent = record(acceptance13.current, "accepted current");
assert(text(acceptedCurrent.contract, "accepted contract") === "contracts/mts-contract-v0.13.json", "cutover current contract remains v0.13");
assert(text(acceptedCurrent.conformance, "accepted conformance") === "contracts/mts-conformance-v0.13.json", "cutover current conformance remains v0.13");
assert(!existsSync(join(repoRoot, "cutover/typescript-c1-acceptance-v0.7.json")), "no v0.14 cutover exists");

console.log([
  "MTS v0.14 N20c: CANDIDATE_TRACEABILITY=GREEN",
  "LAW_COUNT=14",
  "CONTEXT_RELATIVE_A4_PRIME=TRUE",
  "CONTRACT_POINTERS_RESOLVE=TRUE",
  "EVIDENCE_VECTORS_RESOLVE=TRUE",
  "EXECUTABLE_GATES_RESOLVE=TRUE",
  "DOCUMENTATION_OWNER_MAP=GREEN",
  "READINESS_AUDIT=BLOCKING_PENDING_POST_N20C_REAUDIT",
  "ACCEPTANCE_READY=FALSE",
  "V014_ACCEPTED=FALSE",
  "V013_CURRENT_POINTER_UNCHANGED=TRUE",
].join(" "));
