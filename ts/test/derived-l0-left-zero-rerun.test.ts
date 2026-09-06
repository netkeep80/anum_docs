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
  StructuralDerivedDerivationReplayError,
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
} from "../src/derived-derivation-schema.js";
import {
  replayStructuralDerivedDerivationSpecialization,
  type StructuralDerivedDerivationSpecializationEvidence,
} from "../src/derived-derivation-specialization.js";
import {
  StructuralClosureApplicationReplayError,
  replayStructuralClosureApplication,
} from "../src/derived-derivation-closure.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function expectSchemaError(code: string, effect: () => unknown): void {
  try { effect(); }
  catch (error) {
    assert(error instanceof StructuralDerivedDerivationReplayError, `${code}: wrong schema error type`);
    same(error.code, code, `${code}: wrong schema error code`);
    return;
  }
  throw new Error(`${code}: expected schema rejection`);
}
function expectClosureError(code: string, effect: () => unknown): void {
  try { effect(); }
  catch (error) {
    assert(error instanceof StructuralClosureApplicationReplayError, `${code}: wrong closure error type`);
    same(error.code, code, `${code}: wrong closure error code`);
    return;
  }
  throw new Error(`${code}: expected closure rejection`);
}

interface GenericFixture {
  readonly derivationRule: LinkHandle;
  readonly identity: LinkHandle;
  readonly evidence: StructuralDerivedDerivationEvidence;
}
interface TargetFixture {
  readonly derivationRule: LinkHandle;
  readonly identity: LinkHandle;
  readonly assumptions: readonly { readonly occurrence: LinkHandle; readonly template: LinkHandle }[];
  readonly targetOccurrence: LinkHandle;
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
    Object.freeze({ occurrence: memory.ensure(template, identity), template }));
  const premiseOccurrenceSequence = materializeExactSequence(
    memory, assumptions.map(({ occurrence }) => occurrence));
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

function specializationTarget(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): TargetFixture {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  const identity = memory.ensure(derivationRule, theory);
  const occurrenceByTemplate = new Map<LinkHandle, LinkHandle>();
  const assumptions: { readonly occurrence: LinkHandle; readonly template: LinkHandle }[] = [];
  for (const template of premises) {
    if (occurrenceByTemplate.has(template)) continue;
    const occurrence = memory.ensure(template, identity);
    occurrenceByTemplate.set(template, occurrence);
    assumptions.push(Object.freeze({ occurrence, template }));
  }
  const slots = premises.map((template) => {
    const occurrence = occurrenceByTemplate.get(template);
    if (occurrence === undefined) throw new Error("target slot fixture invariant");
    return occurrence;
  });
  return Object.freeze({
    derivationRule,
    identity,
    assumptions: Object.freeze(assumptions),
    targetOccurrence: memory.ensure(derivationRule, materializeExactSequence(memory, slots)),
  });
}

function specializationCarrier(
  memory: Memory,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  targetDictionary: LinkHandle,
  roleBindings: readonly (readonly [LinkHandle, LinkHandle])[],
  groundBindings: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  const partition = (bindings: readonly (readonly [LinkHandle, LinkHandle])[]) =>
    materializeExactSequence(memory, bindings.map(([source, value]) => memory.ensure(source, value)));
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    partition(roleBindings),
    partition(groundBindings),
  ]);
}

function specializationEvidence(
  source: StructuralDerivedDerivationEvidence,
  specialization: LinkHandle,
  target: TargetFixture,
): StructuralDerivedDerivationSpecializationEvidence {
  return Object.freeze({
    source,
    specialization,
    targetIdentity: target.identity,
    targetAssumptions: target.assumptions,
    targetOccurrence: target.targetOccurrence,
  });
}

function unadmittedTargetEvidence(target: TargetFixture): StructuralDerivedDerivationEvidence {
  return Object.freeze({
    identity: target.identity,
    targetOccurrence: target.targetOccurrence,
    assumptions: target.assumptions,
    nodes: Object.freeze([]),
  });
}

function resultIdentity(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): { readonly derivationRule: LinkHandle; readonly identity: LinkHandle } {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  admitStructuralRule(memory, theory, rule);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  return Object.freeze({ derivationRule, identity: memory.ensure(derivationRule, theory) });
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

function grounding(
  memory: Memory,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  generator: LinkHandle,
  sourceRole: LinkHandle,
): LinkHandle {
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    generator,
    materializeExactSequence(memory, [memory.ensure(sourceRole, generator)]),
  ]);
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const theory = memory.ensure(L, U);

  // Ground relation vocabulary before any generic Role is selected.
  const binaryContext = memory.ensure(O, C);
  const plusContext = memory.ensure(binaryContext, fresh());
  const s0Context = memory.ensure(binaryContext, fresh());
  const nat0Context = memory.ensure(C, fresh());
  const add = (a: LinkHandle, b: LinkHandle, c: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(memory.ensure(plusContext, a), b), c);
  const s0 = (a: LinkHandle, b: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(s0Context, a), b);
  const nat0 = (value: LinkHandle): LinkHandle => memory.ensure(nat0Context, value);

  const a = fresh(), b = fresh(), c = fresh(), b1 = fresh(), c1 = fresh();
  const n = fresh(), n1 = fresh(), x = fresh(), x1 = fresh();
  same(new Set([a, b, c, b1, c1, n, n1, x, x1, U]).size, 10,
    "L0 and closure coordinates are distinct");

  const dBaseSource = defineStructuralRoleDictionary(memory, [a]);
  const dAddSource = defineStructuralRoleDictionary(memory, [a, b, c, b1, c1]);
  const dBase = defineStructuralRoleDictionary(memory, []);
  const dStep = defineStructuralRoleDictionary(memory, [n, n1]);
  const dResult = defineStructuralRoleDictionary(memory, [n]);
  const dAuthority = defineStructuralRoleDictionary(memory, [x, x1]);

  const sourceBase = admittedGeneric(memory, theory, dBaseSource, [], add(a, U, a));
  const sourceStep = admittedGeneric(memory, theory, dAddSource, [
    add(a, b, c), s0(b, b1), s0(c, c1),
  ], add(a, b1, c1));
  same(replayStructuralDerivedDerivationSchema(memory, sourceBase.evidence).conclusionTemplate,
    add(a, U, a), "source Add base replay");
  same(replayStructuralDerivedDerivationSchema(memory, sourceStep.evidence).conclusionTemplate,
    add(a, b1, c1), "source Add recursion replay");

  const addUUU = add(U, U, U);
  const l0Current = add(U, n, n);
  const l0S0 = s0(n, n1);
  const l0Next = add(U, n1, n1);

  // #1035 now verifies both formerly blocked mixed specializations.
  const baseTarget = specializationTarget(memory, theory, dBase, [], addUUU);
  const baseSpec = specializationCarrier(memory, theory, dBaseSource, dBase, [], [[a, U]]);
  const baseBefore = memory.linkCount;
  const baseReplay = replayStructuralDerivedDerivationSpecialization(
    memory, specializationEvidence(sourceBase.evidence, baseSpec, baseTarget));
  same(baseReplay.targetConclusionTemplate, addUUU, "mixed BASE target");
  same(baseReplay.targetAssumptionCount, 0, "mixed BASE assumptions");
  same(baseReplay.premiseSlotCount, 0, "mixed BASE slots");
  same(memory.linkCount, baseBefore, "mixed BASE replay read-only");

  const stepTarget = specializationTarget(
    memory, theory, dStep, [l0Current, l0S0, l0S0], l0Next);
  const stepSpec = specializationCarrier(memory, theory, dAddSource, dStep, [
    [b, n], [c, n], [b1, n1], [c1, n1],
  ], [[a, U]]);
  const stepBefore = memory.linkCount;
  const stepReplay = replayStructuralDerivedDerivationSpecialization(
    memory, specializationEvidence(sourceStep.evidence, stepSpec, stepTarget));
  same(stepReplay.targetConclusionTemplate, l0Next, "mixed STEP target");
  same(stepReplay.targetAssumptionCount, 2, "mixed STEP semantic assumptions");
  same(stepReplay.premiseSlotCount, 3, "mixed STEP structural slots");
  same(memory.linkCount, stepBefore, "mixed STEP replay read-only");
  assert(memory.find(theory, baseTarget.derivationRule) === undefined,
    "mixed BASE target DR remains unadmitted");
  assert(memory.find(theory, stepTarget.derivationRule) === undefined,
    "mixed STEP target DR remains unadmitted");

  // Specialization verification is not itself a strict generic proof certificate.
  // BASE has no proof node carrying primitive Rule/DR admissions, so strict replay
  // cannot find its target occurrence. Adding that DR admission would be the
  // forbidden self-admission workaround rather than proof-object composition.
  const baseProofObject = unadmittedTargetEvidence(baseTarget);
  expectSchemaError("target-occurrence-not-found", () =>
    replayStructuralDerivedDerivationSchema(memory, baseProofObject));

  // STEP exposes the same boundary even earlier: specialization correctly keeps
  // two semantic assumptions for three structural slots, while the strict schema
  // carrier requires one assumption entry per premise slot and cannot consume the
  // aliasing-aware target proof carrier as-is.
  const stepProofObject = unadmittedTargetEvidence(stepTarget);
  expectSchemaError("target-assumption-mismatch", () =>
    replayStructuralDerivedDerivationSchema(memory, stepProofObject));

  // Build the real Nat0 least-closure authority and RESULT so closure replay reaches
  // the proof-object boundary before any guarded-step weakening question.
  const authority = materializeExactSequence(memory, [
    theory,
    dAuthority,
    U,
    nat0(U),
    nat0(x),
    s0(x, x1),
    nat0(x1),
  ]);
  const authorityAdmission = memory.ensure(theory, authority);
  const result = resultIdentity(memory, theory, dResult, [nat0(n)], l0Current);
  assert(memory.find(theory, result.derivationRule) === undefined,
    "L0 RESULT DR remains unadmitted");

  const closureEvidence = Object.freeze({
    authority,
    authorityAdmission,
    base: baseProofObject,
    step: stepProofObject,
    resultIdentity: result.identity,
    authorityMorphism: morphism(memory, theory, dAuthority, dStep, [[x, n], [x1, n1]]),
    currentMorphism: morphism(memory, theory, dResult, dStep, [[n, n]]),
    nextMorphism: morphism(memory, theory, dResult, dStep, [[n, n1]]),
    baseGrounding: grounding(memory, theory, dResult, U, n),
  });

  const closureBefore = memory.linkCount;
  expectClosureError("invalid-base", () =>
    replayStructuralClosureApplication(memory, closureEvidence));
  same(memory.linkCount, closureBefore, "L0 closure rejection is read-only");
  assert(memory.find(theory, baseTarget.derivationRule) === undefined,
    "falsifier does not promote BASE target DR");
  assert(memory.find(theory, stepTarget.derivationRule) === undefined,
    "falsifier does not promote STEP target DR");
  assert(memory.find(theory, result.derivationRule) === undefined,
    "falsifier does not promote RESULT DR");
}

main();
