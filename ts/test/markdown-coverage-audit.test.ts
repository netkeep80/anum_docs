import {
  auditAcceptedV015RequirementRows,
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
same(report.contract, "mts-contract/v0.15", "coverage targets accepted current contract");
same(report.projectionState, "V015_ACCEPTED_48_NORMATIVE_ROWS_PROJECTED_FORMULA_MIGRATION_PENDING_1951", "projection state");
same(report.proseMaterializationPending, false, "legacy Markdown compatibility projection remains materialized");
same(report.summary.documentCount, 12, "registered Markdown surface");
assert(report.summary.headingCount > 0, "visible headings are inventoried");
assert(report.summary.stableAnchorCount >= 14, "stable anchors include all accepted owners");
assert(report.summary.canonicalNodeCount > 0, "canonical Markdown nodes remain present");
same(report.summary.requirementCount, 16, "semantic + repository requirement count");
same(report.summary.currentNormativeRequirementCount, 48, "current accepted normative requirement count");
same(report.summary.currentNormativeProjectedCount, 48, "all current accepted normative requirement rows materialized");
same(report.summary.inheritedV014RequirementCount, 16, "historical v0.14 provenance blocks remain separately scoped");

same(report.summary.requirementBackedSectionCount, 16, "all projected requirements are materialized");
same(report.summary.ownedBlockCount, 16, "compiler-owned block count");
assert(report.summary.researchHistoricalSectionCount > 0, "research/history remains reader-visible");
assert(
  report.summary.unanchoredHeadingCount + report.summary.canonicalNodeCount >= report.summary.requirementBackedSectionCount,
  "coverage inventory remains structurally coherent",
);
same(JSON.stringify(again), JSON.stringify(report), "coverage audit is deterministic");

const acceptedFixture = [{ id: "V15-TEST-01", group: "TEST", state: "COMPONENT_GREEN", summary: "Accepted test" }];
const acceptedRow = '| <a id="mts-v015-v15-test-01"></a>`V15-TEST-01` | `TEST` | `COMPONENT_GREEN` | Accepted test |';
same(auditAcceptedV015RequirementRows(acceptedRow, acceptedFixture), 1, "strict v0.15 row projection");
throws(() => auditAcceptedV015RequirementRows("", acceptedFixture), "incomplete", "missing v0.15 normative row fails closed");
throws(() => auditAcceptedV015RequirementRows(acceptedRow + "\n" + acceptedRow, acceptedFixture), "duplicate", "duplicate normative projection fails closed");
throws(() => auditAcceptedV015RequirementRows(acceptedRow.replace("Accepted test", "Altered assertion"), acceptedFixture), "differs", "semantic source mutation fails closed");

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
  `Markdown coverage D20: GREEN normative=${report.summary.currentNormativeProjectedCount}/${report.summary.currentNormativeRequirementCount} inherited=${report.summary.inheritedV014RequirementCount} current=v0.15 research=${report.summary.researchHistoricalSectionCount}`,
);
