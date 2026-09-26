import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  CANONICAL_DOCS,
  PROJECTION_END,
  PROJECTION_FORBIDDEN_DOCS,
  PROJECTION_START,
  SEMANTIC_LAW_OWNER_BY_ID,
  checkProjectionText,
  checkRepositoryDocs,
  checkRepositorySemanticLawDocumentation,
  findRepositoryRoot,
  loadCurrentProjection,
  renderCurrentProjection,
  replaceProjection,
  syncRepositoryDocs,
  validateSemanticLawDocumentation,
} from "../src/tooling/docs-sync.js";

function expectThrow(action: () => unknown, pattern: RegExp): void {
  assert.throws(action, pattern);
}

const sampleProjection = `${PROJECTION_START}\n> актуально\n${PROJECTION_END}`;
const stale = `# Заголовок\n\n${PROJECTION_START}\n> старое\n${PROJECTION_END}\n\nТекст.\n`;
const fresh = `# Заголовок\n\n${sampleProjection}\n\nТекст.\n`;

assert.equal(replaceProjection(stale, sampleProjection), fresh);
assert.equal(replaceProjection(fresh, sampleProjection), fresh, "повторная синхронизация должна быть идемпотентной");
assert.equal(checkProjectionText(stale, sampleProjection), false);
assert.equal(checkProjectionText(fresh, sampleProjection), true);
expectThrow(() => replaceProjection("# нет markers\n", sampleProjection), /exactly one projection marker pair/);
expectThrow(
  () => replaceProjection(`${PROJECTION_START}\n${PROJECTION_START}\n${PROJECTION_END}`, sampleProjection),
  /exactly one projection marker pair/,
);
expectThrow(
  () => replaceProjection(`${PROJECTION_END}\n${PROJECTION_START}`, sampleProjection),
  /end marker appears before start marker/,
);

const repositoryRoot = findRepositoryRoot();
const projection = loadCurrentProjection(repositoryRoot);
assert.equal(projection.currentContract, "mts-contract/v0.13");
assert.equal(projection.previousContract, "mts-contract/v0.12");
assert.equal(projection.acceptancePath, "cutover/typescript-c1-acceptance-v0.6.json");
assert.deepEqual(CANONICAL_DOCS, ["README.md"], "generated current projection must have exactly one owner");
assert.deepEqual(PROJECTION_FORBIDDEN_DOCS, [
  "docs/CONTRIBUTING.md",
  "docs/theory/Основания МТС.md",
  "docs/theory/Система аксиом МТС.md",
]);

const rendered = renderCurrentProjection(projection);
assert.ok(rendered.includes("mts-contract/v0.13"));
assert.ok(!rendered.includes("mts-contract/v0.12"), "current README projection must not expose previous MTS versions");
assert.ok(!rendered.includes("Предыдущ"), "current README projection must not contain previous-release prose");
assert.ok(rendered.includes("cutover/typescript-c1-acceptance-v0.6.json"));
assert.ok(!rendered.includes("Корневой базис:"), "release projection must not duplicate theory");
assert.ok(!rendered.includes("Строковый носитель:"), "release projection must not duplicate subject specs");
assert.ok(rendered.includes(PROJECTION_START));
assert.ok(rendered.includes(PROJECTION_END));

const readmeSource = readFileSync(resolve(repositoryRoot, "README.md"), "utf8");
assert.equal(
  readmeSource.split("mts-doc-version: v0.13").length - 1,
  1,
  "README must contain exactly one v0.13 document marker",
);
assert.ok(
  readmeSource.includes("> **Версия МТС: v0.13**"),
  "README must expose the v0.13 version to readers",
);
assert.ok(
  !readmeSource.includes("mts-contract/v0.12"),
  "README current prose must not expose previous MTS releases",
);

assert.deepEqual(checkRepositoryDocs(repositoryRoot), [], "ветка должна хранить одну актуальную release projection только в README");
for (const path of PROJECTION_FORBIDDEN_DOCS) {
  const source = readFileSync(resolve(repositoryRoot, path), "utf8");
  assert.ok(!source.includes(PROJECTION_START) && !source.includes(PROJECTION_END), `${path} must not contain release projection markers`);
}

assert.deepEqual(
  checkRepositorySemanticLawDocumentation(repositoryRoot),
  [],
  "каждый обязательный semantic law должен иметь ровно одного допустимого нормативного владельца",
);

const requiredLawIds = Object.keys(SEMANTIC_LAW_OWNER_BY_ID).sort();
const ownerPaths = [...new Set(Object.values(SEMANTIC_LAW_OWNER_BY_ID))];

function syntheticOwnerDocs(): Record<string, string> {
  const docs = Object.fromEntries(ownerPaths.map((path) => [path, `# synthetic ${path}\n`])) as Record<string, string>;
  for (const lawId of requiredLawIds) {
    const path = SEMANTIC_LAW_OWNER_BY_ID[lawId];
    assert.ok(path);
    docs[path] += `\n<a id="mts-law-${lawId}"></a> <!-- нормативный владелец -->\n### Переименовываемый заголовок\nНормативное тело ${lawId}.\n`;
  }
  return docs;
}

const syntheticValid = syntheticOwnerDocs();
assert.deepEqual(
  validateSemanticLawDocumentation(requiredLawIds, syntheticValid),
  [],
  "стабильный law ID не должен зависеть от русского заголовка",
);

const duplicateDocs = syntheticOwnerDocs();
duplicateDocs["README.md"] = '<a id="mts-law-L4"></a> <!-- нормативный владелец -->\nДублирующее нормативное тело.\n';
assert.ok(
  validateSemanticLawDocumentation(requiredLawIds, duplicateDocs).some(
    (issue) => issue.code === "duplicate-owner" && issue.lawId === "L4",
  ),
  "D-F01: второй current owner того же ID должен отклоняться",
);

const missingDocs = syntheticOwnerDocs();
const missingPath = SEMANTIC_LAW_OWNER_BY_ID.L4;
assert.ok(missingPath);
missingDocs[missingPath] = missingDocs[missingPath]!.replace(
  '<a id="mts-law-L4"></a> <!-- нормативный владелец -->\n### Переименовываемый заголовок\nНормативное тело L4.\n',
  "",
);
assert.ok(
  validateSemanticLawDocumentation(requiredLawIds, missingDocs).some(
    (issue) => issue.code === "missing-owner" && issue.lawId === "L4",
  ),
  "D-F02: удаление единственного owner должно отклоняться",
);

const emptyDocs = syntheticOwnerDocs();
emptyDocs[missingPath] = emptyDocs[missingPath]!.replace(
  '<a id="mts-law-L4"></a> <!-- нормативный владелец -->\n### Переименовываемый заголовок\nНормативное тело L4.\n',
  '<a id="mts-law-L4"></a> <!-- нормативный владелец -->\n',
);
assert.ok(
  validateSemanticLawDocumentation(requiredLawIds, emptyDocs).some(
    (issue) => issue.code === "empty-owner" && issue.lawId === "L4",
  ),
  "D-F03: пустой owner-anchor должен отклоняться",
);

const badReferenceDocs = syntheticOwnerDocs();
badReferenceDocs["README.md"] = "<!-- ссылка:mts-law-notAnAcceptedLaw -->\n";
assert.ok(
  validateSemanticLawDocumentation(requiredLawIds, badReferenceDocs).some(
    (issue) => issue.code === "unknown-reference" && issue.lawId === "notAnAcceptedLaw",
  ),
  "D-F04: ссылка на неизвестный law ID должна отклоняться",
);

const fencedOnlyDocs = syntheticOwnerDocs();
fencedOnlyDocs[missingPath] = fencedOnlyDocs[missingPath]!.replace(
  '<a id="mts-law-L4"></a> <!-- нормативный владелец -->\n### Переименовываемый заголовок\nНормативное тело L4.\n',
  "",
);
fencedOnlyDocs["README.md"] = [
  String.fromCharCode(96, 96, 96) + "html",
  '<a id="mts-law-L4"></a>',
  String.fromCharCode(96, 96, 96),
].join("\n");
assert.ok(
  validateSemanticLawDocumentation(requiredLawIds, fencedOnlyDocs).some(
    (issue) => issue.code === "missing-owner" && issue.lawId === "L4",
  ),
  "D-F05: anchor внутри code fence не является нормативным владельцем",
);


const tempRoot = mkdtempSync(resolve(tmpdir(), "mts-docs-sync-"));
try {
  const copy = (path: string): void => {
    const target = resolve(tempRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(resolve(repositoryRoot, path), "utf8"), "utf8");
  };
  copy("repo-policy.json");
  copy("contracts/mts-contract-v0.13.json");
  copy("contracts/mts-conformance-v0.13.json");
  copy("contracts/mts-contract-v0.12.json");
  copy("contracts/mts-conformance-v0.12.json");
  copy("traceability/mts-v0.13.json");
  copy("requirements/mts-v0.13.json");
  for (const path of CANONICAL_DOCS) copy(path);
  for (const path of PROJECTION_FORBIDDEN_DOCS) copy(path);
  for (const path of new Set(Object.values(SEMANTIC_LAW_OWNER_BY_ID))) copy(path);

  const brokenPath = resolve(tempRoot, CANONICAL_DOCS[0]);
  writeFileSync(brokenPath, readFileSync(brokenPath, "utf8").replace("mts-contract/v0.13", "mts-contract/v0.X"), "utf8");
  assert.deepEqual(checkRepositoryDocs(tempRoot), [CANONICAL_DOCS[0]], "устаревший блок должен обнаруживаться");
  assert.deepEqual(syncRepositoryDocs(tempRoot), [CANONICAL_DOCS[0]], "синхронизация должна исправлять только устаревший файл");
  assert.deepEqual(checkRepositoryDocs(tempRoot), []);
  assert.deepEqual(syncRepositoryDocs(tempRoot), [], "повторная синхронизация должна быть пустой");

  const forbiddenPath = PROJECTION_FORBIDDEN_DOCS[0];
  const forbiddenFullPath = resolve(tempRoot, forbiddenPath);
  writeFileSync(
    forbiddenFullPath,
    readFileSync(forbiddenFullPath, "utf8") + `\n${PROJECTION_START}\n> чужая копия\n${PROJECTION_END}\n`,
    "utf8",
  );
  assert.deepEqual(
    checkRepositoryDocs(tempRoot),
    [forbiddenPath],
    "D-F06: release projection outside README must be rejected",
  );
  assert.deepEqual(
    syncRepositoryDocs(tempRoot),
    [],
    "docs:sync must not modify documents that no longer own the release projection",
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log("docs-sync tests passed");
