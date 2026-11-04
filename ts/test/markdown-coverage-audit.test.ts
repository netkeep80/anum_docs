import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  auditAcceptedV015RequirementRows,
  auditMarkdownDocument,
  buildMarkdownCoverageAudit,
} from "../src/tooling/markdown-coverage-audit.js";
import { findRepositoryRoot } from "../src/tooling/docs-sync.js";
import { compileRequirementDocuments, loadMtsSemanticIr } from "../src/tooling/mts-compiler.js";
import { listRepositoryMarkdownSurface } from "../src/tooling/markdown-section-adapter.js";

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
const acceptedEnglishSpanRow = acceptedRow.replace("Accepted test", '<span lang="en">Accepted test</span>');
same(auditAcceptedV015RequirementRows(acceptedEnglishSpanRow, acceptedFixture), 1, "explicit English presentation span preserves exact normative source");
throws(
  () => auditAcceptedV015RequirementRows(acceptedEnglishSpanRow.replace("Accepted test", "Altered assertion"), acceptedFixture),
  "differs",
  "semantic mutation inside explicit language span fails closed",
);
throws(
  () => auditAcceptedV015RequirementRows(acceptedEnglishSpanRow.replace("</span>", ""), acceptedFixture),
  "differs",
  "malformed explicit language span fails closed",
);
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


// G4-A2 pre-fix adversarial reproduction on an isolated exact-main fixture.
// These assertions intentionally prove the current defect before production source is changed.
const preFixRoot = mkdtempSync(resolve(tmpdir(), "mts-g4-a2-prefx-"));
const preFixCopy = (path: string): void => {
  const target = resolve(preFixRoot, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(resolve(root, path), "utf8"), "utf8");
};
const preFixNativeV015Paths = readdirSync(resolve(root, "requirements/mts-v0.15"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".rg.yaml"))
  .map((entry) => `requirements/mts-v0.15/${entry.name}`)
  .sort((left, right) => left.localeCompare(right, "en"));
const preFixSurface = listRepositoryMarkdownSurface(root);
const preFixRegistryPath = "requirements/mts-v0.14.json";

try {
  for (const path of [
    "contracts/mts-contract-v0.15.json",
    "contracts/mts-conformance-v0.15.json",
    "requirements/mts-v0.15.json",
    "traceability/mts-v0.15.json",
    "cutover/typescript-c1-acceptance-v0.8.json",
    "contracts/mts-contract-v0.14.json",
    "contracts/mts-conformance-v0.14.json",
    "traceability/mts-v0.14.json",
    preFixRegistryPath,
    ...preFixNativeV015Paths,
    ...preFixSurface,
  ]) preFixCopy(path);

  const historicalPath = resolve(preFixRoot, preFixRegistryPath);
  const historicalSource = readFileSync(historicalPath, "utf8");
  const baselineCurrentIr = JSON.stringify(loadMtsSemanticIr(preFixRoot));
  const baselineCompile = JSON.stringify(compileRequirementDocuments(preFixRoot, false));
  const baselineCoverage = buildMarkdownCoverageAudit(preFixRoot);

  const restore = (): void => writeFileSync(historicalPath, historicalSource, "utf8");
  const mutateHistorical = (mutate: (value: any) => void): void => {
    const value = JSON.parse(historicalSource) as any;
    mutate(value);
    writeFileSync(historicalPath, JSON.stringify(value), "utf8");
  };

  // A. Historical document mode still controls current coverage.
  mutateHistorical((value) => { value.documentSurface["PORTFOLIO.md"].mode = "hybrid"; });
  same(JSON.stringify(loadMtsSemanticIr(preFixRoot)), baselineCurrentIr, "G4-A2 pre-fix A current IR immune");
  same(JSON.stringify(compileRequirementDocuments(preFixRoot, false)), baselineCompile, "G4-A2 pre-fix A current compile immune");
  same(
    buildMarkdownCoverageAudit(preFixRoot).documents.find((document) => document.path === "PORTFOLIO.md")?.mode,
    "hybrid",
    "G4-A2 pre-fix A historical mode still controls current coverage",
  );
  same(
    loadMtsSemanticIr(preFixRoot, preFixRegistryPath).documentModes["PORTFOLIO.md"],
    "hybrid",
    "G4-A2 pre-fix A explicit historical replay observes mutation",
  );
  restore();

  // B. Historical README anchor still vetoes current coverage.
  mutateHistorical((value) => {
    value.repositoryRequirements.find((item: any) => item.id === "README-OBSERVATORY").projection.anchor =
      "mts-g4-a2-absent-anchor";
  });
  same(JSON.stringify(loadMtsSemanticIr(preFixRoot)), baselineCurrentIr, "G4-A2 pre-fix B current IR immune");
  same(JSON.stringify(compileRequirementDocuments(preFixRoot, false)), baselineCompile, "G4-A2 pre-fix B current compile immune");
  throws(
    () => buildMarkdownCoverageAudit(preFixRoot),
    "anchor not found",
    "G4-A2 pre-fix B historical README anchor vetoes current coverage",
  );
  same(
    loadMtsSemanticIr(preFixRoot, preFixRegistryPath).repositoryRequirements
      .find((item) => item.id === "README-OBSERVATORY")?.docAnchor,
    "mts-g4-a2-absent-anchor",
    "G4-A2 pre-fix B explicit historical replay observes mutation",
  );
  restore();

  // C. Historical README URL validation still vetoes both current compile and coverage.
  mutateHistorical((value) => {
    value.repositoryRequirements.find((item: any) => item.id === "README-OBSERVATORY").url =
      "http://netkeep80.github.io/anum_docs/";
  });
  same(JSON.stringify(loadMtsSemanticIr(preFixRoot)), baselineCurrentIr, "G4-A2 pre-fix C current IR immune");
  throws(
    () => compileRequirementDocuments(preFixRoot, false),
    "absolute https URL",
    "G4-A2 pre-fix C historical README URL vetoes current compile",
  );
  throws(
    () => buildMarkdownCoverageAudit(preFixRoot),
    "absolute https URL",
    "G4-A2 pre-fix C historical README URL vetoes current coverage",
  );
  restore();

  // D. Historical repositoryRequirements presence still vetoes both current compile and coverage.
  mutateHistorical((value) => { delete value.repositoryRequirements; });
  same(JSON.stringify(loadMtsSemanticIr(preFixRoot)), baselineCurrentIr, "G4-A2 pre-fix D current IR immune");
  throws(
    () => compileRequirementDocuments(preFixRoot, false),
    ".repositoryRequirements must be an array",
    "G4-A2 pre-fix D historical repositoryRequirements removal vetoes current compile",
  );
  throws(
    () => buildMarkdownCoverageAudit(preFixRoot),
    ".repositoryRequirements must be an array",
    "G4-A2 pre-fix D historical repositoryRequirements removal vetoes current coverage",
  );
  restore();

  same(JSON.stringify(buildMarkdownCoverageAudit(preFixRoot)), JSON.stringify(baselineCoverage), "G4-A2 pre-fix fixture restores deterministically");
} finally {
  rmSync(preFixRoot, { recursive: true, force: true });
}

console.log(
  `Markdown coverage D20: GREEN normative=${report.summary.currentNormativeProjectedCount}/${report.summary.currentNormativeRequirementCount} inherited=${report.summary.inheritedV014RequirementCount} current=v0.15 research=${report.summary.researchHistoricalSectionCount}`,
);
