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

export function buildMarkdownCoverageAudit(root: string): MarkdownCoverageAudit {
  const ir = loadMtsSemanticIr(root);
  const proseMaterializationPending =
    ir.projectionState === "ACCEPTED_OWNER_PROJECTION_PROSE_RECONSTRUCTION_PENDING_1585";
  const documents = Object.keys(ir.documentModes).sort((a, b) => a.localeCompare(b)).map((path) => {
    const source = readFileSync(resolve(root, path), "utf8");
    const requirements = proseMaterializationPending
      ? []
      : [
          ...ir.requirements
            .filter((item) => item.docPath === path)
            .map((item) => Object.freeze({
              id: item.id,
              docAnchor: item.docAnchor,
              canonicalNodeRequired: true,
            })),
          ...ir.repositoryRequirements
            .filter((item) => item.docPath === path)
            .map((item) => Object.freeze({
              id: item.id,
              docAnchor: item.docAnchor,
              canonicalNodeRequired: false,
            })),
        ];
    return auditMarkdownDocument({
      path,
      mode: ir.documentModes[path]!,
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
    requirementCount: ir.requirements.length + ir.repositoryRequirements.length,
    requirementBackedSectionCount: sections.filter((section) => section.knowledgeClass === "requirements-backed").length,
    ownedBlockCount: documents.reduce((sum, document) => sum + document.ownedBlockCount, 0),
    unanchoredHeadingCount: sections.filter((section) => section.anchorId === null).length,
    researchHistoricalSectionCount: sections.filter((section) => section.knowledgeClass === "research-historical").length,
    currentlyUnclassifiedSectionCount: sections.filter((section) => section.knowledgeClass === "currently-unclassified").length,
  });

  return Object.freeze({
    schema: "mts-markdown-coverage/v0.1",
    contract: ir.contract,
    projectionState: ir.projectionState,
    proseMaterializationPending,
    documents: Object.freeze(documents),
    summary,
  });
}
