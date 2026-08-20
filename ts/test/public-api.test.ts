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
  ReadMemory,
  RelationReplayEvidence,
  RunEvidence,
  SequenceDescription,
  StackAlgebra,
  StoredDataset,
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
  "PersistentStore",
  "PersistentStoreError",
  "ProofRuleReplayError",
  "QuaternaryDecodeError",
  "RunReplayError",
  "SequenceReplayError",
  "StreamError",
  "ValueBundleReplayError",
  "analyzeDirectDeixisCarrier",
  "bundleRoleAt",
  "deserializeAnum",
  "deserializeStream",
  "elaborateBundleRoles",
  "ensureRootBasis",
  "executeAbits",
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
  "replayRelationStep",
  "replayRelationSubselectionStep",
  "replayResolvedSequenceGrouping",
  "replayRootOpeningRestoration",
  "replayRun",
  "replaySequenceMaterialization",
  "resolveFlatBundle",
  "symbolicStackAlgebra",
  "valuesEqual",
].sort();

assert(
  JSON.stringify(Object.keys(publicApi).sort()) === JSON.stringify(expectedRuntimeExports),
  `unexpected runtime exports: ${Object.keys(publicApi).sort().join(",")}`,
);
assert(
  publicApi.replayDefinitionEffect === publicApi.replayColonEffect,
  "definition replay must be a behavior-preserving alias of legacy colon replay",
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
const proof: DecomposeEqualityEvidence | undefined = undefined;
const integrated: IntegratedProofEvidence | undefined = undefined;
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
  proof,
  integrated,
];
