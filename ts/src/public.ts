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

// M12b exports only operations that are meaningful at the consumer boundary.
// The role schemas they verify remain implementation vocabulary rather than
// standalone package entrypoints; callers use the top-level evidence shapes.
export {
  InterpreterReplayError,
  replayColonEffect,
  replayEqualityEvaluation,
  replayFlatReading,
  replayFlatSubselectionContinuation,
  replayFlatSubselectionReading,
  replayRelationStep,
  replayRelationSubselectionStep,
} from "./interpreter.js";
export type {
  ColonReplayEvidence,
  EqualityReplayEvidence,
  FlatReadingEvidence,
  RelationReplayEvidence,
} from "./interpreter.js";

export {
  SequenceReplayError,
  materializeSequence,
  replayResolvedSequenceGrouping,
  replayRootOpeningRestoration,
  replaySequenceMaterialization,
} from "./sequence.js";
export type {
  MaterializedEdge,
  SequenceDescription,
  SequenceItem,
  SequenceMaterializationEffect,
} from "./sequence.js";

export {
  DirectDeixisReplayError,
  analyzeDirectDeixisCarrier,
} from "./direct-deixis.js";
export type {
  DeicticOccurrence,
  DeicticPole,
  DirectDeixisVocabulary,
} from "./direct-deixis.js";

export {
  BUNDLE_KIND_ORDER,
  BundleElaborationError,
  ValueBundleReplayError,
  bundleRoleAt,
  elaborateBundleRoles,
  resolveFlatBundle,
  valuesEqual,
} from "./value-bundle.js";
export type {
  BundleElaboration,
  BundleNodeKind,
  BundleRole,
  BundleRoleAt,
  BundleValue,
  ExpectedRole,
  LinkValue,
  MtsValue,
  OccurrencePath,
  ResolvedOccurrence,
  ValueBundleVocabulary,
} from "./value-bundle.js";

export {
  RunReplayError,
  replayRun,
} from "./run.js";
export type {
  RunEvidence,
  RunReplayErrorCode,
  RunStepSelection,
} from "./run.js";

export {
  ProofRuleReplayError,
  replayDecomposeEqualRelations,
} from "./proof.js";
export type {
  DecomposeEqualityEvidence,
  ProofRuleReplayErrorCode,
} from "./proof.js";

export {
  IntegratedCheckerError,
  replayIntegratedProof,
} from "./checker.js";
export type {
  IntegratedCheckerErrorCode,
  IntegratedProofEvidence,
  ProofGoalSelection,
  ProofJudgmentSelection,
} from "./checker.js";
