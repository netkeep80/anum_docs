import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { listRepositoryMarkdownSurface } from "../src/tooling/markdown-section-adapter.js";
import {
  buildTestTierPlan,
  classifyTestPaths,
  selectTestTier,
} from "../src/tooling/test-tier.js";
import { THEOREM_CATALOG_PATH } from "../src/tooling/theorem-catalog-markdown.js";

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
assert.deepEqual(
  plan.historicalAcceptedEvidenceSourceTests,
  ["ts/test/v015-semantic-metamodel-evidence-verifier.test.ts"],
  "historical accepted evidence is an exact one-test allowlist",
);
assert.ok(
  plan.machineReferencedSourceTests.length > 0,
  "machine-readable current surfaces reference executable tests",
);

const allSet = new Set(plan.allSourceTests);
const currentSet = new Set(plan.currentSourceTests);
const referencedSet = new Set(plan.machineReferencedSourceTests);
const historicalAcceptedSet = new Set(plan.historicalAcceptedEvidenceSourceTests);

assert.ok(
  plan.authoritySources.includes("theorems/current-v0.15.json"),
  "current v0.15 theorem capsule participates in current test-tier authority",
);
assert.equal(
  plan.authoritySources.includes("theorems/current-v0.14.json"),
  false,
  "historical v0.14 theorem index must not control current test-tier selection",
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
  if (!name.startsWith("research-") && !historicalAcceptedSet.has(path)) {
    assert.ok(currentSet.has(path), `ordinary non-research test must be current: ${path}`);
  }
}
for (const path of plan.historicalResearchSourceTests) {
  const name = path.slice("ts/test/".length);
  assert.ok(name.startsWith("research-"), `historical research test must be research-prefixed: ${path}`);
  assert.equal(referencedSet.has(path), false, `historical research test must not be machine-referenced: ${path}`);
  assert.equal(historicalAcceptedSet.has(path), false, `historical research and accepted-evidence classes are disjoint: ${path}`);
}
for (const path of plan.historicalAcceptedEvidenceSourceTests) {
  assert.ok(allSet.has(path), `historical accepted evidence remains in full tier: ${path}`);
  assert.equal(currentSet.has(path), false, `historical accepted evidence stays out of current tier: ${path}`);
  assert.equal(referencedSet.has(path), false, `historical accepted evidence must not be machine-referenced: ${path}`);
  assert.equal(path.startsWith("ts/test/research-"), false, `historical accepted evidence is not a research-prefix escape: ${path}`);
}
assert.equal(
  currentSet.has("ts/test/v015-semantic-metamodel-evidence-verifier.test.ts"),
  false,
  "immutable v0.1 semantic-metamodel replay is not current",
);
assert.equal(
  currentSet.has("ts/test/v015-semantic-metamodel-evidence-verifier-v02.test.ts"),
  true,
  "v0.2 semantic-metamodel verifier remains current",
);
assert.equal(
  historicalAcceptedSet.has("ts/test/v015-semantic-metamodel-evidence-verifier-v02.test.ts"),
  false,
  "v0.2 semantic-metamodel verifier is not historical accepted evidence",
);

assert.deepEqual(selectTestTier(plan, "full"), plan.allSourceTests);
assert.deepEqual(selectTestTier(plan, "current"), plan.currentSourceTests);

const synthetic = classifyTestPaths(
  [
    "ts/test/core.test.ts",
    "ts/test/v015-semantic-metamodel-evidence-verifier.test.ts",
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
assert.deepEqual(synthetic.historicalAcceptedEvidenceSourceTests, [
  "ts/test/v015-semantic-metamodel-evidence-verifier.test.ts",
]);
assert.ok(
  synthetic.currentSourceTests.includes("ts/test/core.test.ts"),
  "arbitrary non-research test remains current",
);
assert.equal(
  synthetic.currentSourceTests.includes("ts/test/v015-semantic-metamodel-evidence-verifier.test.ts"),
  false,
  "only the exact immutable accepted-evidence path is excluded from current",
);

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
    "requirements/mts-v0.15.json",
    "traceability/mts-v0.15.json",
    "contracts/mts-contract-v0.15.json",
    "contracts/mts-conformance-v0.15.json",
    "cutover/typescript-c1-acceptance-v0.8.json",
    "proofs/provers.json",
    "theorems/current-v0.15.json",
    "theorems/current-v0.14.json",
  ]) {
    copy(path);
  }

  const currentMarkdownSurface = listRepositoryMarkdownSurface(repositoryRoot)
    .filter((path) => path !== THEOREM_CATALOG_PATH);
  assert.equal(currentMarkdownSurface.length, 12, "test-tier fixture carries the exact current semantic Markdown surface");
  for (const path of currentMarkdownSurface) copy(path);
  assert.equal(
    currentMarkdownSurface.includes("README.md"),
    true,
    "test-tier fixture current document surface includes README project-fact target",
  );

  const nativeV015RequirementPaths = readdirSync(resolve(repositoryRoot, "requirements/mts-v0.15"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".rg.yaml"))
    .map((entry) => `requirements/mts-v0.15/${entry.name}`)
    .sort((left, right) => left.localeCompare(right, "en"));
  assert.equal(nativeV015RequirementPaths.length, 48, "test-tier fixture carries all native v0.15 Requirements");
  for (const path of nativeV015RequirementPaths) copy(path);

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

  const selectorResearchTest = "ts/test/research-v013-explicit-zero-image-a72y.test.ts";
  assert.ok(
    fixturePlan.currentSourceTests.includes(selectorResearchTest),
    "selector falsifier research test is current before mutation",
  );

  const removeExactReference = (value: any, target: string): number => {
    if (Array.isArray(value)) {
      let removed = 0;
      for (let index = value.length - 1; index >= 0; index -= 1) {
        if (value[index] === target) {
          value.splice(index, 1);
          removed += 1;
        } else {
          removed += removeExactReference(value[index], target);
        }
      }
      return removed;
    }
    if (value !== null && typeof value === "object") {
      let removed = 0;
      for (const item of Object.values(value)) {
        removed += removeExactReference(item, target);
      }
      return removed;
    }
    return 0;
  };

  const historicalTheoremPath = resolve(fixtureRoot, "theorems/current-v0.14.json");
  const historicalTheoremSource = readFileSync(historicalTheoremPath, "utf8");
  const historicalTheoremMutation = JSON.parse(historicalTheoremSource) as any;
  assert.equal(removeExactReference(historicalTheoremMutation, selectorResearchTest), 1);
  writeFileSync(historicalTheoremPath, JSON.stringify(historicalTheoremMutation), "utf8");
  assert.deepEqual(
    buildTestTierPlan(fixtureRoot),
    fixturePlan,
    "F1: historical v0.14 theorem-index mutation must not alter current theorem/test selection",
  );
  writeFileSync(historicalTheoremPath, historicalTheoremSource, "utf8");

  const currentTheoremPath = resolve(fixtureRoot, "theorems/current-v0.15.json");
  const currentTheoremSource = readFileSync(currentTheoremPath, "utf8");
  const currentTheoremMutation = JSON.parse(currentTheoremSource) as any;
  assert.equal(removeExactReference(currentTheoremMutation, selectorResearchTest), 1);
  writeFileSync(currentTheoremPath, JSON.stringify(currentTheoremMutation), "utf8");
  const selectorMutationPlan = buildTestTierPlan(fixtureRoot);
  assert.equal(
    selectorMutationPlan.currentSourceTests.includes(selectorResearchTest),
    false,
    "F2: current v0.15 capsule mutation must remove the theorem-only research test from CURRENT",
  );
  assert.equal(
    selectorMutationPlan.currentSourceTests.length,
    fixturePlan.currentSourceTests.length - 1,
    "F2: current selector mutation changes exactly one current-tier member",
  );
  assert.equal(
    selectorMutationPlan.machineReferencedSourceTests.length,
    fixturePlan.machineReferencedSourceTests.length - 1,
    "F2: current selector mutation changes exactly one machine reference",
  );
  writeFileSync(currentTheoremPath, currentTheoremSource, "utf8");

  const policyPath = resolve(fixtureRoot, "repo-policy.json");
  const policySource = JSON.stringify({
    packs: {
      "contract-conformance": {
        current: { contract: { path: "decoy-current-contract" }, conformance: { path: "decoy-current-conformance" } },
        acceptance: { document: { path: "decoy-acceptance" } },
      },
    },
  });
  writeFileSync(policyPath, policySource, "utf8");
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
    `historical-accepted-evidence=${plan.historicalAcceptedEvidenceSourceTests.length}`,
    "policy-pointer=IGNORED",
    "native-authority-mismatch=RED",
    "contract-conformance-selector-mismatch=RED",
    "contract-traceability-selector-mismatch=RED",
  ].join(" "),
);
