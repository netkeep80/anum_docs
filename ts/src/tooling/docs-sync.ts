import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileRequirementDocuments, MTS_REQUIREMENT_REGISTRY_PATH } from "./mts-compiler.js";
import { auditRepositoryMarkdownLinks } from "./markdown-link-audit.js";
import { auditRepositoryStableAnchors } from "./markdown-anchor-baseline.js";
import { auditRepositoryFoundationProvenance } from "./foundation-provenance-audit.js";

export const PROJECTION_START = "<!-- мтс-текущая-проекция:начало -->";
export const PROJECTION_END = "<!-- мтс-текущая-проекция:конец -->";

export const CURRENT_DOC_SIZE_SURFACE = [
  "README.md",
  "docs/CONTRIBUTING.md",
  "docs/theory/Основания МТС.md",
  "docs/theory/Система аксиом МТС.md",
  "docs/specs/Формальная нотация МТС.md",
  "docs/specs/Ачисла и сериализация.md",
  "docs/specs/Апамять и управление сетью связей.md",
  "docs/specs/Пучки связей.md",
  "docs/Словарь терминов МТС.md",
] as const;

export const CURRENT_DOC_SIZE_BUDGET = Object.freeze({
  baselineCodePoints: 113695,
  baselineLines: 3502,
  baselineWords: 15756,
  hardCeilingCodePoints: 116951,
});

export interface DocumentationSizeMeasurement {
  readonly documentCount: number;
  readonly codePoints: number;
  readonly lines: number;
  readonly words: number;
}

/**
 * README — единственный владелец краткой автоматически синхронизируемой проекции
 * текущего выпуска. Теория и процессные документы не получают копию release manifest.
 */
export const CANONICAL_DOCS = ["README.md"] as const;

export const PROJECTION_FORBIDDEN_DOCS = [
  "docs/CONTRIBUTING.md",
  "docs/theory/Основания МТС.md",
  "docs/theory/Система аксиом МТС.md",
] as const;

type JsonObject = Record<string, unknown>;

export interface CurrentProjection {
  readonly currentContract: string;
  readonly currentConformance: string;
  readonly previousContract: string;
  readonly previousConformance: string;
  readonly currentContractPath: string;
  readonly currentConformancePath: string;
  readonly previousContractPath: string;
  readonly previousConformancePath: string;
  readonly acceptancePath: string;
}

function fail(message: string): never {
  throw new Error(`docs-sync: ${message}`);
}

function object(value: unknown, name: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${name} must be an object`);
  }
  return value as JsonObject;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${name} must be a non-empty string`);
  return value;
}


function readJson(root: string, path: string): JsonObject {
  const fullPath = resolve(root, path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(fullPath, "utf8"));
  } catch (error) {
    fail(`cannot read JSON ${path}: ${(error as Error).message}`);
  }
  return object(parsed, path);
}

function nested(parent: JsonObject, key: string, name: string): JsonObject {
  return object(parent[key], `${name}.${key}`);
}

export function findRepositoryRoot(start = process.cwd()): string {
  let current = resolve(start);
  while (true) {
    if (existsSync(resolve(current, "repo-policy.json"))) return current;
    const parent = dirname(current);
    if (parent === current) fail(`cannot locate repo-policy.json from ${start}`);
    current = parent;
  }
}

export function loadCurrentProjection(root = findRepositoryRoot()): CurrentProjection {
  const policy = readJson(root, "repo-policy.json");
  const packs = nested(policy, "packs", "repo-policy.json");
  const topology = nested(packs, "contract-conformance", "repo-policy.json.packs");
  const current = nested(topology, "current", "repo-policy.json.packs.contract-conformance");
  const previous = nested(topology, "previous", "repo-policy.json.packs.contract-conformance");
  const acceptance = nested(topology, "acceptance", "repo-policy.json.packs.contract-conformance");

  const currentContractPath = string(nested(current, "contract", "current").path, "current.contract.path");
  const currentConformancePath = string(nested(current, "conformance", "current").path, "current.conformance.path");
  const previousContractPath = string(nested(previous, "contract", "previous").path, "previous.contract.path");
  const previousConformancePath = string(nested(previous, "conformance", "previous").path, "previous.conformance.path");
  const acceptancePath = string(nested(acceptance, "document", "acceptance").path, "acceptance.document.path");

  const contract = readJson(root, currentContractPath);
  const conformance = readJson(root, currentConformancePath);
  const previousContract = readJson(root, previousContractPath);
  const previousConformance = readJson(root, previousConformancePath);

  const contractSchema = string(contract.schema, `${currentContractPath}.schema`);
  const conformanceSchema = string(conformance.schema, `${currentConformancePath}.schema`);
  const declaredConformance = string(contract.conformanceCorpus, `${currentContractPath}.conformanceCorpus`);
  if (declaredConformance !== currentConformancePath) {
    fail(`current contract points to ${declaredConformance}, policy points to ${currentConformancePath}`);
  }
  const conformanceContract = string(conformance.contract, `${currentConformancePath}.contract`);
  if (conformanceContract !== contractSchema) {
    fail(`current conformance targets ${conformanceContract}, current contract is ${contractSchema}`);
  }

  return {
    currentContract: contractSchema,
    currentConformance: conformanceSchema,
    previousContract: string(previousContract.schema, `${previousContractPath}.schema`),
    previousConformance: string(previousConformance.schema, `${previousConformancePath}.schema`),
    currentContractPath,
    currentConformancePath,
    previousContractPath,
    previousConformancePath,
    acceptancePath,
  };
}

export const SEMANTIC_LAW_OWNER_BY_ID: Readonly<Record<string, string>> = Object.freeze({
  L1: "docs/specs/Апамять и управление сетью связей.md",
  L2: "docs/specs/Формальная нотация МТС.md",
  L3: "docs/specs/Формальная нотация МТС.md",
  L4: "docs/specs/Ачисла и сериализация.md",
  L5: "docs/specs/Ачисла и сериализация.md",
  L6: "docs/specs/Ачисла и сериализация.md",
  L7: "docs/specs/Ачисла и сериализация.md",
  L8: "docs/specs/Апамять и управление сетью связей.md",
  L9: "docs/specs/Апамять и управление сетью связей.md",
  L10: "docs/specs/Ачисла и сериализация.md",
  L11: "docs/specs/Ачисла и сериализация.md",
  L12: "docs/specs/Формальная нотация МТС.md",
  L13: "docs/specs/Ачисла и сериализация.md",
});

export interface SemanticLawDocumentationIssue {
  readonly code: "law-set-mismatch" | "unknown-owner" | "wrong-owner" | "duplicate-owner" | "missing-owner" | "empty-owner" | "unknown-reference";
  readonly lawId: string;
  readonly path?: string;
  readonly line?: number;
  readonly message: string;
}

interface SemanticLawAnchor {
  readonly lawId: string;
  readonly path: string;
  readonly line: number;
}

interface MarkdownFacts {
  readonly owners: readonly SemanticLawAnchor[];
  readonly references: readonly SemanticLawAnchor[];
  readonly lines: readonly string[];
  readonly visible: readonly boolean[];
}

const LEGACY_OWNER_LINE = /^<a id="mts-law-([A-Za-z][A-Za-z0-9]*)"><\/a>\s*<!--\s*нормативный владелец\s*-->$/;
const REQUIREMENT_OWNER_LINE = /^<!--\s*мтс:требование:(V14-L\d+):начало\s*-->$/;
const REFERENCE = /<!--\s*ссылка:mts-law-([A-Za-z][A-Za-z0-9]*)\s*-->/g;

function ownerLawId(line: string): string | undefined {
  return line.match(LEGACY_OWNER_LINE)?.[1] ?? line.match(REQUIREMENT_OWNER_LINE)?.[1];
}

function markdownFacts(path: string, source: string): MarkdownFacts {
  const lines = source.split(/\r?\n/);
  const visible: boolean[] = [];
  const owners: SemanticLawAnchor[] = [];
  const references: SemanticLawAnchor[] = [];
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (trimmed.startsWith("~~~") || trimmed.startsWith(String.fromCharCode(96, 96, 96))) {
      visible.push(false);
      inFence = !inFence;
      continue;
    }
    visible.push(!inFence);
    if (inFence) continue;

    const lawId = ownerLawId(trimmed);
    if (lawId !== undefined) owners.push({ lawId, path, line: index + 1 });

    REFERENCE.lastIndex = 0;
    for (const match of line.matchAll(REFERENCE)) {
      const lawId = match[1];
      if (lawId) references.push({ lawId, path, line: index + 1 });
    }
  }
  return { owners, references, lines, visible };
}

function ownerHasBody(facts: MarkdownFacts, owner: SemanticLawAnchor): boolean {
  const start = owner.line;
  for (let index = start; index < facts.lines.length; index += 1) {
    if (!facts.visible[index]) continue;
    const trimmed = (facts.lines[index] ?? "").trim();
    if (!trimmed) continue;
    if (ownerLawId(trimmed) !== undefined) return false;
    if (/^<!--.*-->$/.test(trimmed)) continue;
    if (/^#{1,6}\s+/.test(trimmed)) continue;
    return true;
  }
  return false;
}

export function validateSemanticLawDocumentation(
  requiredLawIds: readonly string[],
  documents: Readonly<Record<string, string>>,
  ownerById: Readonly<Record<string, string>> = SEMANTIC_LAW_OWNER_BY_ID,
): SemanticLawDocumentationIssue[] {
  const issues: SemanticLawDocumentationIssue[] = [];
  const required = new Set(requiredLawIds);
  const configured = new Set(Object.keys(ownerById));

  const missingFromConfig = [...required].filter((id) => !configured.has(id));
  const extraInConfig = [...configured].filter((id) => !required.has(id));
  for (const lawId of [...missingFromConfig, ...extraInConfig].sort()) {
    issues.push({
      code: "law-set-mismatch",
      lawId,
      message: `configured owner law set differs from accepted requiredSemanticLaws: ${lawId}`,
    });
  }

  const facts = Object.entries(documents).map(([path, source]) => markdownFacts(path, source));
  const owners = facts.flatMap((item) => item.owners);
  const references = facts.flatMap((item) => item.references);

  for (const owner of owners) {
    // During an atomic accepted-version cutover the trusted-base release may
    // retain owner anchors as immutable acceptance evidence. Only owner IDs
    // required by the current contract participate in current-owner checks.
    if (!required.has(owner.lawId)) continue;
    const expectedPath = ownerById[owner.lawId];
    if (expectedPath !== owner.path) {
      issues.push({
        code: "wrong-owner",
        lawId: owner.lawId,
        path: owner.path,
        line: owner.line,
        message: `semantic law ${owner.lawId} owner must be ${expectedPath}, found ${owner.path}:${owner.line}`,
      });
    }
  }

  for (const lawId of [...required].sort()) {
    const matches = owners.filter((owner) => owner.lawId === lawId);
    if (matches.length === 0) {
      issues.push({ code: "missing-owner", lawId, message: `semantic law ${lawId} has no current normative owner` });
      continue;
    }
    if (matches.length > 1) {
      issues.push({
        code: "duplicate-owner",
        lawId,
        message: `semantic law ${lawId} has multiple owners: ${matches.map((owner) => `${owner.path}:${owner.line}`).join(", ")}`,
      });
    }
    for (const owner of matches) {
      const ownerFacts = facts.find((item) => item.owners.some((candidate) => candidate.path === owner.path && candidate.line === owner.line));
      if (ownerFacts && !ownerHasBody(ownerFacts, owner)) {
        issues.push({
          code: "empty-owner",
          lawId,
          path: owner.path,
          line: owner.line,
          message: `semantic law ${lawId} owner at ${owner.path}:${owner.line} has no normative body`,
        });
      }
    }
  }

  for (const reference of references) {
    if (!required.has(reference.lawId)) {
      issues.push({
        code: "unknown-reference",
        lawId: reference.lawId,
        path: reference.path,
        line: reference.line,
        message: `semantic law reference ${reference.lawId} at ${reference.path}:${reference.line} does not resolve`,
      });
    }
  }

  return issues;
}

export function checkRepositorySemanticLawDocumentation(root = findRepositoryRoot()): SemanticLawDocumentationIssue[] {
  const policy = readJson(root, "repo-policy.json");
  const packs = nested(policy, "packs", "repo-policy.json");
  const topology = nested(packs, "contract-conformance", "repo-policy.json.packs");
  const current = nested(topology, "current", "repo-policy.json.packs.contract-conformance");
  const currentContractPath = string(nested(current, "contract", "current").path, "current.contract.path");
  const contract = readJson(root, currentContractPath);
  const laws = nested(contract, "requiredSemanticLaws", currentContractPath);
  const requiredLawIds = Object.keys(laws);

  const registryPath = typeof contract.documentationProjectionRegistry === "string"
    ? contract.documentationProjectionRegistry
    : MTS_REQUIREMENT_REGISTRY_PATH;
  const registry = readJson(root, registryPath);
  if (!Array.isArray(registry.requirements)) fail(`${registryPath}.requirements must be an array`);

  const ownerById: Record<string, string> = {};
  const ownerKeys = new Set<string>();
  for (const [index, raw] of (registry.requirements as unknown[]).entries()) {
    const requirement = object(raw, `${registryPath}.requirements[${index}]`);
    const id = string(requirement.id, `${registryPath}.requirements[${index}].id`);
    const projection = object(requirement.docProjection, `${registryPath}.requirements[${index}].docProjection`);
    const path = string(projection.path, `${registryPath}.requirements[${index}].docProjection.path`);
    const anchor = string(projection.anchor, `${registryPath}.requirements[${index}].docProjection.anchor`);
    if (ownerById[id] !== undefined) fail(`${registryPath}: duplicate requirement owner ${id}`);
    const ownerKey = `${path}#${anchor}`;
    if (ownerKeys.has(ownerKey)) fail(`${registryPath}: duplicate document owner ${ownerKey}`);
    ownerKeys.add(ownerKey);
    ownerById[id] = path;
    if (!existsSync(resolve(root, path))) fail(`${registryPath}: owner document does not exist: ${path}`);
  }

  const required = [...requiredLawIds].sort();
  const configured = Object.keys(ownerById).sort();
  if (required.join("\n") !== configured.join("\n")) {
    fail(`${registryPath}: owner law set differs from current contract`);
  }

  if (registry.projectionState === "ACCEPTED_OWNER_PROJECTION_PROSE_RECONSTRUCTION_PENDING_1585") {
    return [];
  }

  const paths = new Set<string>([
    ...Object.values(ownerById),
    ...((nested(policy, "paths", "repo-policy.json").canonical_docs as unknown[]) ?? [])
      .filter((value): value is string => typeof value === "string"),
  ]);
  const documents: Record<string, string> = {};
  for (const path of paths) {
    const fullPath = resolve(root, path);
    if (!existsSync(fullPath)) continue;
    documents[path] = readFileSync(fullPath, "utf8");
  }
  return validateSemanticLawDocumentation(requiredLawIds, documents, ownerById);
}

export function renderCurrentProjection(value: CurrentProjection): string {
  return [
    PROJECTION_START,
    `> **Текущий принятый выпуск МТС: ${value.currentContract.replace("mts-contract/", "")}.** Этот блок строится из принятых указателей командой \`npm --prefix ts run docs:sync\`.`,
    ">",
    `> - Контракт: \`${value.currentContract}\` — [файл контракта](${value.currentContractPath}).`,
    `> - Корпус соответствия: \`${value.currentConformance}\` — [файл корпуса](${value.currentConformancePath}).`,
    `> - Свидетельство принятия: [файл принятия](${value.acceptancePath}).`,
    PROJECTION_END,
  ].join("\n");
}

function markerPositions(source: string, marker: string): number[] {
  const positions: number[] = [];
  let offset = 0;
  while (true) {
    const position = source.indexOf(marker, offset);
    if (position < 0) return positions;
    positions.push(position);
    offset = position + marker.length;
  }
}

export function replaceProjection(source: string, projection: string): string {
  const starts = markerPositions(source, PROJECTION_START);
  const ends = markerPositions(source, PROJECTION_END);
  if (starts.length !== 1 || ends.length !== 1 || starts[0] === undefined || ends[0] === undefined) {
    fail(`expected exactly one projection marker pair, found start=${starts.length} end=${ends.length}`);
  }
  if (ends[0] < starts[0]) fail("projection end marker appears before start marker");
  const before = source.slice(0, starts[0]);
  const after = source.slice(ends[0] + PROJECTION_END.length);
  return `${before}${projection}${after}`;
}

export function checkProjectionText(source: string, projection: string): boolean {
  try {
    return replaceProjection(source, projection) === source;
  } catch {
    return false;
  }
}

export function measureDocumentationSize(
  documents: Readonly<Record<string, string>>,
): DocumentationSizeMeasurement {
  let codePoints = 0;
  let lines = 0;
  let words = 0;
  for (const path of CURRENT_DOC_SIZE_SURFACE) {
    const source = documents[path];
    if (source === undefined) fail(`size-budget document is missing: ${path}`);
    codePoints += [...source].length;
    lines += source.length === 0 ? 0 : source.split(/\r?\n/).length;
    words += source.match(/[\p{L}\p{N}_]+/gu)?.length ?? 0;
  }
  return Object.freeze({
    documentCount: CURRENT_DOC_SIZE_SURFACE.length,
    codePoints,
    lines,
    words,
  });
}

export function measureRepositoryCurrentDocumentationSize(
  root = findRepositoryRoot(),
): DocumentationSizeMeasurement {
  const documents: Record<string, string> = {};
  for (const path of CURRENT_DOC_SIZE_SURFACE) {
    const fullPath = resolve(root, path);
    if (!existsSync(fullPath)) fail(`size-budget document is missing: ${path}`);
    documents[path] = readFileSync(fullPath, "utf8");
  }
  return measureDocumentationSize(documents);
}

export function currentDocumentationSizeWithinBudget(
  measurement: DocumentationSizeMeasurement,
): boolean {
  return measurement.codePoints <= CURRENT_DOC_SIZE_BUDGET.hardCeilingCodePoints;
}

export function checkRepositoryDocs(root = findRepositoryRoot()): string[] {
  const projection = renderCurrentProjection(loadCurrentProjection(root));
  const stale = CANONICAL_DOCS.filter((path) => {
    const source = readFileSync(resolve(root, path), "utf8");
    return !checkProjectionText(source, projection);
  });
  const duplicated = PROJECTION_FORBIDDEN_DOCS.filter((path) => {
    const source = readFileSync(resolve(root, path), "utf8");
    return source.includes(PROJECTION_START) || source.includes(PROJECTION_END);
  });
  const compiledRequirements = compileRequirementDocuments(root, false);
  return [...new Set([...stale, ...duplicated, ...compiledRequirements])].sort();
}

export function syncRepositoryDocs(root = findRepositoryRoot()): string[] {
  const projection = renderCurrentProjection(loadCurrentProjection(root));
  const changed: string[] = [];
  for (const path of CANONICAL_DOCS) {
    const fullPath = resolve(root, path);
    const source = readFileSync(fullPath, "utf8");
    const updated = replaceProjection(source, projection);
    if (updated === source) continue;
    writeFileSync(fullPath, updated, "utf8");
    changed.push(path);
  }
  for (const path of compileRequirementDocuments(root, true)) {
    if (!changed.includes(path)) changed.push(path);
  }
  return changed.sort();
}

function main(): void {
  const root = findRepositoryRoot();
  const mode = process.argv[2] ?? "--check";
  if (mode === "--write") {
    const changed = syncRepositoryDocs(root);
    console.log(changed.length ? `Синхронизированы: ${changed.join(", ")}` : "Документация уже синхронизирована.");
    return;
  }
  if (mode !== "--check") fail(`unknown mode ${mode}; expected --check or --write`);
  const stale = checkRepositoryDocs(root);
  if (stale.length) fail(`устарела автоматическая проекция: ${stale.join(", ")}; запустите npm --prefix ts run docs:sync`);
  const lawIssues = checkRepositorySemanticLawDocumentation(root);
  if (lawIssues.length) fail(`нарушена документационная канонизация законов: ${lawIssues.map((issue) => issue.message).join("; ")}`);
  const linkIssues = auditRepositoryMarkdownLinks(root, CURRENT_DOC_SIZE_SURFACE);
  if (linkIssues.length) {
    fail(`нарушена целостность локальных Markdown-ссылок: ${linkIssues.map((issue) => issue.message).join("; ")}`);
  }
  const anchorIssues = auditRepositoryStableAnchors(root);
  if (anchorIssues.length) {
    fail(`нарушена сохранность stable Markdown anchors: ${anchorIssues.map((issue) => issue.message).join("; ")}`);
  }
  const provenance = auditRepositoryFoundationProvenance(root);
  if (provenance.issues.length) {
    fail(`нарушена provenance-целостность baseline clauses: ${provenance.issues.map((entry) => entry.message).join("; ")}`);
  }
  const size = measureRepositoryCurrentDocumentationSize(root);
  if (!currentDocumentationSizeWithinBudget(size)) {
    fail(`current documentation size ${size.codePoints} exceeds hard ceiling ${CURRENT_DOC_SIZE_BUDGET.hardCeilingCodePoints} code points`);
  }
  console.log(
    `MTS Compiler: docs synchronized; foundation provenance=${provenance.directEvidenceClauseCount}/${provenance.clauseCount}, gaps=${provenance.gapClauseIds.join(",")}; current-doc size=${size.codePoints} code points / ${size.lines} lines / ${size.words} words; ceiling=${CURRENT_DOC_SIZE_BUDGET.hardCeilingCodePoints}.`,
  );
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) main();
