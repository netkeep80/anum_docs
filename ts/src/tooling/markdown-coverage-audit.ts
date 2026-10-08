import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  listMarkdownAnchorIds,
  listMarkdownSections,
  listOwnedMarkdownBlockIds,
  readOwnedMarkdownBlock,
  resolveMarkdownAnchor,
  type MarkdownDocumentMode,
} from "./markdown-section-adapter.js";
import { loadMtsSemanticIr } from "./mts-compiler.js";

export type MarkdownKnowledgeClass =
  | "requirements-backed"
  | "research-historical"
  | "currently-unclassified";

export interface MarkdownCoverageSection {
  readonly diagnosticLine: number;
  readonly level: number;
  readonly title: string;
  readonly headingPath: readonly string[];
  readonly anchorId: string | null;
  readonly requirementIds: readonly string[];
  readonly ownedBlockIds: readonly string[];
  readonly knowledgeClass: MarkdownKnowledgeClass;
  readonly authoredContentPolicy: "preserve";
  readonly wholeNodeMutation: "not-authorized";
}

export interface MarkdownCoverageDocument {
  readonly path: string;
  readonly mode: MarkdownDocumentMode;
  readonly headingCount: number;
  readonly stableAnchorCount: number;
  readonly canonicalNodeCount: number;
  readonly nonCanonicalAnchorIds: readonly string[];
  readonly requirementCount: number;
  readonly ownedBlockCount: number;
  readonly sections: readonly MarkdownCoverageSection[];
}

export interface MarkdownCoverageSummary {
  readonly documentCount: number;
  readonly headingCount: number;
  readonly stableAnchorCount: number;
  readonly canonicalNodeCount: number;
  readonly nonCanonicalAnchorCount: number;
  readonly requirementCount: number;
  /** Accepted current normative records indexed, not historical V14 owned blocks. */
  readonly currentNormativeRequirementCount: number;
  readonly currentNormativeProjectedCount: number;
  /** Historical inherited v0.14 law/repository blocks retained by owner. */
  readonly inheritedV014RequirementCount: number;
  readonly requirementBackedSectionCount: number;
  readonly ownedBlockCount: number;
  readonly unanchoredHeadingCount: number;
  readonly researchHistoricalSectionCount: number;
  readonly currentlyUnclassifiedSectionCount: number;
}

export interface MarkdownCoverageAudit {
  readonly schema: "mts-markdown-coverage/v0.1";
  readonly contract: string;
  readonly projectionState: string;
  readonly proseMaterializationPending: boolean;
  readonly documents: readonly MarkdownCoverageDocument[];
  readonly summary: MarkdownCoverageSummary;
}

interface CoverageRequirement {
  readonly id: string;
  readonly docAnchor: string;
  readonly canonicalNodeRequired?: boolean;
}

function fail(message: string): never {
  throw new Error(`markdown-coverage-audit: ${message}`);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const a = [...new Set(left)].sort((x, y) => x.localeCompare(y));
  const b = [...new Set(right)].sort((x, y) => x.localeCompare(y));
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function knowledgeClass(path: string, requirementIds: readonly string[]): MarkdownKnowledgeClass {
  if (requirementIds.length > 0) return "requirements-backed";
  if (path.startsWith("docs/research/")) return "research-historical";
  return "currently-unclassified";
}

export function auditMarkdownDocument(args: {
  readonly path: string;
  readonly mode: MarkdownDocumentMode;
  readonly source: string;
  readonly requirements: readonly CoverageRequirement[];
  readonly allowUnprojectedOwnedBlocks?: boolean;
}): MarkdownCoverageDocument {
  const { path, mode, source } = args;
  const requirements = [...args.requirements].sort((a, b) => a.id.localeCompare(b.id));
  const sections = listMarkdownSections(source);
  const stableAnchorIds = listMarkdownAnchorIds(source);
  const ownedBlockIds = listOwnedMarkdownBlockIds(source);
  const canonicalAnchorIds = sections
    .map((section) => section.anchorId)
    .filter((anchorId): anchorId is string => anchorId !== null);
  const canonicalAnchorSet = new Set(canonicalAnchorIds);

  const requirementSection = new Map<string, number>();
  for (const requirement of requirements) {
    const canonicalNodeRequired = requirement.canonicalNodeRequired !== false;
    let section = sections.find((candidate) => candidate.anchorId === requirement.docAnchor);
    if (canonicalNodeRequired && !canonicalAnchorSet.has(requirement.docAnchor)) {
      fail(`${path}: requirement ${requirement.id} projection anchor is not a canonical node: ${requirement.docAnchor}`);
    }
    if (section === undefined && !canonicalNodeRequired) {
      const anchor = resolveMarkdownAnchor(source, requirement.docAnchor);
      section = sections.find((candidate) => anchor.offset >= candidate.start && anchor.offset < candidate.end);
    }
    if (section === undefined) {
      fail(`${path}: requirement ${requirement.id} projection anchor is outside a Markdown section: ${requirement.docAnchor}`);
    }

    const block = readOwnedMarkdownBlock(source, requirement.id);
    if (block === null) fail(`${path}: requirement ${requirement.id} has no compiler-owned block`);
    if (block.start < section.start || block.end > section.end) {
      fail(`${path}: requirement ${requirement.id} owned block is outside section for ${requirement.docAnchor}`);
    }
    requirementSection.set(requirement.id, section.diagnosticLine);
  }

  const requirementIds = requirements.map((item) => item.id);
  if (!args.allowUnprojectedOwnedBlocks && !sameSet(ownedBlockIds, requirementIds)) {
    fail(`${path}: compiler-owned block IDs differ from projected requirement IDs; blocks=[${ownedBlockIds.join(", ")}] requirements=[${requirementIds.join(", ")}]`);
  }

  const resultSections = sections.map((section) => {
    const ids = requirements
      .filter((requirement) => requirementSection.get(requirement.id) === section.diagnosticLine)
      .map((requirement) => requirement.id)
      .sort((a, b) => a.localeCompare(b));
    const blocks = ownedBlockIds.filter((id) => {
      const block = readOwnedMarkdownBlock(source, id)!;
      return block.start >= section.start && block.end <= section.end;
    });
    return Object.freeze({
      diagnosticLine: section.diagnosticLine,
      level: section.heading.level,
      title: section.heading.title,
      headingPath: Object.freeze(section.headingPath.map((heading) => heading.title)),
      anchorId: section.anchorId,
      requirementIds: Object.freeze(ids),
      ownedBlockIds: Object.freeze(blocks),
      knowledgeClass: knowledgeClass(path, ids),
      authoredContentPolicy: "preserve" as const,
      wholeNodeMutation: "not-authorized" as const,
    });
  });

  const nonCanonicalAnchorIds = stableAnchorIds
    .filter((id) => !canonicalAnchorSet.has(id))
    .sort((a, b) => a.localeCompare(b));

  return Object.freeze({
    path,
    mode,
    headingCount: resultSections.length,
    stableAnchorCount: stableAnchorIds.length,
    canonicalNodeCount: canonicalAnchorIds.length,
    nonCanonicalAnchorIds: Object.freeze(nonCanonicalAnchorIds),
    requirementCount: requirements.length,
    ownedBlockCount: ownedBlockIds.length,
    sections: Object.freeze(resultSections),
  });
}

/**
 * Validate that every accepted v0.15 requirement has one and only one
 * current FORMAL Markdown projection, and no extraneous V15 IDs are injected.
 * Inherited V14 blocks are deliberately checked separately, as provenance.
 */
export function auditAcceptedV015RequirementRows(
  markdown: string,
  accepted: readonly Readonly<{ id: string; group: string; state: string; summary: string }>[],
): number {
  const rows = new Map<string, { group: string; state: string; summary: string }>();
  const pattern = /^\| <a id="mts-v015-([a-z0-9-]+)"><\/a>`(V15-[A-Z0-9-]+)` \| `([^`]+)` \| `([^`]+)` \| (.*) \|$/gmu;
  for (const match of markdown.matchAll(pattern)) {
    const [, anchor, id, group, state, summary] = match;
    if (id === undefined || anchor === undefined || group === undefined || state === undefined || summary === undefined) {
      fail("malformed accepted v0.15 requirement row");
    }
    if (anchor !== id.toLowerCase() || rows.has(id)) {
      fail("duplicate/mismatched v0.15 normative requirement anchor: " + id);
    }
    rows.set(id, { group, state, summary });
  }
  if (rows.size !== accepted.length) {
    fail("accepted v0.15 normative rows incomplete: " + rows.size + "/" + accepted.length);
  }
  for (const req of accepted) {
    const actual = rows.get(req.id);
    if (!actual) fail("current normative requirement missing: " + req.id);
    if (actual.group !== req.group || actual.state !== req.state ||
        actual.summary !== req.summary.replace(/\|/g, "\\|").replace(/\r?\n/g, " ")) {
      fail("current normative requirement projection differs from accepted source: " + req.id);
    }
  }
  return rows.size;
}

export function buildMarkdownCoverageAudit(root: string): MarkdownCoverageAudit {
  const currentIr = loadMtsSemanticIr(root);
  // V14 is retained solely as inherited law-block provenance. It is not
  // a fallback authority for accepted v0.15 current requirements.
  const isV015 = currentIr.schema === "mts-requirement-registry/v0.3";
  const historicalOwnerIr = isV015
    ? loadMtsSemanticIr(root, "requirements/mts-v0.14.json")
    : currentIr;
  let projectedV015Count = 0;
  if (isV015) {
    const registry = JSON.parse(readFileSync(resolve(root, "requirements/mts-v0.15.json"), "utf8")) as {
      requirements: { id: string; group: string; state: string; summary: string; mandatory: boolean }[];
    };
    const accepted = registry.requirements.filter((item) => item.mandatory !== false);
    if (accepted.length !== currentIr.requirements.length) {
      fail("accepted v0.15 semantic IR and normative source requirement set differ");
    }
    projectedV015Count = auditAcceptedV015RequirementRows(
      readFileSync(resolve(root, "docs/specs/Формальная нотация МТС.md"), "utf8"),
      accepted,
    );
  }
  const projectionIr = historicalOwnerIr;
  const proseMaterializationPending =
    projectionIr.projectionState === "ACCEPTED_OWNER_PROJECTION_PROSE_RECONSTRUCTION_PENDING_1585";
  const documents = Object.keys(projectionIr.documentModes).sort((a, b) => a.localeCompare(b)).map((path) => {
    const source = readFileSync(resolve(root, path), "utf8");
    const requirements = proseMaterializationPending
      ? []
      : [
          ...projectionIr.requirements
            .filter((item) => item.docPath === path)
            .map((item) => Object.freeze({
              id: item.id,
              docAnchor: item.docAnchor,
              canonicalNodeRequired: true,
            })),
          ...projectionIr.repositoryRequirements
            .filter((item) => item.docPath === path)
            .map((item) => Object.freeze({
              id: item.id,
              docAnchor: item.docAnchor,
              canonicalNodeRequired: false,
            })),
        ];
    return auditMarkdownDocument({
      path,
      mode: projectionIr.documentModes[path]!,
      source,
      requirements,
      allowUnprojectedOwnedBlocks: proseMaterializationPending,
    });
  });

  const sections = documents.flatMap((document) => document.sections);
  const summary: MarkdownCoverageSummary = Object.freeze({
    documentCount: documents.length,
    headingCount: sections.length,
    stableAnchorCount: documents.reduce((sum, document) => sum + document.stableAnchorCount, 0),
    canonicalNodeCount: documents.reduce((sum, document) => sum + document.canonicalNodeCount, 0),
    nonCanonicalAnchorCount: documents.reduce((sum, document) => sum + document.nonCanonicalAnchorIds.length, 0),
    requirementCount: projectionIr.requirements.length + projectionIr.repositoryRequirements.length,
    currentNormativeRequirementCount: isV015 ? currentIr.requirements.length : projectionIr.requirements.length,
    currentNormativeProjectedCount: isV015 ? projectedV015Count : projectionIr.requirements.length,
    inheritedV014RequirementCount: isV015 ? projectionIr.requirements.length + projectionIr.repositoryRequirements.length : 0,
    requirementBackedSectionCount: sections.filter((section) => section.knowledgeClass === "requirements-backed").length,
    ownedBlockCount: documents.reduce((sum, document) => sum + document.ownedBlockCount, 0),
    unanchoredHeadingCount: sections.filter((section) => section.anchorId === null).length,
    researchHistoricalSectionCount: sections.filter((section) => section.knowledgeClass === "research-historical").length,
    currentlyUnclassifiedSectionCount: sections.filter((section) => section.knowledgeClass === "currently-unclassified").length,
  });

  return Object.freeze({
    schema: "mts-markdown-coverage/v0.1",
    contract: currentIr.contract,
    projectionState: isV015
      ? "V015_ACCEPTED_48_NORMATIVE_ROWS_PROJECTED_FORMULA_MIGRATION_PENDING_1951"
      : projectionIr.projectionState,
    proseMaterializationPending,
    documents: Object.freeze(documents),
    summary,
  });
}
