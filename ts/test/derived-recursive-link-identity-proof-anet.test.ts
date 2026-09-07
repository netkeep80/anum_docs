import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  StructuralRootedProofAsetReplayError,
  replayStructuralRootedProofAset,
} from "../src/rooted-proof-aset.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

/**
 * Research carrier only. This does not define a new equality semantic kind.
 * The surrounding proof occurrence gives the ordinary Link X->Y its identity-
 * obligation use-role.
 */
function identityClaim(memory: Memory, left: LinkHandle, right: LinkHandle): LinkHandle {
  return memory.ensure(left, right);
}

/**
 * Candidate MTS-native recursive proof occurrence:
 *
 *   IdentityProof(X,Y) = (X->Y) -> ExactSequence(child IdentityProof occurrences)
 *
 * There is deliberately no ProofStepKind, EqNode, callback, legacy equality
 * replay, or StructuralDerivationRule tag in this carrier.
 */
function identityProof(
  memory: Memory,
  left: LinkHandle,
  right: LinkHandle,
  children: readonly LinkHandle[],
): LinkHandle {
  return memory.ensure(
    identityClaim(memory, left, right),
    materializeExactSequence(memory, children),
  );
}

function assertIdentityOccurrence(
  memory: Memory,
  occurrence: LinkHandle,
  left: LinkHandle,
  right: LinkHandle,
  children: readonly LinkHandle[],
  label: string,
): void {
  const occurrencePoles = memory.poles(occurrence);
  const claimPoles = memory.poles(occurrencePoles.start);
  same(claimPoles.start, left, `${label}: claim left`);
  same(claimPoles.end, right, `${label}: claim right`);

  const actualChildren = readExactSequence(memory, occurrencePoles.end).values;
  same(actualChildren.length, children.length, `${label}: child count`);
  children.forEach((child, index) => {
    same(actualChildren[index], child, `${label}: child ${index}`);
  });
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L } = ensureRootBasis(memory);

  // Fully self-closed base. Both the identity claim and the empty child sequence
  // are R, therefore the complete proof occurrence is R as well.
  const rootProof = identityProof(memory, R, R, []);
  same(rootProof, R, "R/R recursive identity base must collapse to R");
  same(identityClaim(memory, R, R), R, "R/R identity claim must be R");
  same(materializeExactSequence(memory, []), R, "empty child sequence must be R");
  same(readExactSequence(memory, memory.poles(rootProof).end).values.length, 0,
    "R/R base must have zero recursive children");

  // One-sided root links remove the self-recursive pole from the obligation.
  const oProof = identityProof(memory, O, O, [rootProof]);
  const cProof = identityProof(memory, C, C, [rootProof]);
  assertIdentityOccurrence(memory, oProof, O, O, [rootProof], "O/O start-selfclosed");
  assertIdentityOccurrence(memory, cProof, C, C, [rootProof], "C/C end-selfclosed");

  // Ordinary pair identity recursively depends on both ordered poles.
  const lProof = identityProof(memory, L, L, [oProof, cProof]);
  assertIdentityOccurrence(memory, lProof, L, L, [oProof, cProof], "L/L ordinary pair");

  // Generic-shaped controls: the same carrier represents arbitrary one-sided
  // and ordinary forms without knowing R/O/C/L names as a proof-step tag.
  const start = memory.ensureStartSelfClosed(L);
  const end = memory.ensureEndSelfClosed(L);
  const startProof = identityProof(memory, start, start, [lProof]);
  const endProof = identityProof(memory, end, end, [lProof]);
  const pair = memory.ensure(start, end);
  const pairProof = identityProof(memory, pair, pair, [startProof, endProof]);
  assertIdentityOccurrence(memory, startProof, start, start, [lProof],
    "generic start-selfclosed");
  assertIdentityOccurrence(memory, endProof, end, end, [lProof],
    "generic end-selfclosed");
  assertIdentityOccurrence(memory, pairProof, pair, pair, [startProof, endProof],
    "generic ordinary pair");

  // Malformed evidence remains structurally distinguishable, so the carrier
  // itself does not collapse the negative corpus. A trusted replay law must
  // reject these shapes rather than relying on host metadata.
  const pairMissingEnd = identityProof(memory, pair, pair, [startProof]);
  const pairExtra = identityProof(memory, pair, pair, [startProof, endProof, rootProof]);
  const rootExtra = identityProof(memory, R, R, [rootProof]);
  assert(pairMissingEnd !== pairProof, "missing-child proof must stay distinct");
  assert(pairExtra !== pairProof, "extra-child proof must stay distinct");
  assert(rootExtra !== rootProof, "root proof with a child must not collapse to R");

  // Mixed self-closure orientations are also expressible as candidate evidence;
  // only topology-derived replay may decide that this is not an identity proof.
  const mixed = identityProof(memory, start, end, [lProof]);
  const mixedClaim = memory.poles(mixed).start;
  const mixedPoles = memory.poles(mixedClaim);
  same(mixedPoles.start, start, "mixed claim left");
  same(mixedPoles.end, end, "mixed claim right");

  // The current canonical rooted proof replay has no intrinsic Link-identity
  // occurrence law. Every node is required to expose a Theory-admitted
  // StructuralDerivationRule application. Feeding the valid recursive L/L Anet
  // therefore measures the exact trusted-replay boundary, without invoking the
  // legacy equality/decomposition subsystem.
  const beforeReplay = memory.linkCount;
  try {
    replayStructuralRootedProofAset(memory, lProof);
  } catch (error) {
    assert(
      error instanceof StructuralRootedProofAsetReplayError,
      "recursive identity carrier must fail at the current rooted replay boundary",
    );
    same(error.code, "invalid-target-schema", "first current replay rejection");
    same(memory.linkCount, beforeReplay, "failed rooted replay must remain read-only");
    throw new Error(
      "RECURSIVE_LINK_IDENTITY_PROOF_REPLAY_GAP: ordinary Links + ExactSequence can carry the finite self-closure proof Anet, but current trusted rooted replay requires a Theory-admitted StructuralDerivationRule and cannot replay the topology-derived identity law",
    );
  }

  throw new Error(
    "recursive Link-identity proof Anet unexpectedly passed the current StructuralDerivationRule-only replay",
  );
}

main();
