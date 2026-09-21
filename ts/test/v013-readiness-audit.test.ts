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
const acceptance12 = readJson("cutover/typescript-c1-acceptance-v0.5.json");
const policy = readJson("repo-policy.json");

// Readiness is a separately merged pre-acceptance state.
same(contract13.status, "candidate", "v0.13 status remains candidate");
same(contract13.accepted, false, "v0.13 remains unaccepted");
same(contract13.acceptanceReady, true, "v0.13 contract is acceptance-ready");
same(conformance13.status, "candidate", "v0.13 conformance remains candidate");
same(conformance13.accepted, false, "v0.13 conformance remains unaccepted");
same(conformance13.acceptanceReady, true, "v0.13 conformance is acceptance-ready");
same(conformance13.coverageState, "complete", "declared v0.13 coverage is complete");

// The candidate kernel is complete but is not selected before an explicit cutover.
same(contract13.implementation?.implementationComplete, true, "candidate kernel scope complete");
same(
  contract13.implementation?.candidateKernelBehaviorImplemented,
  true,
  "candidate kernel behavior implemented",
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
  "foundation superiority audit complete",
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
  false,
  "author acceptance is intentionally still pending",
);
same(
  contract13.implementation?.candidateRuntimeSelectable,
  false,
  "ready candidate remains non-selectable before explicit cutover",
);
same(
  contract13.releaseState?.candidateRuntimeSelectable,
  false,
  "release state keeps candidate non-selectable",
);
same(contract13.releaseState?.acceptanceReady, true, "release state projects readiness");

// Accepted/current v0.12 remains untouched.
same(contract12.schema, "mts-contract/v0.12", "accepted contract identity");
same(contract12.status, "accepted", "v0.12 contract remains accepted");
same(contract12.accepted, true, "v0.12 accepted flag remains true");
same(conformance12.schema, "mts-conformance/v0.12", "accepted conformance identity");
same(conformance12.status, "accepted", "v0.12 conformance remains accepted");
same(conformance12.accepted, true, "v0.12 conformance accepted flag remains true");
same(contract13.acceptedCurrent?.contract, "mts-contract/v0.12", "accepted-current contract");
same(
  contract13.acceptedCurrent?.conformance,
  "mts-conformance/v0.12",
  "accepted-current conformance",
);
same(
  conformance13.acceptedCurrent?.contract,
  "mts-contract/v0.12",
  "conformance accepted-current contract",
);
same(
  conformance13.acceptedCurrent?.conformance,
  "mts-conformance/v0.12",
  "conformance accepted-current corpus",
);
same(acceptance12.current?.contract, "mts-contract/v0.12", "cutover current contract remains v0.12");
same(
  acceptance12.current?.conformance,
  "mts-conformance/v0.12",
  "cutover current conformance remains v0.12",
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

// Readiness removes only the readiness blocker. Acceptance remains a distinct
// explicit author decision over the exact ready artifacts.
same(
  conformance13.evidenceState?.readinessAudit,
  "green-confirmed",
  "readiness evidence is green-confirmed",
);
same(
  conformance13.evidenceState?.authorAcceptance,
  "pending",
  "author acceptance remains pending",
);
same(
  (conformance13.acceptanceBlockers ?? []).length,
  1,
  "exactly one acceptance blocker remains after readiness",
);
same(
  conformance13.acceptanceBlockers?.[0],
  "explicit author acceptance of the exact candidate artifacts has not yet been recorded",
  "only explicit author acceptance remains",
);

// Readiness itself is not author acceptance.
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

// Positive trusted-base readiness pins are present; no false->true policy bridge
// was required because v0.13 had no previous readiness literals in repo-policy.
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
  `MTS v0.13 independent readiness audit: GREEN; ${declaredGates.length} kernel gates projected, v0.12 remains current, and only explicit author acceptance remains.`,
);
