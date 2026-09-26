import assert from "node:assert/strict";

import { findRepositoryRoot } from "../src/tooling/docs-sync.js";
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
assert.equal(baseline.allowAdditionalAnchors, true);
assert.equal(baselinePaths.length, 12, "baseline covers the registered Markdown surface");
assert.equal(baselineCount, 40, "all pre-reconstruction stable anchors are pinned");
assert.equal(baseline.anchorsByDocument["docs/specs/Апамять и управление сетью связей.md"]?.length, 13);
assert.equal(baseline.anchorsByDocument["docs/specs/Ачисла и сериализация.md"]?.length, 17);
assert.equal(baseline.anchorsByDocument["docs/specs/Формальная нотация МТС.md"]?.length, 10);
assert.deepEqual(
  auditRepositoryStableAnchors(root),
  [],
  "repository preserves every baseline stable anchor",
);

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
  auditStableAnchorDocuments(baseline, baselinePaths.slice(1), documents).some(
    (entry) => entry.code === "surface-mismatch",
  ),
  "registered document surface drift is explicit",
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
