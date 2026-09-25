import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 readiness audit: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

const repoRoot = resolve(process.cwd(), "..");
const readJson = (path: string): any =>
  JSON.parse(readFileSync(join(repoRoot, path), "utf8"));

const contract13 = readJson("contracts/mts-contract-v0.13.json");
const conformance13 = readJson("contracts/mts-conformance-v0.13.json");
const traceability13 = readJson("traceability/mts-v0.13.json");
const contract12 = readJson("contracts/mts-contract-v0.12.json");
const conformance12 = readJson("contracts/mts-conformance-v0.12.json");
const acceptance13 = readJson("cutover/typescript-c1-acceptance-v0.6.json");
const policy = readJson("repo-policy.json");

// The earlier readiness audit remains historical evidence, but readiness has been rerun after A73s scoped reclassification.
same(contract13.status, "accepted", "v0.13 status is accepted");
same(contract13.accepted, true, "v0.13 is accepted");
same(contract13.acceptanceReady, true, "v0.13 contract readiness is restored");
same(conformance13.status, "accepted", "v0.13 conformance is accepted");
same(conformance13.accepted, true, "v0.13 conformance is accepted");
same(conformance13.acceptanceReady, true, "v0.13 conformance readiness is restored");
same(conformance13.coverageState, "complete", "declared v0.13 coverage is complete");

// The candidate kernel was readiness-complete before cutover and is now the accepted semantic boundary.
same(contract13.implementation?.implementationComplete, true, "candidate kernel scope complete");
same(
  contract13.implementation?.candidateKernelBehaviorImplemented,
  true,
  "candidate kernel behavior implemented",
);
same(
  contract13.implementation?.singleLiveSemanticRuntime,
  true,
  "v0.13 shares the single live @mts/core semantic kernel",
);
same(contract13.candidateState?.publicFacadeComplete, true, "public facade complete");
same(contract13.candidateState?.documentationComplete, true, "documentation complete");
same(contract13.candidateState?.traceabilityComplete, true, "traceability complete");
same(
  contract13.candidateState?.functionalParityAuditComplete,
  true,
  "functional parity audit complete",
);
same(
  contract13.candidateState?.foundationSuperiorityAuditComplete,
  true,
  "foundation superiority is complete for the declared v0.13 scope",
);
same(contract13.candidateState?.readinessReopened, false, "candidate records closed readiness reopen");
same(
  contract13.readinessReopen?.status,
  "closed-a73t-scoped-reclassification",
  "closed readiness-reopen state is machine-readable",
);
same(
  contract13.candidateState?.rootFormalDialectComplete,
  true,
  "root FORMAL dialect complete",
);
same(
  contract13.candidateState?.acceptanceCriteriaComplete,
  true,
  "AC1-AC10 complete",
);
same(
  contract13.candidateState?.readinessAuditComplete,
  true,
  "independent readiness audit recorded",
);
same(
  contract13.candidateState?.explicitAuthorAcceptanceRecorded,
  true,
  "author acceptance is recorded by A74",
);
same(
  contract13.implementation?.candidateRuntimeSelectable,
  false,
  "accepted v0.13 has no alternate candidate runtime mode",
);
same(
  contract13.releaseState?.candidateRuntimeSelectable,
  false,
  "release state keeps candidate non-selectable",
);
same(contract13.releaseState?.acceptanceReady, true, "release state projects restored readiness");

// Accepted v0.12 remains immutable as the immediately previous release.
same(contract12.schema, "mts-contract/v0.12", "accepted contract identity");
same(contract12.status, "accepted", "v0.12 contract remains accepted");
same(contract12.accepted, true, "v0.12 accepted flag remains true");
same(conformance12.schema, "mts-conformance/v0.12", "accepted conformance identity");
same(conformance12.status, "accepted", "v0.12 conformance remains accepted");
same(conformance12.accepted, true, "v0.12 conformance accepted flag remains true");
same(contract13.acceptedCurrent?.contract, "mts-contract/v0.13", "accepted-current contract");
same(
  contract13.acceptedCurrent?.conformance,
  "mts-conformance/v0.13",
  "accepted-current conformance",
);
same(
  conformance13.acceptedCurrent?.contract,
  "mts-contract/v0.13",
  "conformance accepted-current contract",
);
same(
  conformance13.acceptedCurrent?.conformance,
  "mts-conformance/v0.13",
  "conformance accepted-current corpus",
);
same(acceptance13.current?.contract, "contracts/mts-contract-v0.13.json", "cutover current contract is v0.13");
same(
  acceptance13.current?.conformance,
  "contracts/mts-conformance-v0.13.json",
  "cutover current conformance is v0.13",
);

// Every acceptance criterion is green.
for (let index = 1; index <= 10; index += 1) {
  same(contract13.acceptanceCriteria?.[`AC${index}`], "green", `AC${index} contract state`);
  same(
    conformance13.acceptanceCriteriaEvidence?.[`AC${index}`]?.status.startsWith("green"),
    true,
    `AC${index} conformance evidence`,
  );
}

// No planned implementation/evidence lane remains.
same(
  (conformance13.plannedExecutableGates ?? []).length,
  0,
  "no planned executable gates remain",
);
assert(
  (conformance13.requiredExecutableGates ?? []).length > 0,
  "required executable gate set is non-empty",
);

// All version-marked evidence through v0.13 is projected.
const marker = /\/\/ mts-version-evidence: required-from=(\d+)\.(\d+)/;
const requiredThrough013 = readdirSync(join(repoRoot, "ts/test"))
  .filter((name) => name.endsWith(".test.ts"))
  .filter((name) => {
    const source = readFileSync(join(repoRoot, "ts/test", name), "utf8");
    const match = marker.exec(source);
    if (match === null) return false;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    return major < 0 || (major === 0 && minor <= 13);
  })
  .map((name) => `ts/test/${name}`)
  .sort();

const declaredGates = [...(conformance13.requiredExecutableGates ?? [])].sort();
for (const gate of requiredThrough013) {
  assert(declaredGates.includes(gate), `required-from<=0.13 evidence is projected: ${gate}`);
}
for (const gate of declaredGates) {
  const absolute = join(repoRoot, gate);
  assert(existsSync(absolute), `declared executable gate exists: ${gate}`);
  const source = readFileSync(absolute, "utf8");
  assert(
    source.includes("../src/") || source.includes("@mts/core"),
    `declared gate executes the kernel: ${gate}`,
  );
}

// Traceability identity is exact for L1-L13.
same(traceability13.schema, "mts-traceability/v0.2", "v0.13 traceability schema");
same(traceability13.status, "accepted", "v0.13 traceability is accepted");
same(traceability13.accepted, true, "v0.13 traceability accepted flag");
same(traceability13.acceptance, "cutover/typescript-c1-acceptance-v0.6.json", "v0.13 traceability binds immutable acceptance");
same(
  traceability13.contract,
  "contracts/mts-contract-v0.13.json",
  "traceability contract target",
);
same(
  traceability13.conformance,
  "contracts/mts-conformance-v0.13.json",
  "traceability conformance target",
);
same(
  Object.keys(traceability13.invariants ?? {}).sort().join("|"),
  Object.keys(contract13.requiredSemanticLaws ?? {}).sort().join("|"),
  "traceability invariant identity equals required semantic laws",
);

// Functional parity has no unresolved/regressive entries.
same(conformance13.functionalParityAudit?.status, "green-complete-a4", "functional parity status");
same(conformance13.functionalParityAudit?.reviewRequiredCount, 0, "no REVIEW_REQUIRED parity");
same(conformance13.functionalParityAudit?.regressionCount, 0, "no parity regression");
for (const [law, entry] of Object.entries(
  conformance13.functionalParityAudit?.entries ?? {},
) as Array<[string, { classification?: string }]>) {
  assert(
    !["REGRESSION", "REVIEW_REQUIRED"].includes(entry.classification ?? ""),
    `${law}: parity classification is readiness-safe`,
  );
}

// The earlier readiness audit remains evidence. A73t reruns readiness on the exact
// current candidate after A73s reclassified stronger global A9 obligations as
// non-blocking research outside the declared v0.13 acceptance scope.
same(
  conformance13.evidenceState?.readinessAudit,
  "green-rerun-a73t",
  "readiness evidence records the exact-current A73t rerun",
);
same(
  conformance13.evidenceState?.authorAcceptance,
  "accepted-a74",
  "author acceptance is recorded",
);
same(
  (conformance13.acceptanceBlockers ?? []).length,
  0,
  "accepted v0.13 has no acceptance blockers",
);

// Readiness itself still does not count as author acceptance; A74 records a separate explicit decision.
assert(
  contract13.acceptanceAuthority?.implicitSignalsNeverCountAsAcceptance?.includes(
    "readiness audit completion",
  ),
  "readiness completion is explicitly non-acceptance",
);
same(
  contract13.acceptanceAuthority?.approvalMustReferenceExactCandidateArtifacts,
  true,
  "author decision must reference exact ready artifacts",
);

// Governance retains the readiness pins after acceptance and rotates current/previous separately.
const rules = new Map<string, any>(
  (policy.document_relations?.rules ?? []).map((rule: any) => [rule.id, rule]),
);
same(rules.get("v013-contract-ready")?.value, true, "policy pins v0.13 contract ready");
same(rules.get("v013-conformance-ready")?.value, true, "policy pins v0.13 conformance ready");
same(
  rules.get("v013-conformance-complete")?.value,
  "complete",
  "policy pins v0.13 complete coverage",
);

console.log(
  `MTS v0.13 A73t/A74 lifecycle: readiness evidence remains GREEN across ${declaredGates.length} projected gates; explicit author acceptance is recorded, v0.13 is current, and stronger A9 research remains non-blocking.`,
);
