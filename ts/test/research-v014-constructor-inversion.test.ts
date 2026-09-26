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
  replayConstructorScopedClosedProofOccurrence,
  replayConstructorScopedStructuralOccurrence,
} from "../src/rooted-proof-aset.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 N11 constructor inversion: " + message);
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

function constructor(
  memory: Memory,
  theory: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): Readonly<{ rule: LinkHandle; derivationRule: LinkHandle }> {
  const dictionary = defineStructuralRoleDictionary(memory, []);
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  admitStructuralRule(memory, theory, rule);
  admitStructuralDerivationRule(memory, theory, derivationRule);
  return Object.freeze({ rule, derivationRule });
}

function occurrence(
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

function identityProof(
  memory: Memory,
  left: LinkHandle,
  right: LinkHandle,
  children: readonly LinkHandle[],
): LinkHandle {
  return memory.ensure(
    memory.ensure(left, right),
    materializeExactSequence(memory, children),
  );
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

  const leafClaim = memory.ensure(O, U);
  const stepClaim = memory.ensure(C, U);

  const leaf = constructor(memory, theory, [], leafClaim);
  const step = constructor(memory, theory, [leafClaim], stepClaim);
  const leafOccurrence = occurrence(memory, leafClaim, leaf.derivationRule, []);
  const stepOccurrence = occurrence(
    memory,
    stepClaim,
    step.derivationRule,
    [leafOccurrence],
  );

  const selected = authority(memory, theory, [
    leaf.derivationRule,
    step.derivationRule,
  ]);

  // Zero-premise constructor inversion.
  const beforeLeaf = memory.linkCount;
  const leafReplay = replayConstructorScopedStructuralOccurrence(
    memory,
    selected.carrier,
    selected.admission,
    leafOccurrence,
  );
  same(leafReplay.theory, theory, "leaf Theory");
  same(leafReplay.claim, leafClaim, "leaf Claim");
  same(leafReplay.primitiveDerivationRule, leaf.derivationRule, "leaf exact primitive DR");
  same(leafReplay.dependencyOccurrences.length, 0, "leaf direct dependency arity");
  same(memory.linkCount, beforeLeaf, "leaf inversion read-only");

  // One-premise constructor inversion must expose the exact incoming
  // ProofOccurrence identity, not merely its Claim or a host copy.
  const beforeStep = memory.linkCount;
  const stepReplay = replayConstructorScopedStructuralOccurrence(
    memory,
    selected.carrier,
    selected.admission,
    stepOccurrence,
  );
  same(stepReplay.claim, stepClaim, "step Claim");
  same(stepReplay.primitiveDerivationRule, step.derivationRule, "step exact primitive DR");
  same(stepReplay.dependencyOccurrences.length, 1, "step direct dependency arity");
  same(
    stepReplay.dependencyOccurrences[0],
    leafOccurrence,
    "step exposes exact dependency ProofOccurrence",
  );
  assert(
    stepReplay.validatedOccurrences.some(({ occurrence: item }) =>
      item === leafOccurrence
    ),
    "full dependency closure was validated before inversion",
  );
  same(memory.linkCount, beforeStep, "step inversion read-only");

  // Same-Theory primitive authority is insufficient when the DR is absent
  // from the selected constructor carrier.
  const forgedClaim = memory.ensure(O, C);
  const forged = constructor(memory, theory, [], forgedClaim);
  const forgedOccurrence = occurrence(
    memory,
    forgedClaim,
    forged.derivationRule,
    [],
  );
  expectReplayError(
    "primitive-derivation-rule-out-of-scope",
    () =>
      replayConstructorScopedStructuralOccurrence(
        memory,
        selected.carrier,
        selected.admission,
        forgedOccurrence,
      ),
  );

  // The intrinsic identity law remains valid in an empty structural
  // constructor scope, but structural inversion must not relabel it as a
  // primitive constructor.
  const identityOnly = authority(memory, theory, []);
  const rootIdentity = identityProof(memory, R, R, []);
  same(
    replayConstructorScopedClosedProofOccurrence(
      memory,
      identityOnly.carrier,
      identityOnly.admission,
      rootIdentity,
    ).claim,
    R,
    "identity-only closed replay remains valid",
  );
  expectReplayError(
    "target-not-structural-constructor",
    () =>
      replayConstructorScopedStructuralOccurrence(
        memory,
        identityOnly.carrier,
        identityOnly.admission,
        rootIdentity,
      ),
  );

  // Tampered direct dependency fails during the full scoped replay; inversion
  // is never returned from an invalid dependency graph.
  const wrongDependency = identityProof(memory, R, R, []);
  const tamperedStep = occurrence(
    memory,
    stepClaim,
    step.derivationRule,
    [wrongDependency],
  );
  expectReplayError(
    "invalid-proof-occurrence",
    () =>
      replayConstructorScopedStructuralOccurrence(
        memory,
        selected.carrier,
        selected.admission,
        tamperedStep,
      ),
  );

  console.log([
    "MTS v0.14 N11: CONSTRUCTOR_INVERSION=GREEN_RESEARCH",
    "ZERO_PREMISE_INVERSION=GREEN",
    "ONE_PREMISE_INVERSION=GREEN",
    "TARGET_PRIMITIVE_DR_EXACT=TRUE",
    "DIRECT_DEPENDENCY_OCCURRENCE_EXACT=TRUE",
    "FULL_CLOSURE_VALIDATED_BEFORE_INVERSION=TRUE",
    "OUT_OF_SCOPE_TARGET_DR_REJECTED=TRUE",
    "IDENTITY_ONLY_CLOSED_REPLAY=GREEN",
    "IDENTITY_NOT_RELABELLED_AS_STRUCTURAL_CONSTRUCTOR=TRUE",
    "TAMPERED_DEPENDENCY_REJECTED_BEFORE_INVERSION=TRUE",
    "REPLAY_READ_ONLY=TRUE",
    "ADD_SPECIFIC_HOST_DISPATCH=0",
    "NEXT=ADD_FUNCTIONALITY_INDUCTION",
    "GENERAL_ADD_FUNCTIONALITY_PROOF=OPEN",
    "ACCEPTED_V013_BEHAVIOR_CHANGED=FALSE",
  ].join(" "));
}

main();
