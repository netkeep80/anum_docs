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

// RED receipt synchronize: keep this commit test-only until behavioral failure is observed.
const repositoryRoot = resolve("..");

const EXPECTED_NATIVE_VERIFIED_BY: readonly string[] = Object.freeze([
  "ts/test/docs-current-surface.test.ts",
  "ts/test/docs-size-budget.test.ts",
  "ts/test/docs-sync.test.ts",
  "ts/test/release-cutover.test.ts",
  "ts/test/v015-boolean-package-replay-a2.test.ts",
  "ts/test/v015-compact-and-approved-source-integrity.test.ts",
  "ts/test/v015-compact-not-approved-source-integrity.test.ts",
  "ts/test/v015-compact-or-approved-source-integrity.test.ts",
  "ts/test/v015-compact-xor-approved-source-integrity.test.ts",
  "ts/test/v015-context-authority-closure-c1.test.ts",
  "ts/test/v015-context-theory-self-contained-a6.test.ts",
  "ts/test/v015-direct-formal-source-b20.test.ts",
  "ts/test/v015-direct-json-denotation-das-a2b.test.ts",
  "ts/test/v015-direct-structural-aspects-s1.test.ts",
  "ts/test/v015-exact-finite-support-necessity-a10.test.ts",
  "ts/test/v015-final-readiness-r3.test.ts",
  "ts/test/v015-finite-materialized-reaction-a12.test.ts",
  "ts/test/v015-formal-decoder-b2.test.ts",
  "ts/test/v015-formal-exact-sequence-b7.test.ts",
  "ts/test/v015-formal-json-j1-b9.test.ts",
  "ts/test/v015-formal-production-refinement-f1.test.ts",
  "ts/test/v015-formal-proof-assurance-f0.test.ts",
  "ts/test/v015-frozen-replay-artifact-integrity.test.ts",
  "ts/test/v015-grounded-approved-source-integrity.test.ts",
  "ts/test/v015-independent-readiness-r2.test.ts",
  "ts/test/v015-parallel-reaction-reduction-a11.test.ts",
  "ts/test/v015-positive-aset-currentness-a8.test.ts",
  "ts/test/v015-requirements-traceability-r0.test.ts",
  "ts/test/v015-rule-bundle-denotation-das-a2c.test.ts",
  "ts/test/v015-self-contained-context-freeze-resume-a5.test.ts",
  "ts/test/v015-source-anet-denotation-core-das-a2a.test.ts",
  "ts/test/v015-structural-aset-gamma-antidrift-a9c.test.ts",
  "ts/test/v015-structural-aset-gamma-core-a9a.test.ts",
  "ts/test/v015-structural-aset-role-bundle-a9b.test.ts",
  "ts/test/v015-two-role-approved-source-integrity.test.ts",
]);

const G14_TRANSITIONED_CURRENT_ASSURANCE: readonly string[] = Object.freeze([
  "ts/test/portable-derivation.test.ts",
  "ts/test/portable-derivation-digest.test.ts",
  "ts/test/proof-infrastructure.test.ts",
]);

const EXPECTED_CURRENT_ASSURANCE: readonly string[] = Object.freeze([
  "ts/test/historical-images-protection.test.ts",
  "ts/test/portable-derivation-digest.test.ts",
  "ts/test/portable-derivation.test.ts",
  "ts/test/proof-infrastructure.test.ts",
  "ts/test/public-api.test.ts",
  "ts/test/test-tier.test.ts",
  "ts/test/v015-documentation-acceptance.test.ts",
  "ts/test/v015-semantic-metamodel-evidence-verifier-v02.test.ts",
]);

const EXPECTED_BOUNDED = Object.freeze([] as const);
// G14 RED-first: these exact role assertions must fail against the pre-fix 5/3 production partition.

const EXPECTED_TARGET_CURRENT = Object.freeze(
  [...new Set([
    ...EXPECTED_NATIVE_VERIFIED_BY,
    ...EXPECTED_CURRENT_ASSURANCE,
    ...EXPECTED_BOUNDED.map((item) => item.path),
  ])].sort(),
);

assert.equal(EXPECTED_NATIVE_VERIFIED_BY.length, 35);
assert.equal(EXPECTED_CURRENT_ASSURANCE.length, 8);
assert.equal(EXPECTED_BOUNDED.length, 0);
assert.equal(EXPECTED_TARGET_CURRENT.length, 43);

const plan = buildTestTierPlan(repositoryRoot);
const executionPlan = plan as typeof plan & {
  readonly nativeVerifiedByCurrentSourceTests: readonly string[];
  readonly currentAssuranceSourceTests: readonly string[];
  readonly boundedCurrentizationSourceTests: readonly string[];
  readonly boundedCurrentizationTests: readonly {
    readonly path: string;
    readonly sunset: string;
  }[];
  readonly evidenceRoutingSources: readonly string[];
};

assert.equal(plan.allSourceTests.length, 569, "G11-S2 FULL remains exact 569");
assert.equal(plan.currentSourceTests.length, 43, "G11-S2 RED-1/2: CURRENT must contract from 370 to exact 43");
assert.equal(plan.machineReferencedSourceTests.length, 111, "evidence-reference diagnostic remains exact 111");
assert.deepEqual(plan.currentSourceTests, EXPECTED_TARGET_CURRENT, "G11-S2 RED-2: exact CURRENT identity, not count only");
assert.deepEqual(
  executionPlan.nativeVerifiedByCurrentSourceTests,
  EXPECTED_NATIVE_VERIFIED_BY,
  "native verified_by projection owns exact 35 CURRENT tests",
);
assert.deepEqual(
  executionPlan.currentAssuranceSourceTests,
  EXPECTED_CURRENT_ASSURANCE,
  "G14 sunset: explicit current-assurance owner set is exact 8",
);
assert.deepEqual(
  executionPlan.boundedCurrentizationSourceTests,
  EXPECTED_BOUNDED.map((item) => item.path).sort(),
  "G14 sunset: bounded currentization owner set is empty",
);
assert.deepEqual(
  executionPlan.boundedCurrentizationTests,
  EXPECTED_BOUNDED,
  "G14 sunset: obsolete bounded-currentization metadata is retired",
);

for (const path of G14_TRANSITIONED_CURRENT_ASSURANCE) {
  assert.equal(
    executionPlan.currentAssuranceSourceTests.includes(path),
    true,
    `G14 sunset role transition: CURRENT_ASSURANCE owns exact path: ${path}`,
  );
  assert.equal(
    executionPlan.boundedCurrentizationSourceTests.includes(path),
    false,
    `G14 sunset role transition: BOUNDED_CURRENTIZATION no longer owns exact path: ${path}`,
  );
  assert.equal(
    plan.currentSourceTests.includes(path),
    true,
    `G14 sunset role transition: exact path remains CURRENT: ${path}`,
  );
  assert.equal(
    plan.allSourceTests.includes(path),
    true,
    `G14 sunset role transition: exact path remains FULL: ${path}`,
  );
}
assert.ok(
  executionPlan.evidenceRoutingSources.includes("theorems/current-v0.15.json"),
  "current theorem capsule remains an evidence-routing surface",
);
assert.equal(
  executionPlan.evidenceRoutingSources.includes("theorems/current-v0.14.json"),
  false,
  "historical v0.14 theorem index is not a current evidence-routing surface",
);
assert.equal(
  executionPlan.evidenceRoutingSources.includes("theorems/registry.json"),
  false,
  "historical v0.13 theorem registry is not a current evidence-routing surface",
);

const allSet = new Set(plan.allSourceTests);
const currentSet = new Set(plan.currentSourceTests);
const referencedSet = new Set(plan.machineReferencedSourceTests);

for (const path of EXPECTED_TARGET_CURRENT) {
  assert.ok(allSet.has(path), `accepted CURRENT target must physically exist: ${path}`);
}
for (const path of plan.currentSourceTests) {
  assert.ok(allSet.has(path), `CURRENT path must be in FULL: ${path}`);
}
for (const path of plan.machineReferencedSourceTests) {
  assert.ok(allSet.has(path), `evidence-referenced test must physically exist: ${path}`);
}

assert.equal(
  currentSet.has("ts/test/v016-functional-formal-t09.test.ts"),
  false,
  "G11-S2 RED-1: v0.16 development witness must leave CURRENT despite non-research filename",
);
assert.ok(
  allSet.has("ts/test/v016-functional-formal-t09.test.ts"),
  "G11-S2 RED-1: v0.16 development witness remains FULL",
);
assert.equal(
  currentSet.has("ts/test/v015-semantic-metamodel-evidence-verifier.test.ts"),
  false,
  "historical v01 remains FULL-only",
);
assert.ok(
  allSet.has("ts/test/v015-semantic-metamodel-evidence-verifier.test.ts"),
  "historical v01 remains physically executable in FULL",
);
assert.equal(
  currentSet.has("ts/test/v015-semantic-metamodel-evidence-verifier-v02.test.ts"),
  true,
  "v02 remains CURRENT through explicit current assurance",
);

const f3bWitness = "ts/test/research-v013-explicit-zero-image-a72y.test.ts";
assert.equal(referencedSet.has(f3bWitness), true, "F3B witness remains evidence-referenced");
assert.equal(currentSet.has(f3bWitness), false, "G11-S2 RED-8: F3B evidence witness must leave CURRENT");
assert.equal(allSet.has(f3bWitness), true, "F3B witness remains FULL");

assert.deepEqual(selectTestTier(plan, "full"), plan.allSourceTests);
assert.deepEqual(selectTestTier(plan, "current"), plan.currentSourceTests);

const classify = classifyTestPaths as unknown as (
  allSourceTests: readonly string[],
  evidenceReferencedSourceTests: readonly string[],
  explicitCurrentSourceTests: readonly string[],
) => ReturnType<typeof classifyTestPaths>;

const synthetic = classify(
  [
    "ts/test/core.test.ts",
    "ts/test/ownerless.test.ts",
    "ts/test/research-evidence.test.ts",
    "ts/test/v015-semantic-metamodel-evidence-verifier.test.ts",
  ],
  ["ts/test/research-evidence.test.ts"],
  ["ts/test/core.test.ts"],
);
assert.deepEqual(
  synthetic.currentSourceTests,
  ["ts/test/core.test.ts"],
  "G11-S2 RED-4: arbitrary non-research filename does not create execution authority",
);
assert.equal(
  synthetic.currentSourceTests.includes("ts/test/research-evidence.test.ts"),
  false,
  "evidence reference alone does not create CURRENT",
);
assert.equal(
  synthetic.currentSourceTests.includes("ts/test/ownerless.test.ts"),
  false,
  "physical existence and non-research filename do not create CURRENT",
);

assert.throws(
  () => classify(["ts/test/core.test.ts"], ["ts/test/missing.test.ts"], ["ts/test/core.test.ts"]),
  /machine-readable evidence references missing test/,
  "evidence target existence remains fail-closed",
);
assert.throws(
  () => classify(["ts/test/core.test.ts"], [], ["ts/test/missing.test.ts"]),
  /current.*missing|missing.*current/i,
  "selected CURRENT path must exist physically",
);
assert.throws(
  () => classify(
    ["ts/test/v015-semantic-metamodel-evidence-verifier.test.ts"],
    [],
    ["ts/test/v015-semantic-metamodel-evidence-verifier.test.ts"],
  ),
  /historical.*current|current.*historical/i,
  "historical v01 cannot be selected as CURRENT",
);
assert.throws(
  () => classify(["ts/test/core.test.ts"], [], ["ts/test/nested/core.test.ts"]),
  /invalid.*test path|test path.*invalid|missing/i,
  "execution selector accepts only flat ts/test/*.test.ts paths",
);

const fixtureRoot = mkdtempSync(join(tmpdir(), "mts-test-tier-s2-"));
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
  assert.equal(currentMarkdownSurface.length, 12);
  for (const path of currentMarkdownSurface) copy(path);

  const nativeV015RequirementPaths = readdirSync(resolve(repositoryRoot, "requirements/mts-v0.15"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".rg.yaml"))
    .map((entry) => `requirements/mts-v0.15/${entry.name}`)
    .sort((left, right) => left.localeCompare(right, "en"));
  assert.equal(nativeV015RequirementPaths.length, 48);
  for (const path of nativeV015RequirementPaths) copy(path);

  for (const path of plan.allSourceTests) {
    const target = resolve(fixtureRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, "", "utf8");
  }

  const fixturePlan = buildTestTierPlan(fixtureRoot);
  assert.deepEqual(fixturePlan, plan, "isolated accepted fixture reproduces exact repository plan");

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
      for (const item of Object.values(value)) removed += removeExactReference(item, target);
      return removed;
    }
    return 0;
  };

  const historicalTheoremPath = resolve(fixtureRoot, "theorems/current-v0.14.json");
  const historicalTheoremSource = readFileSync(historicalTheoremPath, "utf8");
  const historicalTheoremMutation = JSON.parse(historicalTheoremSource) as any;
  assert.equal(removeExactReference(historicalTheoremMutation, f3bWitness), 2);
  writeFileSync(historicalTheoremPath, JSON.stringify(historicalTheoremMutation), "utf8");
  assert.deepEqual(
    buildTestTierPlan(fixtureRoot),
    fixturePlan,
    "historical theorem-index mutation remains execution/evidence-routing neutral",
  );
  writeFileSync(historicalTheoremPath, historicalTheoremSource, "utf8");

  const currentTheoremPath = resolve(fixtureRoot, "theorems/current-v0.15.json");
  const currentTheoremSource = readFileSync(currentTheoremPath, "utf8");
  const currentTheoremMutation = JSON.parse(currentTheoremSource) as any;
  assert.equal(removeExactReference(currentTheoremMutation, f3bWitness), 2);
  writeFileSync(currentTheoremPath, JSON.stringify(currentTheoremMutation), "utf8");
  const theoremRemovalPlan = buildTestTierPlan(fixtureRoot);
  assert.deepEqual(
    theoremRemovalPlan.currentSourceTests,
    fixturePlan.currentSourceTests,
    "G11-S2 RED-6: theorem evidence removal must not change CURRENT",
  );
  assert.equal(
    theoremRemovalPlan.machineReferencedSourceTests.length,
    fixturePlan.machineReferencedSourceTests.length - 1,
    "theorem evidence removal changes diagnostics only",
  );
  writeFileSync(currentTheoremPath, currentTheoremSource, "utf8");

  const conformanceWitness = "ts/test/research-v012-interpreter-delta-c2.test.ts";
  const conformancePath = resolve(fixtureRoot, "contracts/mts-conformance-v0.15.json");
  const conformanceSource = readFileSync(conformancePath, "utf8");
  const conformanceMutation = JSON.parse(conformanceSource) as any;
  assert.ok(removeExactReference(conformanceMutation, conformanceWitness) > 0);
  writeFileSync(conformancePath, JSON.stringify(conformanceMutation), "utf8");
  const conformanceRemovalPlan = buildTestTierPlan(fixtureRoot);
  assert.deepEqual(
    conformanceRemovalPlan.currentSourceTests,
    fixturePlan.currentSourceTests,
    "G11-S2 RED-6: conformance evidence removal must not change CURRENT",
  );
  assert.equal(
    conformanceRemovalPlan.machineReferencedSourceTests.length,
    fixturePlan.machineReferencedSourceTests.length - 1,
    "conformance evidence removal changes diagnostics only",
  );
  writeFileSync(conformancePath, conformanceSource, "utf8");

  const evidenceOnly = "ts/test/research-v013-context-dualization-a75b.test.ts";
  const evidenceAddition = JSON.parse(currentTheoremSource) as any;
  evidenceAddition.g11S2EvidenceOnlyProbe = evidenceOnly;
  writeFileSync(currentTheoremPath, JSON.stringify(evidenceAddition), "utf8");
  const evidenceAdditionPlan = buildTestTierPlan(fixtureRoot);
  assert.deepEqual(
    evidenceAdditionPlan.currentSourceTests,
    fixturePlan.currentSourceTests,
    "G11-S2 RED-6: evidence addition must not promote CURRENT",
  );
  assert.equal(
    evidenceAdditionPlan.machineReferencedSourceTests.length,
    fixturePlan.machineReferencedSourceTests.length + 1,
    "evidence addition changes diagnostics only",
  );
  writeFileSync(currentTheoremPath, currentTheoremSource, "utf8");

  const v02 = "ts/test/v015-semantic-metamodel-evidence-verifier-v02.test.ts";
  const v02Addition = JSON.parse(currentTheoremSource) as any;
  v02Addition.g11S2V02EvidenceProbe = v02;
  writeFileSync(currentTheoremPath, JSON.stringify(v02Addition), "utf8");
  const v02EvidencePlan = buildTestTierPlan(fixtureRoot);
  assert.equal(v02EvidencePlan.currentSourceTests.includes(v02), true);
  assert.deepEqual(
    v02EvidencePlan.currentSourceTests,
    fixturePlan.currentSourceTests,
    "v02 remains CURRENT because of explicit assurance, not evidence coordinates",
  );
  assert.equal(
    v02EvidencePlan.machineReferencedSourceTests.length,
    fixturePlan.machineReferencedSourceTests.length + 1,
  );
  writeFileSync(currentTheoremPath, currentTheoremSource, "utf8");

  const docsNativePath = resolve(fixtureRoot, "requirements/mts-v0.15/V15-DOCS-01.rg.yaml");
  const docsNativeSource = readFileSync(docsNativePath, "utf8");
  const nativeWitness = "ts/test/docs-size-budget.test.ts";
  const nativeNeedle = [
    "  - predicates: [verified_by]",
    "    target:",
    "      kind: artifact",
    `      path: ${nativeWitness}`,
  ].join("\n");
  const nativeReplacement = [
    "  - predicates: [implemented_by]",
    "    target:",
    "      kind: artifact",
    `      path: ${nativeWitness}`,
  ].join("\n");
  assert.ok(docsNativeSource.includes(nativeNeedle), "fixture contains isolated native verified_by witness");
  writeFileSync(docsNativePath, docsNativeSource.replace(nativeNeedle, nativeReplacement), "utf8");
  const nativeMutationPlan = buildTestTierPlan(fixtureRoot) as typeof executionPlan;
  assert.equal(
    nativeMutationPlan.nativeVerifiedByCurrentSourceTests.includes(nativeWitness),
    false,
    "G11-S2 RED-3: native verified_by removal removes native execution authority",
  );
  assert.equal(
    nativeMutationPlan.machineReferencedSourceTests.includes(nativeWitness),
    true,
    "traceability/conformance evidence may still mention witness diagnostically",
  );
  assert.equal(
    nativeMutationPlan.currentSourceTests.includes(nativeWitness),
    false,
    "traceability mirror must not repair removed native execution authority",
  );
  assert.equal(nativeMutationPlan.currentSourceTests.length, 42);
  writeFileSync(docsNativePath, docsNativeSource, "utf8");

  const boundedPath = resolve(fixtureRoot, "ts/test/portable-derivation.test.ts");
  rmSync(boundedPath);
  assert.throws(
    () => buildTestTierPlan(fixtureRoot),
    /current.*missing|missing.*current/i,
    "G14 sunset: missing transitioned current-assurance test fails closed",
  );
  writeFileSync(boundedPath, "", "utf8");

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
  policy.packs["contract-conformance"].acceptance.document.path = "cutover/typescript-c1-acceptance-v0.7.json";
  writeFileSync(policyPath, JSON.stringify(policy), "utf8");
  assert.deepEqual(
    buildTestTierPlan(fixtureRoot),
    fixturePlan,
    "repo-policy mutations remain irrelevant to test-tier selection",
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
    "accepted native authority inconsistency remains fail-closed",
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
  );
  writeFileSync(contractPath, contractSource, "utf8");

  const traceabilityMismatch = JSON.parse(contractSource) as any;
  traceabilityMismatch.traceabilityManifest = "traceability/mts-v0.14.json";
  writeFileSync(contractPath, JSON.stringify(traceabilityMismatch), "utf8");
  assert.throws(
    () => buildTestTierPlan(fixtureRoot),
    /v0\.15 contract traceabilityManifest differs from accepted traceability path/,
  );
  writeFileSync(contractPath, contractSource, "utf8");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log(
  [
    "G11-S2 test tiers: GREEN",
    `full=${plan.allSourceTests.length}`,
    `current=${plan.currentSourceTests.length}`,
    `native-verified-by=${executionPlan.nativeVerifiedByCurrentSourceTests.length}`,
    `current-assurance=${executionPlan.currentAssuranceSourceTests.length}`,
    `bounded-currentization=${executionPlan.boundedCurrentizationSourceTests.length}`,
    `machine-referenced=${plan.machineReferencedSourceTests.length}`,
  ].join(" "),
);
