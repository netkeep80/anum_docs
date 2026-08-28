import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ContractObservatoryIndex, ContractVersionSummary } from "./contract-index.js";

export type MethodologyStage =
  | "research"
  | "problem"
  | "candidate"
  | "challenged"
  | "modeled"
  | "accepted"
  | "released";

export interface MethodologyStageReference {
  readonly stage: MethodologyStage;
  readonly evidence: readonly string[];
}

export interface TheoryReference {
  readonly authority: "theory-reference";
  readonly id: string;
}

export interface ContractReference {
  readonly authority: "contract";
  readonly id: string;
  readonly path: string;
}

export interface ConformanceVector {
  readonly authority: "conformance-vector";
  readonly id: string;
  readonly polarity: "positive" | "negative";
  readonly evidence: readonly string[];
}

export interface ExecutableGate {
  readonly authority: "executable-gate";
  readonly id: string;
  readonly path: string;
}

export interface EvidenceReference {
  readonly authority: "evidence";
  readonly id: string;
  readonly sourcePath: string;
}

export interface AcceptanceReference {
  readonly authority: "acceptance";
  readonly id: string;
  readonly sourcePath: string;
}

export interface TraceabilityRelation {
  readonly authority: "traceability";
  readonly from: string;
  readonly to: string;
  readonly relation: "supported-by" | "accepted-by";
}

export interface MethodologyVersionProjection {
  readonly contractId: string;
  readonly conformanceId: string;
  readonly contractPath: string;
  readonly conformancePath: string;
  readonly status: string;
  readonly accepted: boolean;
  readonly acceptanceReady: boolean;
  readonly isCurrent: boolean;
  readonly isPrevious: boolean;
  readonly theoryReferences: readonly TheoryReference[];
  readonly contractReferences: readonly ContractReference[];
  readonly positiveVectors: readonly ConformanceVector[];
  readonly negativeVectors: readonly ConformanceVector[];
  readonly executableGates: readonly ExecutableGate[];
  readonly evidenceReferences: readonly EvidenceReference[];
  readonly acceptanceReferences: readonly AcceptanceReference[];
  readonly lifecycle: readonly MethodologyStageReference[];
  readonly traceability: readonly TraceabilityRelation[];
  readonly unresolvedRelations: readonly string[];
}

export interface MethodologyProjection {
  readonly schema: "mts-contract-methodology-projection/v0.1";
  readonly versions: readonly MethodologyVersionProjection[];
}

type JsonRecord = Record<string, unknown>;

export function buildMethodologyProjection(
  repoRoot: string,
  index: ContractObservatoryIndex,
): MethodologyProjection {
  const acceptance = readJson(join(repoRoot, index.acceptancePath));
  const versions = index.versions.map((summary) => projectVersion(repoRoot, index, acceptance, summary));
  return Object.freeze({
    schema: "mts-contract-methodology-projection/v0.1",
    versions: Object.freeze(versions),
  });
}

export function serializeMethodologyProjection(projection: MethodologyProjection): string {
  return `${JSON.stringify(projection, null, 2)}\n`;
}

function projectVersion(
  repoRoot: string,
  index: ContractObservatoryIndex,
  acceptance: JsonRecord,
  summary: ContractVersionSummary,
): MethodologyVersionProjection {
  const contract = readJson(join(repoRoot, summary.contractPath));
  const conformance = readJson(join(repoRoot, summary.conformancePath));
  const positiveIds = collectPositiveVectorIds(conformance);
  const negativeIds = [...stringArray(conformance.requiredNegativeVectors)];
  validateVectorIds([...positiveIds, ...negativeIds]);
  positiveIds.sort((a, b) => a.localeCompare(b));
  negativeIds.sort((a, b) => a.localeCompare(b));

  const knownVectorIds = new Set([...positiveIds, ...negativeIds]);
  const vectorEvidence = readVectorEvidence(conformance, knownVectorIds);
  const positiveVectors = positiveIds.map((id) => vector(id, "positive", vectorEvidence));
  const negativeVectors = negativeIds.map((id) => vector(id, "negative", vectorEvidence));
  const gatePaths = uniqueSorted(stringArray(conformance.requiredExecutableGates));
  const executableGates = gatePaths.map((path) => Object.freeze({
    authority: "executable-gate" as const,
    id: `gate:${path}`,
    path,
  }));
  const theoryReferences: TheoryReference[] = [];
  const evidenceReferences = collectEvidenceReferences(conformance, vectorEvidence);
  const acceptanceReferences = collectAcceptanceReferences(index, acceptance, summary);
  const traceability = collectTraceability(
    positiveVectors,
    negativeVectors,
    acceptanceReferences,
    summary,
  );
  const unresolvedRelations = collectUnresolved(
    theoryReferences,
    positiveVectors,
    negativeVectors,
    executableGates,
    acceptanceReferences,
  );

  // semanticBase is intentionally not promoted to TheoryReference. It is a
  // contract-version dependency and no current authoritative document exposes
  // a machine-addressable normative theory reference for this projection.
  requireString(contract.semanticBase, `${summary.contractPath}#/semanticBase`);

  return Object.freeze({
    contractId: summary.contractId,
    conformanceId: summary.conformanceId,
    contractPath: summary.contractPath,
    conformancePath: summary.conformancePath,
    status: summary.status,
    accepted: summary.accepted,
    acceptanceReady: summary.acceptanceReady,
    isCurrent: summary.isCurrent,
    isPrevious: summary.isPrevious,
    theoryReferences: Object.freeze(theoryReferences),
    contractReferences: Object.freeze([Object.freeze({
      authority: "contract" as const,
      id: summary.contractId,
      path: summary.contractPath,
    })]),
    positiveVectors: Object.freeze(positiveVectors),
    negativeVectors: Object.freeze(negativeVectors),
    executableGates: Object.freeze(executableGates),
    evidenceReferences: Object.freeze(evidenceReferences),
    acceptanceReferences: Object.freeze(acceptanceReferences),
    lifecycle: Object.freeze(buildLifecycle(summary, acceptanceReferences)),
    traceability: Object.freeze(traceability),
    unresolvedRelations: Object.freeze(unresolvedRelations),
  });
}

function collectPositiveVectorIds(conformance: JsonRecord): string[] {
  const ids: string[] = [];
  for (const key of Object.keys(conformance).sort()) {
    if (!key.startsWith("required") || !key.endsWith("Vectors") || key === "requiredNegativeVectors") continue;
    ids.push(...stringArray(conformance[key]));
  }
  return ids;
}

function validateVectorIds(ids: readonly string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (id.length === 0) throw new Error("Contract Observatory V4b: empty vector id");
    if (seen.has(id)) throw new Error(`Contract Observatory V4b: duplicate vector id: ${id}`);
    seen.add(id);
  }
}

function readVectorEvidence(
  conformance: JsonRecord,
  knownVectorIds: ReadonlySet<string>,
): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, string[]>();
  const root = optionalRecord(conformance.vectorEvidence);
  if (root === undefined) return result;
  for (const group of Object.keys(root).sort()) {
    const bindings = optionalRecord(root[group]);
    if (bindings === undefined) continue;
    for (const sourcePath of Object.keys(bindings).sort()) {
      for (const vectorId of stringArray(bindings[sourcePath])) {
        if (!knownVectorIds.has(vectorId)) {
          throw new Error(`Contract Observatory V4b: evidence references unknown vector: ${vectorId}`);
        }
        const paths = result.get(vectorId) ?? [];
        paths.push(sourcePath);
        result.set(vectorId, paths);
      }
    }
  }
  for (const [id, paths] of result) result.set(id, uniqueSorted(paths));
  return result;
}

function vector(
  id: string,
  polarity: "positive" | "negative",
  evidence: ReadonlyMap<string, readonly string[]>,
): ConformanceVector {
  return Object.freeze({
    authority: "conformance-vector",
    id,
    polarity,
    evidence: Object.freeze([...(evidence.get(id) ?? [])]),
  });
}

function collectEvidenceReferences(
  conformance: JsonRecord,
  vectorEvidence: ReadonlyMap<string, readonly string[]>,
): EvidenceReference[] {
  const refs = new Map<string, EvidenceReference>();
  for (const paths of vectorEvidence.values()) {
    for (const path of paths) refs.set(path, Object.freeze({ authority: "evidence", id: `evidence:${path}`, sourcePath: path }));
  }
  const production = optionalRecord(conformance.productionEvidence);
  if (production !== undefined) {
    for (const path of Object.keys(production).sort()) {
      refs.set(path, Object.freeze({ authority: "evidence", id: `evidence:${path}`, sourcePath: path }));
    }
  }
  return [...refs.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function collectAcceptanceReferences(
  index: ContractObservatoryIndex,
  acceptance: JsonRecord,
  summary: ContractVersionSummary,
): AcceptanceReference[] {
  const refs: AcceptanceReference[] = [];
  const current = optionalRecord(acceptance.current);
  if (current !== undefined
    && current.contract === summary.contractPath
    && current.conformance === summary.conformancePath) {
    refs.push(Object.freeze({ authority: "acceptance", id: `acceptance:${summary.contractId}:current`, sourcePath: index.acceptancePath }));
  }
  const previous = optionalRecord(acceptance.previousReleaseEvidence);
  if (previous !== undefined
    && previous.contract === summary.contractPath
    && previous.conformance === summary.conformancePath) {
    refs.push(Object.freeze({ authority: "acceptance", id: `acceptance:${summary.contractId}:previous`, sourcePath: index.acceptancePath }));
  }
  return refs.sort((a, b) => a.id.localeCompare(b.id));
}

function buildLifecycle(
  summary: ContractVersionSummary,
  acceptance: readonly AcceptanceReference[],
): MethodologyStageReference[] {
  const stages: MethodologyStageReference[] = [];

  // Lifecycle stages are source-derived, not reconstructed from nearby evidence.
  // A generic issue number, vector/gate presence or coverageState cannot prove a
  // historical research/problem/challenge/model stage.
  if (summary.status === "candidate") {
    stages.push(stage("candidate", [summary.contractPath]));
  }
  if (summary.accepted) {
    stages.push(stage("accepted", [summary.contractPath, summary.conformancePath]));
  }
  if (summary.accepted && acceptance.length > 0) {
    stages.push(stage("released", acceptance.map((reference) => reference.id)));
  }
  return stages;
}

function stage(stageName: MethodologyStage, evidence: readonly string[]): MethodologyStageReference {
  return Object.freeze({ stage: stageName, evidence: Object.freeze([...evidence].sort()) });
}

function collectTraceability(
  positive: readonly ConformanceVector[],
  negative: readonly ConformanceVector[],
  acceptance: readonly AcceptanceReference[],
  summary: ContractVersionSummary,
): TraceabilityRelation[] {
  const relations: TraceabilityRelation[] = [];
  for (const item of [...positive, ...negative]) {
    for (const evidence of item.evidence) {
      relations.push(Object.freeze({
        authority: "traceability",
        from: `vector:${item.id}`,
        to: `evidence:${evidence}`,
        relation: "supported-by",
      }));
    }
  }
  for (const reference of acceptance) {
    relations.push(Object.freeze({
      authority: "traceability",
      from: `contract:${summary.contractId}`,
      to: reference.id,
      relation: "accepted-by",
    }));
  }
  return relations.sort((a, b) => `${a.from}\u0000${a.to}`.localeCompare(`${b.from}\u0000${b.to}`));
}

function collectUnresolved(
  theory: readonly TheoryReference[],
  positive: readonly ConformanceVector[],
  negative: readonly ConformanceVector[],
  gates: readonly ExecutableGate[],
  acceptance: readonly AcceptanceReference[],
): string[] {
  const unresolved = [...positive, ...negative]
    .filter((item) => item.evidence.length === 0)
    .map((item) => `vector-evidence:${item.id}`);
  if (theory.length === 0) unresolved.push("theory-reference");
  if (gates.length === 0) unresolved.push("executable-gates");
  if (acceptance.length === 0) unresolved.push("acceptance-reference");
  return uniqueSorted(unresolved);
}

function readJson(path: string): JsonRecord {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  const record = optionalRecord(parsed);
  if (record === undefined) throw new Error(`Contract Observatory V4b: invalid JSON object: ${path}`);
  return record;
}

function optionalRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function stringArray(value: unknown): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error("Contract Observatory V4b: expected string array");
  }
  return value;
}

function requireString(value: unknown, source: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Contract Observatory V4b: expected string: ${source}`);
  }
  return value;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
