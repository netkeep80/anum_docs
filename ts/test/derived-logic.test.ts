import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
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
function expectError<C extends string>(
  ctor: abstract new (...args: never[]) => { code: C },
  code: C,
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof ctor, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected rejection`);
}

function logicFixture() {
  const memory = new Memory();
  const { R, U } = ensureRootBasis(memory);
  let cursor = U;
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const dictionary = fresh(), grammar = fresh(), theory = fresh(), weakTheory = fresh();
  const pRole = fresh(), qRole = fresh(), impTag = fresh();
  const p = fresh(), q = fresh(), r = fresh();

  const environment = (selectedTheory: LinkHandle) => {
    const expectedInterpreter: StructuralInterpreter = {
      dictionary, grammar, theory: selectedTheory,
    };
    return {
      expectedInterpreter,
      interpreter: defineStructuralInterpreter(memory, dictionary, grammar, selectedTheory),
    };
  };
  const main = environment(theory), weak = environment(weakTheory);
  const imp = (left: LinkHandle, right: LinkHandle, tag = impTag) =>
    memory.ensure(tag, memory.ensure(left, right));

  const roleDictionary = defineStructuralRoleDictionary(memory, [pRole, qRole]);
  const mpRule = defineStructuralRule(memory, roleDictionary, qRole);
  const mpRuleAdmission = admitStructuralRule(memory, theory, mpRule);
  const mpDerivationRule = defineStructuralDerivationRule(
    memory, mpRule, [pRole, imp(pRole, qRole)],
  );
  const mpDerivationRuleAdmission =
    admitStructuralDerivationRule(memory, theory, mpDerivationRule);

  const mpNode = (
    selectedTheory: LinkHandle,
    env: ReturnType<typeof environment>,
    selectedP: LinkHandle,
    selectedQ: LinkHandle,
    premises: readonly LinkHandle[],
    ruleAdmission = mpRuleAdmission,
    derivationAdmission = mpDerivationRuleAdmission,
  ) => {
    const context = defineContext(memory, fresh(), fresh());
    const act = defineActHeader(memory, env.interpreter, roleDictionary, context);
    defineActField(memory, act, pRole, selectedP);
    defineActField(memory, act, qRole, selectedQ);
    const judgment: StructuralJudgmentEvidence = {
      application: {
        act, rule: mpRule, ruleAdmission, claimedBody: selectedQ,
        expectedInterpreter: env.expectedInterpreter, expectedAfterContext: context,
      },
      judgment: { theory: selectedTheory, context, claim: selectedQ },
    };
    const occurrence = defineStructuralProofOccurrence(memory, act, selectedQ);
    const node: StructuralDerivationNodeEvidence = {
      occurrence,
      judgment,
      derivationRule: mpDerivationRule,
      derivationRuleAdmission: derivationAdmission,
      premiseOccurrenceSequence: materializeExactSequence(memory, premises),
    };
    return { occurrence, node };
  };

  const rootRole = fresh();
  const rootDictionary = defineStructuralRoleDictionary(memory, [rootRole]);
  const rootRule = defineStructuralRule(memory, rootDictionary, rootRole);
  const rootRuleAdmission = admitStructuralRule(memory, theory, rootRule);
  const rootDerivationRule = defineStructuralDerivationRule(memory, rootRule, []);
  const rootDerivationAdmission =
    admitStructuralDerivationRule(memory, theory, rootDerivationRule);
  const rootClaim = (claim: LinkHandle) => {
    const context = defineContext(memory, fresh(), fresh());
    const act = defineActHeader(memory, main.interpreter, rootDictionary, context);
    defineActField(memory, act, rootRole, claim);
    const occurrence = defineStructuralProofOccurrence(memory, act, claim);
    const node: StructuralDerivationNodeEvidence = {
      occurrence,
      judgment: {
        application: {
          act, rule: rootRule, ruleAdmission: rootRuleAdmission, claimedBody: claim,
          expectedInterpreter: main.expectedInterpreter, expectedAfterContext: context,
        },
        judgment: { theory, context, claim },
      },
      derivationRule: rootDerivationRule,
      derivationRuleAdmission: rootDerivationAdmission,
      premiseOccurrenceSequence: materializeExactSequence(memory, []),
    };
    return { occurrence, node };
  };

  const assume = (...claims: LinkHandle[]) => {
    const context = defineStructuralAssumptionContext(memory, theory, claims);
    const occurrences = claims.map((claim) => memory.find(context, claim));
    assert(occurrences.every((value) => value !== undefined), "assumption occurrences");
    return { context, occurrences: occurrences as LinkHandle[] };
  };

  return {
    memory, fresh, theory, weakTheory, main, weak, pRole, qRole, impTag, p, q, r,
    imp, roleDictionary, mpRule, mpRuleAdmission, mpDerivationRule,
    mpDerivationRuleAdmission, mpNode, rootClaim, assume,
  };
}

const fx = logicFixture();

// Γ=[P, P→Q] derives Q; the same admitted rule works for another P/Q pair.
{
  const a = fx.assume(fx.p, fx.imp(fx.p, fx.q));
  const target = fx.mpNode(fx.theory, fx.main, fx.p, fx.q, a.occurrences);
  const before = fx.memory.linkCount;
  const result = replayStructuralDerivationWithAssumptions(fx.memory, {
    derivation: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] },
    assumptionContext: a.context,
  });
  same(result.derivation.target.judgment.claim, fx.q, "MP conclusion");
  same(result.usedAssumptionOccurrences.length, 2, "MP premise count");
  same(fx.memory.linkCount, before, "MP replay read-only");

  const p2 = fx.fresh(), q2 = fx.fresh();
  const b = fx.assume(p2, fx.imp(p2, q2));
  const target2 = fx.mpNode(fx.theory, fx.main, p2, q2, b.occurrences);
  same(target2.node.judgment.application.rule, fx.mpRule, "same MP rule");
  const result2 = replayStructuralDerivationWithAssumptions(fx.memory, {
    derivation: { theory: fx.theory, targetOccurrence: target2.occurrence, nodes: [target2.node] },
    assumptionContext: b.context,
  });
  same(result2.derivation.target.judgment.claim, q2, "second MP conclusion");
}

// Mixed proven/scoped premises and P3a theorem expansion use the same MP structure.
{
  const provenP = fx.rootClaim(fx.p);
  const a = fx.assume(fx.imp(fx.p, fx.q));
  const mixed = fx.mpNode(
    fx.theory, fx.main, fx.p, fx.q, [provenP.occurrence, a.occurrences[0]!],
  );
  same(replayStructuralDerivationWithAssumptions(fx.memory, {
    derivation: {
      theory: fx.theory, targetOccurrence: mixed.occurrence, nodes: [mixed.node, provenP.node],
    },
    assumptionContext: a.context,
  }).derivation.target.judgment.claim, fx.q, "mixed MP");

  const proofP = fx.rootClaim(fx.p);
  const proofImp = fx.rootClaim(fx.imp(fx.p, fx.q));
  const theorem = defineStructuralTheorem(fx.memory, fx.p, fx.theory);
  const target = fx.mpNode(
    fx.theory, fx.main, fx.p, fx.q, [proofP.occurrence, proofImp.occurrence],
  );
  const before = fx.memory.linkCount;
  const reused = replayStructuralDerivationWithTheorems(fx.memory, {
    derivation: {
      theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node, proofImp.node],
    },
    theorems: [{
      theorem,
      proof: { theory: fx.theory, targetOccurrence: proofP.occurrence, nodes: [proofP.node] },
    }],
  });
  same(reused.derivation.target.judgment.claim, fx.q, "theorem-carried MP");
  same(reused.derivation.occurrenceCount, 3, "theorem closure expanded");
  same(fx.memory.linkCount, before, "theorem MP replay read-only");
}

// Host node order is transport only.
{
  const pProof = fx.rootClaim(fx.p);
  const impProof = fx.rootClaim(fx.imp(fx.p, fx.q));
  const target = fx.mpNode(
    fx.theory, fx.main, fx.p, fx.q, [pProof.occurrence, impProof.occurrence],
  );
  const replay = (nodes: StructuralDerivationNodeEvidence[]) =>
    replayStructuralDerivation(fx.memory, {
      theory: fx.theory, targetOccurrence: target.occurrence, nodes,
    }).target.judgment.claim;
  same(
    replay([target.node, impProof.node, pProof.node]),
    replay([pProof.node, target.node, impProof.node]),
    "host order has no logical authority",
  );
}

// Wrong theory/admission and forged admissions fail closed; a host rule name grants nothing.
{
  const weakTarget = fx.mpNode(fx.weakTheory, fx.weak, fx.p, fx.q, []);
  const hostNamed = {
    ...weakTarget.node,
    judgment: {
      ...weakTarget.node.judgment,
      application: { ...weakTarget.node.judgment.application, ruleKind: "modusPonens" },
    },
  };
  expectError(StructuralDerivationReplayError, "invalid-node-judgment", () =>
    replayStructuralDerivation(fx.memory, {
      theory: fx.weakTheory, targetOccurrence: weakTarget.occurrence, nodes: [hostNamed],
    }),
  );

  const weakRuleAdmission = admitStructuralRule(fx.memory, fx.weakTheory, fx.mpRule);
  const weakRuleOnly = fx.mpNode(
    fx.weakTheory, fx.weak, fx.p, fx.q, [], weakRuleAdmission,
  );
  expectError(StructuralDerivationReplayError, "derivation-rule-not-admitted", () =>
    replayStructuralDerivation(fx.memory, {
      theory: fx.weakTheory, targetOccurrence: weakRuleOnly.occurrence, nodes: [weakRuleOnly.node],
    }),
  );

  const forgedRule = fx.mpNode(
    fx.theory, fx.main, fx.p, fx.q, [], fx.memory.ensure(fx.fresh(), fx.mpRule),
  );
  expectError(StructuralDerivationReplayError, "invalid-node-judgment", () =>
    replayStructuralDerivation(fx.memory, {
      theory: fx.theory, targetOccurrence: forgedRule.occurrence, nodes: [forgedRule.node],
    }),
  );

  const forgedDerivation = fx.mpNode(
    fx.theory, fx.main, fx.p, fx.q, [], fx.mpRuleAdmission,
    fx.memory.ensure(fx.fresh(), fx.mpDerivationRule),
  );
  expectError(StructuralDerivationReplayError, "derivation-rule-not-admitted", () =>
    replayStructuralDerivation(fx.memory, {
      theory: fx.theory, targetOccurrence: forgedDerivation.occurrence,
      nodes: [forgedDerivation.node],
    }),
  );
}

// Missing premises, wrong consequent and a different grounded ImpTag all reject.
{
  const valid = fx.assume(fx.p, fx.imp(fx.p, fx.q));
  for (const premises of [[valid.occurrences[0]!], [valid.occurrences[1]!]]) {
    const target = fx.mpNode(fx.theory, fx.main, fx.p, fx.q, premises);
    expectError(StructuralAssumptionReplayError, "invalid-assumption-derivation", () =>
      replayStructuralDerivationWithAssumptions(fx.memory, {
        derivation: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] },
        assumptionContext: valid.context,
      }),
    );
  }

  for (const wrongImp of [
    fx.imp(fx.p, fx.r),
    fx.imp(fx.p, fx.q, fx.fresh()),
  ]) {
    const a = fx.assume(fx.p, wrongImp);
    const target = fx.mpNode(fx.theory, fx.main, fx.p, fx.q, a.occurrences);
    expectError(StructuralAssumptionReplayError, "invalid-assumption-derivation", () =>
      replayStructuralDerivationWithAssumptions(fx.memory, {
        derivation: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] },
        assumptionContext: a.context,
      }),
    );
  }
}

// A conditional Γ|-Q replay cannot be submitted as an unconditional theorem proof.
{
  const a = fx.assume(fx.p, fx.imp(fx.p, fx.q));
  const target = fx.mpNode(fx.theory, fx.main, fx.p, fx.q, a.occurrences);
  replayStructuralDerivationWithAssumptions(fx.memory, {
    derivation: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] },
    assumptionContext: a.context,
  });
  const theorem = defineStructuralTheorem(fx.memory, fx.q, fx.theory);
  expectError(StructuralTheoremReplayError, "invalid-theorem-proof", () =>
    replayStructuralTheorem(fx.memory, {
      theorem,
      proof: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] },
    }),
  );
}

// MP admission does not admit an unrelated host-labelled logical principle.
{
  const claim = fx.memory.ensure(fx.p, fx.q);
  const role = fx.fresh();
  const dictionary = defineStructuralRoleDictionary(fx.memory, [role]);
  const rule = defineStructuralRule(fx.memory, dictionary, role);
  const context = defineContext(fx.memory, fx.fresh(), fx.fresh());
  const act = defineActHeader(fx.memory, fx.main.interpreter, dictionary, context);
  defineActField(fx.memory, act, role, claim);
  const occurrence = defineStructuralProofOccurrence(fx.memory, act, claim);
  const derivationRule = defineStructuralDerivationRule(fx.memory, rule, []);
  const node: StructuralDerivationNodeEvidence = {
    occurrence,
    judgment: {
      application: {
        act, rule, ruleAdmission: fx.memory.ensure(fx.fresh(), rule), claimedBody: claim,
        expectedInterpreter: fx.main.expectedInterpreter, expectedAfterContext: context,
      },
      judgment: { theory: fx.theory, context, claim },
    },
    derivationRule,
    derivationRuleAdmission: fx.memory.ensure(fx.fresh(), derivationRule),
    premiseOccurrenceSequence: materializeExactSequence(fx.memory, []),
  };
  const hostLabelled: StructuralDerivationNodeEvidence & {
    readonly logicalPrinciple: string;
  } = { ...node, logicalPrinciple: "excluded-middle" };
  expectError(StructuralDerivationReplayError, "invalid-node-judgment", () =>
    replayStructuralDerivation(fx.memory, {
      theory: fx.theory, targetOccurrence: occurrence, nodes: [hostLabelled],
    }),
  );
}

// Read-only replay detects write injection.
{
  const a = fx.assume(fx.p, fx.imp(fx.p, fx.q));
  const target = fx.mpNode(fx.theory, fx.main, fx.p, fx.q, a.occurrences);
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
  expectError(StructuralAssumptionReplayError, "assumption-replay-wrote", () =>
    replayStructuralDerivationWithAssumptions(malicious, {
      derivation: { theory: fx.theory, targetOccurrence: target.occurrence, nodes: [target.node] },
      assumptionContext: a.context,
    }),
  );
}

const P5_LOGIC_AS_DERIVED_THEORY_SUPPORTED = true;
const P5_THEOREM_SPECIFIC_KERNEL_REQUIRED = false;
assert(P5_LOGIC_AS_DERIVED_THEORY_SUPPORTED, "P5 classification");
assert(!P5_THEOREM_SPECIFIC_KERNEL_REQUIRED, "P5 kernel boundary");
