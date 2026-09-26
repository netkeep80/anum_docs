import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface ObservatoryMarkdownCoverageDocument {
  readonly path: string;
  readonly mode: string;
  readonly headingCount: number;
  readonly stableAnchorCount: number;
  readonly canonicalNodeCount: number;
  readonly nonCanonicalAnchorCount: number;
  readonly requirementCount: number;
  readonly ownedBlockCount: number;
  readonly unanchoredHeadingCount: number;
  readonly researchHistoricalSectionCount: number;
  readonly currentlyUnclassifiedSectionCount: number;
}

export interface ObservatoryMarkdownCoverageSummary {
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

export interface ObservatoryMarkdownCoverage {
  readonly schema: string;
  readonly contract: string;
  readonly documents: readonly ObservatoryMarkdownCoverageDocument[];
  readonly summary: ObservatoryMarkdownCoverageSummary;
}

type JsonRecord = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`Contract Observatory Markdown coverage bridge: ${message}`);
}

function record(value: unknown, source: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${source} must be an object`);
  return value as JsonRecord;
}

function text(value: unknown, source: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${source} must be a non-empty string`);
  return value;
}

function count(value: unknown, source: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) fail(`${source} must be a non-negative integer`);
  return value;
}

function strings(value: unknown, source: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) fail(`${source} must be a string array`);
  return Object.freeze([...(value as string[])]);
}

export function loadCompiledMarkdownCoverage(repositoryRoot: string): ObservatoryMarkdownCoverage {
  const root = resolve(repositoryRoot);
  const modulePath = resolve(root, "ts", "dist", "src", "tooling", "markdown-coverage-audit.js");
  const moduleUrl = pathToFileURL(modulePath).href;
  const program = [
    `import { buildMarkdownCoverageAudit } from ${JSON.stringify(moduleUrl)};`,
    `process.stdout.write(JSON.stringify(buildMarkdownCoverageAudit(${JSON.stringify(root)})));`,
  ].join("\n");

  let output: string;
  try {
    output = execFileSync(process.execPath, ["--input-type=module", "--eval", program], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`coverage audit invocation failed: ${detail}`);
  }

  try {
    return validateMarkdownCoverage(JSON.parse(output));
  } catch (error) {
    if (error instanceof SyntaxError) fail("coverage audit returned malformed JSON");
    throw error;
  }
}

export function validateMarkdownCoverage(value: unknown): ObservatoryMarkdownCoverage {
  const root = record(value, "coverage");
  const summaryRaw = record(root.summary, "coverage.summary");
  const documentsRaw = root.documents;
  if (!Array.isArray(documentsRaw)) fail("coverage.documents must be an array");

  const documents = documentsRaw.map((raw, index) => {
    const source = `coverage.documents[${index}]`;
    const document = record(raw, source);
    const path = text(document.path, `${source}.path`);
    const mode = text(document.mode, `${source}.mode`);
    if (!["source", "hybrid", "generated"].includes(mode)) fail(`${path}: unsupported document mode ${mode}`);

    const sections = document.sections;
    if (!Array.isArray(sections)) fail(`${path}: sections must be an array`);
    let unanchored = 0;
    let research = 0;
    let unclassified = 0;
    let requirementBacked = 0;
    for (const [sectionIndex, rawSection] of sections.entries()) {
      const section = record(rawSection, `${path}.sections[${sectionIndex}]`);
      const anchorId = section.anchorId;
      if (anchorId !== null && typeof anchorId !== "string") fail(`${path}: anchorId must be string|null`);
      if (anchorId === null) unanchored += 1;
      const knowledgeClass = text(section.knowledgeClass, `${path}: knowledgeClass`);
      if (knowledgeClass === "research-historical") research += 1;
      else if (knowledgeClass === "currently-unclassified") unclassified += 1;
      else if (knowledgeClass === "requirements-backed") requirementBacked += 1;
      else fail(`${path}: unsupported knowledge class ${knowledgeClass}`);
      if (section.authoredContentPolicy !== "preserve") fail(`${path}: authored content policy must be preserve`);
      if (section.wholeNodeMutation !== "not-authorized") fail(`${path}: whole-node mutation must be not-authorized`);
    }

    const headingCount = count(document.headingCount, `${path}.headingCount`);
    if (headingCount !== sections.length) fail(`${path}: headingCount differs from section inventory`);
    const nonCanonicalAnchorIds = strings(document.nonCanonicalAnchorIds, `${path}.nonCanonicalAnchorIds`);

    return Object.freeze({
      path,
      mode,
      headingCount,
      stableAnchorCount: count(document.stableAnchorCount, `${path}.stableAnchorCount`),
      canonicalNodeCount: count(document.canonicalNodeCount, `${path}.canonicalNodeCount`),
      nonCanonicalAnchorCount: nonCanonicalAnchorIds.length,
      requirementCount: count(document.requirementCount, `${path}.requirementCount`),
      ownedBlockCount: count(document.ownedBlockCount, `${path}.ownedBlockCount`),
      unanchoredHeadingCount: unanchored,
      researchHistoricalSectionCount: research,
      currentlyUnclassifiedSectionCount: unclassified,
      requirementBackedSectionCount: requirementBacked,
    });
  });

  const paths = new Set(documents.map((document) => document.path));
  if (paths.size !== documents.length) fail("duplicate document path");

  const summary: ObservatoryMarkdownCoverageSummary = Object.freeze({
    documentCount: count(summaryRaw.documentCount, "coverage.summary.documentCount"),
    headingCount: count(summaryRaw.headingCount, "coverage.summary.headingCount"),
    stableAnchorCount: count(summaryRaw.stableAnchorCount, "coverage.summary.stableAnchorCount"),
    canonicalNodeCount: count(summaryRaw.canonicalNodeCount, "coverage.summary.canonicalNodeCount"),
    nonCanonicalAnchorCount: count(summaryRaw.nonCanonicalAnchorCount, "coverage.summary.nonCanonicalAnchorCount"),
    requirementCount: count(summaryRaw.requirementCount, "coverage.summary.requirementCount"),
    requirementBackedSectionCount: count(summaryRaw.requirementBackedSectionCount, "coverage.summary.requirementBackedSectionCount"),
    ownedBlockCount: count(summaryRaw.ownedBlockCount, "coverage.summary.ownedBlockCount"),
    unanchoredHeadingCount: count(summaryRaw.unanchoredHeadingCount, "coverage.summary.unanchoredHeadingCount"),
    researchHistoricalSectionCount: count(summaryRaw.researchHistoricalSectionCount, "coverage.summary.researchHistoricalSectionCount"),
    currentlyUnclassifiedSectionCount: count(summaryRaw.currentlyUnclassifiedSectionCount, "coverage.summary.currentlyUnclassifiedSectionCount"),
  });

  const sum = (field: keyof ObservatoryMarkdownCoverageDocument): number =>
    documents.reduce((total, document) => total + (typeof document[field] === "number" ? document[field] as number : 0), 0);
  const observed = {
    documentCount: documents.length,
    headingCount: sum("headingCount"),
    stableAnchorCount: sum("stableAnchorCount"),
    canonicalNodeCount: sum("canonicalNodeCount"),
    nonCanonicalAnchorCount: sum("nonCanonicalAnchorCount"),
    requirementCount: sum("requirementCount"),
    requirementBackedSectionCount: documents.reduce((total, document) => total + document.requirementBackedSectionCount, 0),
    ownedBlockCount: sum("ownedBlockCount"),
    unanchoredHeadingCount: sum("unanchoredHeadingCount"),
    researchHistoricalSectionCount: sum("researchHistoricalSectionCount"),
    currentlyUnclassifiedSectionCount: sum("currentlyUnclassifiedSectionCount"),
  };
  for (const key of Object.keys(observed) as Array<keyof typeof observed>) {
    if (summary[key] !== observed[key]) fail(`summary mismatch for ${key}: ${summary[key]} != ${observed[key]}`);
  }

  return Object.freeze({
    schema: text(root.schema, "coverage.schema"),
    contract: text(root.contract, "coverage.contract"),
    documents: Object.freeze(documents),
    summary,
  });
}
