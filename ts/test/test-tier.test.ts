import assert from "node:assert/strict";
import { resolve } from "node:path";
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

console.log(
  [
    "R2 test tiers: GREEN",
    `full=${plan.allSourceTests.length}`,
    `current=${plan.currentSourceTests.length}`,
    `machine-referenced=${plan.machineReferencedSourceTests.length}`,
    `historical-research=${plan.historicalResearchSourceTests.length}`,
  ].join(" "),
);
