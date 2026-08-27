import {
  Memory,
  PORTABLE_MTS_SEMANTIC_BASE,
  PORTABLE_STRUCTURAL_DERIVATION_WITH_THEOREMS_SCHEMA,
  PORTABLE_STRUCTURAL_THEORY_REVISION_SCHEME,
  PORTABLE_STRUCTURAL_THEORY_SCHEMA,
  computePortableStructuralDerivationWithTheoremsContentDigest,
  computePortableStructuralTheoryRevision,
  createPortableStructuralDerivationWithTheoremsProvenanceClaim,
  createStructuralProofProducer,
  ensureRootBasis,
  exportPortableStructuralDerivation,
  exportPortableStructuralDerivationWithTheorems,
  exportPortableStructuralTheory,
  replayPortableStructuralDerivation,
  replayPortableStructuralDerivationWithAssumptions,
  replayPortableStructuralDerivationWithTheorems,
  replayPortableStructuralProof,
  replayPortableStructuralTheory,
  replayStructuralDerivation,
  replayStructuralDerivationWithAssumptions,
  replayStructuralScopedDerivation,
  verifyPortableStructuralDerivationWithTheoremsProvenanceClaim,
  verifyPortableStructuralProofTheoryRevision,
  type LinkHandle,
  type PortableStructuralDerivationReplayResult,
  type PortableStructuralDerivationWithAssumptionsReplayResult,
  type PortableStructuralDerivationWithTheoremsReplayResult,
  type PortableStructuralProofReplayResult,
  type PortableStructuralTheoryArtifact,
  type PortableStructuralTheoryReplayResult,
  type PortableStructuralTheoryRevision,
  type ReadMemory,
  type StructuralDerivationEvidence,
} from "@mts/core";
import { textToAnum } from "@mts/core/tooling/payload";
import {
  SyntaxAsetBuilder,
  materializeSyntaxAsetVocabulary,
  readSyntaxAset,
  type SyntaxAsetToolingVocabulary,
} from "@mts/core/tooling/syntax-aset";

// Package-boundary smoke: this file must resolve through package exports and
// generated declarations, not through source-relative imports.
const memory = new Memory();
const basis = ensureRootBasis(memory);
const read: ReadMemory = memory;
const link: LinkHandle = basis.L;
const encoded: string = textToAnum("A");

// Syntax tooling is reusable only through its non-root package subpath. The
// vocabulary is structurally derived in caller-owned Memory and interoperates
// with the exact S0 builder/reader contract without downstream AST types.
const syntaxSeed = memory.ensureEndSelfClosed(basis.U);
const syntaxVocabulary: SyntaxAsetToolingVocabulary =
  materializeSyntaxAsetVocabulary(memory, syntaxSeed);
const syntaxBuilder = new SyntaxAsetBuilder(memory, syntaxVocabulary);
const syntaxCarrier = memory.ensureStartSelfClosed(syntaxVocabulary.tag);
const syntaxLiteral = syntaxBuilder.addOccurrence(syntaxVocabulary.kinds.Literal, [
  { role: syntaxVocabulary.roles.value, value: syntaxCarrier },
]);
const syntaxAset = syntaxBuilder.finish(syntaxLiteral);
const syntaxRead = readSyntaxAset(memory, syntaxAset, syntaxVocabulary);

const semanticBase: "mts-contract/v0.11" = PORTABLE_MTS_SEMANTIC_BASE;
const portableReplay: (input: unknown) => PortableStructuralDerivationReplayResult =
  replayPortableStructuralDerivation;
const portableAssumptionReplay: (
  input: unknown,
) => PortableStructuralDerivationWithAssumptionsReplayResult =
  replayPortableStructuralDerivationWithAssumptions;
const theoremSchema: "mts-portable-structural-derivation-with-theorems/v0.1" =
  PORTABLE_STRUCTURAL_DERIVATION_WITH_THEOREMS_SCHEMA;
const portableTheoremReplay: (
  input: unknown,
) => PortableStructuralDerivationWithTheoremsReplayResult =
  replayPortableStructuralDerivationWithTheorems;
const portableTheoremExport = exportPortableStructuralDerivationWithTheorems;
const portableProofReplay = replayPortableStructuralProof;
const portableTheoremDigest = computePortableStructuralDerivationWithTheoremsContentDigest;
const portableTheoremProvenance = createPortableStructuralDerivationWithTheoremsProvenanceClaim;
const verifyPortableTheoremProvenance = verifyPortableStructuralDerivationWithTheoremsProvenanceClaim;

// Untrusted search/importers construct existing structural candidate evidence
// through one package-root facade. Construction itself has no proof authority:
// the resulting portable artifact still crosses the ordinary trusted replay API.
const producer = createStructuralProofProducer(memory);
let producerCursor = basis.U;
const freshProducerLink = (): LinkHandle =>
  (producerCursor = memory.ensure(producerCursor, basis.R));
const producerDictionary = freshProducerLink();
const producerGrammar = freshProducerLink();
const producerTheory = freshProducerLink();
const producerContext = producer.defineContext(freshProducerLink(), freshProducerLink());
const producerRole = freshProducerLink();
const producerValue = freshProducerLink();
const producerInterpreter = producer.defineInterpreter(
  producerDictionary,
  producerGrammar,
  producerTheory,
);
const producerRoleDictionary = producer.defineRoleDictionary([producerRole]);
const producerRule = producer.defineRule(producerRoleDictionary, producerRole);
const producerRuleAdmission = producer.admitRule(producerTheory, producerRule);
const producerAct = producer.defineAct(
  producerInterpreter,
  producerRoleDictionary,
  producerContext,
);
producer.defineActField(producerAct, producerRole, producerValue);
const producerOccurrence = producer.defineProofOccurrence(producerAct, producerValue);
const producerDerivationRule = producer.defineDerivationRule(producerRule, []);
const producerDerivationRuleAdmission = producer.admitDerivationRule(
  producerTheory,
  producerDerivationRule,
);
const producerEvidence: StructuralDerivationEvidence = {
  theory: producerTheory,
  targetOccurrence: producerOccurrence,
  nodes: [{
    occurrence: producerOccurrence,
    judgment: {
      application: {
        act: producerAct,
        rule: producerRule,
        ruleAdmission: producerRuleAdmission,
        claimedBody: producerValue,
        expectedInterpreter: {
          dictionary: producerDictionary,
          grammar: producerGrammar,
          theory: producerTheory,
        },
        expectedAfterContext: producerContext,
      },
      judgment: {
        theory: producerTheory,
        context: producerContext,
        claim: producerValue,
      },
    },
    derivationRule: producerDerivationRule,
    derivationRuleAdmission: producerDerivationRuleAdmission,
    premiseOccurrenceSequence: producer.definePremiseOccurrenceSequence([]),
  }],
};
const producerArtifact = exportPortableStructuralDerivation(memory, producerEvidence);
const producerTrustedReplay: PortableStructuralProofReplayResult =
  replayPortableStructuralProof(producerArtifact);

// Exact Theory selection is separately package-root consumable and remains
// identity/provenance evidence rather than a substitute for proof replay.
const theory = memory.ensure(basis.L, basis.U);
const theoryArtifact: PortableStructuralTheoryArtifact = exportPortableStructuralTheory(memory, theory);
const theoryReplay: PortableStructuralTheoryReplayResult = replayPortableStructuralTheory(theoryArtifact);
const theoryRevision: Promise<PortableStructuralTheoryRevision> =
  computePortableStructuralTheoryRevision(theoryArtifact);
const theorySchema: "mts-portable-structural-theory/v0.1" = PORTABLE_STRUCTURAL_THEORY_SCHEMA;
const theoryRevisionScheme: "mts-portable-structural-theory-revision/sha-256/v0.1" =
  PORTABLE_STRUCTURAL_THEORY_REVISION_SCHEME;
const verifyTheoryRevision = verifyPortableStructuralProofTheoryRevision;
void [
  read,
  link,
  encoded,
  syntaxVocabulary,
  syntaxRead,
  semanticBase,
  portableReplay,
  portableAssumptionReplay,
  theoremSchema,
  portableTheoremReplay,
  portableTheoremExport,
  portableProofReplay,
  portableTheoremDigest,
  portableTheoremProvenance,
  verifyPortableTheoremProvenance,
  producerArtifact,
  producerTrustedReplay,
  theoryArtifact,
  theoryReplay,
  theoryRevision,
  theorySchema,
  theoryRevisionScheme,
  verifyTheoryRevision,
  replayStructuralDerivation,
  replayStructuralDerivationWithAssumptions,
  replayStructuralScopedDerivation,
];

// Internal source modules are intentionally not package subpaths.
// @ts-expect-error @mts/core/memory is not exported by package.json.
import type { AppendOnlyReadMemory } from "@mts/core/memory";
void (undefined as unknown as AppendOnlyReadMemory);

// Syntax tooling must not enlarge the trusted package-root semantic surface.
// @ts-expect-error SyntaxAsetToolingVocabulary is tooling-only, not @mts/core root.
import type { SyntaxAsetToolingVocabulary as RootSyntaxAsetToolingVocabulary } from "@mts/core";
void (undefined as unknown as RootSyntaxAsetToolingVocabulary);
