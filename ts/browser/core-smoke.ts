import { Memory, ensureRootBasis } from "../src/memory.js";
import {
  deserializeAnum,
  normalizeRawForm,
  parseRawQuaternary,
  symbolicStackAlgebra,
} from "../src/anum.js";
import {
  PersistentStore,
  type PersistentTopologyBackend,
  type StoredDataset,
} from "../src/persistent-store.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`browser-core-smoke: ${message}`);
}

// Этот entry намеренно browser-neutral: только global ECMAScript и production TS core.
// Если import graph случайно потянет NodeJsonFileBackend/node:fs, esbuild platform=browser
// должен упасть ещё до выполнения этих проверок.
const memory = new Memory();
const { R, O, C, L, U } = ensureRootBasis(memory);
assert(memory.root === R, "root basis must reuse Memory.root");
assert(memory.find(O, C) === L, "O⟼C must resolve canonical L");
assert(memory.find(C, O) === U, "C⟼O must resolve canonical U");
const beforeReuse = memory.linkCount;
assert(memory.ensure(O, C) === L, "same ordered pair must reuse L");
assert(memory.linkCount === beforeReuse, "canonical pair reuse must not grow Memory");

const form = parseRawQuaternary("[10]");
assert(normalizeRawForm(form) === "[10]", "raw ANUM parsing must be shared with Node tests");
const denotation = deserializeAnum(form, symbolicStackAlgebra);
assert(denotation.operations.join(",") === "OPEN,VALUE,VALUE,CLOSE", "ANUM stack operations must match accepted traversal");

class BrowserMemoryBackend implements PersistentTopologyBackend {
  private dataset: StoredDataset | undefined;

  load(): StoredDataset | undefined {
    return this.dataset === undefined
      ? undefined
      : JSON.parse(JSON.stringify(this.dataset)) as StoredDataset;
  }

  commit(dataset: StoredDataset): void {
    this.dataset = JSON.parse(JSON.stringify(dataset)) as StoredDataset;
  }
}

const store = PersistentStore.create(new BrowserMemoryBackend(), "browser-smoke");
const persistentRoot = store.root;
const persistentOpening = store.materializeStartSelfClosed(persistentRoot);
const persistentClosing = store.materializeEndSelfClosed(persistentRoot);
const persistentLinked = store.materialize(persistentOpening, persistentClosing);
assert(store.find(persistentOpening, persistentClosing)?.local === persistentLinked.local, "storage-neutral persistent pair lookup must work in browser target");
const runtime = store.runtimeMemory();
assert(runtime.linkCount === store.count, "storage-neutral persistence must reconstruct the same core Memory topology");

// Node executes the browser-target bundle as a deterministic CI smoke after esbuild has
// already proved that the import graph is browser-resolvable. No DOM semantics are added.
