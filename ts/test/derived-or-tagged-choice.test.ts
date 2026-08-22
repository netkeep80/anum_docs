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
  admitStructuralDerivationRule,
  defineStructuralAssumptionContext,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  defineStructuralTheorem,
  replayStructuralDerivation,
  replayStructuralDerivationWithAssumptions,
  replayStructuralDerivationWithTheorems,
  type StructuralDerivationNodeEvidence,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`P9c OR choice: ${message}`);
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
  throw new Error(`P9c OR choice: ${code}: expected rejection`);
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
const orTag = fresh();
const foreignOrTag = fresh();
const andTag = fresh();
const pRole = fresh();
const qRole = fresh();
const rRole = fresh();
const rootRole = fresh();
const p = fresh();
const q = fresh();
const r = fresh();
const s = fresh();

const pair = (left: LinkHandle, right: LinkHandle): LinkHandle => memory.ensure(left, right);
const or = (left: LinkHandle, right: LinkHandle, tag = orTag): LinkHandle =>
  memory.ensure(tag, pair(left, right));
const and = (left: LinkHandle, right: LinkHandle): LinkHandle =>
  memory.ensure(andTag, pair(left, right));

function environment(selectedTheory: LinkHandle): Environment {
  const expectedInterpreter: StructuralInterpreter = { dictionary, grammar, theory: selectedTheory };
  return Object.freeze({
    expectedInterpreter,
    interpreter: defineStructuralInterpreter(memory, dictionary, grammar, selectedTheory),
  });
}
const main = environment(theory);
const weak = environment(weakTheory);

function fixture(
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
  return Object.freeze({ roleDictionary, rule, ruleAdmission, derivationRule, derivationAdmission });
}

function node(
  selectedTheory: LinkHandle,
  env: Environment,
  rf: RuleFixture,
  bindings: readonly (readonly [LinkHandle, LinkHandle])[],
  claim: LinkHandle,
  premises: readonly LinkHandle[],
  ruleAdmission = rf.ruleAdmission,
): BuiltNode {
  const context = defineContext(memory, fresh(), fresh());
  const act = defineActHeader(memory, env.interpreter, rf.roleDictionary, context);
  for (const [role, value] of bindings) defineActField(memory, act, role, value);
  const judgment: StructuralJudgmentEvidence = {
    application: {
      act,
      rule: rf.rule,
      ruleAdmission,
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
      derivationRuleAdmission: rf.derivationAdmission,
      premiseOccurrenceSequence: materializeExactSequence(memory, premises),
    }),
  });
}

function assumptions(...claims: LinkHandle[]) {
  const context = defineStructuralAssumptionContext(memory, theory, claims);
  const occurrences = claims.map((claim) => memory.find(context, claim));
  assert(occurrences.every((value) => value !== undefined), "assumption occurrence missing");
  return Object.freeze({ context, occurrences: occurrences as LinkHandle[] });
}

const root = fixture(theory, [rootRole], rootRole, []);
const prove = (claim: LinkHandle): BuiltNode => node(theory, main, root, [[rootRole, claim]], claim, []);

// One proposition rule, two structurally distinct introduction derivation rules.
const orRoles = defineStructuralRoleDictionary(memory, [pRole, qRole]);
const orRule = defineStructuralRule(memory, orRoles, or(pRole, qRole));
const orRuleAdmission = admitStructuralRule(memory, theory, orRule);
const orLeftDerivationRule = defineStructuralDerivationRule(memory, orRule, [pRole]);
const orRightDerivationRule = defineStructuralDerivationRule(memory, orRule, [qRole]);
const orLeft: RuleFixture = Object.freeze({
  roleDictionary: orRoles,
  rule: orRule,
  ruleAdmission: orRuleAdmission,
  derivationRule: orLeftDerivationRule,
  derivationAdmission: admitStructuralDerivationRule(memory, theory, orLeftDerivationRule),
});
const orRight: RuleFixture = Object.freeze({
  roleDictionary: orRoles,
  rule: orRule,
  ruleAdmission: orRuleAdmission,
  derivationRule: orRightDerivationRule,
  derivationAdmission: admitStructuralDerivationRule(memory, theory, orRightDerivationRule),
});
assert(orLeft.rule === orRight.rule, "LEFT/RIGHT must prove one Or proposition schema");
assert(orLeft.derivationRule !== orRight.derivationRule, "LEFT/RIGHT proof evidence must differ structurally");

const introNode = (
  rf: RuleFixture,
  selectedP: LinkHandle,
  selectedQ: LinkHandle,
  premises: readonly LinkHandle[],
) => node(
  theory,
  main,
  rf,
  [[pRole, selectedP], [qRole, selectedQ]],
  or(selectedP, selectedQ),
  premises,
);

const caseRule = fixture(
  theory,
  [pRole, qRole, rRole],
  rRole,
  [or(pRole, qRole), pair(pRole, rRole), pair(qRole, rRole)],
);
const caseNode = (
  selectedP: LinkHandle,
  selectedQ: LinkHandle,
  selectedR: LinkHandle,
  premises: readonly LinkHandle[],
) => node(
  theory,
  main,
  caseRule,
  [[pRole, selectedP], [qRole, selectedQ], [rRole, selectedR]],
  selectedR,
  premises,
);

// LEFT and RIGHT establish the same Or(P,Q), but exact dependency/rule history differs.
{
  const scope = assumptions(p, q);
  const left = introNode(orLeft, p, q, [scope.occurrences[0]!]);
  const right = introNode(orRight, p, q, [scope.occurrences[1]!]);
  const leftResult = replayStructuralDerivationWithAssumptions(memory, {
    derivation: { theory, targetOccurrence: left.occurrence, nodes: [left.node] },
    assumptionContext: scope.context,
  });
  const rightResult = replayStructuralDerivationWithAssumptions(memory, {
    derivation: { theory, targetOccurrence: right.occurrence, nodes: [right.node] },
    assumptionContext: scope.context,
  });
  same(leftResult.derivation.target.judgment.claim, or(p, q), "LEFT claim");
  same(rightResult.derivation.target.judgment.claim, or(p, q), "RIGHT claim");
  same(leftResult.usedAssumptionOccurrences[0], scope.occurrences[0], "LEFT uses P occurrence");
  same(rightResult.usedAssumptionOccurrences[0], scope.occurrences[1], "RIGHT uses Q occurrence");

  const p2 = fresh();
  const q2 = fresh();
  const scope2 = assumptions(p2, q2);
  const left2 = introNode(orLeft, p2, q2, [scope2.occurrences[0]!]);
  const right2 = introNode(orRight, p2, q2, [scope2.occurrences[1]!]);
  same(
    replayStructuralDerivationWithAssumptions(memory, {
      derivation: { theory, targetOccurrence: left2.occurrence, nodes: [left2.node] },
      assumptionContext: scope2.context,
    }).derivation.target.judgment.claim,
    or(p2, q2),
    "LEFT schema substitutes",
  );
  same(
    replayStructuralDerivationWithAssumptions(memory, {
      derivation: { theory, targetOccurrence: right2.occurrence, nodes: [right2.node] },
      assumptionContext: scope2.context,
    }).derivation.target.judgment.claim,
    or(p2, q2),
    "RIGHT schema substitutes",
  );
}

// Case elimination works for either introduction branch with explicit implication premises.
const pProof = prove(p);
const qProof = prove(q);
const pToR = prove(pair(p, r));
const qToR = prove(pair(q, r));
const leftOr = introNode(orLeft, p, q, [pProof.occurrence]);
const rightOr = introNode(orRight, p, q, [qProof.occurrence]);
{
  const leftCase = caseNode(p, q, r, [leftOr.occurrence, pToR.occurrence, qToR.occurrence]);
  const rightCase = caseNode(p, q, r, [rightOr.occurrence, pToR.occurrence, qToR.occurrence]);
  same(
    replayStructuralDerivation(memory, {
      theory,
      targetOccurrence: leftCase.occurrence,
      nodes: [leftCase.node, qToR.node, leftOr.node, pToR.node, pProof.node],
    }).target.judgment.claim,
    r,
    "case after LEFT",
  );
  same(
    replayStructuralDerivation(memory, {
      theory,
      targetOccurrence: rightCase.occurrence,
      nodes: [qProof.node, rightCase.node, pToR.node, rightOr.node, qToR.node],
    }).target.judgment.claim,
    r,
    "case after RIGHT / host order irrelevant",
  );
}

// OR theorem reuse expands the branch proof through the existing P3a path.
{
  const theorem = defineStructuralTheorem(memory, or(p, q), theory);
  const target = caseNode(p, q, r, [leftOr.occurrence, pToR.occurrence, qToR.occurrence]);
  const before = memory.linkCount;
  const result = replayStructuralDerivationWithTheorems(memory, {
    derivation: {
      theory,
      targetOccurrence: target.occurrence,
      nodes: [target.node, pToR.node, qToR.node],
    },
    theorems: [{
      theorem,
      proof: { theory, targetOccurrence: leftOr.occurrence, nodes: [leftOr.node, pProof.node] },
    }],
  });
  same(result.derivation.target.judgment.claim, r, "theorem-carried OR case");
  same(memory.linkCount, before, "theorem case replay read-only");
}

// Wrong/missing introduction branch evidence rejects; host labels cannot repair it.
{
  const scope = assumptions(p, q);
  for (const [rf, premises] of [
    [orLeft, [scope.occurrences[1]!]],
    [orRight, [scope.occurrences[0]!]],
    [orLeft, []],
  ] as const) {
    const target = introNode(rf, p, q, premises);
    const hostLabelled = { ...target.node, branch: rf === orLeft ? "left" : "right", logicalPrinciple: "or" };
    expectError(StructuralAssumptionReplayError, "invalid-assumption-derivation", () =>
      replayStructuralDerivationWithAssumptions(memory, {
        derivation: { theory, targetOccurrence: target.occurrence, nodes: [hostLabelled] },
        assumptionContext: scope.context,
      }),
    );
  }
}

// Raw Pair, AND, and foreign OrTag cannot impersonate the selected OR carrier.
{
  for (const impostor of [pair(p, q), and(p, q), or(p, q, foreignOrTag)]) {
    const fakeOr = prove(impostor);
    const target = caseNode(p, q, r, [fakeOr.occurrence, pToR.occurrence, qToR.occurrence]);
    expectError(StructuralDerivationReplayError, "premise-claim-mismatch", () =>
      replayStructuralDerivation(memory, {
        theory,
        targetOccurrence: target.occurrence,
        nodes: [target.node, fakeOr.node, pToR.node, qToR.node],
      }),
    );
  }
}

// Missing case branch evidence and wrong implication shapes fail closed.
{
  for (const premises of [
    [leftOr.occurrence, pToR.occurrence],
    [leftOr.occurrence, qToR.occurrence],
  ]) {
    const target = caseNode(p, q, r, premises);
    expectError(StructuralDerivationReplayError, "missing-premise", () =>
      replayStructuralDerivation(memory, {
        theory,
        targetOccurrence: target.occurrence,
        nodes: [target.node, leftOr.node, pProof.node, pToR.node, qToR.node],
      }),
    );
  }

  for (const wrongClaim of [pair(p, s), pair(q, s), pair(r, p)]) {
    const wrong = prove(wrongClaim);
    const target = caseNode(p, q, r, [leftOr.occurrence, wrong.occurrence, qToR.occurrence]);
    expectError(StructuralDerivationReplayError, "premise-claim-mismatch", () =>
      replayStructuralDerivation(memory, {
        theory,
        targetOccurrence: target.occurrence,
        nodes: [target.node, leftOr.node, pProof.node, wrong.node, qToR.node],
      }),
    );
  }
}

// Wrong Theory/admission and forged bindings/conclusion reject through generic replay.
{
  const weakTarget = node(
    weakTheory,
    weak,
    orLeft,
    [[pRole, p], [qRole, q]],
    or(p, q),
    [pProof.occurrence],
  );
  expectError(StructuralDerivationReplayError, "invalid-node-judgment", () =>
    replayStructuralDerivation(memory, {
      theory: weakTheory,
      targetOccurrence: weakTarget.occurrence,
      nodes: [weakTarget.node, pProof.node],
    }),
  );

  const forged = node(
    theory,
    main,
    caseRule,
    [[pRole, p], [qRole, q], [rRole, s]],
    r,
    [leftOr.occurrence, pToR.occurrence, qToR.occurrence],
  );
  expectError(StructuralDerivationReplayError, "invalid-node-judgment", () =>
    replayStructuralDerivation(memory, {
      theory,
      targetOccurrence: forged.occurrence,
      nodes: [forged.node, leftOr.node, pProof.node, pToR.node, qToR.node],
    }),
  );
}

// Read-only replay detects injected writes.
{
  const scope = assumptions(p, q);
  const target = introNode(orLeft, p, q, [scope.occurrences[0]!]);
  let injected = false;
  const malicious: ReadMemory = {
    get root() { return memory.root; },
    get linkCount() { return memory.linkCount; },
    poles(link) { return memory.poles(link); },
    find(start, end) {
      if (!injected) {
        injected = true;
        memory.ensure(fresh(), fresh());
      }
      return memory.find(start, end);
    },
    outgoing(start) { return memory.outgoing(start); },
    incoming(end) { return memory.incoming(end); },
  };
  expectError(StructuralAssumptionReplayError, "assumption-replay-wrote", () =>
    replayStructuralDerivationWithAssumptions(malicious, {
      derivation: { theory, targetOccurrence: target.occurrence, nodes: [target.node] },
      assumptionContext: scope.context,
    }),
  );
}

const PROOF_RELEVANT_OR_TAGGED_CHOICE_SUPPORTED = true;
const OR_SPECIFIC_TRUSTED_CODE_REQUIRED = false;
assert(PROOF_RELEVANT_OR_TAGGED_CHOICE_SUPPORTED, "P9c classification");
assert(!OR_SPECIFIC_TRUSTED_CODE_REQUIRED, "P9c trusted-code boundary");
