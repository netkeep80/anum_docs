import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isAlias, isNode, isPair, isScalar, parseDocument, visit } from "yaml";
import {
  listRepositoryMarkdownSurface,
  replaceOwnedMarkdownSection,
  type MarkdownDocumentMode,
} from "./markdown-section-adapter.js";
import { THEOREM_CATALOG_PATH } from "./theorem-catalog-markdown.js";

type JsonObject = Record<string, unknown>;

export const MTS_REQUIREMENT_REGISTRY_PATH = "requirements/mts-v0.15.json";

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

export interface RepositoryRequirementProjection {
  readonly id: string;
  readonly kind: "readme-link" | "readme-contributors";
  readonly status: "required";
  readonly docPath: string;
  readonly docAnchor: string;
  readonly generatedContent: string;
}

export interface MtsSemanticIr {
  readonly schema: string;
  readonly contract: string;
  readonly contractPath: string;
  readonly traceabilityPath: string;
  readonly conformancePath: string;
  readonly requirements: readonly MtsRequirementProjection[];
  readonly repositoryRequirements: readonly RepositoryRequirementProjection[];
  readonly documentModes: Readonly<Record<string, MarkdownDocumentMode>>;
  readonly projectionState: string;
}

export interface CurrentProjectDocumentConfigurationCandidate {
  readonly documentModes: Readonly<Record<string, unknown>>;
  readonly repositoryRequirements: readonly unknown[];
}

export interface CurrentProjectDocumentConfigurationProjection {
  readonly documentModes: Readonly<Record<string, MarkdownDocumentMode>>;
  readonly repositoryRequirements: readonly RepositoryRequirementProjection[];
}

interface CurrentReadmeLinkFact {
  readonly id: "README-OBSERVATORY";
  readonly kind: "readme-link";
  readonly status: "required";
  readonly projection: {
    readonly path: string;
    readonly anchor: string;
  };
  readonly label: string;
  readonly url: string;
  readonly description: string;
}

interface CurrentReadmeContributorsFact {
  readonly id: "README-AUTHORS";
  readonly kind: "readme-contributors";
  readonly status: "required";
  readonly projection: {
    readonly path: string;
    readonly anchor: string;
  };
  readonly contributors: readonly {
    readonly name: string;
    readonly url: string;
  }[];
}

interface CurrentProjectDocumentConfiguration {
  readonly documentModes: Readonly<Record<string, MarkdownDocumentMode>>;
  readonly repositoryRequirements: readonly (CurrentReadmeLinkFact | CurrentReadmeContributorsFact)[];
}

const CURRENT_PROJECT_DOCUMENT_CONFIGURATION = Object.freeze({
  documentModes: Object.freeze({
    "README.md": "hybrid",
    "PORTFOLIO.md": "source",
    "docs/CONTRIBUTING.md": "source",
    "docs/research/Исходные мысли МТС.md": "source",
    "docs/research/Новое осмысление МТС.md": "source",
    "docs/specs/Апамять и управление сетью связей.md": "hybrid",
    "docs/specs/Ачисла и сериализация.md": "hybrid",
    "docs/specs/Пучки связей.md": "source",
    "docs/specs/Формальная нотация МТС.md": "hybrid",
    "docs/theory/Основания МТС.md": "hybrid",
    "docs/theory/Система аксиом МТС.md": "hybrid",
    "docs/Словарь терминов МТС.md": "hybrid",
  }),
  repositoryRequirements: Object.freeze([
    Object.freeze({
      id: "README-OBSERVATORY",
      kind: "readme-link",
      status: "required",
      projection: Object.freeze({
        path: "README.md",
        anchor: "mts-readme-contract-observatory",
      }),
      label: "Открыть Обозреватель контрактов",
      url: "https://netkeep80.github.io/anum_docs/",
      description: "Производная визуализация принятых машинных свидетельств только для чтения; она не является смысловым авторитетом.",
    }),
    Object.freeze({
      id: "README-AUTHORS",
      kind: "readme-contributors",
      status: "required",
      projection: Object.freeze({
        path: "README.md",
        anchor: "mts-readme-authors",
      }),
      contributors: Object.freeze([
        Object.freeze({ name: "Вертушкин Роман Павлович", url: "https://github.com/netkeep80" }),
        Object.freeze({ name: "Дьяченко Константин Константинович", url: "https://github.com/konard" }),
        Object.freeze({ name: "Шакиров Тимур Эдуардович", url: "https://github.com/TimaxLacs" }),
        Object.freeze({ name: "Бурдуков Александр Николаевич", url: "https://github.com/InAiwetrustAGI" }),
        Object.freeze({ name: "Глазунов Иван Сергеевич", url: "https://github.com/ivansglazunov" }),
      ]),
    }),
  ]),
} satisfies CurrentProjectDocumentConfiguration);

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

function loadAcceptedV015Authority(
  root: string,
  registryPath: string,
  registry: JsonObject,
): {
  readonly contractPath: string;
  readonly traceabilityPath: string;
  readonly conformancePath: string;
  readonly traceability: JsonObject;
} {
  const current = object(registry.currentAccepted, registryPath + ".currentAccepted");
  if (string(current.mtsVersion, registryPath + ".currentAccepted.mtsVersion") !== "v0.15") {
    fail("v0.15 registry current accepted version mismatch");
  }
  if (string(current.requirements, registryPath + ".currentAccepted.requirements") !== registryPath) {
    fail("v0.15 registry current accepted requirements path mismatch");
  }

  const contractPath = string(registry.contract, registryPath + ".contract");
  if (string(current.contract, registryPath + ".currentAccepted.contract") !== contractPath) {
    fail("v0.15 registry current accepted contract path mismatch");
  }

  const traceabilityPath = string(registry.traceability, registryPath + ".traceability");
  if (string(current.traceability, registryPath + ".currentAccepted.traceability") !== traceabilityPath) {
    fail("v0.15 registry current accepted traceability path mismatch");
  }
  const conformancePath = string(current.conformance, registryPath + ".currentAccepted.conformance");

  const traceability = readJson(root, traceabilityPath);
  if (
    string(traceability.schema, traceabilityPath + ".schema") !== "mts-traceability/v0.3" ||
    traceability.status !== "accepted" ||
    traceability.accepted !== true ||
    traceability.releaseState !== "ACCEPTED"
  ) {
    fail("v0.15 traceability must be accepted");
  }
  if (string(traceability.contract, traceabilityPath + ".contract") !== contractPath) {
    fail("v0.15 traceability contract path mismatch");
  }
  if (string(traceability.conformance, traceabilityPath + ".conformance") !== conformancePath) {
    fail("v0.15 traceability conformance path mismatch");
  }

  const traceCurrent = object(traceability.currentAccepted, traceabilityPath + ".currentAccepted");
  if (string(traceCurrent.mtsVersion, traceabilityPath + ".currentAccepted.mtsVersion") !== "v0.15") {
    fail("v0.15 traceability current accepted version mismatch");
  }
  if (string(traceCurrent.requirements, traceabilityPath + ".currentAccepted.requirements") !== registryPath) {
    fail("v0.15 traceability current accepted requirements path mismatch");
  }
  if (string(traceCurrent.traceability, traceabilityPath + ".currentAccepted.traceability") !== traceabilityPath) {
    fail("v0.15 traceability current accepted traceability path mismatch");
  }
  if (string(traceCurrent.contract, traceabilityPath + ".currentAccepted.contract") !== contractPath) {
    fail("v0.15 traceability current accepted contract path mismatch");
  }
  if (string(traceCurrent.conformance, traceabilityPath + ".currentAccepted.conformance") !== conformancePath) {
    fail("v0.15 traceability current accepted conformance path mismatch");
  }

  const acceptancePath = string(traceability.acceptance, traceabilityPath + ".acceptance");
  const acceptance = readJson(root, acceptancePath);
  if (string(acceptance.decision, acceptancePath + ".decision") !== "ACCEPT_MTS_V0_15") {
    fail("v0.15 acceptance decision mismatch");
  }
  const acceptanceCurrent = object(acceptance.current, acceptancePath + ".current");
  if (string(acceptanceCurrent.contract, acceptancePath + ".current.contract") !== contractPath) {
    fail("v0.15 acceptance current contract path mismatch");
  }
  if (string(acceptanceCurrent.conformance, acceptancePath + ".current.conformance") !== conformancePath) {
    fail("v0.15 acceptance current conformance path mismatch");
  }

  return Object.freeze({ contractPath, traceabilityPath, conformancePath, traceability });
}

function exactSet(name: string, left: readonly string[], right: readonly string[]): void {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  if (a.join("\n") !== b.join("\n")) {
    fail(`${name} differs: registry=[${a.join(", ")}] contract=[${b.join(", ")}]`);
  }
}

function validateDocumentModes(
  root: string,
  candidate: Readonly<Record<string, unknown>>,
  sourceLabel: string,
): Readonly<Record<string, MarkdownDocumentMode>> {
  const documentModes: Record<string, MarkdownDocumentMode> = {};
  for (const [path, rawMode] of Object.entries(candidate)) {
    const mode = string(rawMode, `${sourceLabel}.${path}`);
    if (mode !== "source" && mode !== "hybrid" && mode !== "generated") {
      fail(`${path}: unknown Markdown document mode ${mode}`);
    }
    if (mode === "generated") {
      fail(`${path}: whole-file GENERATED mode is forbidden in P1`);
    }
    documentModes[path] = mode;
  }

  const semanticMarkdownSurface = listRepositoryMarkdownSurface(root).filter(
    (path) => path !== THEOREM_CATALOG_PATH,
  );
  exactSet("Markdown document surface", Object.keys(documentModes), semanticMarkdownSurface);
  return Object.freeze(documentModes);
}

export function validateCurrentProjectDocumentConfiguration(
  root: string,
  candidate: CurrentProjectDocumentConfigurationCandidate,
): CurrentProjectDocumentConfigurationProjection {
  const documentModes = validateDocumentModes(
    root,
    candidate.documentModes,
    "current project/document configuration.documentModes",
  );
  const repositoryRequirements = loadRepositoryRequirementValues(
    root,
    candidate.repositoryRequirements,
    "current project/document configuration.repositoryRequirements",
    documentModes,
  );
  return Object.freeze({ documentModes, repositoryRequirements });
}

export function loadCurrentProjectDocumentConfiguration(
  root: string,
): CurrentProjectDocumentConfigurationProjection {
  return validateCurrentProjectDocumentConfiguration(root, CURRENT_PROJECT_DOCUMENT_CONFIGURATION);
}

const REQUIRED_REPOSITORY_REQUIREMENT_IDS = Object.freeze([
  "README-AUTHORS",
  "README-OBSERVATORY",
] as const);

function loadRepositoryRequirementValues(
  root: string,
  rawRequirements: readonly unknown[],
  sourceLabel: string,
  documentModes: Readonly<Record<string, MarkdownDocumentMode>>,
): readonly RepositoryRequirementProjection[] {
  const seen = new Set<string>();
  const requirements = rawRequirements.map((raw, index) => {
    const value = object(raw, `${sourceLabel}[${index}]`);
    const id = string(value.id, `${sourceLabel}[${index}].id`);
    if (seen.has(id)) fail(`duplicate repository requirement id ${id}`);
    seen.add(id);

    const status = string(value.status, `${sourceLabel}[${index}].status`);
    if (status !== "required") fail(`${id} repository requirement status must be required`);

    const projection = object(value.projection, `${sourceLabel}[${index}].projection`);
    const docPath = string(projection.path, `${sourceLabel}[${index}].projection.path`);
    const docAnchor = string(projection.anchor, `${sourceLabel}[${index}].projection.anchor`);
    if (!existsSync(resolve(root, docPath))) fail(`${id} projection target does not exist: ${docPath}`);
    if (documentModes[docPath] !== "hybrid") {
      fail(`${id} projection target must be HYBRID, found ${documentModes[docPath] ?? "unclassified"}: ${docPath}`);
    }

    const kind = string(value.kind, `${sourceLabel}[${index}].kind`);
    let generatedContent: string;
    if (kind === "readme-link") {
      const label = string(value.label, `${sourceLabel}[${index}].label`);
      const url = string(value.url, `${sourceLabel}[${index}].url`);
      const description = string(value.description, `${sourceLabel}[${index}].description`);
      if (!/^https:\/\//.test(url)) fail(`${id}.url must be an absolute https URL`);
      generatedContent = `[${label}](${url}) — ${description}`;
    } else if (kind === "readme-contributors") {
      if (!Array.isArray(value.contributors) || value.contributors.length === 0) {
        fail(`${id}.contributors must be a non-empty array`);
      }
      const contributorKeys = new Set<string>();
      generatedContent = (value.contributors as unknown[]).map((rawContributor, contributorIndex) => {
        const contributor = object(rawContributor, `${sourceLabel}[${index}].contributors[${contributorIndex}]`);
        const name = string(contributor.name, `${sourceLabel}[${index}].contributors[${contributorIndex}].name`);
        const url = string(contributor.url, `${sourceLabel}[${index}].contributors[${contributorIndex}].url`);
        if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/?$/.test(url)) {
          fail(`${id}.contributors[${contributorIndex}].url must be a GitHub profile URL`);
        }
        const key = `${name}\n${url}`;
        if (contributorKeys.has(key)) fail(`${id} has duplicate contributor ${name}`);
        contributorKeys.add(key);
        return `- [${name}](${url})`;
      }).join("\n");
    } else {
      fail(`${id} has unsupported repository requirement kind ${kind}`);
    }

    return Object.freeze({
      id,
      kind: kind as RepositoryRequirementProjection["kind"],
      status: "required" as const,
      docPath,
      docAnchor,
      generatedContent,
    });
  });

  exactSet(
    "repository requirement id set",
    requirements.map((item) => item.id),
    REQUIRED_REPOSITORY_REQUIREMENT_IDS,
  );
  return Object.freeze(requirements.sort((left, right) => left.id.localeCompare(right.id)));
}

function loadRepositoryRequirements(
  root: string,
  registry: JsonObject,
  registryPath: string,
  documentModes: Readonly<Record<string, MarkdownDocumentMode>>,
): readonly RepositoryRequirementProjection[] {
  if (!Array.isArray(registry.repositoryRequirements)) {
    fail(`${registryPath}.repositoryRequirements must be an array`);
  }
  return loadRepositoryRequirementValues(
    root,
    registry.repositoryRequirements as unknown[],
    `${registryPath}.repositoryRequirements`,
    documentModes,
  );
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


const NATIVE_V015_REQUIREMENT_DIRECTORY = "requirements/mts-v0.15";
const NATIVE_V015_REQUIREMENT_COUNT = 48;
const NATIVE_V015_RELATION_COUNT = 189;
const NATIVE_V015_DEPENDS_ON_COUNT = 33;
const NATIVE_V015_RELATION_PREDICATES = new Set([
  "verified_by",
  "depends_on",
  "implemented_by",
  "documents",
  "requires",
] as const);

interface NativeV015RequirementAuthority {
  readonly id: string;
  readonly statement: string;
  readonly sourcePath: string;
  readonly dependsOn: readonly string[];
  readonly verifiedBy: readonly string[];
  readonly relationCount: number;
}

function fields(
  value: JsonObject,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`${label} is missing required field ${key}`);
  }
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unexpected.length > 0) fail(`${label} has unexpected fields: ${unexpected.join(", ")}`);
}

function parseStrictNativeYaml(text: string, path: string): JsonObject {
  const document = parseDocument(text, {
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
    merge: false,
    schema: "core",
  });
  const diagnostics = [...document.errors, ...document.warnings];
  if (diagnostics.length > 0) {
    fail(`${path} native YAML parse error: ${diagnostics.map((item) => item.message).join("; ")}`);
  }

  const forbidden: string[] = [];
  visit(document, (_key, node) => {
    if (isAlias(node)) forbidden.push("aliases are not allowed");
    if (isPair(node) && isScalar(node.key) && node.key.value === "<<") {
      forbidden.push("merge keys are not allowed");
    }
    if (isNode(node) && typeof node.tag === "string" && node.tag.length > 0) {
      forbidden.push(`explicit tag ${node.tag} is not allowed`);
    }
  });
  if (forbidden.length > 0) {
    fail(`${path} native YAML is not canonical: ${[...new Set(forbidden)].sort().join("; ")}`);
  }

  try {
    return object(document.toJS({ maxAliasCount: 0 }) as unknown, path);
  } catch (error) {
    fail(`${path} native YAML alias/shape rejection: ${(error as Error).message}`);
  }
}

function nativeRequirementId(value: unknown, label: string): string {
  const id = string(value, label);
  if (!/^V15-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(id)) fail(`${label} is not a canonical v0.15 Requirement ID`);
  return id;
}

function nativeArtifactPath(value: unknown, label: string): string {
  const path = string(value, label);
  if (
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    fail(`${label} is not a canonical repository path`);
  }
  return path;
}

function discoverNativeV015RequirementPaths(root: string): readonly string[] {
  const directory = resolve(root, NATIVE_V015_REQUIREMENT_DIRECTORY);
  const entries = readdirSync(directory, { withFileTypes: true });

  const unexpectedNative = entries
    .filter((entry) => entry.isFile() && /\.rg\.(?:ya?ml|json)$/i.test(entry.name) && !entry.name.endsWith(".rg.yaml"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));
  if (unexpectedNative.length > 0) {
    fail(`unexpected native v0.15 Requirement source format: ${unexpectedNative.join(", ")}`);
  }

  const paths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".rg.yaml"))
    .map((entry) => `${NATIVE_V015_REQUIREMENT_DIRECTORY}/${entry.name}`)
    .sort((left, right) => left.localeCompare(right, "en"));

  if (paths.length !== NATIVE_V015_REQUIREMENT_COUNT) {
    fail(`native v0.15 Requirement source count ${paths.length} differs from accepted ${NATIVE_V015_REQUIREMENT_COUNT}`);
  }
  return Object.freeze(paths);
}

function loadNativeV015RequirementAuthority(root: string): readonly NativeV015RequirementAuthority[] {
  const seenIds = new Set<string>();
  const requirements = discoverNativeV015RequirementPaths(root).map((sourcePath) => {
    const raw = readFileSync(resolve(root, sourcePath), "utf8");
    const value = parseStrictNativeYaml(raw, sourcePath);
    fields(value, ["format", "id", "normative", "lifecycle", "relations"], ["constraints"], sourcePath);

    if (string(value.format, `${sourcePath}.format`) !== "repo-guard/requirement-v1") {
      fail(`${sourcePath}.format must be repo-guard/requirement-v1`);
    }
    const id = nativeRequirementId(value.id, `${sourcePath}.id`);
    if (seenIds.has(id)) fail(`duplicate native Requirement ID ${id}`);
    seenIds.add(id);

    const statement = string(value.normative, `${sourcePath}.normative`);
    const lifecycle = object(value.lifecycle, `${sourcePath}.lifecycle`);
    fields(lifecycle, ["accepted", "current"], [], `${sourcePath}.lifecycle`);
    if (lifecycle.accepted !== true || lifecycle.current !== true) {
      fail(`${id} native lifecycle must be accepted=true,current=true`);
    }

    if (value.constraints !== undefined) {
      if (!Array.isArray(value.constraints)) fail(`${id}.constraints must be an array`);
      if (value.constraints.length > 0) {
        fail(`${id} native constraints are outside the G1-S1 MtsSemanticIr contract and must be handled explicitly`);
      }
    }

    if (!Array.isArray(value.relations) || value.relations.length === 0) {
      fail(`${id}.relations must be a non-empty array`);
    }

    const dependsOn = new Set<string>();
    const verifiedBy = new Set<string>();
    const relationKeys = new Set<string>();
    let relationCount = 0;

    for (const [index, rawRelation] of (value.relations as unknown[]).entries()) {
      const relation = object(rawRelation, `${id}.relations[${index}]`);
      fields(relation, ["predicates", "target"], [], `${id}.relations[${index}]`);
      const predicates = [...strings(relation.predicates, `${id}.relations[${index}].predicates`)];
      if (predicates.length === 0 || new Set(predicates).size !== predicates.length) {
        fail(`${id}.relations[${index}].predicates must be non-empty and unique`);
      }
      for (const predicate of predicates) {
        if (!NATIVE_V015_RELATION_PREDICATES.has(predicate as "verified_by" | "depends_on" | "implemented_by" | "documents" | "requires")) {
          fail(`${id}.relations[${index}] has unsupported native predicate ${predicate}`);
        }
      }

      const target = object(relation.target, `${id}.relations[${index}].target`);
      const kind = string(target.kind, `${id}.relations[${index}].target.kind`);
      let targetIdentity: string;
      if (kind === "requirement") {
        fields(target, ["kind", "id"], [], `${id}.relations[${index}].target`);
        targetIdentity = nativeRequirementId(target.id, `${id}.relations[${index}].target.id`);
      } else if (kind === "artifact") {
        fields(target, ["kind", "path"], [], `${id}.relations[${index}].target`);
        targetIdentity = nativeArtifactPath(target.path, `${id}.relations[${index}].target.path`);
      } else {
        fail(`${id}.relations[${index}].target.kind must be requirement or artifact`);
      }

      for (const predicate of predicates) {
        if (predicate === "depends_on" && kind !== "requirement") {
          fail(`${id}.relations[${index}] depends_on must target a Requirement`);
        }
        if (predicate !== "depends_on" && kind !== "artifact") {
          fail(`${id}.relations[${index}] ${predicate} must target an artifact in the accepted v0.15 graph`);
        }
        const key = `${predicate}\0${kind}\0${targetIdentity}`;
        if (relationKeys.has(key)) fail(`${id} has duplicate native relation ${predicate} -> ${targetIdentity}`);
        relationKeys.add(key);
        relationCount += 1;
        if (predicate === "depends_on") dependsOn.add(targetIdentity);
        if (predicate === "verified_by") verifiedBy.add(targetIdentity);
      }
    }

    return Object.freeze({
      id,
      statement,
      sourcePath,
      dependsOn: Object.freeze([...dependsOn].sort((left, right) => left.localeCompare(right, "en"))),
      verifiedBy: Object.freeze([...verifiedBy].sort((left, right) => left.localeCompare(right, "en"))),
      relationCount,
    });
  });

  const relationCount = requirements.reduce((sum, item) => sum + item.relationCount, 0);
  const dependsOnCount = requirements.reduce((sum, item) => sum + item.dependsOn.length, 0);
  if (relationCount !== NATIVE_V015_RELATION_COUNT) {
    fail(`native v0.15 relation count ${relationCount} differs from accepted ${NATIVE_V015_RELATION_COUNT}`);
  }
  if (dependsOnCount !== NATIVE_V015_DEPENDS_ON_COUNT) {
    fail(`native v0.15 depends_on count ${dependsOnCount} differs from accepted ${NATIVE_V015_DEPENDS_ON_COUNT}`);
  }
  return Object.freeze(requirements);
}

function loadAcceptedV015SemanticIr(
  root: string,
  registryPath: string,
  registry: JsonObject,
): MtsSemanticIr {
  if (registry.status !== "accepted" || registry.accepted !== true) fail("v0.15 registry must be accepted after S22");
  const { contractPath, traceabilityPath, conformancePath, traceability } =
    loadAcceptedV015Authority(root, registryPath, registry);
  const contract = readJson(root, contractPath);
  const contractId = string(contract.schema, contractPath + ".schema");
  if (contractId !== "mts-contract/v0.15") fail("accepted v0.15 registry requires current v0.15 contract");
  if (string(contract.conformanceCorpus, contractPath + ".conformanceCorpus") !== conformancePath) {
    fail("v0.15 contract conformanceCorpus differs from accepted conformance path");
  }
  if (string(contract.traceabilityManifest, contractPath + ".traceabilityManifest") !== traceabilityPath) {
    fail("v0.15 contract traceabilityManifest differs from accepted traceability path");
  }

  // G3-S1 authority boundary:
  // native .rg supplies Requirement identity, normative statement, lifecycle,
  // depends_on and verified_by. Legacy v0.15 JSON remains a transition/release/
  // presentation/evidence shadow. Its requiredSemanticLaws keys still provide
  // an identity-integrity cross-check, but their text cannot select, override,
  // veto, repair or fall back for the current native normative statement.
  const nativeRequirements = loadNativeV015RequirementAuthority(root);
  const legacyLawInventory = object(contract.requiredSemanticLaws, contractPath + ".requiredSemanticLaws");
  const traces = object(traceability.requirements, traceabilityPath + ".requirements");
  if (!Array.isArray(registry.requirements)) fail(registryPath + ".requirements must be an array");

  const legacyRequirements = (registry.requirements as unknown[]).map((raw, index) => {
    const value = object(raw, `${registryPath}.requirements[${index}]`);
    return Object.freeze({
      id: string(value.id, `${registryPath}.requirements[${index}].id`),
      value,
      order: index + 1,
    });
  });
  const legacyById = new Map<string, (typeof legacyRequirements)[number]>();
  for (const item of legacyRequirements) {
    if (legacyById.has(item.id)) fail(`duplicate legacy v0.15 requirement id ${item.id}`);
    legacyById.set(item.id, item);
  }

  exactSet("native v0.15 requirement id set", nativeRequirements.map((item) => item.id), Object.keys(legacyLawInventory));
  exactSet("legacy v0.15 requirement shadow id set", legacyRequirements.map((item) => item.id), nativeRequirements.map((item) => item.id));

  const requirements = nativeRequirements.map((native) => {
    const legacy = legacyById.get(native.id);
    if (legacy === undefined) fail(`${native.id} legacy presentation/evidence shadow is missing`);
    const value = legacy.value;
    const traced = object(traces[native.id], native.id + " traceability");
    const tracedPositiveVectors = strings(
      traced.positiveVectors,
      native.id + " traceability positiveVectors",
    );
    const tracedNegativeVectors = strings(
      traced.negativeVectors,
      native.id + " traceability negativeVectors",
    );

    // This is legacy traceability metadata integrity only. It does not choose
    // the current Requirement lifecycle/status; native lifecycle already did.
    if (string(traced.state, native.id + " trace state") !== string(value.state, native.id + " state")) {
      fail(native.id + " legacy registry/trace state mismatch");
    }

    const kind = string(value.group, native.id + ".group");
    return Object.freeze({
      id: native.id,
      kind,
      status: "accepted",
      classificationPath: "v015/" + kind.toLowerCase().replace(/_/g, "-"),
      order: legacy.order,
      dependsOn: native.dependsOn,
      statement: native.statement,
      statementDigest: createHash("sha256").update(native.statement, "utf8").digest("hex").slice(0, 16),
      authorityDocument: native.sourcePath,
      authorityPointer: "/normative",
      traceabilityPath,
      positiveVectorCount: tracedPositiveVectors.length,
      negativeVectorCount: tracedNegativeVectors.length,
      executableGateCount: native.verifiedBy.length,
      docPath: "docs/specs/Формальная нотация МТС.md",
      docAnchor: "mts-v015-" + native.id.toLowerCase(),
    });
  }).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id, "en"));

  validateDependencyGraph(requirements);

  const { documentModes, repositoryRequirements } = loadCurrentProjectDocumentConfiguration(root);
  return Object.freeze({
    schema: string(registry.schema, registryPath + ".schema"),
    contract: contractId,
    contractPath,
    traceabilityPath,
    conformancePath,
    requirements: Object.freeze(requirements),
    repositoryRequirements,
    documentModes,
    projectionState: "MATERIALIZED",
  });
}

export interface HistoricalRequirementLawProjection {
  readonly projectionState: string;
  readonly requirements: readonly MtsRequirementProjection[];
}

function loadLegacyMtsSemanticIr(
  root: string,
  registryPath: string,
  registry: JsonObject,
  includeProjectConfiguration: boolean,
): MtsSemanticIr {
  const schema = string(registry.schema, `${registryPath}.schema`);
  if (schema !== "mts-requirement-registry/v0.1" && schema !== "mts-requirement-registry/v0.2") {
    fail(`unsupported registry schema ${schema}`);
  }

  const source = object(registry.semanticSource, `${registryPath}.semanticSource`);
  const contractPath = string(source.path, `${registryPath}.semanticSource.path`);
  const contract = readJson(root, contractPath);
  const contractId = string(contract.schema, `${contractPath}.schema`);
  if (string(registry.contract, `${registryPath}.contract`) !== contractId) {
    fail(`${registryPath} does not target contract ${contractId}`);
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
  const conformancePath = string(contract.conformanceCorpus, `${contractPath}.conformanceCorpus`);
  if (string(traceability.conformance, `${traceabilityPath}.conformance`) !== conformancePath) {
    fail(`${traceabilityPath} conformance does not match current contract`);
  }
  const invariants = object(traceability.invariants, `${traceabilityPath}.invariants`);
  const legacyOwners = schema === "mts-requirement-registry/v0.1"
    ? object(
        object(contract.normativeDocumentation, `${contractPath}.normativeDocumentation`).owners,
        `${contractPath}.normativeDocumentation.owners`,
      )
    : null;

  const projectionState = typeof registry.projectionState === "string"
    ? registry.projectionState
    : "MATERIALIZED";
  let documentModes: Readonly<Record<string, MarkdownDocumentMode>> = Object.freeze({});
  let repositoryRequirements: readonly RepositoryRequirementProjection[] = Object.freeze([]);
  if (includeProjectConfiguration) {
    const documentSurface = object(registry.documentSurface, `${registryPath}.documentSurface`);
    const rawDocumentModes: Record<string, unknown> = {};
    for (const [path, rawMode] of Object.entries(documentSurface)) {
      const descriptor = object(rawMode, `${registryPath}.documentSurface.${path}`);
      rawDocumentModes[path] = descriptor.mode;
    }
    documentModes = validateDocumentModes(
      root,
      rawDocumentModes,
      `${registryPath}.documentSurface`,
    );

    repositoryRequirements = loadRepositoryRequirements(root, registry, registryPath, documentModes);
  }

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

    if (schema === "mts-requirement-registry/v0.1") {
      const owner = object(legacyOwners?.[id], `${contractPath}.normativeDocumentation.owners.${id}`);
      if (string(owner.path, `owner.${id}.path`) !== docPath || string(owner.anchor, `owner.${id}.anchor`) !== docAnchor) {
        fail(`${id} doc projection differs from accepted normative owner`);
      }
    } else {
      const owner = object(invariant.documentationOwner, `${traceabilityPath}.invariants.${id}.documentationOwner`);
      if (string(owner.registry, `owner.${id}.registry`) !== registryPath) {
        fail(`${id} traceability documentation owner does not point to current registry`);
      }
      if (string(owner.path, `owner.${id}.path`) !== docPath || string(owner.anchor, `owner.${id}.anchor`) !== docAnchor) {
        fail(`${id} doc projection differs from traceability documentation owner`);
      }
    }
    if (!existsSync(resolve(root, docPath))) fail(`${id} doc projection target does not exist: ${docPath}`);
    if (includeProjectConfiguration && documentModes[docPath] !== "hybrid") {
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
    traceabilityPath,
    conformancePath,
    requirements: Object.freeze(requirements),
    repositoryRequirements,
    documentModes: Object.freeze(documentModes),
    projectionState,
  });
}

export function loadHistoricalRequirementLawProjection(
  root: string,
  registryPath = "requirements/mts-v0.14.json",
): HistoricalRequirementLawProjection {
  const registry = readJson(root, registryPath);
  const historical = loadLegacyMtsSemanticIr(root, registryPath, registry, false);
  return Object.freeze({
    projectionState: historical.projectionState,
    requirements: historical.requirements,
  });
}

export function loadMtsSemanticIr(
  root: string,
  registryPath = MTS_REQUIREMENT_REGISTRY_PATH,
): MtsSemanticIr {
  const registry = readJson(root, registryPath);
  const schema = string(registry.schema, `${registryPath}.schema`);
  if (schema === "mts-requirement-registry/v0.3") {
    return loadAcceptedV015SemanticIr(root, registryPath, registry);
  }
  return loadLegacyMtsSemanticIr(root, registryPath, registry, true);
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
  const currentIr = loadMtsSemanticIr(root);
  // Compiler-owned V14 law blocks are immutable inherited provenance.
  // Their historical Requirement bodies remain explicit replay input, while
  // current document mutation policy and README project facts come only from
  // the current project/document configuration.
  const historicalOwnerIr = currentIr.schema === "mts-requirement-registry/v0.3"
    ? loadHistoricalRequirementLawProjection(root, "requirements/mts-v0.14.json")
    : Object.freeze({
        projectionState: currentIr.projectionState,
        requirements: currentIr.requirements,
      });
  if (historicalOwnerIr.projectionState === "ACCEPTED_OWNER_PROJECTION_PROSE_RECONSTRUCTION_PENDING_1585") {
    return [];
  }
  const grouped = new Map<string, MtsRequirementProjection[]>();
  for (const requirement of historicalOwnerIr.requirements) {
    const items = grouped.get(requirement.docPath) ?? [];
    items.push(requirement);
    grouped.set(requirement.docPath, items);
  }

  const changed = new Set<string>();
  for (const [path, items] of grouped) {
    const fullPath = resolve(root, path);
    const source = readFileSync(fullPath, "utf8");
    const mode = currentIr.documentModes[path];
    if (mode === undefined) fail(`${path}: Markdown mode is not classified`);
    const updated = items.reduce((text, item) => upsertRequirementProjection(text, item, mode), source);
    if (updated === source) continue;
    changed.add(path);
    if (write) writeFileSync(fullPath, updated, "utf8");
  }

  const repositoryGrouped = new Map<string, RepositoryRequirementProjection[]>();
  for (const requirement of currentIr.repositoryRequirements) {
    const items = repositoryGrouped.get(requirement.docPath) ?? [];
    items.push(requirement);
    repositoryGrouped.set(requirement.docPath, items);
  }
  for (const [path, items] of repositoryGrouped) {
    const fullPath = resolve(root, path);
    const source = readFileSync(fullPath, "utf8");
    const mode = currentIr.documentModes[path];
    if (mode === undefined) fail(`${path}: Markdown mode is not classified`);
    const updated = items.reduce(
      (text, item) => replaceOwnedMarkdownSection({
        source: text,
        mode,
        anchorId: item.docAnchor,
        blockId: item.id,
        generatedContent: item.generatedContent,
      }),
      source,
    );
    if (updated === source) continue;
    changed.add(path);
    if (write) writeFileSync(fullPath, updated, "utf8");
  }

  return [...changed].sort();
}
