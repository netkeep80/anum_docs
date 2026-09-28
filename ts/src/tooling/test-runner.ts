import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildTestTierPlan, selectTestTier, type TestTier } from "./test-tier.js";

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

for (const test of selectedBuiltTests) {
  console.log(`\n[test] ${test}`);
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
