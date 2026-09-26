import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import {
  compileRequirementDocuments,
  loadMtsSemanticIr,
  renderRequirementProjection,
  upsertRequirementProjection,
} from "../src/tooling/mts-compiler.js";

const root = resolve(process.cwd(), "..");
const ir = loadMtsSemanticIr(root);

assert.equal(ir.contract, "mts-contract/v0.13");
assert.equal(ir.requirements.length, 13);
assert.deepEqual(ir.requirements.map((item) => item.id), [
  "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10", "L11", "L12", "L13",
]);

const l4 = ir.requirements.find((item) => item.id === "L4");
assert.ok(l4);
assert.equal(l4.classificationPath, "representation/recursive-alphabet/prefix-codec");
assert.equal(l4.statementDigest, "f740e98eade6204d");
assert.equal(l4.positiveVectorCount, 7);
assert.equal(l4.negativeVectorCount, 1);
assert.equal(l4.executableGateCount, 2);
assert.match(renderRequirementProjection(l4), /mts:req:L4:begin/);
assert.match(renderRequirementProjection(l4), /f740e98eade6204d/);

for (const item of ir.requirements) {
  const source = readFileSync(resolve(root, item.docPath), "utf8");
  assert.equal(
    upsertRequirementProjection(source, item),
    source,
    `${item.id}: tracked Markdown must already equal compiled projection`,
  );
}
assert.deepEqual(compileRequirementDocuments(root, false), []);

const tempRoot = mkdtempSync(resolve(tmpdir(), "mts-compiler-"));
const copy = (path: string): void => {
  const target = resolve(tempRoot, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(resolve(root, path), "utf8"), "utf8");
};

try {
  for (const path of [
    "repo-policy.json",
    "contracts/mts-contract-v0.13.json",
    "traceability/mts-v0.13.json",
    "requirements/mts-v0.13.json",
    ...new Set(ir.requirements.map((item) => item.docPath)),
  ]) copy(path);

  const contractPath = resolve(tempRoot, "contracts/mts-contract-v0.13.json");
  const originalContract = readFileSync(contractPath, "utf8");
  const contract = JSON.parse(originalContract) as any;
  contract.requiredSemanticLaws.L4 += " changed";
  writeFileSync(contractPath, JSON.stringify(contract), "utf8");
  assert.deepEqual(
    compileRequirementDocuments(tempRoot, false),
    ["docs/specs/Ачисла и сериализация.md"],
    "semantic statement change must make its compiled Markdown stale",
  );
  writeFileSync(contractPath, originalContract, "utf8");

  const tracePath = resolve(tempRoot, "traceability/mts-v0.13.json");
  const originalTrace = readFileSync(tracePath, "utf8");
  const trace = JSON.parse(originalTrace) as any;
  trace.invariants.L4.requiredExecutableGates.push("ts/test/synthetic-gate.test.ts");
  writeFileSync(tracePath, JSON.stringify(trace), "utf8");
  assert.deepEqual(
    compileRequirementDocuments(tempRoot, false),
    ["docs/specs/Ачисла и сериализация.md"],
    "traceability evidence change must make its compiled Markdown stale",
  );
  writeFileSync(tracePath, originalTrace, "utf8");

  const registryPath = resolve(tempRoot, "requirements/mts-v0.13.json");
  const originalRegistry = readFileSync(registryPath, "utf8");
  const registry = JSON.parse(originalRegistry) as any;
  registry.requirements.find((item: any) => item.id === "L4").classification.path =
    "representation/recursive-alphabet/prefix-codec-v2";
  writeFileSync(registryPath, JSON.stringify(registry), "utf8");
  assert.deepEqual(
    compileRequirementDocuments(tempRoot, false),
    ["docs/specs/Ачисла и сериализация.md"],
    "classification change must make its compiled Markdown stale",
  );
  writeFileSync(registryPath, originalRegistry, "utf8");

  const malformed = JSON.parse(originalRegistry) as any;
  malformed.requirements.find((item: any) => item.id === "L4").classification.path = "flat";
  writeFileSync(registryPath, JSON.stringify(malformed), "utf8");
  assert.throws(() => loadMtsSemanticIr(tempRoot), /classification\.path is not a hierarchical path/);

  const badDependency = JSON.parse(originalRegistry) as any;
  badDependency.requirements.find((item: any) => item.id === "L4").dependsOn = ["NO_SUCH_REQUIREMENT"];
  writeFileSync(registryPath, JSON.stringify(badDependency), "utf8");
  assert.throws(() => loadMtsSemanticIr(tempRoot), /depends on unknown requirement/);

  const wrongOwner = JSON.parse(originalRegistry) as any;
  wrongOwner.requirements.find((item: any) => item.id === "L4").docProjection.path =
    "docs/specs/Формальная нотация МТС.md";
  writeFileSync(registryPath, JSON.stringify(wrongOwner), "utf8");
  assert.throws(() => loadMtsSemanticIr(tempRoot), /doc projection differs from accepted normative owner/);

  writeFileSync(registryPath, originalRegistry, "utf8");
  assert.deepEqual(compileRequirementDocuments(tempRoot, false), []);
  assert.deepEqual(compileRequirementDocuments(tempRoot, true), []);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log([
  "MTS Compiler P1: GREEN",
  "REQUIREMENTS=13",
  "HIERARCHY=VALID",
  "SEMANTIC_DIGEST=BOUND",
  "TRACEABILITY=BOUND",
  "TRACKED_MD=COMPILED",
  "FAIL_CLOSED=GREEN",
].join(" "));
