import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ContractVersionSummary {
  readonly contractId: string;
  readonly conformanceId: string;
  readonly contractPath: string;
  readonly conformancePath: string;
  readonly status: string;
  readonly accepted: boolean;
  readonly acceptanceReady: boolean;
  readonly semanticBase: string;
  readonly observableSemanticDelta: boolean;
  readonly issue?: number;
  readonly candidateLifecycleIssue?: number;
  readonly coverageState: string;
  readonly requiredExecutableGateCount: number;
  readonly requiredNegativeVectorCount: number;
  readonly isCurrent: boolean;
  readonly isPrevious: boolean;
}

export interface ContractObservatoryIndex {
  readonly schema: "mts-contract-observatory-index/v0.1";
  readonly acceptancePath: string;
  readonly currentContractPath: string;
  readonly currentConformancePath: string;
  readonly previousContractPath: string;
  readonly previousConformancePath: string;
  readonly versions: readonly ContractVersionSummary[];
}

export type ContractIndexErrorCode =
  | "malformed-json"
  | "invalid-document"
  | "invalid-schema-version"
  | "duplicate-contract-id"
  | "duplicate-conformance-id"
  | "missing-conformance"
  | "orphan-conformance"
  | "pair-mismatch"
  | "policy-path-missing"
  | "acceptance-missing"
  | "acceptance-mismatch";

export class ContractIndexError extends Error {
  readonly code: ContractIndexErrorCode;
  readonly path?: string;

  constructor(code: ContractIndexErrorCode, path?: string) {
    super(path === undefined ? code : `${code}: ${path}`);
    this.name = "ContractIndexError";
    this.code = code;
    if (path !== undefined) this.path = path;
  }
}

type JsonRecord = Record<string, unknown>;

interface ContractDocument {
  readonly schema: string;
  readonly conformanceCorpus: string;
  readonly status: string;
  readonly accepted: boolean;
  readonly acceptanceReady: boolean;
  readonly semanticBase: string;
  readonly observableSemanticDelta: boolean;
  readonly issue?: number;
  readonly candidateLifecycleIssue?: number;
}

interface ConformanceDocument {
  readonly schema: string;
  readonly contract: string;
  readonly status: string;
  readonly accepted: boolean;
  readonly coverageState: string;
  readonly requiredExecutableGates: readonly string[];
  readonly requiredNegativeVectors: readonly string[];
}

interface PolicyPointers {
  readonly currentContractPath: string;
  readonly currentConformancePath: string;
  readonly previousContractPath: string;
  readonly previousConformancePath: string;
  readonly acceptancePath: string;
}

const CONTRACT_FILENAME = /^mts-contract-v.+\.json$/;
const CONFORMANCE_FILENAME = /^mts-conformance-v.+\.json$/;
const CONTRACT_SCHEMA = /^mts-contract\/v(\d+(?:\.\d+)*)$/;
const CONFORMANCE_SCHEMA = /^mts-conformance\/v(\d+(?:\.\d+)*)$/;

export function buildContractObservatoryIndex(repoRoot: string): ContractObservatoryIndex {
  const policy = readJson(join(repoRoot, "repo-policy.json"), "policy-path-missing");
  const pointers = readPolicyPointers(policy);
  const contractsDirectory = join(repoRoot, "contracts");
  const entries = readdirSync(contractsDirectory, { withFileTypes: true });
  const contractPaths = entries
    .filter((entry) => entry.isFile() && CONTRACT_FILENAME.test(entry.name))
    .map((entry) => `contracts/${entry.name}`)
    .sort();
  const conformancePaths = entries
    .filter((entry) => entry.isFile() && CONFORMANCE_FILENAME.test(entry.name))
    .map((entry) => `contracts/${entry.name}`)
    .sort();

  const contracts = new Map<string, { path: string; document: ContractDocument }>();
  for (const path of contractPaths) {
    const document = readContract(readJson(join(repoRoot, path), "invalid-document"), path);
    if (contracts.has(document.schema)) throw new ContractIndexError("duplicate-contract-id", path);
    contracts.set(document.schema, { path, document });
  }

  const conformancesById = new Map<string, { path: string; document: ConformanceDocument }>();
  const conformancesByPath = new Map<string, ConformanceDocument>();
  for (const path of conformancePaths) {
    const document = readConformance(readJson(join(repoRoot, path), "invalid-document"), path);
    if (conformancesById.has(document.schema)) {
      throw new ContractIndexError("duplicate-conformance-id", path);
    }
    conformancesById.set(document.schema, { path, document });
    conformancesByPath.set(path, document);
  }

  const usedConformancePaths = new Set<string>();
  const versions: ContractVersionSummary[] = [];
  for (const { path: contractPath, document: contract } of contracts.values()) {
    parseVersion(contract.schema, CONTRACT_SCHEMA, contractPath);
    const conformance = conformancesByPath.get(contract.conformanceCorpus);
    if (conformance === undefined) {
      throw new ContractIndexError("missing-conformance", contract.conformanceCorpus);
    }
    if (usedConformancePaths.has(contract.conformanceCorpus)) {
      throw new ContractIndexError("pair-mismatch", contract.conformanceCorpus);
    }
    usedConformancePaths.add(contract.conformanceCorpus);
    parseVersion(conformance.schema, CONFORMANCE_SCHEMA, contract.conformanceCorpus);
    const expectedConformanceId = contract.schema.replace("mts-contract/", "mts-conformance/");
    if (conformance.contract !== contract.schema || conformance.schema !== expectedConformanceId) {
      throw new ContractIndexError("pair-mismatch", contract.conformanceCorpus);
    }

    versions.push(freezeSummary({
      contractId: contract.schema,
      conformanceId: conformance.schema,
      contractPath,
      conformancePath: contract.conformanceCorpus,
      status: contract.status,
      accepted: contract.accepted,
      acceptanceReady: contract.acceptanceReady,
      semanticBase: contract.semanticBase,
      observableSemanticDelta: contract.observableSemanticDelta,
      ...(contract.issue === undefined ? {} : { issue: contract.issue }),
      ...(contract.candidateLifecycleIssue === undefined
        ? {}
        : { candidateLifecycleIssue: contract.candidateLifecycleIssue }),
      coverageState: conformance.coverageState,
      requiredExecutableGateCount: conformance.requiredExecutableGates.length,
      requiredNegativeVectorCount: conformance.requiredNegativeVectors.length,
      isCurrent: contractPath === pointers.currentContractPath
        && contract.conformanceCorpus === pointers.currentConformancePath,
      isPrevious: contractPath === pointers.previousContractPath
        && contract.conformanceCorpus === pointers.previousConformancePath,
    }));
  }

  for (const { path } of conformancesById.values()) {
    if (!usedConformancePaths.has(path)) throw new ContractIndexError("orphan-conformance", path);
  }

  requirePairPath(versions, pointers.currentContractPath, pointers.currentConformancePath);
  requirePairPath(versions, pointers.previousContractPath, pointers.previousConformancePath);
  verifyAcceptance(repoRoot, pointers);

  versions.sort((left, right) => compareVersions(left.contractId, right.contractId));
  return Object.freeze({
    schema: "mts-contract-observatory-index/v0.1",
    acceptancePath: pointers.acceptancePath,
    currentContractPath: pointers.currentContractPath,
    currentConformancePath: pointers.currentConformancePath,
    previousContractPath: pointers.previousContractPath,
    previousConformancePath: pointers.previousConformancePath,
    versions: Object.freeze(versions),
  });
}

export function serializeContractObservatoryIndex(index: ContractObservatoryIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}

function readPolicyPointers(policy: JsonRecord): PolicyPointers {
  const boundary = recordField(policy, "contract_conformance", "repo-policy.json");
  const current = recordField(boundary, "current", "repo-policy.json");
  const previous = recordField(boundary, "previous", "repo-policy.json");
  const acceptance = recordField(boundary, "acceptance", "repo-policy.json");
  return {
    currentContractPath: documentPath(current, "contract"),
    currentConformancePath: documentPath(current, "conformance"),
    previousContractPath: documentPath(previous, "contract"),
    previousConformancePath: documentPath(previous, "conformance"),
    acceptancePath: documentPath(acceptance, "document"),
  };
}

function verifyAcceptance(repoRoot: string, pointers: PolicyPointers): void {
  const absolutePath = join(repoRoot, pointers.acceptancePath);
  const acceptance = readJson(absolutePath, "acceptance-missing");
  const current = recordField(acceptance, "current", pointers.acceptancePath);
  if (stringField(current, "contract", pointers.acceptancePath) !== pointers.currentContractPath
    || stringField(current, "conformance", pointers.acceptancePath) !== pointers.currentConformancePath) {
    throw new ContractIndexError("acceptance-mismatch", pointers.acceptancePath);
  }
}

function requirePairPath(
  versions: readonly ContractVersionSummary[],
  contractPath: string,
  conformancePath: string,
): void {
  if (!versions.some((version) => version.contractPath === contractPath
    && version.conformancePath === conformancePath)) {
    throw new ContractIndexError("policy-path-missing", `${contractPath} | ${conformancePath}`);
  }
}

function readContract(value: JsonRecord, path: string): ContractDocument {
  const schema = stringField(value, "schema", path);
  parseVersion(schema, CONTRACT_SCHEMA, path);
  return {
    schema,
    conformanceCorpus: stringField(value, "conformanceCorpus", path),
    status: stringField(value, "status", path),
    accepted: booleanField(value, "accepted", path),
    acceptanceReady: booleanField(value, "acceptanceReady", path),
    semanticBase: stringField(value, "semanticBase", path),
    observableSemanticDelta: booleanField(value, "observableSemanticDelta", path),
    ...optionalNumberField(value, "issue", path),
    ...optionalNumberField(value, "candidateLifecycleIssue", path),
  };
}

function readConformance(value: JsonRecord, path: string): ConformanceDocument {
  const schema = stringField(value, "schema", path);
  parseVersion(schema, CONFORMANCE_SCHEMA, path);
  return {
    schema,
    contract: stringField(value, "contract", path),
    status: stringField(value, "status", path),
    accepted: booleanField(value, "accepted", path),
    coverageState: stringField(value, "coverageState", path),
    requiredExecutableGates: stringArrayField(value, "requiredExecutableGates", path),
    requiredNegativeVectors: stringArrayField(value, "requiredNegativeVectors", path),
  };
}

function compareVersions(left: string, right: string): number {
  const a = parseVersion(left, CONTRACT_SCHEMA, left);
  const b = parseVersion(right, CONTRACT_SCHEMA, right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function parseVersion(value: string, pattern: RegExp, path: string): readonly number[] {
  const match = pattern.exec(value);
  if (match === null || match[1] === undefined) throw new ContractIndexError("invalid-schema-version", path);
  const parts = match[1].split(".").map((part) => Number(part));
  if (parts.some((part) => !Number.isSafeInteger(part) || part < 0)) {
    throw new ContractIndexError("invalid-schema-version", path);
  }
  return parts;
}

function readJson(path: string, missingCode: ContractIndexErrorCode): JsonRecord {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new ContractIndexError(missingCode, path);
  }
  try {
    const value: unknown = JSON.parse(text);
    return requireRecord(value, path);
  } catch (error) {
    if (error instanceof ContractIndexError) throw error;
    throw new ContractIndexError("malformed-json", path);
  }
}

function requireRecord(value: unknown, path: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ContractIndexError("invalid-document", path);
  }
  return value as JsonRecord;
}

function recordField(record: JsonRecord, field: string, path: string): JsonRecord {
  return requireRecord(record[field], path);
}

function documentPath(record: JsonRecord, field: string): string {
  return stringField(recordField(record, field, "repo-policy.json"), "path", "repo-policy.json");
}

function stringField(record: JsonRecord, field: string, path: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) throw new ContractIndexError("invalid-document", path);
  return value;
}

function booleanField(record: JsonRecord, field: string, path: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") throw new ContractIndexError("invalid-document", path);
  return value;
}

function optionalNumberField(record: JsonRecord, field: string, path: string): Record<string, number> {
  const value = record[field];
  if (value === undefined) return {};
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new ContractIndexError("invalid-document", path);
  }
  return { [field]: value };
}

function stringArrayField(record: JsonRecord, field: string, path: string): readonly string[] {
  const value = record[field];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new ContractIndexError("invalid-document", path);
  }
  return value;
}

function freezeSummary(summary: ContractVersionSummary): ContractVersionSummary {
  return Object.freeze({ ...summary });
}
