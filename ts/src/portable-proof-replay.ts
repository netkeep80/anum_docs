import {
  CanonicalTopologyError,
  exportCanonicalTopology,
} from "./canonical-topology.js";
import {
  replayStructuralDerivationWithTheorems,
  type StructuralDerivationEvidence,
  type StructuralDerivationWithTheoremsEvidence,
  type StructuralDerivationWithTheoremsReplayResult,
  type StructuralTheoremEvidence,
} from "./derivation.js";
import {
  Memory,
  MemoryError,
  type EnumerableReadMemory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "./memory.js";
import {
  PORTABLE_MTS_SEMANTIC_BASE,
  PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_SCHEMA,
  PortableStructuralDerivationError,
  coordinate,
  encodeNodes,
  exactRecord,
  freshHandle,
  parseNodes,
  parseTopology,
  reconstructEvidence,
  replayPortableStructuralDerivation,
  replayPortableStructuralDerivationWithAssumptions,
  restoreCanonicalTopology,
  sameTopology,
  sourceCoordinate,
  type PortableStructuralDerivationCoordinates,
  type PortableStructuralDerivationErrorCode,
  type PortableStructuralDerivationReplayResult,
  type PortableStructuralDerivationWithAssumptionsReplayResult,
} from "./portable-derivation.js";
import type { StorageTopologyImage } from "./persistence-topology.js";
import {
  StructuralDerivationSupportTopologyError,
  exportStructuralDerivationSupportTopology,
} from "./proof-support-topology.js";

export const PORTABLE_STRUCTURAL_DERIVATION_WITH_THEOREMS_SCHEMA =
  "mts-portable-structural-derivation-with-theorems/v0.1" as const;

export interface PortableStructuralTheoremEvidenceCoordinates {
  readonly theoremCoordinate: number;
  readonly proof: PortableStructuralDerivationCoordinates;
}

export interface PortableStructuralDerivationWithTheoremsArtifact
  extends PortableStructuralDerivationCoordinates {
  readonly schema: typeof PORTABLE_STRUCTURAL_DERIVATION_WITH_THEOREMS_SCHEMA;
  readonly mtsSemanticBase: typeof PORTABLE_MTS_SEMANTIC_BASE;
  readonly topology: StorageTopologyImage;
  readonly theorems: readonly PortableStructuralTheoremEvidenceCoordinates[];
}

export type PortableStructuralDerivationWithTheoremsErrorCode =
  PortableStructuralDerivationErrorCode;

export interface PortableStructuralDerivationWithTheoremsReplayResult {
  readonly memory: Memory;
  readonly evidence: StructuralDerivationWithTheoremsEvidence;
  readonly replay: StructuralDerivationWithTheoremsReplayResult;
}

export type PortableStructuralProofReplayResult =
  | PortableStructuralDerivationReplayResult
  | PortableStructuralDerivationWithAssumptionsReplayResult
  | PortableStructuralDerivationWithTheoremsReplayResult;

function fail(code: PortableStructuralDerivationErrorCode): never {
  throw new PortableStructuralDerivationError(code);
}

function parseDerivation(value: unknown): PortableStructuralDerivationCoordinates {
  const item = exactRecord(value, ["theoryCoordinate", "targetOccurrenceCoordinate", "nodes"]);
  return Object.freeze({
    theoryCoordinate: coordinate(item.theoryCoordinate),
    targetOccurrenceCoordinate: coordinate(item.targetOccurrenceCoordinate),
    nodes: parseNodes(item.nodes),
  });
}

function parseTheorem(value: unknown): PortableStructuralTheoremEvidenceCoordinates {
  const item = exactRecord(value, ["theoremCoordinate", "proof"]);
  return Object.freeze({
    theoremCoordinate: coordinate(item.theoremCoordinate),
    proof: parseDerivation(item.proof),
  });
}

function parseArtifactWithTheorems(
  input: unknown,
): PortableStructuralDerivationWithTheoremsArtifact {
  const item = exactRecord(input, [
    "schema",
    "mtsSemanticBase",
    "topology",
    "theoryCoordinate",
    "targetOccurrenceCoordinate",
    "nodes",
    "theorems",
  ]);
  if (item.schema !== PORTABLE_STRUCTURAL_DERIVATION_WITH_THEOREMS_SCHEMA) {
    fail("unsupported-schema");
  }
  if (item.mtsSemanticBase !== PORTABLE_MTS_SEMANTIC_BASE) {
    fail("unsupported-semantic-base");
  }
  if (!Array.isArray(item.theorems)) fail("invalid-envelope");
  return Object.freeze({
    schema: PORTABLE_STRUCTURAL_DERIVATION_WITH_THEOREMS_SCHEMA,
    mtsSemanticBase: PORTABLE_MTS_SEMANTIC_BASE,
    topology: parseTopology(item.topology),
    theoryCoordinate: coordinate(item.theoryCoordinate),
    targetOccurrenceCoordinate: coordinate(item.targetOccurrenceCoordinate),
    nodes: parseNodes(item.nodes),
    theorems: Object.freeze(item.theorems.map(parseTheorem)),
  });
}

class ReplaySupportView implements EnumerableReadMemory {
  readonly root: LinkHandle;
  private readonly ordered: readonly LinkHandle[];

  constructor(
    private readonly source: ReadMemory,
    private readonly support: ReadonlySet<LinkHandle>,
  ) {
    this.root = source.root;
    this.ordered = Object.freeze([...support]);
  }

  get linkCount(): number {
    return this.ordered.length;
  }

  private require(link: LinkHandle): void {
    if (!this.support.has(link)) throw new MemoryError("Link is outside theorem replay support");
  }

  poles(link: LinkHandle): LinkPoles {
    this.require(link);
    const poles = this.source.poles(link);
    if (!this.support.has(poles.start) || !this.support.has(poles.end)) {
      throw new MemoryError("theorem replay support is not pole-closed");
    }
    return poles;
  }

  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    this.require(start);
    this.require(end);
    const found = this.source.find(start, end);
    return found !== undefined && this.support.has(found) ? found : undefined;
  }

  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.require(start);
    return Object.freeze(this.source.outgoing(start).filter((link) => this.support.has(link)));
  }

  incoming(end: LinkHandle): readonly LinkHandle[] {
    this.require(end);
    return Object.freeze(this.source.incoming(end).filter((link) => this.support.has(link)));
  }

  allLinks(): readonly LinkHandle[] {
    return this.ordered;
  }
}

function includePoleClosure(
  memory: ReadMemory,
  support: Set<LinkHandle>,
  roots: readonly LinkHandle[],
): void {
  const pending = [...roots];
  while (pending.length > 0) {
    const link = pending.pop();
    if (link === undefined || support.has(link)) continue;
    const poles = memory.poles(link);
    support.add(link);
    pending.push(poles.start, poles.end);
  }
}

function exportWithTheoremsSupport(
  memory: ReadMemory,
  evidence: StructuralDerivationWithTheoremsEvidence,
) {
  const before = memory.linkCount;
  try {
    const support = new Set<LinkHandle>();
    const addDerivation = (derivation: StructuralDerivationEvidence): void => {
      const exported = exportStructuralDerivationSupportTopology(memory, derivation);
      for (const link of exported.links) support.add(link);
    };
    addDerivation(evidence.derivation);
    for (const theorem of evidence.theorems) {
      addDerivation(theorem.proof);
      includePoleClosure(memory, support, [theorem.theorem]);
    }
    includePoleClosure(memory, support, [memory.root]);
    const canonical = exportCanonicalTopology(new ReplaySupportView(memory, support));
    if (memory.linkCount !== before) fail("invalid-envelope");
    return canonical;
  } catch (error) {
    if (error instanceof PortableStructuralDerivationError) throw error;
    if (
      error instanceof StructuralDerivationSupportTopologyError ||
      error instanceof CanonicalTopologyError ||
      error instanceof MemoryError
    ) {
      fail("invalid-topology");
    }
    throw error;
  } finally {
    if (memory.linkCount !== before) fail("invalid-envelope");
  }
}

function encodeDerivation(
  coordinates: ReadonlyMap<LinkHandle, number>,
  evidence: StructuralDerivationEvidence,
): PortableStructuralDerivationCoordinates {
  return Object.freeze({
    theoryCoordinate: sourceCoordinate(coordinates, evidence.theory),
    targetOccurrenceCoordinate: sourceCoordinate(coordinates, evidence.targetOccurrence),
    nodes: encodeNodes(coordinates, evidence),
  });
}
export function exportPortableStructuralDerivationWithTheorems(
  memory: ReadMemory,
  evidence: StructuralDerivationWithTheoremsEvidence,
): PortableStructuralDerivationWithTheoremsArtifact {
  const before = memory.linkCount;
  const support = exportWithTheoremsSupport(memory, evidence);
  const derivation = encodeDerivation(support.coordinates, evidence.derivation);
  const theorems = evidence.theorems.map((theorem) => Object.freeze({
    theoremCoordinate: sourceCoordinate(support.coordinates, theorem.theorem),
    proof: encodeDerivation(support.coordinates, theorem.proof),
  }));
  if (memory.linkCount !== before) fail("invalid-envelope");
  return Object.freeze({
    schema: PORTABLE_STRUCTURAL_DERIVATION_WITH_THEOREMS_SCHEMA,
    mtsSemanticBase: PORTABLE_MTS_SEMANTIC_BASE,
    topology: support.topology,
    ...derivation,
    theorems: Object.freeze(theorems),
  });
}

function reconstructTheorem(
  artifact: PortableStructuralTheoremEvidenceCoordinates,
  refs: ReadonlyMap<number, LinkHandle>,
): StructuralTheoremEvidence {
  return Object.freeze({
    theorem: freshHandle(refs, artifact.theoremCoordinate),
    proof: reconstructEvidence(artifact.proof, refs),
  });
}

export function replayPortableStructuralDerivationWithTheorems(
  input: unknown,
): PortableStructuralDerivationWithTheoremsReplayResult {
  const artifact = parseArtifactWithTheorems(input);
  const restored = restoreCanonicalTopology(artifact.topology);
  const evidence: StructuralDerivationWithTheoremsEvidence = Object.freeze({
    derivation: reconstructEvidence(artifact, restored.refs),
    theorems: Object.freeze(artifact.theorems.map((theorem) => reconstructTheorem(theorem, restored.refs))),
  });
  const beforeReplay = restored.memory.linkCount;
  const replay = replayStructuralDerivationWithTheorems(restored.memory, evidence);
  if (restored.memory.linkCount !== beforeReplay) fail("invalid-envelope");
  const support = exportWithTheoremsSupport(restored.memory, evidence);
  if (!sameTopology(support.topology, artifact.topology)) {
    fail("noncanonical-support-topology");
  }
  if (restored.memory.linkCount !== beforeReplay) fail("invalid-envelope");
  return Object.freeze({ memory: restored.memory, evidence, replay });
}

export function canonicalPortableStructuralDerivationWithTheoremsV01Json(
  input: unknown,
): string {
  return JSON.stringify(parseArtifactWithTheorems(input));
}

function schemaOf(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }
  return (input as Record<string, unknown>).schema;
}

/** Single fail-closed portable proof replay boundary. */
export function replayPortableStructuralProof(
  input: unknown,
): PortableStructuralProofReplayResult {
  const schema = schemaOf(input);
  if (schema === PORTABLE_STRUCTURAL_DERIVATION_WITH_THEOREMS_SCHEMA) {
    return replayPortableStructuralDerivationWithTheorems(input);
  }
  if (schema === PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_SCHEMA) {
    return replayPortableStructuralDerivationWithAssumptions(input);
  }
  return replayPortableStructuralDerivation(input);
}
