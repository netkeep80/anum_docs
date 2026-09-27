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
assert.equal(ir.schema, "mts-requirement-registry/v0.2");
assert.equal(ir.contract, "mts-contract/v0.14");
assert.equal(ir.projectionState, "MATERIALIZED");
assert.deepEqual(ir.requirements.map((x) => x.id), [
  "V14-L1", "V14-L2", "V14-L3", "V14-L4", "V14-L5", "V14-L6", "V14-L7",
  "V14-L8", "V14-L9", "V14-L10", "V14-L11", "V14-L12", "V14-L13", "V14-L14",
]);
assert.ok(ir.requirements.every((x) => x.status === "accepted"));
assert.equal(Object.values(ir.documentModes).includes("generated"), false);

const a4 = ir.requirements.find((x) => x.id === "V14-L12");
assert.ok(a4);
assert.equal(a4.classificationPath, "theory/foundation/context-relative-chiral-gauge");
assert.match(a4.statementDigest, /^[0-9a-f]{16}$/);
assert.ok(a4.positiveVectorCount > 0);
assert.ok(a4.negativeVectorCount > 0);
assert.ok(a4.executableGateCount > 0);
assert.match(renderRequirementProjection(a4), /мтс:требование:V14-L12:начало/);

const a4Source = [
  markdownDb,
  "",
  '<a id="mts-v014-v14-l12"></a>',
  "## A4 prime",
  "Авторский текст A4.",
].join("\n");
const a4Updated = upsertRequirementProjection(a4Source, a4, "hybrid");
assert.match(a4Updated, /мтс:требование:V14-L12:начало/);
assert.ok(a4Updated.includes("Авторский текст A4."), "compiler projection must preserve authored bytes");

// #1585 materialized all accepted owners; compiler must be idempotent.
assert.deepEqual(compileRequirementDocuments(root, false), []);
assert.deepEqual(compileRequirementDocuments(root, true), []);

const tempRoot = mkdtempSync(resolve(tmpdir(), "mts-compiler-v014-"));
const copy = (path: string): void => {
  const target = resolve(tempRoot, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(resolve(root, path), "utf8"), "utf8");
};
const registryPath = "requirements/mts-v0.14.json";
const readRegistry = (): any =>
  JSON.parse(readFileSync(resolve(tempRoot, registryPath), "utf8"));
const writeRegistry = (value: unknown): void =>
  writeFileSync(resolve(tempRoot, registryPath), JSON.stringify(value), "utf8");

try {
  for (const path of [
    "repo-policy.json",
    "contracts/mts-contract-v0.14.json",
    "traceability/mts-v0.14.json",
    registryPath,
    ...surface,
  ]) copy(path);

  assert.equal(loadMtsSemanticIr(tempRoot).requirements.length, 14);
  assert.deepEqual(compileRequirementDocuments(tempRoot, false), []);
  assert.deepEqual(compileRequirementDocuments(tempRoot, true), []);

  const registrySource = readFileSync(resolve(tempRoot, registryPath), "utf8");
  const cases: Array<[(r: any) => void, RegExp]> = [
    [(r) => { r.schema = "mts-requirement-registry/v9"; }, /unsupported registry schema/],
    [(r) => { r.requirements.find((x: any) => x.id === "V14-L12").classification.path = "flat"; }, /hierarchical path/],
    [(r) => { r.requirements.find((x: any) => x.id === "V14-L12").dependsOn = ["NO_SUCH"]; }, /unknown requirement/],
    [(r) => { r.requirements.find((x: any) => x.id === "V14-L12").docProjection.path = "docs/specs/Формальная нотация МТС.md"; }, /differs from traceability documentation owner/],
    [(r) => { r.requirements = r.requirements.filter((x: any) => x.id !== "V14-L14"); }, /requirement id set differs/],
  ];
  for (const [mutate, pattern] of cases) {
    const registry = readRegistry();
    mutate(registry);
    writeRegistry(registry);
    expect(() => loadMtsSemanticIr(tempRoot), pattern);
    writeFileSync(resolve(tempRoot, registryPath), registrySource, "utf8");
  }

  const rogue = resolve(tempRoot, "docs/Новый неизвестный документ.md");
  writeFileSync(rogue, "# Новый документ\n", "utf8");
  expect(() => loadMtsSemanticIr(tempRoot), /Markdown document surface differs/);
  rmSync(rogue);

  const a4OwnerPath = resolve(tempRoot, "docs/theory/Система аксиом МТС.md");
  const a4OwnerSource = readFileSync(a4OwnerPath, "utf8");
  writeFileSync(
    a4OwnerPath,
    a4OwnerSource.replace(/^<a id="mts-v014-v14-l12"><\/a>.*\r?\n/m, ""),
    "utf8",
  );
  expect(
    () => compileRequirementDocuments(tempRoot, false),
    /anchor not found/,
    "materialized projection must fail closed when a stable owner anchor disappears",
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log("MTS Compiler D20: GREEN REQUIREMENTS=14 REGISTRY=v0.2 PROSE_MATERIALIZATION=MATERIALIZED");
