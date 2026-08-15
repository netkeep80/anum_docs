import * as publicApi from "../src/public.js";
import type {
  AnumForm,
  LinkHandle,
  PersistentSequenceDescription,
  PersistentTopologyBackend,
  ReadMemory,
  StackAlgebra,
  StoredDataset,
  WriteMemory,
} from "../src/public.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`public-api: ${message}`);
}

const expectedRuntimeExports = [
  "IncrementalQuaternaryDecoder",
  "Memory",
  "MemoryError",
  "PersistentStore",
  "PersistentStoreError",
  "QuaternaryDecodeError",
  "StreamError",
  "deserializeAnum",
  "deserializeStream",
  "ensureRootBasis",
  "executeAbits",
  "materializePersistentSequence",
  "normalizeRawForm",
  "parseRawQuaternary",
  "replayPersistentSequenceMaterialization",
  "symbolicStackAlgebra",
].sort();

assert(
  JSON.stringify(Object.keys(publicApi).sort()) === JSON.stringify(expectedRuntimeExports),
  `unexpected runtime exports: ${Object.keys(publicApi).sort().join(",")}`,
);

// Compile-time smoke for the intended consumer types. White-box capabilities and
// role/evidence plumbing intentionally remain available only from internal modules.
const read: ReadMemory | undefined = undefined;
const write: WriteMemory | undefined = undefined;
const link: LinkHandle | undefined = undefined;
const form: AnumForm | undefined = undefined;
const algebra: StackAlgebra<string> | undefined = undefined;
const backend: PersistentTopologyBackend | undefined = undefined;
const dataset: StoredDataset | undefined = undefined;
const sequence: PersistentSequenceDescription | undefined = undefined;
void [read, write, link, form, algebra, backend, dataset, sequence];
