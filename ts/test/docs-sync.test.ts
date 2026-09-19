import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  CANONICAL_DOCS,
  PROJECTION_END,
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
assert.equal(projection.currentContract, "mts-contract/v0.12");
assert.equal(projection.previousContract, "mts-contract/v0.11");
assert.deepEqual(projection.internalSigns, ["∞", "[", "]", "1", "0", "(", ")", "⟼", ":", "=", "."]);
assert.equal(projection.readMayMaterialize, false);
assert.equal(projection.notFoundImpliesNonExistence, false);

const rendered = renderCurrentProjection(projection);
assert.ok(rendered.includes("mts-contract/v0.12"));
assert.ok(rendered.includes("mts-contract/v0.11"));
assert.ok(rendered.includes("∞ [ ] 1 0 ( ) ⟼ : = ."));
assert.ok(rendered.includes(PROJECTION_START));
assert.ok(rendered.includes(PROJECTION_END));

assert.deepEqual(checkRepositoryDocs(repositoryRoot), [], "ветка должна хранить уже синхронизированные канонические документы");

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
    docs[path] += `\n<a id="mts-law-${lawId}"></a>\n### Переименовываемый заголовок\nНормативное тело ${lawId}.\n`;
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
duplicateDocs["README.md"] = '<a id="mts-law-exactAnumRooting"></a>\nДублирующее нормативное тело.\n';
assert.ok(
  validateSemanticLawDocumentation(requiredLawIds, duplicateDocs).some(
    (issue) => issue.code === "duplicate-owner" && issue.lawId === "exactAnumRooting",
  ),
  "D-F01: второй current owner того же ID должен отклоняться",
);

const missingDocs = syntheticOwnerDocs();
const missingPath = SEMANTIC_LAW_OWNER_BY_ID.exactAnumRooting;
assert.ok(missingPath);
missingDocs[missingPath] = missingDocs[missingPath]!.replace(
  '<a id="mts-law-exactAnumRooting"></a>\n### Переименовываемый заголовок\nНормативное тело exactAnumRooting.\n',
  "",
);
assert.ok(
  validateSemanticLawDocumentation(requiredLawIds, missingDocs).some(
    (issue) => issue.code === "missing-owner" && issue.lawId === "exactAnumRooting",
  ),
  "D-F02: удаление единственного owner должно отклоняться",
);

const emptyDocs = syntheticOwnerDocs();
emptyDocs[missingPath] = emptyDocs[missingPath]!.replace(
  '<a id="mts-law-exactAnumRooting"></a>\n### Переименовываемый заголовок\nНормативное тело exactAnumRooting.\n',
  '<a id="mts-law-exactAnumRooting"></a>\n',
);
assert.ok(
  validateSemanticLawDocumentation(requiredLawIds, emptyDocs).some(
    (issue) => issue.code === "empty-owner" && issue.lawId === "exactAnumRooting",
  ),
  "D-F03: пустой owner-anchor должен отклоняться",
);

const badReferenceDocs = syntheticOwnerDocs();
badReferenceDocs["README.md"] = "<!-- mts-law-ref:notAnAcceptedLaw -->\n";
assert.ok(
  validateSemanticLawDocumentation(requiredLawIds, badReferenceDocs).some(
    (issue) => issue.code === "unknown-reference" && issue.lawId === "notAnAcceptedLaw",
  ),
  "D-F04: ссылка на неизвестный law ID должна отклоняться",
);

const fencedOnlyDocs = syntheticOwnerDocs();
fencedOnlyDocs[missingPath] = fencedOnlyDocs[missingPath]!.replace(
  '<a id="mts-law-exactAnumRooting"></a>\n### Переименовываемый заголовок\nНормативное тело exactAnumRooting.\n',
  "",
);
fencedOnlyDocs["README.md"] = [
  String.fromCharCode(96, 96, 96) + "html",
  '<a id="mts-law-exactAnumRooting"></a>',
  String.fromCharCode(96, 96, 96),
].join("\n");
assert.ok(
  validateSemanticLawDocumentation(requiredLawIds, fencedOnlyDocs).some(
    (issue) => issue.code === "missing-owner" && issue.lawId === "exactAnumRooting",
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
  copy("contracts/mts-contract-v0.12.json");
  copy("contracts/mts-conformance-v0.12.json");
  copy("contracts/mts-contract-v0.11.json");
  copy("contracts/mts-conformance-v0.11.json");
  for (const path of CANONICAL_DOCS) copy(path);

  const brokenPath = resolve(tempRoot, CANONICAL_DOCS[0]);
  writeFileSync(brokenPath, readFileSync(brokenPath, "utf8").replace("mts-contract/v0.11", "mts-contract/v0.X"), "utf8");
  assert.deepEqual(checkRepositoryDocs(tempRoot), [CANONICAL_DOCS[0]], "устаревший блок должен обнаруживаться");
  assert.deepEqual(syncRepositoryDocs(tempRoot), [CANONICAL_DOCS[0]], "синхронизация должна исправлять только устаревший файл");
  assert.deepEqual(checkRepositoryDocs(tempRoot), []);
  assert.deepEqual(syncRepositoryDocs(tempRoot), [], "повторная синхронизация должна быть пустой");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log("docs-sync tests passed");
