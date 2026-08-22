import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
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
  if (!condition) throw new Error(`P9a raw implication: ${message}`);
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
  throw new Error(`P9a raw implication: ${code}: expected rejection`);
}

interface Environment {
  readonly expectedInterpreter: StructuralInterpreter;
  readonly interpreter: LinkHandle;
}

interface RuleFixture {
  readonly roleDictionary: LinkHandle;
  readonly rule: LinkHandle;
  readonly ruleAdmission: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly derivationAdmission: LinkHandle;
}

interface BuiltNode {
  readonly occurrence: LinkHandle;
  readonly node: StructuralDerivationNodeEvidence;
}

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
const p = fresh();
const q = fresh();
const r = fresh();

const rawImp = (left: LinkHandle, right: LinkHandle): LinkHandle =>
  memory.ensure(left, right);

function environment(selectedTheory: LinkHandle): Environment {
  const expectedInterpreter: StructuralInterpreter = {
    dictionary,
    grammar,
    theory: selectedTheory,
  };
  return Object.freeze({
    expectedInterpreter,
    interpreter: defineStructuralInterpreter(memory, dictionary, grammar, selectedTheory),
  });
}

const main = environment(theory);
const weak = environment(weakTheory);

function defineRule(
  selectedTheory: LinkHandle,
  roles: readonly LinkHandle[],
  conclusionTemplate: LinkHandle,
  premiseTemplates: readonly LinkHandle[],
): RuleFixture {
  const roleDictionary = defineStructuralRoleDictionary(memory, roles);
  const rule = defineStructuralRule(memory, roleDictionary, conclusionTemplate);
  const ruleAdmission = admitStructuralRule(memory, selectedTheory, rule);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premiseTemplates);
  const derivationAdmission = admitStructuralDerivationRule(memory, selectedTheory, derivationRule);
  return Object.freeze({
    roleDictionary,
    rule,
    ruleAdmission,
    derivationRule,
    derivationAdmission,
  });
}

function node(
  selectedTheory: LinkHandle,
  env: Environment,
  rf: RuleFixture,
  bindings: readonly (readonly [LinkHandle, LinkHandle])[],
  claim: LinkHandle,
  premises: readonly LinkHandle[],
  overrides?: Partial<Pick<RuleFixture, "ruleAdmission" | "derivationAdmission">>,
): BuiltNode {
  const context = defineContext(memory, fresh(), fresh());
  const act = defineActHeader(memory, env.interpreter, rf.roleDictionary, context);
  for (const [role, value] of bindings) defineActField(memory, act, role, value);
  const judgment: StructuralJudgmentEvidence = {
    application: {
      act,
      rule: rf.rule,
      ruleAdmission: overrides?.ruleAdmission ?? rf.ruleAdmission,
      claimedBody: claim,
      expectedInterpreter: env.expectedInterpreter,
      expectedAfterContext: context,
    },
    judgment: { theory: selectedTheory, context, claim },
  };
  const occurrence = defineStructuralProofOccurrence(memory, act, claim);
  return Object.freeze({
    occurrence,
    node: Object.freeze({
      occurrence,
      judgment,
      derivationRule: rf.derivationRule,
      derivationRuleAdmission: overrides?.derivationAdmission ?? rf.derivationAdmission,
      premiseOccurrenceSequence: materializeExactSequence(memory, premises),
    }),
  });
}

function assumptionContext(...claims: LinkHandle[]) {
  const context = defineStructuralAssumptionContext(memory, theory, claims);
  const occurrences = claims.map((claim) => memory.find(context, claim));
  assert(occurrences.every((value) => value !== undefined), "assumption occurrence missing");
  return Object.freeze({ context, occurrences: occurrences as LinkHandle[] });
}

const rootRole = fresh();
const root = defineRule(theory, [rootRole], rootRole, []);
function proveRoot(claim: LinkHandle): BuiltNode {
  return node(theory, main, root, [[rootRole, claim]], claim, []);
}

// Raw Pair(P,Q) is interpreted as implication only by this admitted Theory rule.
const mp = defineRule(
  theory,
  [pRole, qRole],
  qRole,
  [pRole, rawImp(pRole, qRole)],
);

function mpNode(
  selectedTheory: LinkHandle,
  env: Environment,
  selectedP: LinkHandle,
  selectedQ: LinkHandle,
  premises: readonly LinkHandle[],
  overrides?: Partial<Pick<RuleFixture, "ruleAdmission" | "derivationAdmission">>,
): BuiltNode {
  return node(
    selectedTheory,
    env,
    mp,
    [[pRole, selectedP], [qRole, selectedQ]],
    selectedQ,
    premises,
    overrides,
  );
}

// Positive: Γ=[P,Pair(P,Q)] derives Q, and the same structural rule substitutes P2/Q2.
{
  const a = assumptionContext(p, rawImp(p, q));
  const target = mpNode(theory, main, p, q, a.occurrences);
  const before = memory.linkCount;
  const result = replayStructuralDerivationWithAssumptions(memory, {
    derivation: { theory, targetOccurrence: target.occurrence, nodes: [target.node] },
    assumptionContext: a.context,
  });
  same(result.derivation.target.judgment.claim, q, "raw Pair MP conclusion");
  same(result.usedAssumptionOccurrences.length, 2, "raw Pair MP premise count");
  same(memory.linkCount, before, "raw Pair MP replay read-only");

  const p2 = fresh();
  const q2 = fresh();
  const b = assumptionContext(p2, rawImp(p2, q2));
  const target2 = mpNode(theory, main, p2, q2, b.occurrences);
  same(target2.node.judgment.application.rule, mp.rule, "same MP rule across substitutions");
  same(replayStructuralDerivationWithAssumptions(memory, {
    derivation: { theory, targetOccurrence: target2.occurrence, nodes: [target2.node] },
    assumptionContext: b.context,
  }).derivation.target.judgment.claim, q2, "second raw Pair MP conclusion");
}

// Mixed proven/assumed premises and proof-carrying theorem expansion remain generic.
{
  const provenP = proveRoot(p);
  const a = assumptionContext(rawImp(p, q));
  const target = mpNode(theory, main, p, q, [provenP.occurrence, a.occurrences[0]!]);
  same(replayStructuralDerivationWithAssumptions(memory, {
    derivation: { theory, targetOccurrence: target.occurrence, nodes: [target.node, provenP.node] },
    assumptionContext: a.context,
  }).derivation.target.judgment.claim, q, "mixed raw Pair MP");

  const theoremProof = proveRoot(p);
  const implicationProof = proveRoot(rawImp(p, q));
  const theorem = defineStructuralTheorem(memory, p, theory);
  const theoremTarget = mpNode(
    theory,
    main,
    p,
    q,
    [theoremProof.occurrence, implicationProof.occurrence],
  );
  const before = memory.linkCount;
  const reused = replayStructuralDerivationWithTheorems(memory, {
    derivation: {
      theory,
      targetOccurrence: theoremTarget.occurrence,
      nodes: [theoremTarget.node, implicationProof.node],
    },
    theorems: [{
      theorem,
      proof: { theory, targetOccurrence: theoremProof.occurrence, nodes: [theoremProof.node] },
    }],
  });
  same(reused.derivation.target.judgment.claim, q, "theorem-carried raw Pair MP");
  same(memory.linkCount, before, "theorem-carried raw Pair MP replay read-only");
}

// Host order is transport only.
{
  const pProof = proveRoot(p);
  const impProof = proveRoot(rawImp(p, q));
  const target = mpNode(theory, main, p, q, [pProof.occurrence, impProof.occurrence]);
  const replay = (nodes: StructuralDerivationNodeEvidence[]) =>
    replayStructuralDerivation(memory, { theory, targetOccurrence: target.occurrence, nodes })
      .target.judgment.claim;
  same(
    replay([target.node, impProof.node, pProof.node]),
    replay([pProof.node, target.node, impProof.node]),
    "host order has no implication authority",
  );
}

// Raw Pair structure alone grants no logical authority outside the selected Theory.
{
  const weakTarget = mpNode(weakTheory, weak, p, q, []);
  const hostLabelled = {
    ...weakTarget.node,
    logicalPrinciple: "implication",
    judgment: {
      ...weakTarget.node.judgment,
      application: { ...weakTarget.node.judgment.application, ruleKind: "modusPonens" },
    },
  };
  expectError(StructuralDerivationReplayError, "invalid-node-judgment", () =>
    replayStructuralDerivation(memory, {
      theory: weakTheory,
      targetOccurrence: weakTarget.occurrence,
      nodes: [hostLabelled],
    }),
  );
}

// Missing, wrong-consequent, and reversed raw Links cannot satisfy the admitted premise templates.
{
  const valid = assumptionContext(p, rawImp(p, q));
  for (const premises of [[valid.occurrences[0]!], [valid.occurrences[1]!]]) {
    const target = mpNode(theory, main, p, q, premises);
    expectError(StructuralAssumptionReplayError, "invalid-assumption-derivation", () =>
      replayStructuralDerivationWithAssumptions(memory, {
        derivation: { theory, targetOccurrence: target.occurrence, nodes: [target.node] },
        assumptionContext: valid.context,
      }),
    );
  }

  for (const wrong of [rawImp(p, r), rawImp(q, p)]) {
    const a = assumptionContext(p, wrong);
    const target = mpNode(theory, main, p, q, a.occurrences);
    expectError(StructuralAssumptionReplayError, "invalid-assumption-derivation", () =>
      replayStructuralDerivationWithAssumptions(memory, {
        derivation: { theory, targetOccurrence: target.occurrence, nodes: [target.node] },
        assumptionContext: a.context,
      }),
    );
  }
}

// Critical discharge probe. Q genuinely depends on assumption P.
const deriveQFromP = defineRule(theory, [pRole, qRole], qRole, [pRole]);
const pairIntroShape = defineRule(
  theory,
  [pRole, qRole],
  rawImp(pRole, qRole),
  [qRole],
);
{
  const scoped = assumptionContext(p);
  const qFromP = node(
    theory,
    main,
    deriveQFromP,
    [[pRole, p], [qRole, q]],
    q,
    [scoped.occurrences[0]!],
  );
  const pairClaim = rawImp(p, q);
  const pairNode = node(
    theory,
    main,
    pairIntroShape,
    [[pRole, p], [qRole, q]],
    pairClaim,
    [qFromP.occurrence],
  );
  const conditional = {
    theory,
    targetOccurrence: pairNode.occurrence,
    nodes: [pairNode.node, qFromP.node],
  } as const;

  const before = memory.linkCount;
  const acceptedConditional = replayStructuralDerivationWithAssumptions(memory, {
    derivation: conditional,
    assumptionContext: scoped.context,
  });
  same(acceptedConditional.derivation.target.judgment.claim, pairClaim, "pair-shaped conditional result");
  same(acceptedConditional.usedAssumptionOccurrences.length, 1, "P remains an actual dependency");
  same(acceptedConditional.usedAssumptionOccurrences[0], scoped.occurrences[0], "P was not discharged");
  same(memory.linkCount, before, "conditional pair-shaped replay read-only");

  const empty = assumptionContext();
  expectError(StructuralAssumptionReplayError, "dependency-not-resolved", () =>
    replayStructuralDerivationWithAssumptions(memory, {
      derivation: conditional,
      assumptionContext: empty.context,
    }),
  );

  // A Pair-shaped conclusion produced under P cannot become an unconditional theorem.
  const theorem = defineStructuralTheorem(memory, pairClaim, theory);
  expectError(StructuralTheoremReplayError, "invalid-theorem-proof", () =>
    replayStructuralTheorem(memory, { theorem, proof: conditional }),
  );
}

const P9A_RAW_LINK_ELIMINATION_SUPPORTED = true;
const P9A_ASSUMPTION_DISCHARGE_SUPPORTED = false;
const P9A_TAGGED_CARRIER_REQUIRED_FOR_ELIMINATION = false;
assert(P9A_RAW_LINK_ELIMINATION_SUPPORTED, "raw Link implication elimination classification");
assert(!P9A_ASSUMPTION_DISCHARGE_SUPPORTED, "current P3b has no assumption discharge evidence");
assert(!P9A_TAGGED_CARRIER_REQUIRED_FOR_ELIMINATION, "tagged carrier is not required for tested elimination");
