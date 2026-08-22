import * as publicApi from "../src/public.js";
import type {
  AnumForm,
  DecomposeEqualityEvidence,
  DefinitionReplayEvidence,
  DirectDeixisVocabulary,
  IntegratedProofEvidence,
  LinkHandle,
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
  ReadMemory,
  RelationReplayEvidence,
  RunEvidence,
  SequenceDescription,
  StackAlgebra,
  StoredDataset,
  StructuralDerivationEvidence,
  StructuralDerivationWithAssumptionsEvidence,
  StructuralDerivationWithAssumptionsReplayResult,
  StructuralDerivationWithTheoremsEvidence,
  StructuralJudgmentEvidence,
  StructuralTheoremEvidence,
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
// @ts-expect-error P6k keeps provenance canonical JSON normalization internal.
type InternalCanonicalPortableStructuralDerivationProvenanceClaimJson = typeof import("../src/public.js").canonicalPortableStructuralDerivationProvenanceClaimJson;
// @ts-expect-error P3b keeps assumption construction internal; consumers submit materialized evidence.
type InternalAssumptionContextConstructor = typeof import("../src/public.js").defineStructuralAssumptionContext;

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
  "PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME",
  "PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_DIGEST_SCHEME",
  "PORTABLE_STRUCTURAL_DERIVATION_PROVENANCE_SCHEMA",
  "PORTABLE_STRUCTURAL_DERIVATION_SCHEMA",
  "PersistentStore",
  "PersistentStoreError",
  "PortableStructuralDerivationError",
  "PortableStructuralDerivationProvenanceError",
  "ProofRuleReplayError",
  "QuaternaryDecodeError",
  "RunReplayError",
  "SequenceReplayError",
  "StreamError",
  "StructuralAssumptionReplayError",
  "StructuralDerivationReplayError",
  "StructuralJudgmentReplayError",
  "StructuralTheoremReplayError",
  "StructuralTheoremReuseReplayError",
  "ValueBundleReplayError",
  "analyzeDirectDeixisCarrier",
  "bundleRoleAt",
  "computePortableStructuralDerivationContentDigest",
  "computePortableStructuralDerivationProvenanceDigest",
  "createPortableStructuralDerivationProvenanceClaim",
  "deserializeAnum",
  "deserializeStream",
  "elaborateBundleRoles",
  "ensureRootBasis",
  "executeAbits",
  "exportPortableStructuralDerivation",
  "materializePersistentSequence",
  "materializeSequence",
  "normalizeRawForm",
  "parseRawQuaternary",
  "replayColonEffect",
  "replayDefinitionEffect",
  "replayDecomposeEqualRelations",
  "replayEqualityEvaluation",
  "replayFlatReading",
  "replayFlatSubselectionContinuation",
  "replayFlatSubselectionReading",
  "replayIntegratedProof",
  "replayPersistentSequenceMaterialization",
  "replayPortableStructuralDerivation",
  "replayRelationStep",
  "replayRelationSubselectionStep",
  "replayResolvedSequenceGrouping",
  "replayRootOpeningRestoration",
  "replayRun",
  "replaySequenceMaterialization",
  "replayStructuralDerivation",
  "replayStructuralDerivationWithAssumptions",
  "replayStructuralDerivationWithTheorems",
  "replayStructuralJudgment",
  "replayStructuralTheorem",
  "resolveFlatBundle",
  "symbolicStackAlgebra",
  "valuesEqual",
  "verifyPortableStructuralDerivationProvenanceClaim",
].sort();

assert(expectedRuntimeExports.length === 68, "P6k runtime export budget must be exactly 68");
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
  publicApi.PORTABLE_MTS_SEMANTIC_BASE === "mts-contract/v0.11",
  "portable derivation semantic base must stay pinned",
);
assert(
  publicApi.PORTABLE_STRUCTURAL_DERIVATION_CONTENT_DIGEST_SCHEME ===
    "mts-portable-structural-derivation-content/sha-256/v0.1",
  "portable derivation content digest scheme must stay pinned",
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
const relation: RelationReplayEvidence | undefined = undefined;
const definition: DefinitionReplayEvidence | undefined = undefined;
const deixis: DirectDeixisVocabulary | undefined = undefined;
const value: MtsValue | undefined = undefined;
const run: RunEvidence | undefined = undefined;
const derivation: StructuralDerivationEvidence | undefined = undefined;
const derivationWithAssumptions: StructuralDerivationWithAssumptionsEvidence | undefined = undefined;
const derivationWithAssumptionsResult: StructuralDerivationWithAssumptionsReplayResult | undefined = undefined;
const derivationWithTheorems: StructuralDerivationWithTheoremsEvidence | undefined = undefined;
const theorem: StructuralTheoremEvidence | undefined = undefined;
const judgment: StructuralJudgmentEvidence | undefined = undefined;
const proof: DecomposeEqualityEvidence | undefined = undefined;
const integrated: IntegratedProofEvidence | undefined = undefined;
const portableArtifact: PortableStructuralDerivationArtifact | undefined = undefined;
const portableDigest: PortableStructuralDerivationContentDigest | undefined = undefined;
const portableErrorCode: PortableStructuralDerivationErrorCode | undefined = undefined;
const portableReplay: PortableStructuralDerivationReplayResult | undefined = undefined;
const portableDigestFunction: (input: unknown) => Promise<PortableStructuralDerivationContentDigest> =
  publicApi.computePortableStructuralDerivationContentDigest;
const provenanceSource: PortableStructuralDerivationSourceProvenance | undefined = undefined;
const provenanceProducer: PortableStructuralDerivationProducerProvenance | undefined = undefined;
const provenanceClaim: PortableStructuralDerivationProvenanceClaim | undefined = undefined;
const provenanceDigest: PortableStructuralDerivationProvenanceDigest | undefined = undefined;
const provenanceErrorCode: PortableStructuralDerivationProvenanceErrorCode | undefined = undefined;
const createProvenance: (artifact: unknown, source: PortableStructuralDerivationSourceProvenance, producer: PortableStructuralDerivationProducerProvenance) => Promise<PortableStructuralDerivationProvenanceClaim> = publicApi.createPortableStructuralDerivationProvenanceClaim;
const digestProvenance: (input: unknown) => Promise<PortableStructuralDerivationProvenanceDigest> = publicApi.computePortableStructuralDerivationProvenanceDigest;
const verifyProvenance: (artifact: unknown, input: unknown) => Promise<PortableStructuralDerivationProvenanceClaim> = publicApi.verifyPortableStructuralDerivationProvenanceClaim;
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
  relation,
  definition,
  deixis,
  value,
  run,
  derivation,
  derivationWithAssumptions,
  derivationWithAssumptionsResult,
  derivationWithTheorems,
  theorem,
  judgment,
  proof,
  integrated,
  portableArtifact,
  portableDigest,
  portableErrorCode,
  portableReplay,
  portableDigestFunction,
  provenanceSource,
  provenanceProducer,
  provenanceClaim,
  provenanceDigest,
  provenanceErrorCode,
  createProvenance,
  digestProvenance,
  verifyProvenance,
];
