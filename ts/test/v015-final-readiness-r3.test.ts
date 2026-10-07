// mts-version-evidence: candidate-v0.15-final-readiness-r3
// owner: #1876
// integration-owner: #2007

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Json = Record<string, unknown>;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 final readiness R3: " + message);
}
function record(value: unknown, message: string): Json {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), message);
  return value as Json;
}
function text(value: unknown, message: string): string {
  assert(typeof value === "string" && value.length > 0, message);
  return value;
}

const root = resolve(process.cwd(), "..");
const requirements = JSON.parse(readFileSync(join(root, "requirements/mts-v0.15.json"), "utf8")) as Json;
const traceability = JSON.parse(readFileSync(join(root, "traceability/mts-v0.15.json"), "utf8")) as Json;
const readiness = JSON.parse(readFileSync(join(root, "formal/v0.15/evidence/final-readiness-r3.json"), "utf8")) as Json;
const governance = JSON.parse(readFileSync(join(root, "formal/v0.15/evidence/governance-merge-enforcement-g1.json"), "utf8")) as Json;
const historicalAudit = JSON.parse(readFileSync(join(root, "formal/v0.15/evidence/readiness-audit-r2.json"), "utf8")) as Json;

assert(text(readiness.schema, "schema") === "mts-v015-final-readiness/v0.1", "final readiness schema");
assert(text(readiness.status, "status") === "RELEASE_READY_AWAITING_AUTHOR_DECISION", "release-ready status");
assert(text(readiness.auditBasis, "audit basis") === "75076ba241c28bc3327647d2a1c4cbf7611ad51b", "exact post-S20 audit basis");

assert(requirements.status === "candidate", "requirements remain candidate");
assert(requirements.accepted === true, "requirements accepted by S22");
assert(requirements.acceptanceReady === true, "requirements are acceptance-ready");
assert(traceability.status === "candidate", "trace remains candidate");
assert(traceability.accepted === true, "trace accepted by S22");
assert(traceability.acceptanceReady === true, "trace is acceptance-ready");
assert(text(traceability.releaseState, "releaseState") === "ACCEPTED", "trace release state");

const current = record(requirements.currentAccepted, "current accepted");
assert(text(current.mtsVersion, "current accepted version") === "v0.15", "v0.15 current after Author decision");

const list = requirements.requirements;
assert(Array.isArray(list), "requirements list");
const mandatory = (list as Json[]).filter((item) => item.mandatory !== false);
assert(mandatory.length === 48, "48 mandatory requirements");
const byId = new Map(mandatory.map((item) => [text(item.id, "id"), item]));

const ready1 = byId.get("V15-READY-01");
const ready2 = byId.get("V15-READY-02");
const ready3 = byId.get("V15-READY-03");
assert(ready1 !== undefined && text(ready1.state, "READY-01") === "RELEASE_READY", "READY-01 release-ready");
assert(ready2 !== undefined && text(ready2.state, "READY-02") === "RELEASE_READY", "READY-02 release-ready");
assert(ready3 !== undefined && text(ready3.state, "READY-03") === "ACCEPTED", "READY-03 accepted by explicit Author decision");

const counts = mandatory.reduce<Record<string, number>>((out, item) => {
  const state = text(item.state, "state");
  out[state] = (out[state] ?? 0) + 1;
  return out;
}, {});
assert(counts.COMPONENT_GREEN === 41, "41 component-green");
assert(counts.VERTICAL_GREEN === 4, "4 vertical-green");
assert(counts.RELEASE_READY === 2, "2 release-ready");
assert(counts.ACCEPTED === 1, "one accepted Author gate");
assert((counts.OPEN ?? 0) === 0, "no OPEN requirements after S22");
assert(
  mandatory.filter((item) => item.state === "OPEN").length === 0,
  "no Author-decision requirement remains OPEN after S22",
);

const traced = record(traceability.requirements, "trace requirements");
for (const item of mandatory) {
  const id = text(item.id, "id");
  assert(text(record(traced[id], id + " trace").state, id + " trace state") === text(item.state, id + " state"), id + " state parity");
}

const govAcceptance = record(governance.acceptance, "governance acceptance");
assert(govAcceptance.governanceSatisfied === true, "governance is satisfied");
assert(govAcceptance.mtsV015Accepted === false, "governance cannot accept MTS");
const red = record(record(governance.falsifier, "governance falsifier").redMergeAttempt, "red merge");
assert(text(red.result, "red merge result") === "BLOCKED" && Number(red.httpStatus) === 405, "RED merge mechanically blocked");

assert(text(historicalAudit.status, "historical S19 status") === "AUDIT_COMPLETE_BLOCKED_BY_GOVERNANCE", "S19 remains historical");
assert(text(record(historicalAudit.conclusion, "historical conclusion").operationalMergeGovernance, "historical governance") === "BLOCKED", "S19 historical blocker preserved");

const conclusion = record(readiness.conclusion, "final conclusion");
for (const key of [
  "semanticExecutionCore",
  "formalJsonCompiler",
  "externalAssurance",
  "approvedExecutableCorpus",
  "generatedFormalSpecification",
  "activeTraceIntegrity",
  "operationalMergeGovernance",
  "crossRepositoryFreeze",
]) {
  assert(text(conclusion[key], key) === "GREEN", key + " is GREEN");
}
assert(conclusion.releaseReady === true, "release-ready conclusion");
assert(conclusion.authorAcceptanceReady === true, "Author acceptance-ready conclusion");
assert(conclusion.accepted === false, "final readiness does not accept the version");

const unresolved = record(
  record(readiness.unresolvedExcludedResearch, "unresolved research").sequenceCarrierSourceProvenance,
  "sequence carrier",
);
assert(text(unresolved.status, "sequence carrier status") === "AUTHOR_REVIEW_REQUIRED", "sequence carrier remains unresolved");
assert(unresolved.silentlyAccepted === false, "sequence carrier not silently accepted");
assert(unresolved.releaseBlocking === false, "excluded sequence-carrier research is not in compact v0.15 release kernel");

const corpus = record(traceability.approvedJsonCorpus, "approved corpus");
assert(Array.isArray(corpus.entries) && corpus.entries.length === 6, "six Author-approved executable artifacts");

for (const path of [
  "profiles/mts-v015-meta-interpreter-kernel.json",
  "profiles/mts-v015-generalized-reaction-candidate.json",
  "proofs/v015-external-proof-assurance.json",
  "proofs/v015-formal-proof-assurance.json",
  "formal/v0.15/evidence/governance-merge-enforcement-g1.json",
  "formal/v0.15/evidence/readiness-audit-r2.json",
  "docs/specs/Формальная нотация МТС.md",
]) {
  assert(existsSync(join(root, path)), "final evidence exists: " + path);
}

const generated = readFileSync(join(root, "docs/specs/Формальная нотация МТС.md"), "utf8");
assert(generated.includes("COMPONENT_GREEN        = 41"), "generated FORMAL component count");
assert(generated.includes("VERTICAL_GREEN         = 4"), "generated FORMAL vertical count");
assert(generated.includes("RELEASE_READY          = 2"), "generated FORMAL release-ready count");
assert(generated.includes("OPEN                   = 0"), "generated FORMAL open count");
assert(generated.includes("acceptance ready       = true"), "generated FORMAL acceptance-ready flag");
assert(generated.includes("accepted               = true"), "generated FORMAL accepted");
assert(generated.includes("current accepted       = v0.15"), "generated FORMAL current accepted version");

const gate = record(readiness.finalAuthorGate, "final Author gate");
assert(gate.required === true && text(gate.decision, "Author decision") === "PENDING", "explicit Author decision remains pending");

console.log(
  "MTS_V015_FINAL_READINESS_R3=RELEASE_READY_AWAITING_AUTHOR_DECISION " +
  "COMPONENT_GREEN=41 VERTICAL_GREEN=4 RELEASE_READY=2 OPEN=1 " +
  "ACCEPTANCE_READY=TRUE ACCEPTED=FALSE CURRENT_ACCEPTED=v0.14 AUTHOR_GATE=V15-READY-03",
);
