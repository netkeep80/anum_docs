export {
  Memory,
  MemoryError,
  ensureRootBasis,
} from "./memory.js";
export type {
  LinkHandle,
  LinkPoles,
  ReadMemory,
  RootBasis,
  WriteMemory,
} from "./memory.js";

export {
  IncrementalQuaternaryDecoder,
  QuaternaryDecodeError,
  StreamError,
  deserializeAnum,
  deserializeStream,
  executeAbits,
  normalizeRawForm,
  parseRawQuaternary,
  symbolicStackAlgebra,
} from "./anum.js";
export type {
  Abit,
  AnumForm,
  AnumToken,
  StackAlgebra,
  StackOperation,
  StreamDenotation,
  StreamErrorCode,
} from "./anum.js";

export {
  PersistentStore,
  PersistentStoreError,
} from "./persistent-store.js";
export type {
  BatchEndpoint,
  BatchLink,
  BatchRef,
  PersistentLinkId,
  PersistentRuntimeView,
  PersistentTopologyBackend,
  StoredDataset,
} from "./persistent-store.js";

export {
  materializePersistentSequence,
  replayPersistentSequenceMaterialization,
} from "./persistent-sequence.js";
export type {
  PersistentMaterializedEdge,
  PersistentSequenceDescription,
  PersistentSequenceItem,
  PersistentSequenceMaterialization,
} from "./persistent-sequence.js";
