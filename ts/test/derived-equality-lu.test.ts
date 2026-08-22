import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  InterpreterReplayError,
  replayEqualityEvaluation,
  type EqualityReplayEvidence,
  type EqualityRoles,
} from "../src/interpreter.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  defineContext,
  defineLocalRepresentativeBinding,
} from "../src/state.js";
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
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  replayStructuralDerivation,
  type StructuralDerivationEvidence,
  type StructuralDerivationNodeEvidence,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`P9d Eq->L/U: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectEqualityReject(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof InterpreterReplayError, `${message}: wrong error type`);
    same(error.code, "invalid-equality-evidence", `${message}: wrong equality error`);
    return;
  }
  throw new Error(`P9d Eq->L/U: ${message}: expected equality rejection`);
}

function expectDerivationReject(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralDerivationReplayError, `${message}: wrong error type`);
    return;
  }
  throw new Error(`P9d Eq->L/U: ${message}: expected derivation rejection`);
}

type Binding = readonly [LinkHandle, LinkHandle];

interface RulePack {
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

interface ResolvedNode extends BuiltNode {
  readonly equality: EqualityReplayEvidence;
}

interface ResolvedOptions {
  readonly omitRightRepresentative?: boolean;
  readonly headerContext?: LinkHandle;
}

function fixture() {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const { R, O, C, L, U } = basis;
  assert(O !== C, "closed representative domain requires distinct O/C");
  assert(L !== U, "boolean carrier requires distinct L/U");

  let cursor = U;
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const exact = (values: readonly LinkHandle[]): LinkHandle => materializeExactSequence(memory, values);

  const dictionary = fresh();
  const grammar = fresh();
  const theory = fresh();
  const foreignTheory = fresh();
  const resolvedTag = fresh();
  const distinctTag = fresh();
  const eqValueTag = fresh();

  const contextRole = fresh();
  const leftRole = fresh();
  const rightRole = fresh();
  const leftRepresentativeRole = fresh();
  const rightRepresentativeRole = fresh();
  const equalityRoles: EqualityRoles = Object.freeze({
    context: contextRole,
    left: leftRole,
    right: rightRole,
    leftRepresentative: leftRepresentativeRole,
    rightRepresentative: rightRepresentativeRole,
  });

  const expectedInterpreter: StructuralInterpreter = { dictionary, grammar, theory };
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);

  const resolved = (
    context: LinkHandle,
    left: LinkHandle,
    right: LinkHandle,
    leftRepresentative: LinkHandle,
    rightRepresentative: LinkHandle,
  ): LinkHandle => exact([
    resolvedTag,
    context,
    left,
    right,
    leftRepresentative,
    rightRepresentative,
  ]);

  const distinct = (leftRepresentative: LinkHandle, rightRepresentative: LinkHandle): LinkHandle =>
    exact([distinctTag, leftRepresentative, rightRepresentative]);

  const eqValue = (
    context: LinkHandle,
    left: LinkHandle,
    right: LinkHandle,
    result: LinkHandle,
  ): LinkHandle => exact([eqValueTag, context, left, right, result]);

  function makePack(
    roles: readonly LinkHandle[],
    conclusionTemplate: LinkHandle,
    premiseTemplates: readonly LinkHandle[],
  ): RulePack {
    const roleDictionary = defineStructuralRoleDictionary(memory, roles);
    const rule = defineStructuralRule(memory, roleDictionary, conclusionTemplate);
    const ruleAdmission = admitStructuralRule(memory, theory, rule);
    const derivationRule = defineStructuralDerivationRule(memory, rule, premiseTemplates);
    const derivationAdmission = admitStructuralDerivationRule(memory, theory, derivationRule);
    return Object.freeze({
      roleDictionary,
      rule,
      ruleAdmission,
      derivationRule,
      derivationAdmission,
    });
  }

  const resolvedPack = makePack(
    [contextRole, leftRole, rightRole, leftRepresentativeRole, rightRepresentativeRole],
    resolved(
      contextRole,
      leftRole,
      rightRole,
      leftRepresentativeRole,
      rightRepresentativeRole,
    ),
    [],
  );

  const lContextRole = fresh();
  const lLeftRole = fresh();
  const lRightRole = fresh();
  const lRepresentativeRole = fresh();
  const lPack = makePack(
    [lContextRole, lLeftRole, lRightRole, lRepresentativeRole],
    eqValue(lContextRole, lLeftRole, lRightRole, L),
    [resolved(
      lContextRole,
      lLeftRole,
      lRightRole,
      lRepresentativeRole,
      lRepresentativeRole,
    )],
  );

  const uContextRole = fresh();
  const uLeftRole = fresh();
  const uRightRole = fresh();
  const uLeftRepresentativeRole = fresh();
  const uRightRepresentativeRole = fresh();
  const uPack = makePack(
    [uContextRole, uLeftRole, uRightRole, uLeftRepresentativeRole, uRightRepresentativeRole],
    eqValue(uContextRole, uLeftRole, uRightRole, U),
    [
      resolved(
        uContextRole,
        uLeftRole,
        uRightRole,
        uLeftRepresentativeRole,
        uRightRepresentativeRole,
      ),
      distinct(uLeftRepresentativeRole, uRightRepresentativeRole),
    ],
  );

  // The two grounded rows are the explicit closed disequality fragment over {O,C}.
  // Equality on the diagonal is handled constructively by lPack, so no negative
  // host predicate or global closed-world assumption is needed.
  const distinctOC = distinct(O, C);
  const distinctCO = distinct(C, O);
  const distinctOCPack = makePack([], distinctOC, []);
  const distinctCOPack = makePack([], distinctCO, []);

  function node(
    pack: RulePack,
    bindings: readonly Binding[],
    claim: LinkHandle,
    premises: readonly LinkHandle[],
    context: LinkHandle,
    headerContext: LinkHandle = context,
    ruleAdmission: LinkHandle = pack.ruleAdmission,
  ): BuiltNode {
    const act = defineActHeader(memory, interpreter, pack.roleDictionary, headerContext);
    for (const [role, value] of bindings) defineActField(memory, act, role, value);
    const judgment: StructuralJudgmentEvidence = {
      application: {
        act,
        rule: pack.rule,
        ruleAdmission,
        claimedBody: claim,
        expectedInterpreter,
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
        derivationRule: pack.derivationRule,
        derivationRuleAdmission: pack.derivationAdmission,
        premiseOccurrenceSequence: exact(premises),
      }),
    });
  }

  function resolvedNode(
    context: LinkHandle,
    left: LinkHandle,
    right: LinkHandle,
    leftRepresentative: LinkHandle,
    rightRepresentative: LinkHandle,
    options: ResolvedOptions = {},
  ): ResolvedNode {
    const bindings: Binding[] = [
      [contextRole, context],
      [leftRole, left],
      [rightRole, right],
      [leftRepresentativeRole, leftRepresentative],
    ];
    if (!options.omitRightRepresentative) {
      bindings.push([rightRepresentativeRole, rightRepresentative]);
    }
    const built = node(
      resolvedPack,
      bindings,
      resolved(context, left, right, leftRepresentative, rightRepresentative),
      [],
      context,
      options.headerContext ?? context,
    );
    return Object.freeze({
      ...built,
      equality: Object.freeze({
        act: built.node.judgment.application.act,
        roles: equalityRoles,
        interpreter,
        roleDictionary: resolvedPack.roleDictionary,
      }),
    });
  }

  function lNode(
    context: LinkHandle,
    left: LinkHandle,
    right: LinkHandle,
    representative: LinkHandle,
    resolvedOccurrence: LinkHandle,
    result: LinkHandle = L,
  ): BuiltNode {
    return node(
      lPack,
      [
        [lContextRole, context],
        [lLeftRole, left],
        [lRightRole, right],
        [lRepresentativeRole, representative],
      ],
      eqValue(context, left, right, result),
      [resolvedOccurrence],
      context,
    );
  }

  function uNode(
    context: LinkHandle,
    left: LinkHandle,
    right: LinkHandle,
    leftRepresentative: LinkHandle,
    rightRepresentative: LinkHandle,
    resolvedOccurrence: LinkHandle,
    distinctOccurrence: LinkHandle,
    result: LinkHandle = U,
  ): BuiltNode {
    return node(
      uPack,
      [
        [uContextRole, context],
        [uLeftRole, left],
        [uRightRole, right],
        [uLeftRepresentativeRole, leftRepresentative],
        [uRightRepresentativeRole, rightRepresentative],
      ],
      eqValue(context, left, right, result),
      [resolvedOccurrence, distinctOccurrence],
      context,
    );
  }

  const distinctRoot = (
    pack: RulePack,
    claim: LinkHandle,
    context: LinkHandle,
  ): BuiltNode => node(pack, [], claim, [], context);

  function derivation(target: BuiltNode, nodes: readonly BuiltNode[]): StructuralDerivationEvidence {
    return Object.freeze({
      theory,
      targetOccurrence: target.occurrence,
      nodes: Object.freeze(nodes.map((built) => built.node)),
    });
  }

  function replayVerified(
    resolvedEvidence: readonly EqualityReplayEvidence[],
    proof: StructuralDerivationEvidence,
    readMemory: ReadMemory = memory,
  ) {
    const before = readMemory.linkCount;
    for (const equality of resolvedEvidence) {
      // Existing Eq_K replay validates K and both claimed representatives.
      // Its host boolean is deliberately discarded: it does not select L/U.
      void replayEqualityEvaluation(readMemory, equality);
    }
    const checked = replayStructuralDerivation(readMemory, proof);
    same(readMemory.linkCount, before, "composed equality/derivation replay must be read-only");
    return checked;
  }

  function resultOf(claim: LinkHandle): LinkHandle {
    const values = readExactSequence(memory, claim).values;
    same(values[0], eqValueTag, "EqValue tag");
    assert(values.length === 5, "EqValue arity");
    const result = values[4];
    assert(result !== undefined, "EqValue result missing");
    return result;
  }

  return {
    memory,
    basis,
    theory,
    foreignTheory,
    resolvedPack,
    lPack,
    uPack,
    distinctOC,
    distinctCO,
    distinctOCPack,
    distinctCOPack,
    fresh,
    resolvedNode,
    lNode,
    uNode,
    distinctRoot,
    derivation,
    replayVerified,
    resultOf,
  };
}

// Canonical identity and an unbound member fallback both produce L through the
// repeated representative role. No host boolean chooses the result.
{
  const fx = fixture();
  const { memory, basis } = fx;
  const X = fx.fresh();
  const K = defineContext(memory, basis.R, basis.O);
  const resolved = fx.resolvedNode(K, X, X, X, X);
  const target = fx.lNode(K, X, X, X, resolved.occurrence);
  const checked = fx.replayVerified([resolved.equality], fx.derivation(target, [target, resolved]));
  same(fx.resultOf(checked.target.judgment.claim), basis.L, "same semantic Link -> L");
}

// Two distinct members may resolve to one contextual representative and derive L.
{
  const fx = fixture();
  const { memory, basis } = fx;
  const X = fx.fresh();
  const Y = fx.fresh();
  const K = defineContext(memory, basis.R, basis.O);
  defineLocalRepresentativeBinding(memory, K, X, basis.O);
  defineLocalRepresentativeBinding(memory, K, Y, basis.O);
  const resolved = fx.resolvedNode(K, X, Y, basis.O, basis.O);
  const target = fx.lNode(K, X, Y, basis.O, resolved.occurrence);
  const checked = fx.replayVerified([resolved.equality], fx.derivation(target, [resolved, target]));
  same(fx.resultOf(checked.target.judgment.claim), basis.L, "context-equal distinct members -> L");
}

// The same X/Y can be L in one explicit K and U in another. U additionally
// requires an explicit Distinct(O,C) proof row from the selected Theory.
{
  const fx = fixture();
  const { memory, basis } = fx;
  const X = fx.fresh();
  const Y = fx.fresh();
  const outer = defineContext(memory, basis.R, basis.O);
  const inner = defineContext(memory, outer, basis.C);
  defineLocalRepresentativeBinding(memory, outer, X, basis.O);
  defineLocalRepresentativeBinding(memory, outer, Y, basis.O);
  defineLocalRepresentativeBinding(memory, inner, X, basis.O);
  defineLocalRepresentativeBinding(memory, inner, Y, basis.C);

  const outerResolved = fx.resolvedNode(outer, X, Y, basis.O, basis.O);
  const outerTarget = fx.lNode(outer, X, Y, basis.O, outerResolved.occurrence);
  const outerChecked = fx.replayVerified(
    [outerResolved.equality],
    fx.derivation(outerTarget, [outerResolved, outerTarget]),
  );
  same(fx.resultOf(outerChecked.target.judgment.claim), basis.L, "outer Eq_K -> L");

  const innerResolved = fx.resolvedNode(inner, X, Y, basis.O, basis.C);
  const distinct = fx.distinctRoot(fx.distinctOCPack, fx.distinctOC, inner);
  const innerTarget = fx.uNode(
    inner,
    X,
    Y,
    basis.O,
    basis.C,
    innerResolved.occurrence,
    distinct.occurrence,
  );
  const innerChecked = fx.replayVerified(
    [innerResolved.equality],
    fx.derivation(innerTarget, [innerTarget, distinct, innerResolved]),
  );
  same(fx.resultOf(innerChecked.target.judgment.claim), basis.U, "inner explicit disequality -> U");
}

// The second off-diagonal row closes the two-representative {O,C} decision table.
{
  const fx = fixture();
  const { memory, basis } = fx;
  const X = fx.fresh();
  const Y = fx.fresh();
  const K = defineContext(memory, basis.R, basis.C);
  defineLocalRepresentativeBinding(memory, K, X, basis.C);
  defineLocalRepresentativeBinding(memory, K, Y, basis.O);
  const resolved = fx.resolvedNode(K, X, Y, basis.C, basis.O);
  const distinct = fx.distinctRoot(fx.distinctCOPack, fx.distinctCO, K);
  const target = fx.uNode(K, X, Y, basis.C, basis.O, resolved.occurrence, distinct.occurrence);
  const checked = fx.replayVerified(
    [resolved.equality],
    fx.derivation(target, [distinct, target, resolved]),
  );
  same(fx.resultOf(checked.target.judgment.claim), basis.U, "reverse closed row -> U");
}

// A valid false host equality result outside the closed fragment is not U.
// Distinct(X,Y) was never admitted, so the only available O/C row cannot satisfy the proof.
{
  const fx = fixture();
  const { memory, basis } = fx;
  const X = fx.fresh();
  const Y = fx.fresh();
  const K = defineContext(memory, basis.R, basis.O);
  const resolved = fx.resolvedNode(K, X, Y, X, Y);
  const distinct = fx.distinctRoot(fx.distinctOCPack, fx.distinctOC, K);
  const target = fx.uNode(K, X, Y, X, Y, resolved.occurrence, distinct.occurrence);
  expectDerivationReject(
    () => fx.replayVerified([resolved.equality], fx.derivation(target, [resolved, distinct, target])),
    "uncovered distinct pair must stay unknown, not U",
  );
}

// L cannot be proposed for distinct resolved representatives.
{
  const fx = fixture();
  const { memory, basis } = fx;
  const X = fx.fresh();
  const Y = fx.fresh();
  const K = defineContext(memory, basis.R, basis.O);
  defineLocalRepresentativeBinding(memory, K, X, basis.O);
  defineLocalRepresentativeBinding(memory, K, Y, basis.C);
  const resolved = fx.resolvedNode(K, X, Y, basis.O, basis.C);
  const target = fx.lNode(K, X, Y, basis.O, resolved.occurrence);
  expectDerivationReject(
    () => fx.replayVerified([resolved.equality], fx.derivation(target, [target, resolved])),
    "distinct representatives cannot satisfy L premise",
  );
}

// U cannot be proposed for equal representatives because there is no admitted
// Distinct(O,O) row; borrowing Distinct(O,C) fails structural premise matching.
{
  const fx = fixture();
  const { memory, basis } = fx;
  const X = fx.fresh();
  const Y = fx.fresh();
  const K = defineContext(memory, basis.R, basis.O);
  defineLocalRepresentativeBinding(memory, K, X, basis.O);
  defineLocalRepresentativeBinding(memory, K, Y, basis.O);
  const resolved = fx.resolvedNode(K, X, Y, basis.O, basis.O);
  const distinct = fx.distinctRoot(fx.distinctOCPack, fx.distinctOC, K);
  const target = fx.uNode(K, X, Y, basis.O, basis.O, resolved.occurrence, distinct.occurrence);
  expectDerivationReject(
    () => fx.replayVerified([resolved.equality], fx.derivation(target, [resolved, target, distinct])),
    "equal representatives cannot satisfy U premise",
  );
}

// Forged/missing/conflicting representative evidence is rejected by Eq_K itself
// before any Link-valued result is available; invalid evidence is never U.
{
  const fx = fixture();
  const { memory, basis } = fx;
  const X = fx.fresh();
  const Y = fx.fresh();
  const forged = fx.fresh();
  const K = defineContext(memory, basis.R, basis.O);
  defineLocalRepresentativeBinding(memory, K, X, basis.O);
  defineLocalRepresentativeBinding(memory, K, Y, basis.C);
  const forgedResolved = fx.resolvedNode(K, X, Y, forged, basis.C);
  expectEqualityReject(
    () => fx.replayVerified([forgedResolved.equality], fx.derivation(forgedResolved, [forgedResolved])),
    "forged representative",
  );

  const missing = fx.resolvedNode(K, X, Y, basis.O, basis.C, { omitRightRepresentative: true });
  expectEqualityReject(
    () => fx.replayVerified([missing.equality], fx.derivation(missing, [missing])),
    "missing representative field",
  );

  defineLocalRepresentativeBinding(memory, K, X, basis.C);
  const conflict = fx.resolvedNode(K, X, Y, basis.O, basis.C);
  expectEqualityReject(
    () => fx.replayVerified([conflict.equality], fx.derivation(conflict, [conflict])),
    "representative conflict",
  );
}

// A foreign Act header context is invalid equality evidence, not false/U.
{
  const fx = fixture();
  const { memory, basis } = fx;
  const X = fx.fresh();
  const K = defineContext(memory, basis.R, basis.O);
  const foreignK = defineContext(memory, basis.R, basis.C);
  const resolved = fx.resolvedNode(K, X, X, X, X, { headerContext: foreignK });
  expectEqualityReject(
    () => fx.replayVerified([resolved.equality], fx.derivation(resolved, [resolved])),
    "foreign equality context",
  );
}

// An alternate truth atom cannot impersonate L even when Eq_K is valid.
{
  const fx = fixture();
  const { memory, basis } = fx;
  const X = fx.fresh();
  const alternate = fx.fresh();
  const K = defineContext(memory, basis.R, basis.O);
  const resolved = fx.resolvedNode(K, X, X, X, X);
  const target = fx.lNode(K, X, X, X, resolved.occurrence, alternate);
  expectDerivationReject(
    () => fx.replayVerified([resolved.equality], fx.derivation(target, [resolved, target])),
    "alternate boolean atom",
  );
}

// Host metadata has no semantic authority. Even metadata claiming U/false cannot
// alter an equality proof whose structural representatives derive L.
{
  const fx = fixture();
  const { memory, basis } = fx;
  const X = fx.fresh();
  const K = defineContext(memory, basis.R, basis.O);
  const resolved = fx.resolvedNode(K, X, X, X, X);
  const noisyEquality = Object.freeze({ ...resolved.equality, equal: false, branch: "U" });
  const target = fx.lNode(K, X, X, X, resolved.occurrence);
  const checked = fx.replayVerified([noisyEquality], fx.derivation(target, [target, resolved]));
  same(fx.resultOf(checked.target.judgment.claim), basis.L, "host metadata cannot select U");
}

// Wrong Theory admission cannot authorize the otherwise matching L rule.
{
  const fx = fixture();
  const { memory, basis } = fx;
  const X = fx.fresh();
  const K = defineContext(memory, basis.R, basis.O);
  const resolved = fx.resolvedNode(K, X, X, X, X);
  const target = fx.lNode(K, X, X, X, resolved.occurrence);
  const foreignAdmission = memory.ensure(fx.foreignTheory, fx.lPack.rule);
  const forgedTarget: BuiltNode = Object.freeze({
    occurrence: target.occurrence,
    node: Object.freeze({
      ...target.node,
      judgment: Object.freeze({
        ...target.node.judgment,
        application: Object.freeze({
          ...target.node.judgment.application,
          ruleAdmission: foreignAdmission,
        }),
      }),
    }),
  });
  expectDerivationReject(
    () => fx.replayVerified(
      [resolved.equality],
      fx.derivation(forgedTarget, [resolved, forgedTarget]),
    ),
    "wrong Theory admission",
  );
}

class WriteInjectingProbe implements ReadMemory {
  private injected = false;

  constructor(
    private readonly source: Memory,
    private readonly injectStart: LinkHandle,
    private readonly injectEnd: LinkHandle,
  ) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("P9d probe: find is forbidden"); }
  incoming(): readonly LinkHandle[] { throw new Error("P9d probe: incoming is forbidden"); }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    if (!this.injected) {
      this.injected = true;
      this.source.ensure(this.injectStart, this.injectEnd);
    }
    return this.source.outgoing(start);
  }
}

// A hostile ReadMemory that mutates during replay is rejected instead of turning
// an unstable lookup into either L or U.
{
  const fx = fixture();
  const { memory, basis } = fx;
  const X = fx.fresh();
  const K = defineContext(memory, basis.R, basis.O);
  const resolved = fx.resolvedNode(K, X, X, X, X);
  const injectStart = fx.fresh();
  const injectEnd = fx.fresh();
  assert(memory.find(injectStart, injectEnd) === undefined, "write-injection pair must start absent");
  const probe = new WriteInjectingProbe(memory, injectStart, injectEnd);
  expectEqualityReject(
    () => fx.replayVerified([resolved.equality], fx.derivation(resolved, [resolved]), probe),
    "write injection",
  );
}
