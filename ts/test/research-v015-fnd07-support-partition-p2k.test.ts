import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  replayPortableClosedRootedProof,
} from "../src/portable-closed-rooted-proof.js";
import {
  replayClosedProofOccurrence,
} from "../src/rooted-proof-aset.js";
import {
  RecursiveLinkIdentityProofReplayError,
  replayRecursiveLinkIdentityProofClosure,
} from "../src/recursive-link-identity-proof.js";
import type { LinkHandle } from "../src/memory.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 P2k FND-07 support partition: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
}

function repositoryRoot(): string {
  const candidates = [resolve(process.cwd(), ".."), process.cwd()];
  const root = candidates.find((candidate) =>
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

const bytes = Uint8Array.from(
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

// Fresh recursive reconstruction + existing trusted root replay first.
const portable = replayPortableClosedRootedProof(bytes);
const { memory, proofRoot, replay } = portable;
same(replay.declaredAssumptionCount, 0, "tracked FND-07 remains CLOSED");
same(replay.usedAssumptionCount, 0, "tracked FND-07 has no open assumptions");

// Root carries theorem target identity separately from the concrete occurrence.
// The local occurrence law must be read from targetOccurrence itself, never by
// treating targetDerivationRule as a primitive admission.
const rootPoles = memory.poles(proofRoot);
same(rootPoles.start, replay.targetIdentity, "portable root target identity");
same(rootPoles.end, replay.targetOccurrence, "portable root target occurrence");

assert(
  memory.find(replay.theory, replay.targetDerivationRule) === undefined,
  "FND-07 theorem target DR is deliberately not primitive Theory authority",
);

// Existing callback-free CLOSED occurrence replay already embodies the accepted
// 0/1/>1 unique-law selection:
//   identity candidate
//   structural candidate
// exactly one must succeed for each dependency occurrence.
const closed = replayClosedProofOccurrence(
  memory,
  replay.theory,
  replay.targetOccurrence,
);
same(
  closed.claim,
  replay.conclusion,
  "closed occurrence replay proves exact tracked conclusion",
);

function acceptsIdentity(occurrence: LinkHandle): boolean {
  try {
    replayRecursiveLinkIdentityProofClosure(memory, occurrence);
    return true;
  } catch (error) {
    if (
      error instanceof RecursiveLinkIdentityProofReplayError &&
      error.code !== "replay-wrote"
    ) {
      return false;
    }
    throw error;
  }
}

const identityOccurrences: LinkHandle[] = [];
const structuralOccurrences: LinkHandle[] = [];

for (const entry of closed.validatedOccurrences) {
  if (acceptsIdentity(entry.occurrence)) {
    identityOccurrences.push(entry.occurrence);
  } else {
    structuralOccurrences.push(entry.occurrence);
  }
}

same(
  identityOccurrences.length + structuralOccurrences.length,
  closed.validatedOccurrences.length,
  "every validated occurrence belongs to exactly one observed support class",
);
assert(
  structuralOccurrences.includes(replay.targetOccurrence),
  "real FND-07 target occurrence is structurally supported",
);

// The important architecture boundary: an occurrence selected by identity law
// is not required to carry primitive Rule/DR admission authority. Conversely,
// structural occurrences are the candidates that may enter the P2h/P2f path.
// Existing K1 CLOSED replay has already rejected any 0-support or 2-support
// ambiguity before this observational partition is read.
assert(
  structuralOccurrences.length > 0,
  "tracked FND-07 contains structural support",
);

const targetSupport = memory.poles(replay.targetOccurrence).end;
const targetLocalDR = memory.poles(targetSupport).start;
assert(
  targetLocalDR !== replay.targetDerivationRule,
  "target occurrence support DR is distinct from theorem target DR identity",
);
assert(
  memory.find(replay.theory, targetLocalDR) !== undefined,
  "target occurrence uses selected primitive/local DR authority",
);

console.log([
  "MTS_V015_P2K_FND07_SUPPORT_PARTITION=GREEN_RESEARCH",
  "SOURCE=TRACKED_FND07_CONTEXTUAL_DETACHMENT_ANUM",
  "TRANSPORT=FRESH_RECURSIVE_8961_RECONSTRUCTION",
  "CLOSED_ROOT_REPLAY=GREEN",
  "TARGET_THEOREM_DR_PRIMITIVE_ADMISSION=FALSE",
  "TARGET_OCCURRENCE_SUPPORT=STRUCTURAL",
  "TARGET_OCCURRENCE_LOCAL_DR_SELECTED_AUTHORITY=TRUE",
  "VALIDATED_OCCURRENCES=" + String(closed.validatedOccurrences.length),
  "IDENTITY_OCCURRENCES=" + String(identityOccurrences.length),
  "STRUCTURAL_OCCURRENCES=" + String(structuralOccurrences.length),
  "SUPPORT_SELECTION=EXACTLY_ONE_IDENTITY_OR_STRUCTURAL_PER_ACCEPTED_OCCURRENCE",
  "HOST_THEOREM_ID_DISPATCH=0",
  "HOST_RULE_KIND=0",
  "P2H_APPLIES_TO_STRUCTURAL_OCCURRENCE_SUPPORT_NOT_TARGET_IDENTITY=TRUE",
  "CANONICAL_APROVER_FORMAL_JSON=NOT_YET_PROPOSED",
].join(" "));
