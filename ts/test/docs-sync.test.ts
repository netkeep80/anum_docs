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
  checkCurrentReleasePolicy,
  checkRepositoryDocs,
  checkRepositorySemanticLawDocumentation,
  findRepositoryRoot,
  loadCurrentProjection,
  renderCurrentProjection,
  replaceProjection,
  syncRepositoryDocs,
  validateSemanticLawDocumentation,
} from "../src/tooling/docs-sync.js";
import { listRepositoryMarkdownSurface } from "../src/tooling/markdown-section-adapter.js";
import { loadRepositoryTheoremProjectionSources } from "../src/tooling/theorem-projection-model.js";
import { FORMAL_NOTATION_V015_SOURCE_PATHS } from "../src/tooling/formal-notation-v015-markdown.js";
// S18 fixture must carry every generated FORMAL authority input.

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
assert.deepEqual(checkCurrentReleasePolicy(repositoryRoot), [], "v0.15 current contribution policy must be internally consistent");

const projection = loadCurrentProjection(repositoryRoot);
assert.equal(projection.currentContract, "mts-contract/v0.15");
assert.equal(projection.previousContract, "mts-contract/v0.14");
assert.equal(projection.acceptancePath, "cutover/typescript-c1-acceptance-v0.8.json");
assert.deepEqual(CANONICAL_DOCS, ["README.md"], "generated current projection must have exactly one owner");
assert.deepEqual(PROJECTION_FORBIDDEN_DOCS, [
  "docs/CONTRIBUTING.md",
  "docs/theory/Основания МТС.md",
  "docs/theory/Система аксиом МТС.md",
]);

const rendered = renderCurrentProjection(projection);
assert.ok(rendered.includes("mts-contract/v0.15"));
assert.ok(!rendered.includes("mts-contract/v0.14"), "current README projection must not expose previous MTS versions");
assert.ok(!rendered.includes("Предыдущ"), "current README projection must not contain previous-release prose");
assert.ok(rendered.includes("cutover/typescript-c1-acceptance-v0.8.json"));
assert.ok(!rendered.includes("Корневой базис:"), "release projection must not duplicate theory");
assert.ok(!rendered.includes("Строковый носитель:"), "release projection must not duplicate subject specs");
assert.ok(rendered.includes(PROJECTION_START));
assert.ok(rendered.includes(PROJECTION_END));

const acceptedRequirements = JSON.parse(readFileSync(resolve(repositoryRoot, "requirements/mts-v0.15.json"), "utf8")) as {
  accepted: boolean;
  requirements: { id: string; mandatory: boolean; group: string; state: string; summary: string }[];
};
assert.equal(acceptedRequirements.accepted, true);
const formalCurrentDoc = readFileSync(resolve(repositoryRoot, "docs/specs/Формальная нотация МТС.md"), "utf8");
const requiredEntries = acceptedRequirements.requirements.filter((item) => item.mandatory !== false);
assert.equal(requiredEntries.length, 48, "accepted normative registry must be explicit");
// Before #2122 presentation redesign, accepted metadata must survive losslessly.
function assertFormalRegistryProjection(document: string): void {
  const heading = "## 9a. Нормативный реестр требований v0.15";
  const start = document.indexOf(heading);
  const end = document.indexOf("\n## 10. ", start);
  assert.ok(start >= 0 && end > start, "FORMAL registry must be a bounded section");
  const section = document.slice(start, end);
  assert.ok(!section.includes("<details>"),
    "canonical normative wording must remain directly visible without disclosure");
  const anchors = [...section.matchAll(/<a id="mts-v015-([^"]+)"><\/a>/g)];
  assert.deepEqual(
    anchors.map((item) => item[1]),
    requiredEntries.map((item) => item.id.toLowerCase()),
    "all 48 canonical IDs must remain in exact accepted order with no duplicates",
  );
  for (let i = 0; i < requiredEntries.length; i += 1) {
    const source = requiredEntries[i]!;
    const block = section.slice(anchors[i]!.index, anchors[i + 1]?.index ?? section.length);
    const english = '<span lang="en">' + source.summary.replace(/\|/g, "\\|")
      .replace(/\r?\n/g, " ") + "</span>";
    const pos = block.indexOf(english);
    assert.ok(pos >= 0 && block.indexOf(english, pos + 1) < 0,
      source.id + ": exact accepted English wording must appear once within its own record");
    const metadata = block.slice(0, pos);
    assert.ok(metadata.includes("`" + source.id + "`"), source.id + ": ID missing");
    assert.ok(metadata.includes("`" + source.group + "`"), source.id + ": group mismatch");
    assert.ok(metadata.includes("`" + source.state + "`"), source.id + ": state mismatch");
  }
}
assertFormalRegistryProjection(formalCurrentDoc);

// Mutation falsifiers are evaluated only against copies of the generated view.
const first = requiredEntries[0]!;
const next = requiredEntries[1]!;
const firstAnchor = '<a id="mts-v015-' + first.id.toLowerCase() + '"></a>';
const nextAnchor = '<a id="mts-v015-' + next.id.toLowerCase() + '"></a>';
assert.throws(() => assertFormalRegistryProjection(formalCurrentDoc.replace(firstAnchor, "")),
  "removing an accepted anchor must fail");
assert.throws(() => assertFormalRegistryProjection(formalCurrentDoc.replace(firstAnchor, firstAnchor + firstAnchor)),
  "duplicating an accepted anchor must fail");
const shuffled = formalCurrentDoc.replace(firstAnchor, "__REORDER_ANCHOR__")
  .replace(nextAnchor, firstAnchor).replace("__REORDER_ANCHOR__", nextAnchor);
assert.throws(() => assertFormalRegistryProjection(shuffled), "reordering accepted IDs must fail");
const header = "| " + firstAnchor + "`" + first.id + "` | `" +
  first.group + "` | `" + first.state + "` | ";
assert.ok(formalCurrentDoc.includes(header), "baseline must contain first normative row");
assert.throws(() => assertFormalRegistryProjection(formalCurrentDoc.replace(header,
  header.replace("`" + first.group + "`", "`WRONG_GROUP`"))),
  "changing source group must fail");
assert.throws(() => assertFormalRegistryProjection(formalCurrentDoc.replace(header,
  header.replace("`" + first.state + "`", "`WRONG_STATE`"))),
  "changing source status must fail");
const exactEnglish = '<span lang="en">' + first.summary.replace(/\|/g, "\\|")
  .replace(/\r?\n/g, " ") + "</span>";
assert.ok(formalCurrentDoc.includes(exactEnglish), "baseline must contain first source summary");
assert.throws(() => assertFormalRegistryProjection(formalCurrentDoc.replace(exactEnglish,
  exactEnglish.replace("</span>", " [MUTATED]</span>"))),
  "mutating original normative text must fail");

const theoremCatalogSource = readFileSync(resolve(repositoryRoot, "docs/theory/Теоремы МТС.md"), "utf8");
assert.ok(
  theoremCatalogSource.includes("[принятый контракт v0.15](../../contracts/mts-contract-v0.15.json)"),
  "current theorem projection must identify accepted v0.15 semantic authority",
);
assert.ok(
  theoremCatalogSource.includes("Статус миграции доказательств: `v0.15-candidate`; не статус выпуска МТС."),
  "candidate proof migration must not be conflated with MTS release acceptance",
);
assert.ok(
  !theoremCatalogSource.includes("не принимает `MTS v0.15`"),
  "external candidate proofs must not falsely deny accepted v0.15 release",
);

const readmeSource = readFileSync(resolve(repositoryRoot, "README.md"), "utf8");
assert.equal(
  readmeSource.split("mts-doc-version: v0.15").length - 1,
  1,
  "README must contain exactly one v0.15 document marker",
);
assert.ok(
  readmeSource.includes("> **Версия МТС: v0.15**"),
  "README must expose the v0.15 version to readers",
);
assert.ok(
  !readmeSource.includes("mts-contract/v0.13"),
  "README current release projection must not expose previous MTS releases",
);

assert.deepEqual(
  checkRepositoryDocs(repositoryRoot),
  [],
  "all generated documentation projections must be synchronized; README remains the sole release-projection marker owner",
);
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
  copy("docs/CONTRIBUTING.md");
  copy("repo-policy.json");
  copy("contracts/mts-contract-v0.14.json");
  copy("contracts/mts-conformance-v0.14.json");
  copy("contracts/mts-contract-v0.15.json");
  copy("contracts/mts-conformance-v0.15.json");
  copy("traceability/mts-v0.15.json");
  copy("requirements/mts-v0.15.json");
  copy("traceability/mts-v0.14.json");
  copy("requirements/mts-v0.14.json");
  copy("cutover/typescript-c1-acceptance-v0.8.json");
  for (const path of loadRepositoryTheoremProjectionSources(repositoryRoot).availablePaths) copy(path);
  for (const path of FORMAL_NOTATION_V015_SOURCE_PATHS) copy(path);
  for (const path of listRepositoryMarkdownSurface(repositoryRoot)) copy(path);

  const contributingPath = resolve(tempRoot, "docs/CONTRIBUTING.md");
  const currentPolicy = readFileSync(contributingPath, "utf8");
  assert.deepEqual(checkCurrentReleasePolicy(tempRoot), []);
  writeFileSync(contributingPath, currentPolicy.replace(
    "## 6. Текущая документация описывает принятую МТС v0.15",
    "## 6. Текущая документация описывает `current` `MTS` v0.14",
  ), "utf8");
  assert.ok(
    checkCurrentReleasePolicy(tempRoot).length > 0,
    "D1 negative: outdated v0.14 current policy must fail closed",
  );
  writeFileSync(contributingPath, currentPolicy, "utf8");
  assert.deepEqual(checkCurrentReleasePolicy(tempRoot), []);
  
  for (const [path, authority] of [
    ["docs/theory/Основания МТС.md", "[принятый контракт v0.15](../../contracts/mts-contract-v0.15.json)"],
    ["docs/theory/Система аксиом МТС.md", "[контракт v0.15](../../contracts/mts-contract-v0.15.json)"],
  ] as const) {
    const fullPath = resolve(tempRoot, path);
    const original = readFileSync(fullPath, "utf8");
    assert.ok(original.includes(authority), path + " must identify current v0.15 authority");
    writeFileSync(fullPath, original.replace(authority, "[контракт v0.14](../../contracts/mts-contract-v0.14.json)"), "utf8");
    assert.ok(
      checkCurrentReleasePolicy(tempRoot).some((issue) => issue.includes(path)),
      path + ": D2 negative authority downgrade must fail closed",
    );
    writeFileSync(fullPath, original, "utf8");
    assert.deepEqual(checkCurrentReleasePolicy(tempRoot), []);
  }

  for (const [path, authority, bad] of [
    ["README.md", "M_t -> Γ(M_t) -> M_(t+1)", "M_t -> legacy_exec(M_t)"],
    ["docs/Словарь терминов МТС.md", "requirements/mts-v0.15.json", "requirements/mts-v0.14.json"],
    ["docs/specs/Пучки связей.md", "В принятой FORMAL v0.15 фигурные скобки имеют отдельные роли:", "В старом API фигурные скобки только метанотация:"],
    ["docs/theory/Теоремы МТС.md", "Доказательная проекция в принятой `FORMAL v0.15`:", "Кандидатная проекция FORMAL:"],
  ] as const) {
    const file = resolve(tempRoot, path);
    const content = readFileSync(file, "utf8");
    assert.ok(content.includes(authority), path + " current source must carry v0.15 authority");
    writeFileSync(file, content.replace(authority, bad), "utf8");
    assert.ok(checkCurrentReleasePolicy(tempRoot).some((issue) => issue.includes(path)), path + " downgrade must fail docs-check");
    writeFileSync(file, content, "utf8");
    assert.deepEqual(checkCurrentReleasePolicy(tempRoot), []);
  }

  for (const [path, required, downgrade] of [
    ["docs/theory/Основания МТС.md", "**Историческая схема** положительного образа v0.14", "Форма положительного образа v0.15"],
    ["docs/theory/Система аксиом МТС.md", "**Историческая метасхема v0.14**", "Нативная форма v0.15"],
    ["docs/specs/Апамять и управление сетью связей.md", "**псевдокод профиля 0.1.0**", "принятая FORMAL v0.15"],
  ] as const) {
    const location = resolve(tempRoot, path);
    const original = readFileSync(location, "utf8");
    assert.ok(original.includes(required), path + " must explicitly scope legacy notation");
    writeFileSync(location, original.replace(required, downgrade), "utf8");
    assert.ok(checkCurrentReleasePolicy(tempRoot).some((issue) => issue.includes(path)),
      path + " must fail if v0.14/v0.15 source grammar boundary is erased");
    writeFileSync(location, original, "utf8");
    assert.deepEqual(checkCurrentReleasePolicy(tempRoot), []);
  }

  const brokenPath = resolve(tempRoot, CANONICAL_DOCS[0]);
  writeFileSync(brokenPath, readFileSync(brokenPath, "utf8").replace("mts-contract/v0.15", "mts-contract/v0.X"), "utf8");
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
