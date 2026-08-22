import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
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
  StructuralDerivationReplayError,
  StructuralJudgmentReplayError,
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  replayStructuralDerivation,
  replayStructuralJudgment,
  type StructuralDerivationEvidence,
  type StructuralDerivationNodeEvidence,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectJudgmentError(
  code: StructuralJudgmentReplayError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralJudgmentReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected StructuralJudgmentReplayError`);
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

interface Fixture {
  readonly memory: Memory;
  readonly evidence: StructuralJudgmentEvidence;
  readonly fresh: () => LinkHandle;
  readonly rule: LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const { R, U } = ensureRootBasis(memory);
  let cursor = U;
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, R);
    return cursor;
  };

  const dictionary = fresh();
  const grammar = fresh();
  const theory = fresh();
  const leftRole = fresh();
  const rightRole = fresh();
  const left = fresh();
  const right = fresh();
  const context = defineContext(memory, fresh(), fresh());

  const expectedInterpreter: StructuralInterpreter = Object.freeze({ dictionary, grammar, theory });
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const roleDictionary = defineStructuralRoleDictionary(memory, [leftRole, rightRole]);
  const templateBody = memory.ensure(leftRole, rightRole);
  const rule = defineStructuralRule(memory, roleDictionary, templateBody);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const claim = memory.ensure(left, right);
  const act = defineActHeader(memory, interpreter, roleDictionary, context);
  defineActField(memory, act, leftRole, left);
  defineActField(memory, act, rightRole, right);

  const evidence: StructuralJudgmentEvidence = Object.freeze({
    application: Object.freeze({
      act,
      rule,
      ruleAdmission,
      claimedBody: claim,
      expectedInterpreter,
      expectedAfterContext: context,
    }),
    judgment: Object.freeze({ theory, context, claim }),
  });
  return { memory, evidence, fresh, rule };
}

// Positive generic one-step judgment: exact claim and zero writes.
{
  const fx = fixture();
  const before = fx.memory.linkCount;
  const result = replayStructuralJudgment(fx.memory, fx.evidence);
  same(result.judgment.theory, fx.evidence.judgment.theory, "exact theory");
  same(result.judgment.context, fx.evidence.judgment.context, "exact context");
  same(result.judgment.claim, fx.evidence.judgment.claim, "exact claim");
  same(result.application.claimedBody, fx.evidence.judgment.claim, "application binds exact claim");
  same(fx.memory.linkCount, before, "judgment replay must be read-only");
}

// Judgment theory is independent from the application interpreter theory.
{
  const fx = fixture();
  expectJudgmentError("judgment-theory-mismatch", () => replayStructuralJudgment(
    fx.memory,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, theory: fx.fresh() } },
  ));
}

// A different valid Context cannot be silently accepted as the judgment Context.
{
  const fx = fixture();
  const otherContext = defineContext(fx.memory, fx.fresh(), fx.fresh());
  expectJudgmentError("judgment-context-mismatch", () => replayStructuralJudgment(
    fx.memory,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, context: otherContext } },
  ));
}

// An ordinary relation is not an alternative encoding of Context K.
{
  const fx = fixture();
  const invalidContext = fx.memory.ensure(fx.fresh(), fx.fresh());
  expectJudgmentError("invalid-judgment-context", () => replayStructuralJudgment(
    fx.memory,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, context: invalidContext } },
  ));
}

// A valid application cannot prove a different selected claim.
{
  const fx = fixture();
  const forgedClaim = fx.memory.ensure(fx.fresh(), fx.fresh());
  expectJudgmentError("judgment-claim-mismatch", () => replayStructuralJudgment(
    fx.memory,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, claim: forgedClaim } },
  ));
}

// Admission remains structural T ⟼ Rule evidence, never a host callback name.
{
  const fx = fixture();
  const forgedAdmission = fx.memory.ensure(fx.fresh(), fx.rule);
  expectJudgmentError("invalid-rule-application", () => replayStructuralJudgment(
    fx.memory,
    { ...fx.evidence, application: { ...fx.evidence.application, ruleAdmission: forgedAdmission } },
  ));
}

// Even when the selected judgment repeats a forged body, exact Act bindings win.
{
  const fx = fixture();
  const forgedClaim = fx.memory.ensure(fx.fresh(), fx.fresh());
  expectJudgmentError("invalid-rule-application", () => replayStructuralJudgment(
    fx.memory,
    {
      application: { ...fx.evidence.application, claimedBody: forgedClaim },
      judgment: { ...fx.evidence.judgment, claim: forgedClaim },
    },
  ));
}

// Foreign handles cannot cross the Memory boundary as judgment evidence.
{
  const fx = fixture();
  const foreign = new Memory().root;
  expectJudgmentError("invalid-judgment-evidence", () => replayStructuralJudgment(
    fx.memory,
    { ...fx.evidence, judgment: { ...fx.evidence.judgment, claim: foreign } },
  ));
}

interface DerivationEnvironment {
  readonly theory: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly expectedInterpreter: StructuralInterpreter;
}

interface DerivationNodeFixture {
  readonly node: StructuralDerivationNodeEvidence;
  readonly occurrence: LinkHandle;
  readonly act: LinkHandle;
  readonly claim: LinkHandle;
  readonly derivationRule: LinkHandle;
}

interface DerivationFixture {
  readonly memory: Memory;
  readonly fresh: () => LinkHandle;
  readonly theory: LinkHandle;
  readonly context: LinkHandle;
  readonly leftRole: LinkHandle;
  readonly rightRole: LinkHandle;
  readonly left: LinkHandle;
  readonly right: LinkHandle;
  readonly mainEnvironment: DerivationEnvironment;
  readonly environment: (theory: LinkHandle) => DerivationEnvironment;
  readonly node: (
    environment: DerivationEnvironment,
    roles: readonly LinkHandle[],
    bindings: readonly (readonly [LinkHandle, LinkHandle])[],
    template: LinkHandle,
    claim: LinkHandle,
    premiseTemplates: readonly LinkHandle[],
    premiseOccurrences: readonly LinkHandle[],
  ) => DerivationNodeFixture;
}

function derivationFixture(): DerivationFixture {
  const memory = new Memory();
  const { R, U } = ensureRootBasis(memory);
  let cursor = U;
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, R);
    return cursor;
  };

  const dictionary = fresh();
  const grammar = fresh();
  const theory = fresh();
  const context = defineContext(memory, fresh(), fresh());
  const leftRole = fresh();
  const rightRole = fresh();
  const left = fresh();
  const right = fresh();

  const environment = (selectedTheory: LinkHandle): DerivationEnvironment => {
    const expectedInterpreter: StructuralInterpreter = Object.freeze({
      dictionary,
      grammar,
      theory: selectedTheory,
    });
    return Object.freeze({
      theory: selectedTheory,
      interpreter: defineStructuralInterpreter(memory, dictionary, grammar, selectedTheory),
      expectedInterpreter,
    });
  };

  const mainEnvironment = environment(theory);

  const node = (
    selectedEnvironment: DerivationEnvironment,
    roles: readonly LinkHandle[],
    bindings: readonly (readonly [LinkHandle, LinkHandle])[],
    template: LinkHandle,
    claim: LinkHandle,
    premiseTemplates: readonly LinkHandle[],
    premiseOccurrences: readonly LinkHandle[],
  ): DerivationNodeFixture => {
    const roleDictionary = defineStructuralRoleDictionary(memory, roles);
    const rule = defineStructuralRule(memory, roleDictionary, template);
    const ruleAdmission = admitStructuralRule(memory, selectedEnvironment.theory, rule);
    const act = defineActHeader(
      memory,
      selectedEnvironment.interpreter,
      roleDictionary,
      context,
    );
    for (const [role, value] of bindings) {
      defineActField(memory, act, role, value);
    }

    const judgment: StructuralJudgmentEvidence = Object.freeze({
      application: Object.freeze({
        act,
        rule,
        ruleAdmission,
        claimedBody: claim,
        expectedInterpreter: selectedEnvironment.expectedInterpreter,
        expectedAfterContext: context,
      }),
      judgment: Object.freeze({
        theory: selectedEnvironment.theory,
        context,
        claim,
      }),
    });

    const occurrence = defineStructuralProofOccurrence(memory, act, claim);
    const derivationRule = defineStructuralDerivationRule(memory, rule, premiseTemplates);
    const derivationRuleAdmission = admitStructuralDerivationRule(
      memory,
      selectedEnvironment.theory,
      derivationRule,
    );
    const premiseOccurrenceSequence = materializeExactSequence(memory, premiseOccurrences);

    return Object.freeze({
      node: Object.freeze({
        occurrence,
        judgment,
        derivationRule,
        derivationRuleAdmission,
        premiseOccurrenceSequence,
      }),
      occurrence,
      act,
      claim,
      derivationRule,
    });
  };

  return {
    memory,
    fresh,
    theory,
    context,
    leftRole,
    rightRole,
    left,
    right,
    mainEnvironment,
    environment,
    node,
  };
}

function zeroLeft(fx: DerivationFixture): DerivationNodeFixture {
  return fx.node(
    fx.mainEnvironment,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [],
    [],
  );
}

function zeroRight(fx: DerivationFixture): DerivationNodeFixture {
  return fx.node(
    fx.mainEnvironment,
    [fx.rightRole],
    [[fx.rightRole, fx.right]],
    fx.rightRole,
    fx.right,
    [],
    [],
  );
}

function branchEvidence(fx: DerivationFixture): {
  readonly leftRoot: DerivationNodeFixture;
  readonly rightRoot: DerivationNodeFixture;
  readonly target: DerivationNodeFixture;
  readonly evidence: StructuralDerivationEvidence;
} {
  const leftRoot = zeroLeft(fx);
  const rightRoot = zeroRight(fx);
  const targetClaim = fx.memory.ensure(fx.left, fx.right);
  const targetTemplate = fx.memory.ensure(fx.leftRole, fx.rightRole);
  const target = fx.node(
    fx.mainEnvironment,
    [fx.leftRole, fx.rightRole],
    [[fx.leftRole, fx.left], [fx.rightRole, fx.right]],
    targetTemplate,
    targetClaim,
    [fx.leftRole, fx.rightRole],
    [leftRoot.occurrence, rightRoot.occurrence],
  );
  return {
    leftRoot,
    rightRoot,
    target,
    evidence: Object.freeze({
      theory: fx.theory,
      targetOccurrence: target.occurrence,
      nodes: Object.freeze([target.node, rightRoot.node, leftRoot.node]),
    }),
  };
}

// Zero-premise admitted DerivationRule is an explicit structural proof root.
{
  const fx = derivationFixture();
  const root = zeroLeft(fx);
  const before = fx.memory.linkCount;
  const result = replayStructuralDerivation(fx.memory, {
    theory: fx.theory,
    targetOccurrence: root.occurrence,
    nodes: [root.node],
  });
  same(result.targetOccurrence, root.occurrence, "zero-premise target occurrence");
  same(result.target.judgment.claim, fx.left, "zero-premise target claim");
  same(result.occurrenceCount, 1, "zero-premise closure size");
  same(fx.memory.linkCount, before, "derivation replay must be read-only");
}

// Linear proof: two different Acts can be distinct proof histories for one Claim.
{
  const fx = derivationFixture();
  const root = zeroLeft(fx);
  const step = fx.node(
    fx.mainEnvironment,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [fx.leftRole],
    [root.occurrence],
  );
  assert(step.act !== root.act, "linear proof must use a second Act occurrence");
  assert(step.occurrence !== root.occurrence, "same Claim with different Acts must have distinct occurrences");
  same(step.claim, root.claim, "proof history must not redefine Claim identity");
  const result = replayStructuralDerivation(fx.memory, {
    theory: fx.theory,
    targetOccurrence: step.occurrence,
    nodes: [step.node, root.node],
  });
  same(result.occurrenceCount, 2, "linear closure size");
}

// Branching proof and outer host node order are independent.
{
  const fx = derivationFixture();
  const branch = branchEvidence(fx);
  const before = fx.memory.linkCount;
  const first = replayStructuralDerivation(fx.memory, branch.evidence);
  const reordered = replayStructuralDerivation(fx.memory, {
    ...branch.evidence,
    nodes: [branch.leftRoot.node, branch.target.node, branch.rightRoot.node],
  });
  same(first.target.judgment.claim, branch.target.claim, "branch target claim");
  same(reordered.target.judgment.claim, branch.target.claim, "reordered host transport target");
  same(first.occurrenceCount, 3, "branch closure size");
  same(reordered.occurrenceCount, 3, "reordered branch closure size");
  same(fx.memory.linkCount, before, "host reorder replay must be read-only");
}

// Missing dependency node cannot be repaired by a valid target application.
{
  const fx = derivationFixture();
  const branch = branchEvidence(fx);
  expectDerivationError("dependency-occurrence-not-found", () => replayStructuralDerivation(
    fx.memory,
    { ...branch.evidence, nodes: [branch.target.node, branch.leftRoot.node] },
  ));
}

// Premise occurrence cardinality is exact against the admitted DerivationRule schema.
{
  const fx = derivationFixture();
  const branch = branchEvidence(fx);
  const missingSequence = materializeExactSequence(fx.memory, [branch.leftRoot.occurrence]);
  expectDerivationError("missing-premise", () => replayStructuralDerivation(
    fx.memory,
    {
      ...branch.evidence,
      nodes: [
        { ...branch.target.node, premiseOccurrenceSequence: missingSequence },
        branch.leftRoot.node,
        branch.rightRoot.node,
      ],
    },
  ));

  const extraSequence = materializeExactSequence(
    fx.memory,
    [branch.leftRoot.occurrence, branch.rightRoot.occurrence, branch.leftRoot.occurrence],
  );
  expectDerivationError("extra-premise", () => replayStructuralDerivation(
    fx.memory,
    {
      ...branch.evidence,
      nodes: [
        { ...branch.target.node, premiseOccurrenceSequence: extraSequence },
        branch.leftRoot.node,
        branch.rightRoot.node,
      ],
    },
  ));
}

// Premise order comes from structural ExactSequence, not host nodes[].
{
  const fx = derivationFixture();
  const branch = branchEvidence(fx);
  const swapped = materializeExactSequence(
    fx.memory,
    [branch.rightRoot.occurrence, branch.leftRoot.occurrence],
  );
  expectDerivationError("premise-claim-mismatch", () => replayStructuralDerivation(
    fx.memory,
    {
      ...branch.evidence,
      nodes: [
        { ...branch.target.node, premiseOccurrenceSequence: swapped },
        branch.rightRoot.node,
        branch.leftRoot.node,
      ],
    },
  ));
}

// ProofOccurrence must structurally equal Pair(Act, Claim).
{
  const fx = derivationFixture();
  const root = zeroLeft(fx);
  const forgedOccurrence = fx.memory.ensure(fx.fresh(), fx.fresh());
  expectDerivationError("occurrence-mismatch", () => replayStructuralDerivation(
    fx.memory,
    {
      theory: fx.theory,
      targetOccurrence: forgedOccurrence,
      nodes: [{ ...root.node, occurrence: forgedOccurrence }],
    },
  ));
}

// Structural occurrence identity is unique in the transport set.
{
  const fx = derivationFixture();
  const root = zeroLeft(fx);
  expectDerivationError("duplicate-occurrence", () => replayStructuralDerivation(
    fx.memory,
    {
      theory: fx.theory,
      targetOccurrence: root.occurrence,
      nodes: [root.node, root.node],
    },
  ));
}

// A DerivationRule requires its own exact T ⟼ DerivationRule admission.
{
  const fx = derivationFixture();
  const root = zeroLeft(fx);
  const forgedAdmission = fx.memory.ensure(fx.fresh(), root.derivationRule);
  expectDerivationError("derivation-rule-not-admitted", () => replayStructuralDerivation(
    fx.memory,
    {
      theory: fx.theory,
      targetOccurrence: root.occurrence,
      nodes: [{ ...root.node, derivationRuleAdmission: forgedAdmission }],
    },
  ));
}

// A valid node from another Theory cannot satisfy a dependency in this derivation.
{
  const fx = derivationFixture();
  const otherTheory = fx.fresh();
  const otherEnvironment = fx.environment(otherTheory);
  const foreignTheoryRoot = fx.node(
    otherEnvironment,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [],
    [],
  );
  const target = fx.node(
    fx.mainEnvironment,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [fx.leftRole],
    [foreignTheoryRoot.occurrence],
  );
  expectDerivationError("cross-theory-node", () => replayStructuralDerivation(
    fx.memory,
    {
      theory: fx.theory,
      targetOccurrence: target.occurrence,
      nodes: [target.node, foreignTheoryRoot.node],
    },
  ));
}

// Cyclic dependencies fail closed; recursive proof semantics is not implicit.
{
  const fx = derivationFixture();
  const first = fx.node(
    fx.mainEnvironment,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [fx.leftRole],
    [],
  );
  const second = fx.node(
    fx.mainEnvironment,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [fx.leftRole],
    [],
  );
  const firstDeps = materializeExactSequence(fx.memory, [second.occurrence]);
  const secondDeps = materializeExactSequence(fx.memory, [first.occurrence]);
  expectDerivationError("cyclic-dependency", () => replayStructuralDerivation(
    fx.memory,
    {
      theory: fx.theory,
      targetOccurrence: first.occurrence,
      nodes: [
        { ...first.node, premiseOccurrenceSequence: firstDeps },
        { ...second.node, premiseOccurrenceSequence: secondDeps },
      ],
    },
  ));
}

// Supplied evidence must be the exact target closure; unrelated valid nodes are rejected.
{
  const fx = derivationFixture();
  const branch = branchEvidence(fx);
  const unrelated = fx.node(
    fx.mainEnvironment,
    [fx.leftRole],
    [[fx.leftRole, fx.left]],
    fx.leftRole,
    fx.left,
    [],
    [],
  );
  expectDerivationError("unreachable-node", () => replayStructuralDerivation(
    fx.memory,
    { ...branch.evidence, nodes: [...branch.evidence.nodes, unrelated.node] },
  ));
}

// Foreign target handles fail at the Memory boundary rather than becoming host IDs.
{
  const fx = derivationFixture();
  const root = zeroLeft(fx);
  const foreign = new Memory().root;
  expectDerivationError("invalid-derivation-evidence", () => replayStructuralDerivation(
    fx.memory,
    {
      theory: fx.theory,
      targetOccurrence: foreign,
      nodes: [root.node],
    },
  ));
}
