import assert from "node:assert/strict";

import {
  CURRENT_DOC_SIZE_SURFACE,
  findRepositoryRoot,
  measureDocumentationSize,
  measureRepositoryCurrentDocumentationSize,
  PROJECTION_END,
  PROJECTION_START,
  replaceProjection,
} from "../src/tooling/docs-sync.js";

const root = findRepositoryRoot();
const baseline = measureRepositoryCurrentDocumentationSize(root);

assert.equal(baseline.documentCount, 9, "current-reader surface document count");
assert.ok(baseline.codePoints > 0, "current documentation code points are measured");
assert.ok(baseline.lines > 0, "current documentation lines are measured");
assert.ok(baseline.words > 0, "current documentation words are measured");

assert.ok(!CURRENT_DOC_SIZE_SURFACE.some((path) => path.startsWith("docs/research/")), "protected research is outside anti-bloat budget");
assert.ok(!CURRENT_DOC_SIZE_SURFACE.includes("PORTFOLIO.md" as never), "portfolio is outside current-reader documentation budget");

const emptySurface = Object.fromEntries(CURRENT_DOC_SIZE_SURFACE.map((path) => [path, ""])) as Record<string, string>;
const missing = { ...emptySurface };
delete missing[CURRENT_DOC_SIZE_SURFACE[0]];
assert.throws(
  () => measureDocumentationSize(missing),
  /size-budget document is missing: README\.md/,
  "missing budgeted current document fails closed",
);

const unicode = {
  ...emptySurface,
  "README.md": "∞♂♀⟼\nСвязь",
};
const unicodeMeasurement = measureDocumentationSize(unicode);
assert.equal(unicodeMeasurement.codePoints, 10, "Unicode code points, not UTF-8 bytes, are measured");
assert.equal(unicodeMeasurement.lines, 2);
assert.equal(unicodeMeasurement.words, 1);
assert.equal(
  measureDocumentationSize({ ...emptySurface, "README.md": "🧪" }).codePoints,
  1,
  "astral Unicode character counts as one code point, not two UTF-16 units",
);

const oldProjection = `${PROJECTION_START}\n> устаревшая проекция\n${PROJECTION_END}`;
const newProjection = `${PROJECTION_START}\n> актуальная проекция\n${PROJECTION_END}`;
const authoredTail = `\n\n${"Дополнительная авторская часть МТС. ".repeat(128)}\n`;
const original = `# МТС\n${oldProjection}${authoredTail}`;
const updated = replaceProjection(original, newProjection);
assert.equal(updated, `# МТС\n${newProjection}${authoredTail}`, "sync preserves an extended authored tail without a size limit");
assert.equal(replaceProjection(updated, newProjection), updated, "extended projection sync remains idempotent");

console.log(
  `docs-size measurement: GREEN current=${baseline.codePoints} code points / ${baseline.lines} lines / ${baseline.words} words`,
);
