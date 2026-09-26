// mts-version-evidence: candidate-from=0.14

import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  StructuralClosureApplicationReplayError,
  replayStructuralDependentWitnessClosureApplication,
  replayStructuralParametricClosureApplication,
} from "../src/derived-derivation-closure.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import { replayStructuralRootedProofAset } from "../src/rooted-proof-aset.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error("v0.14 N8 dependent-witness closure: " + message);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function expectClosureError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof StructuralClosureApplicationReplayError,
      `${code}: wrong error type`,
    );
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected closure rejection`);
}

function admittedRoot(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): Readonly<{
  derivationRule: LinkHandle;
  identity: LinkHandle;
  root: LinkHandle;
}> {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(
    memory,
    rule,
    premises,
  );
  admitStructuralRule(memory, theory, rule);
  admitStructuralDerivationRule(memory, theory, derivationRule);
  const identity = memory.ensure(derivationRule, theory);
  const assumptions = premises.map((template) =>
    memory.ensure(template, identity)
  );
  const targetOccurrence = memory.ensure(
    derivationRule,
    materializeExactSequence(memory, assumptions),
  );
  const rootedOccurrence = memory.ensure(conclusion, targetOccurrence);
  const root = memory.ensure(identity, rootedOccurrence);
  const replay = replayStructuralRootedProofAset(memory, root);
  same(replay.conclusion, conclusion, "rooted conclusion");
  return Object.freeze({ derivationRule, identity, root });
}

function derivedResult(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): Readonly<{ derivationRule: LinkHandle; identity: LinkHandle }> {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  admitStructuralRule(memory, theory, rule);
  const derivationRule = defineStructuralDerivationRule(
    memory,
    rule,
    premises,
  );
  return Object.freeze({
    derivationRule,
    identity: memory.ensure(derivationRule, theory),
  });
}

function morphism(
  memory: Memory,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  targetDictionary: LinkHandle,
  bindings: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    materializeExactSequence(
      memory,
      bindings.map(([source, target]) =>
        memory.ensure(source, target)
      ),
    ),
  ]);
}

function specialization(
  memory: Memory,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  targetDictionary: LinkHandle,
  roleBindings: readonly (readonly [LinkHandle, LinkHandle])[],
  groundBindings: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    materializeExactSequence(
      memory,
      roleBindings.map(([source, target]) =>
        memory.ensure(source, target)
      ),
    ),
    materializeExactSequence(
      memory,
      groundBindings.map(([source, target]) =>
        memory.ensure(source, target)
      ),
    ),
  ]);
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);

  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, R);
    return cursor;
  };

  const theory = memory.ensure(L, U);
  const relationContext = memory.ensure(O, C);
  const addContext = memory.ensure(relationContext, fresh());
  const succContext = memory.ensure(relationContext, fresh());
  const natContext = memory.ensure(C, fresh());

  const add = (
    left: LinkHandle,
    right: LinkHandle,
    result: LinkHandle,
  ): LinkHandle =>
    memory.ensure(
      memory.ensure(
        memory.ensure(addContext, left),
        right,
      ),
      result,
    );

  const succ = (value: LinkHandle, next: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(succContext, value), next);

  const nat = (value: LinkHandle): LinkHandle =>
    memory.ensure(natContext, value);

  // Faithful N7 geometry:
  //   a       = stable parameter
  //   b -> b1 = induction coordinate
  //   c -> c1 = dependent witness
  const a = fresh();
  const b = fresh();
  const c = fresh();
  const b1 = fresh();
  const c1 = fresh();
  const x = fresh();
  const x1 = fresh();
  same(
    new Set([a, b, c, b1, c1, x, x1]).size,
    7,
    "proof coordinates are distinct",
  );

  const dBase = defineStructuralRoleDictionary(memory, [a]);
  const dStep = defineStructuralRoleDictionary(
    memory,
    [a, b, c, b1, c1],
  );
  const dResult = defineStructuralRoleDictionary(memory, [a, b, c]);
  const dAuthority = defineStructuralRoleDictionary(memory, [x, x1]);

  const baseClaim = add(a, U, a);
  const currentClaim = add(a, b, c);
  const nextClaim = add(a, b1, c1);
  const inductionStep = succ(b, b1);
  const witnessStep = succ(c, c1);

  const base = admittedRoot(
    memory,
    theory,
    dBase,
    [],
    baseClaim,
  );
  const step = admittedRoot(
    memory,
    theory,
    dStep,
    [inductionStep, witnessStep, currentClaim],
    nextClaim,
  );
  const result = derivedResult(
    memory,
    theory,
    dResult,
    [nat(b)],
    currentClaim,
  );

  assert(
    memory.find(theory, result.derivationRule) === undefined,
    "RESULT derivation rule starts derived",
  );

  const authority = materializeExactSequence(memory, [
    theory,
    dAuthority,
    U,
    nat(U),
    nat(x),
    succ(x, x1),
    nat(x1),
  ]);
  const authorityAdmission = memory.ensure(theory, authority);

  const inductionAuthorityMorphism = morphism(
    memory,
    theory,
    dAuthority,
    dStep,
    [
      [x, b],
      [x1, b1],
    ],
  );
  const witnessAuthorityMorphism = morphism(
    memory,
    theory,
    dAuthority,
    dStep,
    [
      [x, c],
      [x1, c1],
    ],
  );
  const currentMorphism = morphism(
    memory,
    theory,
    dResult,
    dStep,
    [
      [a, a],
      [b, b],
      [c, c],
    ],
  );
  const nextMorphism = morphism(
    memory,
    theory,
    dResult,
    dStep,
    [
      [a, a],
      [b, b1],
      [c, c1],
    ],
  );

  // BASE explicitly says:
  //   stable a -> a
  //   dependent witness c -> a
  //   induction b -> generator U
  const baseSpecialization = specialization(
    memory,
    theory,
    dResult,
    dBase,
    [
      [a, a],
      [c, a],
    ],
    [[b, U]],
  );

  const evidence = Object.freeze({
    authority,
    authorityAdmission,
    baseRoot: base.root,
    stepRoot: step.root,
    resultIdentity: result.identity,
    inductionAuthorityMorphism,
    witnessAuthorityMorphism,
    currentMorphism,
    nextMorphism,
    baseSpecialization,
  });

  const before = memory.linkCount;
  const replay = replayStructuralDependentWitnessClosureApplication(
    memory,
    evidence,
  );
  same(replay.theory, theory, "exact Theory");
  same(
    replay.resultDerivationRule,
    result.derivationRule,
    "derived RESULT identity",
  );
  same(
    replay.resultConclusionTemplate,
    currentClaim,
    "constructive family body",
  );
  same(replay.base.conclusion, baseClaim, "BASE consumed");
  same(replay.step.conclusion, nextClaim, "STEP consumed");
  same(replay.inductionRole, b, "RESULT induction Role is explicit");
  same(replay.dependentWitnessRole, c, "RESULT dependent-witness Role is explicit");
  same(replay.baseWitnessTargetRole, a, "BASE witness construction target is explicit");
  same(replay.stableParameterRoles.length, 1, "exactly one stable parameter Role");
  same(replay.stableParameterRoles[0], a, "stable parameter Role is explicit");
  same(memory.linkCount, before, "positive replay is read-only");
  assert(
    memory.find(theory, result.derivationRule) === undefined,
    "successful closure never primitive-admits RESULT",
  );

  // N8 is a strict extension of proof language; N6 must keep rejecting this
  // faithful two-changing-coordinate geometry.
  expectClosureError(
    "invalid-scope",
    () =>
      replayStructuralParametricClosureApplication(memory, {
        authority,
        authorityAdmission,
        baseRoot: base.root,
        stepRoot: step.root,
        resultIdentity: result.identity,
        authorityMorphism: inductionAuthorityMorphism,
        currentMorphism,
        nextMorphism,
        baseSpecialization,
      }),
  );

  // Stable parameter drift is rejected after induction/witness coordinates
  // have been identified structurally by their two authority morphisms.
  expectClosureError(
    "parameter-drift",
    () =>
      replayStructuralDependentWitnessClosureApplication(memory, {
        ...evidence,
        nextMorphism: morphism(
          memory,
          theory,
          dResult,
          dStep,
          [
            [a, b],
            [b, b1],
            [c, c1],
          ],
        ),
      }),
  );

  expectClosureError(
    "induction-not-advancing",
    () =>
      replayStructuralDependentWitnessClosureApplication(memory, {
        ...evidence,
        inductionAuthorityMorphism: morphism(
          memory,
          theory,
          dAuthority,
          dStep,
          [
            [x, b],
            [x1, b],
          ],
        ),
      }),
  );

  expectClosureError(
    "dependent-witness-not-advancing",
    () =>
      replayStructuralDependentWitnessClosureApplication(memory, {
        ...evidence,
        witnessAuthorityMorphism: morphism(
          memory,
          theory,
          dAuthority,
          dStep,
          [
            [x, c],
            [x1, c],
          ],
        ),
      }),
  );

  expectClosureError(
    "invalid-dependent-base-specialization",
    () =>
      replayStructuralDependentWitnessClosureApplication(memory, {
        ...evidence,
        baseSpecialization: specialization(
          memory,
          theory,
          dResult,
          dBase,
          [[a, a]],
          [[b, U]],
        ),
      }),
  );

  expectClosureError(
    "invalid-dependent-base-specialization",
    () =>
      replayStructuralDependentWitnessClosureApplication(memory, {
        ...evidence,
        baseSpecialization: specialization(
          memory,
          theory,
          dResult,
          dBase,
          [
            [a, a],
            [c, L],
          ],
          [[b, U]],
        ),
      }),
  );

  expectClosureError(
    "invalid-witness-morphism",
    () =>
      replayStructuralDependentWitnessClosureApplication(memory, {
        ...evidence,
        inductionAuthorityMorphism: morphism(
          memory,
          theory,
          dAuthority,
          dStep,
          [
            [x, b],
            [x1, c1],
          ],
        ),
      }),
  );

  expectClosureError(
    "invalid-witness-morphism",
    () =>
      replayStructuralDependentWitnessClosureApplication(memory, {
        ...evidence,
        witnessAuthorityMorphism: inductionAuthorityMorphism,
      }),
  );

  const q = fresh();
  const dStepExtra = defineStructuralRoleDictionary(
    memory,
    [a, b, c, b1, c1, q],
  );
  const stepExtra = admittedRoot(
    memory,
    theory,
    dStepExtra,
    [inductionStep, witnessStep, currentClaim],
    nextClaim,
  );
  expectClosureError(
    "invalid-scope",
    () =>
      replayStructuralDependentWitnessClosureApplication(memory, {
        ...evidence,
        stepRoot: stepExtra.root,
      }),
  );

  const foreignTheory = memory.ensure(C, R);
  expectClosureError(
    "invalid-witness-morphism",
    () =>
      replayStructuralDependentWitnessClosureApplication(memory, {
        ...evidence,
        witnessAuthorityMorphism: morphism(
          memory,
          foreignTheory,
          dAuthority,
          dStep,
          [
            [x, c],
            [x1, c1],
          ],
        ),
      }),
  );

  const reversedWitnessStep = succ(c1, c);
  const reversedStep = admittedRoot(
    memory,
    theory,
    dStep,
    [inductionStep, reversedWitnessStep, currentClaim],
    nextClaim,
  );
  expectClosureError(
    "step-mismatch",
    () =>
      replayStructuralDependentWitnessClosureApplication(memory, {
        ...evidence,
        stepRoot: reversedStep.root,
      }),
  );

  memory.ensure(theory, result.derivationRule);
  expectClosureError(
    "result-primitive-admission",
    () =>
      replayStructuralDependentWitnessClosureApplication(
        memory,
        evidence,
      ),
  );

  console.log([
    "MTS v0.14 N8: DEPENDENT_WITNESS_CLOSURE=GREEN_RESEARCH",
    "GENERIC_VERIFIER=TRUE",
    "ADD_SPECIFIC_HOST_DISPATCH=0",
    "STABLE_PARAMETER=A",
    "INDUCTION=B_TO_B1",
    "DEPENDENT_WITNESS=C_TO_C1",
    "BASE_INDUCTION=B_TO_U",
    "BASE_WITNESS=C_TO_A",
    "MACHINE_EXPOSED_WITNESS_COORDINATES=TRUE",
    "GENERAL_BASE_WITNESS_FUNCTION_W0_PARAMS=NOT_PROVIDED",
    "SAME_SUCCESSOR_AUTHORITY_USED_TWICE=TRUE",
    "N6_FAITHFUL_CASE_REJECT=invalid-scope",
    "PARAMETER_DRIFT_REJECTED=TRUE",
    "NONADVANCING_INDUCTION_REJECTED=TRUE",
    "NONADVANCING_WITNESS_REJECTED=TRUE",
    "MISSING_BASE_WITNESS_REJECTED=TRUE",
    "OUT_OF_SCOPE_BASE_WITNESS_REJECTED=TRUE",
    "WRONG_INDUCTION_MAPPING_REJECTED=TRUE",
    "WRONG_WITNESS_MAPPING_REJECTED=TRUE",
    "HIDDEN_STEP_ROLE_REJECTED=TRUE",
    "CROSS_THEORY_WITNESS_REJECTED=TRUE",
    "WRONG_WITNESS_TRANSITION_REJECTED=TRUE",
    "RESULT_PRIMITIVE_ADMISSION_REJECTED=TRUE",
    "REPLAY_READ_ONLY=TRUE",
    "ADD_CONSTRUCTIVE_TOTALITY_OVER_SECOND_NAT=GREEN_RESEARCH",
    "GENERAL_ADD_FUNCTIONALITY_PROOF=OPEN",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
