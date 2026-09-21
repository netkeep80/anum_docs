import * as publicApi from "../src/public.js";
import type {
  AnumForm,
  DecomposeEqualityEvidence,
  DefinitionReplayEvidence,
  DirectDeixisVocabulary,
  IntegratedProofEvidence,
  LinkHandle,
  MaterializedQuaternaryAnum,
  MtsValue,
  PersistentSequenceDescription,
  PersistentTopologyBackend,
  PortableStructuralDerivationArtifact,
  PortableStructuralDerivationContentDigest,
  PortableStructuralDerivationErrorCode,
  PortableStructuralDerivationProducerProvenance,
  PortableStructuralDerivationProvenanceClaim,
  PortableStructuralDerivationProvenanceDigest,
  PortableStructuralDerivationProvenanceErrorCode,
  PortableStructuralDerivationReplayResult,
  PortableStructuralDerivationSourceProvenance,
  PortableStructuralDerivationWithAssumptionsArtifact,
  PortableStructuralDerivationWithAssumptionsContentDigest,
  PortableStructuralDerivationWithAssumptionsProvenanceClaim,
  PortableStructuralDerivationWithAssumptionsProvenanceDigest,
  PortableStructuralDerivationWithAssumptionsReplayResult,
  PortableStructuralProofReplayResult,
  ReadMemory,
  QuaternaryAnumHierarchy,
  QuaternaryAnumItem,
  ReadV012StringAnum,
  RelationReplayEvidence,
  RunEvidence,
  SequenceDescription,
  StackAlgebra,
  StoredDataset,
  StructuralDerivationEvidence,
  StructuralDerivationWithAssumptionsEvidence,
  StructuralDerivationWithAssumptionsReplayResult,
  StructuralDerivationWithTheoremsEvidence,
  SourceFrontEndEvidence,
  StructuralJudgmentEvidence,
  StructuralRuleReplayEvidence,
  StructuralRuleReplayResult,
  StructuralScopedDerivationEvidence,
  StructuralScopedDerivationReplayResult,
  StructuralTheoremEvidence,
  V012SourceAuthority,
  V012SourceContent,
  V012SourceResultErrorCode,
  V012SourceResultEvidence,
  V012SourceResultReplayResult,
  WriteMemory,
} from "../src/public.js";

// These capabilities and implementation vocabularies are deliberately not part
// of the package root. If one leaks into public.ts, the now-unused directive
// makes typecheck fail instead of silently widening the API.
// @ts-expect-error M12 keeps append-order replay capability internal.
import type { AppendOnlyReadMemory } from "../src/public.js";
// @ts-expect-error M12 keeps topology enumeration capability internal.
import type { EnumerableReadMemory } from "../src/public.js";
// @ts-expect-error Consumers use RelationReplayEvidence, not standalone role plumbing.
import type { RelationRoles } from "../src/public.js";
// @ts-expect-error P6d keeps nested portable transport coordinate plumbing internal.
import type { PortableStructuralDerivationNode } from "../src/public.js";
// @ts-expect-error P6i keeps portable canonical JSON normalization internal.
type InternalCanonicalPortableStructuralDerivationV02Json = typeof import("../src/public.js").canonicalPortableStructuralDerivationV02Json;
// @ts-expect-error P6q keeps conditional portable canonical JSON normalization internal.
type InternalCanonicalPortableStructuralDerivationWithAssumptionsV01Json = typeof import("../src/public.js").canonicalPortableStructuralDerivationWithAssumptionsV01Json;
// @ts-expect-error P6k keeps provenance canonical JSON normalization internal.
type InternalCanonicalPortableStructuralDerivationProvenanceClaimJson = typeof import("../src/public.js").canonicalPortableStructuralDerivationProvenanceClaimJson;
// @ts-expect-error P6s keeps conditional provenance canonical JSON normalization internal.
type InternalCanonicalPortableStructuralDerivationWithAssumptionsProvenanceClaimJson = typeof import("../src/public.js").canonicalPortableStructuralDerivationWithAssumptionsProvenanceClaimJson;

// @ts-expect-error P3b keeps assumption construction internal; consumers submit materialized evidence.
type InternalAssumptionContextConstructor = typeof import("../src/public.js").defineStructuralAssumptionContext;
// @ts-expect-error C7 keeps source evidence production internal.
type InternalV012SourceBuilder = typeof import("../src/public.js").buildV012SelectedSourceEvidence;
// @ts-expect-error C7 keeps structural Rule construction/admission internal.
type InternalStructuralRuleBuilder = typeof import("../src/public.js").defineStructuralRule;
// @ts-expect-error C7 keeps structural Rule admission internal.
type InternalStructuralRuleAdmission = typeof import("../src/public.js").admitStructuralRule;
// @ts-expect-error C7 keeps lower v0.12 authority plumbing internal; consumers use the composite verifier.
type InternalV012TheoryRuleReplay = typeof import("../src/public.js").replayV012StructuralRuleAgainstTheoryAuthority;
// @ts-expect-error C7 keeps selected-Act view plumbing internal; consumers use the composite verifier.
type InternalV012SelectedRuleReplay = typeof import("../src/public.js").replayV012StructuralRuleAgainstSelectedEvidence;
// @ts-expect-error C7 keeps source-authority plumbing internal; consumers use the composite verifier.
type InternalV012SourceAuthorityReplay = typeof import("../src/public.js").replayV012SelectedSourceEvidenceAgainstAuthority;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`public-api: ${message}`);
}

const expectedRuntimeExports = [
  "BUNDLE_KIND_ORDER",
  "BundleElaborationError",
  "DirectDeixisReplayError",
  "IncrementalQuaternaryDecoder",
  "IntegratedCheckerError",
  "InterpreterReplayError",
  "Memory",
  "MemoryError",
  "PORTABLE_MTS_SEMANTIC_BASE",
  "PORTABLE_PROOF_SUBANET_PROJECTION_CONTENT_DIGEST_SCHEME",
  "PORTABLE_PROOF_SUBANET_PROJECTION_SCHEMA",
  "PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME",
  "PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_DIGEST_SCHEME",
  "PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_SCHEMA",
  "PORTABLE_STRUCTURAL_DERIVATION_SCHEMA",
  "PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_CONTENT_DIGEST_SCHEME",
  "PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_DIGEST_SCHEME",
  "PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_SCHEMA",
  "PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_SCHEMA",
  "PORTABLE_STRUCTURAL_DERIVATION_WITH_THEOREMS_CONTENT_DIGEST_SCHEME",
  "PORTABLE_STRUCTURAL_DERIVATION_WITH_THEOREMS_PROVENANCE_DIGEST_SCHEME",
  "PORTABLE_STRUCTURAL_DERIVATION_WITH_THEOREMS_PROVENANCE_SCHEMA",
  "PORTABLE_STRUCTURAL_DERIVATION_WITH_THEOREMS_SCHEMA",
  "PORTABLE_STRUCTURAL_THEORY_REVISION_SCHEME",
  "PORTABLE_STRUCTURAL_THEORY_SCHEMA",
  "PersistentStore",
  "PersistentStoreError",
  "PortableProofSubAnetProjectionError",
  "PortableStructuralDerivationError",
  "PortableStructuralDerivationProvenanceError",
  "PortableStructuralTheoryError",
  "ProofRuleReplayError",
  "QuaternaryAnumError",
  "QuaternaryDecodeError",
  "RunReplayError",
  "SequenceReplayError",
  "SourceError",
  "StreamError",
  "StructuralAssumptionReplayError",
  "StructuralDerivationReplayError",
  "StructuralJudgmentReplayError",
  "StructuralRuleError",
  "StructuralScopedDerivationReplayError",
  "StructuralTheoremReplayError",
  "StructuralTheoremReuseReplayError",
  "V012SourceResultError",
  "V012StringAnumError",
  "V013FormalAspectEvaluationError",
  "V013HierarchicalCarrierError",
  "V013RelativeFormMaterializationError",
  "V013RelativePoleExecutionError",
  "ValueBundleReplayError",
  "analyzeDirectDeixisCarrier",
  "bundleRoleAt",
  "computePortableProofSubAnetProjectionContentDigest",
  "computePortableStructuralDerivationContentDigest",
  "computePortableStructuralDerivationProvenanceDigest",
  "computePortableStructuralDerivationWithAssumptionsContentDigest",
  "computePortableStructuralDerivationWithAssumptionsProvenanceDigest",
  "computePortableStructuralDerivationWithTheoremsContentDigest",
  "computePortableStructuralDerivationWithTheoremsProvenanceDigest",
  "computePortableStructuralTheoryRevision",
  "createPortableStructuralDerivationProvenanceClaim",
  "createPortableStructuralDerivationWithAssumptionsProvenanceClaim",
  "createPortableStructuralDerivationWithTheoremsProvenanceClaim",
  "createStructuralProofProducer",
  "decomposeV013SemanticLink",
  "deserializeAnum",
  "deserializeStream",
  "elaborateBundleRoles",
  "ensureRootBasis",
  "evaluateV013FormalAspectProgram",
  "executeAuthorizedRelativePoleSource",
  "executeAbits",
  "exportPortableProofSubAnetProjection",
  "exportPortableStructuralDerivation",
  "exportPortableStructuralDerivationWithAssumptions",
  "exportPortableStructuralDerivationWithTheorems",
  "exportPortableStructuralTheory",
  "materializeHeterogeneousDerivedClosedRootedDischarge",
  "materializeHeterogeneousDerivedOpenRootedExpansion",
  "materializeAuthorizedBinaryLinkSource",
  "materializeAuthorizedRelativeUnaryFormSource",
  "materializePersistentSequence",
  "materializeQuaternaryAnum",
  "materializeQuaternaryAnumTarget",
  "materializeSequence",
  "materializeV012SourceContent",
  "materializeV012StringAnum",
  "materializeV012StringByteAnum",
  "materializeV013HierarchicalCarrier",
  "materializeV013HierarchicalCarrierFromSemanticLink",
  "normalizeRawForm",
  "parseRawQuaternary",
  "readV012SourceContent",
  "readV012StringAnum",
  "readV012StringByteAnum",
  "replayClosedProofOccurrence",
  "replayColonEffect",
  "replayDefinitionEffect",
  "replayDecomposeEqualRelations",
  "replayEqualityEvaluation",
  "replayFlatReading",
  "replayFlatSubselectionContinuation",
  "replayFlatSubselectionReading",
  "replayIntegratedProof",
  "replayPersistentSequenceMaterialization",
  "replayPortableProofSubAnetProjection",
  "replayPortableStructuralDerivation",
  "replayPortableStructuralDerivationWithAssumptions",
  "replayPortableStructuralDerivationWithTheorems",
  "replayPortableStructuralProof",
  "replayPortableStructuralTheory",
  "replayProofSubAnetProjection",
  "replayRelationStep",
  "replayRelationSubselectionStep",
  "replayResolvedSequenceGrouping",
  "replayRootOpeningRestoration",
  "replayRun",
  "replaySequenceMaterialization",
  "replayStructuralDerivation",
  "replayStructuralDerivationWithAssumptions",
  "replayStructuralDerivationWithTheorems",
  "replayStructuralHeterogeneousDerivedClosedRootedInstance",
  "replayStructuralHeterogeneousDerivedDerivationSchema",
  "replayStructuralHeterogeneousDerivedOpenRootedInstance",
  "replayStructuralJudgment",
  "replayStructuralRule",
  "replayStructuralScopedDerivation",
  "replayStructuralTheorem",
  "replayV012SelectedSourceEvidence",
  "replayV012SourceResultEvidence",
  "resolveFlatBundle",
  "resolveQuaternaryAnum",
  "serializeMaterializedQuaternaryAnum",
  "serializeV012StringAnum",
  "serializeV013HierarchicalCarrier",
  "symbolicStackAlgebra",
  "valuesEqual",
  "verifyPortableProofSubAnetProjectionTheoryRevision",
  "verifyPortableStructuralDerivationProvenanceClaim",
  "verifyPortableStructuralDerivationWithAssumptionsProvenanceClaim",
  "verifyPortableStructuralDerivationWithTheoremsProvenanceClaim",
  "verifyPortableStructuralProofTheoryRevision",
].sort();

assert(expectedRuntimeExports.length === 144, "public runtime export budget must be exactly 144 after bounded v0.13 facade projection");
assert(
  JSON.stringify(Object.keys(publicApi).sort()) === JSON.stringify(expectedRuntimeExports),
  `unexpected runtime exports: ${Object.keys(publicApi).sort().join(",")}`,
);
assert(
  publicApi.replayDefinitionEffect === publicApi.replayColonEffect,
  "definition replay must be a behavior-preserving alias of legacy colon replay",
);
assert(
  publicApi.PORTABLE_STRUCTURAL_DERIVATION_SCHEMA === "mts-portable-structural-derivation/v0.1",
  "portable derivation schema must stay pinned",
);
assert(
  publicApi.PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_SCHEMA ===
    "mts-portable-structural-derivation-with-assumptions/v0.1",
  "portable conditional derivation schema must stay pinned",
);
assert(
  publicApi.PORTABLE_MTS_SEMANTIC_BASE === "mts-contract/v0.11",
  "portable derivation semantic base must stay pinned",
);
assert(
  publicApi.PORTABLE_PROOF_SUBANET_PROJECTION_SCHEMA ===
    "mts-portable-proof-subanet-projection/v0.1",
  "portable proof-Anet projection schema must stay pinned",
);
assert(
  publicApi.PORTABLE_PROOF_SUBANET_PROJECTION_CONTENT_DIGEST_SCHEME ===
    "mts-portable-proof-subanet-projection-content/sha-256/v0.1",
  "portable proof-Anet projection digest scheme must stay pinned",
);
assert(
  publicApi.PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME ===
    "mts-portable-structural-derivation-content/sha-256/v0.1",
  "portable derivation content digest scheme must stay pinned",
);
assert(
  publicApi.PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_CONTENT_DIGEST_SCHEME ===
    "mts-portable-structural-derivation-with-assumptions-content/sha-256/v0.1",
  "portable conditional derivation content digest scheme must stay pinned",
);
assert(
  publicApi.PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_SCHEMA ===
    "mts-portable-structural-derivation-provenance/v0.1",
  "portable derivation provenance schema must stay pinned",
);
assert(
  publicApi.PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_DIGEST_SCHEME ===
    "mts-portable-structural-derivation-provenance/sha-256/v0.1",
  "portable derivation provenance digest scheme must stay pinned",
);
assert(
  publicApi.PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_SCHEMA ===
    "mts-portable-structural-derivation-with-assumptions-provenance/v0.1",
  "portable conditional derivation provenance schema must stay pinned",
);
assert(
  publicApi.PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_PROVENANCE_DIGEST_SCHEME ===
    "mts-portable-structural-derivation-with-assumptions-provenance/sha-256/v0.1",
  "portable conditional derivation provenance digest scheme must stay pinned",
);

// Compile-time smoke for the intended consumer concepts. The top-level evidence
// shapes are public because callers must provide them, while their nested role
// schemas are intentionally not separate package-root vocabulary.
const read: ReadMemory | undefined = undefined;
const write: WriteMemory | undefined = undefined;
const link: LinkHandle | undefined = undefined;
const form: AnumForm | undefined = undefined;
const algebra: StackAlgebra<string> | undefined = undefined;
const backend: PersistentTopologyBackend | undefined = undefined;
const dataset: StoredDataset | undefined = undefined;
const persistentSequence: PersistentSequenceDescription | undefined = undefined;
const sequence: SequenceDescription | undefined = undefined;
const qHierarchy: QuaternaryAnumHierarchy | undefined = undefined;
const qItem: QuaternaryAnumItem | undefined = undefined;
const qMaterialized: MaterializedQuaternaryAnum | undefined = undefined;
const stringRead: ReadV012StringAnum | undefined = undefined;
const sourceEvidence: SourceFrontEndEvidence | undefined = undefined;
const sourceAuthority: V012SourceAuthority | undefined = undefined;
const sourceContent: V012SourceContent | undefined = undefined;
const sourceResultErrorCode: V012SourceResultErrorCode | undefined = undefined;
const sourceResultEvidence: V012SourceResultEvidence | undefined = undefined;
const sourceResultReplay: V012SourceResultReplayResult | undefined = undefined;
const structuralRuleEvidence: StructuralRuleReplayEvidence | undefined = undefined;
const structuralRuleResult: StructuralRuleReplayResult | undefined = undefined;
const relation: RelationReplayEvidence | undefined = undefined;
const definition: DefinitionReplayEvidence | undefined = undefined;
const deixis: DirectDeixisVocabulary | undefined = undefined;
const value: MtsValue | undefined = undefined;
const run: RunEvidence | undefined = undefined;
const derivation: StructuralDerivationEvidence | undefined = undefined;
const derivationWithAssumptions: StructuralDerivationWithAssumptionsEvidence | undefined = undefined;
const derivationWithAssumptionsResult: StructuralDerivationWithAssumptionsReplayResult | undefined = undefined;
const derivationWithTheorems: StructuralDerivationWithTheoremsEvidence | undefined = undefined;
const scopedDerivation: StructuralScopedDerivationEvidence | undefined = undefined;
const scopedDerivationResult: StructuralScopedDerivationReplayResult | undefined = undefined;
const theorem: StructuralTheoremEvidence | undefined = undefined;
const judgment: StructuralJudgmentEvidence | undefined = undefined;
const proof: DecomposeEqualityEvidence | undefined = undefined;
const integrated: IntegratedProofEvidence | undefined = undefined;
const portableArtifact: PortableStructuralDerivationArtifact | undefined = undefined;
const portableConditionalArtifact: PortableStructuralDerivationWithAssumptionsArtifact | undefined = undefined;
const portableDigest: PortableStructuralDerivationContentDigest | undefined = undefined;
const portableConditionalDigest: PortableStructuralDerivationWithAssumptionsContentDigest | undefined = undefined;
const portableErrorCode: PortableStructuralDerivationErrorCode | undefined = undefined;
const portableReplay: PortableStructuralDerivationReplayResult | undefined = undefined;
const portableConditionalReplay: PortableStructuralDerivationWithAssumptionsReplayResult | undefined = undefined;
const portableUnifiedReplay: PortableStructuralProofReplayResult | undefined = undefined;
const exportPortableConditional: (memory: ReadMemory, evidence: StructuralDerivationWithAssumptionsEvidence) => PortableStructuralDerivationWithAssumptionsArtifact = publicApi.exportPortableStructuralDerivationWithAssumptions;
const replayPortableConditional: (input: unknown) => PortableStructuralDerivationWithAssumptionsReplayResult = publicApi.replayPortableStructuralDerivationWithAssumptions;
const replayPortableUnified: (input: unknown) => PortableStructuralProofReplayResult = publicApi.replayPortableStructuralProof;
const portableDigestFunction: (input: unknown) => Promise<PortableStructuralDerivationContentDigest> =
  publicApi.computePortableStructuralDerivationContentDigest;
const portableConditionalDigestFunction: (input: unknown) => Promise<PortableStructuralDerivationWithAssumptionsContentDigest> =
  publicApi.computePortableStructuralDerivationWithAssumptionsContentDigest;
const provenanceSource: PortableStructuralDerivationSourceProvenance | undefined = undefined;
const provenanceProducer: PortableStructuralDerivationProducerProvenance | undefined = undefined;
const provenanceClaim: PortableStructuralDerivationProvenanceClaim | undefined = undefined;
const provenanceDigest: PortableStructuralDerivationProvenanceDigest | undefined = undefined;
const provenanceConditionalClaim: PortableStructuralDerivationWithAssumptionsProvenanceClaim | undefined = undefined;
const provenanceConditionalDigest: PortableStructuralDerivationWithAssumptionsProvenanceDigest | undefined = undefined;
const provenanceErrorCode: PortableStructuralDerivationProvenanceErrorCode | undefined = undefined;
const createProvenance: (artifact: unknown, source: PortableStructuralDerivationSourceProvenance, producer: PortableStructuralDerivationProducerProvenance) => Promise<PortableStructuralDerivationProvenanceClaim> = publicApi.createPortableStructuralDerivationProvenanceClaim;
const digestProvenance: (input: unknown) => Promise<PortableStructuralDerivationProvenanceDigest> = publicApi.computePortableStructuralDerivationProvenanceDigest;
const verifyProvenance: (artifact: unknown, input: unknown) => Promise<PortableStructuralDerivationProvenanceClaim> = publicApi.verifyPortableStructuralDerivationProvenanceClaim;
const createConditionalProvenance: (artifact: unknown, source: PortableStructuralDerivationSourceProvenance, producer: PortableStructuralDerivationProducerProvenance) => Promise<PortableStructuralDerivationWithAssumptionsProvenanceClaim> = publicApi.createPortableStructuralDerivationWithAssumptionsProvenanceClaim;
const digestConditionalProvenance: (input: unknown) => Promise<PortableStructuralDerivationWithAssumptionsProvenanceDigest> = publicApi.computePortableStructuralDerivationWithAssumptionsProvenanceDigest;
const verifyConditionalProvenance: (artifact: unknown, input: unknown) => Promise<PortableStructuralDerivationWithAssumptionsProvenanceClaim> = publicApi.verifyPortableStructuralDerivationWithAssumptionsProvenanceClaim;
void [
  read,
  write,
  link,
  form,
  algebra,
  backend,
  dataset,
  persistentSequence,
  sequence,
  qHierarchy,
  qItem,
  qMaterialized,
  stringRead,
  sourceEvidence,
  sourceAuthority,
  sourceContent,
  sourceResultErrorCode,
  sourceResultEvidence,
  sourceResultReplay,
  structuralRuleEvidence,
  structuralRuleResult,
  relation,
  definition,
  deixis,
  value,
  run,
  derivation,
  derivationWithAssumptions,
  derivationWithAssumptionsResult,
  derivationWithTheorems,
  scopedDerivation,
  scopedDerivationResult,
  theorem,
  judgment,
  proof,
  integrated,
  portableArtifact,
  portableConditionalArtifact,
  portableDigest,
  portableConditionalDigest,
  portableErrorCode,
  portableReplay,
  portableConditionalReplay,
  portableUnifiedReplay,
  exportPortableConditional,
  replayPortableConditional,
  replayPortableUnified,
  portableDigestFunction,
  portableConditionalDigestFunction,
  provenanceSource,
  provenanceProducer,
  provenanceClaim,
  provenanceDigest,
  provenanceConditionalClaim,
  provenanceConditionalDigest,
  provenanceErrorCode,
  createProvenance,
  digestProvenance,
  verifyProvenance,
  createConditionalProvenance,
  digestConditionalProvenance,
  verifyConditionalProvenance,
];