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
  replayPortableStructuralDerivation,
  replayPortableStructuralDerivationWithAssumptions,
  type PortableStructuralDerivationErrorCode,
  type PortableStructuralDerivationNode,
  type PortableStructuralDerivationReplayResult,
  type PortableStructuralDerivationWithAssumptionsReplayResult,
} from "./portable-derivation.js";
import {
  PersistenceTopologyError,
  STORAGE_TOPOLOGY_SCHEMA,
  restoreTopology,
  type StorageTopologyImage,
} from "./persistence-topology.js";
import {
  StructuralDerivationSupportTopologyError,
  exportStructuralDerivationSupportTopology,
} from "./proof-support-topology.js";

export const PORTABLE_STRUCTURAL_DERIVATION_WITH_THEOREMS_SCHEMA =
  "mts-portable-structural-derivation-with-theorems/v0.1" as const;

interface PortableStructuralDerivationCoordinates {
  readonly theoryCoordinate: number;
  readonly targetOccurrenceCoordinate: number;
  readonly nodes: readonly PortableStructuralDerivationNode[];
}

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
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
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

function parseInterpreter(value: unknown) {
  const item = exactRecord(value, ["dictionary", "grammar", "theory"]);
  return Object.freeze({
    dictionary: coordinate(item.dictionary),
    grammar: coordinate(item.grammar),
    theory: coordinate(item.theory),
  });
}

function parseApplication(value: unknown) {
  const item = exactRecord(value, [
    "act",
    "rule",
    "ruleAdmission",
    "claimedBody",
    "expectedInterpreter",
    "expectedAfterContext",
  ]);
  return Object.freeze({
    act: coordinate(item.act),
    rule: coordinate(item.rule),
    ruleAdmission: coordinate(item.ruleAdmission),
    claimedBody: coordinate(item.claimedBody),
    expectedInterpreter: parseInterpreter(item.expectedInterpreter),
    expectedAfterContext: coordinate(item.expectedAfterContext),
  });
}

function parseJudgment(value: unknown) {
  const item = exactRecord(value, ["application", "judgment"]);
  const judgment = exactRecord(item.judgment, ["theory", "context", "claim"]);
  return Object.freeze({
    application: parseApplication(item.application),
    judgment: Object.freeze({
      theory: coordinate(judgment.theory),
      context: coordinate(judgment.context),
      claim: coordinate(judgment.claim),
    }),
  });
}

function parseNode(value: unknown): PortableStructuralDerivationNode {
  const item = exactRecord(value, [
    "occurrence",
    "judgment",
    "derivationRule",
    "derivationRuleAdmission",
    "premiseOccurrenceSequence",
  ]);
  return Object.freeze({
    occurrence: coordinate(item.occurrence),
    judgment: parseJudgment(item.judgment),
    derivationRule: coordinate(item.derivationRule),
    derivationRuleAdmission: coordinate(item.derivationRuleAdmission),
    premiseOccurrenceSequence: coordinate(item.premiseOccurrenceSequence),
  });
}

function parseNodes(value: unknown): readonly PortableStructuralDerivationNode[] {
  if (!Array.isArray(value)) fail("invalid-envelope");
  const nodes = value.map(parseNode);
  for (let index = 1; index < nodes.length; index += 1) {
    if (nodes[index - 1]!.occurrence >= nodes[index]!.occurrence) {
      fail("noncanonical-node-order");
    }
  }
  return Object.freeze(nodes);
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

function sourceCoordinate(
  coordinates: ReadonlyMap<LinkHandle, number>,
  handle: LinkHandle,
): number {
  const found = coordinates.get(handle);
  if (found === undefined) fail("invalid-coordinate");
  return found;
}

function encodeNode(
  coordinates: ReadonlyMap<LinkHandle, number>,
  node: StructuralDerivationEvidence["nodes"][number],
): PortableStructuralDerivationNode {
  const c = (handle: LinkHandle): number => sourceCoordinate(coordinates, handle);
  return Object.freeze({
    occurrence: c(node.occurrence),
    judgment: Object.freeze({
      application: Object.freeze({
        act: c(node.judgment.application.act),
        rule: c(node.judgment.application.rule),
        ruleAdmission: c(node.judgment.application.ruleAdmission),
        claimedBody: c(node.judgment.application.claimedBody),
        expectedInterpreter: Object.freeze({
          dictionary: c(node.judgment.application.expectedInterpreter.dictionary),
          grammar: c(node.judgment.application.expectedInterpreter.grammar),
          theory: c(node.judgment.application.expectedInterpreter.theory),
        }),
        expectedAfterContext: c(node.judgment.application.expectedAfterContext),
      }),
      judgment: Object.freeze({
        theory: c(node.judgment.judgment.theory),
        context: c(node.judgment.judgment.context),
        claim: c(node.judgment.judgment.claim),
      }),
    }),
    derivationRule: c(node.derivationRule),
    derivationRuleAdmission: c(node.derivationRuleAdmission),
    premiseOccurrenceSequence: c(node.premiseOccurrenceSequence),
  });
}

function encodeDerivation(
  coordinates: ReadonlyMap<LinkHandle, number>,
  evidence: StructuralDerivationEvidence,
): PortableStructuralDerivationCoordinates {
  const c = (handle: LinkHandle): number => sourceCoordinate(coordinates, handle);
  const nodes = evidence.nodes
    .map((node) => encodeNode(coordinates, node))
    .sort((left, right) => left.occurrence - right.occurrence);
  for (let index = 1; index < nodes.length; index += 1) {
    if (nodes[index - 1]!.occurrence === nodes[index]!.occurrence) {
      fail("noncanonical-node-order");
    }
  }
  return Object.freeze({
    theoryCoordinate: c(evidence.theory),
    targetOccurrenceCoordinate: c(evidence.targetOccurrence),
    nodes: Object.freeze(nodes),
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

function sameTopology(left: StorageTopologyImage, right: StorageTopologyImage): boolean {
  return left.schema === right.schema &&
    left.root === right.root &&
    left.links.length === right.links.length &&
    left.links.every((pair, index) => {
      const other = right.links[index];
      return other !== undefined && pair[0] === other[0] && pair[1] === other[1];
    });
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

function freshHandle(refs: ReadonlyMap<number, LinkHandle>, local: number): LinkHandle {
  const handle = refs.get(local);
  if (handle === undefined) fail("invalid-coordinate");
  return handle;
}

function reconstructDerivation(
  artifact: PortableStructuralDerivationCoordinates,
  refs: ReadonlyMap<number, LinkHandle>,
): StructuralDerivationEvidence {
  const h = (local: number): LinkHandle => freshHandle(refs, local);
  return Object.freeze({
    theory: h(artifact.theoryCoordinate),
    targetOccurrence: h(artifact.targetOccurrenceCoordinate),
    nodes: Object.freeze(artifact.nodes.map((node) => Object.freeze({
      occurrence: h(node.occurrence),
      judgment: Object.freeze({
        application: Object.freeze({
          act: h(node.judgment.application.act),
          rule: h(node.judgment.application.rule),
          ruleAdmission: h(node.judgment.application.ruleAdmission),
          claimedBody: h(node.judgment.application.claimedBody),
          expectedInterpreter: Object.freeze({
            dictionary: h(node.judgment.application.expectedInterpreter.dictionary),
            grammar: h(node.judgment.application.expectedInterpreter.grammar),
            theory: h(node.judgment.application.expectedInterpreter.theory),
          }),
          expectedAfterContext: h(node.judgment.application.expectedAfterContext),
        }),
        judgment: Object.freeze({
          theory: h(node.judgment.judgment.theory),
          context: h(node.judgment.judgment.context),
          claim: h(node.judgment.judgment.claim),
        }),
      }),
      derivationRule: h(node.derivationRule),
      derivationRuleAdmission: h(node.derivationRuleAdmission),
      premiseOccurrenceSequence: h(node.premiseOccurrenceSequence),
    }))),
  });
}

function reconstructTheorem(
  artifact: PortableStructuralTheoremEvidenceCoordinates,
  refs: ReadonlyMap<number, LinkHandle>,
): StructuralTheoremEvidence {
  return Object.freeze({
    theorem: freshHandle(refs, artifact.theoremCoordinate),
    proof: reconstructDerivation(artifact.proof, refs),
  });
}

export function replayPortableStructuralDerivationWithTheorems(
  input: unknown,
): PortableStructuralDerivationWithTheoremsReplayResult {
  const artifact = parseArtifactWithTheorems(input);
  const restored = restoreCanonicalTopology(artifact.topology);
  const evidence: StructuralDerivationWithTheoremsEvidence = Object.freeze({
    derivation: reconstructDerivation(artifact, restored.refs),
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
