import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync as readTextFileSync } from "node:fs";
import {
  PersistentStore,
  PersistentStoreError,
  type PersistentLinkId,
} from "../src/persistent-store.js";
import {
  materializePersistentSequence,
  replayPersistentSequenceMaterialization,
  type PersistentSequenceDescription,
  type PersistentSequenceMaterialization,
} from "../src/persistent-sequence.js";
import { NodeJsonBackendError, NodeJsonFileBackend } from "../src/node-json-backend.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface SequenceCase { readonly id: string; readonly operation: string; }
interface Corpus {
  readonly schema: string;
  readonly contract: string;
  readonly pythonOracleSha: string;
  readonly cases: readonly SequenceCase[];
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
function sameId(left: PersistentLinkId, right: PersistentLinkId): boolean {
  return left.lineage === right.lineage && left.local === right.local;
}
function flat(root: PersistentLinkId, ...values: PersistentLinkId[]): PersistentSequenceDescription {
  return Object.freeze({
    root,
    items: Object.freeze(values.map((value) => Object.freeze({ kind: "atom" as const, value }))),
  });
}
function basis(store: PersistentStore) {
  const root = store.root;
  const opening = store.materializeStartSelfClosed(root);
  const closing = store.materializeEndSelfClosed(root);
  const linked = store.materialize(opening, closing);
  const unlinked = store.materialize(closing, opening);
  return { root, opening, closing, linked, unlinked };
}
function rejection(id: string, category = "invalid-persistent-sequence", observable?: Json): Result {
  return observable === undefined
    ? { id, accepted: false, error: category }
    : { id, accepted: false, error: category, observable };
}

class FailingReplaceBackend extends NodeJsonFileBackend {
  failNextReplace = false;
  protected override replaceTemporary(temporary: string): void {
    if (this.failNextReplace) {
      this.failNextReplace = false;
      throw new Error("injected pre-rename failure");
    }
    super.replaceTemporary(temporary);
  }
}

function materializationObservable(store: PersistentStore, before: number, evidence: PersistentSequenceMaterialization): Json {
  return {
    createdCount: evidence.created.length,
    countDelta: store.count - before,
    contiguous: evidence.created.every((edge, index) => edge.ref.local === evidence.beforeCount + index),
    resultIsLastCreated: evidence.created.length > 0 && sameId(evidence.result, evidence.created[evidence.created.length - 1]!.ref),
    replays: sameId(replayPersistentSequenceMaterialization(store, evidence), evidence.result),
  };
}

function run(test: SequenceCase): Result {
  const directory = mkdtempSync(join(tmpdir(), "mts-sequence-diff-"));
  try {
    const path = join(directory, "store.json");

    if (test.operation === "malformed-json") {
      writeFileSync(path, "{bad json\n", "utf8");
      const before = readFileSync(path);
      try {
        new NodeJsonFileBackend(path).load();
      } catch (error) {
        if (error instanceof NodeJsonBackendError) {
          return rejection(test.id, "invalid-json-backend", { bytesStable: readFileSync(path).equals(before) });
        }
        throw error;
      }
      throw new Error("malformed JSON accepted");
    }

    if (test.operation === "invalid-topology") {
      const payload = JSON.stringify({
        schema: "mts-persistent-dataset/v0.1",
        lineage: "bad",
        topology: { schema: "mts-storage-topology/v0.1", root: 0, links: [[0, 0], [1, 1]] },
      });
      writeFileSync(path, payload, "utf8");
      const before = readFileSync(path);
      try {
        PersistentStore.open(new NodeJsonFileBackend(path));
      } catch (error) {
        if (error instanceof PersistentStoreError) {
          return rejection(test.id, "invalid-json-backend", { bytesStable: readFileSync(path).equals(before) });
        }
        throw error;
      }
      throw new Error("invalid JSON topology accepted");
    }

    const store = PersistentStore.create(new NodeJsonFileBackend(path), "fixture");

    if (test.operation === "empty") {
      const before = store.count;
      const evidence = materializePersistentSequence(store, Object.freeze({ root: store.root, items: Object.freeze([]) }));
      return { id: test.id, accepted: true, observable: {
        rootResult: sameId(evidence.result, store.root),
        createdCount: evidence.created.length,
        countDelta: store.count - before,
      } };
    }

    if (test.operation === "nested-empty") {
      const before = store.count;
      const evidence = materializePersistentSequence(store, Object.freeze({
        root: store.root,
        items: Object.freeze([Object.freeze({ kind: "group" as const, items: Object.freeze([]) })]),
      }));
      return { id: test.id, accepted: true, observable: {
        rootResult: sameId(evidence.result, store.root),
        createdCount: evidence.created.length,
        countDelta: store.count - before,
      } };
    }

    const { root, opening, closing, linked } = basis(store);

    if (test.operation === "reuse-basis-pair") {
      const before = store.count;
      const evidence = materializePersistentSequence(store, flat(store.root, opening, closing));
      return { id: test.id, accepted: true, observable: {
        createdCount: evidence.created.length,
        countDelta: store.count - before,
        resultIsLinked: sameId(evidence.result, linked),
        replays: sameId(replayPersistentSequenceMaterialization(store, evidence), linked),
      } };
    }

    const a = store.materialize(opening, opening);
    const b = store.materialize(closing, closing);

    if (test.operation === "three-value") {
      const c = store.materialize(linked, linked);
      const before = store.count;
      const evidence = materializePersistentSequence(store, flat(store.root, a, b, c));
      const observable = materializationObservable(store, before, evidence) as Record<string, Json>;
      observable.exactTwoCreated = evidence.created.length === 2;
      if (evidence.created.length === 2) {
        const [first, second] = evidence.created;
        observable.leftFoldPoles = first !== undefined && second !== undefined &&
          sameId(first.start, a) && sameId(first.end, b) && sameId(second.start, first.ref) && sameId(second.end, c);
      } else observable.leftFoldPoles = false;
      return { id: test.id, accepted: true, observable };
    }

    if (test.operation === "prefix-reuse") {
      const prefix = store.materialize(a, b);
      const before = store.count;
      const evidence = materializePersistentSequence(store, flat(store.root, a, b, opening));
      return { id: test.id, accepted: true, observable: {
        createdCount: evidence.created.length,
        countDelta: store.count - before,
        oneSuffix: evidence.created.length === 1,
        suffixStartsPrefix: evidence.created.length > 0 && sameId(evidence.created[0]!.start, prefix),
        replays: sameId(replayPersistentSequenceMaterialization(store, evidence), evidence.result),
      } };
    }

    if (test.operation === "repeat") {
      const description = flat(store.root, a, b, opening);
      const first = materializePersistentSequence(store, description);
      const afterFirst = store.count;
      const second = materializePersistentSequence(store, description);
      return { id: test.id, accepted: true, observable: {
        firstCreated: first.created.length,
        secondCreated: second.created.length,
        countStable: store.count === afterFirst,
        sameResult: sameId(second.result, first.result),
      } };
    }

    if (test.operation === "nested-group") {
      const description: PersistentSequenceDescription = Object.freeze({
        root,
        items: Object.freeze([
          Object.freeze({ kind: "atom" as const, value: opening }),
          Object.freeze({ kind: "group" as const, items: Object.freeze([
            Object.freeze({ kind: "atom" as const, value: closing }),
            Object.freeze({ kind: "atom" as const, value: opening }),
          ]) }),
          Object.freeze({ kind: "atom" as const, value: linked }),
        ]),
      });
      const before = store.count;
      const evidence = materializePersistentSequence(store, description);
      const observable = materializationObservable(store, before, evidence) as Record<string, Json>;
      observable.createdNonzero = evidence.created.length > 0;
      return { id: test.id, accepted: true, observable };
    }

    const description = flat(store.root, a, b, opening);
    const evidence = materializePersistentSequence(store, description);

    if (test.operation === "reopen-replay") {
      const beforeCount = store.count;
      const lineage = store.lineage;
      const beforeBytes = readFileSync(path);
      const reopened = PersistentStore.open(new NodeJsonFileBackend(path));
      const result = replayPersistentSequenceMaterialization(reopened, evidence);
      return { id: test.id, accepted: true, observable: {
        sameLineage: reopened.lineage === lineage,
        sameCount: reopened.count === beforeCount,
        sameResult: sameId(result, evidence.result),
        readOnlyBytes: readFileSync(path).equals(beforeBytes),
      } };
    }

    if (test.operation === "forged-pole") {
      const first = evidence.created[0];
      assert(first !== undefined, "forged-pole fixture requires created edge");
      const forged: PersistentSequenceMaterialization = Object.freeze({
        ...evidence,
        created: Object.freeze([Object.freeze({ ...first, start: opening }), ...evidence.created.slice(1)]),
      });
      try { replayPersistentSequenceMaterialization(store, forged); }
      catch (error) { if (error instanceof PersistentStoreError) return rejection(test.id); throw error; }
      throw new Error("forged persistent sequence pole accepted");
    }

    if (test.operation === "missing-created") {
      const forged: PersistentSequenceMaterialization = Object.freeze({ ...evidence, created: Object.freeze(evidence.created.slice(1)) });
      try { replayPersistentSequenceMaterialization(store, forged); }
      catch (error) { if (error instanceof PersistentStoreError) return rejection(test.id); throw error; }
      throw new Error("missing persistent sequence edge accepted");
    }

    if (test.operation === "forged-result") {
      const forged: PersistentSequenceMaterialization = Object.freeze({ ...evidence, result: opening });
      try { replayPersistentSequenceMaterialization(store, forged); }
      catch (error) { if (error instanceof PersistentStoreError) return rejection(test.id); throw error; }
      throw new Error("forged persistent sequence result accepted");
    }

    if (test.operation === "wrong-before") {
      const forged: PersistentSequenceMaterialization = Object.freeze({ ...evidence, beforeCount: evidence.beforeCount - 1 });
      try { replayPersistentSequenceMaterialization(store, forged); }
      catch (error) { if (error instanceof PersistentStoreError) return rejection(test.id); throw error; }
      throw new Error("wrong persistent sequence beforeCount accepted");
    }

    if (test.operation === "foreign-atom") {
      const foreignPath = join(directory, "foreign.json");
      const foreign = PersistentStore.create(new NodeJsonFileBackend(foreignPath), "foreign");
      try { materializePersistentSequence(store, flat(store.root, opening, foreign.root)); }
      catch (error) { if (error instanceof PersistentStoreError) return rejection(test.id); throw error; }
      throw new Error("foreign persistent sequence atom accepted");
    }

    if (test.operation === "atomic-failure") {
      const atomicPath = join(directory, "atomic.json");
      const backend = new FailingReplaceBackend(atomicPath);
      const atomic = PersistentStore.create(backend, "atomic");
      const { opening: atomicOpening } = basis(atomic);
      const beforeBytes = readFileSync(atomicPath);
      const beforeCount = atomic.count;
      backend.failNextReplace = true;
      let threw = false;
      try { atomic.materialize(atomicOpening, atomicOpening); }
      catch (error) { assert(error instanceof NodeJsonBackendError, "atomic failure must surface NodeJsonBackendError"); threw = true; }
      return { id: test.id, accepted: true, observable: {
        threw,
        countStable: atomic.count === beforeCount,
        bytesStable: readFileSync(atomicPath).equals(beforeBytes),
        failedLinkAbsent: atomic.find(atomicOpening, atomicOpening) === undefined,
      } };
    }

    throw new Error(`unknown persistent sequence differential operation: ${test.operation}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const repoRoot = resolve(process.cwd(), "..");
const fixturePath = resolve(repoRoot, "differential/persistent-sequence-fixtures-v0.7.json");
const corpus = JSON.parse(readTextFileSync(fixturePath, "utf8")) as Corpus;
assert(corpus.schema === "mts-persistent-sequence-differential-fixtures/v0.1", "unexpected persistent sequence differential fixture schema");
assert(corpus.contract === "mts-contract/v0.7", "persistent sequence fixtures must select accepted v0.7 contract");
assert(corpus.pythonOracleSha === "ef42d91a868bbc5b7004acc325006ad27db3bb68", "persistent sequence fixtures must select frozen Python oracle");
const python = spawnSync(
  "python3",
  ["differential/persistent_sequence_python_oracle.py", "differential/persistent-sequence-fixtures-v0.7.json"],
  { cwd: repoRoot, encoding: "utf8" },
);
assert(python.status === 0, `frozen Python persistent sequence oracle failed: ${python.stderr || python.stdout}`);
const expected = JSON.parse(python.stdout) as Result[];
const actual = corpus.cases.map(run);
assert(expected.length === actual.length, "persistent sequence differential result cardinality mismatch");
expected.forEach((pythonResult, index) => {
  const tsResult = actual[index];
  assert(tsResult !== undefined, `missing TS persistent sequence result at ${index}`);
  assert(
    sameJson(pythonResult as unknown as Json, tsResult as unknown as Json),
    `persistent sequence differential mismatch for ${pythonResult.id}: Python=${JSON.stringify(pythonResult)} TS=${JSON.stringify(tsResult)}`,
  );
});
