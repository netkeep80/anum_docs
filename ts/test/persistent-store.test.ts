import {
  PersistentStore,
  PersistentStoreError,
  type BatchLink,
  type PersistentLinkId,
  type PersistentTopologyBackend,
  type StoredDataset,
} from "../src/persistent-store.js";
import { STORAGE_TOPOLOGY_SCHEMA } from "../src/persistence-topology.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertSame<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

function assertId(actual: PersistentLinkId | undefined, expected: PersistentLinkId, message: string): void {
  assert(actual !== undefined, `${message}: missing`);
  assert(actual.lineage === expected.lineage && actual.local === expected.local, message);
}

function assertStoreError(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof PersistentStoreError, `${message}: wrong error type`);
    return;
  }
  throw new Error(`${message}: expected PersistentStoreError`);
}

function clone(dataset: StoredDataset): StoredDataset {
  return JSON.parse(JSON.stringify(dataset)) as StoredDataset;
}

class MemoryBackend implements PersistentTopologyBackend {
  dataset: StoredDataset | undefined;
  commits = 0;
  failNext = false;

  load(): StoredDataset | undefined {
    return this.dataset === undefined ? undefined : clone(this.dataset);
  }

  commit(dataset: StoredDataset): void {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("injected commit failure");
    }
    this.dataset = clone(dataset);
    this.commits += 1;
  }
}

function create(lineage = "lineage-a") {
  const backend = new MemoryBackend();
  const store = PersistentStore.create(backend, lineage);
  return { backend, store };
}

function basis(store: PersistentStore) {
  const R = store.root;
  const O = store.materializeStartSelfClosed(R);
  const C = store.materializeEndSelfClosed(R);
  const L = store.materialize(O, C);
  const U = store.materialize(C, O);
  return { R, O, C, L, U };
}

{
  const { backend, store } = create();
  const R = store.root;
  assertSame(store.count, 1, "fresh store contains one root");
  assertId(store.find(R, R), R, "root pair lookup");
  assertId(store.materialize(R, R), R, "materialize root pair reuses root");
  assertSame(store.count, 1, "root reuse does not grow");
  assertSame(backend.commits, 1, "root reuse does not commit again");
}

{
  const { store } = create();
  const { R, O, C, L, U } = basis(store);
  assertSame(store.count, 5, "root basis count");
  assertId(store.materializeStartSelfClosed(R), O, "O reuse");
  assertId(store.materializeEndSelfClosed(R), C, "C reuse");
  assertId(store.materialize(O, C), L, "L reuse");
  assertId(store.materialize(C, O), U, "U reuse");
  assertId(store.find(O, C), L, "indexed exact find");
  assert(store.outgoing(O).some((id) => id.local === L.local), "outgoing index includes L");
  assert(store.incoming(C).some((id) => id.local === L.local), "incoming index includes L");
  const before = store.count;
  store.find(C, O);
  store.outgoing(C);
  store.incoming(O);
  store.allLinks();
  assertSame(store.count, before, "reads never materialize");

  const loop = store.materialize(L, L);
  assert(loop.local !== L.local, "ordinary loop is distinct from L");
  const [loopStart, loopEnd] = store.poles(loop);
  assertId(loopStart, L, "loop start");
  assertId(loopEnd, L, "loop end");
  assertId(store.materialize(L, L), loop, "ordinary loop pair canonical");
}

{
  const { backend, store } = create();
  const R = store.root;
  const requests: readonly BatchLink[] = [
    { start: { batch: 0 }, end: R },
    { start: R, end: { batch: 1 } },
    { start: { batch: 0 }, end: { batch: 1 } },
  ];
  const beforeCommits = backend.commits;
  const [O, C, L] = store.materializeBatch(requests);
  assert(O !== undefined && C !== undefined && L !== undefined, "batch results");
  assertSame(store.count, 4, "batch adds dependency-ordered links");
  assertSame(backend.commits, beforeCommits + 1, "whole batch commits once");
  assertId(store.find(O, C), L, "batch result indexed");

  const rootAgain = store.materializeBatch([{ start: { batch: 0 }, end: { batch: 0 } }])[0];
  assertId(rootAgain, R, "batch full self closure resolves root");
}

{
  const { backend, store } = create();
  const before = store.snapshot();
  const commits = backend.commits;
  assertStoreError(
    () => store.materializeBatch([
      { start: { batch: 1 }, end: store.root },
      { start: { batch: 1 }, end: store.root },
    ]),
    "forward batch reference",
  );
  assertSame(store.count, before.topology.links.length, "failed batch leaves count unchanged");
  assertSame(backend.commits, commits, "failed batch never commits");
}

{
  const { backend, store } = create();
  const R = store.root;
  const beforeCount = store.count;
  const beforeDataset = JSON.stringify(backend.dataset);
  backend.failNext = true;
  let threw = false;
  try {
    store.materializeStartSelfClosed(R);
  } catch (error) {
    threw = true;
    assert(error instanceof Error, "backend failure must propagate");
  }
  assert(threw, "injected backend failure must throw");
  assertSame(store.count, beforeCount, "failed commit leaves live state unchanged");
  assertSame(JSON.stringify(backend.dataset), beforeDataset, "failed commit leaves backend unchanged");
  assertSame(store.outgoing(R).length, 1, "failed id never enters indexes");
}

{
  const { store } = create("selected");
  basis(store);
  const foreignStore = create("foreign").store;
  assertStoreError(() => store.poles(foreignStore.root), "foreign lineage poles");
  assertStoreError(() => store.materialize(foreignStore.root, store.root), "foreign materialization");
  assertStoreError(
    () => store.poles({ lineage: store.lineage, local: 999 }),
    "out of range local",
  );
  assertStoreError(
    () => store.poles({ lineage: store.lineage, local: -1 }),
    "negative local",
  );
  assertStoreError(
    () => store.poles({ lineage: store.lineage, local: true as unknown as number }),
    "boolean local",
  );
}

{
  const first = create("lineage-1");
  basis(first.store);
  const secondBackend = new MemoryBackend();
  const topology = first.store.snapshot().topology;
  secondBackend.dataset = {
    schema: "mts-persistent-dataset/v0.1",
    lineage: "lineage-2",
    topology,
  };
  const second = PersistentStore.open(secondBackend);
  assertSame(second.count, first.store.count, "same topology opens under another lineage");
  assert(second.root.lineage !== first.store.root.lineage, "storage lineage is reissued");
  const runtimeA = first.store.runtimeMemory();
  const runtimeB = second.runtimeMemory();
  assertSame(runtimeA.linkCount, runtimeB.linkCount, "runtime topology count preserved");
  assert(runtimeA.root !== runtimeB.root, "runtime handles are fresh technical coordinates");
}

{
  const malformed = new MemoryBackend();
  malformed.dataset = {
    schema: "mts-persistent-dataset/v0.1",
    lineage: "bad",
    topology: {
      schema: STORAGE_TOPOLOGY_SCHEMA,
      root: 0,
      links: [[0, 0], [1, 1]],
    },
  };
  assertStoreError(() => PersistentStore.open(malformed), "malformed backend topology");
}

{
  const backend = new MemoryBackend();
  assertStoreError(() => PersistentStore.create(backend, ""), "empty lineage");
  const existing = create();
  assertStoreError(() => PersistentStore.create(existing.backend, "again"), "create over existing dataset");
}
