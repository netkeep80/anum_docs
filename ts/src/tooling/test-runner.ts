import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildTestTierPlan, runS18FixtureWitness, selectTestTier, type TestTier,
} from "./test-tier.js";

function fail(message: string): never {
  throw new Error(`test-runner: ${message}`);
}

function sortedTests(directory: string, suffix: string): string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith(suffix))
    .sort();
}

function parseTier(args: readonly string[]): TestTier {
  if (args.length === 0) return "full";
  if (args.length !== 1 || !args[0]?.startsWith("--tier=")) {
    fail("usage: test-runner [--tier=current|full]");
  }
  const value = args[0].slice("--tier=".length);
  if (value !== "current" && value !== "full") {
    fail(`unsupported tier: ${value}`);
  }
  return value;
}

const tier = parseTier(process.argv.slice(2));
const repositoryRoot = resolve("..");
const sourceDirectory = resolve("test");
const builtDirectory = resolve("dist/test");
const sourceTests = sortedTests(sourceDirectory, ".test.ts");
const builtTests = sortedTests(builtDirectory, ".test.js");

const expectedBuiltTests = sourceTests.map((name) => name.replace(/\.ts$/, ".js"));
if (JSON.stringify(expectedBuiltTests) !== JSON.stringify(builtTests)) {
  fail(
    `source/built test sets differ\nsource: ${expectedBuiltTests.join(", ")}\nbuilt: ${builtTests.join(", ")}`,
  );
}
if (builtTests.length === 0) fail("no tests discovered");

const plan = buildTestTierPlan(repositoryRoot);
const selectedSourcePaths = selectTestTier(plan, tier);
const selectedBuiltTests = selectedSourcePaths.map((path) =>
  path.slice("ts/test/".length).replace(/\.ts$/, ".js")
);

console.log(
  [
    `Test tier: ${tier}`,
    `selected=${selectedBuiltTests.length}/${plan.allSourceTests.length}`,
    `machine-referenced=${plan.machineReferencedSourceTests.length}`,
    `historical-research-full-only=${plan.historicalResearchSourceTests.length}`,
  ].join(" "),
);

// S18: five existing FULL-only conformance consumers and their eight inputs.
const s18FullFixtures: Readonly<Record<string, readonly string[]>> = {
  "anum-two-memory-conformance.test.js": [
    "examples/anum/conformance/q-flat-110.anum",
  ],
  "quaternary-anum-hierarchical-two-memory.test.js": [
    "examples/anum/conformance/q-hierarchical-byte-4d.anum",
    "examples/anum/conformance/q-hierarchical-relative-indirect.anum",
    "examples/anum/conformance/q-hierarchical-adjacent-bytes.anum",
    "examples/anum/conformance/q-hierarchical-nested-byte-pair.anum",
  ],
  "string-anum-two-memory-conformance.test.js": [
    "examples/anum/conformance/string-flat-ab.string.anum",
  ],
  "v012-string-utf8-boundary.test.js": [
    "examples/anum/conformance/string-utf8-mixed.string.anum",
  ],
  "v013-file-wire-conformance.test.js": [
    "examples/anum/conformance/v013-structural-1968698.anum",
  ],
};
if (tier === "full") {
  for (const name of Object.keys(s18FullFixtures)) {
    if (!selectedBuiltTests.includes(name))
      fail("S18 mandatory FULL conformance consumer is absent: " + name);
  }
}
const selectedBuiltSet = new Set(selectedBuiltTests);
for (const test of builtTests) {
  if (!selectedBuiltSet.has(test)) continue;
  console.log(`\n[test] ${test}`);
  const requiredS18Inputs = tier === "full" ? s18FullFixtures[test] : undefined;
  if (requiredS18Inputs !== undefined) {
    runS18FixtureWitness(join(builtDirectory, test), requiredS18Inputs, repositoryRoot);
    continue;
  }
  const result = spawnSync(process.execPath, [join(builtDirectory, test)], {
    stdio: "inherit",
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.signal !== null) {
    fail(`${test} terminated by signal ${result.signal}`);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(
  `\nExecuted ${selectedBuiltTests.length} tests from ${tier} tier; full suite has ${builtTests.length} tests.`,
);
