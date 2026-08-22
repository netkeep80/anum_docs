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
  StructuralTheoremReplayError,
  admitStructuralDerivationRule,
  defineStructuralAssumptionContext,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  defineStructuralTheorem,
  replayStructuralDerivation,
  replayStructuralDerivationWithAssumptions,
  replayStructuralDerivationWithTheorems,
  replayStructuralTheorem,
  type StructuralDerivationNodeEvidence,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
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

type Binding = readonly [LinkHandle, LinkHandle];

function logicFixture() {
  const memory = new Memory();
  const { R, U } = ensureRootBasis(memory);
  let cursor = U;
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));

  const dictionary = fresh();
  const grammar = fresh();
  const theory = fresh();
  const weakTheory = fresh();
  const pRole = fresh();
  const qRole = fresh();
  const impTag = fresh();
  const p = fresh();
  const q = fresh();
  const r = fresh();

  const environment = (selectedTheory: LinkHandle) => {
    const expectedInterpreter: StructuralInterpreter = {
      dictionary,
      grammar,
      theory: selectedTheory,
    };
    return {
      expectedInterpreter,
      interpreter: defineStructuralInterpreter(memory, dictionary, grammar, selectedTheory),
    };
  };
  const main = environment(theory);
  const weak = environment(weakTheory);

  const imp = (left: LinkHandle, right: LinkHandle, tag: LinkHandle = impTag): LinkHandle =>
    memory.ensure(tag, memory.ensure(left, right));

  const roleDictionary = defineStructuralRoleDictionary(memory, [pRole, qRole]);
  const mpRule = defineStructuralRule(memory, roleDictionary, qRole);
  const mpRuleAdmission = admitStructuralRule(memory, theory, mpRule);
  const mpPremiseTemplates = [pRole, imp(pRole, qRole)] as const;
  const mpDerivationRule = defineStructuralDerivationRule(memory, mpRule, mpPremiseTemplates);
  const mpDerivationRuleAdmission = admitStructuralDerivationRule(memory, theory, mpDerivationRule);

  const makeMpNode = (
    selectedTheory: LinkHandle,
    env: ReturnType<typeof environment>,
    selectedP: LinkHandle,
    selectedQ: LinkHandle,
    premiseOccurrences: readonly LinkHandle[],
    context: LinkHandle,
    ruleAdmission: LinkHandle = mpRuleAdmission,
    derivationRuleAdmission: LinkHandle = mpDerivationRuleAdmission,
  ) => {
    const act = defineActHeader(memory, env.interpreter, roleDictionary, context);
    defineActField(memory, act, pRole, selectedP);
    defineActField(memory, act, qRole, selectedQ);
    const judgment: StructuralJudgmentEvidence = {
      application: {
        act,
        rule: mpRule,
        ruleAdmission,
        claimedBody: selectedQ,
        expectedInterpreter: env.expectedInterpreter,
        expectedAfterContext: context,
      },
      judgment: { theory: selectedTheory, context, claim: selectedQ },
    };
    const occurrence = defineStructuralProofOccurrence(memory, act, selectedQ);
    const node: StructuralDerivationNodeEvidence = {
      occurrence,
      judgment,
      derivationRule: mpDerivationRule,
      derivationRuleAdmission,
      premiseOccurrenceSequence: materializeExactSequence(memory, premiseOccurrences),
    };
    return { act, occurrence, node };
  };

  const rootRole = fresh();
  const rootDictionary = defineStructuralRoleDictionary(memory, [rootRole]);
  const rootRule = defineStructuralRule(memory, rootDictionary, rootRole);
  const rootRuleAdmission = admitStructuralRule(memory, theory, rootRule);
  const rootDerivationRule = defineStructuralDerivationRule(memory, rootRule, []);
  const rootDerivationRuleAdmission = admitStructuralDerivationRule(memory, theory, rootDerivationRule);
  const rootClaim = (claim: LinkHandle) => {
    const context = defineContext(memory, fresh(), fresh());
    const act = defineActHeader(memory, main.interpreter, rootDictionary, context);
    defineActField(memory, act, rootRole, claim);
    const occurrence = defineStructuralProofOccurrence(memory, act, claim);
    const node: StructuralDerivationNodeEvidence = {
      occurrence,
      judgment: {
        application: {
          act,
          rule: rootRule,
          ruleAdmission: rootRuleAdmission,
          claimedBody: claim,
          expectedInterpreter: main.expectedInterpreter,
          expectedAfterContext: context,
        },
        judgment: { theory, context, claim },
      },
      derivationRule: rootDerivationRule,
      derivationRuleAdmission: rootDerivationRuleAdmission,
      premiseOccurrenceSequence: materializeExactSequence(memory, []),
    };
    return { occurrence, node };
  };

  return {
    memory,
    fresh,
    theory,
    weakTheory,
    main,
    weak,
    pRole,
    qRole,
    impTag,
    p,
    q,
    r,
    imp,
    roleDictionary,
    mpRule,
    mpRuleAdmission,
    mpDerivationRule,
    mpDerivationRuleAdmission,
    makeMpNode,
    rootClaim,
  };
}

// P5 positive: Γ = [P, P→Q] derives Q using only Theory + admitted structural data.
{
  const fx = logicFixture();
  const implication = fx.imp(fx.p, fx.q);
  const assumptions = defineStructuralAssumptionContext(fx.memory, fx.theory, [fx.p, implication]);
  const pOccurrence = fx.memory.find(assumptions, fx.p);
  const impOccurrence = fx.memory.find(assumptions, implication);
  assert(pOccurrence !== undefined && impOccurrence !== undefined, "MP assumptions materialized");
  const target = fx.makeMpNode(
    fx.theory,
    fx.main,
    fx.p,
    fx.q,
    [pOccurrence, impOccurrence],
    defineContext(fx.memory, fx.fresh(), fx.fresh()),
  );
  const before = fx.memory.linkCount;
  const result = replayStructuralDerivationWithAssumptions(fx.memory, {
    derivation: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] },
    assumptionContext: assumptions,
  });
  same(result.derivation.target.judgment.claim, fx.q, "MP conclusion Q");
  same(result.usedAssumptionOccurrences.length, 2, "MP consumes two scoped premises");
  same(fx.memory.linkCount, before, "MP replay read-only");
}

// The same exact MP rule is a schema over a second P/Q pair, not theorem-specific code.
{
  const fx = logicFixture();
  const p2 = fx.fresh();
  const q2 = fx.fresh();
  const implication = fx.imp(p2, q2);
  const assumptions = defineStructuralAssumptionContext(fx.memory, fx.theory, [p2, implication]);
  const pOccurrence = fx.memory.find(assumptions, p2);
  const impOccurrence = fx.memory.find(assumptions, implication);
  assert(pOccurrence !== undefined && impOccurrence !== undefined, "second MP assumptions");
  const target = fx.makeMpNode(
    fx.theory,
    fx.main,
    p2,
    q2,
    [pOccurrence, impOccurrence],
    defineContext(fx.memory, fx.fresh(), fx.fresh()),
  );
  same(target.node.judgment.application.rule, fx.mpRule, "same MP StructuralRule");
  same(target.node.derivationRule, fx.mpDerivationRule, "same MP derivation rule");
  const result = replayStructuralDerivationWithAssumptions(fx.memory, {
    derivation: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] },
    assumptionContext: assumptions,
  });
  same(result.derivation.target.judgment.claim, q2, "second MP conclusion");
}

// One proved P plus one scoped implication use the same structural MP matcher.
{
  const fx = logicFixture();
  const provenP = fx.rootClaim(fx.p);
  const implication = fx.imp(fx.p, fx.q);
  const assumptions = defineStructuralAssumptionContext(fx.memory, fx.theory, [implication]);
  const impOccurrence = fx.memory.find(assumptions, implication);
  assert(impOccurrence !== undefined, "mixed MP assumption");
  const target = fx.makeMpNode(
    fx.theory,
    fx.main,
    fx.p,
    fx.q,
    [provenP.occurrence, impOccurrence],
    defineContext(fx.memory, fx.fresh(), fx.fresh()),
  );
  const result = replayStructuralDerivationWithAssumptions(fx.memory, {
    derivation: {
      theory: fx.theory,
      targetOccurrence: target.occurrence,
      nodes: [target.node, provenP.node],
    },
    assumptionContext: assumptions,
  });
  same(result.derivation.target.judgment.claim, fx.q, "mixed MP conclusion");
}

// P3a theorem evidence grants a premise only by expanding its full proof closure.
{
  const fx = logicFixture();
  const proofP = fx.rootClaim(fx.p);
  const proofImp = fx.rootClaim(fx.imp(fx.p, fx.q));
  const theorem = defineStructuralTheorem(fx.memory, fx.p, fx.theory);
  const target = fx.makeMpNode(
    fx.theory,
    fx.main,
    fx.p,
    fx.q,
    [proofP.occurrence, proofImp.occurrence],
    defineContext(fx.memory, fx.fresh(), fx.fresh()),
  );
  const before = fx.memory.linkCount;
  const result = replayStructuralDerivationWithTheorems(fx.memory, {
    derivation: {
      theory: fx.theory,
      targetOccurrence: target.occurrence,
      nodes: [target.node, proofImp.node],
    },
    theorems: [{
      theorem,
      proof: { theory: fx.theory, targetOccurrence: proofP.occurrence, nodes: [proofP.node] },
    }],
  });
  same(result.derivation.target.judgment.claim, fx.q, "theorem-carried MP conclusion");
  same(result.derivation.occurrenceCount, 3, "theorem closure expanded");
  same(fx.memory.linkCount, before, "theorem MP replay read-only");
}

// Host node order is transport only; structural dependency evidence determines MP.
{
  const fx = logicFixture();
  const proofP = fx.rootClaim(fx.p);
  const proofImp = fx.rootClaim(fx.imp(fx.p, fx.q));
  const target = fx.makeMpNode(
    fx.theory,
    fx.main,
    fx.p,
    fx.q,
    [proofP.occurrence, proofImp.occurrence],
    defineContext(fx.memory, fx.fresh(), fx.fresh()),
  );
  const a = replayStructuralDerivation(fx.memory, {
    theory: fx.theory,
    targetOccurrence: target.occurrence,
    nodes: [target.node, proofImp.node, proofP.node],
  });
  const b = replayStructuralDerivation(fx.memory, {
    theory: fx.theory,
    targetOccurrence: target.occurrence,
    nodes: [proofP.node, target.node, proofImp.node],
  });
  same(a.target.judgment.claim, b.target.judgment.claim, "host order cannot define MP");
}

// T_WEAK has the same formula data but no MP admission: host naming grants nothing.
{
  const fx = logicFixture();
  const target = fx.makeMpNode(
    fx.weakTheory,
    fx.weak,
    fx.p,
    fx.q,
    [],
    defineContext(fx.memory, fx.fresh(), fx.fresh()),
  );
  const hostNamed = {
    ...target.node,
    judgment: {
      ...target.node.judgment,
      application: { ...target.node.judgment.application, ruleKind: "modusPonens" },
    },
  };
  expectDerivationError("invalid-node-judgment", () => replayStructuralDerivation(fx.memory, {
    theory: fx.weakTheory,
    targetOccurrence: target.occurrence,
    nodes: [hostNamed],
  }));
}

// Structural Rule admission and DerivationRule admission are independently theory-scoped.
{
  const fx = logicFixture();
  const weakRuleAdmission = admitStructuralRule(fx.memory, fx.weakTheory, fx.mpRule);
  const target = fx.makeMpNode(
    fx.weakTheory,
    fx.weak,
    fx.p,
    fx.q,
    [],
    defineContext(fx.memory, fx.fresh(), fx.fresh()),
    weakRuleAdmission,
    fx.mpDerivationRuleAdmission,
  );
  expectDerivationError("derivation-rule-not-admitted", () => replayStructuralDerivation(fx.memory, {
    theory: fx.weakTheory,
    targetOccurrence: target.occurrence,
    nodes: [target.node],
  }));
}

// Forged admissions fail closed before any logical interpretation is possible.
{
  const fx = logicFixture();
  const forgedRuleAdmission = fx.memory.ensure(fx.fresh(), fx.mpRule);
  const badRule = fx.makeMpNode(
    fx.theory,
    fx.main,
    fx.p,
    fx.q,
    [],
    defineContext(fx.memory, fx.fresh(), fx.fresh()),
    forgedRuleAdmission,
  );
  expectDerivationError("invalid-node-judgment", () => replayStructuralDerivation(fx.memory, {
    theory: fx.theory,
    targetOccurrence: badRule.occurrence,
    nodes: [badRule.node],
  }));

  const forgedDerivationAdmission = fx.memory.ensure(fx.fresh(), fx.mpDerivationRule);
  const badDerivation = fx.makeMpNode(
    fx.theory,
    fx.main,
    fx.p,
    fx.q,
    [],
    defineContext(fx.memory, fx.fresh(), fx.fresh()),
    fx.mpRuleAdmission,
    forgedDerivationAdmission,
  );
  expectDerivationError("derivation-rule-not-admitted", () => replayStructuralDerivation(fx.memory, {
    theory: fx.theory,
    targetOccurrence: badDerivation.occurrence,
    nodes: [badDerivation.node],
  }));
}

// Missing either explicit MP dependency rejects; no premise is synthesized.
{
  const fx = logicFixture();
  const implication = fx.imp(fx.p, fx.q);
  const assumptions = defineStructuralAssumptionContext(fx.memory, fx.theory, [fx.p, implication]);
  const pOccurrence = fx.memory.find(assumptions, fx.p);
  const impOccurrence = fx.memory.find(assumptions, implication);
  assert(pOccurrence !== undefined && impOccurrence !== undefined, "missing-premise assumptions");
  for (const only of [[pOccurrence], [impOccurrence]] as const) {
    const target = fx.makeMpNode(
      fx.theory,
      fx.main,
      fx.p,
      fx.q,
      only,
      defineContext(fx.memory, fx.fresh(), fx.fresh()),
    );
    expectAssumptionError("invalid-assumption-derivation", () => replayStructuralDerivationWithAssumptions(
      fx.memory,
      {
        derivation: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] },
        assumptionContext: assumptions,
      },
    ));
  }
}

// Wrong consequent or different grounded implication tag cannot match by host convention.
{
  const fx = logicFixture();
  const wrongImp = fx.imp(fx.p, fx.r);
  const wrongContext = defineStructuralAssumptionContext(fx.memory, fx.theory, [fx.p, wrongImp]);
  const pOccurrence = fx.memory.find(wrongContext, fx.p);
  const wrongOccurrence = fx.memory.find(wrongContext, wrongImp);
  assert(pOccurrence !== undefined && wrongOccurrence !== undefined, "wrong consequent assumptions");
  const wrongTarget = fx.makeMpNode(
    fx.theory,
    fx.main,
    fx.p,
    fx.q,
    [pOccurrence, wrongOccurrence],
    defineContext(fx.memory, fx.fresh(), fx.fresh()),
  );
  expectAssumptionError("invalid-assumption-derivation", () => replayStructuralDerivationWithAssumptions(
    fx.memory,
    {
      derivation: { theory: fx.theory, targetOccurrence: wrongTarget.occurrence, nodes: [wrongTarget.node] },
      assumptionContext: wrongContext,
    },
  ));

  const impTag2 = fx.fresh();
  const renamedImp = fx.imp(fx.p, fx.q, impTag2);
  const renamedContext = defineStructuralAssumptionContext(fx.memory, fx.theory, [fx.p, renamedImp]);
  const renamedP = fx.memory.find(renamedContext, fx.p);
  const renamedOccurrence = fx.memory.find(renamedContext, renamedImp);
  assert(renamedP !== undefined && renamedOccurrence !== undefined, "different-tag assumptions");
  const renamedTarget = fx.makeMpNode(
    fx.theory,
    fx.main,
    fx.p,
    fx.q,
    [renamedP, renamedOccurrence],
    defineContext(fx.memory, fx.fresh(), fx.fresh()),
  );
  expectAssumptionError("invalid-assumption-derivation", () => replayStructuralDerivationWithAssumptions(
    fx.memory,
    {
      derivation: { theory: fx.theory, targetOccurrence: renamedTarget.occurrence, nodes: [renamedTarget.node] },
      assumptionContext: renamedContext,
    },
  ));
}

// Conditional Γ |- Q evidence cannot be promoted to an unconditional theorem.
{
  const fx = logicFixture();
  const implication = fx.imp(fx.p, fx.q);
  const assumptions = defineStructuralAssumptionContext(fx.memory, fx.theory, [fx.p, implication]);
  const pOccurrence = fx.memory.find(assumptions, fx.p);
  const impOccurrence = fx.memory.find(assumptions, implication);
  assert(pOccurrence !== undefined && impOccurrence !== undefined, "conditional theorem assumptions");
  const target = fx.makeMpNode(
    fx.theory,
    fx.main,
    fx.p,
    fx.q,
    [pOccurrence, impOccurrence],
    defineContext(fx.memory, fx.fresh(), fx.fresh()),
  );
  const conditional = {
    derivation: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] },
    assumptionContext: assumptions,
  };
  replayStructuralDerivationWithAssumptions(fx.memory, conditional);
  const theorem = defineStructuralTheorem(fx.memory, fx.q, fx.theory);
  expectTheoremError("theorem-proof-theory-mismatch", () => replayStructuralTheorem(fx.memory, {
    theorem,
    proof: conditional as unknown as StructuralDerivationEvidence,
  }));
}

// Read-only boundary detects a write even when MP structure itself is otherwise valid.
{
  const fx = logicFixture();
  const implication = fx.imp(fx.p, fx.q);
  const assumptions = defineStructuralAssumptionContext(fx.memory, fx.theory, [fx.p, implication]);
  const pOccurrence = fx.memory.find(assumptions, fx.p);
  const impOccurrence = fx.memory.find(assumptions, implication);
  assert(pOccurrence !== undefined && impOccurrence !== undefined, "write-detection assumptions");
  const target = fx.makeMpNode(
    fx.theory,
    fx.main,
    fx.p,
    fx.q,
    [pOccurrence, impOccurrence],
    defineContext(fx.memory, fx.fresh(), fx.fresh()),
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
      assumptionContext: assumptions,
    },
  ));
}

// An unrelated host-labelled logical principle is not admitted by admitting MP.
{
  const fx = logicFixture();
  const excludedMiddleLike = fx.memory.ensure(fx.p, fx.q);
  const emRole = fx.fresh();
  const emDictionary = defineStructuralRoleDictionary(fx.memory, [emRole]);
  const emRule = defineStructuralRule(fx.memory, emDictionary, emRole);
  const context = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const act = defineActHeader(fx.memory, fx.main.interpreter, emDictionary, context);
  defineActField(fx.memory, act, emRole, excludedMiddleLike);
  const forgedAdmission = fx.memory.ensure(fx.fresh(), emRule);
  const occurrence = defineStructuralProofOccurrence(fx.memory, act, excludedMiddleLike);
  const derivationRule = defineStructuralDerivationRule(fx.memory, emRule, []);
  const node: StructuralDerivationNodeEvidence = {
    occurrence,
    judgment: {
      application: {
        act,
        rule: emRule,
        ruleAdmission: forgedAdmission,
        claimedBody: excludedMiddleLike,
        expectedInterpreter: fx.main.expectedInterpreter,
        expectedAfterContext: context,
      },
      judgment: { theory: fx.theory, context, claim: excludedMiddleLike },
    },
    derivationRule,
    derivationRuleAdmission: fx.memory.ensure(fx.fresh(), derivationRule),
    premiseOccurrenceSequence: materializeExactSequence(fx.memory, []),
  };
  const hostLabelled = { ...node, logicalPrinciple: "excluded-middle" };
  expectDerivationError("invalid-node-judgment", () => replayStructuralDerivation(fx.memory, {
    theory: fx.theory,
    targetOccurrence: occurrence,
    nodes: [hostLabelled],
  }));
}

const P5_LOGIC_AS_DERIVED_THEORY_SUPPORTED = true;
const P5_THEOREM_SPECIFIC_KERNEL_REQUIRED = false;
assert(P5_LOGIC_AS_DERIVED_THEORY_SUPPORTED, "P5 classification");
assert(!P5_THEOREM_SPECIFIC_KERNEL_REQUIRED, "P5 kernel boundary");
