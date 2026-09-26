import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  insertMarkdownChild,
  listMarkdownAnchorIds,
  listMarkdownChildren,
  listRepositoryMarkdownSurface,
  readMarkdownNode,
  readOwnedMarkdownBlock,
  replaceOwnedMarkdownSection,
  resolveMarkdownAnchor,
} from "../src/tooling/markdown-section-adapter.js";

const root = resolve(process.cwd(), "..");
const expect = (fn: () => unknown, pattern: RegExp, message?: string): void => {
  assert.throws(fn, pattern, message);
};

const markdownDb = [
  "# Документ",
  '<a id="root"></a>',
  "Авторский текст корня.",
  "",
  "## Первый раздел",
  '<a id="node-a"></a>',
  "Авторский payload A.",
  "",
  "### Дочерний раздел",
  '<a id="node-a-child"></a>',
  "Дочерний payload.",
  "",
  "## Второй раздел",
  '<a id="node-b"></a>',
  "Авторский payload B.",
  "",
  "```html",
  '<a id="fake"></a>',
  "<!-- мтс:требование:FAKE:начало -->",
  "<!-- мтс:требование:FAKE:конец -->",
  "```",
].join("\n");

const pathOf = (id: string): Array<[number, string]> =>
  resolveMarkdownAnchor(markdownDb, id).headingPath.map((x) => [x.level, x.title]);

assert.deepEqual(pathOf("node-a"), [[1, "Документ"], [2, "Первый раздел"]]);
assert.deepEqual(pathOf("node-a-child"), [
  [1, "Документ"],
  [2, "Первый раздел"],
  [3, "Дочерний раздел"],
]);
expect(() => resolveMarkdownAnchor(markdownDb, "fake"), /anchor not found/);

const firstWrite = replaceOwnedMarkdownSection({
  source: markdownDb,
  mode: "hybrid",
  anchorId: "node-a",
  blockId: "REQ_A",
  generatedContent: "> generated A",
});
assert.match(readOwnedMarkdownBlock(firstWrite, "REQ_A")?.content ?? "", /> generated A/);
for (const text of ["Авторский payload A.", "Дочерний payload.", "Авторский payload B."]) {
  assert.ok(firstWrite.includes(text), `authored text must survive: ${text}`);
}

const secondWrite = replaceOwnedMarkdownSection({
  source: firstWrite,
  mode: "hybrid",
  anchorId: "node-a",
  blockId: "REQ_A",
  generatedContent: "> generated A v2",
});
assertOutsideOwnedBlockUnchanged(firstWrite, secondWrite, "REQ_A");
assert.match(secondWrite, /> generated A v2/);
assert.equal(
  replaceOwnedMarkdownSection({
    source: secondWrite,
    mode: "hybrid",
    anchorId: "node-a",
    blockId: "REQ_A",
    generatedContent: "> generated A v2",
  }),
  secondWrite,
);

for (const mode of ["source", "generated"] as const) {
  expect(
    () => replaceOwnedMarkdownSection({
      source: markdownDb,
      mode,
      anchorId: "node-a",
      blockId: "REQ_A",
      generatedContent: "> forbidden",
    }),
    mode === "source" ? /SOURCE document is read-only/ : /whole-file GENERATED mode is not supported/,
  );
}
expect(() => resolveMarkdownAnchor(markdownDb + '\n<a id="node-a"></a>\n', "node-a"), /anchor is duplicated/);
expect(
  () => readOwnedMarkdownBlock(
    markdownDb.replace("Авторский payload A.", "Авторский payload A.\n<!-- мтс:требование:REQ_A:начало -->"),
    "REQ_A",
  ),
  /malformed owned block/,
);

const treeDb = [
  '<a id="db-root"></a>',
  "# Корень БД",
  "Корневой payload.",
  "",
  '<a id="db-a"></a>',
  "<!-- мтс:требование:META_A:начало -->",
  "> служебная метаинформация",
  "<!-- мтс:требование:META_A:конец -->",
  "## Узел A",
  "Авторский payload A.",
  "",
  '<a id="db-a1"></a>',
  "### Узел A1",
  "Авторский payload A1.",
  "",
  '<a id="db-b"></a>',
  "## Узел B",
  "Авторский payload B.",
  "",
  "```md",
  '<a id="db-fake"></a>',
  "## Ложный узел",
  "```",
].join("\n");

assert.deepEqual(listMarkdownAnchorIds(treeDb), ["db-root", "db-a", "db-a1", "db-b"]);
const rootNode = readMarkdownNode(treeDb, "db-root");
const aNode = readMarkdownNode(treeDb, "db-a");
assert.deepEqual(
  aNode.headingPath.map((x) => [x.level, x.title]),
  [[1, "Корень БД"], [2, "Узел A"]],
  "compiler-owned metadata between anchor and heading must not break node addressing",
);
assert.deepEqual(listMarkdownChildren(treeDb, "db-root").map((x) => x.anchorId), ["db-a", "db-b"]);
assert.deepEqual(listMarkdownChildren(treeDb, "db-a").map((x) => x.anchorId), ["db-a1"]);
assert.ok(!aNode.subtree.includes('<a id="db-b"></a>'), "A subtree must end before sibling B anchor");
assert.equal(rootNode.end, treeDb.length);

const withC = insertMarkdownChild({
  source: treeDb,
  mode: "hybrid",
  parentAnchorId: "db-root",
  child: { anchorId: "db-c", title: "Узел C", payload: "Новый payload C." },
});
assert.deepEqual(listMarkdownChildren(withC, "db-root").map((x) => x.anchorId), ["db-a", "db-b", "db-c"]);
for (const id of listMarkdownAnchorIds(treeDb)) resolveMarkdownAnchor(withC, id);
for (const text of ["Корневой payload.", "Авторский payload A.", "Авторский payload A1.", "Авторский payload B."]) {
  assert.ok(withC.includes(text), `insertChild must preserve authored text: ${text}`);
}

const withA2 = insertMarkdownChild({
  source: treeDb,
  mode: "hybrid",
  parentAnchorId: "db-a",
  child: { anchorId: "db-a2", title: "Узел A2", payload: "Новый payload A2." },
});
assert.deepEqual(listMarkdownChildren(withA2, "db-a").map((x) => x.anchorId), ["db-a1", "db-a2"]);
assert.ok(
  withA2.indexOf('<a id="db-a2"></a>') < withA2.indexOf('<a id="db-b"></a>'),
  "new grandchild must be inserted before the next sibling subtree",
);
assert.equal(
  withA2.slice(withA2.indexOf('<a id="db-b"></a>')),
  treeDb.slice(treeDb.indexOf('<a id="db-b"></a>')),
  "bytes after the insertion boundary must be unchanged",
);

expect(
  () => insertMarkdownChild({
    source: treeDb,
    mode: "source",
    parentAnchorId: "db-root",
    child: { anchorId: "blocked", title: "Нельзя" },
  }),
  /SOURCE document is read-only/,
);
expect(
  () => insertMarkdownChild({
    source: treeDb,
    mode: "generated",
    parentAnchorId: "db-root",
    child: { anchorId: "blocked", title: "Нельзя" },
  }),
  /GENERATED mode is not supported/,
);
expect(
  () => insertMarkdownChild({
    source: treeDb,
    mode: "hybrid",
    parentAnchorId: "db-root",
    child: { anchorId: "db-a", title: "Дубликат" },
  }),
  /anchor is duplicated/,
);
expect(
  () => insertMarkdownChild({
    source: treeDb,
    mode: "hybrid",
    parentAnchorId: "db-root",
    child: { anchorId: "bad-payload", title: "Плохой", payload: "## скрытая ветка" },
  }),
  /payload cannot contain headings/,
);
expect(
  () => insertMarkdownChild({
    source: treeDb,
    mode: "hybrid",
    parentAnchorId: "db-root",
    child: { anchorId: "bad-anchor", title: "Плохой", payload: '<a id="hidden"></a>' },
  }),
  /payload cannot contain headings or stable anchors/,
);
const levelSix = treeDb + '\n<a id="deep"></a>\n###### Глубина 6\n';
expect(
  () => insertMarkdownChild({
    source: levelSix,
    mode: "hybrid",
    parentAnchorId: "deep",
    child: { anchorId: "too-deep", title: "Слишком глубоко" },
  }),
  /heading level 6 cannot have/,
);
const malformedNode = treeDb + '\n<a id="orphan"></a>\nне заголовок\n';
expect(() => readMarkdownNode(malformedNode, "orphan"), /not a canonical tree node/);
expect(() => readMarkdownNode(treeDb, "db-fake"), /anchor not found/);

const surface = listRepositoryMarkdownSurface(root);
assert.equal(new Set(surface).size, surface.length);
assert.ok(surface.includes("docs/research/Исходные мысли МТС.md"));
assert.ok(surface.includes("docs/theory/Система аксиом МТС.md"));

const ir = loadMtsSemanticIr(root);
assert.equal(ir.contract, "mts-contract/v0.13");
assert.deepEqual(ir.requirements.map((x) => x.id), [
  "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10", "L11", "L12", "L13",
]);
assert.equal(Object.values(ir.documentModes).includes("generated"), false);

const l4 = ir.requirements.find((x) => x.id === "L4");
assert.ok(l4);
assert.equal(l4.classificationPath, "representation/recursive-alphabet/prefix-codec");
assert.equal(l4.statementDigest, "f740e98eade6204d");
assert.deepEqual(
  [l4.positiveVectorCount, l4.negativeVectorCount, l4.executableGateCount],
  [7, 1, 2],
);
assert.match(renderRequirementProjection(l4), /мтс:требование:L4:начало/);

for (const item of ir.requirements) {
  const source = readFileSync(resolve(root, item.docPath), "utf8");
  assert.equal(upsertRequirementProjection(source, item, ir.documentModes[item.docPath]), source);
}
assert.deepEqual(compileRequirementDocuments(root, false), []);

const tempRoot = mkdtempSync(resolve(tmpdir(), "mts-compiler-"));
const copy = (path: string): void => {
  const target = resolve(tempRoot, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(resolve(root, path), "utf8"), "utf8");
};
const readRegistry = (): any =>
  JSON.parse(readFileSync(resolve(tempRoot, "requirements/mts-v0.13.json"), "utf8"));
const writeRegistry = (value: unknown): void =>
  writeFileSync(resolve(tempRoot, "requirements/mts-v0.13.json"), JSON.stringify(value), "utf8");

try {
  for (const path of [
    "repo-policy.json",
    "contracts/mts-contract-v0.13.json",
    "traceability/mts-v0.13.json",
    "requirements/mts-v0.13.json",
    ...surface,
  ]) copy(path);

  const contractPath = resolve(tempRoot, "contracts/mts-contract-v0.13.json");
  const contractSource = readFileSync(contractPath, "utf8");
  const contract = JSON.parse(contractSource);
  contract.requiredSemanticLaws.L4 += " changed";
  writeFileSync(contractPath, JSON.stringify(contract), "utf8");
  assert.deepEqual(compileRequirementDocuments(tempRoot, false), ["docs/specs/Ачисла и сериализация.md"]);
  writeFileSync(contractPath, contractSource, "utf8");

  const tracePath = resolve(tempRoot, "traceability/mts-v0.13.json");
  const traceSource = readFileSync(tracePath, "utf8");
  const trace = JSON.parse(traceSource);
  trace.invariants.L4.requiredExecutableGates.push("ts/test/synthetic-gate.test.ts");
  writeFileSync(tracePath, JSON.stringify(trace), "utf8");
  assert.deepEqual(compileRequirementDocuments(tempRoot, false), ["docs/specs/Ачисла и сериализация.md"]);
  writeFileSync(tracePath, traceSource, "utf8");

  const registryPath = resolve(tempRoot, "requirements/mts-v0.13.json");
  const registrySource = readFileSync(registryPath, "utf8");
  const changedClass = readRegistry();
  changedClass.requirements.find((x: any) => x.id === "L4").classification.path += "-v2";
  writeRegistry(changedClass);
  assert.deepEqual(compileRequirementDocuments(tempRoot, false), ["docs/specs/Ачисла и сериализация.md"]);
  writeFileSync(registryPath, registrySource, "utf8");

  const rogue = resolve(tempRoot, "docs/Новый неизвестный документ.md");
  writeFileSync(rogue, "# Новый документ\n", "utf8");
  expect(() => loadMtsSemanticIr(tempRoot), /Markdown document surface differs/);
  rmSync(rogue);

  const cases: Array<[(r: any) => void, RegExp]> = [
    [(r) => { r.documentSurface["docs/specs/Ачисла и сериализация.md"].mode = "source"; }, /must be HYBRID/],
    [(r) => { r.documentSurface["docs/specs/Ачисла и сериализация.md"].mode = "generated"; }, /GENERATED mode is forbidden/],
    [(r) => { r.requirements.find((x: any) => x.id === "L4").classification.path = "flat"; }, /hierarchical path/],
    [(r) => { r.requirements.find((x: any) => x.id === "L4").dependsOn = ["NO_SUCH"]; }, /unknown requirement/],
    [(r) => { r.requirements.find((x: any) => x.id === "L4").docProjection.path = "docs/specs/Формальная нотация МТС.md"; }, /differs from accepted normative owner/],
  ];
  for (const [mutate, pattern] of cases) {
    const registry = readRegistry();
    mutate(registry);
    writeRegistry(registry);
    expect(() => loadMtsSemanticIr(tempRoot), pattern);
    writeFileSync(registryPath, registrySource, "utf8");
  }

  assert.deepEqual(compileRequirementDocuments(tempRoot, false), []);
  assert.deepEqual(compileRequirementDocuments(tempRoot, true), []);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log("MTS Compiler P2: GREEN REQUIREMENTS=13 MARKDOWN_TREE_DB=GREEN INSERT_CHILD=GREEN AUTHORED_BYTES_PRESERVED=GREEN");
