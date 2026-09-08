import {
  CanonicalTopologyError,
  exportCanonicalTopology,
} from "./canonical-topology.js";
import {
  Memory,
  type LinkHandle,
  type ReadMemory,
} from "./memory.js";
import {
  PORTABLE_MTS_SEMANTIC_BASE,
} from "./portable-derivation.js";
import {
  PersistenceTopologyError,
  STORAGE_TOPOLOGY_SCHEMA,
  restoreTopology,
  type StorageTopologyImage,
} from "./persistence-topology.js";
import {
  replayProofSubAnetProjection,
  type ProofSubAnetProjectionEvidence,
  type ProofSubAnetProjectionReplayResult,
} from "./proof-subanet-projection.js";
import {
  ReplaySupportTopologyError,
  exportObservedReplaySupportTopology,
  type ObservedReplaySupportTopology,
} from "./replay-support-topology.js";

export const PORTABLE_PROOF_SUBANET_PROJECTION_SCHEMA =
  "mts-portable-proof-subanet-projection/v0.1" as const;

export interface PortableProofSubAnetProjectionArtifact {
  readonly schema: typeof PORTABLE_PROOF_SUBANET_PROJECTION_SCHEMA;
  readonly mtsSemanticBase: typeof PORTABLE_MTS_SEMANTIC_BASE;
  readonly topology: StorageTopologyImage;
  readonly theoryCoordinate: number;
  readonly schemaDerivationRuleCoordinate: number;
  readonly premiseProofOccurrenceCoordinate: number;
}

export type PortableProofSubAnetProjectionErrorCode =
  | "invalid-envelope"
  | "unsupported-schema"
  | "unsupported-semantic-base"
  | "invalid-topology"
  | "noncanonical-topology"
  | "invalid-coordinate"
  | "replay-wrote";

export class PortableProofSubAnetProjectionError extends Error {
  override readonly name = "PortableProofSubAnetProjectionError";

  constructor(readonly code: PortableProofSubAnetProjectionErrorCode) {
    super(code);
  }
}

export interface PortableProofSubAnetProjectionReplayResult {
  readonly memory: Memory;
  readonly evidence: ProofSubAnetProjectionEvidence;
  readonly replay: ProofSubAnetProjectionReplayResult;
  readonly artifact: PortableProofSubAnetProjectionArtifact;
}

function fail(code: PortableProofSubAnetProjectionErrorCode): never {
  throw new PortableProofSubAnetProjectionError(code);
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("invalid-envelope");
  }
  return value as Record<string, unknown>;
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const candidate = record(value);
  const actual = Object.keys(candidate).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    fail("invalid-envelope");
  }
  return candidate;
}

function coordinate(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail("invalid-coordinate");
  }
  return value;
}

function parseTopology(value: unknown): StorageTopologyImage {
  const image = exactRecord(value, ["schema", "root", "links"]);
  if (image.schema !== STORAGE_TOPOLOGY_SCHEMA) fail("invalid-topology");
  const root = coordinate(image.root);
  if (!Array.isArray(image.links) || image.links.length === 0) fail("invalid-topology");
  const links = image.links.map((item) => {
    if (!Array.isArray(item) || item.length !== 2) fail("invalid-topology");
    return Object.freeze([coordinate(item[0]), coordinate(item[1])] as const);
  });
  return Object.freeze({
    schema: STORAGE_TOPOLOGY_SCHEMA,
    root,
    links: Object.freeze(links),
  });
}

function parseArtifact(input: unknown): PortableProofSubAnetProjectionArtifact {
  const item = exactRecord(input, [
    "schema",
    "mtsSemanticBase",
    "topology",
    "theoryCoordinate",
    "schemaDerivationRuleCoordinate",
    "premiseProofOccurrenceCoordinate",
  ]);
  if (item.schema !== PORTABLE_PROOF_SUBANET_PROJECTION_SCHEMA) fail("unsupported-schema");
  if (item.mtsSemanticBase !== PORTABLE_MTS_SEMANTIC_BASE) fail("unsupported-semantic-base");
  return Object.freeze({
    schema: PORTABLE_PROOF_SUBANET_PROJECTION_SCHEMA,
    mtsSemanticBase: PORTABLE_MTS_SEMANTIC_BASE,
    topology: parseTopology(item.topology),
    theoryCoordinate: coordinate(item.theoryCoordinate),
    schemaDerivationRuleCoordinate: coordinate(item.schemaDerivationRuleCoordinate),
    premiseProofOccurrenceCoordinate: coordinate(item.premiseProofOccurrenceCoordinate),
  });
}

function sameTopology(left: StorageTopologyImage, right: StorageTopologyImage): boolean {
  return left.schema === right.schema
    && left.root === right.root
    && left.links.length === right.links.length
    && left.links.every((pair, index) => {
      const other = right.links[index];
      return other !== undefined && pair[0] === other[0] && pair[1] === other[1];
    });
}

function sameArtifact(
  left: PortableProofSubAnetProjectionArtifact,
  right: PortableProofSubAnetProjectionArtifact,
): boolean {
  return left.schema === right.schema
    && left.mtsSemanticBase === right.mtsSemanticBase
    && left.theoryCoordinate === right.theoryCoordinate
    && left.schemaDerivationRuleCoordinate === right.schemaDerivationRuleCoordinate
    && left.premiseProofOccurrenceCoordinate === right.premiseProofOccurrenceCoordinate
    && sameTopology(left.topology, right.topology);
}

function restoreCanonicalTopology(topology: StorageTopologyImage): {
  readonly memory: Memory;
  readonly refs: ReadonlyMap<number, LinkHandle>;
} {
  let memory: Memory;
  try {
    memory = restoreTopology(topology);
  } catch (error) {
    if (error instanceof PersistenceTopologyError) fail("invalid-topology");
    throw error;
  }

  let canonical;
  try {
    canonical = exportCanonicalTopology(memory);
  } catch (error) {
    if (error instanceof CanonicalTopologyError) fail("invalid-topology");
    throw error;
  }
  if (!sameTopology(canonical.topology, topology)) fail("noncanonical-topology");

  const refs = new Map<number, LinkHandle>();
  for (const [handle, local] of canonical.coordinates) {
    if (refs.has(local)) fail("invalid-topology");
    refs.set(local, handle);
  }
  if (refs.size !== topology.links.length) fail("invalid-topology");
  return Object.freeze({ memory, refs });
}

function handleAt(refs: ReadonlyMap<number, LinkHandle>, local: number): LinkHandle {
  const handle = refs.get(local);
  if (handle === undefined) fail("invalid-coordinate");
  return handle;
}

function coordinateOf(
  coordinates: ReadonlyMap<LinkHandle, number>,
  handle: LinkHandle,
): number {
  const local = coordinates.get(handle);
  if (local === undefined) fail("invalid-coordinate");
  return local;
}

function artifactFromSupport(
  support: ObservedReplaySupportTopology<ProofSubAnetProjectionReplayResult>,
  evidence: ProofSubAnetProjectionEvidence,
): PortableProofSubAnetProjectionArtifact {
  return Object.freeze({
    schema: PORTABLE_PROOF_SUBANET_PROJECTION_SCHEMA,
    mtsSemanticBase: PORTABLE_MTS_SEMANTIC_BASE,
    topology: support.topology,
    theoryCoordinate: coordinateOf(support.coordinates, evidence.theory),
    schemaDerivationRuleCoordinate: coordinateOf(
      support.coordinates,
      evidence.schemaDerivationRule,
    ),
    premiseProofOccurrenceCoordinate: coordinateOf(
      support.coordinates,
      evidence.premiseProofOccurrence,
    ),
  });
}

function exportWithReplay(
  memory: ReadMemory,
  evidence: ProofSubAnetProjectionEvidence,
): {
  readonly artifact: PortableProofSubAnetProjectionArtifact;
  readonly replay: ProofSubAnetProjectionReplayResult;
} {
  const before = memory.linkCount;
  try {
    const support = exportObservedReplaySupportTopology(memory, (observedMemory) =>
      replayProofSubAnetProjection(observedMemory, evidence));
    if (memory.linkCount !== before) fail("replay-wrote");
    return Object.freeze({
      artifact: artifactFromSupport(support, evidence),
      replay: support.replay,
    });
  } catch (error) {
    if (error instanceof ReplaySupportTopologyError) fail("invalid-topology");
    throw error;
  } finally {
    if (memory.linkCount !== before) fail("replay-wrote");
  }
}

/**
 * Transport-only export. The same trusted K1e replay is executed through a read
 * observer; no projected occurrence, rho, bindings, proof kind, or truth flag is
 * serialized into the portable artifact.
 */
export function exportPortableProofSubAnetProjection(
  memory: ReadMemory,
  evidence: ProofSubAnetProjectionEvidence,
): PortableProofSubAnetProjectionArtifact {
  return exportWithReplay(memory, evidence).artifact;
}

/**
 * Strictly parses a coordinate-bearing envelope, restores canonical MTS topology,
 * resolves local coordinates, and reruns the trusted K1/K1e proof law. The exact
 * projected occurrence is recomputed and is never accepted from host metadata.
 */
export function replayPortableProofSubAnetProjection(
  input: unknown,
): PortableProofSubAnetProjectionReplayResult {
  const artifact = parseArtifact(input);
  const restored = restoreCanonicalTopology(artifact.topology);
  const evidence: ProofSubAnetProjectionEvidence = Object.freeze({
    theory: handleAt(restored.refs, artifact.theoryCoordinate),
    schemaDerivationRule: handleAt(restored.refs, artifact.schemaDerivationRuleCoordinate),
    premiseProofOccurrence: handleAt(restored.refs, artifact.premiseProofOccurrenceCoordinate),
  });

  const before = restored.memory.linkCount;
  const exported = exportWithReplay(restored.memory, evidence);
  if (!sameArtifact(exported.artifact, artifact)) fail("noncanonical-topology");
  if (restored.memory.linkCount !== before) fail("replay-wrote");

  return Object.freeze({
    memory: restored.memory,
    evidence,
    replay: exported.replay,
    artifact,
  });
}

export function canonicalPortableProofSubAnetProjectionV01Json(input: unknown): string {
  return JSON.stringify(parseArtifact(input));
}
