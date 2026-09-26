import {
  auditMarkdownDocument,
  buildMarkdownCoverageAudit,
} from "../src/tooling/markdown-coverage-audit.js";
import { findRepositoryRoot } from "../src/tooling/docs-sync.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Markdown coverage P4: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function throws(fn: () => unknown, fragment: string, message: string): void {
  try {
    fn();
  } catch (error) {
    assert((error as Error).message.includes(fragment), `${message}: unexpected error ${(error as Error).message}`);
    return;
  }
  throw new Error(`Markdown coverage P4: ${message}: expected failure`);
}

const root = findRepositoryRoot();
const report = buildMarkdownCoverageAudit(root);
const again = buildMarkdownCoverageAudit(root);

same(report.schema, "mts-markdown-coverage/v0.1", "coverage schema");
same(report.contract, "mts-contract/v0.13", "coverage targets accepted current contract");
same(report.summary.documentCount, 12, "registered Markdown surface");
same(report.summary.headingCount, 306, "all visible headings are inventoried");
same(report.summary.stableAnchorCount, 40, "all stable anchors are counted");
same(report.summary.canonicalNodeCount, 22, "canonical node baseline");
same(report.summary.nonCanonicalAnchorCount, 18, "generic non-node anchors remain visible");
same(report.summary.requirementCount, 13, "accepted requirement registry count");
same(report.summary.requirementBackedSectionCount, 13, "accepted requirement projections resolve to sections");
same(report.summary.ownedBlockCount, 13, "compiler-owned block count");
same(report.summary.unanchoredHeadingCount, 284, "unanchored authored surface is explicit");
same(report.summary.researchHistoricalSectionCount, 14, "research path is classified conservatively");
same(report.summary.currentlyUnclassifiedSectionCount, 279, "non-backed non-research knowledge remains unclassified");
same(JSON.stringify(again), JSON.stringify(report), "coverage audit is deterministic");

for (const document of report.documents) {
  same(document.headingCount, document.sections.length, `${document.path}: each heading appears exactly once`);
  for (const section of document.sections) {
    same(section.authoredContentPolicy, "preserve", `${document.path}:${section.diagnosticLine}: authored content is preserved`);
    same(section.wholeNodeMutation, "not-authorized", `${document.path}:${section.diagnosticLine}: destructive node mutation stays forbidden`);
  }
}

const covered = [
  '<a id="mts-law-X"></a>',
  '<!-- мтс:требование:X:начало -->',
  'generated',
  '<!-- мтс:требование:X:конец -->',
  '## Нормативный узел',
  '',
  'Авторский текст.',
  '### Неякоренная идея',
  '',
  'Её нельзя терять.',
  '',
].join("\n");

const synthetic = auditMarkdownDocument({
  path: "docs/specs/fixture.md",
  mode: "hybrid",
  source: covered,
  requirements: Object.freeze([{ id: "X", docAnchor: "mts-law-X" }]),
});
same(synthetic.sections.length, 2, "synthetic heading inventory");
same(synthetic.sections[0]!.knowledgeClass, "requirements-backed", "requirement-backed node is recognized");
same(synthetic.sections[0]!.authoredContentPolicy, "preserve", "requirement backing does not transfer ownership of authored prose");
same(synthetic.sections[1]!.anchorId, null, "unanchored idea remains explicit");
same(synthetic.sections[1]!.knowledgeClass, "currently-unclassified", "unanchored idea is preservation-protected");

throws(
  () => auditMarkdownDocument({
    path: "docs/specs/missing-block.md",
    mode: "hybrid",
    source: '<a id="mts-law-X"></a>\n## Узел\n',
    requirements: Object.freeze([{ id: "X", docAnchor: "mts-law-X" }]),
  }),
  "has no compiler-owned block",
  "requirement without owned block fails closed",
);

throws(
  () => auditMarkdownDocument({
    path: "docs/specs/orphan-block.md",
    mode: "hybrid",
    source: [
      '<a id="node"></a>',
      '<!-- мтс:требование:ORPHAN:начало -->',
      'generated',
      '<!-- мтс:требование:ORPHAN:конец -->',
      '## Узел',
    ].join("\n"),
    requirements: Object.freeze([]),
  }),
  "compiler-owned block IDs differ",
  "orphan compiler-owned block fails closed",
);

console.log(
  `Markdown coverage P4: GREEN headings=${report.summary.headingCount} canonical=${report.summary.canonicalNodeCount} unanchored=${report.summary.unanchoredHeadingCount}`,
);
