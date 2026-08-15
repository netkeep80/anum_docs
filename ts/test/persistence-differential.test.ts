import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
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

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface PersistenceCase { readonly id: string; readonly operation: string; }
interface Corpus {
  readonly schema: string;
  readonly contract: string;
  readonly pythonOracleSha: string;
  readonly cases: readonly PersistenceCase[];
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
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}
function sameJson(left: Json, right: Json): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function clone(dataset: StoredDataset): StoredDataset {
  return JSON.parse(JSON.stringify(dataset)) as StoredDataset;
}

class MemoryBackend implements PersistentTopologyBackend {
  dataset: StoredDataset | undefined;
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
  }
}

function create(lineage = "fixture"): { readonly backend: MemoryBackend; readonly store: PersistentStore } {
  const backend = new MemoryBackend();
  return { backend, store: PersistentStore.create(backend, lineage) };
}

function basis(store: PersistentStore) {
  const root = store.root;
  const opening = store.materializeStartSelfClosed(root);
  const closing = store.materializeEndSelfClosed(root);
  const linked = store.materialize(opening, closing);
  const unlinked = store.materialize(closing, opening);
  return { root, opening, closing, linked, unlinked };
}

function signatures(root: number, links: readonly (readonly [number, number])[]): string[] {
  const known = new Map<number, string>([[root, "R"]]);
  const remaining = new Set<number>();
  for (let local = 0; local < links.length; local += 1) {
    if (local !== root) remaining.add(local);
  }
  while (remaining.size > 0) {
    let progressed = false;
    for (const local of [...remaining].sort((left, right) => left - right)) {
      const pair = links[local];
      assert(pair !== undefined, "persistence signature pair must exist");
      const [start, end] = pair;
      let signature: string | undefined;
      if (start === local && end !== local) {
        const endSignature = known.get(end);
        if (endSignature !== undefined) signature = `S(${endSignature})`;
      } else if (end === local && start !== local) {
        const startSignature = known.get(start);
        if (startSignature !== undefined) signature = `E(${startSignature})`;
      } else {
        const startSignature = known.get(start);
        const endSignature = known.get(end);
        if (startSignature !== undefined && endSignature !== undefined) {
          signature = `L(${startSignature},${endSignature})`;
        }
      }
      if (signature === undefined) continue;
      known.set(local, signature);
      remaining.delete(local);
      progressed = true;
    }
    assert(progressed, "persistence topology must be rooted for signature normalization");
  }
  return [...known.values()].sort();
}

function storeSignatures(store: PersistentStore): string[] {
  const snapshot = store.snapshot().topology;
  return signatures(snapshot.root, snapshot.links);
}

function sameDataset(left: StoredDataset | undefined, right: StoredDataset | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameId(left: PersistentLinkId, right: PersistentLinkId): boolean {
  return left.lineage === right.lineage && left.local === right.local;
}

function rejection(id: string, stateStable?: boolean): Result {
  return stateStable === undefined
    ? { id, accepted: false, error: "invalid-persistent-evidence" }
    : { id, accepted: false, error: "invalid-persistent-evidence", observable: { stateStable } };
}

function malformedBackend(
  links: readonly (readonly [number, number])[],
  root = 0,
): MemoryBackend {
  const backend = new MemoryBackend();
  backend.dataset = {
    schema: "mts-persistent-dataset/v0.1",
    lineage: "fixture",
    topology: { schema: STORAGE_TOPOLOGY_SCHEMA, root, links },
  };
  return backend;
}

function run(test: PersistenceCase): Result {
  if (["second-root", "duplicate-pair", "forward-cycle"].includes(test.operation)) {
    const links = test.operation === "second-root"
      ? [[0, 0], [1, 1]] as const
      : test.operation === "duplicate-pair"
        ? [[0, 0], [1, 0], [1, 0]] as const
        : [[0, 0], [2, 0], [1, 0]] as const;
    try {
      PersistentStore.open(malformedBackend(links));
    } catch (error) {
      if (error instanceof PersistentStoreError) return rejection(test.id);
      throw error;
    }
    throw new Error(`malformed persistent topology accepted: ${test.operation}`);
  }

  const { backend, store } = create();

  if (test.operation === "fresh-root") {
    const root = store.root;
    const before = store.snapshot();
    const reused = store.materialize(root, root);
    return {
      id: test.id,
      accepted: true,
      observable: {
        count: store.count,
        rootReused: sameId(reused, root),
        stateStable: JSON.stringify(store.snapshot()) === JSON.stringify(before),
        signatures: storeSignatures(store),
      },
    };
  }

  if (test.operation === "basis-loop") {
    const { root, opening, closing, linked, unlinked } = basis(store);
    const loop = store.materialize(linked, linked);
    const count = store.count;
    const idempotent =
      sameId(store.materializeStartSelfClosed(root), opening) &&
      sameId(store.materializeEndSelfClosed(root), closing) &&
      sameId(store.materialize(opening, closing), linked) &&
      sameId(store.materialize(closing, opening), unlinked) &&
      sameId(store.materialize(linked, linked), loop) && store.count === count;
    return {
      id: test.id,
      accepted: true,
      observable: {
        count: store.count,
        idempotent,
        loopDistinct: !sameId(loop, linked),
        signatures: storeSignatures(store),
      },
    };
  }

  if (test.operation === "reopen") {
    basis(store);
    const before = storeSignatures(store);
    const count = store.count;
    const lineage = store.lineage;
    const reopened = PersistentStore.open(backend);
    return {
      id: test.id,
      accepted: true,
      observable: {
        countStable: reopened.count === count,
        lineageStable: reopened.lineage === lineage,
        topologyStable: sameJson(storeSignatures(reopened), before),
        signatures: storeSignatures(reopened),
      },
    };
  }

  if (test.operation === "fresh-lineage") {
    basis(store);
    const firstSignatures = storeSignatures(store);
    const importedBackend = new MemoryBackend();
    importedBackend.dataset = {
      ...clone(store.snapshot()),
      lineage: "imported-lineage",
    };
    const imported = PersistentStore.open(importedBackend);
    return {
      id: test.id,
      accepted: true,
      observable: {
        countStable: imported.count === store.count,
        lineageChanged: imported.lineage !== store.lineage,
        topologyStable: sameJson(storeSignatures(imported), firstSignatures),
        signatures: storeSignatures(imported),
      },
    };
  }

  if (test.operation === "read-only") {
    const { opening, closing, linked } = basis(store);
    const before = store.snapshot();
    const exact = store.find(opening, closing);
    return {
      id: test.id,
      accepted: true,
      observable: {
        exact: exact !== undefined && sameId(exact, linked),
        outgoing: store.outgoing(opening).some((item) => sameId(item, linked)),
        incoming: store.incoming(closing).some((item) => sameId(item, linked)),
        allCount: store.allLinks().length,
        stateStable: JSON.stringify(store.snapshot()) === JSON.stringify(before),
      },
    };
  }

  if (test.operation === "batch-dependency") {
    const root = store.root;
    const results = store.materializeBatch([
      { start: { batch: 0 }, end: root },
      { start: root, end: { batch: 1 } },
      { start: { batch: 0 }, end: { batch: 1 } },
      { start: { batch: 1 }, end: { batch: 0 } },
    ]);
    const [opening, closing, linked, unlinked] = results;
    assert(opening !== undefined && closing !== undefined && linked !== undefined && unlinked !== undefined,
      "persistence batch fixture requires four results");
    const [openingStart, openingEnd] = store.poles(opening);
    const [closingStart, closingEnd] = store.poles(closing);
    const [linkedStart, linkedEnd] = store.poles(linked);
    const [unlinkedStart, unlinkedEnd] = store.poles(unlinked);
    return {
      id: test.id,
      accepted: true,
      observable: {
        count: store.count,
        polesCorrect:
          sameId(openingStart, opening) && sameId(openingEnd, root) &&
          sameId(closingStart, root) && sameId(closingEnd, closing) &&
          sameId(linkedStart, opening) && sameId(linkedEnd, closing) &&
          sameId(unlinkedStart, closing) && sameId(unlinkedEnd, opening),
        signatures: storeSignatures(store),
      },
    };
  }

  if (test.operation === "batch-double-self") {
    const root = store.root;
    const before = store.snapshot();
    const result = store.materializeBatch([{ start: { batch: 0 }, end: { batch: 0 } }]);
    return {
      id: test.id,
      accepted: true,
      observable: {
        returnedRoot: result.length === 1 && result[0] !== undefined && sameId(result[0], root),
        stateStable: JSON.stringify(store.snapshot()) === JSON.stringify(before),
      },
    };
  }

  if (test.operation === "runtime-prefix") {
    basis(store);
    const view = store.runtimeView(3);
    const image = store.snapshot().topology;
    return {
      id: test.id,
      accepted: true,
      observable: {
        count: view.memory.linkCount,
        signatures: signatures(image.root, image.links.slice(0, 3)),
      },
    };
  }

  if (test.operation === "forward-batch") {
    const before = store.snapshot();
    const backendBefore = backend.load();
    try {
      store.materializeBatch([
        { start: { batch: 1 }, end: store.root },
        { start: { batch: 0 }, end: store.root },
      ]);
    } catch (error) {
      if (error instanceof PersistentStoreError) {
        return rejection(
          test.id,
          JSON.stringify(store.snapshot()) === JSON.stringify(before) && sameDataset(backend.load(), backendBefore),
        );
      }
      throw error;
    }
    throw new Error("forward batch reference accepted");
  }

  if (test.operation === "foreign-id") {
    const foreign = create("foreign").store;
    try {
      store.poles(foreign.root);
    } catch (error) {
      if (error instanceof PersistentStoreError) return rejection(test.id);
      throw error;
    }
    throw new Error("foreign persistent id accepted");
  }

  if (test.operation === "invalid-coordinate") {
    const invalid = { lineage: store.lineage, local: true as unknown as number };
    try {
      store.poles(invalid);
    } catch (error) {
      if (error instanceof PersistentStoreError) return rejection(test.id);
      throw error;
    }
    throw new Error("boolean persistent coordinate accepted");
  }

  if (test.operation === "commit-failure") {
    const root = store.root;
    const before = store.snapshot();
    const backendBefore = backend.load();
    backend.failNext = true;
    let threw = false;
    try {
      store.materializeStartSelfClosed(root);
    } catch (error) {
      assert(error instanceof Error, "injected persistence commit failure must throw Error");
      threw = true;
    }
    return {
      id: test.id,
      accepted: true,
      observable: {
        threw,
        stateStable: JSON.stringify(store.snapshot()) === JSON.stringify(before) && sameDataset(backend.load(), backendBefore),
        failedLinkAbsent: store.outgoing(root).length === 1,
      },
    };
  }

  throw new Error(`unknown persistence differential operation: ${test.operation}`);
}

const repoRoot = resolve(process.cwd(), "..");
const fixturePath = resolve(repoRoot, "differential/persistence-fixtures-v0.7.json");
const corpus = JSON.parse(readFileSync(fixturePath, "utf8")) as Corpus;
assert(corpus.schema === "mts-persistence-differential-fixtures/v0.1", "unexpected persistence differential fixture schema");
assert(corpus.contract === "mts-contract/v0.7", "persistence differential fixtures must select accepted v0.7 contract");
assert(corpus.pythonOracleSha === "ef42d91a868bbc5b7004acc325006ad27db3bb68", "persistence fixtures must select frozen Python oracle");
const python = spawnSync(
  "python3",
  ["differential/persistence_python_oracle.py", "differential/persistence-fixtures-v0.7.json"],
  { cwd: repoRoot, encoding: "utf8" },
);
assert(python.status === 0, `frozen Python persistence oracle failed: ${python.stderr || python.stdout}`);
const expected = JSON.parse(python.stdout) as Result[];
const actual = corpus.cases.map(run);
assert(expected.length === actual.length, "persistence differential result cardinality mismatch");
expected.forEach((pythonResult, index) => {
  const tsResult = actual[index];
  assert(tsResult !== undefined, `missing TS persistence result at ${index}`);
  assert(
    sameJson(pythonResult as unknown as Json, tsResult as unknown as Json),
    `persistence differential mismatch for ${pythonResult.id}: Python=${JSON.stringify(pythonResult)} TS=${JSON.stringify(tsResult)}`,
  );
});
