import {
  CanonicalTopologyError,
  exportCanonicalTopology,
} from "./canonical-topology.js";
import {
  replayStructuralDerivation,
  type StructuralDerivationEvidence,
  type StructuralDerivationReplayResult,
} from "./derivation.js";
import {
  Memory,
  type LinkHandle,
  type ReadMemory,
} from "./memory.js";
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

const PORTABLE_STRUCTURAL_DERIVATION_SCHEMA_V0_1 =
  "mts-portable-structural-derivation/v0.1" as const;
export const PORTABLE_STRUCTURAL_DERIVATION_SCHEMA =
  "mts-portable-structural-derivation/v0.2" as const;
export const PORTABLE_MTS_SEMANTIC_BASE = "mts-contract/v0.11" as const;

type PortableStructuralDerivationSchema =
  | typeof PORTABLE_STRUCTURAL_DERIVATION_SCHEMA_V0_1
  | typeof PORTABLE_STRUCTURAL_DERIVATION_SCHEMA;

export interface PortableStructuralInterpreterCoordinates {
  readonly dictionary: number;
  readonly grammar: number;
  readonly theory: number;
}

export interface PortableStructuralRuleApplicationCoordinates {
  readonly act: number;
  readonly rule: number;
  readonly ruleAdmission: number;
  readonly claimedBody: number;
  readonly expectedInterpreter: PortableStructuralInterpreterCoordinates;
  readonly expectedAfterContext: number;
}

export interface PortableStructuralJudgmentCoordinates {
  readonly theory: number;
  readonly context: number;
  readonly claim: number;
}

export interface PortableStructuralJudgmentEvidence {
  readonly application: PortableStructuralRuleApplicationCoordinates;
  readonly judgment: PortableStructuralJudgmentCoordinates;
}

export interface PortableStructuralDerivationNode {
  readonly occurrence: number;
  readonly judgment: PortableStructuralJudgmentEvidence;
  readonly derivationRule: number;
  readonly derivationRuleAdmission: number;
  readonly premiseOccurrenceSequence: number;
}

export interface PortableStructuralDerivationArtifact {
  readonly schema: typeof PORTABLE_STRUCTURAL_DERIVATION_SCHEMA;
  readonly mtsSemanticBase: typeof PORTABLE_MTS_SEMANTIC_BASE;
  readonly topology: StorageTopologyImage;
  readonly theoryCoordinate: number;
  readonly targetOccurrenceCoordinate: number;
  readonly nodes: readonly PortableStructuralDerivationNode[];
}

interface ParsedPortableStructuralDerivationArtifact {
  readonly schema: PortableStructuralDerivationSchema;
  readonly mtsSemanticBase: typeof PORTABLE_MTS_SEMANTIC_BASE;
  readonly topology: StorageTopologyImage;
  readonly theoryCoordinate: number;
  readonly targetOccurrenceCoordinate: number;
  readonly nodes: readonly PortableStructuralDerivationNode[];
}

export type PortableStructuralDerivationErrorCode =
  | "invalid-envelope"
  | "unsupported-schema"
  | "unsupported-semantic-base"
  | "invalid-topology"
  | "noncanonical-topology"
  | "noncanonical-support-topology"
  | "invalid-coordinate"
  | "noncanonical-node-order";

export class PortableStructuralDerivationError extends Error {
  override readonly name = "PortableStructuralDerivationError";

  constructor(readonly code: PortableStructuralDerivationErrorCode) {
    super(code);
  }
}

export interface PortableStructuralDerivationReplayResult {
  readonly memory: Memory;
  readonly evidence: StructuralDerivationEvidence;
  readonly replay: StructuralDerivationReplayResult;
}

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
  const links = image.links.map((value) => {
    if (!Array.isArray(value) || value.length !== 2) fail("invalid-topology");
    return Object.freeze([coordinate(value[0]), coordinate(value[1])] as const);
  });
  return Object.freeze({
    schema: STORAGE_TOPOLOGY_SCHEMA,
    root,
    links: Object.freeze(links),
  });
}

function parseInterpreter(value: unknown): PortableStructuralInterpreterCoordinates {
  const item = exactRecord(value, ["dictionary", "grammar", "theory"]);
  return Object.freeze({
    dictionary: coordinate(item.dictionary),
    grammar: coordinate(item.grammar),
    theory: coordinate(item.theory),
  });
}

function parseApplication(value: unknown): PortableStructuralRuleApplicationCoordinates {
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

function parseJudgmentCoordinates(value: unknown): PortableStructuralJudgmentCoordinates {
  const item = exactRecord(value, ["theory", "context", "claim"]);
  return Object.freeze({
    theory: coordinate(item.theory),
    context: coordinate(item.context),
    claim: coordinate(item.claim),
  });
}

function parseJudgment(value: unknown): PortableStructuralJudgmentEvidence {
  const item = exactRecord(value, ["application", "judgment"]);
  return Object.freeze({
    application: parseApplication(item.application),
    judgment: parseJudgmentCoordinates(item.judgment),
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

function parseArtifact(input: unknown): ParsedPortableStructuralDerivationArtifact {
  const item = exactRecord(input, [
    "schema",
    "mtsSemanticBase",
    "topology",
    "theoryCoordinate",
    "targetOccurrenceCoordinate",
    "nodes",
  ]);
  let schema: PortableStructuralDerivationSchema;
  if (item.schema === PORTABLE_STRUCTURAL_DERIVATION_SCHEMA_V0_1) {
    schema = PORTABLE_STRUCTURAL_DERIVATION_SCHEMA_V0_1;
  } else if (item.schema === PORTABLE_STRUCTURAL_DERIVATION_SCHEMA) {
    schema = PORTABLE_STRUCTURAL_DERIVATION_SCHEMA;
  } else {
    fail("unsupported-schema");
  }
  if (item.mtsSemanticBase !== PORTABLE_MTS_SEMANTIC_BASE) {
    fail("unsupported-semantic-base");
  }
  if (!Array.isArray(item.nodes)) fail("invalid-envelope");
  const nodes = item.nodes.map(parseNode);
  for (let index = 1; index < nodes.length; index += 1) {
    if (nodes[index - 1]!.occurrence >= nodes[index]!.occurrence) {
      fail("noncanonical-node-order");
    }
  }
  return Object.freeze({
    schema,
    mtsSemanticBase: PORTABLE_MTS_SEMANTIC_BASE,
    topology: parseTopology(item.topology),
    theoryCoordinate: coordinate(item.theoryCoordinate),
    targetOccurrenceCoordinate: coordinate(item.targetOccurrenceCoordinate),
    nodes: Object.freeze(nodes),
  });
}

function sameTopology(left: StorageTopologyImage, right: StorageTopologyImage): boolean {
  if (
    left.schema !== right.schema ||
    left.root !== right.root ||
    left.links.length !== right.links.length
  ) {
    return false;
  }
  return left.links.every((pair, index) => {
    const other = right.links[index];
    return other !== undefined && pair[0] === other[0] && pair[1] === other[1];
  });
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

export function exportPortableStructuralDerivation(
  memory: ReadMemory,
  evidence: StructuralDerivationEvidence,
): PortableStructuralDerivationArtifact {
  const before = memory.linkCount;
  try {
    const support = exportStructuralDerivationSupportTopology(memory, evidence);
    const c = (handle: LinkHandle): number => sourceCoordinate(support.coordinates, handle);
    const nodes = evidence.nodes
      .map((node) => encodeNode(support.coordinates, node))
      .sort((left, right) => left.occurrence - right.occurrence);
    for (let index = 1; index < nodes.length; index += 1) {
      if (nodes[index - 1]!.occurrence === nodes[index]!.occurrence) {
        fail("noncanonical-node-order");
      }
    }
    if (memory.linkCount !== before) fail("invalid-envelope");
    return Object.freeze({
      schema: PORTABLE_STRUCTURAL_DERIVATION_SCHEMA,
      mtsSemanticBase: PORTABLE_MTS_SEMANTIC_BASE,
      topology: support.topology,
      theoryCoordinate: c(evidence.theory),
      targetOccurrenceCoordinate: c(evidence.targetOccurrence),
      nodes: Object.freeze(nodes),
    });
  } catch (error) {
    if (error instanceof PortableStructuralDerivationError) throw error;
    if (error instanceof StructuralDerivationSupportTopologyError) fail("invalid-topology");
    throw error;
  } finally {
    if (memory.linkCount !== before) fail("invalid-envelope");
  }
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

function reconstructEvidence(
  artifact: ParsedPortableStructuralDerivationArtifact,
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

function verifyCurrentSupportTopology(
  memory: Memory,
  evidence: StructuralDerivationEvidence,
  supplied: StorageTopologyImage,
): void {
  let support;
  try {
    support = exportStructuralDerivationSupportTopology(memory, evidence);
  } catch (error) {
    if (error instanceof StructuralDerivationSupportTopologyError) fail("invalid-topology");
    throw error;
  }
  if (!sameTopology(support.topology, supplied)) {
    fail("noncanonical-support-topology");
  }
}

export function replayPortableStructuralDerivation(
  input: unknown,
): PortableStructuralDerivationReplayResult {
  const artifact = parseArtifact(input);
  const restored = restoreCanonicalTopology(artifact.topology);
  const evidence = reconstructEvidence(artifact, restored.refs);

  const beforeReplay = restored.memory.linkCount;
  const replay = replayStructuralDerivation(restored.memory, evidence);
  if (restored.memory.linkCount !== beforeReplay) fail("invalid-envelope");

  // Transport canonicality never establishes proof truth. Generic replay runs
  // first; this v0.2-only gate can only reject an otherwise valid proof whose
  // canonical topology contains replay-irrelevant ambient baggage.
  if (artifact.schema === PORTABLE_STRUCTURAL_DERIVATION_SCHEMA) {
    verifyCurrentSupportTopology(restored.memory, evidence, artifact.topology);
  }
  if (restored.memory.linkCount !== beforeReplay) fail("invalid-envelope");

  return Object.freeze({
    memory: restored.memory,
    evidence,
    replay,
  });
}
