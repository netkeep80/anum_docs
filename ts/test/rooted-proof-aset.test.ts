import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
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
import { exportPortableStructuralTheory } from "../src/portable-theory.js";
import { computePortableStructuralTheoryRevision } from "../src/portable-theory-digest.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectRootedFailure(label: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRootedProofAsetReplayError, `${label}: wrong error type`);
    return;
  }
  throw new Error(`${label}: expected rooted replay rejection`);
}

interface PrimitiveFixture {
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
}

interface TargetFixture {
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly identity: LinkHandle;
}

function admittedPrimitive(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): PrimitiveFixture {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  admitStructuralRule(memory, theory, rule);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  admitStructuralDerivationRule(memory, theory, derivationRule);
  return Object.freeze({ rule, derivationRule });
}

function targetIdentity(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): TargetFixture {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  admitStructuralRule(memory, theory, rule);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  return Object.freeze({
    rule,
    derivationRule,
    identity: memory.ensure(derivationRule, theory),
  });
}

function proofOccurrence(
  memory: Memory,
  claim: LinkHandle,
  primitiveDerivationRule: LinkHandle,
  dependencies: readonly LinkHandle[],
): LinkHandle {
  const application = memory.ensure(
    primitiveDerivationRule,
    materializeExactSequence(memory, dependencies),
  );
  return memory.ensure(claim, application);
}

function proofRoot(memory: Memory, identity: LinkHandle, occurrence: LinkHandle): LinkHandle {
  return memory.ensure(identity, occurrence);
}

async function positiveCorpus(): Promise<void> {
  const memory = new Memory();
  const { R, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const theory = memory.ensure(L, U);

  const a = fresh(), b = fresh(), c = fresh(), junk = fresh();
  const s = fresh(), t = fresh(), u = fresh(), v = fresh();

  // One primitive step with a source dictionary independent from target roles.
  const dSource = defineStructuralRoleDictionary(memory, [s, t]);
  const primitive = admittedPrimitive(memory, theory, dSource, [s], t);
  const dOne = defineStructuralRoleDictionary(memory, [a, b]);
  const one = targetIdentity(memory, theory, dOne, [a], b);
  const oneA = memory.ensure(a, one.identity);
  const oneB = proofOccurrence(memory, b, primitive.derivationRule, [oneA]);
  const oneReplay = replayStructuralRootedProofAset(memory, proofRoot(memory, one.identity, oneB));
  same(oneReplay.conclusion, b, "one-step conclusion");
  same(oneReplay.occurrenceCount, 1, "one-step occurrence count");
  same(oneReplay.declaredAssumptionCount, 1, "one-step declared assumption count");
  same(oneReplay.usedAssumptionCount, 1, "one-step used assumption count");
  assert(memory.find(theory, one.derivationRule) === undefined, "one-step target DR stays unadmitted");

  // Cross-dictionary chain: each primitive infers its own rho from actual claims.
  const dST = defineStructuralRoleDictionary(memory, [s, t]);
  const dUV = defineStructuralRoleDictionary(memory, [u, v]);
  const pST = admittedPrimitive(memory, theory, dST, [s], t);
  const pUV = admittedPrimitive(memory, theory, dUV, [u], v);
  const dChain = defineStructuralRoleDictionary(memory, [a, c]);
  const chain = targetIdentity(memory, theory, dChain, [a], c);
  const chainA = memory.ensure(a, chain.identity);
  const chainB = proofOccurrence(memory, b, pST.derivationRule, [chainA]);
  const chainC = proofOccurrence(memory, c, pUV.derivationRule, [chainB]);
  const chainRoot = proofRoot(memory, chain.identity, chainC);
  const chainReplay = replayStructuralRootedProofAset(memory, chainRoot);
  same(chainReplay.conclusion, c, "chain conclusion");
  same(chainReplay.occurrenceCount, 2, "chain occurrence count");
  same(chainReplay.declaredAssumptionCount, 1, "chain declared assumption count");
  same(chainReplay.usedAssumptionCount, 1, "chain used assumption count");

  // Unreachable application-like topology is ignored because it is outside P closure.
  const junkH = memory.ensure(junk, chain.identity);
  const junkO = proofOccurrence(memory, b, pST.derivationRule, [junkH]);
  assert(junkO !== chainB, "unreachable occurrence is distinct");
  same(replayStructuralRootedProofAset(memory, chainRoot).occurrenceCount, 2,
    "unreachable occurrence ignored");

  // Branching/repeated premise: one exact semantic B occurrence is used twice.
  const r1 = fresh(), r2 = fresh(), r3 = fresh();
  const q1 = fresh(), q2 = fresh(), q3 = fresh();
  const dFirst = defineStructuralRoleDictionary(memory, [r1, r2, r3]);
  const dSecond = defineStructuralRoleDictionary(memory, [q1, q2, q3]);
  const first = admittedPrimitive(memory, theory, dFirst, [r1, r2], r3);
  const second = admittedPrimitive(memory, theory, dSecond, [q1, q2], q3);
  const dBranch = defineStructuralRoleDictionary(memory, [a, b, c]);
  const branch = targetIdentity(memory, theory, dBranch, [a, b, b], c);
  const hA = memory.ensure(a, branch.identity);
  const hB = memory.ensure(b, branch.identity);
  const mid = proofOccurrence(memory, junk, first.derivationRule, [hA, hB]);
  const out = proofOccurrence(memory, c, second.derivationRule, [mid, hB]);
  const branchReplay = replayStructuralRootedProofAset(memory, proofRoot(memory, branch.identity, out));
  same(branchReplay.conclusion, c, "branch conclusion");
  same(branchReplay.occurrenceCount, 2, "branch occurrence count");
  same(branchReplay.declaredAssumptionCount, 2, "branch unique declared assumption count");
  same(branchReplay.usedAssumptionCount, 2, "branch unique used assumption count");

  const revisionBefore = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory),
  );
  const countBefore = memory.linkCount;
  replayStructuralRootedProofAset(memory, chainRoot);
  same(memory.linkCount, countBefore, "rooted replay read-only");
  const revisionAfter = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(memory, theory),
  );
  same(revisionAfter.scheme, revisionBefore.scheme, "Theory revision scheme unchanged");
  same(revisionAfter.value, revisionBefore.value, "exact Theory revision unchanged");
}

function overlapCorpus(): void {
  const memory = new Memory();
  const { R, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));

  // Empty ExactSequence is R. With Theory=R, I and A become the exact same Link.
  // Then H and O also become the same exact Link. This is legal contextual overlap.
  const theory = R;
  const claim = fresh();
  const dictionary = defineStructuralRoleDictionary(memory, []);
  const primitive = admittedPrimitive(memory, theory, dictionary, [], claim);
  const identity = memory.ensure(primitive.derivationRule, theory);
  const application = memory.ensure(
    primitive.derivationRule,
    materializeExactSequence(memory, []),
  );
  same(identity, application, "I/A overlap");
  const occurrence = memory.ensure(claim, application);
  const hypothesisShape = memory.ensure(claim, identity);
  same(occurrence, hypothesisShape, "H/O overlap");
  const replay = replayStructuralRootedProofAset(memory, proofRoot(memory, identity, occurrence));
  same(replay.conclusion, claim, "overlap conclusion");
  same(replay.occurrenceCount, 1, "overlap occurrence count");
  same(replay.declaredAssumptionCount, 0, "overlap declared assumption count");
  same(replay.usedAssumptionCount, 0, "overlap used assumption count");
}

function weakeningCorpus(): void {
  const memory = new Memory();
  const { R, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const theory = memory.ensure(L, U);

  const a = fresh(), extra = fresh(), b = fresh();
  const sourceA = fresh(), sourceB = fresh();
  const sourceDictionary = defineStructuralRoleDictionary(memory, [sourceA, sourceB]);
  const primitive = admittedPrimitive(memory, theory, sourceDictionary, [sourceA], sourceB);
  const targetDictionary = defineStructuralRoleDictionary(memory, [a, extra, b]);
  const target = targetIdentity(memory, theory, targetDictionary, [a, extra], b);
  const hA = memory.ensure(a, target.identity);
  const out = proofOccurrence(memory, b, primitive.derivationRule, [hA]);

  const replay = replayStructuralRootedProofAset(memory, proofRoot(memory, target.identity, out));
  same(replay.conclusion, b, "weakening conclusion");
  same(replay.declaredAssumptionCount, 2, "weakening declared assumption count");
  same(replay.usedAssumptionCount, 1, "weakening used assumption count");
}

function adversarialCorpus(): void {
  const memory = new Memory();
  const { R, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const theory = memory.ensure(L, U);
  const a = fresh(), b = fresh(), c = fresh();

  // Forged derived promotion: DR->Theory identity is present, Theory->DR is not.
  const dTarget = defineStructuralRoleDictionary(memory, [a, c]);
  const derived = targetIdentity(memory, theory, dTarget, [a], c);
  const hA = memory.ensure(a, derived.identity);
  const forged = proofOccurrence(memory, c, derived.derivationRule, [hA]);
  expectRootedFailure("forged derived primitive promotion", () =>
    replayStructuralRootedProofAset(memory, proofRoot(memory, derived.identity, forged)));

  // Conflicting cumulative rho: the same source Role would have to be both a and b.
  const role = fresh();
  const dConflictSource = defineStructuralRoleDictionary(memory, [role]);
  const conflictPrimitive = admittedPrimitive(memory, theory, dConflictSource, [role], role);
  const dConflictTarget = defineStructuralRoleDictionary(memory, [a, b]);
  const conflictTarget = targetIdentity(memory, theory, dConflictTarget, [a], b);
  const conflictA = memory.ensure(a, conflictTarget.identity);
  const conflictOut = proofOccurrence(memory, b, conflictPrimitive.derivationRule, [conflictA]);
  expectRootedFailure("conflicting whole-DR rho", () =>
    replayStructuralRootedProofAset(memory, proofRoot(memory, conflictTarget.identity, conflictOut)));

  // Partial rho: one declared source Role is absent from conclusion and all premises.
  const p = fresh(), unused = fresh();
  const dPartial = defineStructuralRoleDictionary(memory, [p, unused]);
  const partialPrimitive = admittedPrimitive(memory, theory, dPartial, [], p);
  const dPartialTarget = defineStructuralRoleDictionary(memory, [a]);
  const partialTarget = targetIdentity(memory, theory, dPartialTarget, [], a);
  const partialOut = proofOccurrence(memory, a, partialPrimitive.derivationRule, []);
  expectRootedFailure("partial whole-DR rho", () =>
    replayStructuralRootedProofAset(memory, proofRoot(memory, partialTarget.identity, partialOut)));

  // Exact premise arity is mandatory.
  const x = fresh(), y = fresh(), z = fresh();
  const dArity = defineStructuralRoleDictionary(memory, [x, y, z]);
  const arityPrimitive = admittedPrimitive(memory, theory, dArity, [x, y], z);
  const dArityTarget = defineStructuralRoleDictionary(memory, [a, b, c]);
  const arityTarget = targetIdentity(memory, theory, dArityTarget, [a, b], c);
  const arityA = memory.ensure(a, arityTarget.identity);
  const tooShort = proofOccurrence(memory, c, arityPrimitive.derivationRule, [arityA]);
  expectRootedFailure("wrong premise arity", () =>
    replayStructuralRootedProofAset(memory, proofRoot(memory, arityTarget.identity, tooShort)));

  // Grounded source prefixes make premise order observable and exact.
  const k = fresh(), m = fresh(), leftRole = fresh(), rightRole = fresh(), outRole = fresh();
  const leftTemplate = memory.ensure(k, leftRole);
  const rightTemplate = memory.ensure(m, rightRole);
  const dOrderSource = defineStructuralRoleDictionary(memory, [leftRole, rightRole, outRole]);
  const orderPrimitive = admittedPrimitive(
    memory, theory, dOrderSource, [leftTemplate, rightTemplate], outRole,
  );
  const actualLeft = memory.ensure(k, a);
  const actualRight = memory.ensure(m, b);
  const dOrderTarget = defineStructuralRoleDictionary(memory, [a, b, c]);
  const orderTarget = targetIdentity(memory, theory, dOrderTarget, [actualLeft, actualRight], c);
  const hLeft = memory.ensure(actualLeft, orderTarget.identity);
  const hRight = memory.ensure(actualRight, orderTarget.identity);
  const reversed = proofOccurrence(memory, c, orderPrimitive.derivationRule, [hRight, hLeft]);
  expectRootedFailure("wrong premise order", () =>
    replayStructuralRootedProofAset(memory, proofRoot(memory, orderTarget.identity, reversed)));

  // Mutating a grounded subtree cannot be absorbed by rho.
  const groundedRole = fresh(), groundedOut = fresh();
  const groundedTemplate = memory.ensure(k, groundedRole);
  const dGroundedSource = defineStructuralRoleDictionary(memory, [groundedRole, groundedOut]);
  const groundedPrimitive = admittedPrimitive(memory, theory, dGroundedSource, [groundedTemplate], groundedOut);
  const mutatedClaim = memory.ensure(m, a);
  const dGroundedTarget = defineStructuralRoleDictionary(memory, [a, c]);
  const groundedTarget = targetIdentity(memory, theory, dGroundedTarget, [mutatedClaim], c);
  const hMutated = memory.ensure(mutatedClaim, groundedTarget.identity);
  const mutatedOut = proofOccurrence(memory, c, groundedPrimitive.derivationRule, [hMutated]);
  expectRootedFailure("grounded subtree mutation", () =>
    replayStructuralRootedProofAset(memory, proofRoot(memory, groundedTarget.identity, mutatedOut)));

  // P itself is forced into the target-occurrence position: self/cyclic P/O-like shape must fail closed.
  const selfRoot = memory.ensureEndSelfClosed(derived.identity);
  same(memory.poles(selfRoot).end, selfRoot, "self root end is itself");
  expectRootedFailure("self-referential root", () =>
    replayStructuralRootedProofAset(memory, selfRoot));
}

async function main(): Promise<void> {
  await positiveCorpus();
  overlapCorpus();
  weakeningCorpus();
  adversarialCorpus();
  console.log("rooted proof-Aset primitive/chain/branch = SUPPORTED");
  console.log("rooted proof-Aset contextual role overlap = SUPPORTED");
  console.log("rooted proof-Aset adversarial corpus = REJECTED");
  console.log("classification = GENERIC_ROOTED_PROOF_ASET_REPLAY_SUPPORTED");
}

void main();
