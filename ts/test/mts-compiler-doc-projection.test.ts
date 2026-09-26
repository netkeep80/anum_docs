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
import {
  assertOutsideOwnedBlockUnchanged,
  listRepositoryMarkdownSurface,
  readOwnedMarkdownBlock,
  replaceOwnedMarkdownSection,
  resolveMarkdownAnchor,
} from "../src/tooling/markdown-section-adapter.js";

const root = resolve(process.cwd(), "..");

const markdownDb = [
  "# Документ",
  "<a id=\"root\"></a>",
  "Авторский текст корня.",
  "",
  "## Первый раздел",
  "<a id=\"node-a\"></a>",
  "Авторский payload A.",
  "",
  "### Дочерний раздел",
  "<a id=\"node-a-child\"></a>",
  "Дочерний payload.",
  "",
  "## Второй раздел",
  "<a id=\"node-b\"></a>",
  "Авторский payload B.",
  "",
  "```html",
  "<a id=\"fake\"></a>",
  "<!-- mts:req:FAKE:begin -->",
  "<!-- mts:req:FAKE:end -->",
  "```",
].join("\n");

const nodeA = resolveMarkdownAnchor(markdownDb, "node-a");
assert.deepEqual(
  nodeA.headingPath.map((item) => [item.level, item.title]),
  [[1, "Документ"], [2, "Первый раздел"]],
  "anchor address must expose hierarchical heading path",
);
const child = resolveMarkdownAnchor(markdownDb, "node-a-child");
assert.deepEqual(
  child.headingPath.map((item) => [item.level, item.title]),
  [[1, "Документ"], [2, "Первый раздел"], [3, "Дочерний раздел"]],
  "child address must preserve tree ancestry",
);
assert.throws(() => resolveMarkdownAnchor(markdownDb, "fake"), /anchor not found/, "code-fence anchors are not database nodes");

const firstWrite = replaceOwnedMarkdownSection({
  source: markdownDb,
  mode: "hybrid",
  anchorId: "node-a",
  blockId: "REQ_A",
  generatedContent: "> generated A",
});
const firstBlock = readOwnedMarkdownBlock(firstWrite, "REQ_A");
assert.ok(firstBlock);
assert.match(firstBlock.content, /> generated A/);
assert.match(firstWrite, /Авторский payload A\./, "authored payload must survive insertion");
assert.match(firstWrite, /Дочерний payload\./, "child subtree must survive insertion");
assert.match(firstWrite, /Авторский payload B\./, "sibling subtree must survive insertion");

const secondWrite = replaceOwnedMarkdownSection({
  source: firstWrite,
  mode: "hybrid",
  anchorId: "node-a",
  blockId: "REQ_A",
  generatedContent: "> generated A v2",
});
assertOutsideOwnedBlockUnchanged(firstWrite, secondWrite, "REQ_A");
assert.match(secondWrite, /> generated A v2/);
assert.doesNotMatch(secondWrite, /> generated A\n/);

assert.equal(
  replaceOwnedMarkdownSection({
    source: secondWrite,
    mode: "hybrid",
    anchorId: "node-a",
    blockId: "REQ_A",
    generatedContent: "> generated A v2",
  }),
  secondWrite,
  "same write must be idempotent",
);

assert.throws(
  () => replaceOwnedMarkdownSection({
    source: markdownDb,
    mode: "source",
    anchorId: "node-a",
    blockId: "REQ_A",
    generatedContent: "> forbidden",
  }),
  /SOURCE document is read-only/,
  "SOURCE documents are immutable through the adapter",
);
assert.throws(
  () => replaceOwnedMarkdownSection({
    source: markdownDb,
    mode: "generated",
    anchorId: "node-a",
    blockId: "REQ_A",
    generatedContent: "> forbidden",
  }),
  /whole-file GENERATED mode is not supported/,
  "P1 must not silently gain whole-file overwrite authority",
);

const duplicateAnchor = markdownDb + "\n<a id=\"node-a\"></a>\n";
assert.throws(() => resolveMarkdownAnchor(duplicateAnchor, "node-a"), /anchor is duplicated/);

const malformedBlock = markdownDb.replace(
  "Авторский payload A.",
  "Авторский payload A.\n<!-- mts:req:REQ_A:begin -->",
);
assert.throws(() => readOwnedMarkdownBlock(malformedBlock, "REQ_A"), /malformed owned block/);

const surface = listRepositoryMarkdownSurface(root);
assert.equal(new Set(surface).size, surface.length, "Markdown surface paths must be unique");
assert.ok(surface.includes("docs/research/Исходные мысли МТС.md"));
assert.ok(surface.includes("docs/theory/Система аксиом МТС.md"));

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
    ...listRepositoryMarkdownSurface(root),
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

  const rogueDoc = resolve(tempRoot, "docs/Новый неизвестный документ.md");
  writeFileSync(rogueDoc, "# Новый документ\n", "utf8");
  assert.throws(
    () => loadMtsSemanticIr(tempRoot),
    /Markdown document surface differs/,
    "new Markdown files must be explicitly classified before the compiler can proceed",
  );
  rmSync(rogueDoc);

  const sourceTarget = JSON.parse(originalRegistry) as any;
  sourceTarget.documentSurface["docs/specs/Ачисла и сериализация.md"].mode = "source";
  writeFileSync(registryPath, JSON.stringify(sourceTarget), "utf8");
  assert.throws(
    () => loadMtsSemanticIr(tempRoot),
    /doc projection target must be HYBRID/,
    "requirements must never gain write access to SOURCE documents",
  );
  writeFileSync(registryPath, originalRegistry, "utf8");

  const generatedTarget = JSON.parse(originalRegistry) as any;
  generatedTarget.documentSurface["docs/specs/Ачисла и сериализация.md"].mode = "generated";
  writeFileSync(registryPath, JSON.stringify(generatedTarget), "utf8");
  assert.throws(
    () => loadMtsSemanticIr(tempRoot),
    /whole-file GENERATED mode is forbidden in P1/,
    "whole-file generation must remain impossible in P1",
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
  "MARKDOWN_DB_ADAPTER=GREEN",
  "AUTHORED_BYTES_PRESERVED=GREEN",
  "FAIL_CLOSED=GREEN",
].join(" "));
