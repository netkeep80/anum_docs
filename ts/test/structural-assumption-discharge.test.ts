import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory, StructuralScopedDerivationReplayError, ensureRootBasis,
  replayStructuralScopedDerivation, type LinkHandle, type ReadMemory,
  type StructuralScopedDerivationEvidence,
} from "../src/public.js";
import { defineContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  admitStructuralRule, defineStructuralInterpreter, defineStructuralRoleDictionary,
  defineStructuralRule, type StructuralInterpreter,
} from "../src/structural-rule.js";
import {
  admitStructuralDerivationRule, defineStructuralAssumptionContext,
  defineStructuralDerivationRule, defineStructuralProofOccurrence,
  type StructuralDerivationNodeEvidence, type StructuralDerivationWithAssumptionsEvidence,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`P9a1 discharge: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function expectError(code: InstanceType<typeof StructuralScopedDerivationReplayError>["code"], effect: () => unknown): void {
  try { effect(); } catch (error) {
    assert(error instanceof StructuralScopedDerivationReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`); return;
  }
  throw new Error(`P9a1 discharge: ${code}: expected rejection`);
}

interface Environment { readonly interpreter: LinkHandle; readonly expectedInterpreter: StructuralInterpreter; }
interface RuleFixture {
  readonly roleDictionary: LinkHandle; readonly rule: LinkHandle; readonly ruleAdmission: LinkHandle;
  readonly derivationRule: LinkHandle; readonly derivationAdmission: LinkHandle;
}
interface BuiltNode { readonly occurrence: LinkHandle; readonly node: StructuralDerivationNodeEvidence; }

const memory = new Memory();
const { R, U } = ensureRootBasis(memory);
let cursor = U;
const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
const dictionary = fresh(), grammar = fresh(), theory = fresh(), weakTheory = fresh();
const pRole = fresh(), qRole = fresh(), gRole = fresh(), aRole = fresh(), bRole = fresh();
const p = fresh(), q = fresh(), g = fresh(), a = fresh(), b = fresh(), x = fresh(), r = fresh();
const rawPair = (left: LinkHandle, right: LinkHandle): LinkHandle => memory.ensure(left, right);

function environment(selectedTheory: LinkHandle): Environment {
  const expectedInterpreter: StructuralInterpreter = { dictionary, grammar, theory: selectedTheory };
  return Object.freeze({ expectedInterpreter, interpreter: defineStructuralInterpreter(memory, dictionary, grammar, selectedTheory) });
}
const main = environment(theory);

function defineRule(selectedTheory: LinkHandle, roles: readonly LinkHandle[], conclusion: LinkHandle, premises: readonly LinkHandle[]): RuleFixture {
  const roleDictionary = defineStructuralRoleDictionary(memory, roles);
  const rule = defineStructuralRule(memory, roleDictionary, conclusion);
  const ruleAdmission = admitStructuralRule(memory, selectedTheory, rule);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  const derivationAdmission = admitStructuralDerivationRule(memory, selectedTheory, derivationRule);
  return Object.freeze({ roleDictionary, rule, ruleAdmission, derivationRule, derivationAdmission });
}

function judgment(
  selectedTheory: LinkHandle, env: Environment, rf: RuleFixture,
  bindings: readonly (readonly [LinkHandle, LinkHandle])[], claim: LinkHandle,
  ruleAdmission = rf.ruleAdmission,
): StructuralJudgmentEvidence {
  const context = defineContext(memory, fresh(), fresh());
  const act = defineActHeader(memory, env.interpreter, rf.roleDictionary, context);
  for (const [role, value] of bindings) defineActField(memory, act, role, value);
  return Object.freeze({
    application: Object.freeze({
      act, rule: rf.rule, ruleAdmission, claimedBody: claim,
      expectedInterpreter: env.expectedInterpreter, expectedAfterContext: context,
    }),
    judgment: Object.freeze({ theory: selectedTheory, context, claim }),
  });
}

function node(
  rf: RuleFixture, bindings: readonly (readonly [LinkHandle, LinkHandle])[],
  claim: LinkHandle, premises: readonly LinkHandle[],
): BuiltNode {
  const selected = judgment(theory, main, rf, bindings, claim);
  const occurrence = defineStructuralProofOccurrence(memory, selected.application.act, claim);
  return Object.freeze({ occurrence, node: Object.freeze({
    occurrence, judgment: selected, derivationRule: rf.derivationRule,
    derivationRuleAdmission: rf.derivationAdmission,
    premiseOccurrenceSequence: materializeExactSequence(memory, premises),
  }) });
}

function assumptions(selectedTheory: LinkHandle, ...claims: LinkHandle[]) {
  const context = defineStructuralAssumptionContext(memory, selectedTheory, claims);
  const occurrences = claims.map((claim) => memory.find(context, claim));
  assert(occurrences.every((value) => value !== undefined), "missing assumption occurrence");
  return Object.freeze({ context, occurrences: occurrences as LinkHandle[] });
}

const deriveQFromP = defineRule(theory, [pRole, qRole], qRole, [pRole]);
const scopedIntro = defineRule(theory, [pRole, qRole], rawPair(pRole, qRole), [pRole, qRole]);

function simpleInner(selectedP: LinkHandle, selectedQ: LinkHandle, extra: readonly LinkHandle[] = []): StructuralDerivationWithAssumptionsEvidence {
  const scope = assumptions(theory, ...extra, selectedP);
  const target = node(deriveQFromP, [[pRole, selectedP], [qRole, selectedQ]], selectedQ, [scope.occurrences.at(-1)!]);
  return Object.freeze({
    derivation: Object.freeze({ theory, targetOccurrence: target.occurrence, nodes: Object.freeze([target.node]) }),
    assumptionContext: scope.context,
  });
}

function scopedEvidence(
  inner: StructuralDerivationWithAssumptionsEvidence, outerAssumptionContext: LinkHandle,
  selectedP: LinkHandle, selectedQ: LinkHandle, rf = scopedIntro,
): StructuralScopedDerivationEvidence {
  return Object.freeze({
    inner, outerAssumptionContext,
    conclusion: judgment(theory, main, rf, [[pRole, selectedP], [qRole, selectedQ]], rawPair(selectedP, selectedQ)),
    derivationRule: rf.derivationRule, derivationRuleAdmission: rf.derivationAdmission,
  });
}

const emptyOuter = assumptions(theory);
const basic = scopedEvidence(simpleInner(p, q), emptyOuter.context, p, q);
{
  const before = memory.linkCount;
  const result = replayStructuralScopedDerivation(memory, basic);
  same(result.conclusion.judgment.claim, rawPair(p, q), "basic conclusion");
  same(result.outerAssumptionClaims.length, 0, "basic outer scope");
  same(result.localAssumptionClaims[0], p, "local P");
  same(result.dischargedLocalAssumptionOccurrences.length, 1, "used P discharged");
  same(result.usedOuterAssumptionOccurrences.length, 0, "basic result assumption-free");
  same(memory.linkCount, before, "basic replay read-only");
}
{
  const p2 = fresh(), q2 = fresh();
  same(
    replayStructuralScopedDerivation(memory, scopedEvidence(simpleInner(p2, q2), emptyOuter.context, p2, q2)).conclusion.judgment.claim,
    rawPair(p2, q2), "same generic rule substitutes",
  );
}

// Γ=[G], Δ=[P]; branching proof uses both, only G survives. Host node order is transport only.
const fromG = defineRule(theory, [gRole, aRole], aRole, [gRole]);
const fromP = defineRule(theory, [pRole, bRole], bRole, [pRole]);
const combine = defineRule(theory, [aRole, bRole, qRole], qRole, [aRole, bRole]);
const outerG = assumptions(theory, g), innerGP = assumptions(theory, g, p);
const aNode = node(fromG, [[gRole, g], [aRole, a]], a, [innerGP.occurrences[0]!]);
const bNode = node(fromP, [[pRole, p], [bRole, b]], b, [innerGP.occurrences[1]!]);
const qNode = node(combine, [[aRole, a], [bRole, b], [qRole, q]], q, [aNode.occurrence, bNode.occurrence]);
const branchingInner = (nodes: readonly StructuralDerivationNodeEvidence[]) => Object.freeze({
  derivation: Object.freeze({ theory, targetOccurrence: qNode.occurrence, nodes }), assumptionContext: innerGP.context,
});
{
  const first = replayStructuralScopedDerivation(memory, scopedEvidence(branchingInner([qNode.node, aNode.node, bNode.node]), outerG.context, p, q));
  const reordered = replayStructuralScopedDerivation(memory, scopedEvidence(branchingInner([bNode.node, qNode.node, aNode.node]), outerG.context, p, q));
  same(first.usedOuterAssumptionOccurrences[0], outerG.occurrences[0], "G remains dependency");
  same(first.localAssumptionClaims[0], p, "only P local");
  same(reordered.conclusion.judgment.claim, first.conclusion.judgment.claim, "host order irrelevant");
}

// Wrong Theory / non-prefix scope.
{
  const weakOuter = assumptions(weakTheory);
  expectError("scope-theory-mismatch", () => replayStructuralScopedDerivation(memory, { ...basic, outerAssumptionContext: weakOuter.context }));
  const wrongOuter = assumptions(theory, p);
  expectError("outer-scope-not-prefix", () => replayStructuralScopedDerivation(
    memory, scopedEvidence(branchingInner([qNode.node, aNode.node, bNode.node]), wrongOuter.context, p, q),
  ));
}

// Γ cannot be silently discharged, and undeclared extra suffix claims cannot vanish.
{
  const overwide = defineRule(theory, [gRole, pRole, qRole], rawPair(pRole, qRole), [gRole, pRole, qRole]);
  expectError("scoped-premise-count-mismatch", () => replayStructuralScopedDerivation(memory, {
    inner: branchingInner([qNode.node, aNode.node, bNode.node]), outerAssumptionContext: outerG.context,
    conclusion: judgment(theory, main, overwide, [[gRole, g], [pRole, p], [qRole, q]], rawPair(p, q)),
    derivationRule: overwide.derivationRule, derivationRuleAdmission: overwide.derivationAdmission,
  }));
  expectError("scoped-premise-count-mismatch", () => replayStructuralScopedDerivation(
    memory, scopedEvidence(simpleInner(p, q, [g, x]), outerG.context, p, q),
  ));
}

// Wrong target template / forged conclusion / wrong role binding.
{
  const wrongTarget = defineRule(theory, [pRole, qRole], rawPair(pRole, qRole), [pRole, pRole]);
  expectError("scoped-premise-mismatch", () => replayStructuralScopedDerivation(
    memory, scopedEvidence(simpleInner(p, q), emptyOuter.context, p, q, wrongTarget),
  ));
  expectError("invalid-conclusion", () => replayStructuralScopedDerivation(memory, {
    ...basic, conclusion: judgment(theory, main, scopedIntro, [[pRole, p], [qRole, q]], rawPair(p, r)),
  }));
  expectError("invalid-conclusion", () => replayStructuralScopedDerivation(memory, {
    ...basic, conclusion: judgment(theory, main, scopedIntro, [[pRole, p], [qRole, r]], rawPair(p, q)),
  }));
}

// Missing dependency in the inner DAG.
{
  const scope = assumptions(theory, p);
  const missing = defineStructuralProofOccurrence(memory, fresh(), p);
  const broken = node(deriveQFromP, [[pRole, p], [qRole, q]], q, [missing]);
  const brokenInner: StructuralDerivationWithAssumptionsEvidence = {
    derivation: { theory, targetOccurrence: broken.occurrence, nodes: [broken.node] }, assumptionContext: scope.context,
  };
  expectError("invalid-inner-derivation", () => replayStructuralScopedDerivation(
    memory, scopedEvidence(brokenInner, emptyOuter.context, p, q),
  ));
}

// Rule/admission authority is structural; host labels grant nothing.
{
  const fakeDerivationAdmission = memory.ensure(fresh(), scopedIntro.derivationRule);
  expectError("scoped-rule-not-admitted", () => replayStructuralScopedDerivation(memory, {
    ...basic, derivationRuleAdmission: fakeDerivationAdmission, discharge: "implicationIntroduction",
  } as StructuralScopedDerivationEvidence & { readonly discharge: string }));

  const other = defineRule(theory, [pRole, qRole], qRole, [pRole, qRole]);
  expectError("scoped-rule-mismatch", () => replayStructuralScopedDerivation(memory, {
    ...basic, derivationRule: other.derivationRule, derivationRuleAdmission: other.derivationAdmission,
  }));

  const fakeRuleAdmission = memory.ensure(fresh(), scopedIntro.rule);
  expectError("invalid-conclusion", () => replayStructuralScopedDerivation(memory, {
    ...basic,
    conclusion: { ...basic.conclusion, application: { ...basic.conclusion.application, ruleAdmission: fakeRuleAdmission } },
  }));
}

// Claiming assumption-free while G remains requires a rule that explicitly accounts for G; this one does not.
expectError("scoped-premise-count-mismatch", () => replayStructuralScopedDerivation(
  memory, scopedEvidence(branchingInner([qNode.node, aNode.node, bNode.node]), emptyOuter.context, p, q),
));

// Zero-write composition detects injection.
{
  let injected = false;
  const malicious: ReadMemory = {
    get root() { return memory.root; }, get linkCount() { return memory.linkCount; },
    poles(link) { return memory.poles(link); },
    find(start, end) {
      if (!injected) { injected = true; memory.ensure(fresh(), fresh()); }
      return memory.find(start, end);
    },
    outgoing(start) { return memory.outgoing(start); }, incoming(end) { return memory.incoming(end); },
  };
  expectError("scoped-replay-wrote", () => replayStructuralScopedDerivation(malicious, basic));
}

const GENERIC_SCOPED_ASSUMPTION_DISCHARGE_SUPPORTED = true;
const IMPLICATION_SPECIFIC_TRUSTED_CODE_REQUIRED = false;
assert(GENERIC_SCOPED_ASSUMPTION_DISCHARGE_SUPPORTED, "P9a1 classification");
assert(!IMPLICATION_SPECIFIC_TRUSTED_CODE_REQUIRED, "P9a1 trusted-code boundary");
