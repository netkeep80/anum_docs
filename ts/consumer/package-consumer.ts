import {
  Memory,
  PORTABLE_MTS_SEMANTIC_BASE,
  PORTABLE_STRUCTURAL_DERIVATION_WITH_THEOREMS_SCHEMA,
  PORTABLE_STRUCTURAL_THEORY_REVISION_SCHEME,
  PORTABLE_STRUCTURAL_THEORY_SCHEMA,
  computePortableStructuralDerivationWithTheoremsContentDigest,
  computePortableStructuralTheoryRevision,
  createPortableStructuralDerivationWithTheoremsProvenanceClaim,
  ensureRootBasis,
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
  type PortableStructuralTheoryArtifact,
  type PortableStructuralTheoryReplayResult,
  type PortableStructuralTheoryRevision,
  type ReadMemory,
} from "@mts/core";
import { textToAnum } from "@mts/core/tooling/payload";

// Package-boundary smoke: this file must resolve through package exports and
// generated declarations, not through source-relative imports.
const memory = new Memory();
const basis = ensureRootBasis(memory);
const read: ReadMemory = memory;
const link: LinkHandle = basis.L;
const encoded: string = textToAnum("A");

// Downstream approvers only need the public verification boundary to accept
// untrusted portable evidence; producer/search construction may remain outside
// the trusted package facade.
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
