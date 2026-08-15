import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

function fail(message: string): never {
  throw new Error(`test-runner: ${message}`);
}

function sortedTests(directory: string, suffix: string): string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith(suffix))
    .sort();
}

const sourceDirectory = resolve("test");
const builtDirectory = resolve("dist/test");
const sourceTests = sortedTests(sourceDirectory, ".test.ts")
  .map((name) => name.slice(0, -3) + "js");
const builtTests = sortedTests(builtDirectory, ".test.js");

if (JSON.stringify(sourceTests) !== JSON.stringify(builtTests)) {
  fail(
    `source/built test sets differ\nsource: ${sourceTests.join(", ")}\nbuilt: ${builtTests.join(", ")}`,
  );
}
if (builtTests.length === 0) fail("no tests discovered");

for (const test of builtTests) {
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

console.log(`\nExecuted ${builtTests.length} discovered tests.`);
