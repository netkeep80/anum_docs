import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/public.js";
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
  admitStructuralDerivationRule,
  defineStructuralAssumptionContext,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  replayStructuralDerivationWithAssumptions,
  type StructuralDerivationNodeEvidence,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

interface RulePack {
  readonly rule: LinkHandle;
  readonly ruleAdmission: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
}

function fixture() {
  const memory = new Memory();
  const { R, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));

  const dictionary = fresh();
  const grammar = fresh();
  const theory = memory.ensure(L, U);
  const expectedInterpreter: StructuralInterpreter = { dictionary, grammar, theory };
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);

  const aRole = fresh();
  const bRole = fresh();
  const cRole = fresh();
  const roleDictionary = defineStructuralRoleDictionary(memory, [aRole, bRole, cRole]);

  const defineAdmittedPack = (
    conclusionTemplate: LinkHandle,
    premiseTemplates: readonly LinkHandle[],
  ): RulePack => {
    const rule = defineStructuralRule(memory, roleDictionary, conclusionTemplate);
    const ruleAdmission = admitStructuralRule(memory, theory, rule);
    const derivationRule = defineStructuralDerivationRule(memory, rule, premiseTemplates);
    const derivationRuleAdmission = admitStructuralDerivationRule(memory, theory, derivationRule);
    return { rule, ruleAdmission, derivationRule, derivationRuleAdmission };
  };

  const r1 = defineAdmittedPack(bRole, [aRole]);
  const r2 = defineAdmittedPack(cRole, [bRole]);

  const r3Rule = defineStructuralRule(memory, roleDictionary, cRole);
  const r3DerivationRule = defineStructuralDerivationRule(memory, r3Rule, [aRole]);

  const makeNode = (
    pack: RulePack,
    selectedA: LinkHandle,
    selectedB: LinkHandle,
    selectedC: LinkHandle,
    claim: LinkHandle,
    premiseOccurrences: readonly LinkHandle[],
  ) => {
    const context = defineContext(memory, fresh(), fresh());
    const act = defineActHeader(memory, interpreter, roleDictionary, context);
    defineActField(memory, act, aRole, selectedA);
    defineActField(memory, act, bRole, selectedB);
    defineActField(memory, act, cRole, selectedC);
    const judgment: StructuralJudgmentEvidence = {
      application: {
        act,
        rule: pack.rule,
        ruleAdmission: pack.ruleAdmission,
        claimedBody: claim,
        expectedInterpreter,
        expectedAfterContext: context,
      },
      judgment: { theory, context, claim },
    };
    const occurrence = defineStructuralProofOccurrence(memory, act, claim);
    const node: StructuralDerivationNodeEvidence = {
      occurrence,
      judgment,
      derivationRule: pack.derivationRule,
      derivationRuleAdmission: pack.derivationRuleAdmission,
      premiseOccurrenceSequence: materializeExactSequence(memory, premiseOccurrences),
    };
    return { occurrence, node };
  };

  const assume = (claim: LinkHandle) => {
    const context = defineStructuralAssumptionContext(memory, theory, [claim]);
    const occurrence = memory.find(context, claim);
    assert(occurrence !== undefined, "assumption occurrence");
    return { context, occurrence };
  };

  const concreteProof = (
    a: LinkHandle,
    b: LinkHandle,
    c: LinkHandle,
  ) => {
    const assumptions = assume(a);
    const step1 = makeNode(r1, a, b, c, b, [assumptions.occurrence]);
    const step2 = makeNode(r2, a, b, c, c, [step1.occurrence]);
    return { assumptions, step1, step2 };
  };

  const candidateR3Pack: RulePack = {
    rule: r3Rule,
    ruleAdmission: r1.ruleAdmission,
    derivationRule: r3DerivationRule,
    derivationRuleAdmission: r1.derivationRuleAdmission,
  };

  return {
    memory,
    fresh,
    theory,
    concreteProof,
    makeNode,
    candidateR3Pack,
  };
}

const fx = fixture();

// Existing admitted schemas compose for two unrelated concrete substitutions.
const x = fx.fresh();
const bx = fx.fresh();
const cx = fx.fresh();
const xProof = fx.concreteProof(x, bx, cx);
const xResult = replayStructuralDerivationWithAssumptions(fx.memory, {
  derivation: {
    theory: fx.theory,
    targetOccurrence: xProof.step2.occurrence,
    nodes: [xProof.step2.node, xProof.step1.node],
  },
  assumptionContext: xProof.assumptions.context,
});
same(xResult.derivation.target.judgment.claim, cx, "X concrete composition");

const y = fx.fresh();
const by = fx.fresh();
const cy = fx.fresh();
const yProof = fx.concreteProof(y, by, cy);
const yResult = replayStructuralDerivationWithAssumptions(fx.memory, {
  derivation: {
    theory: fx.theory,
    targetOccurrence: yProof.step2.occurrence,
    nodes: [yProof.step2.node, yProof.step1.node],
  },
  assumptionContext: yProof.assumptions.context,
});
same(yResult.derivation.target.judgment.claim, cy, "Y concrete composition");

// RED: if current P4 structures already carry derived generic abstraction,
// the composed R3 should be reusable without a fresh Theory admission.
const genericAttempt = fx.makeNode(
  fx.candidateR3Pack,
  x,
  bx,
  cx,
  cx,
  [xProof.assumptions.occurrence],
);
const genericResult = replayStructuralDerivationWithAssumptions(fx.memory, {
  derivation: {
    theory: fx.theory,
    targetOccurrence: genericAttempt.occurrence,
    nodes: [genericAttempt.node],
  },
  assumptionContext: xProof.assumptions.context,
});
same(genericResult.derivation.target.judgment.claim, cx, "derived generic R3");
