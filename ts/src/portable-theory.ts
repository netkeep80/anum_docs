import {
  CanonicalTopologyError,
  exportCanonicalTopology,
} from "./canonical-topology.js";
import {
  Memory,
  MemoryError,
  type EnumerableReadMemory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "./memory.js";
import {
  PersistenceTopologyError,
  STORAGE_TOPOLOGY_SCHEMA,
  restoreTopology,
  type StorageTopologyImage,
} from "./persistence-topology.js";
import { PORTABLE_MTS_SEMANTIC_BASE } from "./portable-derivation.js";
import { replayPortableStructuralProof } from "./portable-proof-replay.js";
import {
  PORTABLE_STRUCTURAL_THEORY_REVISION_SCHEME,
  computePortableStructuralTheoryRevision,
  type PortableStructuralTheoryRevision,
} from "./portable-theory-digest.js";

export const PORTABLE_STRUCTURAL_THEORY_SCHEMA =
  "mts-portable-structural-theory/v0.1" as const;

export interface PortableStructuralTheoryArtifact {
  readonly schema: typeof PORTABLE_STRUCTURAL_THEORY_SCHEMA;
  readonly mtsSemanticBase: typeof PORTABLE_MTS_SEMANTIC_BASE;
  readonly topology: StorageTopologyImage;
  readonly theoryCoordinate: number;
}

export interface PortableStructuralTheoryReplayResult {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly artifact: PortableStructuralTheoryArtifact;
}

export type PortableStructuralTheoryErrorCode =
  | "invalid-envelope"
  | "unsupported-schema"
  | "unsupported-semantic-base"
  | "invalid-topology"
  | "noncanonical-topology"
  | "invalid-coordinate"
  | "invalid-revision"
  | "theory-revision-mismatch"
  | "proof-theory-mismatch";

export class PortableStructuralTheoryError extends Error {
  override readonly name = "PortableStructuralTheoryError";

  constructor(readonly code: PortableStructuralTheoryErrorCode) {
    super(code);
  }
}

function fail(code: PortableStructuralTheoryErrorCode): never {
  throw new PortableStructuralTheoryError(code);
}

class TheoryAuthorityView implements EnumerableReadMemory {
  readonly root: LinkHandle;
  private readonly support: ReadonlySet<LinkHandle>;
  private readonly ordered: readonly LinkHandle[];

  constructor(
    private readonly source: ReadMemory,
    links: ReadonlySet<LinkHandle>,
  ) {
    this.root = source.root;
    this.support = links;
    this.ordered = Object.freeze([...links]);
  }

  get linkCount(): number {
    return this.ordered.length;
  }

  private require(link: LinkHandle): void {
    if (!this.support.has(link)) throw new MemoryError("Link is outside Theory authority support");
  }

  poles(link: LinkHandle): LinkPoles {
    this.require(link);
    const poles = this.source.poles(link);
    if (!this.support.has(poles.start) || !this.support.has(poles.end)) {
      throw new MemoryError("Theory authority support is not pole-closed");
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

function projected(
  memory: ReadMemory,
  roots: readonly LinkHandle[],
): { readonly topology: StorageTopologyImage; readonly coordinates: ReadonlyMap<LinkHandle, number> } {
  const support = new Set<LinkHandle>();
  includePoleClosure(memory, support, [memory.root, ...roots]);
  return exportCanonicalTopology(new TheoryAuthorityView(memory, support));
}

function linkFingerprint(memory: ReadMemory, link: LinkHandle): string {
  const canonical = projected(memory, [link]);
  const coordinate = canonical.coordinates.get(link);
  if (coordinate === undefined) fail("invalid-coordinate");
  return JSON.stringify({ topology: canonical.topology, coordinate });
}

export function exportPortableStructuralTheory(
  memory: ReadMemory,
  theory: LinkHandle,
): PortableStructuralTheoryArtifact {
  const before = memory.linkCount;
  try {
    const canonical = projected(memory, [theory, ...memory.outgoing(theory)]);
    const theoryCoordinate = canonical.coordinates.get(theory);
    if (theoryCoordinate === undefined) fail("invalid-coordinate");
    if (memory.linkCount !== before) fail("invalid-topology");
    return Object.freeze({
      schema: PORTABLE_STRUCTURAL_THEORY_SCHEMA,
      mtsSemanticBase: PORTABLE_MTS_SEMANTIC_BASE,
      topology: canonical.topology,
      theoryCoordinate,
    });
  } catch (error) {
    if (error instanceof PortableStructuralTheoryError) throw error;
    if (error instanceof MemoryError || error instanceof CanonicalTopologyError) {
      fail("invalid-topology");
    }
    throw error;
  } finally {
    if (memory.linkCount !== before) fail("invalid-topology");
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("invalid-envelope");
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail("invalid-envelope");
  }
}

function coordinate(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) fail("invalid-coordinate");
  return value;
}

function parseTopology(value: unknown): StorageTopologyImage {
  const item = record(value);
  exactKeys(item, ["schema", "root", "links"]);
  if (item.schema !== STORAGE_TOPOLOGY_SCHEMA) fail("invalid-topology");
  const root = coordinate(item.root);
  if (!Array.isArray(item.links) || item.links.length === 0) fail("invalid-topology");
  const links = item.links.map((raw) => {
    if (!Array.isArray(raw) || raw.length !== 2) fail("invalid-topology");
    return Object.freeze([coordinate(raw[0]), coordinate(raw[1])] as const);
  });
  return Object.freeze({ schema: STORAGE_TOPOLOGY_SCHEMA, root, links: Object.freeze(links) });
}

function parseArtifact(input: unknown): PortableStructuralTheoryArtifact {
  const item = record(input);
  if (item.schema !== PORTABLE_STRUCTURAL_THEORY_SCHEMA) fail("unsupported-schema");
  if (item.mtsSemanticBase !== PORTABLE_MTS_SEMANTIC_BASE) fail("unsupported-semantic-base");
  exactKeys(item, ["schema", "mtsSemanticBase", "topology", "theoryCoordinate"]);
  return Object.freeze({
    schema: PORTABLE_STRUCTURAL_THEORY_SCHEMA,
    mtsSemanticBase: PORTABLE_MTS_SEMANTIC_BASE,
    topology: parseTopology(item.topology),
    theoryCoordinate: coordinate(item.theoryCoordinate),
  });
}

export function replayPortableStructuralTheory(input: unknown): PortableStructuralTheoryReplayResult {
  const artifact = parseArtifact(input);
  let memory: Memory;
  try {
    memory = restoreTopology(artifact.topology);
  } catch (error) {
    if (error instanceof PersistenceTopologyError) fail("noncanonical-topology");
    throw error;
  }
  const theory = memory.allLinks()[artifact.theoryCoordinate];
  if (theory === undefined) fail("invalid-coordinate");

  let canonical: PortableStructuralTheoryArtifact;
  try {
    canonical = exportPortableStructuralTheory(memory, theory);
  } catch (error) {
    if (error instanceof PortableStructuralTheoryError) fail("noncanonical-topology");
    throw error;
  }
  if (JSON.stringify(canonical) !== JSON.stringify(artifact)) fail("noncanonical-topology");
  return Object.freeze({ memory, theory, artifact });
}

function parseRevision(input: unknown): PortableStructuralTheoryRevision {
  if (typeof input !== "object" || input === null || Array.isArray(input)) fail("invalid-revision");
  const item = input as Record<string, unknown>;
  const keys = Object.keys(item).sort();
  if (keys.length !== 2 || keys[0] !== "scheme" || keys[1] !== "value") fail("invalid-revision");
  if (
    item.scheme !== PORTABLE_STRUCTURAL_THEORY_REVISION_SCHEME ||
    typeof item.value !== "string" ||
    !/^[0-9a-f]{64}$/.test(item.value)
  ) fail("invalid-revision");
  return Object.freeze({ scheme: PORTABLE_STRUCTURAL_THEORY_REVISION_SCHEME, value: item.value });
}

export async function verifyPortableStructuralProofTheoryRevision(
  proofArtifact: unknown,
  expectedTheoryArtifact: unknown,
  expectedRevisionInput: unknown,
): Promise<void> {
  const expected = replayPortableStructuralTheory(expectedTheoryArtifact);
  const expectedRevision = parseRevision(expectedRevisionInput);
  const actualRevision = await computePortableStructuralTheoryRevision(expected.artifact);
  if (actualRevision.value !== expectedRevision.value) fail("theory-revision-mismatch");

  // Ordinary proof replay remains the proof-truth authority. This operation only
  // adds the external Theory-selection boundary required by a trusted consumer.
  const proof = replayPortableStructuralProof(proofArtifact);
  const proofTheory = "theory" in proof.evidence
    ? proof.evidence.theory
    : proof.evidence.derivation.theory;
  if (linkFingerprint(proof.memory, proofTheory) !== linkFingerprint(expected.memory, expected.theory)) {
    fail("proof-theory-mismatch");
  }

  const admitted = new Set(
    expected.memory.outgoing(expected.theory).map((link) => linkFingerprint(expected.memory, link)),
  );
  for (const used of proof.memory.outgoing(proofTheory)) {
    if (!admitted.has(linkFingerprint(proof.memory, used))) fail("proof-theory-mismatch");
  }
}
