import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { findRepositoryRoot } from "../src/tooling/docs-sync.js";
import { listRepositoryMarkdownSurface } from "../src/tooling/markdown-section-adapter.js";
import { loadMtsSemanticIr } from "../src/tooling/mts-compiler.js";
import { THEOREM_CATALOG_PATH } from "../src/tooling/theorem-catalog-markdown.js";
import {
  auditRepositoryStableAnchors,
  auditStableAnchorDocuments,
  loadStableAnchorBaseline,
  validateStableAnchorBaseline,
} from "../src/tooling/markdown-anchor-baseline.js";

const root = findRepositoryRoot();
const baseline = loadStableAnchorBaseline(root);
const baselinePaths = Object.keys(baseline.anchorsByDocument).sort();
const baselineCount = Object.values(baseline.anchorsByDocument)
  .reduce((sum, ids) => sum + ids.length, 0);

assert.equal(baseline.schema, "mts-markdown-stable-anchor-baseline/v0.1");
assert.equal(baseline.capturedMain, "af264da1d844f9b5949df34f829ed87ba24d722b");
assert.equal(baseline.sourceContract, "mts-contract/v0.13");
assert.equal(baseline.allowAdditionalAnchors, true);
assert.equal(baseline.migrationPolicy, "explicit-baseline-update-required-for-remove-move-or-rekey");
assert.equal(baselinePaths.length, 12, "baseline preserves 12 historical document owners");
assert.equal(baselineCount, 40, "all pre-reconstruction stable anchors are pinned");

const currentDocumentPaths = Object.keys(loadMtsSemanticIr(root).documentModes).sort();
assert.equal(currentDocumentPaths.length, 12, "current project/document carrier has 12 documents");
assert.deepEqual(
  currentDocumentPaths,
  baselinePaths,
  "current document membership and baseline ownership remain independently equal",
);

const observedMarkdownSurface = new Set(listRepositoryMarkdownSurface(root));
for (const path of currentDocumentPaths) {
  assert.ok(observedMarkdownSurface.has(path), `current configured document is observed on filesystem: ${path}`);
}
assert.ok(
  observedMarkdownSurface.has(THEOREM_CATALOG_PATH),
  "generated theorem catalog remains independently observed Markdown",
);
assert.ok(
  !currentDocumentPaths.includes(THEOREM_CATALOG_PATH),
  "theorem catalog observation does not make it current project/document membership",
);
assert.equal(baseline.anchorsByDocument["docs/specs/Апамять и управление сетью связей.md"]?.length, 13);
assert.equal(baseline.anchorsByDocument["docs/specs/Ачисла и сериализация.md"]?.length, 17);
assert.equal(baseline.anchorsByDocument["docs/specs/Формальная нотация МТС.md"]?.length, 10);
assert.deepEqual(
  auditRepositoryStableAnchors(root),
  [],
  "repository preserves every baseline stable anchor",
);

const fixtureRoot = mkdtempSync(join(tmpdir(), "anum-docs-g4b-"));
try {
  for (const path of ["requirements", "contracts", "traceability", "cutover", "docs"]) {
    cpSync(resolve(root, path), resolve(fixtureRoot, path), { recursive: true });
  }
  for (const path of ["README.md", "PORTFOLIO.md"]) {
    cpSync(resolve(root, path), resolve(fixtureRoot, path));
  }

  const historicalRegistryPath = resolve(fixtureRoot, "requirements/mts-v0.13.json");
  const currentBefore = loadMtsSemanticIr(fixtureRoot).documentModes;
  const auditBefore = auditRepositoryStableAnchors(fixtureRoot);
  const historicalRegistry = JSON.parse(readFileSync(historicalRegistryPath, "utf8")) as {
    documentSurface: Record<string, unknown>;
  };
  assert.ok(
    Object.hasOwn(historicalRegistry.documentSurface, "PORTFOLIO.md"),
    "G4-B historical mutation fixture starts from accepted v0.13 membership",
  );
  delete historicalRegistry.documentSurface["PORTFOLIO.md"];
  writeFileSync(historicalRegistryPath, `${JSON.stringify(historicalRegistry, null, 2)}\n`, "utf8");

  assert.deepEqual(
    loadMtsSemanticIr(fixtureRoot).documentModes,
    currentBefore,
    "G4-B F1 historical v0.13 membership mutation cannot change current document membership",
  );
  assert.deepEqual(
    auditRepositoryStableAnchors(fixtureRoot),
    auditBefore,
    "G4-B F1 historical v0.13 membership mutation cannot change stable-anchor repository audit",
  );
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

function sourceFor(ids: readonly string[]): string {
  return ids.map((id, index) => [
    `<a id="${id}"></a>`,
    `## Узел ${index + 1}`,
    "",
  ].join("\n")).join("\n");
}

const documents = Object.fromEntries(
  baselinePaths.map((path) => [path, sourceFor(baseline.anchorsByDocument[path] ?? [])]),
) as Record<string, string>;

assert.deepEqual(
  auditStableAnchorDocuments(baseline, baselinePaths, documents),
  [],
  "exact synthetic baseline passes",
);

const additive = {
  ...documents,
  "README.md": '<a id="new-safe-anchor"></a>\n## Новый узел\n',
};
assert.deepEqual(
  auditStableAnchorDocuments(baseline, baselinePaths, additive),
  [],
  "new anchors are additive and allowed",
);

const ownerPath = "docs/specs/Апамять и управление сетью связей.md";
const victim = baseline.anchorsByDocument[ownerPath]![0]!;
const removed = {
  ...documents,
  [ownerPath]: documents[ownerPath]!.replace(`<a id="${victim}"></a>\n## Узел 1\n\n`, ""),
};
const removedIssues = auditStableAnchorDocuments(baseline, baselinePaths, removed);
assert.ok(
  removedIssues.some((entry) =>
    entry.code === "missing-baseline-anchor" &&
    entry.path === ownerPath &&
    entry.anchorId === victim
  ),
  "baseline anchor deletion fails closed",
);

const movedTarget = "README.md";
const moved = {
  ...removed,
  [movedTarget]: documents[movedTarget]! + `\n<a id="${victim}"></a>\n## Переехавший узел\n`,
};
const movedIssues = auditStableAnchorDocuments(baseline, baselinePaths, moved);
assert.ok(
  movedIssues.some((entry) =>
    entry.code === "missing-baseline-anchor" &&
    entry.path === ownerPath &&
    entry.anchorId === victim
  ),
  "moving a baseline anchor to another document does not satisfy original ownership",
);

const rekeyed = {
  ...documents,
  [ownerPath]: documents[ownerPath]!.replace(
    `<a id="${victim}"></a>`,
    '<a id="replacement-anchor"></a>',
  ),
};
assert.ok(
  auditStableAnchorDocuments(baseline, baselinePaths, rekeyed).some(
    (entry) => entry.code === "missing-baseline-anchor" && entry.anchorId === victim,
  ),
  "rekey requires explicit baseline migration",
);

const missingDocument = { ...documents };
delete missingDocument[ownerPath];
assert.ok(
  auditStableAnchorDocuments(baseline, baselinePaths, missingDocument).some(
    (entry) => entry.code === "missing-document" && entry.path === ownerPath,
  ),
  "missing baseline document fails closed",
);

const duplicate = {
  ...documents,
  [ownerPath]: documents[ownerPath]! + `\n<a id="${victim}"></a>\n## Дубликат\n`,
};
assert.ok(
  auditStableAnchorDocuments(baseline, baselinePaths, duplicate).some(
    (entry) => entry.code === "invalid-document-anchors" && entry.path === ownerPath,
  ),
  "duplicate stable anchor remains invalid",
);

assert.ok(
  auditStableAnchorDocuments(baseline, currentDocumentPaths.slice(1), documents).some(
    (entry) => entry.code === "surface-mismatch",
  ),
  "G4-B F2 current membership drift against independent baseline ownership fails closed",
);

assert.throws(
  () => validateStableAnchorBaseline({
    ...baseline,
    anchorsByDocument: {
      "a.md": ["same-anchor"],
      "b.md": ["same-anchor"],
    },
  }),
  /owned by both/,
  "baseline itself cannot move one primary key into two documents",
);

console.log(`stable Markdown anchor baseline: GREEN anchors=${baselineCount} documents=${baselinePaths.length}`);
