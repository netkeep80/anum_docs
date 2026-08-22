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
  if (!condition) throw new Error(`P9b AND bundle: ${message}`);
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
  throw new Error(`P9b AND bundle: ${code}: expected rejection`);
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
const andTag = fresh();
const foreignAndTag = fresh();
const pRole = fresh();
const qRole = fresh();
const rootRole = fresh();
const p = fresh();
const q = fresh();
const r = fresh();

const rawPair = (left: LinkHandle, right: LinkHandle): LinkHandle =>
  memory.ensure(left, right);
const and = (left: LinkHandle, right: LinkHandle, tag = andTag): LinkHandle =>
  memory.ensure(tag, memory.ensure(left, right));

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
  ruleAdmission = rf.ruleAdmission,
  derivationAdmission = rf.derivationAdmission,
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
      derivationRuleAdmission: derivationAdmission,
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

const root = defineRule(theory, [rootRole], rootRole, []);
const prove = (claim: LinkHandle): BuiltNode =>
  node(theory, main, root, [[rootRole, claim]], claim, []);

const intro = defineRule(
  theory,
  [pRole, qRole],
  and(pRole, qRole),
  [pRole, qRole],
);
const left = defineRule(
  theory,
  [pRole, qRole],
  pRole,
  [and(pRole, qRole)],
);
const right = defineRule(
  theory,
  [pRole, qRole],
  qRole,
  [and(pRole, qRole)],
);

const introNode = (
  selectedP: LinkHandle,
  selectedQ: LinkHandle,
  premises: readonly LinkHandle[],
) => node(
  theory,
  main,
  intro,
  [[pRole, selectedP], [qRole, selectedQ]],
  and(selectedP, selectedQ),
  premises,
);
const leftNode = (selectedP: LinkHandle, selectedQ: LinkHandle, premise: LinkHandle) =>
  node(
    theory,
    main,
    left,
    [[pRole, selectedP], [qRole, selectedQ]],
    selectedP,
    [premise],
  );
const rightNode = (selectedP: LinkHandle, selectedQ: LinkHandle, premise: LinkHandle) =>
  node(
    theory,
    main,
    right,
    [[pRole, selectedP], [qRole, selectedQ]],
    selectedQ,
    [premise],
  );

// Carrier comparison: raw Pair is already the P9a implication claim identity.
// A tagged bundle gives conjunction a distinct object-logic claim without a new MTS primitive.
{
  const raw = rawPair(p, q);
  same(raw, memory.ensure(p, q), "raw carrier is exactly Pair(P,Q)");
  assert(and(p, q) !== raw, "tagged AND must remain distinct from raw implication carrier");
  const taggedPoles = memory.poles(and(p, q));
  same(taggedPoles.start, andTag, "AND tag is structural data");
  same(taggedPoles.end, raw, "AND payload preserves ordered P/Q pair");
}

// AND-intro from exact scoped premises, with a second substitution instance.
{
  const scope = assumptions(p, q);
  const target = introNode(p, q, scope.occurrences);
  const before = memory.linkCount;
  const result = replayStructuralDerivationWithAssumptions(memory, {
    derivation: { theory, targetOccurrence: target.occurrence, nodes: [target.node] },
    assumptionContext: scope.context,
  });
  same(result.derivation.target.judgment.claim, and(p, q), "AND intro conclusion");
  same(result.usedAssumptionOccurrences.length, 2, "AND intro uses both occurrences");
  same(memory.linkCount, before, "AND intro replay read-only");

  const p2 = fresh();
  const q2 = fresh();
  const scope2 = assumptions(p2, q2);
  const target2 = introNode(p2, q2, scope2.occurrences);
  same(target2.node.judgment.application.rule, intro.rule, "same intro rule substitutes");
  same(
    replayStructuralDerivationWithAssumptions(memory, {
      derivation: { theory, targetOccurrence: target2.occurrence, nodes: [target2.node] },
      assumptionContext: scope2.context,
    }).derivation.target.judgment.claim,
    and(p2, q2),
    "second AND substitution",
  );
}

// Proof-relevant multiplicity: And(P,P) can carry two distinct proof-history occurrences.
// A one-position dependency sequence cannot satisfy its two premise templates.
{
  const p1 = prove(p);
  const p2 = prove(p);
  assert(p1.occurrence !== p2.occurrence, "same claim must admit distinct proof occurrences");
  const both = introNode(p, p, [p1.occurrence, p2.occurrence]);
  same(
    replayStructuralDerivation(memory, {
      theory,
      targetOccurrence: both.occurrence,
      nodes: [both.node, p2.node, p1.node],
    }).target.judgment.claim,
    and(p, p),
    "And(P,P) with two positions",
  );

  const one = introNode(p, p, [p1.occurrence]);
  expectError(StructuralDerivationReplayError, "missing-premise", () =>
    replayStructuralDerivation(memory, {
      theory,
      targetOccurrence: one.occurrence,
      nodes: [one.node, p1.node],
    }),
  );
}

// AND-left / AND-right consume the same proven tagged bundle; host node order is transport only.
const proofP = prove(p);
const proofQ = prove(q);
const proofAnd = introNode(p, q, [proofP.occurrence, proofQ.occurrence]);
{
  const takeLeft = leftNode(p, q, proofAnd.occurrence);
  const takeRight = rightNode(p, q, proofAnd.occurrence);
  const leftResult = replayStructuralDerivation(memory, {
    theory,
    targetOccurrence: takeLeft.occurrence,
    nodes: [takeLeft.node, proofAnd.node, proofP.node, proofQ.node],
  });
  same(leftResult.target.judgment.claim, p, "AND-left");
  same(
    replayStructuralDerivation(memory, {
      theory,
      targetOccurrence: takeRight.occurrence,
      nodes: [proofQ.node, takeRight.node, proofP.node, proofAnd.node],
    }).target.judgment.claim,
    q,
    "AND-right / host order irrelevant",
  );
}

// A proof-carrying conjunction theorem expands through ordinary P3a theorem reuse.
{
  const theorem = defineStructuralTheorem(memory, and(p, q), theory);
  const takeLeft = leftNode(p, q, proofAnd.occurrence);
  const before = memory.linkCount;
  const result = replayStructuralDerivationWithTheorems(memory, {
    derivation: {
      theory,
      targetOccurrence: takeLeft.occurrence,
      nodes: [takeLeft.node],
    },
    theorems: [{
      theorem,
      proof: {
        theory,
        targetOccurrence: proofAnd.occurrence,
        nodes: [proofAnd.node, proofP.node, proofQ.node],
      },
    }],
  });
  same(result.derivation.target.judgment.claim, p, "theorem-carried AND-left");
  same(memory.linkCount, before, "theorem projection replay read-only");
}

// Missing/reversed intro dependencies fail closed.
{
  const scope = assumptions(p, q);
  for (const premises of [
    [scope.occurrences[0]!],
    [scope.occurrences[1]!],
    [scope.occurrences[1]!, scope.occurrences[0]!],
  ]) {
    const target = introNode(p, q, premises);
    expectError(StructuralAssumptionReplayError, "invalid-assumption-derivation", () =>
      replayStructuralDerivationWithAssumptions(memory, {
        derivation: { theory, targetOccurrence: target.occurrence, nodes: [target.node] },
        assumptionContext: scope.context,
      }),
    );
  }
}

// Raw Pair or a foreign tag cannot impersonate the selected AND carrier for projection.
{
  for (const impostor of [rawPair(p, q), and(p, q, foreignAndTag)]) {
    const scope = assumptions(impostor);
    const target = leftNode(p, q, scope.occurrences[0]!);
    expectError(StructuralAssumptionReplayError, "invalid-assumption-derivation", () =>
      replayStructuralDerivationWithAssumptions(memory, {
        derivation: { theory, targetOccurrence: target.occurrence, nodes: [target.node] },
        assumptionContext: scope.context,
      }),
    );
  }
}

// Wrong Theory and host connective labels grant no authority.
{
  const weakScope = defineStructuralAssumptionContext(memory, weakTheory, [p, q]);
  const weakOccurrences = [memory.find(weakScope, p), memory.find(weakScope, q)];
  assert(weakOccurrences.every((value) => value !== undefined), "weak assumption occurrences");
  const weakTarget = node(
    weakTheory,
    weak,
    intro,
    [[pRole, p], [qRole, q]],
    and(p, q),
    weakOccurrences as LinkHandle[],
  );
  expectError(StructuralAssumptionReplayError, "invalid-assumption-derivation", () =>
    replayStructuralDerivationWithAssumptions(memory, {
      derivation: { theory: weakTheory, targetOccurrence: weakTarget.occurrence, nodes: [weakTarget.node] },
      assumptionContext: weakScope,
    }),
  );

  const scope = assumptions(p, q);
  const fakeRuleAdmission = memory.ensure(fresh(), intro.rule);
  const invalid = node(
    theory,
    main,
    intro,
    [[pRole, p], [qRole, q]],
    and(p, q),
    scope.occurrences,
    fakeRuleAdmission,
  );
  const hostLabelled = {
    ...invalid.node,
    logicalPrinciple: "and",
    ruleKind: "andIntro",
  };
  expectError(StructuralAssumptionReplayError, "invalid-assumption-derivation", () =>
    replayStructuralDerivationWithAssumptions(memory, {
      derivation: {
        theory,
        targetOccurrence: invalid.occurrence,
        nodes: [hostLabelled],
      },
      assumptionContext: scope.context,
    }),
  );
}

// Forged projection binding/conclusion rejects through ordinary structural replay.
{
  const scope = assumptions(and(p, q));
  const forged = node(
    theory,
    main,
    left,
    [[pRole, r], [qRole, q]],
    p,
    [scope.occurrences[0]!],
  );
  expectError(StructuralAssumptionReplayError, "invalid-assumption-derivation", () =>
    replayStructuralDerivationWithAssumptions(memory, {
      derivation: { theory, targetOccurrence: forged.occurrence, nodes: [forged.node] },
      assumptionContext: scope.context,
    }),
  );
}

// Read-only replay detects write injection.
{
  const scope = assumptions(p, q);
  const target = introNode(p, q, scope.occurrences);
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

const TAGGED_AND_CARRIER_REQUIRED = true;
const PROOF_RELEVANT_AND_BUNDLE_SUPPORTED = true;
const AND_SPECIFIC_TRUSTED_CODE_REQUIRED = false;
assert(TAGGED_AND_CARRIER_REQUIRED, "raw Pair must not conflate implication and conjunction");
assert(PROOF_RELEVANT_AND_BUNDLE_SUPPORTED, "P9b classification");
assert(!AND_SPECIFIC_TRUSTED_CODE_REQUIRED, "P9b trusted-code boundary");
