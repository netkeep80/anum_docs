// mts-version-evidence: candidate-from=0.14

import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  StructuralRootedProofAsetReplayError,
  replayClosedProofOccurrence,
  replayConstructorScopedClosedProofOccurrence,
} from "../src/rooted-proof-aset.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 N10 constructor-scoped proof: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function expectReplayError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRootedProofAsetReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected rejection`);
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

function zeroPremiseOccurrence(
  memory: Memory,
  theory: LinkHandle,
  conclusion: LinkHandle,
): Readonly<{
  rule: LinkHandle;
  derivationRule: LinkHandle;
  occurrence: LinkHandle;
}> {
  const dictionary = defineStructuralRoleDictionary(memory, []);
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, []);
  admitStructuralRule(memory, theory, rule);
  admitStructuralDerivationRule(memory, theory, derivationRule);
  const identity = memory.ensure(derivationRule, theory);
  const application = memory.ensure(
    derivationRule,
    materializeExactSequence(memory, []),
  );
  return Object.freeze({
    rule,
    derivationRule,
    occurrence: memory.ensure(conclusion, application),
  });
}

function authority(
  memory: Memory,
  theory: LinkHandle,
  constructors: readonly LinkHandle[],
): Readonly<{ carrier: LinkHandle; admission: LinkHandle }> {
  const carrier = materializeExactSequence(memory, [theory, ...constructors]);
  return Object.freeze({
    carrier,
    admission: memory.ensure(theory, carrier),
  });
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const theory = memory.ensure(L, U);

  // Empty constructor scope is meaningful: it allows the intrinsic recursive
  // identity law while authorizing zero structural derivation constructors.
  const identityOnly = authority(memory, theory, []);
  const rootIdentityProof = identityProof(memory, R, R, []);
  const identityBefore = memory.linkCount;
  const identityReplay = replayConstructorScopedClosedProofOccurrence(
    memory,
    identityOnly.carrier,
    identityOnly.admission,
    rootIdentityProof,
  );
  same(identityReplay.claim, R, "identity-only scope exact ROOT identity Claim");
  same(identityReplay.constructors.length, 0, "identity-only scope has zero structural constructors");
  same(memory.linkCount, identityBefore, "identity-only replay read-only");

  const selectedClaim = memory.ensure(O, U);
  const selected = zeroPremiseOccurrence(memory, theory, selectedClaim);
  const selectedAuthority = authority(
    memory,
    theory,
    [selected.derivationRule],
  );

  const beforeSelected = memory.linkCount;
  const replay = replayConstructorScopedClosedProofOccurrence(
    memory,
    selectedAuthority.carrier,
    selectedAuthority.admission,
    selected.occurrence,
  );
  same(replay.theory, theory, "selected Theory");
  same(replay.claim, selectedClaim, "selected claim");
  same(replay.constructorAuthority, selectedAuthority.carrier, "authority identity");
  same(replay.constructors.length, 1, "one constructor");
  same(replay.constructors[0], selected.derivationRule, "selected constructor");
  same(memory.linkCount, beforeSelected, "selected replay read-only");

  // Strict-extension witness: old replay accepts another same-Theory primitive
  // DR, while constructor-scoped replay rejects it because it is not selected.
  const forgedClaim = memory.ensure(C, U);
  const forged = zeroPremiseOccurrence(memory, theory, forgedClaim);
  same(
    replayClosedProofOccurrence(memory, theory, forged.occurrence).claim,
    forgedClaim,
    "legacy unscoped replay still accepts same-Theory forged constructor",
  );
  const beforeForged = memory.linkCount;
  expectReplayError(
    "primitive-derivation-rule-out-of-scope",
    () =>
      replayConstructorScopedClosedProofOccurrence(
        memory,
        selectedAuthority.carrier,
        selectedAuthority.admission,
        forged.occurrence,
      ),
  );
  same(memory.linkCount, beforeForged, "out-of-scope rejection read-only");

  // Missing authority admission.
  const unadmittedCarrier = materializeExactSequence(memory, [
    theory,
    selected.derivationRule,
  ]);
  const fakeAdmission = memory.ensure(U, unadmittedCarrier);
  expectReplayError(
    "constructor-authority-not-admitted",
    () =>
      replayConstructorScopedClosedProofOccurrence(
        memory,
        unadmittedCarrier,
        fakeAdmission,
        selected.occurrence,
      ),
  );

  // Duplicate constructor identity is not a valid authority.
  const duplicate = authority(memory, theory, [
    selected.derivationRule,
    selected.derivationRule,
  ]);
  expectReplayError(
    "invalid-constructor-authority",
    () =>
      replayConstructorScopedClosedProofOccurrence(
        memory,
        duplicate.carrier,
        duplicate.admission,
        selected.occurrence,
      ),
  );

  // Cross-Theory primitive DR cannot be imported merely by listing it.
  const foreignTheory = memory.ensure(C, R);
  const foreign = zeroPremiseOccurrence(
    memory,
    foreignTheory,
    memory.ensure(R, O),
  );
  const cross = authority(memory, theory, [foreign.derivationRule]);
  expectReplayError(
    "invalid-constructor-authority",
    () =>
      replayConstructorScopedClosedProofOccurrence(
        memory,
        cross.carrier,
        cross.admission,
        foreign.occurrence,
      ),
  );

  // A malformed non-sequence carrier is rejected before proof replay.
  const malformed = memory.ensure(R, U);
  const malformedAdmission = memory.ensure(theory, malformed);
  expectReplayError(
    "invalid-constructor-authority",
    () =>
      replayConstructorScopedClosedProofOccurrence(
        memory,
        malformed,
        malformedAdmission,
        selected.occurrence,
      ),
  );

  // Authority with a same-Theory DR that was never admitted is invalid.
  const rawDictionary = defineStructuralRoleDictionary(memory, []);
  const rawRule = defineStructuralRule(memory, rawDictionary, memory.ensure(R, C));
  admitStructuralRule(memory, theory, rawRule);
  const rawDr = defineStructuralDerivationRule(memory, rawRule, []);
  const rawAuthorityCarrier = materializeExactSequence(memory, [theory, rawDr]);
  const rawAuthorityAdmission = memory.ensure(theory, rawAuthorityCarrier);
  expectReplayError(
    "invalid-constructor-authority",
    () =>
      replayConstructorScopedClosedProofOccurrence(
        memory,
        rawAuthorityCarrier,
        rawAuthorityAdmission,
        selected.occurrence,
      ),
  );

  console.log([
    "MTS v0.14 N10: CONSTRUCTOR_SCOPED_CLOSED_PROOF=GREEN_RESEARCH",
    "AUTHORITY=LINK_CARRIED",
    "AUTHORITY_THEORY_ADMISSION=REQUIRED",
    "SELECTED_CONSTRUCTOR_REPLAY=GREEN",
    "EMPTY_CONSTRUCTOR_SCOPE_IDENTITY_REPLAY=GREEN",
    "LEGACY_UNSCOPED_REPLAY_UNCHANGED=TRUE",
    "THEORY_ADMITTED_OUT_OF_SCOPE_DR_REJECTED=TRUE",
    "OUT_OF_SCOPE_ERROR=primitive-derivation-rule-out-of-scope",
    "DUPLICATE_CONSTRUCTOR_REJECTED=TRUE",
    "CROSS_THEORY_CONSTRUCTOR_REJECTED=TRUE",
    "UNADMITTED_CONSTRUCTOR_REJECTED=TRUE",
    "MALFORMED_AUTHORITY_REJECTED=TRUE",
    "REPLAY_READ_ONLY=TRUE",
    "ADD_SPECIFIC_HOST_DISPATCH=0",
    "NEXT=ADD_FUNCTIONALITY_BY_CONSTRUCTOR_INVERSION",
    "GENERAL_ADD_FUNCTIONALITY_PROOF=OPEN",
    "ACCEPTED_V013_BEHAVIOR_CHANGED=FALSE",
  ].join(" "));
}

main();
