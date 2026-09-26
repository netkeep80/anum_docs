import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  listRepositoryMarkdownSurface,
  replaceOwnedMarkdownSection,
  type MarkdownDocumentMode,
} from "./markdown-section-adapter.js";

type JsonObject = Record<string, unknown>;

export const MTS_REQUIREMENT_REGISTRY_PATH = "requirements/mts-v0.13.json";

export interface MtsRequirementProjection {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly classificationPath: string;
  readonly order: number;
  readonly dependsOn: readonly string[];
  readonly statement: string;
  readonly statementDigest: string;
  readonly authorityDocument: string;
  readonly authorityPointer: string;
  readonly traceabilityPath: string;
  readonly positiveVectorCount: number;
  readonly negativeVectorCount: number;
  readonly executableGateCount: number;
  readonly docPath: string;
  readonly docAnchor: string;
}

export interface MtsSemanticIr {
  readonly schema: string;
  readonly contract: string;
  readonly contractPath: string;
  readonly requirements: readonly MtsRequirementProjection[];
  readonly documentModes: Readonly<Record<string, MarkdownDocumentMode>>;
}

function fail(message: string): never {
  throw new Error(`mts-compiler: ${message}`);
}

function object(value: unknown, name: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object`);
  return value as JsonObject;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${name} must be a non-empty string`);
  return value;
}

function number(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${name} must be a finite number`);
  return value;
}

function strings(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    fail(`${name} must be an array of non-empty strings`);
  }
  return value as string[];
}

function readJson(root: string, path: string): JsonObject {
  try {
    return object(JSON.parse(readFileSync(resolve(root, path), "utf8")), path);
  } catch (error) {
    fail(`cannot read JSON ${path}: ${(error as Error).message}`);
  }
}

function currentContractPath(root: string): string {
  const policy = readJson(root, "repo-policy.json");
  const packs = object(policy.packs, "repo-policy.json.packs");
  const pack = object(packs["contract-conformance"], "repo-policy.json.packs.contract-conformance");
  const current = object(pack.current, "repo-policy.json.packs.contract-conformance.current");
  const contract = object(current.contract, "repo-policy.json.packs.contract-conformance.current.contract");
  return string(contract.path, "current.contract.path");
}

function exactSet(name: string, left: readonly string[], right: readonly string[]): void {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  if (a.join("\n") !== b.join("\n")) {
    fail(`${name} differs: registry=[${a.join(", ")}] contract=[${b.join(", ")}]`);
  }
}

function validateDependencyGraph(requirements: readonly MtsRequirementProjection[]): void {
  const ids = new Set(requirements.map((item) => item.id));
  for (const item of requirements) {
    for (const dependency of item.dependsOn) {
      if (!ids.has(dependency)) fail(`${item.id} depends on unknown requirement ${dependency}`);
      if (dependency === item.id) fail(`${item.id} depends on itself`);
    }
  }

  const byId = new Map(requirements.map((item) => [item.id, item] as const));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) fail(`dependency cycle detected at ${id}`);
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };

  for (const id of ids) visit(id);
}

export function loadMtsSemanticIr(
  root: string,
  registryPath = MTS_REQUIREMENT_REGISTRY_PATH,
): MtsSemanticIr {
  const registry = readJson(root, registryPath);
  const schema = string(registry.schema, `${registryPath}.schema`);
  if (schema !== "mts-requirement-registry/v0.1") fail(`unsupported registry schema ${schema}`);

  const contractPath = currentContractPath(root);
  const contract = readJson(root, contractPath);
  const contractId = string(contract.schema, `${contractPath}.schema`);
  if (string(registry.contract, `${registryPath}.contract`) !== contractId) {
    fail(`${registryPath} does not target current contract ${contractId}`);
  }

  const source = object(registry.semanticSource, `${registryPath}.semanticSource`);
  if (string(source.path, `${registryPath}.semanticSource.path`) !== contractPath) {
    fail(`semantic source must be current contract ${contractPath}`);
  }
  if (string(source.pointer, `${registryPath}.semanticSource.pointer`) !== "/requiredSemanticLaws") {
    fail("semantic source pointer must be /requiredSemanticLaws");
  }

  const laws = object(contract.requiredSemanticLaws, `${contractPath}.requiredSemanticLaws`);
  const traceabilitySource = object(registry.traceabilitySource, `${registryPath}.traceabilitySource`);
  const traceabilityPath = string(traceabilitySource.path, `${registryPath}.traceabilitySource.path`);
  const traceability = readJson(root, traceabilityPath);
  if (string(traceability.contract, `${traceabilityPath}.contract`) !== contractPath) {
    fail(`${traceabilityPath} does not target current contract path ${contractPath}`);
  }
  if (string(traceability.conformance, `${traceabilityPath}.conformance`) !== string(contract.conformanceCorpus, `${contractPath}.conformanceCorpus`)) {
    fail(`${traceabilityPath} conformance does not match current contract`);
  }
  const invariants = object(traceability.invariants, `${traceabilityPath}.invariants`);
  const docs = object(contract.normativeDocumentation, `${contractPath}.normativeDocumentation`);
  const owners = object(docs.owners, `${contractPath}.normativeDocumentation.owners`);

  const documentSurface = object(registry.documentSurface, `${registryPath}.documentSurface`);
  const documentModes: Record<string, MarkdownDocumentMode> = {};
  for (const [path, rawMode] of Object.entries(documentSurface)) {
    const descriptor = object(rawMode, `${registryPath}.documentSurface.${path}`);
    const mode = string(descriptor.mode, `${registryPath}.documentSurface.${path}.mode`);
    if (mode !== "source" && mode !== "hybrid" && mode !== "generated") {
      fail(`${path}: unknown Markdown document mode ${mode}`);
    }
    if (mode === "generated") {
      fail(`${path}: whole-file GENERATED mode is forbidden in P1`);
    }
    documentModes[path] = mode;
  }
  exactSet("Markdown document surface", Object.keys(documentModes), listRepositoryMarkdownSurface(root));

  if (!Array.isArray(registry.requirements)) fail(`${registryPath}.requirements must be an array`);
  const rawRequirements = registry.requirements as unknown[];
  const seen = new Set<string>();
  const requirements: MtsRequirementProjection[] = rawRequirements.map((raw, index) => {
    const value = object(raw, `${registryPath}.requirements[${index}]`);
    const id = string(value.id, `requirements[${index}].id`);
    if (seen.has(id)) fail(`duplicate requirement id ${id}`);
    seen.add(id);

    const statement = string(laws[id], `${contractPath}.requiredSemanticLaws.${id}`);
    const statementDigest = createHash("sha256").update(statement, "utf8").digest("hex").slice(0, 16);
    const kind = string(value.kind, `requirements[${index}].kind`);
    const status = string(value.status, `requirements[${index}].status`);
    if (status !== "accepted") fail(`${id} pilot status must be accepted`);

    const classification = object(value.classification, `requirements[${index}].classification`);
    const classificationPath = string(classification.path, `requirements[${index}].classification.path`);
    if (!/^[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)+$/.test(classificationPath)) {
      fail(`${id} classification.path is not a hierarchical path`);
    }

    const authority = object(value.authority, `requirements[${index}].authority`);
    const authorityDocument = string(authority.document, `requirements[${index}].authority.document`);
    const authorityPointer = string(authority.pointer, `requirements[${index}].authority.pointer`);
    if (authorityDocument !== contractPath || authorityPointer !== `/requiredSemanticLaws/${id}`) {
      fail(`${id} authority must point to its accepted contract law`);
    }

    const invariant = object(invariants[id], `${traceabilityPath}.invariants.${id}`);
    if (string(invariant.contractPointer, `${traceabilityPath}.invariants.${id}.contractPointer`) !== `/requiredSemanticLaws/${id}`) {
      fail(`${id} traceability contract pointer is not its accepted law`);
    }
    const positive = object(invariant.positive, `${traceabilityPath}.invariants.${id}.positive`);
    const negative = object(invariant.negative, `${traceabilityPath}.invariants.${id}.negative`);
    const countVectors = (value: JsonObject, name: string): number => Object.entries(value).reduce((total, [key, candidate]) => {
      if (!Array.isArray(candidate) || candidate.some((entry) => typeof entry !== "string")) {
        fail(`${name}.${key} must be an array of strings`);
      }
      return total + candidate.length;
    }, 0);
    const positiveVectorCount = countVectors(positive, `${traceabilityPath}.invariants.${id}.positive`);
    const negativeVectorCount = countVectors(negative, `${traceabilityPath}.invariants.${id}.negative`);
    const executableGateCount = strings(
      invariant.requiredExecutableGates,
      `${traceabilityPath}.invariants.${id}.requiredExecutableGates`,
    ).length;

    const docProjection = object(value.docProjection, `requirements[${index}].docProjection`);
    const docPath = string(docProjection.path, `requirements[${index}].docProjection.path`);
    const docAnchor = string(docProjection.anchor, `requirements[${index}].docProjection.anchor`);
    const owner = object(owners[id], `${contractPath}.normativeDocumentation.owners.${id}`);
    if (string(owner.path, `owner.${id}.path`) !== docPath || string(owner.anchor, `owner.${id}.anchor`) !== docAnchor) {
      fail(`${id} doc projection differs from accepted normative owner`);
    }
    if (!existsSync(resolve(root, docPath))) fail(`${id} doc projection target does not exist: ${docPath}`);
    if (documentModes[docPath] !== "hybrid") {
      fail(`${id} doc projection target must be HYBRID, found ${documentModes[docPath] ?? "unclassified"}: ${docPath}`);
    }

    return Object.freeze({
      id,
      kind,
      status,
      classificationPath,
      order: number(value.order, `requirements[${index}].order`),
      dependsOn: Object.freeze([...strings(value.dependsOn, `requirements[${index}].dependsOn`)]),
      statement,
      statementDigest,
      authorityDocument,
      authorityPointer,
      traceabilityPath,
      positiveVectorCount,
      negativeVectorCount,
      executableGateCount,
      docPath,
      docAnchor,
    });
  });

  exactSet("requirement id set", requirements.map((item) => item.id), Object.keys(laws));
  exactSet("traceability invariant id set", Object.keys(invariants), Object.keys(laws));
  validateDependencyGraph(requirements);

  requirements.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  return Object.freeze({
    schema,
    contract: contractId,
    contractPath,
    requirements: Object.freeze(requirements),
    documentModes: Object.freeze(documentModes),
  });
}

function marker(id: string, side: "начало" | "конец"): string {
  return `<!-- мтс:требование:${id}:${side} -->`;
}

export function renderRequirementProjectionBody(item: MtsRequirementProjection): string {
  return `> **МТС \`${item.id}\`** · вид \`${item.kind}\` · класс \`${item.classificationPath}\` · источник \`${item.authorityDocument}#${item.authorityPointer}\` · отпечаток \`${item.statementDigest}\` · свидетельства +${item.positiveVectorCount}/-${item.negativeVectorCount} · проверок ${item.executableGateCount} · трассировка \`${item.traceabilityPath}\`.`;
}

export function renderRequirementProjection(item: MtsRequirementProjection): string {
  return [
    marker(item.id, "начало"),
    renderRequirementProjectionBody(item),
    marker(item.id, "конец"),
  ].join("\n");
}

export function upsertRequirementProjection(
  source: string,
  item: MtsRequirementProjection,
  mode: MarkdownDocumentMode = "hybrid",
): string {
  return replaceOwnedMarkdownSection({
    source,
    mode,
    anchorId: item.docAnchor,
    blockId: item.id,
    generatedContent: renderRequirementProjectionBody(item),
  });
}

export function compileRequirementDocuments(root: string, write: boolean): string[] {
  const ir = loadMtsSemanticIr(root);
  const grouped = new Map<string, MtsRequirementProjection[]>();
  for (const requirement of ir.requirements) {
    const items = grouped.get(requirement.docPath) ?? [];
    items.push(requirement);
    grouped.set(requirement.docPath, items);
  }

  const changed: string[] = [];
  for (const [path, items] of grouped) {
    const fullPath = resolve(root, path);
    const source = readFileSync(fullPath, "utf8");
    const mode = ir.documentModes[path];
    if (mode === undefined) fail(`${path}: Markdown mode is not classified`);
    const updated = items.reduce((text, item) => upsertRequirementProjection(text, item, mode), source);
    if (updated === source) continue;
    changed.push(path);
    if (write) writeFileSync(fullPath, updated, "utf8");
  }
  return changed.sort();
}
