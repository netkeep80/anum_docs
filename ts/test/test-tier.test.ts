import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  buildTestTierPlan,
  classifyTestPaths,
  selectTestTier,
} from "../src/tooling/test-tier.js";

const repositoryRoot = resolve("..");
const plan = buildTestTierPlan(repositoryRoot);

assert.ok(plan.allSourceTests.length > 0, "full tier is non-empty");
assert.ok(plan.currentSourceTests.length > 0, "current tier is non-empty");
assert.ok(
  plan.currentSourceTests.length < plan.allSourceTests.length,
  "historical research witnesses remain outside current tier",
);
assert.ok(
  plan.historicalResearchSourceTests.length > 0,
  "historical research witness tier is non-empty",
);
assert.ok(
  plan.machineReferencedSourceTests.length > 0,
  "machine-readable current surfaces reference executable tests",
);

const allSet = new Set(plan.allSourceTests);
const currentSet = new Set(plan.currentSourceTests);
const referencedSet = new Set(plan.machineReferencedSourceTests);

assert.ok(
  plan.authoritySources.includes("theorems/current-v0.14.json"),
  "current theorem projection participates in current test-tier authority",
);
assert.equal(
  plan.authoritySources.includes("theorems/registry.json"),
  false,
  "historical v0.13 theorem registry must not control current test-tier selection",
);
assert.ok(
  currentSet.has("ts/test/research-v013-recursive-link-inversion-a75a.test.ts"),
  "historical-named witness remains current when frozen v0.14 P0 still references it",
);
for (const path of [
  "ts/test/research-v013-context-dualization-a75b.test.ts",
  "ts/test/research-v013-formal-duality-a75c.test.ts",
  "ts/test/research-v013-full-duality-audit-a75f.test.ts",
  "ts/test/research-v013-grounded-execution-dualization-a75e.test.ts",
  "ts/test/research-v013-theory-authority-dualization-a75d.test.ts",
]) {
  assert.equal(currentSet.has(path), false, `historical registry-only witness stays full-only: ${path}`);
}

for (const path of plan.currentSourceTests) {
  assert.ok(allSet.has(path), `current test must exist in full tier: ${path}`);
}
for (const path of plan.machineReferencedSourceTests) {
  assert.ok(currentSet.has(path), `machine-referenced test must be current: ${path}`);
}
for (const path of plan.allSourceTests) {
  const name = path.slice("ts/test/".length);
  if (!name.startsWith("research-")) {
    assert.ok(currentSet.has(path), `non-research test must be current: ${path}`);
  }
}
for (const path of plan.historicalResearchSourceTests) {
  const name = path.slice("ts/test/".length);
  assert.ok(name.startsWith("research-"), `full-only test must be research-prefixed: ${path}`);
  assert.equal(referencedSet.has(path), false, `full-only test must not be machine-referenced: ${path}`);
}

assert.deepEqual(selectTestTier(plan, "full"), plan.allSourceTests);
assert.deepEqual(selectTestTier(plan, "current"), plan.currentSourceTests);

const synthetic = classifyTestPaths(
  [
    "ts/test/core.test.ts",
    "ts/test/research-current.test.ts",
    "ts/test/research-history.test.ts",
  ],
  ["ts/test/research-current.test.ts"],
);
assert.deepEqual(synthetic.currentSourceTests, [
  "ts/test/core.test.ts",
  "ts/test/research-current.test.ts",
]);
assert.deepEqual(synthetic.historicalResearchSourceTests, [
  "ts/test/research-history.test.ts",
]);

assert.throws(
  () =>
    classifyTestPaths(
      ["ts/test/core.test.ts"],
      ["ts/test/research-missing.test.ts"],
    ),
  /machine-readable authority references missing test/,
);

const fixtureRoot = mkdtempSync(join(tmpdir(), "mts-test-tier-"));
try {
  const copy = (path: string): void => {
    const target = resolve(fixtureRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolve(repositoryRoot, path), target);
  };

  for (const path of [
    "repo-policy.json",
    "requirements/mts-v0.15.json",
    "requirements/mts-v0.14.json",
    "traceability/mts-v0.15.json",
    "contracts/mts-contract-v0.15.json",
    "contracts/mts-conformance-v0.15.json",
    "cutover/typescript-c1-acceptance-v0.8.json",
    "proofs/provers.json",
    "theorems/current-v0.14.json",
    "README.md",
  ]) {
    copy(path);
  }

  for (const path of plan.allSourceTests) {
    const target = resolve(fixtureRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, "", "utf8");
  }

  const fixturePlan = buildTestTierPlan(fixtureRoot);
  assert.deepEqual(
    fixturePlan,
    plan,
    "isolated accepted fixture must reproduce the real repository test-tier plan",
  );

  const policyPath = resolve(fixtureRoot, "repo-policy.json");
  const policySource = readFileSync(policyPath, "utf8");
  const policy = JSON.parse(policySource) as any;
  policy.packs["contract-conformance"].current.contract.path = "contracts/mts-contract-v0.14.json";
  policy.packs["contract-conformance"].current.conformance.path = "contracts/mts-conformance-v0.14.json";
  policy.packs["contract-conformance"].acceptance.document.path =
    "cutover/typescript-c1-acceptance-v0.7.json";
  writeFileSync(policyPath, JSON.stringify(policy), "utf8");
  assert.deepEqual(
    buildTestTierPlan(fixtureRoot),
    fixturePlan,
    "repo-policy current/acceptance mutations must not influence test-tier selection",
  );
  writeFileSync(policyPath, policySource, "utf8");

  const registryPath = resolve(fixtureRoot, "requirements/mts-v0.15.json");
  const registrySource = readFileSync(registryPath, "utf8");
  const registry = JSON.parse(registrySource) as any;
  registry.currentAccepted.contract = "contracts/mts-contract-v0.14.json";
  writeFileSync(registryPath, JSON.stringify(registry), "utf8");
  assert.throws(
    () => buildTestTierPlan(fixtureRoot),
    /v0\.15 registry current accepted contract path mismatch/,
    "native accepted-authority inconsistency must fail closed",
  );
  writeFileSync(registryPath, registrySource, "utf8");

  const contractPath = resolve(fixtureRoot, "contracts/mts-contract-v0.15.json");
  const contractSource = readFileSync(contractPath, "utf8");

  const conformanceMismatch = JSON.parse(contractSource) as any;
  conformanceMismatch.conformanceCorpus = "contracts/mts-conformance-v0.14.json";
  writeFileSync(contractPath, JSON.stringify(conformanceMismatch), "utf8");
  assert.throws(
    () => buildTestTierPlan(fixtureRoot),
    /v0\.15 contract conformanceCorpus differs from accepted conformance path/,
    "accepted contract conformance selector mismatch must fail closed",
  );
  writeFileSync(contractPath, contractSource, "utf8");

  const traceabilityMismatch = JSON.parse(contractSource) as any;
  traceabilityMismatch.traceabilityManifest = "traceability/mts-v0.14.json";
  writeFileSync(contractPath, JSON.stringify(traceabilityMismatch), "utf8");
  assert.throws(
    () => buildTestTierPlan(fixtureRoot),
    /v0\.15 contract traceabilityManifest differs from accepted traceability path/,
    "accepted contract traceability selector mismatch must fail closed",
  );
  writeFileSync(contractPath, contractSource, "utf8");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log(
  [
    "R2 test tiers: GREEN",
    `full=${plan.allSourceTests.length}`,
    `current=${plan.currentSourceTests.length}`,
    `machine-referenced=${plan.machineReferencedSourceTests.length}`,
    `historical-research=${plan.historicalResearchSourceTests.length}`,
    "policy-pointer=IGNORED",
    "native-authority-mismatch=RED",
    "contract-conformance-selector-mismatch=RED",
    "contract-traceability-selector-mismatch=RED",
  ].join(" "),
);
