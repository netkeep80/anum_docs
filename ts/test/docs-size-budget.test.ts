import assert from "node:assert/strict";

import {
  CURRENT_DOC_SIZE_BUDGET,
  CURRENT_DOC_SIZE_SURFACE,
  currentDocumentationSizeWithinBudget,
  findRepositoryRoot,
  measureDocumentationSize,
  measureRepositoryCurrentDocumentationSize,
} from "../src/tooling/docs-sync.js";

const root = findRepositoryRoot();
const baseline = measureRepositoryCurrentDocumentationSize(root);

assert.equal(baseline.documentCount, 9, "current-reader surface document count");
assert.equal(baseline.codePoints, CURRENT_DOC_SIZE_BUDGET.baselineCodePoints, "exact current code-point baseline");
assert.equal(baseline.lines, CURRENT_DOC_SIZE_BUDGET.baselineLines, "exact current line baseline");
assert.equal(baseline.words, CURRENT_DOC_SIZE_BUDGET.baselineWords, "exact current word baseline");
assert.equal(CURRENT_DOC_SIZE_BUDGET.hardCeilingCodePoints, 170926, "G10 +5% hard ceiling is pinned");
assert.ok(currentDocumentationSizeWithinBudget(baseline), "current baseline is below hard ceiling");

assert.ok(!CURRENT_DOC_SIZE_SURFACE.some((path) => path.startsWith("docs/research/")), "protected research is outside anti-bloat budget");
assert.ok(!CURRENT_DOC_SIZE_SURFACE.includes("PORTFOLIO.md" as never), "portfolio is outside current-reader documentation budget");

const emptySurface = Object.fromEntries(CURRENT_DOC_SIZE_SURFACE.map((path) => [path, ""])) as Record<string, string>;
const atCeiling = {
  ...emptySurface,
  "README.md": "x".repeat(CURRENT_DOC_SIZE_BUDGET.hardCeilingCodePoints),
};
assert.equal(measureDocumentationSize(atCeiling).codePoints, CURRENT_DOC_SIZE_BUDGET.hardCeilingCodePoints);
assert.ok(currentDocumentationSizeWithinBudget(measureDocumentationSize(atCeiling)), "exact ceiling is allowed");

const overCeiling = {
  ...emptySurface,
  "README.md": "x".repeat(CURRENT_DOC_SIZE_BUDGET.hardCeilingCodePoints + 1),
};
assert.ok(!currentDocumentationSizeWithinBudget(measureDocumentationSize(overCeiling)), "one code point over ceiling is rejected");

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
assert.equal(unicodeMeasurement.codePoints, 10, "Unicode code points, not UTF-8 bytes, define the hard budget");
assert.equal(unicodeMeasurement.lines, 2);
assert.equal(unicodeMeasurement.words, 1);

console.log(
  `docs-size budget: GREEN current=${baseline.codePoints} ceiling=${CURRENT_DOC_SIZE_BUDGET.hardCeilingCodePoints} lines=${baseline.lines} words=${baseline.words}`,
);
