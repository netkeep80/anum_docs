// mts-version-evidence: candidate-v0.15-independent-readiness-r2
// owner: #1876
//
// Independent release-readiness audit. The semantic/core result may be GREEN
// while operational merge governance remains a release blocker.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Json = Record<string, unknown>;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 readiness R2: " + message);
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
const requirements = JSON.parse(
  readFileSync(join(root, "requirements/mts-v0.15.json"), "utf8"),
) as Json;
const traceability = JSON.parse(
  readFileSync(join(root, "traceability/mts-v0.15.json"), "utf8"),
) as Json;
const audit = JSON.parse(
  readFileSync(join(root, "formal/v0.15/evidence/readiness-audit-r2.json"), "utf8"),
) as Json;

assert(text(audit.schema, "audit schema") === "mts-v015-independent-readiness-audit/v0.1", "audit schema");
assert(text(audit.ownerIssue, "audit owner") === "#1876", "audit owner");
assert(
  text(audit.status, "audit status") === "AUDIT_COMPLETE_BLOCKED_BY_GOVERNANCE",
  "audit remains blocked while V15-GOV-04 is OPEN",
);

assert(requirements.status === "candidate", "v0.15 remains candidate");
assert(requirements.accepted === false, "v0.15 not accepted");
assert(requirements.acceptanceReady === false, "v0.15 not acceptance-ready");
const currentAccepted = record(requirements.currentAccepted, "currentAccepted");
assert(text(currentAccepted.mtsVersion, "current accepted version") === "v0.14", "v0.14 remains current");

const list = requirements.requirements;
assert(Array.isArray(list), "requirements list");
const mandatory = (list as Json[]).filter((item) => item.mandatory !== false);
const byId = new Map(mandatory.map((item) => [text(item.id, "requirement id"), item]));

const allowedGreen = new Set(["COMPONENT_GREEN", "VERTICAL_GREEN"]);
const open = mandatory
  .filter((item) => text(item.state, "state") === "OPEN")
  .map((item) => text(item.id, "open id"))
  .sort();
const expectedOpen = [
  "V15-GOV-04",
  "V15-READY-01",
  "V15-READY-02",
  "V15-READY-03",
].sort();
assert(JSON.stringify(open) === JSON.stringify(expectedOpen), "only governance + readiness requirements remain OPEN");

for (const item of mandatory) {
  const id = text(item.id, "id");
  if (expectedOpen.includes(id)) continue;
  assert(allowedGreen.has(text(item.state, id + " state")), id + " semantic/component requirement is green");
}

const gov = byId.get("V15-GOV-04");
assert(gov !== undefined, "V15-GOV-04 exists");
assert(gov.mandatory === true, "V15-GOV-04 mandatory");
assert(text(gov.ownerIssue, "GOV-04 owner") === "#1982", "GOV-04 owner #1982");
assert(text(gov.state, "GOV-04 state") === "OPEN", "GOV-04 remains OPEN");
assert(
  strings(gov.dependsOn, "GOV-04 dependencies").every((id) =>
    allowedGreen.has(text(byId.get(id)?.state, id + " prerequisite state"))
  ),
  "GOV-04 semantic/governance prerequisites are green",
);

const ready1 = byId.get("V15-READY-01");
assert(ready1 !== undefined, "READY-01 exists");
assert(strings(ready1.dependsOn, "READY-01 dependencies").includes("V15-GOV-04"), "READY-01 depends on GOV-04");

const traces = record(traceability.requirements, "trace requirements");
for (const id of expectedOpen) {
  const traced = record(traces[id], id + " trace");
  assert(text(traced.state, id + " trace state") === "OPEN", id + " trace remains OPEN");
}
assert(
  strings(record(traces["V15-READY-01"], "READY-01 trace").dependsOn, "READY trace dependencies")
    .includes("V15-GOV-04"),
  "trace READY-01 depends on GOV-04",
);

const conclusion = record(audit.conclusion, "audit conclusion");
for (const key of [
  "semanticExecutionCore",
  "formalJsonCompiler",
  "externalAssurance",
  "approvedExecutableCorpus",
  "crossRepositoryFreeze",
]) {
  assert(text(conclusion[key], "audit " + key) === "GREEN", key + " audit green");
}
assert(text(conclusion.generatedFormalSpecification, "generated FORMAL specification") === "GREEN", "generated FORMAL specification green");
assert(text(conclusion.operationalMergeGovernance, "merge governance") === "BLOCKED", "merge governance blocked");
assert(conclusion.releaseReady === false, "audit does not claim release ready");
assert(conclusion.authorAcceptanceReady === false, "audit does not claim Author acceptance ready");

const snapshot = record(audit.requirementSnapshot, "requirement snapshot");
assert(Number(snapshot.mandatoryCount) === mandatory.length, "mandatory requirement count");
assert(strings(snapshot.open, "audit open requirements").length === 4, "audit records four open requirements");
const nonReadiness = strings(snapshot.nonReadinessBlockers, "non-readiness blockers").slice().sort();
assert(
  JSON.stringify(nonReadiness) === JSON.stringify(["V15-GOV-04"]),
  "governance is the only non-readiness blocker",
);

const governance = record(audit.governanceObservation, "governance observation");
assert(Number(governance.rulesetId) === 24087274, "ruleset id");
const blocker = record(governance.blockingObservation, "blocking observation");
assert(text(blocker.actorType, "bypass actor type") === "RepositoryRole", "broad repository role bypass observed");
assert(text(blocker.bypassMode, "bypass mode") === "always", "always bypass observed");
assert(text(governance.requiredFalsifier, "governance falsifier").includes("RED repo-guard"), "RED repo-guard falsifier recorded");

const corpus = record(traceability.approvedJsonCorpus, "approvedJsonCorpus");
assert(Array.isArray(corpus.entries) && corpus.entries.length === 6, "six current approved executable artifacts");

for (const path of strings(audit.semanticEvidence, "semantic evidence")) {
  if (path.includes("#")) continue;
  assert(existsSync(join(root, path)), "audit evidence exists: " + path);
}

console.log([
  "MTS_V015_READINESS_R2=AUDIT_COMPLETE_BLOCKED_BY_GOVERNANCE",
  "SEMANTIC_CORE=GREEN",
  "FORMAL_JSON_COMPILER=GREEN",
  "EXTERNAL_ASSURANCE=GREEN",
  "APPROVED_EXECUTABLE_CORPUS=6_GREEN",
  "CROSS_REPOSITORY_FREEZE=GREEN",
  "NON_READINESS_BLOCKERS=V15-GOV-04",
  "RULESET_BYPASS=BLOCKING",
  "RELEASE_READY=FALSE",
  "AUTHOR_ACCEPTANCE=NOT_REQUESTED",
  "CURRENT_ACCEPTED=v0.14",
].join(" "));
