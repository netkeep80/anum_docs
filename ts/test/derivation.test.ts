import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  type StructuralInterpreter,
} from "../src/structural-rule.js";
import {
  StructuralDerivationReplayError,
  StructuralJudgmentReplayError,
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  replayStructuralDerivation,
  replayStructuralJudgment,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectJudgmentError(
  code: StructuralJudgmentReplayError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralJudgmentReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected StructuralJudgmentReplayError`);
}

function expectDerivationError(
  code: StructuralDerivationReplayError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralDerivationReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected StructuralDerivationReplayError`);
}

interface Fixture {
  readonly memory: Memory;
  readonly evidence: StructuralJudgmentEvidence;
  readonly fresh: () => LinkHandle;
  readonly rule: LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const { R, U } = ensureRootBasis(memory);
  let cursor = U;
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, R);
    return cursor;
  };

  const dictionary = fresh();
  const grammar = fresh();
  const theory = fresh();
  const leftRole = fresh();
  const rightRole = fresh();
  const left = fresh();
  const right = fresh();
  const context = defineContext(memory, fresh(), fresh());

  const expectedInterpreter: StructuralInterpreter = Object.freeze({ dictionary, grammar, theory });
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const roleDictionary = defineStructuralRoleDictionary(memory, [leftRole, rightRole]);
  const templateBody = memory.ensure(leftRole, rightRole);
  const rule = defineStructuralRule(memory, roleDictionary, templateBody);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const claim = memory.ensure(left, right);
  const act = defineActHeader(memory, interpreter, roleDictionary, context);
  defineActField(memory, act, leftRole, left);
  defineActField(memory, act, rightRole, right);

  const evidence: StructuralJudgmentEvidence = Object.freeze({
    application: Object.freeze({
      act,
      rule,
      ruleAdmission,
      claimedBody: claim,
      expectedInterpreter,
      expectedAfterContext: context,
    }),
    judgment: Object.freeze({ theory, context, claim }),
  });
  return { memory, evidence, fresh, rule };
}

// Positive generic one-step judgment: exact claim and zero writes.
{
  const fx = fixture();
  const before = fx.memory.linkCount;
  const result = replayStructuralJudgment(fx.memory, fx.evidence);
  same(result.judgment.theory, fx.evidence.judgment.theory, "exact theory");
  same(result.judgment.context, fx.evidence.judgment.context, "exact context");
  same(result.judgment.claim, fx.evidence.judgment.claim, "exact claim");
  same(result.application.claimedBody, fx.evidence.judgment.claim, "application binds exact claim");
  same(fx.memory.linkCount, before, "judgment replay must be read-only");
}

// Judgment theory is independent from the application interpreter theory.
{
  const fx = fixture();
  expectJudgmentError("judgment-theory-mismatch", () => replayStructuralJudgment(
    fx.memory,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, theory: fx.fresh() } },
  ));
}

// A different valid Context cannot be silently accepted as the judgment Context.
{
  const fx = fixture();
  const otherContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  expectJudgmentError("judgment-context-mismatch", () => replayStructuralJudgment(
    fx.memory,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, context: otherContext } },
  ));
}

// An ordinary relation is not an alternative encoding of Context K.
{
  const fx = fixture();
  const invalidContext = fx.memory.ensure(fx.fresh(), fx.fresh());
  expectJudgmentError("invalid-judgment-context", () => replayStructuralJudgment(
    fx.memory,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, context: invalidContext } },
  ));
}

// A valid application cannot prove a different selected claim.
{
  const fx = fixture();
  const forgedClaim = fx.memory.ensure(fx.fresh(), fx.fresh());
  expectJudgmentError("judgment-claim-mismatch", () => replayStructuralJudgment(
    fx.memory,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, claim: forgedClaim } },
  ));
}

// Admission remains structural T ⟼ Rule evidence, never a host callback name.
{
  const fx = fixture();
  const forgedAdmission = fx.memory.ensure(fx.fresh(), fx.rule);
  expectJudgmentError("invalid-rule-application", () => replayStructuralJudgment(
    fx.memory,
    { ...fx.evidence, application: { ...fx.evidence.application, ruleAdmission: forgedAdmission } },
  ));
}

// Even when the selected judgment repeats a forged body, exact Act bindings win.
{
  const fx = fixture();
  const forgedClaim = fx.memory.ensure(fx.fresh(), fx.fresh());
  expectJudgmentError("invalid-rule-application", () => replayStructuralJudgment(
    fx.memory,
    {
      application: { ...fx.evidence.application, claimedBody: forgedClaim },
      judgment: { ...fx.evidence.judgment, claim: forgedClaim },
    },
  ));
}

// Foreign handles cannot cross the Memory boundary as judgment evidence.
{
  const fx = fixture();
  const foreign = new Memory().root;
  expectJudgmentError("invalid-judgment-evidence", () => replayStructuralJudgment(
    fx.memory,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, claim: foreign } },
  ));
}

type Binding = readonly [LinkHandle, LinkHandle];

function derivationFixture() {
  const memory = new Memory();
  const { R, U } = ensureRootBasis(memory);
  let cursor = U;
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const dictionary = fresh();
  const grammar = fresh();
  const theory = fresh();
  const context = defineContext(memory, fresh(), fresh());
  const leftRole = fresh();
  const rightRole = fresh();
  const left = fresh();
  const right = fresh();

  const environment = (selectedTheory: LinkHandle) => {
    const expectedInterpreter: StructuralInterpreter = { dictionary, grammar, theory: selectedTheory };
    return {
      theory: selectedTheory,
      expectedInterpreter,
      interpreter: defineStructuralInterpreter(memory, dictionary, grammar, selectedTheory),
    };
  };
  const main = environment(theory);

  const node = (
    env: ReturnType<typeof environment>,
    roles: readonly LinkHandle[],
    bindings: readonly Binding[],
    template: LinkHandle,
    claim: LinkHandle,
    premiseTemplates: readonly LinkHandle[] = [],
    premiseOccurrences: readonly LinkHandle[] = [],
  ) => {
    const roleDictionary = defineStructuralRoleDictionary(memory, roles);
    const rule = defineStructuralRule(memory, roleDictionary, template);
    const ruleAdmission = admitStructuralRule(memory, env.theory, rule);
    const act = defineActHeader(memory, env.interpreter, roleDictionary, context);
    bindings.forEach(([role, value]) => defineActField(memory, act, role, value));
    const judgment: StructuralJudgmentEvidence = {
      application: {
        act,
        rule,
        ruleAdmission,
        claimedBody: claim,
        expectedInterpreter: env.expectedInterpreter,
        expectedAfterContext: context,
      },
      judgment: { theory: env.theory, context, claim },
    };
    const occurrence = defineStructuralProofOccurrence(memory, act, claim);
    const derivationRule = defineStructuralDerivationRule(memory, rule, premiseTemplates);
    return {
      act,
      claim,
      occurrence,
      derivationRule,
      node: {
        occurrence,
        judgment,
        derivationRule,
        derivationRuleAdmission: admitStructuralDerivationRule(memory, env.theory, derivationRule),
        premiseOccurrenceSequence: materializeExactSequence(memory, premiseOccurrences),
      },
    };
  };

  const rootLeft = () => node(main, [leftRole], [[leftRole, left]], leftRole, left);
  const rootRight = () => node(main, [rightRole], [[rightRole, right]], rightRole, right);
  const branch = () => {
    const l = rootLeft();
    const r = rootRight();
    const claim = memory.ensure(left, right);
    const target = node(
      main,
      [leftRole, rightRole],
      [[leftRole, left], [rightRole, right]],
      memory.ensure(leftRole, rightRole),
      claim,
      [leftRole, rightRole],
      [l.occurrence, r.occurrence],
    );
    return { l, r, target, evidence: { theory, targetOccurrence: target.occurrence, nodes: [target.node, r.node, l.node] } };
  };
  return { memory, fresh, theory, leftRole, rightRole, left, right, main, environment, node, rootLeft, branch };
}

// Positive P2: zero-premise root, linear reuse, branching, host-order independence, read-only replay.
{
  const fx = derivationFixture();
  const root = fx.rootLeft();
  const beforeRoot = fx.memory.linkCount;
  same(replayStructuralDerivation(fx.memory, { theory: fx.theory, targetOccurrence: root.occurrence, nodes: [root.node] }).occurrenceCount, 1, "root closure");
  same(fx.memory.linkCount, beforeRoot, "root replay read-only");

  const step = fx.node(fx.main, [fx.leftRole], [[fx.leftRole, fx.left]], fx.leftRole, fx.left, [fx.leftRole], [root.occurrence]);
  assert(step.act !== root.act && step.occurrence !== root.occurrence, "same Claim must allow distinct proof histories");
  same(step.claim, root.claim, "proof history != theorem identity");
  same(replayStructuralDerivation(fx.memory, { theory: fx.theory, targetOccurrence: step.occurrence, nodes: [step.node, root.node] }).occurrenceCount, 2, "linear closure");

  const b = fx.branch();
  const beforeBranch = fx.memory.linkCount;
  const a = replayStructuralDerivation(fx.memory, b.evidence);
  const reordered = replayStructuralDerivation(fx.memory, { ...b.evidence, nodes: [b.l.node, b.target.node, b.r.node] });
  same(a.target.judgment.claim, b.target.claim, "branch target");
  same(reordered.occurrenceCount, 3, "host node order non-semantic");
  same(fx.memory.linkCount, beforeBranch, "branch replay read-only");
}

// Exact dependency closure, premise cardinality/order, occurrence identity, admission and reachability.
{
  const fx = derivationFixture();
  const b = fx.branch();
  expectDerivationError("dependency-occurrence-not-found", () => replayStructuralDerivation(fx.memory, { ...b.evidence, nodes: [b.target.node, b.l.node] }));

  const missing = materializeExactSequence(fx.memory, [b.l.occurrence]);
  expectDerivationError("missing-premise", () => replayStructuralDerivation(fx.memory, { ...b.evidence, nodes: [{ ...b.target.node, premiseOccurrenceSequence: missing }, b.l.node, b.r.node] }));
  const extra = materializeExactSequence(fx.memory, [b.l.occurrence, b.r.occurrence, b.l.occurrence]);
  expectDerivationError("extra-premise", () => replayStructuralDerivation(fx.memory, { ...b.evidence, nodes: [{ ...b.target.node, premiseOccurrenceSequence: extra }, b.l.node, b.r.node] }));
  const swapped = materializeExactSequence(fx.memory, [b.r.occurrence, b.l.occurrence]);
  expectDerivationError("premise-claim-mismatch", () => replayStructuralDerivation(fx.memory, { ...b.evidence, nodes: [{ ...b.target.node, premiseOccurrenceSequence: swapped }, b.r.node, b.l.node] }));

  const forgedOccurrence = fx.memory.ensure(fx.fresh(), fx.fresh());
  expectDerivationError("occurrence-mismatch", () => replayStructuralDerivation(fx.memory, { theory: fx.theory, targetOccurrence: forgedOccurrence, nodes: [{ ...b.l.node, occurrence: forgedOccurrence }] }));
  expectDerivationError("duplicate-occurrence", () => replayStructuralDerivation(fx.memory, { theory: fx.theory, targetOccurrence: b.l.occurrence, nodes: [b.l.node, b.l.node] }));

  const forgedAdmission = fx.memory.ensure(fx.fresh(), b.l.derivationRule);
  expectDerivationError("derivation-rule-not-admitted", () => replayStructuralDerivation(fx.memory, { theory: fx.theory, targetOccurrence: b.l.occurrence, nodes: [{ ...b.l.node, derivationRuleAdmission: forgedAdmission }] }));
  const unrelated = fx.rootLeft();
  expectDerivationError("unreachable-node", () => replayStructuralDerivation(fx.memory, { ...b.evidence, nodes: [...b.evidence.nodes, unrelated.node] }));
}

// Cross-theory dependencies, cycles and foreign handles fail closed.
{
  const fx = derivationFixture();
  const other = fx.environment(fx.fresh());
  const cross = fx.node(other, [fx.leftRole], [[fx.leftRole, fx.left]], fx.leftRole, fx.left);
  const target = fx.node(fx.main, [fx.leftRole], [[fx.leftRole, fx.left]], fx.leftRole, fx.left, [fx.leftRole], [cross.occurrence]);
  expectDerivationError("cross-theory-node", () => replayStructuralDerivation(fx.memory, { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node, cross.node] }));

  const first = fx.node(fx.main, [fx.leftRole], [[fx.leftRole, fx.left]], fx.leftRole, fx.left, [fx.leftRole]);
  const second = fx.node(fx.main, [fx.leftRole], [[fx.leftRole, fx.left]], fx.leftRole, fx.left, [fx.leftRole]);
  const firstDeps = materializeExactSequence(fx.memory, [second.occurrence]);
  const secondDeps = materializeExactSequence(fx.memory, [first.occurrence]);
  expectDerivationError("cyclic-dependency", () => replayStructuralDerivation(fx.memory, {
    theory: fx.theory,
    targetOccurrence: first.occurrence,
    nodes: [{ ...first.node, premiseOccurrenceSequence: firstDeps }, { ...second.node, premiseOccurrenceSequence: secondDeps }],
  }));

  const foreign = new Memory().root;
  expectDerivationError("invalid-derivation-evidence", () => replayStructuralDerivation(fx.memory, { theory: fx.theory, targetOccurrence: foreign, nodes: [fx.rootLeft().node] }));
}
