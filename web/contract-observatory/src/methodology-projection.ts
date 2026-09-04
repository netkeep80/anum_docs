import { existsSync, readFileSync, readdirSync } from "node:fs";
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

export interface SemanticInvariantPositive {
  readonly requiredGenesisVectors: readonly string[];
  readonly requiredMeaningVectors: readonly string[];
  readonly requiredC2ClassificationVectors: readonly string[];
  readonly requiredCompatibilityVectors: readonly string[];
}

export interface SemanticInvariantNegative {
  readonly requiredNegativeVectors: readonly string[];
}

export interface SemanticInvariant {
  readonly authority: "semantic-invariant";
  readonly id: string;
  readonly traceabilitySourcePath: string;
  readonly contractPointer: string;
  readonly contractValue: string;
  readonly positive: SemanticInvariantPositive;
  readonly negative: SemanticInvariantNegative;
  readonly requiredExecutableGates: readonly string[];
}

export interface TraceabilityRelation {
  readonly authority: "traceability";
  readonly from: string;
  readonly to: string;
  readonly relation: "supported-by" | "challenged-by" | "verified-by" | "accepted-by";
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
  readonly semanticInvariants: readonly SemanticInvariant[];
  readonly traceabilityManifestPath: string | null;
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

interface TraceabilityManifestSelection {
  readonly path: string;
  readonly value: JsonRecord;
}

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
  const manifest = findTraceabilityManifest(repoRoot, summary);
  const semanticInvariants = manifest === undefined
    ? []
    : projectSemanticInvariants(index, summary, contract, conformance, manifest);
  const traceability = collectTraceability(
    positiveVectors,
    negativeVectors,
    semanticInvariants,
    acceptanceReferences,
    summary,
  );
  const unresolvedRelations = collectUnresolved(
    theoryReferences,
    positiveVectors,
    negativeVectors,
    executableGates,
    acceptanceReferences,
    manifest,
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
    semanticInvariants: Object.freeze(semanticInvariants),
    traceabilityManifestPath: manifest?.path ?? null,
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

function findTraceabilityManifest(
  repoRoot: string,
  summary: ContractVersionSummary,
): TraceabilityManifestSelection | undefined {
  const directory = join(repoRoot, "traceability");
  if (!existsSync(directory)) return undefined;
  const matches: TraceabilityManifestSelection[] = [];
  for (const name of readdirSync(directory).filter((entry) => entry.endsWith(".json")).sort()) {
    const path = `traceability/${name}`;
    const value = readJson(join(repoRoot, path));
    const schema = typeof value.schema === "string" ? value.schema : "";
    if (!schema.startsWith("mts-traceability/")) continue;
    if (value.contract === summary.contractPath && value.conformance === summary.conformancePath) {
      matches.push(Object.freeze({ path, value }));
    }
  }
  if (matches.length > 1) {
    throw new Error(`Contract Observatory V4d: ambiguous traceability manifests for ${summary.contractPath}`);
  }
  return matches[0];
}

function projectSemanticInvariants(
  index: ContractObservatoryIndex,
  summary: ContractVersionSummary,
  contract: JsonRecord,
  conformance: JsonRecord,
  manifest: TraceabilityManifestSelection,
): SemanticInvariant[] {
  const acceptancePath = requireString(manifest.value.acceptance, `${manifest.path}#/acceptance`);
  if (acceptancePath !== index.acceptancePath) {
    throw new Error(`Contract Observatory V4d: traceability acceptance mismatch: ${manifest.path}`);
  }
  const invariants = requireRecord(manifest.value.invariants, `${manifest.path}#/invariants`);
  const laws = requireRecord(contract.requiredSemanticLaws, `${summary.contractPath}#/requiredSemanticLaws`);
  const invariantIds = Object.keys(invariants).sort((a, b) => a.localeCompare(b));
  const lawIds = Object.keys(laws).sort((a, b) => a.localeCompare(b));
  if (invariantIds.join("\u0000") !== lawIds.join("\u0000")) {
    throw new Error(`Contract Observatory V4d: traceability invariant identity mismatch: ${manifest.path}`);
  }

  return invariantIds.map((id) => {
    const source = requireRecord(invariants[id], `${manifest.path}#/invariants/${id}`);
    const contractPointer = requireString(source.contractPointer, `${manifest.path}#/invariants/${id}/contractPointer`);
    const contractValue = requireString(resolveJsonPointer(contract, contractPointer), `${summary.contractPath}#${contractPointer}`);
    const positive = requireRecord(source.positive, `${manifest.path}#/invariants/${id}/positive`);
    const negative = requireRecord(source.negative, `${manifest.path}#/invariants/${id}/negative`);
    const requiredGenesisVectors = validatedSubset(
      positive.requiredGenesisVectors,
      conformance.requiredGenesisVectors,
      `${manifest.path}#/invariants/${id}/positive/requiredGenesisVectors`,
    );
    const requiredMeaningVectors = validatedSubset(
      positive.requiredMeaningVectors,
      conformance.requiredMeaningVectors,
      `${manifest.path}#/invariants/${id}/positive/requiredMeaningVectors`,
    );
    const requiredC2ClassificationVectors = validatedSubset(
      positive.requiredC2ClassificationVectors,
      conformance.requiredC2ClassificationVectors,
      `${manifest.path}#/invariants/${id}/positive/requiredC2ClassificationVectors`,
    );
    const requiredCompatibilityVectors = validatedSubset(
      positive.requiredCompatibilityVectors,
      conformance.requiredCompatibilityVectors,
      `${manifest.path}#/invariants/${id}/positive/requiredCompatibilityVectors`,
    );
    const requiredNegativeVectors = validatedSubset(
      negative.requiredNegativeVectors,
      conformance.requiredNegativeVectors,
      `${manifest.path}#/invariants/${id}/negative/requiredNegativeVectors`,
    );
    const requiredExecutableGates = validatedSubset(
      source.requiredExecutableGates,
      conformance.requiredExecutableGates,
      `${manifest.path}#/invariants/${id}/requiredExecutableGates`,
    );
    return Object.freeze({
      authority: "semantic-invariant" as const,
      id,
      traceabilitySourcePath: manifest.path,
      contractPointer,
      contractValue,
      positive: Object.freeze({
        requiredGenesisVectors,
        requiredMeaningVectors,
        requiredC2ClassificationVectors,
        requiredCompatibilityVectors,
      }),
      negative: Object.freeze({ requiredNegativeVectors }),
      requiredExecutableGates,
    });
  });
}

function validatedSubset(value: unknown, authority: unknown, source: string): readonly string[] {
  const selected = uniqueSorted(stringArray(value));
  const allowed = new Set(stringArray(authority));
  for (const id of selected) {
    if (!allowed.has(id)) throw new Error(`Contract Observatory V4d: traceability reference outside authority: ${source}: ${id}`);
  }
  return Object.freeze(selected);
}

function resolveJsonPointer(root: unknown, pointer: string): unknown {
  if (pointer === "") return root;
  if (!pointer.startsWith("/")) throw new Error(`Contract Observatory V4d: invalid JSON Pointer: ${pointer}`);
  let current: unknown = root;
  for (const encoded of pointer.slice(1).split("/")) {
    if (/~(?:[^01]|$)/.test(encoded)) throw new Error(`Contract Observatory V4d: invalid JSON Pointer escape: ${pointer}`);
    const token = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) throw new Error(`Contract Observatory V4d: unresolved JSON Pointer: ${pointer}`);
      current = current[Number(token)];
    } else {
      const record = optionalRecord(current);
      if (record === undefined || !Object.prototype.hasOwnProperty.call(record, token)) {
        throw new Error(`Contract Observatory V4d: unresolved JSON Pointer: ${pointer}`);
      }
      current = record[token];
    }
  }
  return current;
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
  if (summary.status === "candidate") stages.push(stage("candidate", [summary.contractPath]));
  if (summary.accepted) stages.push(stage("accepted", [summary.contractPath, summary.conformancePath]));
  if (summary.accepted && acceptance.length > 0) stages.push(stage("released", acceptance.map((reference) => reference.id)));
  return stages;
}

function stage(stageName: MethodologyStage, evidence: readonly string[]): MethodologyStageReference {
  return Object.freeze({ stage: stageName, evidence: Object.freeze([...evidence].sort()) });
}

function collectTraceability(
  positive: readonly ConformanceVector[],
  negative: readonly ConformanceVector[],
  invariants: readonly SemanticInvariant[],
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
  for (const invariant of invariants) {
    const invariantId = `invariant:${invariant.id}`;
    for (const vectorId of invariantPositiveIds(invariant)) {
      relations.push(Object.freeze({ authority: "traceability", from: invariantId, to: `vector:${vectorId}`, relation: "supported-by" }));
    }
    for (const vectorId of invariant.negative.requiredNegativeVectors) {
      relations.push(Object.freeze({ authority: "traceability", from: invariantId, to: `vector:${vectorId}`, relation: "challenged-by" }));
    }
    for (const gate of invariant.requiredExecutableGates) {
      relations.push(Object.freeze({ authority: "traceability", from: invariantId, to: `gate:${gate}`, relation: "verified-by" }));
    }
    for (const reference of acceptance) {
      relations.push(Object.freeze({ authority: "traceability", from: invariantId, to: reference.id, relation: "accepted-by" }));
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
  return relations.sort((a, b) => `${a.from}\u0000${a.to}\u0000${a.relation}`.localeCompare(`${b.from}\u0000${b.to}\u0000${b.relation}`));
}

function invariantPositiveIds(invariant: SemanticInvariant): readonly string[] {
  return uniqueSorted([
    ...invariant.positive.requiredGenesisVectors,
    ...invariant.positive.requiredMeaningVectors,
    ...invariant.positive.requiredC2ClassificationVectors,
    ...invariant.positive.requiredCompatibilityVectors,
  ]);
}

function collectUnresolved(
  theory: readonly TheoryReference[],
  positive: readonly ConformanceVector[],
  negative: readonly ConformanceVector[],
  gates: readonly ExecutableGate[],
  acceptance: readonly AcceptanceReference[],
  manifest: TraceabilityManifestSelection | undefined,
): string[] {
  const unresolved = [...positive, ...negative]
    .filter((item) => item.evidence.length === 0)
    .map((item) => `vector-evidence:${item.id}`);
  if (theory.length === 0) unresolved.push("theory-reference");
  if (gates.length === 0) unresolved.push("executable-gates");
  if (acceptance.length === 0) unresolved.push("acceptance-reference");
  if (manifest === undefined) unresolved.push("traceability-manifest");
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

function requireRecord(value: unknown, source: string): JsonRecord {
  const record = optionalRecord(value);
  if (record === undefined) throw new Error(`Contract Observatory V4d: expected object: ${source}`);
  return record;
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
