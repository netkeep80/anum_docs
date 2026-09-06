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
  StructuralDerivedDerivationCrossScopeApplicationReplayError,
  replayStructuralDerivedDerivationCrossScopeApplication,
} from "../src/derived-derivation-cross-scope.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectCrossError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof StructuralDerivedDerivationCrossScopeApplicationReplayError,
      `${code}: wrong error type`,
    );
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected cross-scope application error`);
}

interface SourceFixture {
  readonly evidence: StructuralDerivedDerivationEvidence;
  readonly derivationRule: LinkHandle;
  readonly ruleAdmission: LinkHandle;
  readonly derivationAdmission: LinkHandle;
}

function sourceFixture(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): SourceFixture {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const derivationAdmission = admitStructuralDerivationRule(memory, theory, derivationRule);
  const identity = memory.ensure(derivationRule, theory);
  const assumptions = premises.map((template) =>
    Object.freeze({ occurrence: memory.ensure(template, identity), template }),
  );
  const premiseSequence = materializeExactSequence(
    memory,
    assumptions.map((assumption) => assumption.occurrence),
  );
  const targetOccurrence = memory.ensure(derivationRule, premiseSequence);
  return Object.freeze({
    derivationRule,
    ruleAdmission,
    derivationAdmission,
    evidence: Object.freeze({
      identity,
      targetOccurrence,
      assumptions: Object.freeze(assumptions),
      nodes: Object.freeze([
        Object.freeze({
          occurrence: targetOccurrence,
          derivationRule,
          ruleAdmission,
          derivationRuleAdmission: derivationAdmission,
          premiseOccurrenceSequence: premiseSequence,
        }),
      ]),
    }),
  });
}

function targetIdentity(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): { readonly derivationRule: LinkHandle; readonly identity: LinkHandle } {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
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
  const entries = bindings.map(([sourceRole, targetRole]) => memory.ensure(sourceRole, targetRole));
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    materializeExactSequence(memory, entries),
  ]);
}

function strictCrossScopeEvidence(
  memory: Memory,
  source: SourceFixture,
  target: { readonly identity: LinkHandle },
  mappedPremises: readonly LinkHandle[],
): StructuralDerivedDerivationEvidence {
  const assumptions = mappedPremises.map((template) =>
    Object.freeze({ occurrence: memory.ensure(template, target.identity), template }),
  );
  const premiseSequence = materializeExactSequence(
    memory,
    assumptions.map((assumption) => assumption.occurrence),
  );
  const occurrence = memory.ensure(source.derivationRule, premiseSequence);
  return Object.freeze({
    identity: target.identity,
    targetOccurrence: occurrence,
    assumptions: Object.freeze(assumptions),
    nodes: Object.freeze([
      Object.freeze({
        occurrence,
        derivationRule: source.derivationRule,
        ruleAdmission: source.ruleAdmission,
        derivationRuleAdmission: source.derivationAdmission,
        premiseOccurrenceSequence: premiseSequence,
      }),
    ]),
  });
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const theory = memory.ensure(C, U);
  const foreignTheory = memory.ensure(U, C);
  const x = memory.ensure(L, R);
  const y = memory.ensure(L, U);
  const z = memory.ensure(L, C);
  const a = memory.ensure(R, L);
  const b = memory.ensure(R, U);
  const g = memory.ensure(O, U);
  const sourceDictionary = defineStructuralRoleDictionary(memory, [x]);
  const targetDictionary = defineStructuralRoleDictionary(memory, [a, b]);

  const pX = memory.ensure(O, x);
  const qX = memory.ensure(C, x);
  const pA = memory.ensure(O, a);
  const qA = memory.ensure(C, a);
  const source = sourceFixture(memory, theory, sourceDictionary, [pX], qX);
  replayStructuralDerivedDerivationSchema(memory, source.evidence);
  const target = targetIdentity(memory, theory, targetDictionary, [pA], qA);
  const mu = morphism(memory, theory, sourceDictionary, targetDictionary, [[x, a]]);

  assert(memory.find(theory, target.derivationRule) === undefined, "target DR must not be admitted");
  const before = memory.linkCount;
  const replay = replayStructuralDerivedDerivationCrossScopeApplication(memory, {
    source: source.evidence,
    morphism: mu,
    targetIdentity: target.identity,
  });
  same(replay.theory, theory, "exact Theory");
  same(replay.sourceDictionary, sourceDictionary, "source dictionary");
  same(replay.targetDictionary, targetDictionary, "target dictionary");
  same(replay.targetDerivationRule, target.derivationRule, "mapped target DR");
  same(replay.targetConclusionTemplate, qA, "mapped conclusion");
  same(replay.bindings.length, 1, "mu binding count");
  same(replay.bindings[0]?.sourceRole, x, "mu source role");
  same(replay.bindings[0]?.targetRole, a, "mu target role");
  same(memory.linkCount, before, "cross-scope replay is read-only");
  assert(memory.find(theory, target.derivationRule) === undefined, "replay must not admit target DR");

  try {
    replayStructuralDerivedDerivationSchema(
      memory,
      strictCrossScopeEvidence(memory, source, target, [pA]),
    );
    throw new Error("strict replay unexpectedly accepted cross-scope evidence");
  } catch (error) {
    assert(error instanceof StructuralDerivedDerivationReplayError, "strict replay error type");
    same(error.code, "role-dictionary-mismatch", "strict replay remains fail-closed");
  }

  const repeatedSource = memory.ensure(x, memory.ensure(x, g));
  const repeatedTarget = memory.ensure(a, memory.ensure(a, g));
  const cycleSource = memory.ensureStartSelfClosed(x);
  const cycleTarget = memory.ensureStartSelfClosed(a);
  const nestedSource = sourceFixture(
    memory,
    theory,
    sourceDictionary,
    [repeatedSource, cycleSource],
    repeatedSource,
  );
  const nestedTarget = targetIdentity(
    memory,
    theory,
    targetDictionary,
    [repeatedTarget, cycleTarget],
    repeatedTarget,
  );
  replayStructuralDerivedDerivationCrossScopeApplication(memory, {
    source: nestedSource.evidence,
    morphism: mu,
    targetIdentity: nestedTarget.identity,
  });

  const nonInjectiveSourceDictionary = defineStructuralRoleDictionary(memory, [x, y]);
  const oneRoleTargetDictionary = defineStructuralRoleDictionary(memory, [a]);
  const nonInjectiveSource = sourceFixture(
    memory,
    theory,
    nonInjectiveSourceDictionary,
    [memory.ensure(O, x)],
    memory.ensure(C, y),
  );
  const nonInjectiveTarget = targetIdentity(
    memory,
    theory,
    oneRoleTargetDictionary,
    [memory.ensure(O, a)],
    memory.ensure(C, a),
  );
  replayStructuralDerivedDerivationCrossScopeApplication(memory, {
    source: nonInjectiveSource.evidence,
    morphism: morphism(memory, theory, nonInjectiveSourceDictionary, oneRoleTargetDictionary, [
      [x, a],
      [y, a],
    ]),
    targetIdentity: nonInjectiveTarget.identity,
  });

  const capturedSource = sourceFixture(memory, theory, sourceDictionary, [], memory.ensure(x, a));
  const capturedTarget = targetIdentity(memory, theory, targetDictionary, [], memory.ensure(b, a));
  expectCrossError("grounded-target-role-capture", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: capturedSource.evidence,
      morphism: morphism(memory, theory, sourceDictionary, targetDictionary, [[x, b]]),
      targetIdentity: capturedTarget.identity,
    }),
  );
  const nestedCaptureSource = sourceFixture(
    memory,
    theory,
    sourceDictionary,
    [],
    memory.ensure(x, memory.ensure(g, a)),
  );
  const nestedCaptureTarget = targetIdentity(
    memory,
    theory,
    targetDictionary,
    [],
    memory.ensure(b, memory.ensure(g, a)),
  );
  expectCrossError("grounded-target-role-capture", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: nestedCaptureSource.evidence,
      morphism: morphism(memory, theory, sourceDictionary, targetDictionary, [[x, b]]),
      targetIdentity: nestedCaptureTarget.identity,
    }),
  );

  expectCrossError("invalid-source-schema", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: { ...source.evidence, identity: new Memory().root },
      morphism: mu,
      targetIdentity: target.identity,
    }),
  );
  expectCrossError("invalid-target-identity", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: source.evidence,
      morphism: mu,
      targetIdentity: new Memory().root,
    }),
  );
  expectCrossError("theory-mismatch", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: source.evidence,
      morphism: mu,
      targetIdentity: memory.ensure(target.derivationRule, foreignTheory),
    }),
  );
  expectCrossError("invalid-morphism", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: source.evidence,
      morphism: new Memory().root,
      targetIdentity: target.identity,
    }),
  );
  expectCrossError("theory-mismatch", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: source.evidence,
      morphism: morphism(memory, foreignTheory, sourceDictionary, targetDictionary, [[x, a]]),
      targetIdentity: target.identity,
    }),
  );
  const otherSourceDictionary = defineStructuralRoleDictionary(memory, [z]);
  expectCrossError("source-dictionary-mismatch", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: source.evidence,
      morphism: morphism(memory, theory, otherSourceDictionary, targetDictionary, [[z, a]]),
      targetIdentity: target.identity,
    }),
  );
  const otherTargetDictionary = defineStructuralRoleDictionary(memory, [g]);
  expectCrossError("target-dictionary-mismatch", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: source.evidence,
      morphism: morphism(memory, theory, sourceDictionary, otherTargetDictionary, [[x, g]]),
      targetIdentity: target.identity,
    }),
  );

  const twoRoleSource = sourceFixture(
    memory,
    theory,
    nonInjectiveSourceDictionary,
    [memory.ensure(O, x)],
    memory.ensure(C, y),
  );
  const twoRoleTarget = targetIdentity(
    memory,
    theory,
    targetDictionary,
    [memory.ensure(O, a)],
    memory.ensure(C, b),
  );
  const partial = morphism(memory, theory, nonInjectiveSourceDictionary, targetDictionary, [[x, a]]);
  expectCrossError("missing-source-role", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: twoRoleSource.evidence,
      morphism: partial,
      targetIdentity: twoRoleTarget.identity,
    }),
  );
  const decorated = {
    source: twoRoleSource.evidence,
    morphism: partial,
    targetIdentity: twoRoleTarget.identity,
    bindings: [{ sourceRole: y, targetRole: b }],
  };
  expectCrossError("missing-source-role", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, decorated),
  );
  expectCrossError("undeclared-source-role", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: source.evidence,
      morphism: morphism(memory, theory, sourceDictionary, targetDictionary, [
        [x, a],
        [z, b],
      ]),
      targetIdentity: target.identity,
    }),
  );
  expectCrossError("duplicate-source-role", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: source.evidence,
      morphism: morphism(memory, theory, sourceDictionary, targetDictionary, [
        [x, a],
        [x, b],
      ]),
      targetIdentity: target.identity,
    }),
  );
  expectCrossError("target-role-not-member", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: source.evidence,
      morphism: morphism(memory, theory, sourceDictionary, targetDictionary, [[x, g]]),
      targetIdentity: target.identity,
    }),
  );

  const noPremiseTarget = targetIdentity(memory, theory, targetDictionary, [], qA);
  expectCrossError("premise-count-mismatch", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: source.evidence,
      morphism: mu,
      targetIdentity: noPremiseTarget.identity,
    }),
  );
  const wrongPremiseTarget = targetIdentity(
    memory,
    theory,
    targetDictionary,
    [memory.ensure(O, b)],
    qA,
  );
  expectCrossError("premise-mapping-mismatch", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: source.evidence,
      morphism: mu,
      targetIdentity: wrongPremiseTarget.identity,
    }),
  );
  const wrongConclusionTarget = targetIdentity(
    memory,
    theory,
    targetDictionary,
    [pA],
    memory.ensure(C, b),
  );
  expectCrossError("conclusion-mapping-mismatch", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(memory, {
      source: source.evidence,
      morphism: mu,
      targetIdentity: wrongConclusionTarget.identity,
    }),
  );

  const writeStart = memory.ensure(L, g);
  const writeEnd = memory.ensure(U, g);
  assert(memory.find(writeStart, writeEnd) === undefined, "write probe pair must be fresh");
  let wrote = false;
  const writingReadMemory: ReadMemory = {
    get root() {
      return memory.root;
    },
    get linkCount() {
      return memory.linkCount;
    },
    poles(link) {
      if (!wrote) {
        wrote = true;
        memory.ensure(writeStart, writeEnd);
      }
      return memory.poles(link);
    },
    find: (start, end) => memory.find(start, end),
    outgoing: (start) => memory.outgoing(start),
    incoming: (end) => memory.incoming(end),
  };
  expectCrossError("cross-scope-application-wrote", () =>
    replayStructuralDerivedDerivationCrossScopeApplication(writingReadMemory, {
      source: source.evidence,
      morphism: mu,
      targetIdentity: target.identity,
    }),
  );
}

main();
