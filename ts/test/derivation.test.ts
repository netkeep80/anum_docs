import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
  type StructuralDerivationEvidence,
} from "../src/public.js";
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
  StructuralAssumptionReplayError,
  StructuralDerivationReplayError,
  StructuralJudgmentReplayError,
  StructuralTheoremReplayError,
  StructuralTheoremReuseReplayError,
  admitStructuralDerivationRule,
  defineStructuralAssumptionContext,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  defineStructuralTheorem,
  replayStructuralDerivation,
  replayStructuralDerivationWithAssumptions,
  replayStructuralDerivationWithTheorems,
  replayStructuralJudgment,
  replayStructuralTheorem,
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

function expectTheoremError(
  code: StructuralTheoremReplayError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralTheoremReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected StructuralTheoremReplayError`);
}

function expectTheoremReuseError(
  code: StructuralTheoremReuseReplayError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralTheoremReuseReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected StructuralTheoremReuseReplayError`);
}

function expectAssumptionError(
  code: StructuralAssumptionReplayError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralAssumptionReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected StructuralAssumptionReplayError`);
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
    selectedContext: LinkHandle = context,
  ) => {
    const roleDictionary = defineStructuralRoleDictionary(memory, roles);
    const rule = defineStructuralRule(memory, roleDictionary, template);
    const ruleAdmission = admitStructuralRule(memory, env.theory, rule);
    const act = defineActHeader(memory, env.interpreter, roleDictionary, selectedContext);
    bindings.forEach(([role, value]) => defineActField(memory, act, role, value));
    const judgment: StructuralJudgmentEvidence = {
      application: {
        act,
        rule,
        ruleAdmission,
        claimedBody: claim,
        expectedInterpreter: env.expectedInterpreter,
        expectedAfterContext: selectedContext,
      },
      judgment: { theory: env.theory, context: selectedContext, claim },
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
  return { memory, fresh, theory, leftRole, rightRole, left, right, main, environment, node, rootLeft, rootRight, branch };
}

// Positive P2: zero-premise root, linear reuse, branching, host-order independence, read-only replay.
{
  const fx = derivationFixture();
  const root = fx.rootLeft();
  const beforeRoot = fx.memory.linkCount;
  same(replayStructuralDerivation(fx.memory, { theory: fx.theory, targetOccurrence: root.occurrence, nodes: [root.node] }).occurrenceCount, 1, "root closure");
  same(fx.memory.linkCount, beforeRoot, "root replay read-only");

  const stepContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const step = fx.node(
    fx.main,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [fx.leftRole],
    [root.occurrence],
    stepContext,
  );
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
  const unrelatedContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const unrelated = fx.node(
    fx.main,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [],
    [],
    unrelatedContext,
  );
  expectDerivationError("unreachable-node", () => replayStructuralDerivation(fx.memory, { ...b.evidence, nodes: [...b.evidence.nodes, unrelated.node] }));
}

// Cross-theory dependencies, cycles and foreign handles fail closed.
{
  const fx = derivationFixture();
  const other = fx.environment(fx.fresh());
  const cross = fx.node(other, [fx.leftRole], [[fx.leftRole, fx.left]], fx.leftRole, fx.left);
  const target = fx.node(fx.main, [fx.leftRole], [[fx.leftRole, fx.left]], fx.leftRole, fx.left, [fx.leftRole], [cross.occurrence]);
  expectDerivationError("cross-theory-node", () => replayStructuralDerivation(fx.memory, { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node, cross.node] }));

  const firstContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const secondContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const first = fx.node(
    fx.main,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [fx.leftRole],
    [],
    firstContext,
  );
  const second = fx.node(
    fx.main,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [fx.leftRole],
    [],
    secondContext,
  );
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

// P3a theorem identity is Claim-under-Theory while proof history remains replayable evidence.
{
  const fx = derivationFixture();
  const first = fx.rootLeft();
  const theorem = defineStructuralTheorem(fx.memory, fx.left, fx.theory);
  const firstProof = { theory: fx.theory, targetOccurrence: first.occurrence, nodes: [first.node] };
  const before = fx.memory.linkCount;
  const firstResult = replayStructuralTheorem(fx.memory, { theorem, proof: firstProof });
  same(firstResult.identity.claim, fx.left, "theorem exact claim");
  same(firstResult.identity.theory, fx.theory, "theorem exact theory");
  same(firstResult.proof.targetOccurrence, first.occurrence, "theorem proof target");
  same(fx.memory.linkCount, before, "theorem replay read-only");

  const secondContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const second = fx.node(
    fx.main,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [],
    [],
    secondContext,
  );
  assert(first.occurrence !== second.occurrence, "same theorem must allow distinct proof histories");
  const secondResult = replayStructuralTheorem(fx.memory, {
    theorem,
    proof: { theory: fx.theory, targetOccurrence: second.occurrence, nodes: [second.node] },
  });
  same(secondResult.theorem, firstResult.theorem, "proof history must not change theorem identity");
}

// Branching P2 proof is a valid proof-carrying theorem without theorem-specific replay.
{
  const fx = derivationFixture();
  const b = fx.branch();
  const theorem = defineStructuralTheorem(fx.memory, b.target.claim, fx.theory);
  const before = fx.memory.linkCount;
  const result = replayStructuralTheorem(fx.memory, { theorem, proof: b.evidence });
  same(result.proof.occurrenceCount, 3, "branching theorem closure");
  same(result.identity.claim, b.target.claim, "branching theorem target");
  same(fx.memory.linkCount, before, "branching theorem replay read-only");
}

// Later proof reuses theorem only by expanding its complete P2 proof closure.
{
  const fx = derivationFixture();
  const lemma = fx.rootLeft();
  const lemmaTheorem = defineStructuralTheorem(fx.memory, fx.left, fx.theory);
  const lemmaEvidence = {
    theorem: lemmaTheorem,
    proof: { theory: fx.theory, targetOccurrence: lemma.occurrence, nodes: [lemma.node] },
  };
  const right = fx.rootRight();
  const targetClaim = fx.memory.ensure(fx.left, fx.right);
  const target = fx.node(
    fx.main,
    [fx.leftRole, fx.rightRole],
    [[fx.leftRole, fx.left], [fx.rightRole, fx.right]],
    fx.memory.ensure(fx.leftRole, fx.rightRole),
    targetClaim,
    [fx.leftRole, fx.rightRole],
    [lemma.occurrence, right.occurrence],
  );
  const before = fx.memory.linkCount;
  const result = replayStructuralDerivationWithTheorems(fx.memory, {
    derivation: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node, right.node] },
    theorems: [lemmaEvidence],
  });
  same(result.derivation.target.judgment.claim, targetClaim, "lemma reuse target");
  same(result.derivation.occurrenceCount, 3, "expanded theorem closure");
  same(result.theorems.length, 1, "one replayed theorem");
  same(fx.memory.linkCount, before, "theorem reuse read-only");
}

// One theorem target may satisfy multiple explicit premise positions of an admitted rule.
{
  const fx = derivationFixture();
  const lemma = fx.rootLeft();
  const theorem = defineStructuralTheorem(fx.memory, fx.left, fx.theory);
  const targetContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const target = fx.node(
    fx.main,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [fx.leftRole, fx.leftRole],
    [lemma.occurrence, lemma.occurrence],
    targetContext,
  );
  const result = replayStructuralDerivationWithTheorems(fx.memory, {
    derivation: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] },
    theorems: [{ theorem, proof: { theory: fx.theory, targetOccurrence: lemma.occurrence, nodes: [lemma.node] } }],
  });
  same(result.derivation.occurrenceCount, 2, "shared theorem dependency counted once");
}

// Theorem-record host order is transport only when both theorem proofs are structurally required.
{
  const fx = derivationFixture();
  const left = fx.rootLeft();
  const right = fx.rootRight();
  const leftTheorem = {
    theorem: defineStructuralTheorem(fx.memory, fx.left, fx.theory),
    proof: { theory: fx.theory, targetOccurrence: left.occurrence, nodes: [left.node] },
  };
  const rightTheorem = {
    theorem: defineStructuralTheorem(fx.memory, fx.right, fx.theory),
    proof: { theory: fx.theory, targetOccurrence: right.occurrence, nodes: [right.node] },
  };
  const claim = fx.memory.ensure(fx.left, fx.right);
  const target = fx.node(
    fx.main,
    [fx.leftRole, fx.rightRole],
    [[fx.leftRole, fx.left], [fx.rightRole, fx.right]],
    fx.memory.ensure(fx.leftRole, fx.rightRole),
    claim,
    [fx.leftRole, fx.rightRole],
    [left.occurrence, right.occurrence],
  );
  const derivation = { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] };
  const first = replayStructuralDerivationWithTheorems(fx.memory, { derivation, theorems: [leftTheorem, rightTheorem] });
  const second = replayStructuralDerivationWithTheorems(fx.memory, { derivation, theorems: [rightTheorem, leftTheorem] });
  same(first.derivation.target.judgment.claim, second.derivation.target.judgment.claim, "theorem host order non-semantic");
  same(first.derivation.occurrenceCount, 3, "two theorem closures expanded");
}

// A theorem Link is identity only: forged/missing/wrong proof evidence never grants truth.
{
  const fx = derivationFixture();
  const root = fx.rootLeft();
  const theorem = defineStructuralTheorem(fx.memory, fx.left, fx.theory);
  expectTheoremError("invalid-theorem-proof", () => replayStructuralTheorem(fx.memory, {
    theorem,
    proof: { theory: fx.theory, targetOccurrence: root.occurrence, nodes: [] },
  }));

  const wrongClaimTheorem = defineStructuralTheorem(fx.memory, fx.right, fx.theory);
  expectTheoremError("theorem-claim-mismatch", () => replayStructuralTheorem(fx.memory, {
    theorem: wrongClaimTheorem,
    proof: { theory: fx.theory, targetOccurrence: root.occurrence, nodes: [root.node] },
  }));

  const otherTheory = fx.fresh();
  const wrongTheoryTheorem = defineStructuralTheorem(fx.memory, fx.left, otherTheory);
  expectTheoremError("theorem-proof-theory-mismatch", () => replayStructuralTheorem(fx.memory, {
    theorem: wrongTheoryTheorem,
    proof: { theory: fx.theory, targetOccurrence: root.occurrence, nodes: [root.node] },
  }));

  const foreignTheorem = new Memory().root;
  expectTheoremError("invalid-theorem-evidence", () => replayStructuralTheorem(fx.memory, {
    theorem: foreignTheorem,
    proof: { theory: fx.theory, targetOccurrence: root.occurrence, nodes: [root.node] },
  }));
}

// Reuse is exact same-theory expansion: missing, unsupplied and unused theorem evidence fail closed.
{
  const fx = derivationFixture();
  const lemma = fx.rootLeft();
  const theoremEvidence = {
    theorem: defineStructuralTheorem(fx.memory, fx.left, fx.theory),
    proof: { theory: fx.theory, targetOccurrence: lemma.occurrence, nodes: [lemma.node] },
  };
  const targetContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const target = fx.node(
    fx.main,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [fx.leftRole],
    [lemma.occurrence],
    targetContext,
  );

  expectDerivationError("dependency-occurrence-not-found", () => replayStructuralDerivationWithTheorems(fx.memory, {
    derivation: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] },
    theorems: [],
  }));

  const unrelated = fx.rootRight();
  expectDerivationError("unreachable-node", () => replayStructuralDerivationWithTheorems(fx.memory, {
    derivation: { theory: fx.theory, targetOccurrence: unrelated.occurrence, nodes: [unrelated.node] },
    theorems: [theoremEvidence],
  }));

  const otherTheory = fx.fresh();
  const other = fx.environment(otherTheory);
  const otherRoot = fx.node(other, [fx.leftRole], [[fx.leftRole, fx.left]], fx.leftRole, fx.left);
  expectTheoremReuseError("theorem-reuse-theory-mismatch", () => replayStructuralDerivationWithTheorems(fx.memory, {
    derivation: { theory: otherTheory, targetOccurrence: otherRoot.occurrence, nodes: [otherRoot.node] },
    theorems: [theoremEvidence],
  }));

  const incompleteTheorem = {
    ...theoremEvidence,
    proof: { ...theoremEvidence.proof, nodes: [] },
  };
  expectTheoremReuseError("invalid-reused-theorem", () => replayStructuralDerivationWithTheorems(fx.memory, {
    derivation: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] },
    theorems: [incompleteTheorem],
  }));
}

function assumptionFixture(claims: readonly LinkHandle[]) {
  const fx = derivationFixture();
  const assumptionContext = defineStructuralAssumptionContext(fx.memory, fx.theory, claims);
  const occurrences = claims.map((claim) => {
    const occurrence = fx.memory.find(assumptionContext, claim);
    assert(occurrence !== undefined, "assumption occurrence must be materialized");
    return occurrence;
  });
  return { ...fx, assumptionContext, occurrences };
}

// P3b: one scoped assumption satisfies an explicit premise without a fake proof Act.
{
  const fx = derivationFixture();
  const assumptionContext = defineStructuralAssumptionContext(fx.memory, fx.theory, [fx.left]);
  const assumption = fx.memory.find(assumptionContext, fx.left);
  assert(assumption !== undefined, "left assumption occurrence");
  const targetContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const target = fx.node(
    fx.main,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [fx.leftRole],
    [assumption],
    targetContext,
  );
  const derivation = { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] };

  expectDerivationError("dependency-occurrence-not-found", () => replayStructuralDerivation(fx.memory, derivation));
  const before = fx.memory.linkCount;
  const result = replayStructuralDerivationWithAssumptions(fx.memory, { derivation, assumptionContext });
  same(result.derivation.target.judgment.claim, fx.left, "conditional target");
  same(result.declaredAssumptionClaims.length, 1, "one declared assumption");
  same(result.usedAssumptionOccurrences.length, 1, "one used assumption");
  same(result.usedAssumptionOccurrences[0], assumption, "exact used assumption occurrence");
  same(fx.memory.linkCount, before, "assumption replay read-only");
}

// Two assumptions satisfy an ordered multi-premise rule; declaration order remains structural.
{
  const fx = derivationFixture();
  const assumptionContext = defineStructuralAssumptionContext(fx.memory, fx.theory, [fx.left, fx.right]);
  const leftAssumption = fx.memory.find(assumptionContext, fx.left);
  const rightAssumption = fx.memory.find(assumptionContext, fx.right);
  assert(leftAssumption !== undefined && rightAssumption !== undefined, "two assumption occurrences");
  const claim = fx.memory.ensure(fx.left, fx.right);
  const target = fx.node(
    fx.main,
    [fx.leftRole, fx.rightRole],
    [[fx.leftRole, fx.left], [fx.rightRole, fx.right]],
    fx.memory.ensure(fx.leftRole, fx.rightRole),
    claim,
    [fx.leftRole, fx.rightRole],
    [leftAssumption, rightAssumption],
  );
  const result = replayStructuralDerivationWithAssumptions(fx.memory, {
    derivation: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] },
    assumptionContext,
  });
  same(result.usedAssumptionOccurrences.length, 2, "two used assumptions");
  same(result.usedAssumptionOccurrences[0], leftAssumption, "declared order left");
  same(result.usedAssumptionOccurrences[1], rightAssumption, "declared order right");
}

// Mixed dependency: one proven P2 occurrence and one scoped assumption use the same matcher.
{
  const fx = derivationFixture();
  const proven = fx.rootLeft();
  const assumptionContext = defineStructuralAssumptionContext(fx.memory, fx.theory, [fx.right]);
  const assumed = fx.memory.find(assumptionContext, fx.right);
  assert(assumed !== undefined, "right assumption occurrence");
  const claim = fx.memory.ensure(fx.left, fx.right);
  const target = fx.node(
    fx.main,
    [fx.leftRole, fx.rightRole],
    [[fx.leftRole, fx.left], [fx.rightRole, fx.right]],
    fx.memory.ensure(fx.leftRole, fx.rightRole),
    claim,
    [fx.leftRole, fx.rightRole],
    [proven.occurrence, assumed],
  );
  const result = replayStructuralDerivationWithAssumptions(fx.memory, {
    derivation: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node, proven.node] },
    assumptionContext,
  });
  same(result.derivation.occurrenceCount, 2, "only proof nodes count as occurrences");
  same(result.usedAssumptionOccurrences[0], assumed, "mixed proof uses assumption");
}

// One declared assumption can satisfy multiple explicit premise positions.
{
  const fx = derivationFixture();
  const assumptionContext = defineStructuralAssumptionContext(fx.memory, fx.theory, [fx.left]);
  const assumed = fx.memory.find(assumptionContext, fx.left);
  assert(assumed !== undefined, "reused assumption occurrence");
  const targetContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const target = fx.node(
    fx.main,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [fx.leftRole, fx.leftRole],
    [assumed, assumed],
    targetContext,
  );
  const result = replayStructuralDerivationWithAssumptions(fx.memory, {
    derivation: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] },
    assumptionContext,
  });
  same(result.usedAssumptionOccurrences.length, 1, "reused assumption reported once");
}

// Unused declared assumptions are context weakening, not unreachable proof evidence.
{
  const fx = derivationFixture();
  const root = fx.rootLeft();
  const assumptionContext = defineStructuralAssumptionContext(fx.memory, fx.theory, [fx.right]);
  const before = fx.memory.linkCount;
  const result = replayStructuralDerivationWithAssumptions(fx.memory, {
    derivation: { theory: fx.theory, targetOccurrence: root.occurrence, nodes: [root.node] },
    assumptionContext,
  });
  same(result.declaredAssumptionClaims.length, 1, "unused assumption remains declared");
  same(result.usedAssumptionOccurrences.length, 0, "unused assumption not promoted to dependency");
  same(fx.memory.linkCount, before, "weakening replay read-only");
}

// Empty assumption context reduces to ordinary P2 for a fully proven derivation.
{
  const fx = derivationFixture();
  const b = fx.branch();
  const assumptionContext = defineStructuralAssumptionContext(fx.memory, fx.theory, []);
  const ordinary = replayStructuralDerivation(fx.memory, b.evidence);
  const conditional = replayStructuralDerivationWithAssumptions(fx.memory, {
    derivation: b.evidence,
    assumptionContext,
  });
  same(conditional.derivation.target.judgment.claim, ordinary.target.judgment.claim, "empty assumptions preserve target");
  same(conditional.derivation.occurrenceCount, ordinary.occurrenceCount, "empty assumptions preserve closure");
  same(conditional.declaredAssumptionClaims.length, 0, "empty logical context");
}

// Assumption context is exact Theory-scoped ordered data and duplicates are rejected.
{
  const fx = derivationFixture();
  const root = fx.rootLeft();
  const derivation = { theory: fx.theory, targetOccurrence: root.occurrence, nodes: [root.node] };
  const otherTheory = fx.fresh();
  const wrongTheoryContext = defineStructuralAssumptionContext(fx.memory, otherTheory, [fx.left]);
  expectAssumptionError("assumption-theory-mismatch", () => replayStructuralDerivationWithAssumptions(
    fx.memory,
    { derivation, assumptionContext: wrongTheoryContext },
  ));

  const duplicateContext = materializeExactSequence(fx.memory, [fx.theory, fx.left, fx.left]);
  fx.memory.ensure(duplicateContext, fx.left);
  expectAssumptionError("duplicate-assumption", () => replayStructuralDerivationWithAssumptions(
    fx.memory,
    { derivation, assumptionContext: duplicateContext },
  ));

  const foreignContext = new Memory().root;
  expectAssumptionError("invalid-assumption-context", () => replayStructuralDerivationWithAssumptions(
    fx.memory,
    { derivation, assumptionContext: foreignContext },
  ));
}

// Every declared assumption requires an existing scoped Pair(scope, Claim); replay never materializes it.
{
  const fx = derivationFixture();
  const root = fx.rootLeft();
  const missingOccurrenceContext = materializeExactSequence(fx.memory, [fx.theory, fx.left]);
  expectAssumptionError("missing-assumption-occurrence", () => replayStructuralDerivationWithAssumptions(
    fx.memory,
    {
      derivation: { theory: fx.theory, targetOccurrence: root.occurrence, nodes: [root.node] },
      assumptionContext: missingOccurrenceContext,
    },
  ));
}

// Undeclared assumption references and wrong assumed Claims fail closed.
{
  const fx = derivationFixture();
  const assumptionContext = defineStructuralAssumptionContext(fx.memory, fx.theory, [fx.left]);
  const undeclared = fx.memory.ensure(assumptionContext, fx.right);
  const unresolvedTarget = fx.node(
    fx.main,
    [fx.rightRole],
    [[fx.rightRole, fx.right]],
    fx.rightRole,
    fx.right,
    [fx.rightRole],
    [undeclared],
  );
  expectAssumptionError("dependency-not-resolved", () => replayStructuralDerivationWithAssumptions(
    fx.memory,
    {
      derivation: { theory: fx.theory, targetOccurrence: unresolvedTarget.occurrence, nodes: [unresolvedTarget.node] },
      assumptionContext,
    },
  ));

  const rightContext = defineStructuralAssumptionContext(fx.memory, fx.theory, [fx.right]);
  const rightAssumption = fx.memory.find(rightContext, fx.right);
  assert(rightAssumption !== undefined, "wrong-template assumption occurrence");
  const wrongTemplateTarget = fx.node(
    fx.main,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [fx.leftRole],
    [rightAssumption],
  );
  expectAssumptionError("invalid-assumption-derivation", () => replayStructuralDerivationWithAssumptions(
    fx.memory,
    {
      derivation: { theory: fx.theory, targetOccurrence: wrongTemplateTarget.occurrence, nodes: [wrongTemplateTarget.node] },
      assumptionContext: rightContext,
    },
  ));
}

// Structural collision between proof and assumption dependency is rejected as ambiguous.
{
  const fx = derivationFixture();
  const roleDictionary = defineStructuralRoleDictionary(fx.memory, [fx.leftRole]);
  const rule = defineStructuralRule(fx.memory, roleDictionary, fx.leftRole);
  const ruleAdmission = admitStructuralRule(fx.memory, fx.theory, rule);
  const actContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const act = defineActHeader(fx.memory, fx.main.interpreter, roleDictionary, actContext);

  const assumptionContext = defineStructuralAssumptionContext(fx.memory, fx.theory, [act]);
  defineActField(fx.memory, act, fx.leftRole, assumptionContext);
  const collidedOccurrence = fx.memory.find(assumptionContext, act);
  assert(collidedOccurrence !== undefined, "collided assumption occurrence");
  same(defineStructuralProofOccurrence(fx.memory, act, assumptionContext), collidedOccurrence, "proof/assumption structural collision");

  const collidingRule = defineStructuralDerivationRule(fx.memory, rule, []);
  const collidingNode = {
    occurrence: collidedOccurrence,
    judgment: {
      application: {
        act,
        rule,
        ruleAdmission,
        claimedBody: assumptionContext,
        expectedInterpreter: fx.main.expectedInterpreter,
        expectedAfterContext: actContext,
      },
      judgment: { theory: fx.theory, context: actContext, claim: assumptionContext },
    },
    derivationRule: collidingRule,
    derivationRuleAdmission: admitStructuralDerivationRule(fx.memory, fx.theory, collidingRule),
    premiseOccurrenceSequence: materializeExactSequence(fx.memory, []),
  };

  const targetContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const target = fx.node(
    fx.main,
    [fx.leftRole],
    [[fx.leftRole, assumptionContext]],
    fx.leftRole,
    assumptionContext,
    [fx.leftRole],
    [collidedOccurrence],
    targetContext,
  );
  expectAssumptionError("ambiguous-dependency", () => replayStructuralDerivationWithAssumptions(
    fx.memory,
    {
      derivation: {
        theory: fx.theory,
        targetOccurrence: target.occurrence,
        nodes: [target.node, collidingNode],
      },
      assumptionContext,
    },
  ));
}

// Conditional evidence cannot be smuggled into the unconditional P3a theorem boundary.
{
  const fx = derivationFixture();
  const assumptionContext = defineStructuralAssumptionContext(fx.memory, fx.theory, [fx.left]);
  const assumed = fx.memory.find(assumptionContext, fx.left);
  assert(assumed !== undefined, "conditional theorem assumption");
  const target = fx.node(
    fx.main,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [fx.leftRole],
    [assumed],
  );
  const conditionalEvidence = {
    derivation: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] },
    assumptionContext,
  };
  replayStructuralDerivationWithAssumptions(fx.memory, conditionalEvidence);

  const theorem = defineStructuralTheorem(fx.memory, fx.left, fx.theory);
  expectTheoremError("theorem-proof-theory-mismatch", () => replayStructuralTheorem(fx.memory, {
    theorem,
    proof: conditionalEvidence as unknown as StructuralDerivationEvidence,
  }));
}

// Any write during assumption resolution is detected even when the structural result would otherwise match.
{
  const fx = derivationFixture();
  const assumptionContext = defineStructuralAssumptionContext(fx.memory, fx.theory, [fx.left]);
  const assumption = fx.memory.find(assumptionContext, fx.left);
  assert(assumption !== undefined, "write-detection assumption occurrence");
  const targetContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const target = fx.node(
    fx.main,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [fx.leftRole],
    [assumption],
    targetContext,
  );
  let injected = false;
  const malicious: ReadMemory = {
    get root() { return fx.memory.root; },
    get linkCount() { return fx.memory.linkCount; },
    poles(link) { return fx.memory.poles(link); },
    find(start, end) {
      if (!injected) {
        injected = true;
        fx.memory.ensure(fx.fresh(), fx.fresh());
      }
      return fx.memory.find(start, end);
    },
    outgoing(start) { return fx.memory.outgoing(start); },
    incoming(end) { return fx.memory.incoming(end); },
  };
  expectAssumptionError("assumption-replay-wrote", () => replayStructuralDerivationWithAssumptions(
    malicious,
    {
      derivation: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] },
      assumptionContext,
    },
  ));
}
