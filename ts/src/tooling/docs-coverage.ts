import { findRepositoryRoot } from "./docs-sync.js";
import { buildMarkdownCoverageAudit } from "./markdown-coverage-audit.js";

const report = buildMarkdownCoverageAudit(findRepositoryRoot());
if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  const s = report.summary;
  process.stdout.write([
    `MTS Markdown coverage: ${report.contract}`,
    `documents=${s.documentCount}`,
    `headings=${s.headingCount}`,
    `stableAnchors=${s.stableAnchorCount}`,
    `canonicalNodes=${s.canonicalNodeCount}`,
    `nonCanonicalAnchors=${s.nonCanonicalAnchorCount}`,
    `projectedRequirements=${s.requirementCount}`,
    `inheritedV014=${s.inheritedV014RequirementCount}`,
    `currentProjectFacts=${s.currentProjectFactCount}`,
    `currentNormative=${s.currentNormativeProjectedCount}/${s.currentNormativeRequirementCount}`,
    `requirementBackedSections=${s.requirementBackedSectionCount}`,
    `ownedBlocks=${s.ownedBlockCount}`,
    `unanchoredHeadings=${s.unanchoredHeadingCount}`,
    `researchHistorical=${s.researchHistoricalSectionCount}`,
    `currentlyUnclassified=${s.currentlyUnclassifiedSectionCount}`,
    "destructiveNodeMutation=NOT_AUTHORIZED",
    "",
  ].join("\n"));
}
