import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  StreamError,
  deserializeStream,
  symbolicStackAlgebra,
} from "../src/anum.js";
import { Memory, ensureRootBasis } from "../src/memory.js";
import {
  PersistenceTopologyError,
  STORAGE_TOPOLOGY_SCHEMA,
  exportTopology,
  restoreTopology,
  type StorageTopologyImage,
} from "../src/persistence-topology.js";
import {
  PersistentStore,
  PersistentStoreError,
  type PersistentTopologyBackend,
  type StoredDataset,
} from "../src/persistent-store.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface DifferentialCase {
  readonly id: string;
  readonly category: "topology" | "anum" | "persistence";
  readonly input: Record<string, Json>;
}
interface Corpus {
  readonly schema: string;
  readonly contract: string;
  readonly pythonOracleSha: string;
  readonly cases: readonly DifferentialCase[];
}
interface Result {
  readonly id: string;
  readonly accepted: boolean;
  readonly observable?: Json;
  readonly error?: string;
}

function canonical(value: Json): Json {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

function sameJson(left: Json, right: Json): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function topologyObservable(memory: Memory): Json {
  const topology = exportTopology(memory);
  return { root: topology.root, links: topology.links.map(([start, end]) => [start, end]) };
}

function storageImage(input: Record<string, Json>): StorageTopologyImage {
  const root = input.root;
  const links = input.links;
  assert(typeof root === "number" && Array.isArray(links), "invalid topology fixture");
  return {
    schema: STORAGE_TOPOLOGY_SCHEMA,
    root,
    links: links.map((pair) => {
      assert(Array.isArray(pair) && pair.length === 2, "invalid topology pair fixture");
      const start = pair[0];
      const end = pair[1];
      assert(typeof start === "number" && typeof end === "number", "invalid topology coordinates fixture");
      return [start, end] as const;
    }),
  };
}

function runTopology(test: DifferentialCase): Result {
  const operation = test.input.operation;
  assert(typeof operation === "string", "topology fixture needs operation");
  try {
    if (operation === "basis-loop") {
      const memory = new Memory();
      const { L } = ensureRootBasis(memory);
      memory.ensure(L, L);
      return { id: test.id, accepted: true, observable: topologyObservable(memory) };
    }
    if (operation === "same-pair") {
      const memory = new Memory();
      const { O, C, L } = ensureRootBasis(memory);
      const before = memory.linkCount;
      const reused = memory.ensure(O, C);
      return {
        id: test.id,
        accepted: true,
        observable: {
          ...(topologyObservable(memory) as Record<string, Json>),
          countBefore: before,
          countAfter: memory.linkCount,
          reused: reused === L,
        },
      };
    }
    if (operation === "restore") {
      const restored = restoreTopology(storageImage(test.input));
      return { id: test.id, accepted: true, observable: topologyObservable(restored) };
    }
    throw new Error(`unknown topology fixture operation: ${operation}`);
  } catch (error) {
    if (error instanceof PersistenceTopologyError) {
      return { id: test.id, accepted: false, error: "invalid-topology" };
    }
    throw error;
  }
}

function runAnum(test: DifferentialCase): Result {
  const source = test.input.source;
  assert(typeof source === "string", "ANUM fixture needs source");
  try {
    const result = deserializeStream(source, symbolicStackAlgebra);
    return {
      id: test.id,
      accepted: true,
      observable: {
        denotation: result.denotation,
        resolvedValues: [...result.resolvedValues],
        operations: [...result.operations],
      },
    };
  } catch (error) {
    if (error instanceof StreamError) return { id: test.id, accepted: false, error: error.code };
    throw error;
  }
}

function cloneDataset(dataset: StoredDataset): StoredDataset {
  return JSON.parse(JSON.stringify(dataset)) as StoredDataset;
}

class MemoryBackend implements PersistentTopologyBackend {
  constructor(public dataset?: StoredDataset) {}
  load(): StoredDataset | undefined { return this.dataset === undefined ? undefined : cloneDataset(this.dataset); }
  commit(dataset: StoredDataset): void { this.dataset = cloneDataset(dataset); }
}

function persistentBasis(store: PersistentStore) {
  const root = store.root;
  const opening = store.materializeStartSelfClosed(root);
  const closing = store.materializeEndSelfClosed(root);
  const linked = store.materialize(opening, closing);
  store.materialize(closing, opening);
  return { root, opening, closing, linked };
}

function persistentTopology(store: PersistentStore): Json {
  const topology = store.snapshot().topology;
  return { root: topology.root, links: topology.links.map(([start, end]) => [start, end]) };
}

function runPersistence(test: DifferentialCase): Result {
  const operation = test.input.operation;
  assert(typeof operation === "string", "persistence fixture needs operation");
  try {
    if (operation === "open-topology") {
      const backend = new MemoryBackend({
        schema: "mts-persistent-dataset/v0.1",
        lineage: "differential-lineage",
        topology: storageImage(test.input),
      });
      const store = PersistentStore.open(backend);
      return { id: test.id, accepted: true, observable: persistentTopology(store) };
    }

    const backend = new MemoryBackend();
    const store = PersistentStore.create(backend, "differential-lineage");
    if (operation === "root") {
      return { id: test.id, accepted: true, observable: persistentTopology(store) };
    }
    if (operation === "basis-loop-reopen") {
      const { linked } = persistentBasis(store);
      store.materialize(linked, linked);
      const reopened = PersistentStore.open(backend);
      return { id: test.id, accepted: true, observable: persistentTopology(reopened) };
    }
    if (operation === "same-pair") {
      const { opening, closing, linked } = persistentBasis(store);
      const before = store.count;
      const reused = store.materialize(opening, closing);
      return {
        id: test.id,
        accepted: true,
        observable: {
          ...(persistentTopology(store) as Record<string, Json>),
          countBefore: before,
          countAfter: store.count,
          reused: reused.local === linked.local,
        },
      };
    }
    throw new Error(`unknown persistence fixture operation: ${operation}`);
  } catch (error) {
    if (error instanceof PersistentStoreError) {
      return { id: test.id, accepted: false, error: "invalid-topology" };
    }
    throw error;
  }
}

const repoRoot = resolve(process.cwd(), "..");
const fixturePath = resolve(repoRoot, "differential/fixtures-v0.7.json");
const corpus = JSON.parse(readFileSync(fixturePath, "utf8")) as Corpus;
assert(corpus.schema === "mts-differential-fixtures/v0.1", "unexpected differential fixture schema");
assert(corpus.contract === "mts-contract/v0.7", "differential fixtures must select accepted v0.7 contract");

const python = spawnSync("python3", ["differential/python_oracle.py", "differential/fixtures-v0.7.json"], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert(python.status === 0, `frozen Python oracle adapter failed: ${python.stderr || python.stdout}`);
const expected = JSON.parse(python.stdout) as Result[];

const actual = corpus.cases.map((test) => {
  if (test.category === "topology") return runTopology(test);
  if (test.category === "anum") return runAnum(test);
  return runPersistence(test);
});

assert(expected.length === actual.length, "differential result cardinality mismatch");
expected.forEach((pythonResult, index) => {
  const tsResult = actual[index];
  assert(tsResult !== undefined, `missing TS result at ${index}`);
  assert(
    sameJson(pythonResult as unknown as Json, tsResult as unknown as Json),
    `differential mismatch for ${pythonResult.id}: Python=${JSON.stringify(pythonResult)} TS=${JSON.stringify(tsResult)}`,
  );
});
