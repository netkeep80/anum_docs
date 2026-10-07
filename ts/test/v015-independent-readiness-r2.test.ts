// mts-version-evidence: candidate-v0.15-independent-readiness-s19
// owner: #1876
// integration-owner: #2007
//
// Independent clean-main release-readiness audit.
// Semantic/core evidence may be GREEN while operational merge governance remains blocking.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Json = Record<string, unknown>;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 readiness S19: " + message);
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

const root = resolve(process.cwd(), "..");
const requirements = JSON.parse(readFileSync(join(root, "requirements/mts-v0.15.json"), "utf8")) as Json;
const traceability = JSON.parse(readFileSync(join(root, "traceability/mts-v0.15.json"), "utf8")) as Json;
const audit = JSON.parse(readFileSync(join(root, "formal/v0.15/evidence/readiness-audit-r2.json"), "utf8")) as Json;

assert(text(audit.schema, "audit schema") === "mts-v015-independent-readiness-audit/v0.2", "clean-main audit schema");
assert(text(audit.ownerIssue, "audit owner") === "#1876", "audit owner");
assert(text(audit.integrationOwner, "integration owner") === "#2007", "integration owner");
assert(text(audit.auditBasis, "audit basis") === "653c9cff87c8a73c2853a2b17349d87003a2d48a", "exact post-S18 audit basis");
assert(text(audit.status, "audit status") === "AUDIT_COMPLETE_BLOCKED_BY_GOVERNANCE", "audit blocked by governance");

assert(requirements.status === "candidate", "v0.15 remains candidate");
assert(requirements.accepted === false, "v0.15 not accepted");
assert(requirements.acceptanceReady === false, "v0.15 not acceptance-ready");
assert(
  text(record(requirements.currentAccepted, "currentAccepted").mtsVersion, "current accepted version") === "v0.14",
  "v0.14 remains current",
);

const list = requirements.requirements;
assert(Array.isArray(list), "requirements list");
const mandatory = (list as Json[]).filter((item) => item.mandatory !== false);
assert(mandatory.length === 48, "exact mandatory requirement count");

const open = mandatory
  .filter((item) => text(item.state, "state") === "OPEN")
  .map((item) => text(item.id, "open id"))
  .sort();
const auditOpen = ["V15-GOV-04", "V15-READY-01", "V15-READY-02", "V15-READY-03"].sort();
const readinessIds = new Set(["V15-READY-01", "V15-READY-02", "V15-READY-03"]);
assert(open.every((id) => readinessIds.has(id)), "after S20 only readiness requirements may remain OPEN");

const allowedGreen = new Set(["COMPONENT_GREEN", "VERTICAL_GREEN"]);
for (const item of mandatory) {
  const id = text(item.id, "id");
  if (readinessIds.has(id) && text(item.state, id + " readiness state") === "OPEN") continue;
  assert(allowedGreen.has(text(item.state, id + " state")), id + " completed requirement is green");
}
const currentGov = mandatory.find((item) => item.id === "V15-GOV-04");
assert(currentGov !== undefined, "current GOV-04 exists");
assert(text(currentGov.state, "current GOV-04 state") === "COMPONENT_GREEN", "S20 governance remains green");

const traces = record(traceability.requirements, "trace requirements");
for (const item of mandatory) {
  const id = text(item.id, "id");
  const traced = record(traces[id], id + " trace");
  assert(
    text(traced.state, id + " trace state") === text(item.state, id + " requirement state"),
    id + " registry/trace parity",
  );
  for (const path of [
    ...strings(traced.requiredExecutableGates, id + " gates"),
    ...strings(traced.evidenceRefs, id + " refs"),
  ]) {
    if (path.startsWith("#") || path.includes("#")) continue;
    assert(existsSync(join(root, path)), id + " active evidence exists: " + path);
  }
}

const traceText = JSON.stringify(traceability);
for (const path of [
  "profiles/mts-v015-meta-interpreter-model.json",
  "ts/test/v015-structural-aset-meta-interpreter-a9.test.ts",
  "ts/test/v015-direct-sequential-association-a2.test.ts",
]) {
  assert(!traceText.includes(path), "obsolete research monolith absent from active authority: " + path);
}

const corpus = record(traceability.approvedJsonCorpus, "approved corpus");
assert(Array.isArray(corpus.entries) && corpus.entries.length === 6, "six Author-approved executable artifacts");
for (const raw of corpus.entries as Json[]) {
  const review = record(raw.authorJsonReview, "author review");
  assert(text(review.state, "approval state") === "APPROVED", "every executable JSON remains explicitly Author-approved");
  for (const field of ["formalSourceArtifact", "canonicalJsonArtifact"]) {
    const path = text(raw[field], field);
    assert(existsSync(join(root, path)), "approved corpus source exists: " + path);
  }
}

const generatedFormal = readFileSync(join(root, "docs/specs/Формальная нотация МТС.md"), "utf8");
assert(generatedFormal.includes("mts-generated-formal-notation"), "generated FORMAL marker present");
const currentStateCounts = mandatory.reduce<Record<string, number>>((counts, item) => {
  const state = text(item.state, "current requirement state");
  counts[state] = (counts[state] ?? 0) + 1;
  return counts;
}, {});
assert(
  generatedFormal.includes("COMPONENT_GREEN        = " + String(currentStateCounts.COMPONENT_GREEN ?? 0)),
  "generated FORMAL reports current component-green count",
);
assert(
  generatedFormal.includes("VERTICAL_GREEN         = " + String(currentStateCounts.VERTICAL_GREEN ?? 0)),
  "generated FORMAL reports current vertical-green count",
);
assert(
  generatedFormal.includes("OPEN                   = " + String(currentStateCounts.OPEN ?? 0)),
  "generated FORMAL reports current open count",
);
assert(generatedFormal.includes("profiles/mts-v015-meta-interpreter-kernel.json"), "compact kernel projected");
assert(!generatedFormal.includes("profiles/mts-v015-meta-interpreter-model.json"), "research meta-interpreter monolith not projected");

const kernel = JSON.parse(
  readFileSync(join(root, "profiles/mts-v015-meta-interpreter-kernel.json"), "utf8"),
) as Json;
assert(text(kernel.status, "kernel status") === "PRE_ACCEPTANCE_EXECUTION_AUTHORITY_CANDIDATE", "kernel remains pre-acceptance");
const authority = record(kernel.semanticAuthority, "kernel authority");
assert(authority.versionAccepted === false, "kernel cannot accept v0.15");
assert(authority.authorAcceptanceRequired === true, "kernel requires explicit Author acceptance");
assert(Array.isArray(kernel.unresolvedExcludedFromKernel), "kernel unresolved exclusions explicit");
const sequenceCarrier = (kernel.unresolvedExcludedFromKernel as Json[])
  .find((item) => item.id === "SEQUENCE_CARRIER_SOURCE_PROVENANCE");
assert(sequenceCarrier !== undefined, "sequence-carrier/source-provenance explicit");
assert(text(sequenceCarrier.status, "sequence carrier status") === "AUTHOR_REVIEW_REQUIRED", "sequence carrier remains unresolved");

const conclusion = record(audit.conclusion, "audit conclusion");
for (const key of [
  "semanticExecutionCore",
  "formalJsonCompiler",
  "externalAssurance",
  "approvedExecutableCorpus",
  "generatedFormalSpecification",
  "activeTraceIntegrity",
  "crossRepositoryFreeze",
]) {
  assert(text(conclusion[key], "audit " + key) === "GREEN", key + " audit green");
}
assert(text(conclusion.obsoleteResearchAuthority, "obsolete research authority") === "ABSENT", "obsolete research authority absent");
assert(text(conclusion.operationalMergeGovernance, "merge governance") === "BLOCKED", "merge governance blocked");
assert(conclusion.releaseReady === false, "audit does not claim release ready");
assert(conclusion.authorAcceptanceReady === false, "audit does not claim Author acceptance ready");

const snapshot = record(audit.requirementSnapshot, "requirement snapshot");
assert(Number(snapshot.mandatoryCount) === 48, "audit mandatory count");
assert(Number(snapshot.componentGreenCount) === 40, "audit component-green count");
assert(Number(snapshot.verticalGreenCount) === 4, "audit vertical-green count");
assert(JSON.stringify(strings(snapshot.open, "audit open").slice().sort()) === JSON.stringify(auditOpen), "historical S19 audit open set exact");
assert(
  JSON.stringify(strings(snapshot.nonReadinessBlockers, "non-readiness blockers")) === JSON.stringify(["V15-GOV-04"]),
  "governance only non-readiness blocker",
);

const live = record(audit.liveRepositorySnapshot, "live repository snapshot");
const amemory = record(live.amemory, "A-memory snapshot");
assert(text(amemory.main, "A-memory main") === "832daa89f15fd0f3b7b40819b6d3670c7fd57e7d", "A-memory frozen main exact");
assert(text(amemory.version, "A-memory version") === "0.175.0", "A-memory frozen version exact");
assert(amemory.frozenForV015 === true, "A-memory freeze recorded");
assert(JSON.stringify(amemory.openDraftPrs) === JSON.stringify([486, 489]), "A-memory open draft PRs exact");

const aprover = record(live.aprover, "Aprover snapshot");
assert(text(aprover.main, "Aprover main") === "98e0152d21d9b492d79aa5017e86a4114d3e5c51", "Aprover main exact");
assert(aprover.nativeRuntimeDeferredToV016 === true, "native Aprover runtime remains v0.16");

const governance = record(audit.governanceObservation, "governance observation");
assert(Number(governance.rulesetId) === 24087274, "ruleset id");
const blocker = record(governance.blockingObservation, "blocking observation");
assert(text(blocker.actorType, "bypass actor type") === "RepositoryRole", "broad repository role bypass observed");
assert(text(blocker.bypassMode, "bypass mode") === "always", "always bypass observed");
assert(text(governance.requiredFalsifier, "governance falsifier").includes("RED repo-guard"), "RED repo-guard falsifier recorded");

for (const path of strings(audit.semanticEvidence, "semantic evidence")) {
  assert(existsSync(join(root, path)), "audit evidence exists: " + path);
}

console.log(
  "MTS_V015_READINESS_S19=AUDIT_COMPLETE_BLOCKED_BY_GOVERNANCE " +
  "SEMANTIC_CORE=GREEN FORMAL_JSON_COMPILER=GREEN EXTERNAL_ASSURANCE=GREEN " +
  "APPROVED_EXECUTABLE_CORPUS=6_GREEN GENERATED_FORMAL=GREEN ACTIVE_TRACE=GREEN " +
  "CROSS_REPOSITORY_FREEZE=GREEN NON_READINESS_BLOCKERS=V15-GOV-04 " +
  "RULESET_BYPASS=BLOCKING RELEASE_READY=FALSE AUTHOR_ACCEPTANCE=NOT_REQUESTED CURRENT_ACCEPTED=v0.14",
);
