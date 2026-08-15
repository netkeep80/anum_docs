import {
  PersistentStore,
  PersistentStoreError,
  type PersistentLinkId,
  type PersistentTopologyBackend,
  type StoredDataset,
} from "../src/persistent-store.js";
import {
  materializePersistentSequence,
  replayPersistentSequenceMaterialization,
  type PersistentSequenceDescription,
  type PersistentSequenceMaterialization,
} from "../src/persistent-sequence.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertSame<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

function assertId(actual: PersistentLinkId, expected: PersistentLinkId, message: string): void {
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

  load(): StoredDataset | undefined {
    return this.dataset === undefined ? undefined : clone(this.dataset);
  }

  commit(dataset: StoredDataset): void {
    this.dataset = clone(dataset);
    this.commits += 1;
  }
}

function create(lineage = "sequence-lineage") {
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

function flat(root: PersistentLinkId, ...values: PersistentLinkId[]): PersistentSequenceDescription {
  return Object.freeze({
    root,
    items: Object.freeze(values.map((value) => Object.freeze({ kind: "atom" as const, value }))),
  });
}

{
  const { backend, store } = create();
  const before = store.count;
  const commits = backend.commits;
  const evidence = materializePersistentSequence(store, Object.freeze({ root: store.root, items: Object.freeze([]) }));
  assertId(evidence.result, store.root, "empty sequence denotes root");
  assertSame(evidence.created.length, 0, "empty sequence creates nothing");
  assertSame(store.count, before, "empty sequence does not grow");
  assertSame(backend.commits, commits, "empty sequence does not commit");
}

{
  const { backend, store } = create();
  const { O, C } = basis(store);
  const a = store.materialize(O, O);
  const b = store.materialize(C, C);
  const c = store.materialize(a, C);
  const description = flat(store.root, a, b, c);
  const before = store.count;
  const commits = backend.commits;
  const evidence = materializePersistentSequence(store, description);
  assertSame(evidence.beforeCount, before, "evidence records exact pre-state count");
  assertSame(evidence.created.length, 2, "three values create exact left-fold suffix");
  assertSame(store.count, before + 2, "only absent fold edges persist");
  assertSame(backend.commits, commits + 1, "whole sequence materializes in one atomic batch commit");
  assertSame(evidence.created[0]!.ref.local, before, "first created edge is first append");
  assertSame(evidence.created[1]!.ref.local, before + 1, "second created edge is second append");
  assertId(replayPersistentSequenceMaterialization(store, evidence), evidence.result, "fresh evidence replays");

  const after = store.count;
  const repeatCommits = backend.commits;
  const repeated = materializePersistentSequence(store, description);
  assertSame(repeated.created.length, 0, "repeat is idempotent");
  assertSame(store.count, after, "repeat does not grow");
  assertSame(backend.commits, repeatCommits, "repeat does not commit");
  assertId(repeated.result, evidence.result, "repeat returns same semantic result");
}

{
  const { backend, store } = create();
  const { O, C, L } = basis(store);
  const nested: PersistentSequenceDescription = Object.freeze({
    root: store.root,
    items: Object.freeze([
      Object.freeze({ kind: "atom" as const, value: O }),
      Object.freeze({ kind: "group" as const, items: Object.freeze([
        Object.freeze({ kind: "atom" as const, value: C }),
        Object.freeze({ kind: "atom" as const, value: O }),
      ]) }),
      Object.freeze({ kind: "atom" as const, value: L }),
    ]),
  });
  const commits = backend.commits;
  const evidence = materializePersistentSequence(store, nested);
  assert(evidence.created.length >= 1, "nested M6 fold creates required absent edges");
  assertSame(backend.commits, commits + 1, "nested sequence still commits once");
  assertId(replayPersistentSequenceMaterialization(store, evidence), evidence.result, "nested evidence replays");
}

{
  const { backend, store } = create();
  const { O, C } = basis(store);
  const a = store.materialize(O, O);
  const b = store.materialize(C, C);
  const prefix = store.materialize(a, b);
  const description = flat(store.root, a, b, O);
  const before = store.count;
  const evidence = materializePersistentSequence(store, description);
  assertSame(evidence.created.length, 1, "preexisting prefix leaves only suffix creation");
  assertSame(evidence.created[0]!.start.local, prefix.local, "suffix starts from reused prefix");
  assertSame(evidence.created[0]!.ref.local, before, "suffix appends contiguously");

  const persisted = backend.dataset;
  assert(persisted !== undefined, "backend has persisted dataset");
  const reopenedBackend = new MemoryBackend();
  reopenedBackend.dataset = clone(persisted);
  const reopened = PersistentStore.open(reopenedBackend);
  const reopenCommits = reopenedBackend.commits;
  assertId(replayPersistentSequenceMaterialization(reopened, evidence), evidence.result, "evidence survives reopen with fresh runtime handles");
  assertSame(reopenedBackend.commits, reopenCommits, "replay after reopen is read-only");
}

{
  const { store } = create();
  const { O, C } = basis(store);
  const a = store.materialize(O, O);
  const b = store.materialize(C, C);
  const evidence = materializePersistentSequence(store, flat(store.root, a, b, O));
  assert(evidence.created.length >= 1, "forgery fixture creates edges");
  const first = evidence.created[0]!;

  const forgedPole: PersistentSequenceMaterialization = Object.freeze({
    ...evidence,
    created: Object.freeze([Object.freeze({ ...first, start: O }), ...evidence.created.slice(1)]),
  });
  assertStoreError(() => replayPersistentSequenceMaterialization(store, forgedPole), "forged created poles reject");

  const missing: PersistentSequenceMaterialization = Object.freeze({
    ...evidence,
    created: Object.freeze(evidence.created.slice(1)),
  });
  assertStoreError(() => replayPersistentSequenceMaterialization(store, missing), "missing created edge rejects");

  if (evidence.created.length > 1) {
    const reordered: PersistentSequenceMaterialization = Object.freeze({
      ...evidence,
      created: Object.freeze([evidence.created[1]!, evidence.created[0]!, ...evidence.created.slice(2)]),
    });
    assertStoreError(() => replayPersistentSequenceMaterialization(store, reordered), "reordered created edges reject");
  }

  const forgedResult: PersistentSequenceMaterialization = Object.freeze({ ...evidence, result: O });
  assertStoreError(() => replayPersistentSequenceMaterialization(store, forgedResult), "forged result rejects");

  const wrongBefore: PersistentSequenceMaterialization = Object.freeze({ ...evidence, beforeCount: evidence.beforeCount - 1 });
  assertStoreError(() => replayPersistentSequenceMaterialization(store, wrongBefore), "wrong beforeCount rejects");
}

{
  const { store } = create("selected");
  const other = create("foreign").store;
  const { O } = basis(store);
  const foreign = other.root;
  assertStoreError(
    () => materializePersistentSequence(store, flat(store.root, O, foreign)),
    "foreign atom rejects",
  );
  assertStoreError(
    () => materializePersistentSequence(store, flat(foreign, O)),
    "foreign root rejects",
  );
}

{
  const { backend, store } = create();
  const { O } = basis(store);
  const description = flat(store.root, O, O, O);
  const evidence = materializePersistentSequence(store, description);
  const beforeCount = store.count;
  const beforeCommits = backend.commits;
  replayPersistentSequenceMaterialization(store, evidence);
  assertSame(store.count, beforeCount, "replay never materializes repeated positions");
  assertSame(backend.commits, beforeCommits, "replay never commits");
}
