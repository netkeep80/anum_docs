import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECTION_START = "<!-- mts-current-projection:start -->";
export const PROJECTION_END = "<!-- mts-current-projection:end -->";

/**
 * Только документы, которые сами объявляют текущее состояние МТС.
 * Специализированные specs не получают копию release manifest: это сохраняет
 * принцип #278 «main = current state без аддитивного дублирования».
 */
export const CANONICAL_DOCS = [
  "README.md",
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
  const topology = nested(policy, "contract_conformance", "repo-policy.json");
  const current = nested(topology, "current", "repo-policy.json.contract_conformance");
  const previous = nested(topology, "previous", "repo-policy.json.contract_conformance");

  const currentContractPath = string(nested(current, "contract", "current").path, "current.contract.path");
  const currentConformancePath = string(nested(current, "conformance", "current").path, "current.conformance.path");
  const previousContractPath = string(nested(previous, "contract", "previous").path, "previous.contract.path");
  const previousConformancePath = string(nested(previous, "conformance", "previous").path, "previous.conformance.path");

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

function yesNo(value: boolean): string {
  return value ? "да" : "нет";
}

export function renderCurrentProjection(value: CurrentProjection): string {
  const root = Object.entries(value.rootBasis).map(([name, equation]) => `${name}: ${equation}`).join("; ");
  return [
    PROJECTION_START,
    "> **Автоматическая проекция текущей машинной границы.** Этот блок строится из принятого контракта командой `npm --prefix ts run docs:sync`; содержательную теорию вне блока команда не меняет.",
    ">",
    `> - Текущий выпуск: \`${value.currentContract}\` + \`${value.currentConformance}\`; предыдущая неизменяемая пара: \`${value.previousContract}\` + \`${value.previousConformance}\`.`,
    `> - Семантическая база: \`${value.semanticBase}\`; наблюдаемое смысловое изменение: \`${yesNo(value.observableSemanticDelta)}\`.`,
    `> - Реализация: \`${value.implementationLanguage}\`; единственная действующая смысловая среда: \`${yesNo(value.singleLiveSemanticRuntime)}\`; Python присутствует: \`${yesNo(value.pythonRuntimePresent)}\`; режим совместимости выбираем: \`${yesNo(value.compatibilityRuntimeSelectable)}\`.`,
    `> - Внутренние знаки F1: \`${value.internalSigns.join(" ")}\`; отложены: \`${value.deferredSigns.join(" ")}\`; только метаязык: \`${value.metaOnlySigns.join(" ")}\`.`,
    `> - Корневой базис: \`${root}\`.`,
    `> - Чтение может материализовать: \`${yesNo(value.readMayMaterialize)}\`; отсутствие найденной записи доказывает несуществование: \`${yesNo(value.notFoundImpliesNonExistence)}\`.`,
    `> - Строковый носитель: единица \`${value.stringCarrierUnit}\`, конверт \`${value.byteEnvelope}\`, бит на конверт \`${value.bitsPerEnvelope}\`, порядок \`${value.bitOrder}\`.`,
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
  return CANONICAL_DOCS.filter((path) => {
    const source = readFileSync(resolve(root, path), "utf8");
    return !checkProjectionText(source, projection);
  });
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
  return changed;
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
  console.log("Автоматическая проекция документации соответствует текущему контракту.");
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) main();
