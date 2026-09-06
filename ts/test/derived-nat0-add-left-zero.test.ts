import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext } from "../src/state.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
  replayStructuralDerivationWithAssumptions,
} from "../src/derivation.js";
import {
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
} from "../src/derived-derivation-schema.js";
import {
  StructuralDerivedDerivationInstantiationError,
  instantiateStructuralDerivedDerivationSchema,
} from "../src/derived-derivation-instantiation.js";
import {
  StructuralDerivedDerivationCrossScopeApplicationReplayError,
  replayStructuralDerivedDerivationCrossScopeApplication,
} from "../src/derived-derivation-cross-scope.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function expectInstantiationError(code: string, effect: () => unknown): void {
  try { effect(); }
  catch (error) {
    assert(error instanceof StructuralDerivedDerivationInstantiationError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected instantiation rejection`);
}
function expectCrossScopeError(code: string, effect: () => unknown): void {
  try { effect(); }
  catch (error) {
    assert(
      error instanceof StructuralDerivedDerivationCrossScopeApplicationReplayError,
      `${code}: wrong error type`,
    );
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected cross-scope rejection`);
}

interface GenericFixture {
  readonly derivationRule: LinkHandle;
  readonly identity: LinkHandle;
  readonly evidence: StructuralDerivedDerivationEvidence;
}

function admittedGeneric(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): GenericFixture {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const derivationRuleAdmission = admitStructuralDerivationRule(memory, theory, derivationRule);
  const identity = memory.ensure(derivationRule, theory);
  const assumptions = premises.map((template) =>
    Object.freeze({ occurrence: memory.ensure(template, identity), template }),
  );
  const premiseOccurrenceSequence = materializeExactSequence(
    memory,
    assumptions.map(({ occurrence }) => occurrence),
  );
  const targetOccurrence = memory.ensure(derivationRule, premiseOccurrenceSequence);
  return Object.freeze({
    derivationRule,
    identity,
    evidence: Object.freeze({
      identity,
      targetOccurrence,
      assumptions: Object.freeze(assumptions),
      nodes: Object.freeze([Object.freeze({
        occurrence: targetOccurrence,
        derivationRule,
        ruleAdmission,
        derivationRuleAdmission,
        premiseOccurrenceSequence,
      })]),
    }),
  });
}

function targetIdentity(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): LinkHandle {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  return memory.ensure(derivationRule, theory);
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
    materializeExactSequence(memory, bindings.map(([source, target]) => memory.ensure(source, target))),
  ]);
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));

  const theory = memory.ensure(L, U);
  const interpreterDictionary = fresh();
  const grammar = fresh();
  const interpreter = defineStructuralInterpreter(memory, interpreterDictionary, grammar, theory);
  const afterContext = defineContext(memory, R, L);

  // Grounded contextual relation vocabulary is fixed before generic Roles.
  const binaryRelationContext = memory.ensure(O, C);
  const plusContext = memory.ensure(binaryRelationContext, fresh());
  const s0Context = memory.ensure(binaryRelationContext, fresh());
  const add = (a: LinkHandle, b: LinkHandle, c: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(memory.ensure(plusContext, a), b), c);
  const s0 = (a: LinkHandle, b: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(s0Context, a), b);

  const a = fresh();
  const b = fresh();
  const c = fresh();
  const b1 = fresh();
  const c1 = fresh();
  const n = fresh();
  const n1 = fresh();
  same(new Set([a, b, c, b1, c1, n, n1, U]).size, 8, "L0 coordinates are distinct");

  const dBaseSource = defineStructuralRoleDictionary(memory, [a]);
  const dAddSource = defineStructuralRoleDictionary(memory, [a, b, c, b1, c1]);
  const dBaseTarget = defineStructuralRoleDictionary(memory, []);
  const dStepTarget = defineStructuralRoleDictionary(memory, [n, n1]);

  const addBaseTemplate = add(a, U, a);
  const addPremiseTemplate = add(a, b, c);
  const s0BTemplate = s0(b, b1);
  const s0CTemplate = s0(c, c1);
  const addNextTemplate = add(a, b1, c1);

  const addBase = admittedGeneric(memory, theory, dBaseSource, [], addBaseTemplate);
  const addStep = admittedGeneric(
    memory,
    theory,
    dAddSource,
    [addPremiseTemplate, s0BTemplate, s0CTemplate],
    addNextTemplate,
  );
  same(
    replayStructuralDerivedDerivationSchema(memory, addBase.evidence).conclusionTemplate,
    addBaseTemplate,
    "generic Add(A,U,A) base control",
  );
  same(
    replayStructuralDerivedDerivationSchema(memory, addStep.evidence).conclusionTemplate,
    addNextTemplate,
    "generic Add recursion control",
  );

  const replayConcrete = (
    generic: StructuralDerivedDerivationEvidence,
    bindings: readonly StructuralRoleBinding[],
    expectedTarget: LinkHandle,
  ) => {
    const expansion = instantiateStructuralDerivedDerivationSchema(
      memory,
      generic,
      interpreter,
      afterContext,
      bindings,
    );
    same(expansion.targetClaim, expectedTarget, "rho concrete target");
    const before = memory.linkCount;
    const replay = replayStructuralDerivationWithAssumptions(memory, expansion.evidence);
    same(replay.derivation.target.judgment.claim, expectedTarget, "rho ordinary replay target");
    same(replay.derivation.theory, theory, "rho exact Theory");
    same(memory.linkCount, before, "rho expanded replay is read-only");
    return expansion;
  };

  // BASE arithmetic is already derivable concretely: A := U.
  const addUUU = add(U, U, U);
  const baseExpansion = replayConcrete(addBase.evidence, [{ role: a, value: U }], addUUU);
  same(baseExpansion.assumptionClaims.length, 0, "L0 BASE has no assumptions");

  // Ordinary rho works for Add recursion when its three assumptions remain distinct.
  const p = fresh();
  const q = fresh();
  const p1 = fresh();
  const q1 = fresh();
  const distinctStep = replayConcrete(
    addStep.evidence,
    [
      { role: a, value: U },
      { role: b, value: p },
      { role: c, value: q },
      { role: b1, value: p1 },
      { role: c1, value: q1 },
    ],
    add(U, p1, q1),
  );
  same(distinctStep.assumptionClaims.length, 3, "ordinary Add step has three assumptions");

  const l0Current = add(U, n, n);
  const l0Next = add(U, n1, n1);
  const l0S0 = s0(n, n1);

  // Full rho cannot be used as the L0 generic-step bridge: the two structural
  // successor premises collapse to one semantic S0(N,N1) claim and the current
  // concrete assumption carrier deliberately rejects duplicate assumption claims.
  expectInstantiationError("duplicate-assumption-claim", () =>
    instantiateStructuralDerivedDerivationSchema(
      memory,
      addStep.evidence,
      interpreter,
      afterContext,
      [
        { role: a, value: U },
        { role: b, value: n },
        { role: c, value: n },
        { role: b1, value: n1 },
        { role: c1, value: n1 },
      ],
    ),
  );
  same(s0(n, n1), l0S0, "both L0 successor slots collapse to one semantic S0 Link");

  // The existing mu bridge is Role->Role only. L0 BASE needs A->U while the
  // target scope has no active Role at all, so grounding cannot be smuggled in.
  const baseTargetIdentity = targetIdentity(memory, theory, dBaseTarget, [], addUUU);
  const baseMixedMorphism = morphism(memory, theory, dBaseSource, dBaseTarget, [[a, U]]);
  expectCrossScopeError("target-role-not-member", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: addBase.evidence,
      morphism: baseMixedMorphism,
      targetIdentity: baseTargetIdentity,
    }),
  );

  // L0 STEP needs a genuinely mixed specialization:
  //   A->U, B/C->N, B1/C1->N1.
  // Current mu correctly rejects the grounded A->U leg before any mapped target
  // can masquerade as proof authority.
  const stepTargetIdentity = targetIdentity(
    memory,
    theory,
    dStepTarget,
    [l0Current, l0S0, l0S0],
    l0Next,
  );
  const mixedStepMorphism = morphism(memory, theory, dAddSource, dStepTarget, [
    [a, U],
    [b, n],
    [c, n],
    [b1, n1],
    [c1, n1],
  ]);
  const beforeMixed = memory.linkCount;
  expectCrossScopeError("target-role-not-member", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: addStep.evidence,
      morphism: mixedStepMorphism,
      targetIdentity: stepTargetIdentity,
    }),
  );
  same(memory.linkCount, beforeMixed, "mixed mu rejection is read-only");

  // Host decorations cannot turn the rejected mixed carrier into authority.
  const decorated = {
    source: addStep.evidence,
    morphism: mixedStepMorphism,
    targetIdentity: stepTargetIdentity,
    weakening: true,
    induction: true,
    callback: (_value: LinkHandle) => true,
  };
  expectCrossScopeError("target-role-not-member", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, decorated),
  );

  // A partial role-only workaround is also invalid: mu must remain total.
  const partialRoleOnly = morphism(memory, theory, dAddSource, dStepTarget, [
    [b, n],
    [c, n],
    [b1, n1],
    [c1, n1],
  ]);
  expectCrossScopeError("missing-source-role", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: addStep.evidence,
      morphism: partialRoleOnly,
      targetIdentity: stepTargetIdentity,
    }),
  );
}

main();
