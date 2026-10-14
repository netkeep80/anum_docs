/**
 * Experimental v0.15 transport only. Nothing in this module creates MTS
 * membership authority: source-backed replay is the sole promotion boundary.
 * Owner: anum_docs#2006; downstream consumer: amemory#455.
 */
import { createHash } from "node:crypto";
import { exportCanonicalTopology } from "./canonical-topology.js";
import {
  Memory,
  type EnumerableReadMemory,
  type LinkHandle,
  type RootBasis,
} from "./memory.js";
import {
  restoreTopology,
  type StorageTopologyImage,
} from "./persistence-topology.js";
import { compileV015DirectFormalSourceAnet } from "./v015-direct-formal-source.js";
import { compileV015DirectJsonSourceAnet } from "./v015-direct-json-source.js";
import {
  denoteV015ResolvedSourceAnet,
  type V015SourceAnetDenotation,
} from "./v015-source-anet.js";

export const V015_SNAPSHOT_SCHEMA = "mts-v015-semantic-anet-transport/v0.1" as const;
const COMPILER = "v015-direct-formal-json-source@813a1569300b241a3b70eb282eecd8231db15e4b";
const DENOTATION = "denoteV015ResolvedSourceAnet@813a1569300b241a3b70eb282eecd8231db15e4b";

export type V015SourceFormat = "formal" | "json";

export interface V015SourceInput {
  readonly format: V015SourceFormat;
  readonly path: string;
  readonly revision: string;
  readonly bytes: Uint8Array;
}

export interface V015SourceReceipt {
  readonly format: V015SourceFormat;
  readonly path: string;
  readonly revision: string;
  readonly bytesSha256: string;
  readonly nativeSourceSha256: string;
  readonly compiler: typeof COMPILER;
  readonly denotation: typeof DENOTATION;
}

export interface V015SemanticSnapshot {
  readonly schema: typeof V015_SNAPSHOT_SCHEMA;
  readonly topology: StorageTopologyImage;
  readonly members: readonly number[];
  readonly source: V015SourceReceipt;
  readonly contentSha256: string;
}

export class V015SnapshotError extends Error {
  override readonly name = "V015SnapshotError";
}

function fail(reason: string): never {
  throw new V015SnapshotError(reason);
}

function hash(text: string | Uint8Array): string {
  return createHash("sha256").update(text).digest("hex");
}

function object(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("invalid " + label);
  }
  const result = value as Record<string, unknown>;
  if (JSON.stringify(Object.keys(result).sort()) !== JSON.stringify([...keys].sort())) {
    fail("unexpected/missing " + label + " fields");
  }
  return result;
}

function digestPayload(
  schema: typeof V015_SNAPSHOT_SCHEMA,
  topology: StorageTopologyImage,
  members: readonly number[],
  source: V015SourceReceipt,
): string {
  return hash(JSON.stringify({ schema, topology, members, source }));
}

/**
 * Restrict the *physical* graph to its rooted dependency closure. Incidence
 * and other ambient physical Links never become semantic members.
 */
function rootedClosure(
  memory: EnumerableReadMemory,
  selected: readonly LinkHandle[],
): ReturnType<typeof exportCanonicalTopology> {
  const visited = new Set<LinkHandle>([memory.root]);
  const todo = [...selected];
  while (todo.length > 0) {
    const item = todo.pop()!;
    if (visited.has(item)) continue;
    const poles = memory.poles(item);
    if (poles.start === item && poles.end === item) fail("second root");
    visited.add(item);
    if (poles.start !== item) todo.push(poles.start);
    if (poles.end !== item) todo.push(poles.end);
  }
  const view: EnumerableReadMemory = {
    root: memory.root,
    get linkCount() { return visited.size; },
    allLinks: () => [...visited],
    poles: (link) => {
      if (!visited.has(link)) fail("out-of-closure poles");
      return memory.poles(link);
    },
    find: (start, end) => {
      if (!visited.has(start) || !visited.has(end)) fail("out-of-closure find");
      const link = memory.find(start, end);
      return link !== undefined && visited.has(link) ? link : undefined;
    },
    outgoing: (start) => {
      if (!visited.has(start)) fail("out-of-closure outgoing");
      return memory.outgoing(start).filter((link) => visited.has(link));
    },
    incoming: (end) => {
      if (!visited.has(end)) fail("out-of-closure incoming");
      return memory.incoming(end).filter((link) => visited.has(link));
    },
  };
  return exportCanonicalTopology(view);
}

function coordinate(map: ReadonlyMap<LinkHandle, number>, link: LinkHandle): number {
  const value = map.get(link);
  if (value === undefined) fail("missing closure coordinate");
  return value;
}

/**
 * Export a compiler-produced denotation. Caller-provided provenance and
 * denotation are UNTRUSTED until a separate independent replay passes.
 */
export function exportV015SemanticSnapshot(
  memory: EnumerableReadMemory,
  nativeSourceAnet: LinkHandle,
  denotation: V015SourceAnetDenotation,
  source: V015SourceInput,
): V015SemanticSnapshot {
  if (!source.path || !/^[a-f0-9]{40}$/.test(source.revision)) {
    fail("invalid source receipt");
  }
  const selected = [...denotation.members];
  if (new Set(selected).size !== selected.length) fail("duplicate input members");
  const physical = rootedClosure(memory, selected);
  const members = Object.freeze(selected
    .map((item) => coordinate(physical.coordinates, item))
    .sort((a, b) => a - b));
  const native = rootedClosure(memory, [nativeSourceAnet]);
  const nativeSourceSha256 = hash(JSON.stringify({
    topology: native.topology,
    root: coordinate(native.coordinates, nativeSourceAnet),
  }));
  const receipt: V015SourceReceipt = Object.freeze({
    format: source.format,
    path: source.path,
    revision: source.revision,
    bytesSha256: hash(source.bytes),
    nativeSourceSha256,
    compiler: COMPILER,
    denotation: DENOTATION,
  });
  const contentSha256 = digestPayload(V015_SNAPSHOT_SCHEMA, physical.topology, members, receipt);
  return Object.freeze({
    schema: V015_SNAPSHOT_SCHEMA,
    topology: physical.topology,
    members,
    source: receipt,
    contentSha256,
  });
}

function parse(input: unknown): V015SemanticSnapshot {
  const top = object(input, ["schema", "topology", "members", "source", "contentSha256"], "snapshot");
  if (top.schema !== V015_SNAPSHOT_SCHEMA) fail("unsupported snapshot version");
  const source = object(top.source,
    ["format", "path", "revision", "bytesSha256", "nativeSourceSha256", "compiler", "denotation"],
    "source receipt");
  if ((source.format !== "json" && source.format !== "formal") ||
      typeof source.path !== "string" || source.path.length === 0 ||
      typeof source.revision !== "string" || !/^[a-f0-9]{40}$/.test(source.revision) ||
      source.compiler !== COMPILER || source.denotation !== DENOTATION ||
      typeof source.bytesSha256 !== "string" || !/^[a-f0-9]{64}$/.test(source.bytesSha256) ||
      typeof source.nativeSourceSha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(source.nativeSourceSha256)) fail("invalid source receipt");
  if (!Array.isArray(top.members) ||
      !top.members.every((v: unknown, i: number) =>
        typeof v === "number" && Number.isSafeInteger(v) && v >= 0 &&
        (i === 0 || v > (top.members as number[])[i - 1]!))) {
    fail("invalid, unordered or duplicate positive membership");
  }
  const topo = object(top.topology, ["schema", "root", "links"], "topology");
  if (topo.schema !== "mts-storage-topology/v0.1") fail("invalid topology schema");
  if (typeof top.contentSha256 !== "string" || !/^[a-f0-9]{64}$/.test(top.contentSha256)) {
    fail("invalid transport digest");
  }
  const candidate = top as unknown as V015SemanticSnapshot;
  if (candidate.contentSha256 !==
      digestPayload(candidate.schema, candidate.topology, candidate.members, candidate.source)) {
    fail("transport digest mismatch");
  }
  return candidate;
}

export interface V015StructureVerified {
  readonly status: "STRUCTURE_VERIFIED";
  readonly memory: Memory;
  readonly members: ReadonlySet<LinkHandle>;
}

/** Structural validation does NOT validate provenance or semantic authority. */
export function restoreV015SemanticSnapshot(input: unknown): V015StructureVerified {
  const snapshot = parse(input);
  let memory: Memory;
  try {
    memory = restoreTopology(snapshot.topology);
  } catch {
    return fail("invalid physical topology or canonical identity");
  }
  const handles = memory.allLinks();
  const selected = snapshot.members.map((c) => {
    if (c >= handles.length) fail("nonexistent semantic member");
    return handles[c]!;
  });
  const projected = rootedClosure(memory, selected);
  if (JSON.stringify(projected.topology) !== JSON.stringify(snapshot.topology)) {
    fail("physical topology is not the exact semantic dependency closure");
  }
  return Object.freeze({
    status: "STRUCTURE_VERIFIED" as const,
    memory,
    members: new Set(selected) as ReadonlySet<LinkHandle>,
  });
}

export interface V015TrustedReplay {
  /** Independently selected pinned source bytes; never take these from snapshot. */
  readonly source: V015SourceInput;
  readonly expectedSourceSha256: string;
  readonly memory: EnumerableReadMemory & Memory;
  readonly basis: RootBasis;
  readonly grammarRoot: LinkHandle;
  readonly sourceAnetProfileRoot: LinkHandle;
}

/**
 * A source-backed comparison, relative to independently pinned input bytes,
 * compiler, denotation and build environment. Caller must authenticate its
 * pinned checkout/revision separately; a self-signed manifest grants nothing.
 */
export function verifyV015SemanticSnapshot(
  input: unknown,
  trusted: V015TrustedReplay,
): Omit<V015StructureVerified, "status"> & { readonly status: "SOURCE_REPLAY_VERIFIED" } {
  const snapshot = parse(input);
  restoreV015SemanticSnapshot(snapshot);
  if (hash(trusted.source.bytes) !== trusted.expectedSourceSha256 ||
      trusted.source.format !== snapshot.source.format ||
      trusted.source.path !== snapshot.source.path ||
      trusted.source.revision !== snapshot.source.revision ||
      trusted.expectedSourceSha256 !== snapshot.source.bytesSha256) {
    fail("independent pinned source mismatch");
  }
  const args = [trusted.memory, trusted.basis, trusted.grammarRoot,
    trusted.sourceAnetProfileRoot, trusted.source.bytes] as const;
  const compiled = trusted.source.format === "formal"
    ? compileV015DirectFormalSourceAnet(...args)
    : compileV015DirectJsonSourceAnet(...args);
  const denotation = denoteV015ResolvedSourceAnet(
    trusted.memory, trusted.basis, trusted.grammarRoot,
    trusted.sourceAnetProfileRoot, compiled.sourceAset);
  const replayed = exportV015SemanticSnapshot(
    trusted.memory, compiled.sourceAset, denotation, trusted.source);
  if (JSON.stringify(replayed) !== JSON.stringify(snapshot)) {
    fail("source replay topology, source identity or positive membership mismatch");
  }
  const restored = restoreV015SemanticSnapshot(snapshot);
  return Object.freeze({ ...restored, status: "SOURCE_REPLAY_VERIFIED" as const });
}
