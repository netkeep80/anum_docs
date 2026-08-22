import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
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
  type StructuralDerivationNodeEvidence,
  type StructuralDerivationWithAssumptionsEvidence,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";
import {
  StructuralScopedDerivationReplayError,
  replayStructuralScopedDerivation,
  type StructuralScopedDerivationEvidence,
} from "../src/scoped-derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`P9a1 scoped discharge: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function sameJson(actual: unknown, expected: unknown, message: string): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
  );
}

function reject(
  code: InstanceType<typeof StructuralScopedDerivationReplayError>["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralScopedDerivationReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`P9a1 scoped discharge: ${code}: expected rejection`);
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

interface Assumptions {
  readonly context: LinkHandle;
  readonly occurrences: readonly LinkHandle[];
}

const memory = new Memory();
const { R, U } = ensureRootBasis(memory);
let cursor = U;
const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));

const dictionary = fresh();
const grammar = fresh();
const theory = fresh();
const otherTheory = fresh();
const gRole = fresh();
const pRole = fresh();
const qRole = fresh();
const xRole = fresh();
const g = fresh();
const p = fresh();
const q = fresh();
const r = fresh();

const pair = (left: LinkHandle, right: LinkHandle): LinkHandle => memory.ensure(left, right);

function environment(selectedTheory: LinkHandle): Environment {
  const expectedInterpreter: StructuralInterpreter = { dictionary, grammar, theory: selectedTheory };
  return Object.freeze({
    expectedInterpreter,
    interpreter: defineStructuralInterpreter(memory, dictionary, grammar, selectedTheory),
  });
}

const main = environment(theory);

function defineRule(
  roles: readonly LinkHandle[],
  conclusionTemplate: LinkHandle,
  premiseTemplates: readonly LinkHandle[],
): RuleFixture {
  const roleDictionary = defineStructuralRoleDictionary(memory, roles);
  const rule = defineStructuralRule(memory, roleDictionary, conclusionTemplate);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premiseTemplates);
  const derivationAdmission = admitStructuralDerivationRule(memory, theory, derivationRule);
  return Object.freeze({ roleDictionary, rule, ruleAdmission, derivationRule, derivationAdmission });
}

function node(
  rf: RuleFixture,
  bindings: readonly (readonly [LinkHandle, LinkHandle])[],
  claim: LinkHandle,
  premises: readonly LinkHandle[],
): BuiltNode {
  const context = defineContext(memory, fresh(), fresh());
  const act = defineActHeader(memory, main.interpreter, rf.roleDictionary, context);
  for (const [role, value] of bindings) defineActField(memory, act, role, value);
  const judgment: StructuralJudgmentEvidence = {
    application: {
      act,
      rule: rf.rule,
      ruleAdmission: rf.ruleAdmission,
      claimedBody: claim,
      expectedInterpreter: main.expectedInterpreter,
      expectedAfterContext: context,
    },
    judgment: { theory, context, claim },
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

function assumptions(...claims: LinkHandle[]): Assumptions {
  const context = defineStructuralAssumptionContext(memory, theory, claims);
  const occurrences = claims.map((claim) => memory.find(context, claim));
  assert(occurrences.every((value) => value !== undefined), "assumption occurrence missing");
  return Object.freeze({ context, occurrences: occurrences as LinkHandle[] });
}

function innerEvidence(
  scope: Assumptions,
  target: BuiltNode,
  nodes: readonly BuiltNode[],
): StructuralDerivationWithAssumptionsEvidence {
  return Object.freeze({
    derivation: Object.freeze({
      theory,
      targetOccurrence: target.occurrence,
      nodes: Object.freeze(nodes.map((value) => value.node)),
    }),
    assumptionContext: scope.context,
  });
}

function conclusionEvidence(
  rf: RuleFixture,
  bindings: readonly (readonly [LinkHandle, LinkHandle])[],
  claim: LinkHandle,
  inner: StructuralDerivationWithAssumptionsEvidence,
  outerAssumptionContext: LinkHandle,
): StructuralScopedDerivationEvidence {
  const context = defineContext(memory, fresh(), fresh());
  const act = defineActHeader(memory, main.interpreter, rf.roleDictionary, context);
  for (const [role, value] of bindings) defineActField(memory, act, role, value);
  const conclusion: StructuralJudgmentEvidence = {
    application: {
      act,
      rule: rf.rule,
      ruleAdmission: rf.ruleAdmission,
      claimedBody: claim,
      expectedInterpreter: main.expectedInterpreter,
      expectedAfterContext: context,
    },
    judgment: { theory, context, claim },
  };
  return Object.freeze({
    theory,
    outerAssumptionContext,
    inner,
    conclusionOccurrence: defineStructuralProofOccurrence(memory, act, claim),
    conclusion,
    derivationRule: rf.derivationRule,
    derivationRuleAdmission: rf.derivationAdmission,
  });
}

const deriveQFromP = defineRule([pRole, qRole], qRole, [pRole]);
const deriveQFromGP = defineRule([gRole, pRole, qRole], qRole, [gRole, pRole]);
const deriveXFromG = defineRule([gRole, xRole], xRole, [gRole]);
const deriveQFromXP = defineRule([xRole, pRole, qRole], qRole, [xRole, pRole]);

// The scoped conclusion is ordinary Theory data. Its premises are the exact
// local suffix followed by the verified inner target; the kernel does not know
// that this fixture can be read as implication introduction.
const scopedPair = defineRule(
  [pRole, qRole],
  pair(pRole, qRole),
  [pRole, qRole],
);

function oneLocalEvidence(
  selectedP: LinkHandle,
  selectedQ: LinkHandle,
): StructuralScopedDerivationEvidence {
  const outer = assumptions();
  const innerScope = assumptions(selectedP);
  const target = node(
    deriveQFromP,
    [[pRole, selectedP], [qRole, selectedQ]],
    selectedQ,
    [innerScope.occurrences[0]!],
  );
  return conclusionEvidence(
    scopedPair,
    [[pRole, selectedP], [qRole, selectedQ]],
    pair(selectedP, selectedQ),
    innerEvidence(innerScope, target, [target]),
    outer.context,
  );
}

// Γ=[] and Δ=[P]: exactly P disappears, while Q remains the inner target.
{
  const evidence = oneLocalEvidence(p, q);
  const before = memory.linkCount;
  const result = replayStructuralScopedDerivation(memory, evidence);
  same(result.conclusion.judgment.claim, pair(p, q), "single-local conclusion");
  sameJson(result.localAssumptionClaims, [p], "single local suffix");
  same(result.localAssumptionOccurrences.length, 1, "single local occurrence");
  same(result.usedOuterAssumptionOccurrences.length, 0, "empty outer Γ stays empty");
  same(memory.linkCount, before, "single-local replay is read-only");
}

// The same generic scoped rule supports a second substitution instance.
{
  const p2 = fresh();
  const q2 = fresh();
  const result = replayStructuralScopedDerivation(memory, oneLocalEvidence(p2, q2));
  same(result.conclusion.judgment.claim, pair(p2, q2), "second substitution conclusion");
  sameJson(result.localAssumptionClaims, [p2], "second substitution local suffix");
}

// Γ=[G], Δ=[P]: G is preserved as an outer dependency; only P is local.
{
  const outer = assumptions(g);
  const innerScope = assumptions(g, p);
  const target = node(
    deriveQFromGP,
    [[gRole, g], [pRole, p], [qRole, q]],
    q,
    [innerScope.occurrences[0]!, innerScope.occurrences[1]!],
  );
  const evidence = conclusionEvidence(
    scopedPair,
    [[pRole, p], [qRole, q]],
    pair(p, q),
    innerEvidence(innerScope, target, [target]),
    outer.context,
  );
  const result = replayStructuralScopedDerivation(memory, evidence);
  sameJson(result.localAssumptionClaims, [p], "P is the exact local suffix");
  same(result.usedOuterAssumptionOccurrences.length, 1, "G remains an outer dependency");
  same(result.usedOuterAssumptionOccurrences[0], outer.occurrences[0], "G maps to outer occurrence");
}

// Multi-step inner DAG remains governed by P2 and is independent of host node order.
{
  const outer = assumptions(g);
  const innerScope = assumptions(g, p);
  const x = fresh();
  const first = node(
    deriveXFromG,
    [[gRole, g], [xRole, x]],
    x,
    [innerScope.occurrences[0]!],
  );
  const target = node(
    deriveQFromXP,
    [[xRole, x], [pRole, p], [qRole, q]],
    q,
    [first.occurrence, innerScope.occurrences[1]!],
  );
  const make = (nodes: readonly BuiltNode[]) => conclusionEvidence(
    scopedPair,
    [[pRole, p], [qRole, q]],
    pair(p, q),
    innerEvidence(innerScope, target, nodes),
    outer.context,
  );
  const left = replayStructuralScopedDerivation(memory, make([target, first]));
  const right = replayStructuralScopedDerivation(memory, make([first, target]));
  same(left.conclusion.judgment.claim, right.conclusion.judgment.claim, "host order is transport only");
  sameJson(left.usedOuterAssumptionOccurrences, right.usedOuterAssumptionOccurrences, "outer usage is order independent");
}

const canonical = oneLocalEvidence(p, q);

// Host labels are inert: only structural contexts/rules/evidence have authority.
{
  const labelled = {
    ...canonical,
    implicationIntroduction: true,
    discharge: "P",
  };
  const before = memory.linkCount;
  same(
    replayStructuralScopedDerivation(memory, labelled).conclusion.judgment.claim,
    pair(p, q),
    "host metadata cannot select scoped semantics",
  );
  same(memory.linkCount, before, "host-labelled replay is read-only");
}

// Wrong selected Theory fails before any scoped interpretation.
reject("theory-mismatch", () => replayStructuralScopedDerivation(memory, {
  ...canonical,
  theory: otherTheory,
}));

// Outer Γ must be an exact prefix of the inner structural assumption sequence.
{
  const wrongOuter = assumptions(p);
  const innerScope = assumptions(g, p);
  const target = node(
    deriveQFromGP,
    [[gRole, g], [pRole, p], [qRole, q]],
    q,
    [innerScope.occurrences[0]!, innerScope.occurrences[1]!],
  );
  const evidence = conclusionEvidence(
    scopedPair,
    [[pRole, p], [qRole, q]],
    pair(p, q),
    innerEvidence(innerScope, target, [target]),
    wrongOuter.context,
  );
  reject("inner-scope-not-exact-extension", () => replayStructuralScopedDerivation(memory, evidence));
}

// A claim in outer Γ is not local and therefore cannot be silently discharged.
{
  const outer = assumptions(p);
  const innerScope = assumptions(p);
  const target = node(
    deriveQFromP,
    [[pRole, p], [qRole, q]],
    q,
    [innerScope.occurrences[0]!],
  );
  const evidence = conclusionEvidence(
    scopedPair,
    [[pRole, p], [qRole, q]],
    pair(p, q),
    innerEvidence(innerScope, target, [target]),
    outer.context,
  );
  reject("scoped-premise-count-mismatch", () => replayStructuralScopedDerivation(memory, evidence));
}

// An extra inner suffix assumption is explicit local evidence and therefore
// cannot vanish unless the admitted scoped rule has a matching extra template.
{
  const outer = assumptions();
  const innerScope = assumptions(p, r);
  const target = node(
    deriveQFromP,
    [[pRole, p], [qRole, q]],
    q,
    [innerScope.occurrences[0]!],
  );
  const evidence = conclusionEvidence(
    scopedPair,
    [[pRole, p], [qRole, q]],
    pair(p, q),
    innerEvidence(innerScope, target, [target]),
    outer.context,
  );
  reject("scoped-premise-count-mismatch", () => replayStructuralScopedDerivation(memory, evidence));
}

// Wrong inner target cannot satisfy the scoped premise template selected by the conclusion bindings.
{
  const outer = assumptions();
  const innerScope = assumptions(p);
  const target = node(
    deriveQFromP,
    [[pRole, p], [qRole, r]],
    r,
    [innerScope.occurrences[0]!],
  );
  const evidence = conclusionEvidence(
    scopedPair,
    [[pRole, p], [qRole, q]],
    pair(p, q),
    innerEvidence(innerScope, target, [target]),
    outer.context,
  );
  reject("scoped-premise-claim-mismatch", () => replayStructuralScopedDerivation(memory, evidence));
}

// Forging the ordinary conclusion is rejected by the existing StructuralJudgment replay.
{
  const forged = {
    ...canonical,
    conclusion: {
      ...canonical.conclusion,
      application: { ...canonical.conclusion.application, claimedBody: r },
      judgment: { ...canonical.conclusion.judgment, claim: r },
    },
  };
  reject("invalid-conclusion", () => replayStructuralScopedDerivation(memory, forged));
}

// The scoped derivation rule itself must be the rule for the ordinary conclusion and be admitted.
{
  const fakeAdmission = memory.ensure(theory, fresh());
  reject("derivation-rule-not-admitted", () => replayStructuralScopedDerivation(memory, {
    ...canonical,
    derivationRuleAdmission: fakeAdmission,
  }));

  reject("derivation-rule-mismatch", () => replayStructuralScopedDerivation(memory, {
    ...canonical,
    derivationRule: deriveQFromP.derivationRule,
    derivationRuleAdmission: deriveQFromP.derivationAdmission,
  }));
}

// Even a rule with the same conclusion shape cannot accept the wrong scoped premise template.
{
  const wrongPremises = defineRule(
    [pRole, qRole],
    pair(pRole, qRole),
    [qRole, qRole],
  );
  const evidence = conclusionEvidence(
    wrongPremises,
    [[pRole, p], [qRole, q]],
    pair(p, q),
    canonical.inner,
    canonical.outerAssumptionContext,
  );
  reject("scoped-premise-claim-mismatch", () => replayStructuralScopedDerivation(memory, evidence));
}

// Missing inner DAG dependency remains a P2/P3b failure and is wrapped fail-closed.
{
  const innerScope = assumptions(p);
  const unknownOccurrence = fresh();
  const target = node(
    deriveQFromP,
    [[pRole, p], [qRole, q]],
    q,
    [unknownOccurrence],
  );
  const evidence = conclusionEvidence(
    scopedPair,
    [[pRole, p], [qRole, q]],
    pair(p, q),
    innerEvidence(innerScope, target, [target]),
    assumptions().context,
  );
  reject("invalid-inner-derivation", () => replayStructuralScopedDerivation(memory, evidence));
}

const P9A1_GENERIC_SCOPED_ASSUMPTION_DISCHARGE_SUPPORTED = true;
const P9A1_LOGIC_SPECIFIC_TRUSTED_OPCODE_REQUIRED = false;
assert(P9A1_GENERIC_SCOPED_ASSUMPTION_DISCHARGE_SUPPORTED, "generic scoped discharge classification");
assert(!P9A1_LOGIC_SPECIFIC_TRUSTED_OPCODE_REQUIRED, "no logic-specific trusted opcode is required");
