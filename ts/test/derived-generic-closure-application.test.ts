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
  const entries = bindings.map(([source, target]) => memory.ensure(source, target));
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    materializeExactSequence(memory, entries),
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
  const z = memory.ensure(O, U);
  same(new Set([x, x1, n, n1, z]).size, 5, "closure coordinates are distinct Links");

  const dAuthority = defineStructuralRoleDictionary(memory, [x, x1]);
  const dResult = defineStructuralRoleDictionary(memory, [n]);
  const dBase = defineStructuralRoleDictionary(memory, []);
  const dStep = defineStructuralRoleDictionary(memory, [n, n1]);

  const domainContext = memory.ensure(O, C);
  const stepContext = memory.ensure(C, O);
  const claimContext = memory.ensure(L, U);
  const domain = (value: LinkHandle): LinkHandle => memory.ensure(domainContext, value);
  const edge = (left: LinkHandle, right: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(stepContext, left), right);
  const claim = (value: LinkHandle): LinkHandle =>
    memory.ensure(claimContext, memory.ensure(value, value));

  const domainZ = domain(z);
  const domainX = domain(x);
  const domainX1 = domain(x1);
  const stepXX1 = edge(x, x1);
  const authority = materializeExactSequence(memory, [
    theory, dAuthority, z, domainZ, domainX, stepXX1, domainX1,
  ]);
  const authorityAdmission = memory.ensure(theory, authority);

  const domainN = domain(n);
  const stepNN1 = edge(n, n1);
  const cZ = claim(z);
  const cN = claim(n);
  const cN1 = claim(n1);

  const base = admittedGeneric(memory, theory, dBase, [], cZ);
  const step = admittedGeneric(memory, theory, dStep, [domainN, stepNN1, cN], cN1);
  same(replayStructuralDerivedDerivationSchema(memory, base.evidence).conclusionTemplate, cZ,
    "BASE control");
  same(replayStructuralDerivedDerivationSchema(memory, step.evidence).conclusionTemplate, cN1,
    "STEP control");

  const result = resultIdentity(memory, theory, dResult, [domainN], cN);
  assert(memory.find(theory, result.derivationRule) === undefined,
    "RESULT derivation rule must remain unadmitted");

  const authorityMorphism = morphism(memory, theory, dAuthority, dStep, [
    [x, n], [x1, n1],
  ]);
  const currentMorphism = morphism(memory, theory, dResult, dStep, [[n, n]]);
  const nextMorphism = morphism(memory, theory, dResult, dStep, [[n, n1]]);
  const baseGrounding = grounding(memory, theory, dResult, z, n);

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
  same(replay.theory, theory, "closure replay theory");
  same(replay.resultDerivationRule, result.derivationRule, "closure replay result DR");
  same(replay.resultConclusionTemplate, cN, "closure replay conclusion");
  same(memory.linkCount, before, "closure replay is read-only");
  assert(memory.find(theory, result.derivationRule) === undefined,
    "closure replay must not promote RESULT into Theory authority");

  // Host decorations grant no authority and do not alter the structural result.
  const decorated = {
    ...evidence,
    closure: true,
    induction: true,
    callback: (_value: LinkHandle) => true,
  };
  same(replayStructuralClosureApplication(memory, decorated).resultConclusionTemplate, cN,
    "host metadata is non-authoritative");

  expectClosureError("authority-not-admitted", () =>
    replayStructuralClosureApplication(memory, {
      ...evidence,
      authorityAdmission: memory.ensure(foreignTheory, authority),
    }),
  );

  const malformedAuthority = materializeExactSequence(memory, [
    theory, dAuthority, z, domainZ, domainX, stepXX1,
  ]);
  expectClosureError("invalid-authority", () =>
    replayStructuralClosureApplication(memory, {
      ...evidence,
      authority: malformedAuthority,
      authorityAdmission: memory.ensure(theory, malformedAuthority),
    }),
  );

  const partialAuthorityMorphism = morphism(memory, theory, dAuthority, dStep, [[x, n]]);
  expectClosureError("invalid-authority-morphism", () =>
    replayStructuralClosureApplication(memory, {
      ...evidence,
      authorityMorphism: partialAuthorityMorphism,
    }),
  );

  const wrongGenerator = memory.ensure(C, L);
  expectClosureError("invalid-base-grounding", () =>
    replayStructuralClosureApplication(memory, {
      ...evidence,
      baseGrounding: grounding(memory, theory, dResult, wrongGenerator, n),
    }),
  );

  const wrongBase = admittedGeneric(memory, theory, dBase, [], claim(wrongGenerator));
  expectClosureError("base-mismatch", () =>
    replayStructuralClosureApplication(memory, { ...evidence, base: wrongBase.evidence }),
  );

  const wrongDomain = memory.ensure(domainContext, memory.ensure(n, O));
  const domainBadStep = admittedGeneric(memory, theory, dStep, [wrongDomain, stepNN1, cN], cN1);
  expectClosureError("domain-mismatch", () =>
    replayStructuralClosureApplication(memory, { ...evidence, step: domainBadStep.evidence }),
  );

  const wrongTransition = edge(n1, n);
  const transitionBadStep = admittedGeneric(
    memory, theory, dStep, [domainN, wrongTransition, cN], cN1,
  );
  expectClosureError("step-mismatch", () =>
    replayStructuralClosureApplication(memory, { ...evidence, step: transitionBadStep.evidence }),
  );

  const wrongIH = memory.ensure(claimContext, n);
  const ihBadStep = admittedGeneric(memory, theory, dStep, [domainN, stepNN1, wrongIH], cN1);
  expectClosureError("ih-mismatch", () =>
    replayStructuralClosureApplication(memory, { ...evidence, step: ihBadStep.evidence }),
  );

  const wrongNext = memory.ensure(claimContext, n1);
  const nextBadStep = admittedGeneric(memory, theory, dStep, [domainN, stepNN1, cN], wrongNext);
  expectClosureError("next-conclusion-mismatch", () =>
    replayStructuralClosureApplication(memory, { ...evidence, step: nextBadStep.evidence }),
  );

  const wrongNextMorphism = morphism(memory, theory, dResult, dStep, [[n, n]]);
  expectClosureError("next-conclusion-mismatch", () =>
    replayStructuralClosureApplication(memory, { ...evidence, nextMorphism: wrongNextMorphism }),
  );

  const foreignAuthority = materializeExactSequence(memory, [
    foreignTheory, dAuthority, z, domainZ, domainX, stepXX1, domainX1,
  ]);
  expectClosureError("theory-mismatch", () =>
    replayStructuralClosureApplication(memory, {
      ...evidence,
      authority: foreignAuthority,
      authorityAdmission: memory.ensure(foreignTheory, foreignAuthority),
    }),
  );

  // Primitive RESULT admission is a forbidden pseudo-solution.
  const resultAdmission = memory.ensure(theory, result.derivationRule);
  assert(resultAdmission !== result.identity, "admission direction differs from proof identity");
  expectClosureError("result-primitive-admission", () =>
    replayStructuralClosureApplication(memory, evidence),
  );

  // A malicious ReadMemory that writes during the first read must be detected.
  const cleanResult = resultIdentity(memory, theory, dResult, [domainN], cN);
  const cleanEvidence = { ...evidence, resultIdentity: cleanResult.identity };
  let injected = false;
  const writingMemory: ReadMemory = {
    get root() { return memory.root; },
    get linkCount() { return memory.linkCount; },
    poles(link) {
      if (!injected) { injected = true; memory.ensure(foreignTheory, wrongGenerator); }
      return memory.poles(link);
    },
    find: (start, end) => memory.find(start, end),
    outgoing: (start) => memory.outgoing(start),
    incoming: (end) => memory.incoming(end),
  };
  expectClosureError("closure-application-wrote", () =>
    replayStructuralClosureApplication(writingMemory, cleanEvidence),
  );
}

main();
