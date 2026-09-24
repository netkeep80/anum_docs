import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13/v0.12 functional parity: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

const repoRoot = resolve(process.cwd(), "..");
const contract12 = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-contract-v0.12.json"), "utf8"),
);
const conformance12 = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-conformance-v0.12.json"), "utf8"),
);
const contract13 = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-contract-v0.13.json"), "utf8"),
);
const conformance13 = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-conformance-v0.13.json"), "utf8"),
);

same(contract12.accepted, true, "baseline v0.12 remains accepted");
same(contract13.accepted, true, "v0.13 is accepted");
same(
  contract13.acceptanceReady,
  true,
  "candidate v0.13 readiness is restored after A73t under stronger A9/self-proof criteria",
);
same(
  contract13.candidateState.explicitAuthorAcceptanceRecorded,
  true,
  "explicit author acceptance is recorded at cutover",
);
const authority = contract13.acceptanceAuthority;
same(authority.explicitAuthorApprovalRequired, true, "explicit author approval required");
same(
  authority.approvalMustReferenceExactCandidateArtifacts,
  true,
  "author approval must bind exact candidate artifacts",
);
same(authority.automaticAcceptanceForbidden, true, "automatic acceptance forbidden");

for (const signal of [
  "continue/proceed instruction",
  "approval of an individual issue, PR, law or experiment",
  "GREEN CI or conformance",
  "readiness audit completion",
  "absence of objection",
]) {
  assert(
    authority.implicitSignalsNeverCountAsAcceptance.includes(signal),
    `implicit acceptance signal forbidden: ${signal}`,
  );
}

const parity = conformance13.functionalParityAudit;
same(parity.baseline.contract, "mts-contract/v0.12", "parity contract baseline");
same(parity.baseline.conformance, "mts-conformance/v0.12", "parity conformance baseline");
same(parity.baseline.accepted, true, "parity baseline accepted");

const baselineLaws = Object.keys(contract12.requiredSemanticLaws).sort();
const mappedLaws = Object.keys(parity.entries).sort();
same(
  mappedLaws.join("\n"),
  baselineLaws.join("\n"),
  "every accepted v0.12 semantic law has exactly one parity entry",
);
same(
  parity.baseline.requiredSemanticLawCount,
  baselineLaws.length,
  "baseline semantic law count",
);

const baselineGates = [...conformance12.requiredExecutableGates].sort();
const retainedGates = [...parity.requiredBaselineExecutableGates].sort();
same(
  retainedGates.join("\n"),
  baselineGates.join("\n"),
  "all accepted v0.12 mandatory executable gates are retained as parity baseline",
);
same(
  parity.baseline.requiredExecutableGateCount,
  baselineGates.length,
  "baseline mandatory gate count",
);
same(
  parity.baselineGatesPassingIsNecessaryButNotSufficient,
  true,
  "passing retained runtime is not semantic parity by itself",
);

const allowed = new Set([
  "PRESERVED",
  "GENERALIZED",
  "REPLACED",
  "REVIEW_REQUIRED",
  "REGRESSION",
]);
let reviewRequired = 0;
let regression = 0;

for (const law of baselineLaws) {
  const entry = parity.entries[law];
  assert(entry, `missing parity entry for ${law}`);
  same(
    entry.baselineStatement,
    contract12.requiredSemanticLaws[law],
    `${law}: baseline statement is exact`,
  );
  assert(allowed.has(entry.classification), `${law}: known classification`);
  same(
    entry.baselineRuntimeRetained,
    true,
    `${law}: accepted runtime evidence remains retained during audit`,
  );

  if (entry.classification === "REVIEW_REQUIRED") reviewRequired += 1;
  if (entry.classification === "REGRESSION") regression += 1;
}

same(regression, 0, "no known regression is silently accepted");

if (contract13.candidateState.functionalParityAuditComplete) {
  same(parity.status, "green-complete-a4", "completed parity audit status");
  same(reviewRequired, 0, "completed parity audit has no REVIEW_REQUIRED laws");
  same(parity.completedLawCount, baselineLaws.length, "completed parity law count");
  same(parity.reviewRequiredCount, 0, "completed parity review-required count");
  same(parity.regressionCount, 0, "completed parity regression count");
  same(
    conformance13.inheritedFoundationParity?.status,
    "green-complete",
    "complete parity also requires inherited foundation audit",
  );
} else {
  const inheritedOpen =
    conformance13.inheritedFoundationParity !== undefined &&
    conformance13.inheritedFoundationParity.status !== "green-complete";
  assert(
    reviewRequired > 0 || inheritedOpen,
    "in-progress audit must expose unresolved semantic laws or inherited foundation",
  );
}

const nonRegression = contract13.functionalNonRegression;
same(nonRegression.acceptanceRequiresCompleteAudit, true, "complete parity audit required");
same(
  nonRegression.passingOldRuntimeTestsAloneProvesSemanticParity,
  false,
  "retained old tests alone do not prove semantic parity",
);
assert(
  nonRegression.acceptanceForbiddenClassifications.includes("REGRESSION"),
  "REGRESSION blocks acceptance",
);
assert(
  nonRegression.acceptanceForbiddenClassifications.includes("REVIEW_REQUIRED"),
  "REVIEW_REQUIRED blocks acceptance",
);

// Readiness requires complete parity, but is deliberately prior to the
// author's separate exact-artifact acceptance decision.
if (contract13.acceptanceReady || contract13.accepted) {
  same(
    contract13.candidateState.functionalParityAuditComplete,
    true,
    "ready/accepted candidate requires complete functional parity",
  );

  for (const [law, entry] of Object.entries(parity.entries) as Array<
    [string, { classification: string }]
  >) {
    assert(
      !["REGRESSION", "REVIEW_REQUIRED"].includes(entry.classification),
      `${law}: unresolved/regressive parity cannot cross readiness boundary`,
    );
  }
}

if (contract13.acceptanceReady && !contract13.accepted) {
  same(
    contract13.candidateState.readinessAuditComplete,
    true,
    "ready candidate requires completed readiness audit",
  );
  same(
    contract13.candidateState.explicitAuthorAcceptanceRecorded,
    false,
    "readiness itself must not pre-record author acceptance",
  );
}

if (contract13.accepted) {
  same(
    contract13.candidateState.explicitAuthorAcceptanceRecorded,
    true,
    "accepted candidate requires explicit author acceptance",
  );
}

console.log(
  `MTS v0.13 functional non-regression lifecycle: ${baselineLaws.length} accepted v0.12 laws and ${baselineGates.length} mandatory gates mapped; parityComplete=${String(contract13.candidateState.functionalParityAuditComplete)} reviewRequired=${reviewRequired}; explicit author acceptance is recorded and the accepted v0.13 parity boundary remains GREEN.`,
);
