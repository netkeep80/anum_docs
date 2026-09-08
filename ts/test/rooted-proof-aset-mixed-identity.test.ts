import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  StructuralRootedProofAsetReplayError,
  replayStructuralRootedProofAset,
} from "../src/rooted-proof-aset.js";
import { replayRecursiveLinkIdentityProofAset } from "../src/recursive-link-identity-proof.js";
import { exportPortableStructuralTheory } from "../src/portable-theory.js";
import { computePortableStructuralTheoryRevision } from "../src/portable-theory-digest.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function expectRootedFailure(
  label: string,
  expectedCode: string,
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRootedProofAsetReplayError, `${label}: wrong error type`);
    same(error.code, expectedCode, `${label}: exact failure code`);
    return;
  }
  throw new Error(`${label}: expected rooted replay rejection`);
}

function identityProof(
  memory: Memory,
  left: LinkHandle,
  right: LinkHandle,
  children: readonly LinkHandle[],
): LinkHandle {
  const claim = memory.ensure(left, right);
  return memory.ensure(claim, materializeExactSequence(memory, children));
}

function proofOccurrence(
  memory: Memory,
  claim: LinkHandle,
  derivationRule: LinkHandle,
  dependencies: readonly LinkHandle[],
): LinkHandle {
  const application = memory.ensure(
    derivationRule,
    materializeExactSequence(memory, dependencies),
  );
  return memory.ensure(claim, application);
}

async function main(): Promise<void> {
  const memory = new Memory();
  const { R, O, C, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const theory = fresh();

  // Arbitrary finite ROOT-grounded relation. No Nat/Succ/T4 structure participates.
  const arbitraryStart = memory.ensureStartSelfClosed(C);
  const arbitraryEnd = memory.ensureEndSelfClosed(O);
  const x = memory.ensure(arbitraryStart, arbitraryEnd);
  const identityClaim = memory.ensure(x, x);

  // Complete accepted recursive identity proof for X = X.
  const rootProof = identityProof(memory, R, R, []);
  const oProof = identityProof(memory, O, O, [rootProof]);
  const cProof = identityProof(memory, C, C, [rootProof]);
  const startProof = identityProof(memory, arbitraryStart, arbitraryStart, [cProof]);
  const endProof = identityProof(memory, arbitraryEnd, arbitraryEnd, [oProof]);
  const xProof = identityProof(memory, x, x, [startProof, endProof]);

  const identityBefore = memory.linkCount;
  const identityReplay = replayRecursiveLinkIdentityProofAset(memory, xProof);
  same(identityReplay.left, x, "identity left");
  same(identityReplay.right, x, "identity right");
  same(memory.poles(xProof).start, identityClaim, "proof root exact Claim");
  same(memory.linkCount, identityBefore, "identity replay read-only");

  // A primitive structural application consumes the exact identity Claim.
  const premiseRole = fresh();
  const conclusionRole = fresh();
  const sourceDictionary = defineStructuralRoleDictionary(
    memory,
    [premiseRole, conclusionRole],
  );
  const primitiveRule = defineStructuralRule(memory, sourceDictionary, conclusionRole);
  admitStructuralRule(memory, theory, primitiveRule);
  const primitiveDR = defineStructuralDerivationRule(memory, primitiveRule, [premiseRole]);
  admitStructuralDerivationRule(memory, theory, primitiveDR);

  // Closed derived target: no target assumptions exist to hide the dependency.
  const resultClaim = fresh();
  const targetDictionary = defineStructuralRoleDictionary(memory, []);
  const targetRule = defineStructuralRule(memory, targetDictionary, resultClaim);
  admitStructuralRule(memory, theory, targetRule);
  const targetDR = defineStructuralDerivationRule(memory, targetRule, []);
  const targetIdentity = memory.ensure(targetDR, theory);
  assert(memory.find(theory, targetDR) === undefined, "derived target DR stays unadmitted");

  const resultOccurrence = proofOccurrence(memory, resultClaim, primitiveDR, [xProof]);
  const root = memory.ensure(targetIdentity, resultOccurrence);

  const before = memory.linkCount;
  const replay = replayStructuralRootedProofAset(memory, root);
  same(replay.conclusion, resultClaim, "mixed rooted conclusion");
  same(replay.occurrenceCount, 1, "identity sub-Anet does not alter structural occurrence accounting");
  same(replay.declaredAssumptionCount, 0, "closed proof has no assumptions");
  same(replay.usedAssumptionCount, 0, "closed proof uses no assumptions");
  same(memory.linkCount, before, "mixed rooted replay read-only");

  // The mixed replay must not change exact Theory authority.
  const revisionBefore = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory),
  );
  const countBeforeRevisionReplay = memory.linkCount;
  replayStructuralRootedProofAset(memory, root);
  same(memory.linkCount, countBeforeRevisionReplay, "mixed replay remains read-only");
  const revisionAfter = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory),
  );
  same(revisionAfter.scheme, revisionBefore.scheme, "Theory revision scheme unchanged");
  same(revisionAfter.value, revisionBefore.value, "exact Theory revision unchanged");

  // A valid but unreachable intrinsic proof never joins the rooted closure by host inventory.
  const unrelated = memory.ensureStartSelfClosed(arbitraryStart);
  const unrelatedProof = identityProof(memory, unrelated, unrelated, [startProof]);
  replayRecursiveLinkIdentityProofAset(memory, unrelatedProof);
  const replayWithUnreachable = replayStructuralRootedProofAset(memory, root);
  same(replayWithUnreachable.conclusion, replay.conclusion, "unreachable proof leaves conclusion unchanged");
  same(replayWithUnreachable.occurrenceCount, replay.occurrenceCount,
    "unreachable proof leaves structural occurrence count unchanged");

  // Missing one required ordinary-pair identity child yields zero valid proof-law interpretations.
  const malformedXProof = identityProof(memory, x, x, [startProof]);
  const malformedOccurrence = proofOccurrence(memory, resultClaim, primitiveDR, [malformedXProof]);
  const malformedRoot = memory.ensure(targetIdentity, malformedOccurrence);
  expectRootedFailure(
    "malformed identity dependency",
    "invalid-proof-occurrence",
    () => replayStructuralRootedProofAset(memory, malformedRoot),
  );

  // A host-created Theory membership cannot promote malformed intrinsic support into proof authority.
  memory.ensure(theory, malformedXProof);
  expectRootedFailure(
    "fake Theory admission for malformed identity proof",
    "invalid-proof-occurrence",
    () => replayStructuralRootedProofAset(memory, malformedRoot),
  );

  // A replay-valid proof root must still carry the exact Claim required by structural substitution.
  const mismatchConclusionRole = fresh();
  const mismatchDictionary = defineStructuralRoleDictionary(memory, [mismatchConclusionRole]);
  const mismatchRule = defineStructuralRule(memory, mismatchDictionary, mismatchConclusionRole);
  admitStructuralRule(memory, theory, mismatchRule);
  const mismatchDR = defineStructuralDerivationRule(memory, mismatchRule, [R]);
  admitStructuralDerivationRule(memory, theory, mismatchDR);
  const mismatchOccurrence = proofOccurrence(memory, resultClaim, mismatchDR, [xProof]);
  const mismatchRoot = memory.ensure(targetIdentity, mismatchOccurrence);
  expectRootedFailure(
    "valid identity proof with wrong structural premise Claim",
    "template-mismatch",
    () => replayStructuralRootedProofAset(memory, mismatchRoot),
  );

  console.log("MIXED_ROOTED_PROOF_ANET_DEPENDENCY = SUPPORTED");
  console.log("mixed rooted identity malformed/fake-admission/wrong-claim corpus = REJECTED");
  console.log("mixed rooted reachability/read-only/Theory-revision invariants = SUPPORTED");
}

void main();
