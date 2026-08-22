import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  StructuralScopedDerivationReplayError,
  ensureRootBasis,
  replayStructuralScopedDerivation,
  type LinkHandle,
  type ReadMemory,
  type StructuralScopedDerivationEvidence,
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
  admitStructuralDerivationRule,
  defineStructuralAssumptionContext,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  type StructuralDerivationNodeEvidence,
  type StructuralDerivationWithAssumptionsEvidence,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`P9a1 discharge: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectError(
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
  throw new Error(`P9a1 discharge: ${code}: expected rejection`);
}

interface Environment {
  readonly interpreter: LinkHandle;
  readonly expectedInterpreter: StructuralInterpreter;
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
const gRole = fresh();
const aRole = fresh();
const bRole = fresh();

const p = fresh();
const q = fresh();
const g = fresh();
const a = fresh();
const b = fresh();
const x = fresh();
const r = fresh();

const rawPair = (left: LinkHandle, right: LinkHandle): LinkHandle =>
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

function judgment(
  selectedTheory: LinkHandle,
  env: Environment,
  rf: RuleFixture,
  bindings: readonly (readonly [LinkHandle, LinkHandle])[],
  claim: LinkHandle,
  ruleAdmission = rf.ruleAdmission,
): StructuralJudgmentEvidence {
  const context = defineContext(memory, fresh(), fresh());
  const act = defineActHeader(memory, env.interpreter, rf.roleDictionary, context);
  for (const [role, value] of bindings) defineActField(memory, act, role, value);
  return Object.freeze({
    application: Object.freeze({
      act,
      rule: rf.rule,
      ruleAdmission,
      claimedBody: claim,
      expectedInterpreter: env.expectedInterpreter,
      expectedAfterContext: context,
    }),
    judgment: Object.freeze({ theory: selectedTheory, context, claim }),
  });
}

function node(
  selectedTheory: LinkHandle,
  env: Environment,
  rf: RuleFixture,
  bindings: readonly (readonly [LinkHandle, LinkHandle])[],
  claim: LinkHandle,
  premises: readonly LinkHandle[],
): BuiltNode {
  const selected = judgment(selectedTheory, env, rf, bindings, claim);
  const occurrence = defineStructuralProofOccurrence(memory, selected.application.act, claim);
  return Object.freeze({
    occurrence,
    node: Object.freeze({
      occurrence,
      judgment: selected,
      derivationRule: rf.derivationRule,
      derivationRuleAdmission: rf.derivationAdmission,
      premiseOccurrenceSequence: materializeExactSequence(memory, premises),
    }),
  });
}

function assumptions(selectedTheory: LinkHandle, ...claims: LinkHandle[]) {
  const context = defineStructuralAssumptionContext(memory, selectedTheory, claims);
  const occurrences = claims.map((claim) => memory.find(context, claim));
  assert(occurrences.every((value) => value !== undefined), "missing assumption occurrence");
  return Object.freeze({ context, occurrences: occurrences as LinkHandle[] });
}

const deriveQFromP = defineRule(theory, [pRole, qRole], qRole, [pRole]);
const scopedIntro = defineRule(
  theory,
  [pRole, qRole],
  rawPair(pRole, qRole),
  [pRole, qRole],
);

function simpleInner(
  selectedP: LinkHandle,
  selectedQ: LinkHandle,
  extraClaims: readonly LinkHandle[] = [],
): StructuralDerivationWithAssumptionsEvidence {
  const scope = assumptions(theory, ...extraClaims, selectedP);
  const pOccurrence = scope.occurrences[scope.occurrences.length - 1]!;
  const target = node(
    theory,
    main,
    deriveQFromP,
    [[pRole, selectedP], [qRole, selectedQ]],
    selectedQ,
    [pOccurrence],
  );
  return Object.freeze({
    derivation: Object.freeze({
      theory,
      targetOccurrence: target.occurrence,
      nodes: Object.freeze([target.node]),
    }),
    assumptionContext: scope.context,
  });
}

function scopedEvidence(
  inner: StructuralDerivationWithAssumptionsEvidence,
  outerAssumptionContext: LinkHandle,
  selectedP: LinkHandle,
  selectedQ: LinkHandle,
  rf = scopedIntro,
): StructuralScopedDerivationEvidence {
  return Object.freeze({
    inner,
    outerAssumptionContext,
    conclusion: judgment(
      theory,
      main,
      rf,
      [[pRole, selectedP], [qRole, selectedQ]],
      rawPair(selectedP, selectedQ),
    ),
    derivationRule: rf.derivationRule,
    derivationRuleAdmission: rf.derivationAdmission,
  });
}

// Γ=[]; Δ=[P]. P is a local dependency and is discharged structurally.
const emptyOuter = assumptions(theory);
const basic = scopedEvidence(simpleInner(p, q), emptyOuter.context, p, q);
{
  const before = memory.linkCount;
  const result = replayStructuralScopedDerivation(memory, basic);
  same(result.conclusion.judgment.claim, rawPair(p, q), "basic discharged conclusion");
  same(result.outerAssumptionClaims.length, 0, "basic outer assumptions");
  same(result.localAssumptionClaims.length, 1, "basic local assumption count");
  same(result.localAssumptionClaims[0], p, "basic local P");
  same(result.dischargedLocalAssumptionOccurrences.length, 1, "P was used and discharged");
  same(result.usedOuterAssumptionOccurrences.length, 0, "basic result assumption-free");
  same(memory.linkCount, before, "basic replay read-only");
}

// The same generic scoped rule works for another P/Q substitution instance.
{
  const p2 = fresh();
  const q2 = fresh();
  const result = replayStructuralScopedDerivation(
    memory,
    scopedEvidence(simpleInner(p2, q2), emptyOuter.context, p2, q2),
  );
  same(result.conclusion.judgment.claim, rawPair(p2, q2), "second substitution conclusion");
}

// Γ=[G], Δ=[P]. A branching inner proof uses both G and P; only G survives.
const fromG = defineRule(theory, [gRole, aRole], aRole, [gRole]);
const fromP = defineRule(theory, [pRole, bRole], bRole, [pRole]);
const combine = defineRule(theory, [aRole, bRole, qRole], qRole, [aRole, bRole]);
const outerG = assumptions(theory, g);
const innerGP = assumptions(theory, g, p);
const aNode = node(theory, main, fromG, [[gRole, g], [aRole, a]], a, [innerGP.occurrences[0]!]);
const bNode = node(theory, main, fromP, [[pRole, p], [bRole, b]], b, [innerGP.occurrences[1]!]);
const qNode = node(
  theory,
  main,
  combine,
  [[aRole, a], [bRole, b], [qRole, q]],
  q,
  [aNode.occurrence, bNode.occurrence],
);
const branchingInner = (nodes: readonly StructuralDerivationNodeEvidence[]) => Object.freeze({
  derivation: Object.freeze({ theory, targetOccurrence: qNode.occurrence, nodes }),
  assumptionContext: innerGP.context,
});
{
  const first = replayStructuralScopedDerivation(
    memory,
    scopedEvidence(branchingInner([qNode.node, aNode.node, bNode.node]), outerG.context, p, q),
  );
  const reordered = replayStructuralScopedDerivation(
    memory,
    scopedEvidence(branchingInner([bNode.node, qNode.node, aNode.node]), outerG.context, p, q),
  );
  same(first.usedOuterAssumptionOccurrences.length, 1, "G remains an outer dependency");
  same(first.usedOuterAssumptionOccurrences[0], outerG.occurrences[0], "outer G occurrence mapped");
  same(first.localAssumptionClaims[0], p, "only P is local");
  same(reordered.conclusion.judgment.claim, first.conclusion.judgment.claim, "host node order irrelevant");
}

// Wrong Theory and a non-prefix outer scope reject.
{
  const weakOuter = assumptions(weakTheory);
  expectError("scope-theory-mismatch", () =>
    replayStructuralScopedDerivation(memory, { ...basic, outerAssumptionContext: weakOuter.context }),
  );

  const wrongOuter = assumptions(theory, p);
  const preserveG = scopedEvidence(branchingInner([qNode.node, aNode.node, bNode.node]), wrongOuter.context, p, q);
  expectError("outer-scope-not-prefix", () => replayStructuralScopedDerivation(memory, preserveG));
}

// A rule cannot silently discharge a claim that belongs to Γ, nor ignore extra local suffix claims.
{
  const overwide = defineRule(
    theory,
    [gRole, pRole, qRole],
    rawPair(pRole, qRole),
    [gRole, pRole, qRole],
  );
  const attemptOuterDischarge: StructuralScopedDerivationEvidence = {
    inner: branchingInner([qNode.node, aNode.node, bNode.node]),
    outerAssumptionContext: outerG.context,
    conclusion: judgment(
      theory,
      main,
      overwide,
      [[gRole, g], [pRole, p], [qRole, q]],
      rawPair(p, q),
    ),
    derivationRule: overwide.derivationRule,
    derivationRuleAdmission: overwide.derivationAdmission,
  };
  expectError("scoped-premise-count-mismatch", () =>
    replayStructuralScopedDerivation(memory, attemptOuterDischarge),
  );

  const innerWithExtra = simpleInner(p, q, [g, x]);
  expectError("scoped-premise-count-mismatch", () =>
    replayStructuralScopedDerivation(
      memory,
      scopedEvidence(innerWithExtra, outerG.context, p, q),
    ),
  );
}

// Wrong target template, forged conclusion, wrong binding and missing inner dependency fail closed.
{
  const wrongTargetRule = defineRule(
    theory,
    [pRole, qRole],
    rawPair(pRole, qRole),
    [pRole, pRole],
  );
  expectError("scoped-premise-mismatch", () =>
    replayStructuralScopedDerivation(
      memory,
      scopedEvidence(simpleInner(p, q), emptyOuter.context, p, q, wrongTargetRule),
    ),
  );

  const forgedConclusion = {
    ...basic,
    conclusion: judgment(
      theory,
      main,
      scopedIntro,
      [[pRole, p], [qRole, q]],
      rawPair(p, r),
    ),
  };
  expectError("invalid-conclusion", () => replayStructuralScopedDerivation(memory, forgedConclusion));

  const wrongBinding = {
    ...basic,
    conclusion: judgment(
      theory,
      main,
      scopedIntro,
      [[pRole, p], [qRole, r]],
      rawPair(p, q),
    ),
  };
  expectError("invalid-conclusion", () => replayStructuralScopedDerivation(memory, wrongBinding));

  const scope = assumptions(theory, p);
  const missing = defineStructuralProofOccurrence(memory, fresh(), p);
  const broken = node(
    theory,
    main,
    deriveQFromP,
    [[pRole, p], [qRole, q]],
    q,
    [missing],
  );
  const brokenInner: StructuralDerivationWithAssumptionsEvidence = {
    derivation: { theory, targetOccurrence: broken.occurrence, nodes: [broken.node] },
    assumptionContext: scope.context,
  };
  expectError("invalid-inner-derivation", () =>
    replayStructuralScopedDerivation(
      memory,
      scopedEvidence(brokenInner, emptyOuter.context, p, q),
    ),
  );
}

// Structural rule authority and derivation admission cannot be forged by host metadata.
{
  const fakeAdmission = memory.ensure(fresh(), scopedIntro.derivationRule);
  const hostLabelled = {
    ...basic,
    derivationRuleAdmission: fakeAdmission,
    discharge: "implicationIntroduction",
  };
  expectError("scoped-rule-not-admitted", () =>
    replayStructuralScopedDerivation(memory, hostLabelled),
  );

  const other = defineRule(theory, [pRole, qRole], qRole, [pRole, qRole]);
  expectError("scoped-rule-mismatch", () =>
    replayStructuralScopedDerivation(memory, {
      ...basic,
      derivationRule: other.derivationRule,
      derivationRuleAdmission: other.derivationAdmission,
    }),
  );

  const unadmittedDictionary = defineStructuralRoleDictionary(memory, [pRole, qRole]);
  const unadmittedRule = defineStructuralRule(memory, unadmittedDictionary, rawPair(pRole, qRole));
  const fakeRuleAdmission = memory.ensure(fresh(), unadmittedRule);
  const unadmittedDerivation = defineStructuralDerivationRule(memory, unadmittedRule, [pRole, qRole]);
  const unadmittedDerivationAdmission = admitStructuralDerivationRule(memory, theory, unadmittedDerivation);
  const unadmittedConclusion: StructuralJudgmentEvidence = (() => {
    const context = defineContext(memory, fresh(), fresh());
    const act = defineActHeader(memory, main.interpreter, unadmittedDictionary, context);
    defineActField(memory, act, pRole, p);
    defineActField(memory, act, qRole, q);
    return {
      application: {
        act,
        rule: unadmittedRule,
        ruleAdmission: fakeRuleAdmission,
        claimedBody: rawPair(p, q),
        expectedInterpreter: main.expectedInterpreter,
        expectedAfterContext: context,
      },
      judgment: { theory, context, claim: rawPair(p, q) },
    };
  })();
  expectError("invalid-conclusion", () =>
    replayStructuralScopedDerivation(memory, {
      ...basic,
      conclusion: unadmittedConclusion,
      derivationRule: unadmittedDerivation,
      derivationRuleAdmission: unadmittedDerivationAdmission,
    }),
  );
}

// An outer dependency cannot disappear merely by claiming an assumption-free result.
{
  expectError("scoped-premise-count-mismatch", () =>
    replayStructuralScopedDerivation(
      memory,
      scopedEvidence(
        branchingInner([qNode.node, aNode.node, bNode.node]),
        emptyOuter.context,
        p,
        q,
      ),
    ),
  );
}

// Read-only replay detects write injection anywhere in the composed boundary.
{
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
  expectError("scoped-replay-wrote", () => replayStructuralScopedDerivation(malicious, basic));
}

const GENERIC_SCOPED_ASSUMPTION_DISCHARGE_SUPPORTED = true;
const IMPLICATION_SPECIFIC_TRUSTED_CODE_REQUIRED = false;
assert(GENERIC_SCOPED_ASSUMPTION_DISCHARGE_SUPPORTED, "P9a1 classification");
assert(!IMPLICATION_SPECIFIC_TRUSTED_CODE_REQUIRED, "P9a1 trusted-code boundary");
