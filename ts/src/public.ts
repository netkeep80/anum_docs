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
  replayColonEffect as replayDefinitionEffect,
  replayEqualityEvaluation,
  replayFlatReading,
  replayFlatSubselectionContinuation,
  replayFlatSubselectionReading,
  replayRelationStep,
  replayRelationSubselectionStep,
} from "./interpreter.js";
export type {
  ColonReplayEvidence,
  ColonReplayEvidence as DefinitionReplayEvidence,
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
  StructuralAssumptionReplayError,
  StructuralDerivationReplayError,
  StructuralJudgmentReplayError,
  StructuralTheoremReplayError,
  StructuralTheoremReuseReplayError,
  replayStructuralDerivation,
  replayStructuralDerivationWithAssumptions,
  replayStructuralDerivationWithTheorems,
  replayStructuralJudgment,
  replayStructuralTheorem,
} from "./derivation.js";
export type {
  StructuralAssumptionReplayErrorCode,
  StructuralDerivationEvidence,
  StructuralDerivationNodeEvidence,
  StructuralDerivationReplayErrorCode,
  StructuralDerivationReplayResult,
  StructuralDerivationWithAssumptionsEvidence,
  StructuralDerivationWithAssumptionsReplayResult,
  StructuralDerivationWithTheoremsEvidence,
  StructuralDerivationWithTheoremsReplayResult,
  StructuralJudgment,
  StructuralJudgmentEvidence,
  StructuralJudgmentReplayErrorCode,
  StructuralJudgmentReplayResult,
  StructuralTheorem,
  StructuralTheoremEvidence,
  StructuralTheoremReplayErrorCode,
  StructuralTheoremReplayResult,
  StructuralTheoremReuseReplayErrorCode,
} from "./derivation.js";

export {
  PORTABLE_MTS_SEMANTIC_BASE,
  PORTABLE_STRUCTURAL_DERIVATION_SCHEMA,
  PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_SCHEMA,
  PortableStructuralDerivationError,
  exportPortableStructuralDerivation,
  exportPortableStructuralDerivationWithAssumptions,
  replayPortableStructuralDerivation,
  replayPortableStructuralDerivationWithAssumptions,
} from "./portable-derivation.js";
export type {
  PortableStructuralDerivationArtifact,
  PortableStructuralDerivationErrorCode,
  PortableStructuralDerivationReplayResult,
  PortableStructuralDerivationWithAssumptionsArtifact,
  PortableStructuralDerivationWithAssumptionsReplayResult,
} from "./portable-derivation.js";

export {
  PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME,
  PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_CONTENT_DIGEST_SCHEME,
  computePortableStructuralDerivationContentDigest,
  computePortableStructuralDerivationWithAssumptionsContentDigest,
} from "./portable-derivation-digest.js";
export type {
  PortableStructuralDerivationContentDigest,
  PortableStructuralDerivationWithAssumptionsContentDigest,
} from "./portable-derivation-digest.js";

export {
  PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_DIGEST_SCHEME,
  PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_SCHEMA,
  PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_DIGEST_SCHEME,
  PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_SCHEMA,
  PortableStructuralDerivationProvenanceError,
  computePortableStructuralDerivationProvenanceDigest,
  computePortableStructuralDerivationWithAssumptionsProvenanceDigest,
  createPortableStructuralDerivationProvenanceClaim,
  createPortableStructuralDerivationWithAssumptionsProvenanceClaim,
  verifyPortableStructuralDerivationProvenanceClaim,
  verifyPortableStructuralDerivationWithAssumptionsProvenanceClaim,
} from "./portable-derivation-provenance.js";
export type {
  PortableStructuralDerivationProducerProvenance,
  PortableStructuralDerivationProvenanceClaim,
  PortableStructuralDerivationProvenanceDigest,
  PortableStructuralDerivationProvenanceErrorCode,
  PortableStructuralDerivationSourceProvenance,
  PortableStructuralDerivationWithAssumptionsProvenanceClaim,
  PortableStructuralDerivationWithAssumptionsProvenanceDigest,
} from "./portable-derivation-provenance.js";

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
