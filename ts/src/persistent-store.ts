import type { LinkHandle } from "./memory.js";
import {
  STORAGE_TOPOLOGY_SCHEMA,
  exportTopology,
  restoreTopology,
  type StorageTopologyImage,
} from "./persistence-topology.js";

export interface PersistentLinkId {
  readonly lineage: string;
  readonly local: number;
}

export interface StoredDataset {
  readonly schema: "mts-persistent-dataset/v0.1";
  readonly lineage: string;
  readonly topology: StorageTopologyImage;
}

export interface PersistentTopologyBackend {
  load(): StoredDataset | undefined;
  commit(dataset: StoredDataset): void;
}

export interface BatchRef {
  readonly batch: number;
}

export type BatchEndpoint = PersistentLinkId | BatchRef;

export interface BatchLink {
  readonly start: BatchEndpoint;
  readonly end: BatchEndpoint;
}

export interface PersistentRuntimeView {
  readonly memory: ReturnType<typeof restoreTopology>;
  readonly refs: readonly LinkHandle[];
}

export class PersistentStoreError extends Error {
  override readonly name = "PersistentStoreError";
}

function invalid(message: string): never {
  throw new PersistentStoreError(message);
}

function coordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function freezeDataset(dataset: StoredDataset): StoredDataset {
  return Object.freeze({
    schema: "mts-persistent-dataset/v0.1" as const,
    lineage: dataset.lineage,
    topology: Object.freeze({
      schema: STORAGE_TOPOLOGY_SCHEMA,
      root: dataset.topology.root,
      links: Object.freeze(dataset.topology.links.map((pair) => Object.freeze([pair[0], pair[1]] as const))),
    }),
  });
}

interface Indexes {
  readonly pair: Map<string, number>;
  readonly outgoing: Map<number, Set<number>>;
  readonly incoming: Map<number, Set<number>>;
  readonly startSelf: Map<number, number>;
  readonly endSelf: Map<number, number>;
}

function pairKey(start: number, end: number): string {
  return `${start}:${end}`;
}

function buildIndexes(links: readonly (readonly [number, number])[]): Indexes {
  const pair = new Map<string, number>();
  const outgoing = new Map<number, Set<number>>();
  const incoming = new Map<number, Set<number>>();
  const startSelf = new Map<number, number>();
  const endSelf = new Map<number, number>();

  links.forEach(([start, end], local) => {
    const key = pairKey(start, end);
    if (pair.has(key)) invalid("persistent topology contains duplicate ordered pair");
    pair.set(key, local);
    let outs = outgoing.get(start);
    if (outs === undefined) outgoing.set(start, outs = new Set());
    outs.add(local);
    let ins = incoming.get(end);
    if (ins === undefined) incoming.set(end, ins = new Set());
    ins.add(local);
    if (start === local && end !== local) {
      if (startSelf.has(end)) invalid("duplicate start self-closure");
      startSelf.set(end, local);
    }
    if (end === local && start !== local) {
      if (endSelf.has(start)) invalid("duplicate end self-closure");
      endSelf.set(start, local);
    }
  });
  return { pair, outgoing, incoming, startSelf, endSelf };
}

export class PersistentStore {
  private dataset: StoredDataset;
  private indexes: Indexes;

  private constructor(
    private readonly backend: PersistentTopologyBackend,
    dataset: StoredDataset,
  ) {
    this.dataset = validateDataset(dataset);
    this.indexes = buildIndexes(this.dataset.topology.links);
  }

  static create(backend: PersistentTopologyBackend, lineage: string): PersistentStore {
    if (typeof lineage !== "string" || lineage.length === 0) invalid("invalid persistent lineage");
    if (backend.load() !== undefined) invalid("persistent dataset already exists");
    const dataset = freezeDataset({
      schema: "mts-persistent-dataset/v0.1",
      lineage,
      topology: {
        schema: STORAGE_TOPOLOGY_SCHEMA,
        root: 0,
        links: Object.freeze([Object.freeze([0, 0] as const)]),
      },
    });
    backend.commit(dataset);
    return new PersistentStore(backend, dataset);
  }

  static open(backend: PersistentTopologyBackend): PersistentStore {
    const loaded = backend.load();
    if (loaded === undefined) invalid("persistent dataset does not exist");
    return new PersistentStore(backend, loaded);
  }

  get lineage(): string { return this.dataset.lineage; }
  get count(): number { return this.dataset.topology.links.length; }
  get root(): PersistentLinkId { return this.id(this.dataset.topology.root); }

  snapshot(): StoredDataset { return this.dataset; }

  poles(ref: PersistentLinkId): readonly [PersistentLinkId, PersistentLinkId] {
    const local = this.local(ref);
    const [start, end] = this.dataset.topology.links[local]!;
    return Object.freeze([this.id(start), this.id(end)] as const);
  }

  find(start: PersistentLinkId, end: PersistentLinkId): PersistentLinkId | undefined {
    const found = this.indexes.pair.get(pairKey(this.local(start), this.local(end)));
    return found === undefined ? undefined : this.id(found);
  }

  outgoing(start: PersistentLinkId): readonly PersistentLinkId[] {
    return Object.freeze([...(this.indexes.outgoing.get(this.local(start)) ?? [])].map((local) => this.id(local)));
  }

  incoming(end: PersistentLinkId): readonly PersistentLinkId[] {
    return Object.freeze([...(this.indexes.incoming.get(this.local(end)) ?? [])].map((local) => this.id(local)));
  }

  allLinks(): readonly PersistentLinkId[] {
    return Object.freeze(this.dataset.topology.links.map((_pair, local) => this.id(local)));
  }

  runtimeMemory() {
    return restoreTopology(this.dataset.topology);
  }

  runtimeView(count = this.count): PersistentRuntimeView {
    if (!coordinate(count) || count <= this.dataset.topology.root || count > this.count) {
      invalid("invalid persistent runtime prefix count");
    }
    const links = this.dataset.topology.links.slice(0, count);
    for (const [start, end] of links) {
      if (start >= count || end >= count) invalid("persistent runtime prefix is not topologically closed");
    }
    const memory = restoreTopology(Object.freeze({
      schema: STORAGE_TOPOLOGY_SCHEMA,
      root: this.dataset.topology.root,
      links: Object.freeze(links),
    }));
    const refs = memory.allLinks();
    if (refs.length !== count) invalid("persistent runtime prefix cardinality mismatch");
    return Object.freeze({ memory, refs: Object.freeze([...refs]) });
  }

  materialize(start: PersistentLinkId, end: PersistentLinkId): PersistentLinkId {
    const startLocal = this.local(start);
    const endLocal = this.local(end);
    const existing = this.indexes.pair.get(pairKey(startLocal, endLocal));
    if (existing !== undefined) return this.id(existing);
    return this.commitCandidate([...this.dataset.topology.links, [startLocal, endLocal] as const]).result;
  }

  materializeStartSelfClosed(end: PersistentLinkId): PersistentLinkId {
    const endLocal = this.local(end);
    const existing = this.indexes.startSelf.get(endLocal);
    if (existing !== undefined) return this.id(existing);
    const local = this.count;
    return this.commitCandidate([...this.dataset.topology.links, [local, endLocal] as const]).result;
  }

  materializeEndSelfClosed(start: PersistentLinkId): PersistentLinkId {
    const startLocal = this.local(start);
    const existing = this.indexes.endSelf.get(startLocal);
    if (existing !== undefined) return this.id(existing);
    const local = this.count;
    return this.commitCandidate([...this.dataset.topology.links, [startLocal, local] as const]).result;
  }

  materializeBatch(requests: readonly BatchLink[]): readonly PersistentLinkId[] {
    if (!Array.isArray(requests)) invalid("invalid persistent batch");
    if (requests.length === 0) return Object.freeze([]);
    const candidate = [...this.dataset.topology.links];
    const results: number[] = [];
    let indexes = buildIndexes(candidate);

    requests.forEach((request, index) => {
      if (typeof request !== "object" || request === null) invalid("invalid batch request");
      const start = this.resolveEndpoint(request.start, index, results);
      const end = this.resolveEndpoint(request.end, index, results);
      let result: number;

      if (start.self && end.self) {
        result = this.dataset.topology.root;
      } else if (start.self) {
        const knownEnd = end.local!;
        result = indexes.startSelf.get(knownEnd) ?? candidate.length;
        if (result === candidate.length) candidate.push([result, knownEnd]);
      } else if (end.self) {
        const knownStart = start.local!;
        result = indexes.endSelf.get(knownStart) ?? candidate.length;
        if (result === candidate.length) candidate.push([knownStart, result]);
      } else {
        const knownStart = start.local!;
        const knownEnd = end.local!;
        result = indexes.pair.get(pairKey(knownStart, knownEnd)) ?? candidate.length;
        if (result === candidate.length) candidate.push([knownStart, knownEnd]);
      }
      results.push(result);
      indexes = buildIndexes(candidate);
    });

    if (candidate.length !== this.count) this.publishCandidate(candidate);
    return Object.freeze(results.map((local) => this.id(local)));
  }

  private resolveEndpoint(
    endpoint: BatchEndpoint,
    current: number,
    results: readonly number[],
  ): { readonly local?: number; readonly self: boolean } {
    if (isPersistentId(endpoint)) return { local: this.local(endpoint), self: false };
    if (typeof endpoint !== "object" || endpoint === null || !coordinate((endpoint as BatchRef).batch)) {
      invalid("invalid batch endpoint");
    }
    const index = (endpoint as BatchRef).batch;
    if (index > current) invalid("batch forward reference cannot create semantic distinction");
    if (index === current) return { self: true };
    const local = results[index];
    if (local === undefined) invalid("invalid earlier batch reference");
    return { local, self: false };
  }

  private commitCandidate(links: readonly (readonly [number, number])[]): { readonly result: PersistentLinkId } {
    const resultLocal = links.length - 1;
    this.publishCandidate(links);
    return { result: this.id(resultLocal) };
  }

  private publishCandidate(links: readonly (readonly [number, number])[]): void {
    const candidate = freezeDataset({
      schema: "mts-persistent-dataset/v0.1",
      lineage: this.lineage,
      topology: {
        schema: STORAGE_TOPOLOGY_SCHEMA,
        root: this.dataset.topology.root,
        links,
      },
    });
    validateDataset(candidate);
    const nextIndexes = buildIndexes(candidate.topology.links);
    this.backend.commit(candidate);
    this.dataset = candidate;
    this.indexes = nextIndexes;
  }

  private local(ref: PersistentLinkId): number {
    if (!isPersistentId(ref) || ref.lineage !== this.lineage || !coordinate(ref.local) || ref.local >= this.count) {
      invalid("foreign or invalid persistent link id");
    }
    return ref.local;
  }

  private id(local: number): PersistentLinkId {
    return Object.freeze({ lineage: this.lineage, local });
  }
}

function isPersistentId(value: unknown): value is PersistentLinkId {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<PersistentLinkId>;
  return typeof candidate.lineage === "string" && coordinate(candidate.local);
}

function validateDataset(dataset: StoredDataset): StoredDataset {
  if (typeof dataset !== "object" || dataset === null) invalid("invalid persistent dataset");
  if (dataset.schema !== "mts-persistent-dataset/v0.1") invalid("unsupported persistent dataset schema");
  if (typeof dataset.lineage !== "string" || dataset.lineage.length === 0) invalid("invalid persistent lineage");
  try {
    const memory = restoreTopology(dataset.topology);
    const normalized = exportTopology(memory);
    if (normalized.links.length !== dataset.topology.links.length) invalid("persistent topology is not canonical");
  } catch (error) {
    if (error instanceof PersistentStoreError) throw error;
    throw new PersistentStoreError("persistent topology is not rooted canonical MTS");
  }
  return freezeDataset(dataset);
}
