import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  StructuralRootedProofAsetReplayError,
  replayStructuralRootedProofAset,
} from "../src/rooted-proof-aset.js";
import {
  exportPortableClosedRootedProof,
  replayPortableClosedRootedProof,
} from "../src/portable-closed-rooted-proof.js";
import {
  exportPortableStructuralTheory,
  replayPortableStructuralTheory,
} from "../src/portable-theory.js";
import {
  materializeV013HierarchicalCarrier,
  materializeV013HierarchicalCarrierFromSemanticLink,
  materializeV013SemanticLinkFromHierarchicalCarrier,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 P2m FND-07 authority split: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
}

function repositoryRoot(): string {
  const roots = [resolve(process.cwd(), ".."), process.cwd()];
  const root = roots.find((candidate) =>
    existsSync(
      resolve(
        candidate,
        "proofs",
        "native",
        "FND-07",
        "contextual-detachment.anum",
      ),
    ),
  );
  assert(root !== undefined, "repository root");
  return root;
}

function wire(
  memory: Memory,
  basis: RootBasis,
  semantic: LinkHandle,
): Uint8Array {
  return serializeV013HierarchicalCarrier(
    memory,
    basis,
    materializeV013HierarchicalCarrierFromSemanticLink(
      memory,
      basis,
      semantic,
    ),
  );
}

function importWire(
  memory: Memory,
  basis: RootBasis,
  bytes: Uint8Array,
): LinkHandle {
  const carrier = materializeV013HierarchicalCarrier(
    memory,
    basis,
    bytes,
  );
  return materializeV013SemanticLinkFromHierarchicalCarrier(
    memory,
    basis,
    carrier,
  );
}

function sameWire(
  leftMemory: Memory,
  leftBasis: RootBasis,
  left: LinkHandle,
  rightMemory: Memory,
  rightBasis: RootBasis,
  right: LinkHandle,
  message: string,
): void {
  const a = wire(leftMemory, leftBasis, left);
  const b = wire(rightMemory, rightBasis, right);
  same(a.length, b.length, message + " / length");
  for (let i = 0; i < a.length; i += 1) {
    same(a[i], b[i], message + " / byte " + String(i));
  }
}

const tracked = Uint8Array.from(
  readFileSync(
    resolve(
      repositoryRoot(),
      "proofs",
      "native",
      "FND-07",
      "contextual-detachment.anum",
    ),
  ),
);

// Historical accepted artifact is replayed only as a MIGRATION ORACLE here.
// It is not the new v0.15 trust boundary.
const historical = replayPortableClosedRootedProof(tracked);
const {
  memory,
  basis,
  envelope,
  proofRoot,
  replay,
} = historical;

same(replay.declaredAssumptionCount, 0, "historical artifact CLOSED");
same(replay.usedAssumptionCount, 0, "historical artifact no open assumptions");

// Factor exact selected Theory as a separate portable authority package.
const theoryArtifact = exportPortableStructuralTheory(
  memory,
  replay.theory,
);
const independentTheory = replayPortableStructuralTheory(theoryArtifact);
assert(
  independentTheory.memory.outgoing(independentTheory.theory).length > 0,
  "independent Theory package carries selected admissions",
);

const historicalAuthority = memory.outgoing(replay.theory);
assert(
  historicalAuthority.length > 0,
  "historical proof environment contains Theory authority",
);

// Historical portable proof envelope:
//   proofRoot -> ExactSequence(observed replay-support Links)
//
// Remove EVERY outgoing Link from protected Theory from candidate transport.
// This operation is migration factoring only. A future untrusted candidate must
// arrive already authority-free and must never be used to derive ObjectTheory.
const envelopePoles = memory.poles(envelope);
same(envelopePoles.start, proofRoot, "historical envelope root");
const support = readExactSequence(memory, envelopePoles.end).values;
const authoritySet = new Set(historicalAuthority);
const candidateSupport = support.filter(
  (link) => !authoritySet.has(link),
);
assert(
  candidateSupport.length < support.length,
  "migration split removes authority links from candidate support",
);

const candidateEnvelope = memory.ensure(
  proofRoot,
  materializeExactSequence(memory, candidateSupport),
);
const candidateBytes = wire(memory, basis, candidateEnvelope);

// Reconstruct authority-free candidate in an entirely fresh Memory.
const candidateMemory = new Memory();
const candidateBasis = ensureRootBasis(candidateMemory);
const reconstructedEnvelope = importWire(
  candidateMemory,
  candidateBasis,
  candidateBytes,
);
const candidateProofRoot =
  candidateMemory.poles(reconstructedEnvelope).start;
const candidateTargetIdentity =
  candidateMemory.poles(candidateProofRoot).start;
const candidateTheory =
  candidateMemory.poles(candidateTargetIdentity).end;

// Strong recursive-closure property: serializing the stripped candidate did not
// smuggle a protected Theory->* sublink back in through another support root.
same(
  candidateMemory.outgoing(candidateTheory).length,
  0,
  "authority-free candidate recursive closure has zero protected outgoing links",
);

// Candidate alone must fail closed: proof topology cannot authorize itself.
let candidateAloneRejected = false;
try {
  replayStructuralRootedProofAset(
    candidateMemory,
    candidateProofRoot,
  );
} catch (error) {
  assert(
    error instanceof StructuralRootedProofAsetReplayError,
    "authority-free candidate rejected by proof kernel",
  );
  candidateAloneRejected = true;
}
assert(candidateAloneRejected, "candidate without ObjectTheory must not replay");

// Now load the separately pinned historical Theory authority into the candidate
// Memory by recursive structural transport. This models package composition,
// not candidate-derived authority.
for (const admission of historicalAuthority) {
  importWire(
    candidateMemory,
    candidateBasis,
    wire(memory, basis, admission),
  );
}

assert(
  candidateMemory.outgoing(candidateTheory).length > 0,
  "separate Theory package restores authority plane",
);

const recomposed = replayStructuralRootedProofAset(
  candidateMemory,
  candidateProofRoot,
);
same(recomposed.declaredAssumptionCount, 0, "recomposed proof CLOSED");
same(recomposed.usedAssumptionCount, 0, "recomposed proof no open assumptions");
sameWire(
  memory,
  basis,
  replay.conclusion,
  candidateMemory,
  candidateBasis,
  recomposed.conclusion,
  "recomposed proof preserves exact FND-07 conclusion",
);

// Re-exporting the recomposed proof is still an ordinary portable proof. This
// is not persisted as a canonical v0.15 artifact and grants no new authority.
const recomposedBytes = exportPortableClosedRootedProof(
  candidateMemory,
  candidateBasis,
  candidateProofRoot,
);
assert(recomposedBytes.length > 0, "recomposed proof remains portable");

console.log([
  "MTS_V015_P2M_FND07_AUTHORITY_SPLIT=GREEN_RESEARCH",
  "SOURCE=TRACKED_FND07_HISTORICAL_COMBINED_ARTIFACT",
  "HISTORICAL_REPLAY_ROLE=MIGRATION_ORACLE_ONLY",
  "INDEPENDENT_THEORY_PACKAGE=GREEN",
  "CANDIDATE_SUPPORT_AUTHORITY_LINKS_REMOVED=TRUE",
  "CANDIDATE_RECURSIVE_PROTECTED_OUTGOING=0",
  "CANDIDATE_ALONE=FAIL_CLOSED",
  "SEPARATE_THEORY_PLUS_CANDIDATE=REPLAY_GREEN",
  "EXACT_CONCLUSION_PRESERVED=TRUE",
  "PROOF_STRUCTURE_REWRITE_REQUIRED=FALSE",
  "RUNTIME_AUTHORITY_DERIVED_FROM_CANDIDATE=FALSE",
  "NEW_CANONICAL_ARTIFACT_PERSISTED=FALSE",
  "CANONICAL_APROVER_FORMAL_JSON=NOT_YET_PROPOSED",
].join(" "));
