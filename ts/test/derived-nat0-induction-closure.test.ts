import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle, type ReadMemory } from "../src/memory.js";
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
  StructuralClosureApplicationReplayError,
  replayStructuralClosureApplication,
  type StructuralClosureApplicationEvidence,
} from "../src/derived-derivation-closure.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function expectClosureError(code: string, effect: () => unknown): void {
  try { effect(); }
  catch (error) {
    assert(error instanceof StructuralClosureApplicationReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected closure replay error`);
}
function expectDerivedError(code: string, effect: () => unknown): void {
  try { effect(); }
  catch (error) {
    assert(error instanceof StructuralDerivedDerivationReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected generic replay error`);
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
    memory, assumptions.map(({ occurrence }) => occurrence),
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

function unadmittedGeneric(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): GenericFixture {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const identity = memory.ensure(derivationRule, theory);
  const assumptions = premises.map((template) =>
    Object.freeze({ occurrence: memory.ensure(template, identity), template }),
  );
  const premiseOccurrenceSequence = materializeExactSequence(
    memory, assumptions.map(({ occurrence }) => occurrence),
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
        derivationRuleAdmission: identity,
        premiseOccurrenceSequence,
      })]),
    }),
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
  const theory = memory.ensure(C, U);
  const foreignTheory = memory.ensure(U, C);

  const x = memory.ensure(R, L);
  const x1 = memory.ensure(R, U);
  const n = memory.ensure(L, R);
  const n1 = memory.ensure(U, R);
  same(new Set([x, x1, n, n1, U]).size, 5, "Nat0 closure coordinates are distinct");

  const dAuthority = defineStructuralRoleDictionary(memory, [x, x1]);
  const dResult = defineStructuralRoleDictionary(memory, [n]);
  const dBase = defineStructuralRoleDictionary(memory, []);
  const dStep = defineStructuralRoleDictionary(memory, [n, n1]);

  // Nat0 and S0 are ordinary contextual relation Links. The host does not inspect
  // connectivity degree, integers, or traversal shape to infer domain membership.
  const nat0Context = memory.ensure(O, C);
  const s0Context = memory.ensure(C, O);
  const claimContext = memory.ensure(L, U);
  const nat0 = (value: LinkHandle): LinkHandle => memory.ensure(nat0Context, value);
  const s0 = (left: LinkHandle, right: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(s0Context, left), right);
  const claim = (value: LinkHandle): LinkHandle =>
    memory.ensure(claimContext, memory.ensure(value, value));

  const natU = nat0(U);
  const natX = nat0(x);
  const natX1 = nat0(x1);
  const natN = nat0(n);
  const natN1 = nat0(n1);
  const s0XX1 = s0(x, x1);
  const s0NN1 = s0(n, n1);
  const cU = claim(U);
  const cN = claim(n);
  const cN1 = claim(n1);

  // Explicit arithmetic-domain controls: base membership and successor closure are
  // independently replayable ordinary proof data under the exact selected Theory.
  const natBase = admittedGeneric(memory, theory, dBase, [], natU);
  const natStep = admittedGeneric(memory, theory, dStep, [natN, s0NN1], natN1);
  same(replayStructuralDerivedDerivationSchema(memory, natBase.evidence).conclusionTemplate, natU,
    "Nat0(U) control");
  same(replayStructuralDerivedDerivationSchema(memory, natStep.evidence).conclusionTemplate, natN1,
    "Nat0 successor-closure control");

  const authority = materializeExactSequence(memory, [
    theory, dAuthority, U, natU, natX, s0XX1, natX1,
  ]);
  const authorityAdmission = memory.ensure(theory, authority);

  const base = admittedGeneric(memory, theory, dBase, [], cU);
  const step = admittedGeneric(memory, theory, dStep, [natN, s0NN1, cN], cN1);
  same(replayStructuralDerivedDerivationSchema(memory, base.evidence).conclusionTemplate, cU,
    "IND BASE control");
  same(replayStructuralDerivedDerivationSchema(memory, step.evidence).conclusionTemplate, cN1,
    "IND STEP control");

  const result = unadmittedGeneric(memory, theory, dResult, [natN], cN);
  assert(memory.find(theory, result.derivationRule) === undefined,
    "IND RESULT must not be primitive Theory authority");
  expectDerivedError("derivation-rule-not-admitted", () =>
    replayStructuralDerivedDerivationSchema(memory, result.evidence),
  );

  const authorityMorphism = morphism(memory, theory, dAuthority, dStep, [[x, n], [x1, n1]]);
  const currentMorphism = morphism(memory, theory, dResult, dStep, [[n, n]]);
  const nextMorphism = morphism(memory, theory, dResult, dStep, [[n, n1]]);
  const baseGrounding = grounding(memory, theory, dResult, U, n);
  const evidence: StructuralClosureApplicationEvidence = Object.freeze({
    authority,
    authorityAdmission,
    base: base.evidence,
    step: step.evidence,
    resultIdentity: result.identity,
    authorityMorphism,
    currentMorphism,
    nextMorphism,
    baseGrounding,
  });

  const before = memory.linkCount;
  const replay = replayStructuralClosureApplication(memory, evidence);
  same(replay.theory, theory, "Nat0 IND exact Theory");
  same(replay.resultDerivationRule, result.derivationRule, "Nat0 IND RESULT derivation rule");
  same(replay.resultConclusionTemplate, cN, "Nat0 IND nested/repeated claim");
  same(memory.linkCount, before, "Nat0 IND replay is read-only");
  assert(memory.find(theory, result.derivationRule) === undefined,
    "Nat0 IND replay must not promote RESULT");

  // Host annotations do not contribute authority: removing them changes nothing,
  // and adding them cannot substitute for the exact MTS closure carrier above.
  const decorated = {
    ...evidence,
    induction: true,
    cachedReplay: replay,
    callback: (_value: LinkHandle) => true,
  };
  same(replayStructuralClosureApplication(memory, decorated).resultConclusionTemplate, cN,
    "host induction metadata is non-authoritative");

  const malformedAuthority = materializeExactSequence(memory, [
    theory, dAuthority, U, natU, natX, s0XX1,
  ]);
  expectClosureError("invalid-authority", () => replayStructuralClosureApplication(memory, {
    ...evidence,
    authority: malformedAuthority,
    authorityAdmission: memory.ensure(theory, malformedAuthority),
  }));

  const wrongBase = grounding(memory, theory, dResult, L, n);
  expectClosureError("invalid-base-grounding", () =>
    replayStructuralClosureApplication(memory, { ...evidence, baseGrounding: wrongBase }),
  );

  const wrongDomainContext = memory.ensure(O, U);
  const wrongNatN = memory.ensure(wrongDomainContext, n);
  const wrongDomainStep = admittedGeneric(memory, theory, dStep, [wrongNatN, s0NN1, cN], cN1);
  expectClosureError("domain-mismatch", () =>
    replayStructuralClosureApplication(memory, { ...evidence, step: wrongDomainStep.evidence }),
  );

  const wrongS0 = s0(n1, n);
  const wrongStep = admittedGeneric(memory, theory, dStep, [natN, wrongS0, cN], cN1);
  expectClosureError("step-mismatch", () =>
    replayStructuralClosureApplication(memory, { ...evidence, step: wrongStep.evidence }),
  );

  const foreignAuthority = materializeExactSequence(memory, [
    foreignTheory, dAuthority, U, natU, natX, s0XX1, natX1,
  ]);
  expectClosureError("theory-mismatch", () => replayStructuralClosureApplication(memory, {
    ...evidence,
    authority: foreignAuthority,
    authorityAdmission: memory.ensure(foreignTheory, foreignAuthority),
  }));

  let injected = false;
  const writingMemory: ReadMemory = {
    get root() { return memory.root; },
    get linkCount() { return memory.linkCount; },
    poles(link) {
      if (!injected) { injected = true; memory.ensure(foreignTheory, L); }
      return memory.poles(link);
    },
    find: (start, end) => memory.find(start, end),
    outgoing: (start) => memory.outgoing(start),
    incoming: (end) => memory.incoming(end),
  };
  expectClosureError("closure-application-wrote", () =>
    replayStructuralClosureApplication(writingMemory, evidence),
  );

  // Primitive RESULT admission remains a forbidden pseudo-solution even though all
  // Nat0/U/S0 coordinates are otherwise valid.
  memory.ensure(theory, result.derivationRule);
  expectClosureError("result-primitive-admission", () =>
    replayStructuralClosureApplication(memory, evidence),
  );
}

main();
