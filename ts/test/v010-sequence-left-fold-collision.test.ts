import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  PersistentStore,
  type PersistentLinkId,
  type PersistentTopologyBackend,
  type StoredDataset,
} from "../src/persistent-store.js";
import {
  materializePersistentSequence,
  replayPersistentSequenceMaterialization,
  type PersistentSequenceDescription,
} from "../src/persistent-sequence.js";
import {
  materializeSequence,
  replaySequenceMaterialization,
  type SequenceDescription,
  type SequenceItem,
} from "../src/sequence.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function sameId(actual: PersistentLinkId, expected: PersistentLinkId, message: string): void {
  assert(
    actual.lineage === expected.lineage && actual.local === expected.local,
    `${message}: (${actual.lineage},${actual.local}) !== (${expected.lineage},${expected.local})`,
  );
}

const atom = (value: LinkHandle): SequenceItem => Object.freeze({ kind: "atom", value });
const description = (memory: Memory, ...items: SequenceItem[]): SequenceDescription =>
  Object.freeze({ root: memory.root, items: Object.freeze(items) });

const memory = new Memory();
const { L, U } = ensureRootBasis(memory);

// Concrete non-ROOT collision. A is an ordinary canonical START(B) Link:
// A = A -> B. Therefore the left-fold operation for [A,B] reuses A itself.
const B = L;
const A = memory.ensureStartSelfClosed(B);
assert(B !== memory.root, "B must be non-ROOT");
const polesA = memory.poles(A);
same(polesA.start, A, "A is START(B)");
same(polesA.end, B, "A payload is B");

const singleton = materializeSequence(memory, description(memory, atom(A)));
same(singleton.result, A, "left-fold singleton result");
same(singleton.created.length, 0, "singleton creates no fold edge");

const pair = materializeSequence(memory, description(memory, atom(A), atom(B)));
same(pair.result, A, "left-fold [A,B] collapses to the same result as [A]");
same(pair.created.length, 0, "A->B already exists as selfclosed A");
same(singleton.result, pair.result, "different descriptions share one left-fold result");

const beforeReplay = memory.linkCount;
same(replaySequenceMaterialization(memory, pair), A, "trusted replay accepts exact left-fold effect");
same(memory.linkCount, beforeReplay, "left-fold replay stays read-only");

// Accepted ExactSequence has a different responsibility: position-preserving
// carrier identity. It must distinguish [A] from [A,B] even though the explicit
// left-fold network materialization above has the same final Link.
const exactSingleton = materializeExactSequence(memory, [A]);
const exactPair = materializeExactSequence(memory, [A, B]);
assert(exactSingleton !== exactPair, "ExactSequence distinguishes [A] from [A,B]");
const decodedSingleton = readExactSequence(memory, exactSingleton);
const decodedPair = readExactSequence(memory, exactPair);
same(decodedSingleton.values.length, 1, "ExactSequence singleton length");
same(decodedSingleton.values[0], A, "ExactSequence singleton value");
same(decodedPair.values.length, 2, "ExactSequence pair length");
same(decodedPair.values[0], A, "ExactSequence pair first value");
same(decodedPair.values[1], B, "ExactSequence pair second value");

// Control: ordinary left-fold materialization is still a real write effect when
// the required pair does not already exist. The witness is about operation
// non-injectivity, not about materialization being generally inert.
assert(memory.find(L, U) === undefined, "control pair must start absent");
const ordinary = materializeSequence(memory, description(memory, atom(L), atom(U)));
same(ordinary.created.length, 1, "ordinary two-value fold creates one missing pair");
same(memory.poles(ordinary.result).start, L, "ordinary fold start");
same(memory.poles(ordinary.result).end, U, "ordinary fold end");

// Persistent sequence deliberately reuses the same generic left-fold operation.
// Its final result is therefore equally non-injective, while the operation
// evidence still carries the exact host description and write-effect boundary.
function clone(dataset: StoredDataset): StoredDataset {
  return JSON.parse(JSON.stringify(dataset)) as StoredDataset;
}

class Backend implements PersistentTopologyBackend {
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

const backend = new Backend();
const store = PersistentStore.create(backend, "left-fold-collision");
const pR = store.root;
const pO = store.materializeStartSelfClosed(pR);
const pC = store.materializeEndSelfClosed(pR);
const pL = store.materialize(pO, pC);
store.materialize(pC, pO); // complete the ordinary root basis
const pB = pL;
const pA = store.materializeStartSelfClosed(pB);

const persistent = (...values: PersistentLinkId[]): PersistentSequenceDescription =>
  Object.freeze({
    root: store.root,
    items: Object.freeze(values.map((value) => Object.freeze({ kind: "atom" as const, value }))),
  });

const pSingleton = materializePersistentSequence(store, persistent(pA));
const pPair = materializePersistentSequence(store, persistent(pA, pB));
sameId(pSingleton.result, pA, "persistent singleton result");
sameId(pPair.result, pA, "persistent [A,B] shares singleton result");
same(pSingleton.created.length, 0, "persistent singleton creates no fold edge");
same(pPair.created.length, 0, "persistent A->B reuses existing selfclosed A");
same(pSingleton.description.items.length, 1, "persistent evidence keeps singleton description");
same(pPair.description.items.length, 2, "persistent evidence keeps two-position description");

const countBeforePersistentReplay = store.count;
const commitsBeforePersistentReplay = backend.commits;
sameId(
  replayPersistentSequenceMaterialization(store, pPair),
  pA,
  "persistent trusted replay accepts exact zero-write effect",
);
same(store.count, countBeforePersistentReplay, "persistent replay stays read-only");
same(backend.commits, commitsBeforePersistentReplay, "persistent replay does not commit");
