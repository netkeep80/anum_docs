import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  InterpreterReplayError, replayEqualityEvaluation,
  type EqualityReplayEvidence, type EqualityRoles,
} from "../src/interpreter.js";
import {
  Memory, ensureRootBasis,
  type LinkHandle, type LinkPoles, type ReadMemory,
} from "../src/memory.js";
import { defineContext, defineLocalRepresentativeBinding } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  admitStructuralRule, defineStructuralInterpreter,
  defineStructuralRoleDictionary, defineStructuralRule,
  type StructuralInterpreter,
} from "../src/structural-rule.js";
import {
  StructuralDerivationReplayError, admitStructuralDerivationRule,
  defineStructuralDerivationRule, defineStructuralProofOccurrence,
  replayStructuralDerivation,
  type StructuralDerivationEvidence, type StructuralDerivationNodeEvidence,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`P9d Eq->L/U: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function equalityReject(effect: () => unknown, message: string): void {
  try { effect(); } catch (error) {
    assert(error instanceof InterpreterReplayError, `${message}: wrong error type`);
    same(error.code, "invalid-equality-evidence", `${message}: wrong equality error`);
    return;
  }
  throw new Error(`P9d Eq->L/U: ${message}: expected equality rejection`);
}
function derivationReject(effect: () => unknown, message: string): void {
  try { effect(); } catch (error) {
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
interface BuiltNode { readonly occurrence: LinkHandle; readonly node: StructuralDerivationNodeEvidence; }
interface ResolvedNode extends BuiltNode { readonly equality: EqualityReplayEvidence; }
interface ResolvedOptions { readonly omitRightRepresentative?: boolean; readonly headerContext?: LinkHandle; }

function fixture() {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const { R, O, C, L, U } = basis;
  assert(O !== C && L !== U, "closed O/C and L/U carriers must be distinct");
  let cursor = U;
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const exact = (values: readonly LinkHandle[]) => materializeExactSequence(memory, values);

  const dictionary = fresh(), grammar = fresh(), theory = fresh(), foreignTheory = fresh();
  const resolvedTag = fresh(), distinctTag = fresh(), eqValueTag = fresh();
  const contextRole = fresh(), leftRole = fresh(), rightRole = fresh();
  const leftRepresentativeRole = fresh(), rightRepresentativeRole = fresh();
  const equalityRoles: EqualityRoles = Object.freeze({
    context: contextRole, left: leftRole, right: rightRole,
    leftRepresentative: leftRepresentativeRole, rightRepresentative: rightRepresentativeRole,
  });
  const expectedInterpreter: StructuralInterpreter = { dictionary, grammar, theory };
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);

  const resolved = (K: LinkHandle, A: LinkHandle, B: LinkHandle, RA: LinkHandle, RB: LinkHandle) =>
    exact([resolvedTag, K, A, B, RA, RB]);
  const distinct = (RA: LinkHandle, RB: LinkHandle) => exact([distinctTag, RA, RB]);
  const eqValue = (K: LinkHandle, A: LinkHandle, B: LinkHandle, result: LinkHandle) =>
    exact([eqValueTag, K, A, B, result]);

  function pack(roles: readonly LinkHandle[], conclusion: LinkHandle, premises: readonly LinkHandle[]): RulePack {
    const roleDictionary = defineStructuralRoleDictionary(memory, roles);
    const rule = defineStructuralRule(memory, roleDictionary, conclusion);
    const ruleAdmission = admitStructuralRule(memory, theory, rule);
    const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
    const derivationAdmission = admitStructuralDerivationRule(memory, theory, derivationRule);
    return Object.freeze({ roleDictionary, rule, ruleAdmission, derivationRule, derivationAdmission });
  }

  const resolvedPack = pack(
    [contextRole, leftRole, rightRole, leftRepresentativeRole, rightRepresentativeRole],
    resolved(contextRole, leftRole, rightRole, leftRepresentativeRole, rightRepresentativeRole), [],
  );
  const lK = fresh(), lA = fresh(), lB = fresh(), lR = fresh();
  const lPack = pack(
    [lK, lA, lB, lR], eqValue(lK, lA, lB, L), [resolved(lK, lA, lB, lR, lR)],
  );
  const uK = fresh(), uA = fresh(), uB = fresh(), uRA = fresh(), uRB = fresh();
  const uPack = pack(
    [uK, uA, uB, uRA, uRB], eqValue(uK, uA, uB, U),
    [resolved(uK, uA, uB, uRA, uRB), distinct(uRA, uRB)],
  );
  const distinctOC = distinct(O, C), distinctCO = distinct(C, O);
  const distinctOCPack = pack([], distinctOC, []), distinctCOPack = pack([], distinctCO, []);

  function node(
    p: RulePack, bindings: readonly Binding[], claim: LinkHandle,
    premises: readonly LinkHandle[], context: LinkHandle,
    headerContext: LinkHandle = context, ruleAdmission: LinkHandle = p.ruleAdmission,
  ): BuiltNode {
    const act = defineActHeader(memory, interpreter, p.roleDictionary, headerContext);
    for (const [role, value] of bindings) defineActField(memory, act, role, value);
    const judgment: StructuralJudgmentEvidence = {
      application: {
        act, rule: p.rule, ruleAdmission, claimedBody: claim,
        expectedInterpreter, expectedAfterContext: context,
      },
      judgment: { theory, context, claim },
    };
    const occurrence = defineStructuralProofOccurrence(memory, act, claim);
    return Object.freeze({ occurrence, node: Object.freeze({
      occurrence, judgment, derivationRule: p.derivationRule,
      derivationRuleAdmission: p.derivationAdmission,
      premiseOccurrenceSequence: exact(premises),
    }) });
  }

  function resolvedNode(
    K: LinkHandle, A: LinkHandle, B: LinkHandle, RA: LinkHandle, RB: LinkHandle,
    options: ResolvedOptions = {},
  ): ResolvedNode {
    const bindings: Binding[] = [
      [contextRole, K], [leftRole, A], [rightRole, B], [leftRepresentativeRole, RA],
    ];
    if (!options.omitRightRepresentative) bindings.push([rightRepresentativeRole, RB]);
    const built = node(
      resolvedPack, bindings, resolved(K, A, B, RA, RB), [], K, options.headerContext ?? K,
    );
    return Object.freeze({ ...built, equality: Object.freeze({
      act: built.node.judgment.application.act, roles: equalityRoles,
      interpreter, roleDictionary: resolvedPack.roleDictionary,
    }) });
  }

  const lNode = (
    K: LinkHandle, A: LinkHandle, B: LinkHandle, R0: LinkHandle,
    premise: LinkHandle, result: LinkHandle = L,
  ) => node(lPack, [[lK, K], [lA, A], [lB, B], [lR, R0]], eqValue(K, A, B, result), [premise], K);

  const uNode = (
    K: LinkHandle, A: LinkHandle, B: LinkHandle, RA: LinkHandle, RB: LinkHandle,
    resolvedOccurrence: LinkHandle, distinctOccurrence: LinkHandle, result: LinkHandle = U,
  ) => node(
    uPack, [[uK, K], [uA, A], [uB, B], [uRA, RA], [uRB, RB]],
    eqValue(K, A, B, result), [resolvedOccurrence, distinctOccurrence], K,
  );
  const distinctRoot = (p: RulePack, claim: LinkHandle, K: LinkHandle) => node(p, [], claim, [], K);
  const derivation = (target: BuiltNode, nodes: readonly BuiltNode[]): StructuralDerivationEvidence =>
    Object.freeze({ theory, targetOccurrence: target.occurrence, nodes: Object.freeze(nodes.map((x) => x.node)) });

  function replayVerified(
    equalities: readonly EqualityReplayEvidence[], proof: StructuralDerivationEvidence,
    readMemory: ReadMemory = memory,
  ) {
    const before = readMemory.linkCount;
    for (const equality of equalities) void replayEqualityEvaluation(readMemory, equality);
    const checked = replayStructuralDerivation(readMemory, proof);
    same(readMemory.linkCount, before, "composed replay must be read-only");
    return checked;
  }
  function resultOf(claim: LinkHandle): LinkHandle {
    const values = readExactSequence(memory, claim).values;
    same(values[0], eqValueTag, "EqValue tag");
    assert(values.length === 5 && values[4] !== undefined, "EqValue shape");
    return values[4]!;
  }
  return {
    memory, basis, theory, foreignTheory, lPack,
    distinctOC, distinctCO, distinctOCPack, distinctCOPack,
    fresh, resolvedNode, lNode, uNode, distinctRoot, derivation, replayVerified, resultOf,
  };
}

// Unbound canonical fallback Rep_K(X)=X is valid resolved evidence and derives L.
{
  const fx = fixture(), X = fx.fresh();
  const K = defineContext(fx.memory, fx.basis.R, fx.basis.O);
  const r = fx.resolvedNode(K, X, X, X, X), t = fx.lNode(K, X, X, X, r.occurrence);
  const checked = fx.replayVerified([r.equality], fx.derivation(t, [t, r]));
  same(fx.resultOf(checked.target.judgment.claim), fx.basis.L, "same semantic Link -> L");
}

// Distinct members resolving to one representative derive L.
{
  const fx = fixture(), X = fx.fresh(), Y = fx.fresh();
  const K = defineContext(fx.memory, fx.basis.R, fx.basis.O);
  defineLocalRepresentativeBinding(fx.memory, K, X, fx.basis.O);
  defineLocalRepresentativeBinding(fx.memory, K, Y, fx.basis.O);
  const r = fx.resolvedNode(K, X, Y, fx.basis.O, fx.basis.O);
  const t = fx.lNode(K, X, Y, fx.basis.O, r.occurrence);
  const checked = fx.replayVerified([r.equality], fx.derivation(t, [r, t]));
  same(fx.resultOf(checked.target.judgment.claim), fx.basis.L, "context-equal members -> L");
}

// Same X/Y: outer K is L; inner K is U only with explicit Distinct(O,C) evidence.
{
  const fx = fixture(), X = fx.fresh(), Y = fx.fresh();
  const outer = defineContext(fx.memory, fx.basis.R, fx.basis.O);
  const inner = defineContext(fx.memory, outer, fx.basis.C);
  defineLocalRepresentativeBinding(fx.memory, outer, X, fx.basis.O);
  defineLocalRepresentativeBinding(fx.memory, outer, Y, fx.basis.O);
  defineLocalRepresentativeBinding(fx.memory, inner, X, fx.basis.O);
  defineLocalRepresentativeBinding(fx.memory, inner, Y, fx.basis.C);
  const ro = fx.resolvedNode(outer, X, Y, fx.basis.O, fx.basis.O);
  const to = fx.lNode(outer, X, Y, fx.basis.O, ro.occurrence);
  same(
    fx.resultOf(fx.replayVerified([ro.equality], fx.derivation(to, [ro, to])).target.judgment.claim),
    fx.basis.L, "outer Eq_K -> L",
  );
  const ri = fx.resolvedNode(inner, X, Y, fx.basis.O, fx.basis.C);
  const d = fx.distinctRoot(fx.distinctOCPack, fx.distinctOC, inner);
  const ti = fx.uNode(inner, X, Y, fx.basis.O, fx.basis.C, ri.occurrence, d.occurrence);
  same(
    fx.resultOf(fx.replayVerified([ri.equality], fx.derivation(ti, [ti, d, ri])).target.judgment.claim),
    fx.basis.U, "inner explicit disequality -> U",
  );
}

// Reverse off-diagonal row closes the explicit {O,C} decision fragment.
{
  const fx = fixture(), X = fx.fresh(), Y = fx.fresh();
  const K = defineContext(fx.memory, fx.basis.R, fx.basis.C);
  defineLocalRepresentativeBinding(fx.memory, K, X, fx.basis.C);
  defineLocalRepresentativeBinding(fx.memory, K, Y, fx.basis.O);
  const r = fx.resolvedNode(K, X, Y, fx.basis.C, fx.basis.O);
  const d = fx.distinctRoot(fx.distinctCOPack, fx.distinctCO, K);
  const t = fx.uNode(K, X, Y, fx.basis.C, fx.basis.O, r.occurrence, d.occurrence);
  same(
    fx.resultOf(fx.replayVerified([r.equality], fx.derivation(t, [d, t, r])).target.judgment.claim),
    fx.basis.U, "reverse closed row -> U",
  );
}

// Valid host false outside the explicit table remains unknown, not U.
{
  const fx = fixture(), X = fx.fresh(), Y = fx.fresh();
  const K = defineContext(fx.memory, fx.basis.R, fx.basis.O);
  const r = fx.resolvedNode(K, X, Y, X, Y);
  const d = fx.distinctRoot(fx.distinctOCPack, fx.distinctOC, K);
  const t = fx.uNode(K, X, Y, X, Y, r.occurrence, d.occurrence);
  derivationReject(
    () => fx.replayVerified([r.equality], fx.derivation(t, [r, d, t])),
    "uncovered distinct pair must stay unknown",
  );
}

// Structural matching rejects the wrong branch in both directions.
{
  const fx = fixture(), X = fx.fresh(), Y = fx.fresh();
  const K = defineContext(fx.memory, fx.basis.R, fx.basis.O);
  defineLocalRepresentativeBinding(fx.memory, K, X, fx.basis.O);
  defineLocalRepresentativeBinding(fx.memory, K, Y, fx.basis.C);
  const r = fx.resolvedNode(K, X, Y, fx.basis.O, fx.basis.C);
  const l = fx.lNode(K, X, Y, fx.basis.O, r.occurrence);
  derivationReject(() => fx.replayVerified([r.equality], fx.derivation(l, [l, r])), "distinct -> L");
}
{
  const fx = fixture(), X = fx.fresh(), Y = fx.fresh();
  const K = defineContext(fx.memory, fx.basis.R, fx.basis.O);
  defineLocalRepresentativeBinding(fx.memory, K, X, fx.basis.O);
  defineLocalRepresentativeBinding(fx.memory, K, Y, fx.basis.O);
  const r = fx.resolvedNode(K, X, Y, fx.basis.O, fx.basis.O);
  const d = fx.distinctRoot(fx.distinctOCPack, fx.distinctOC, K);
  const u = fx.uNode(K, X, Y, fx.basis.O, fx.basis.O, r.occurrence, d.occurrence);
  derivationReject(() => fx.replayVerified([r.equality], fx.derivation(u, [r, u, d])), "equal -> U");
}

// Forged/missing/conflicting representative evidence is invalid, never U.
{
  const fx = fixture(), X = fx.fresh(), Y = fx.fresh(), forged = fx.fresh();
  const K = defineContext(fx.memory, fx.basis.R, fx.basis.O);
  defineLocalRepresentativeBinding(fx.memory, K, X, fx.basis.O);
  defineLocalRepresentativeBinding(fx.memory, K, Y, fx.basis.C);
  const bad = fx.resolvedNode(K, X, Y, forged, fx.basis.C);
  equalityReject(() => fx.replayVerified([bad.equality], fx.derivation(bad, [bad])), "forged representative");
  const missing = fx.resolvedNode(K, X, Y, fx.basis.O, fx.basis.C, { omitRightRepresentative: true });
  equalityReject(() => fx.replayVerified([missing.equality], fx.derivation(missing, [missing])), "missing field");
  defineLocalRepresentativeBinding(fx.memory, K, X, fx.basis.C);
  const conflict = fx.resolvedNode(K, X, Y, fx.basis.O, fx.basis.C);
  equalityReject(() => fx.replayVerified([conflict.equality], fx.derivation(conflict, [conflict])), "representative conflict");
}

// Foreign K, alternate boolean atom, host metadata and wrong Theory have no authority.
{
  const fx = fixture(), X = fx.fresh();
  const K = defineContext(fx.memory, fx.basis.R, fx.basis.O);
  const foreignK = defineContext(fx.memory, fx.basis.R, fx.basis.C);
  const badK = fx.resolvedNode(K, X, X, X, X, { headerContext: foreignK });
  equalityReject(() => fx.replayVerified([badK.equality], fx.derivation(badK, [badK])), "foreign context");

  const r = fx.resolvedNode(K, X, X, X, X), alternate = fx.fresh();
  const alt = fx.lNode(K, X, X, X, r.occurrence, alternate);
  derivationReject(() => fx.replayVerified([r.equality], fx.derivation(alt, [r, alt])), "alternate boolean atom");

  const noisy = Object.freeze({ ...r.equality, equal: false, branch: "U" });
  const t = fx.lNode(K, X, X, X, r.occurrence);
  same(
    fx.resultOf(fx.replayVerified([noisy], fx.derivation(t, [t, r])).target.judgment.claim),
    fx.basis.L, "host metadata cannot select U",
  );

  const foreignAdmission = fx.memory.ensure(fx.foreignTheory, fx.lPack.rule);
  const forgedTarget: BuiltNode = Object.freeze({ occurrence: t.occurrence, node: Object.freeze({
    ...t.node,
    judgment: Object.freeze({ ...t.node.judgment, application: Object.freeze({
      ...t.node.judgment.application, ruleAdmission: foreignAdmission,
    }) }),
  }) });
  derivationReject(
    () => fx.replayVerified([r.equality], fx.derivation(forgedTarget, [r, forgedTarget])),
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
  find(): LinkHandle | undefined { throw new Error("P9d probe: find forbidden"); }
  incoming(): readonly LinkHandle[] { throw new Error("P9d probe: incoming forbidden"); }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    if (!this.injected) { this.injected = true; this.source.ensure(this.injectStart, this.injectEnd); }
    return this.source.outgoing(start);
  }
}

// Replay detects a hostile read adapter that mutates memory; no L/U is produced.
{
  const fx = fixture(), X = fx.fresh();
  const K = defineContext(fx.memory, fx.basis.R, fx.basis.O);
  const r = fx.resolvedNode(K, X, X, X, X), a = fx.fresh(), b = fx.fresh();
  assert(fx.memory.find(a, b) === undefined, "injection pair must start absent");
  const probe = new WriteInjectingProbe(fx.memory, a, b);
  equalityReject(() => fx.replayVerified([r.equality], fx.derivation(r, [r]), probe), "write injection");
}
