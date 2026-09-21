import {
  MemoryError,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 atomic cyclic import: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

interface GraphRecord {
  readonly start: number;
  readonly end: number;
}

interface GraphDescription {
  readonly records: readonly GraphRecord[];
}

class AtomicImportError extends Error {
  override readonly name = "AtomicImportError";
}

class ResearchAtomicGraphMemory implements ReadMemory {
  private nextId = 0;
  private readonly ids = new Map<LinkHandle, number>();
  private readonly cells = new Map<LinkHandle, LinkPoles>();
  private readonly byPair = new Map<string, LinkHandle>();
  private readonly startSelfClosed = new Map<LinkHandle, LinkHandle>();
  private readonly endSelfClosed = new Map<LinkHandle, LinkHandle>();
  private readonly graphCache = new Map<string, readonly LinkHandle[]>();

  readonly root: LinkHandle;

  constructor() {
    const root = this.newHandle();
    this.root = root;
    this.commitHandle(root, root, root);
  }

  get linkCount(): number {
    return this.cells.size;
  }

  poles(link: LinkHandle): LinkPoles {
    this.requireHandle(link);
    const value = this.cells.get(link);
    if (value === undefined) throw new MemoryError("unbound Link");
    return value;
  }

  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    this.requireHandle(start);
    this.requireHandle(end);
    return this.byPair.get(this.pairKey(start, end));
  }

  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.requireHandle(start);
    return Object.freeze(
      [...this.cells]
        .filter(([, poles]) => poles.start === start)
        .map(([link]) => link),
    );
  }

  incoming(end: LinkHandle): readonly LinkHandle[] {
    this.requireHandle(end);
    return Object.freeze(
      [...this.cells]
        .filter(([, poles]) => poles.end === end)
        .map(([link]) => link),
    );
  }

  ensureStartSelfClosed(end: LinkHandle): LinkHandle {
    this.requireHandle(end);
    const existing = this.startSelfClosed.get(end);
    if (existing !== undefined) return existing;

    const created = this.newHandle();
    this.commitHandle(created, created, end);
    this.startSelfClosed.set(end, created);
    return created;
  }

  ensureEndSelfClosed(start: LinkHandle): LinkHandle {
    this.requireHandle(start);
    const existing = this.endSelfClosed.get(start);
    if (existing !== undefined) return existing;

    const created = this.newHandle();
    this.commitHandle(created, start, created);
    this.endSelfClosed.set(start, created);
    return created;
  }

  ensure(start: LinkHandle, end: LinkHandle): LinkHandle {
    this.requireHandle(start);
    this.requireHandle(end);

    const existing = this.byPair.get(this.pairKey(start, end));
    if (existing !== undefined) return existing;

    const created = this.newHandle();
    this.commitHandle(created, start, end);
    return created;
  }

  /**
   * Research-only atomic graph import.
   *
   * Unbound graph nodes are reserved internally, but are not registered as
   * readable Links until every record, bootstrap binding and ordered-pair
   * uniqueness condition has been validated.
   */
  importAtomicGraph(
    description: GraphDescription,
    bindings: ReadonlyMap<number, LinkHandle>,
    selectedIndex = 0,
  ): LinkHandle {
    const before = this.linkCount;
    const records = description.records;
    if (records.length === 0) throw new AtomicImportError("empty graph");
    if (
      !Number.isInteger(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= records.length
    ) {
      throw new AtomicImportError("invalid selected index");
    }

    for (const [index, record] of records.entries()) {
      for (const ref of [record.start, record.end]) {
        if (!Number.isInteger(ref) || ref < 0 || ref >= records.length) {
          throw new AtomicImportError(`record ${index}: invalid local ref`);
        }
      }
    }

    const boundHandles = new Set<LinkHandle>();
    for (const [index, handle] of bindings) {
      if (!Number.isInteger(index) || index < 0 || index >= records.length) {
        throw new AtomicImportError("invalid binding index");
      }
      this.requireHandle(handle);
      if (boundHandles.has(handle)) {
        throw new AtomicImportError("two representation nodes bind one local Link");
      }
      boundHandles.add(handle);
    }

    const rootBindings = [...bindings].filter(([, handle]) => handle === this.root);
    if (rootBindings.length !== 1) {
      throw new AtomicImportError("exactly one graph node must bind local R");
    }
    const rootIndex = rootBindings[0]![0];
    const rootRecord = records[rootIndex]!;
    if (rootRecord.start !== rootIndex || rootRecord.end !== rootIndex) {
      throw new AtomicImportError("bound R must be the fully self-closed graph node");
    }

    const existingToken = (handle: LinkHandle): string =>
      `e:${this.ids.get(handle)!}`;
    const token = (index: number): string => {
      const bound = bindings.get(index);
      return bound === undefined ? `n:${index}` : existingToken(bound);
    };

    // Bound nodes must already have exactly the topology claimed by the graph.
    for (const [index, bound] of bindings) {
      const record = records[index]!;
      const start = bindings.get(record.start);
      const end = bindings.get(record.end);
      if (start === undefined || end === undefined) {
        throw new AtomicImportError("bound node depends on unresolved graph node");
      }
      const poles = this.poles(bound);
      if (poles.start !== start || poles.end !== end) {
        throw new AtomicImportError("bootstrap binding topology mismatch");
      }
    }

    // A second fully self-closed node would violate X = X->X => X = R.
    for (const [index, record] of records.entries()) {
      if (
        index !== rootIndex &&
        record.start === index &&
        record.end === index
      ) {
        throw new AtomicImportError("non-root full self-closure");
      }
    }

    // Canonical ordered-pair uniqueness is checked on representation-local
    // identities before any semantic Link is published.
    const pairOwner = new Map<string, number>();
    for (const [index, record] of records.entries()) {
      const key = `${token(record.start)}|${token(record.end)}`;
      const previous = pairOwner.get(key);
      if (previous !== undefined && previous !== index) {
        throw new AtomicImportError("duplicate semantic ordered pair");
      }
      pairOwner.set(key, index);

      if (!bindings.has(index)) {
        const start = bindings.get(record.start);
        const end = bindings.get(record.end);
        if (start !== undefined && end !== undefined) {
          const existing = this.find(start, end);
          if (existing !== undefined) {
            throw new AtomicImportError(
              "existing canonical pair must be supplied as bootstrap binding",
            );
          }
        }
      }
    }

    const cacheKey = JSON.stringify({
      records,
      bindings: [...bindings]
        .map(([index, handle]) => [index, this.ids.get(handle)!] as const)
        .sort((left, right) => left[0] - right[0]),
    });

    const cached = this.graphCache.get(cacheKey);
    if (cached !== undefined) {
      // Cache is only a local idempotence accelerator. Revalidate topology so
      // description never becomes semantic authority by itself.
      for (const [index, record] of records.entries()) {
        const link = cached[index]!;
        const poles = this.poles(link);
        same(poles.start, cached[record.start], "cached graph start topology");
        same(poles.end, cached[record.end], "cached graph end topology");
      }
      same(this.linkCount, before, "cached graph replay writes zero Links");
      return cached[selectedIndex]!;
    }

    // Reserve opaque local identities privately. They are not registered in
    // ids/cells/byPair yet, so no caller can observe a half-formed Link.
    const local: LinkHandle[] = records.map((_, index) =>
      bindings.get(index) ?? (Object.freeze({}) as LinkHandle),
    );

    // All validation is complete. Commit has no remaining fallible semantic
    // checks: first register every new identity, then publish every pole pair.
    for (let index = 0; index < local.length; index += 1) {
      if (bindings.has(index)) continue;
      const link = local[index]!;
      this.ids.set(link, this.nextId);
      this.nextId += 1;
    }

    for (let index = 0; index < local.length; index += 1) {
      if (bindings.has(index)) continue;

      const link = local[index]!;
      const record = records[index]!;
      const start = local[record.start]!;
      const end = local[record.end]!;
      const pairKey = this.pairKey(start, end);

      this.cells.set(link, Object.freeze({ start, end }));
      this.byPair.set(pairKey, link);

      if (start === link && end !== link) this.startSelfClosed.set(end, link);
      if (end === link && start !== link) this.endSelfClosed.set(start, link);
    }

    const frozen = Object.freeze([...local]);
    this.graphCache.set(cacheKey, frozen);
    return frozen[selectedIndex]!;
  }

  private newHandle(): LinkHandle {
    const handle = Object.freeze({}) as LinkHandle;
    this.ids.set(handle, this.nextId);
    this.nextId += 1;
    return handle;
  }

  private commitHandle(
    link: LinkHandle,
    start: LinkHandle,
    end: LinkHandle,
  ): void {
    const key = this.pairKey(start, end);
    if (this.byPair.has(key)) throw new MemoryError("duplicate semantic ordered pair");

    this.cells.set(link, Object.freeze({ start, end }));
    this.byPair.set(key, link);
  }

  private pairKey(start: LinkHandle, end: LinkHandle): string {
    const startId = this.ids.get(start);
    const endId = this.ids.get(end);
    if (startId === undefined || endId === undefined) {
      throw new MemoryError("foreign or unresolved Link");
    }
    return `${startId}:${endId}`;
  }

  private requireHandle(handle: LinkHandle): void {
    if (!this.ids.has(handle) || !this.cells.has(handle)) {
      throw new MemoryError("foreign, unresolved or forged Link");
    }
  }
}

function ensureRootBasis(memory: ResearchAtomicGraphMemory): RootBasis {
  const R = memory.root;
  const O = memory.ensureStartSelfClosed(R);
  const C = memory.ensureEndSelfClosed(R);
  const L = memory.ensure(O, C);
  const U = memory.ensure(C, O);
  return Object.freeze({ R, O, C, L, U });
}

function describeFiniteGraph(
  memory: ReadMemory,
  selected: LinkHandle,
): GraphDescription {
  const localIndex = new Map<LinkHandle, number>();
  const records: Array<GraphRecord | undefined> = [];

  const visit = (link: LinkHandle): number => {
    const known = localIndex.get(link);
    if (known !== undefined) return known;

    const index = records.length;
    localIndex.set(link, index);
    records.push(undefined);

    const poles = memory.poles(link);
    records[index] = Object.freeze({
      start: visit(poles.start),
      end: visit(poles.end),
    });
    return index;
  };

  same(visit(selected), 0, "selected Link is representation node 0");
  assert(records.every((record) => record !== undefined), "all records resolved");
  return Object.freeze({
    records: Object.freeze(records as GraphRecord[]),
  });
}

function sameDescription(
  actual: GraphDescription,
  expected: GraphDescription,
  message: string,
): void {
  same(JSON.stringify(actual.records), JSON.stringify(expected.records), message);
}

const description: GraphDescription = Object.freeze({
  records: Object.freeze([
    Object.freeze({ start: 1, end: 3 }), // 0: A = O -> B
    Object.freeze({ start: 1, end: 2 }), // 1: O = O -> R
    Object.freeze({ start: 2, end: 2 }), // 2: R = R -> R
    Object.freeze({ start: 0, end: 4 }), // 3: B = A -> C
    Object.freeze({ start: 2, end: 4 }), // 4: C = R -> C
  ]),
});

function materializeReceiver(noiseRounds: number): {
  readonly memory: ResearchAtomicGraphMemory;
  readonly basis: RootBasis;
  readonly target: LinkHandle;
} {
  const memory = new ResearchAtomicGraphMemory();
  const basis = ensureRootBasis(memory);

  let noise: LinkHandle = basis.U;
  for (let index = 0; index < noiseRounds; index += 1) {
    noise = index % 2 === 0
      ? memory.ensure(noise, basis.L)
      : memory.ensure(basis.C, noise);
  }

  const bindings = new Map<number, LinkHandle>([
    [1, basis.O],
    [2, basis.R],
    [4, basis.C],
  ]);

  const before = memory.linkCount;
  const target = memory.importAtomicGraph(description, bindings, 0);
  same(memory.linkCount, before + 2, "only cyclic A/B are newly committed");

  const a = target;
  const b = memory.poles(a).end;
  same(memory.poles(a).start, basis.O, "A.start = O");
  same(memory.poles(a).end, b, "A.end = B");
  same(memory.poles(b).start, a, "B.start = A");
  same(memory.poles(b).end, basis.C, "B.end = C");

  sameDescription(
    describeFiniteGraph(memory, target),
    description,
    "receiver graph re-describes to exact canonical records",
  );

  // Replay the same canonical graph in the same receiver is local-idempotent.
  const beforeReplay = memory.linkCount;
  const repeated = memory.importAtomicGraph(description, bindings, 0);
  same(repeated, target, "same graph description returns same local target");
  same(memory.linkCount, beforeReplay, "same graph replay writes zero Links");

  return Object.freeze({ memory, basis, target });
}

const receiverA = materializeReceiver(3);
const receiverB = materializeReceiver(9);

assert(
  receiverA.target !== receiverB.target,
  "semantic targets remain receiver-local handles",
);
sameDescription(
  describeFiniteGraph(receiverA.memory, receiverA.target),
  describeFiniteGraph(receiverB.memory, receiverB.target),
  "independent receivers reconstruct the same selected cyclic topology",
);

// DESCRIPTION != TARGET remains literal: only local records/refs cross this
// research boundary; the receiver creates its own semantic Link identities.
assert(
  (description as unknown) !== (receiverA.target as unknown),
  "graph description is not semantic target",
);

function expectAtomicFailure(
  mutate: (records: GraphRecord[]) => void,
  message: string,
): void {
  const memory = new ResearchAtomicGraphMemory();
  const basis = ensureRootBasis(memory);
  const bindings = new Map<number, LinkHandle>([
    [1, basis.O],
    [2, basis.R],
    [4, basis.C],
  ]);
  const records = description.records.map((record) => ({ ...record }));
  mutate(records);

  const before = memory.linkCount;
  try {
    memory.importAtomicGraph(Object.freeze({
      records: Object.freeze(records.map((record) => Object.freeze(record))),
    }), bindings, 0);
  } catch (error) {
    assert(error instanceof AtomicImportError, `${message}: stable atomic error`);
    same(memory.linkCount, before, `${message}: failure writes zero Links`);
    return;
  }
  throw new Error(`v0.13 atomic cyclic import: ${message}: expected rejection`);
}

expectAtomicFailure(
  (records) => {
    records[3] = { start: 0, end: 99 };
  },
  "out-of-range representation-local ref",
);

expectAtomicFailure(
  (records) => {
    records[3] = { start: 1, end: 3 };
  },
  "two graph nodes claiming one ordered pair",
);

expectAtomicFailure(
  (records) => {
    records[0] = { start: 0, end: 0 };
  },
  "second fully self-closed node",
);

// Bootstrap topology is authority too: O cannot be substituted with C.
{
  const memory = new ResearchAtomicGraphMemory();
  const basis = ensureRootBasis(memory);
  const bindings = new Map<number, LinkHandle>([
    [1, basis.U],
    [2, basis.R],
    [4, basis.C],
  ]);
  const before = memory.linkCount;
  let rejected = false;

  try {
    memory.importAtomicGraph(description, bindings, 0);
  } catch (error) {
    assert(error instanceof AtomicImportError, "wrong bootstrap binding: stable error");
    same(memory.linkCount, before, "wrong bootstrap binding writes zero Links");
    rejected = true;
  }
  assert(rejected, "wrong bootstrap binding is rejected");
}

console.log(
  "MTS v0.13 AC2 research atomic cyclic materialization: canonical local refs + R/O/C bootstrap -> receiver-local A<->B graph; private reserve, atomic commit, idempotent replay and failure=0 writes: GREEN.",
);
