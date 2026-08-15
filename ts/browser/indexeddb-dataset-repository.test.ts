import { IDBFactory } from "fake-indexeddb";
import {
  PersistentStore,
  PersistentStoreError,
  type PersistentTopologyBackend,
  type StoredDataset,
} from "../src/persistent-store.js";
import {
  IndexedDbDatasetRepository,
  IndexedDbDatasetRepositoryError,
} from "./indexeddb-dataset-repository.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`indexeddb-dataset-repository: ${message}`);
}

function clone(dataset: StoredDataset): StoredDataset {
  return structuredClone(dataset);
}

class SnapshotBackend implements PersistentTopologyBackend {
  constructor(private dataset: StoredDataset | undefined) {}

  load(): StoredDataset | undefined {
    return this.dataset === undefined ? undefined : clone(this.dataset);
  }

  commit(dataset: StoredDataset): void {
    this.dataset = clone(dataset);
  }
}

function makeDataset(): StoredDataset {
  const backend = new SnapshotBackend(undefined);
  const store = PersistentStore.create(backend, "browser-lineage");
  const root = store.root;
  const opening = store.materializeStartSelfClosed(root);
  const closing = store.materializeEndSelfClosed(root);
  store.materialize(opening, closing);
  return store.snapshot();
}

async function main(): Promise<void> {
  const factory = new IDBFactory();
  const first = new IndexedDbDatasetRepository("mts-browser-test", factory);
  assert(await first.load() === undefined, "fresh database must not invent a dataset");

  const original = makeDataset();
  await first.save(original);

  // A new repository instance must observe only the transaction-completed checkpoint.
  const reopenedRepository = new IndexedDbDatasetRepository("mts-browser-test", factory);
  const loaded = await reopenedRepository.load();
  assert(loaded !== undefined, "committed dataset must survive repository reopen");
  assert(loaded !== original, "IndexedDB load must return detached structured data");
  assert(JSON.stringify(loaded) === JSON.stringify(original), "checkpoint payload must round-trip exactly");

  // Existing PersistentStore remains the semantic validator/runtime after async load.
  const reopenedStore = PersistentStore.open(new SnapshotBackend(loaded));
  assert(reopenedStore.count === original.topology.links.length, "reloaded topology count must validate");
  const root = reopenedStore.root;
  const opening = reopenedStore.allLinks()[1];
  const closing = reopenedStore.allLinks()[2];
  assert(opening !== undefined && closing !== undefined, "basis coordinates must survive checkpoint");
  const loop = reopenedStore.materialize(opening, opening);
  const updated = reopenedStore.snapshot();
  assert(loop.local === original.topology.links.length, "new semantic link must append after loaded checkpoint");

  await reopenedRepository.save(updated);
  const secondLoad = await first.load();
  assert(secondLoad !== undefined, "overwritten checkpoint must remain readable");
  assert(secondLoad.topology.links.length === updated.topology.links.length, "save must replace current checkpoint atomically");

  // The repository stores bytes/records; semantic fail-closed validation remains owned
  // by PersistentStore. A corrupt checkpoint may be physically read but cannot open.
  const malformed = {
    schema: "mts-persistent-dataset/v0.1",
    lineage: "bad",
    topology: {
      schema: "mts-storage-topology/v0.1",
      root: 0,
      links: [[0, 0], [1, 1]],
    },
  } as unknown as StoredDataset;
  await reopenedRepository.save(malformed);
  const corrupt = await first.load();
  assert(corrupt !== undefined, "physically stored malformed checkpoint must be observable at storage boundary");
  let rejected = false;
  try {
    PersistentStore.open(new SnapshotBackend(corrupt));
  } catch (error) {
    assert(error instanceof PersistentStoreError, "malformed checkpoint must fail through semantic persistence validator");
    rejected = true;
  }
  assert(rejected, "malformed checkpoint must never become an opened PersistentStore");

  let invalidNameRejected = false;
  try {
    new IndexedDbDatasetRepository("", factory);
  } catch (error) {
    assert(error instanceof IndexedDbDatasetRepositoryError, "invalid name must use repository error type");
    invalidNameRejected = true;
  }
  assert(invalidNameRejected, "empty IndexedDB database name must reject");
}

await main();
