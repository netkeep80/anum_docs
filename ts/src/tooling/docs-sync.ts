import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileRequirementDocuments } from "./mts-compiler.js";

export const PROJECTION_START = "<!-- мтс-текущая-проекция:начало -->";
export const PROJECTION_END = "<!-- мтс-текущая-проекция:конец -->";

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
  readonly semanticBase: string;
  readonly observableSemanticDelta: boolean;
  readonly implementationLanguage: string;
  readonly singleLiveSemanticRuntime: boolean;
  readonly pythonRuntimePresent: boolean;
  readonly compatibilityRuntimeSelectable: boolean;
  readonly internalSigns: readonly string[];
  readonly deferredSigns: readonly string[];
  readonly metaOnlySigns: readonly string[];
  readonly rootBasis: Readonly<Record<string, string>>;
  readonly readMayMaterialize: boolean;
  readonly notFoundImpliesNonExistence: boolean;
  readonly stringCarrierUnit: string;
  readonly byteEnvelope: string;
  readonly bitsPerEnvelope: number;
  readonly bitOrder: string;
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

function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") fail(`${name} must be a boolean`);
  return value;
}

function finiteNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${name} must be a finite number`);
  return value;
}

function strings(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(`${name} must be an array of strings`);
  }
  return value as string[];
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

  const implementation = nested(contract, "implementation", currentContractPath);
  const foundation = nested(contract, "foundation", currentContractPath);
  const rootBasis = nested(contract, "rootBasisTarget", currentContractPath);
  const effects = nested(contract, "effects", currentContractPath);
  const carrier = nested(contract, "canonicalStringQuaternaryCarrier", currentContractPath);

  const rootEntries = Object.entries(rootBasis);
  if (rootEntries.length === 0 || rootEntries.some(([, value]) => typeof value !== "string")) {
    fail(`${currentContractPath}.rootBasisTarget must contain string equations`);
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
    semanticBase: string(contract.semanticBase, `${currentContractPath}.semanticBase`),
    observableSemanticDelta: boolean(contract.observableSemanticDelta, `${currentContractPath}.observableSemanticDelta`),
    implementationLanguage: string(implementation.language, `${currentContractPath}.implementation.language`),
    singleLiveSemanticRuntime: boolean(implementation.singleLiveSemanticRuntime, `${currentContractPath}.implementation.singleLiveSemanticRuntime`),
    pythonRuntimePresent: boolean(implementation.pythonRuntimePresent, `${currentContractPath}.implementation.pythonRuntimePresent`),
    compatibilityRuntimeSelectable: boolean(implementation.compatibilityRuntimeSelectable, `${currentContractPath}.implementation.compatibilityRuntimeSelectable`),
    internalSigns: strings(foundation.minimalInternalSigns, `${currentContractPath}.foundation.minimalInternalSigns`),
    deferredSigns: strings(foundation.deferredSigns, `${currentContractPath}.foundation.deferredSigns`),
    metaOnlySigns: strings(foundation.metaOnlySigns, `${currentContractPath}.foundation.metaOnlySigns`),
    rootBasis: Object.fromEntries(rootEntries) as Readonly<Record<string, string>>,
    readMayMaterialize: boolean(effects.readMayMaterialize, `${currentContractPath}.effects.readMayMaterialize`),
    notFoundImpliesNonExistence: boolean(effects.notFoundImpliesNonExistence, `${currentContractPath}.effects.notFoundImpliesNonExistence`),
    stringCarrierUnit: string(carrier.canonicalUnit, `${currentContractPath}.canonicalStringQuaternaryCarrier.canonicalUnit`),
    byteEnvelope: string(carrier.byteEnvelope, `${currentContractPath}.canonicalStringQuaternaryCarrier.byteEnvelope`),
    bitsPerEnvelope: finiteNumber(carrier.bitsPerEnvelope, `${currentContractPath}.canonicalStringQuaternaryCarrier.bitsPerEnvelope`),
    bitOrder: string(carrier.bitOrder, `${currentContractPath}.canonicalStringQuaternaryCarrier.bitOrder`),
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

const OWNER_LINE = /^<a id="mts-law-([A-Za-z][A-Za-z0-9]*)"><\/a>\s*<!--\s*нормативный владелец\s*-->$/;
const REFERENCE = /<!--\s*ссылка:mts-law-([A-Za-z][A-Za-z0-9]*)\s*-->/g;

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

    const owner = trimmed.match(OWNER_LINE);
    if (owner?.[1]) owners.push({ lawId: owner[1], path, line: index + 1 });

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
    if (OWNER_LINE.test(trimmed)) return false;
    if (/^<!--.*-->$/.test(trimmed)) continue;
    if (/^#{1,6}\s+/.test(trimmed)) continue;
    return true;
  }
  return false;
}

export function validateSemanticLawDocumentation(
  requiredLawIds: readonly string[],
  documents: Readonly<Record<string, string>>,
): SemanticLawDocumentationIssue[] {
  const issues: SemanticLawDocumentationIssue[] = [];
  const required = new Set(requiredLawIds);
  const configured = new Set(Object.keys(SEMANTIC_LAW_OWNER_BY_ID));

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
    const expectedPath = SEMANTIC_LAW_OWNER_BY_ID[owner.lawId];
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

  const paths = new Set<string>([
    ...Object.values(SEMANTIC_LAW_OWNER_BY_ID),
    ...((nested(policy, "paths", "repo-policy.json").canonical_docs as unknown[]) ?? [])
      .filter((value): value is string => typeof value === "string"),
  ]);
  const documents: Record<string, string> = {};
  for (const path of paths) {
    const fullPath = resolve(root, path);
    if (!existsSync(fullPath)) continue;
    documents[path] = readFileSync(fullPath, "utf8");
  }
  return validateSemanticLawDocumentation(requiredLawIds, documents);
}

export function renderCurrentProjection(value: CurrentProjection): string {
  return [
    PROJECTION_START,
    "> **Текущий принятый выпуск МТС: v0.13.** Этот блок строится из принятых указателей командой `npm --prefix ts run docs:sync`.",
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
  console.log("MTS Compiler: release-проекция, requirement-блоки и владельцы semantic laws синхронизированы.");
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) main();
