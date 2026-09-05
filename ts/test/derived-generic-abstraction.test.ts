import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/public.js";
import {
  exportPortableStructuralTheory,
} from "../src/portable-theory.js";
import {
  computePortableStructuralTheoryRevision,
} from "../src/portable-theory-digest.js";
import { defineContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  StructuralRuleError,
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  matchStructuralTemplate,
  replayStructuralRule,
  type StructuralInterpreter,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";
import {
  StructuralAssumptionReplayError,
  StructuralDerivationReplayError,
  admitStructuralDerivationRule,
  defineStructuralAssumptionContext,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  replayStructuralDerivation,
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

function expectRuleError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected StructuralRuleError`);
}

function expectDerivationError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralDerivationReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected StructuralDerivationReplayError`);
}

function expectAssumptionError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralAssumptionReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected StructuralAssumptionReplayError`);
}

interface RuleSchema {
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
}

interface RulePack extends RuleSchema {
  readonly ruleAdmission: LinkHandle;
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
  const foreignTheory = memory.ensure(U, L);
  const probeTheory = memory.ensure(L, R);

  const aRole = fresh();
  const bRole = fresh();
  const cRole = fresh();
  const roleDictionary = defineStructuralRoleDictionary(memory, [aRole, bRole, cRole]);

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
  const probe = environment(probeTheory);

  const defineSchema = (
    conclusionTemplate: LinkHandle,
    premiseTemplates: readonly LinkHandle[],
  ): RuleSchema => {
    const rule = defineStructuralRule(memory, roleDictionary, conclusionTemplate);
    const derivationRule = defineStructuralDerivationRule(memory, rule, premiseTemplates);
    return { rule, derivationRule };
  };

  const admitSchema = (selectedTheory: LinkHandle, schema: RuleSchema): RulePack => ({
    ...schema,
    ruleAdmission: admitStructuralRule(memory, selectedTheory, schema.rule),
    derivationRuleAdmission: admitStructuralDerivationRule(
      memory,
      selectedTheory,
      schema.derivationRule,
    ),
  });

  const r1Schema = defineSchema(bRole, [aRole]);
  const r2Schema = defineSchema(cRole, [bRole]);
  const r3Schema = defineSchema(cRole, [aRole]);
  const r1 = admitSchema(theory, r1Schema);
  const r2 = admitSchema(theory, r2Schema);

  // StructuralRule identity contains the role dictionary and conclusion body,
  // not premise templates. R2 and candidate R3 therefore share one Rule;
  // their different inference authority lives in StructuralDerivationRule.
  same(r3Schema.rule, r2Schema.rule, "R2/R3 share conclusion StructuralRule");
  assert(
    r3Schema.derivationRule !== r2Schema.derivationRule,
    "R2/R3 DerivationRule must differ by premise template",
  );

  const makeNode = (
    selectedTheory: LinkHandle,
    env: ReturnType<typeof environment>,
    pack: RulePack,
    selectedA: LinkHandle,
    selectedB: LinkHandle,
    selectedC: LinkHandle,
    claim: LinkHandle,
    premiseOccurrences: readonly LinkHandle[],
  ) => {
    const context = defineContext(memory, fresh(), fresh());
    const act = defineActHeader(memory, env.interpreter, roleDictionary, context);
    defineActField(memory, act, aRole, selectedA);
    defineActField(memory, act, bRole, selectedB);
    defineActField(memory, act, cRole, selectedC);
    const judgment: StructuralJudgmentEvidence = {
      application: {
        act,
        rule: pack.rule,
        ruleAdmission: pack.ruleAdmission,
        claimedBody: claim,
        expectedInterpreter: env.expectedInterpreter,
        expectedAfterContext: context,
      },
      judgment: { theory: selectedTheory, context, claim },
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

  const assume = (selectedTheory: LinkHandle, claim: LinkHandle) => {
    const context = defineStructuralAssumptionContext(memory, selectedTheory, [claim]);
    const occurrence = memory.find(context, claim);
    assert(occurrence !== undefined, "assumption occurrence");
    return { context, occurrence };
  };

  const concreteProof = (
    a: LinkHandle,
    b: LinkHandle,
    c: LinkHandle,
  ) => {
    const assumptions = assume(theory, a);
    const step1 = makeNode(theory, main, r1, a, b, c, b, [assumptions.occurrence]);
    const step2 = makeNode(theory, main, r2, a, b, c, c, [step1.occurrence]);
    return { assumptions, step1, step2 };
  };

  const candidateR3: RulePack = {
    ...r3Schema,
    // This is a real admission because R3.rule == R2.rule.
    ruleAdmission: r2.ruleAdmission,
    // Intentionally wrong: T0 has no admission for R3.derivationRule yet.
    derivationRuleAdmission: r2.derivationRuleAdmission,
  };

  return {
    memory,
    fresh,
    theory,
    foreignTheory,
    probeTheory,
    main,
    probe,
    aRole,
    bRole,
    cRole,
    roleDictionary,
    r1,
    r2,
    r3Schema,
    candidateR3,
    makeNode,
    assume,
    concreteProof,
  };
}

async function main(): Promise<void> {
  const fx = fixture();

  // Existing admitted schemas compose for two unrelated concrete substitutions.
  const x = fx.fresh();
  const bx = fx.fresh();
  const cx = fx.fresh();
  const xProof = fx.concreteProof(x, bx, cx);
  const beforeX = fx.memory.linkCount;
  const xResult = replayStructuralDerivationWithAssumptions(fx.memory, {
    derivation: {
      theory: fx.theory,
      targetOccurrence: xProof.step2.occurrence,
      nodes: [xProof.step2.node, xProof.step1.node],
    },
    assumptionContext: xProof.assumptions.context,
  });
  same(xResult.derivation.target.judgment.claim, cx, "X concrete composition");
  same(fx.memory.linkCount, beforeX, "X replay read-only");

  const y = fx.fresh();
  const by = fx.fresh();
  const cy = fx.fresh();
  const yProof = fx.concreteProof(y, by, cy);
  const beforeY = fx.memory.linkCount;
  const yResult = replayStructuralDerivationWithAssumptions(fx.memory, {
    derivation: {
      theory: fx.theory,
      targetOccurrence: yProof.step2.occurrence,
      nodes: [yProof.step2.node, yProof.step1.node],
    },
    assumptionContext: yProof.assumptions.context,
  });
  same(yResult.derivation.target.judgment.claim, cy, "Y concrete composition");
  same(fx.memory.linkCount, beforeY, "Y replay read-only");

  // Existing read-only structural unification already infers concrete role values.
  const pairTemplate = fx.memory.ensure(fx.aRole, fx.bRole);
  const pairX = fx.memory.ensure(x, bx);
  const beforeUnify = fx.memory.linkCount;
  const inferred = unifyStructuralTemplate(
    fx.memory,
    pairTemplate,
    pairX,
    [fx.aRole, fx.bRole],
  );
  same(inferred[0]?.value, x, "unify A := X");
  same(inferred[1]?.value, bx, "unify B := BX");
  same(fx.memory.linkCount, beforeUnify, "unification read-only");

  const repeatedTemplate = fx.memory.ensure(fx.aRole, fx.aRole);
  const repeatedGood = fx.memory.ensure(x, x);
  const repeatedBad = fx.memory.ensure(x, y);
  unifyStructuralTemplate(fx.memory, repeatedTemplate, repeatedGood, [fx.aRole]);
  expectRuleError("template-mismatch", () =>
    unifyStructuralTemplate(fx.memory, repeatedTemplate, repeatedBad, [fx.aRole]),
  );

  // Grounded template data never becomes a placeholder by host convention.
  const grounded = fx.fresh();
  const otherGrounded = fx.fresh();
  const bindings: readonly StructuralRoleBinding[] = [
    { role: fx.aRole, value: x },
    { role: fx.bRole, value: bx },
    { role: fx.cRole, value: cx },
  ];
  expectRuleError("template-mismatch", () =>
    matchStructuralTemplate(fx.memory, grounded, otherGrounded, bindings),
  );

  // Candidate R3 can pass ordinary StructuralRule replay because its conclusion
  // Rule is already the admitted R2 Rule. The gap is the new premise schema.
  const genericAttempt = fx.makeNode(
    fx.theory,
    fx.main,
    fx.candidateR3,
    x,
    bx,
    cx,
    cx,
    [xProof.assumptions.occurrence],
  );
  const beforeRuleReplay = fx.memory.linkCount;
  const ruleReplay = replayStructuralRule(
    fx.memory,
    genericAttempt.node.judgment.application,
  );
  same(ruleReplay.rule, fx.r3Schema.rule, "R3 reuses admitted conclusion Rule");
  same(fx.memory.linkCount, beforeRuleReplay, "Rule replay read-only");

  // Two successful concrete samples still cannot authorize the unadmitted DR3.
  expectAssumptionError("invalid-assumption-derivation", () =>
    replayStructuralDerivationWithAssumptions(fx.memory, {
      derivation: {
        theory: fx.theory,
        targetOccurrence: genericAttempt.occurrence,
        nodes: [genericAttempt.node],
      },
      assumptionContext: xProof.assumptions.context,
    }),
  );

  // Direct derivation replay exposes the exact missing authority before premise resolution.
  const probeRuleAdmission = admitStructuralRule(
    fx.memory,
    fx.probeTheory,
    fx.r3Schema.rule,
  );
  const probePack: RulePack = {
    ...fx.r3Schema,
    ruleAdmission: probeRuleAdmission,
    derivationRuleAdmission: fx.r2.derivationRuleAdmission,
  };
  const probeAttempt = fx.makeNode(
    fx.probeTheory,
    fx.probe,
    probePack,
    x,
    bx,
    cx,
    cx,
    [],
  );
  expectDerivationError("derivation-rule-not-admitted", () =>
    replayStructuralDerivation(fx.memory, {
      theory: fx.probeTheory,
      targetOccurrence: probeAttempt.occurrence,
      nodes: [probeAttempt.node],
    }),
  );

  // Host labels cannot turn the same rejected structural evidence into a generic theorem.
  const hostLabelled = {
    ...genericAttempt.node,
    judgment: {
      ...genericAttempt.node.judgment,
      application: {
        ...genericAttempt.node.judgment.application,
        generic: true,
        forall: true,
        derivedRule: true,
        parametric: true,
      },
    },
  };
  expectAssumptionError("invalid-assumption-derivation", () =>
    replayStructuralDerivationWithAssumptions(fx.memory, {
      derivation: {
        theory: fx.theory,
        targetOccurrence: genericAttempt.occurrence,
        nodes: [hostLabelled],
      },
      assumptionContext: xProof.assumptions.context,
    }),
  );

  // Shared B must be the same binding across both steps; mutating it breaks composition.
  const wrongB = fx.fresh();
  const mutatedAssumptions = fx.assume(fx.theory, x);
  const mutatedStep1 = fx.makeNode(
    fx.theory,
    fx.main,
    fx.r1,
    x,
    bx,
    cx,
    bx,
    [mutatedAssumptions.occurrence],
  );
  const mutatedStep2 = fx.makeNode(
    fx.theory,
    fx.main,
    fx.r2,
    x,
    wrongB,
    cx,
    cx,
    [mutatedStep1.occurrence],
  );
  expectAssumptionError("invalid-assumption-derivation", () =>
    replayStructuralDerivationWithAssumptions(fx.memory, {
      derivation: {
        theory: fx.theory,
        targetOccurrence: mutatedStep2.occurrence,
        nodes: [mutatedStep2.node, mutatedStep1.node],
      },
      assumptionContext: mutatedAssumptions.context,
    }),
  );

  // A proof node cannot be replayed under another selected Theory by host relabelling.
  expectDerivationError("cross-theory-node", () =>
    replayStructuralDerivation(fx.memory, {
      theory: fx.foreignTheory,
      targetOccurrence: xProof.step2.occurrence,
      nodes: [xProof.step2.node, xProof.step1.node],
    }),
  );

  // Pin exact T0 before the tempting self-admission repair.
  const pinnedArtifact = exportPortableStructuralTheory(fx.memory, fx.theory);
  const pinnedRevision = await computePortableStructuralTheoryRevision(pinnedArtifact);

  // Self-admitting only the missing DR3 makes the concrete R3 instance replay,
  // but this has strengthened the exact Theory authority from T0 to T'.
  const r3DerivationRuleAdmission = admitStructuralDerivationRule(
    fx.memory,
    fx.theory,
    fx.r3Schema.derivationRule,
  );
  const admittedR3: RulePack = {
    ...fx.r3Schema,
    ruleAdmission: fx.r2.ruleAdmission,
    derivationRuleAdmission: r3DerivationRuleAdmission,
  };
  const admittedAssumptions = fx.assume(fx.theory, x);
  const admittedAttempt = fx.makeNode(
    fx.theory,
    fx.main,
    admittedR3,
    x,
    bx,
    cx,
    cx,
    [admittedAssumptions.occurrence],
  );
  const beforeAdmittedReplay = fx.memory.linkCount;
  const admittedResult = replayStructuralDerivationWithAssumptions(fx.memory, {
    derivation: {
      theory: fx.theory,
      targetOccurrence: admittedAttempt.occurrence,
      nodes: [admittedAttempt.node],
    },
    assumptionContext: admittedAssumptions.context,
  });
  same(admittedResult.derivation.target.judgment.claim, cx, "self-admitted R3 instance");
  same(fx.memory.linkCount, beforeAdmittedReplay, "self-admitted replay read-only");

  const strongerArtifact = exportPortableStructuralTheory(fx.memory, fx.theory);
  const strongerRevision = await computePortableStructuralTheoryRevision(strongerArtifact);
  assert(
    strongerRevision.value !== pinnedRevision.value,
    "adding DR3 admission must change exact Theory revision",
  );
}

void main();
