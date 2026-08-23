import { materializeExactSequence } from "../src/exact-sequence.js";
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
  if (!condition) throw new Error(`P9f Prop<->L/U: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function reject(effect: () => unknown, message: string): void {
  try { effect(); } catch (error) {
    assert(
      error instanceof InterpreterReplayError || error instanceof StructuralDerivationReplayError,
      `${message}: wrong rejection type`,
    );
    return;
  }
  throw new Error(`P9f Prop<->L/U: ${message}: expected rejection`);
}

type Binding = readonly [LinkHandle, LinkHandle];
interface Pack {
  readonly roleDictionary: LinkHandle;
  readonly rule: LinkHandle;
  readonly ruleAdmission: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly derivationAdmission: LinkHandle;
}
interface Built { readonly occurrence: LinkHandle; readonly node: StructuralDerivationNodeEvidence; }
interface ResolvedBuilt extends Built { readonly equality: EqualityReplayEvidence; }

function fixture() {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const { R, O, C, L, U } = basis;
  assert(O !== C && L !== U, "closed representative/value atoms must differ");
  let cursor = U;
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const seq = (values: readonly LinkHandle[]) => materializeExactSequence(memory, values);

  const dictionary = fresh(), grammar = fresh(), theory = fresh(), foreignTheory = fresh();
  const resolvedTag = fresh(), distinctTag = fresh(), eqPropTag = fresh(), neqPropTag = fresh(), valueTag = fresh();
  const alternateValue = fresh();
  assert(alternateValue !== L && alternateValue !== U, "alternate value atom must be distinct from L/U");
  const kRole = fresh(), aRole = fresh(), bRole = fresh(), raRole = fresh(), rbRole = fresh();
  const equalityRoles: EqualityRoles = Object.freeze({
    context: kRole, left: aRole, right: bRole,
    leftRepresentative: raRole, rightRepresentative: rbRole,
  });
  const expectedInterpreter: StructuralInterpreter = { dictionary, grammar, theory };
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);

  const resolved = (K: LinkHandle, A: LinkHandle, B: LinkHandle, RA: LinkHandle, RB: LinkHandle) =>
    seq([resolvedTag, K, A, B, RA, RB]);
  const distinct = (RA: LinkHandle, RB: LinkHandle) => seq([distinctTag, RA, RB]);
  const eqProp = (K: LinkHandle, A: LinkHandle, B: LinkHandle) => seq([eqPropTag, K, A, B]);
  const neqProp = (K: LinkHandle, A: LinkHandle, B: LinkHandle) => seq([neqPropTag, K, A, B]);
  const eqValue = (K: LinkHandle, A: LinkHandle, B: LinkHandle, V: LinkHandle) => seq([valueTag, K, A, B, V]);

  function pack(roles: readonly LinkHandle[], conclusion: LinkHandle, premises: readonly LinkHandle[]): Pack {
    const roleDictionary = defineStructuralRoleDictionary(memory, roles);
    const rule = defineStructuralRule(memory, roleDictionary, conclusion);
    const ruleAdmission = admitStructuralRule(memory, theory, rule);
    const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
    const derivationAdmission = admitStructuralDerivationRule(memory, theory, derivationRule);
    return Object.freeze({ roleDictionary, rule, ruleAdmission, derivationRule, derivationAdmission });
  }

  const resolvedPack = pack(
    [kRole, aRole, bRole, raRole, rbRole], resolved(kRole, aRole, bRole, raRole, rbRole), [],
  );
  const distinctOC = distinct(O, C), distinctCO = distinct(C, O);
  const distinctOCPack = pack([], distinctOC, []), distinctCOPack = pack([], distinctCO, []);

  const pk = fresh(), pa = fresh(), pb = fresh(), pr = fresh();
  const eqPropPack = pack([pk, pa, pb, pr], eqProp(pk, pa, pb), [resolved(pk, pa, pb, pr, pr)]);
  const nk = fresh(), na = fresh(), nb = fresh(), nra = fresh(), nrb = fresh();
  const neqPropPack = pack(
    [nk, na, nb, nra, nrb], neqProp(nk, na, nb),
    [resolved(nk, na, nb, nra, nrb), distinct(nra, nrb)],
  );

  const dlk = fresh(), dla = fresh(), dlb = fresh(), dlr = fresh();
  const directL = pack([dlk, dla, dlb, dlr], eqValue(dlk, dla, dlb, L), [resolved(dlk, dla, dlb, dlr, dlr)]);
  const duk = fresh(), dua = fresh(), dub = fresh(), dura = fresh(), durb = fresh();
  const directU = pack(
    [duk, dua, dub, dura, durb], eqValue(duk, dua, dub, U),
    [resolved(duk, dua, dub, dura, durb), distinct(dura, durb)],
  );
  const alk = fresh(), ala = fresh(), alb = fresh();
  const alternateValuePack = pack(
    [alk, ala, alb], eqValue(alk, ala, alb, alternateValue), [],
  );

  const flk = fresh(), fla = fresh(), flb = fresh();
  const forwardL = pack([flk, fla, flb], eqValue(flk, fla, flb, L), [eqProp(flk, fla, flb)]);
  const fuk = fresh(), fua = fresh(), fub = fresh();
  const forwardU = pack([fuk, fua, fub], eqValue(fuk, fua, fub, U), [neqProp(fuk, fua, fub)]);
  const rlk = fresh(), rla = fresh(), rlb = fresh();
  const reverseL = pack([rlk, rla, rlb], eqProp(rlk, rla, rlb), [eqValue(rlk, rla, rlb, L)]);
  const ruk = fresh(), rua = fresh(), rub = fresh();
  const reverseU = pack([ruk, rua, rub], neqProp(ruk, rua, rub), [eqValue(ruk, rua, rub, U)]);

  function node(
    p: Pack, bindings: readonly Binding[], claim: LinkHandle,
    premises: readonly LinkHandle[], K: LinkHandle,
    ruleAdmission: LinkHandle = p.ruleAdmission,
  ): Built {
    const act = defineActHeader(memory, interpreter, p.roleDictionary, K);
    for (const [role, value] of bindings) defineActField(memory, act, role, value);
    const judgment: StructuralJudgmentEvidence = {
      application: {
        act, rule: p.rule, ruleAdmission, claimedBody: claim,
        expectedInterpreter, expectedAfterContext: K,
      },
      judgment: { theory, context: K, claim },
    };
    const occurrence = defineStructuralProofOccurrence(memory, act, claim);
    return Object.freeze({ occurrence, node: Object.freeze({
      occurrence, judgment, derivationRule: p.derivationRule,
      derivationRuleAdmission: p.derivationAdmission,
      premiseOccurrenceSequence: seq(premises),
    }) });
  }

  function resolvedNode(K: LinkHandle, A: LinkHandle, B: LinkHandle, RA: LinkHandle, RB: LinkHandle): ResolvedBuilt {
    const built = node(
      resolvedPack, [[kRole, K], [aRole, A], [bRole, B], [raRole, RA], [rbRole, RB]],
      resolved(K, A, B, RA, RB), [], K,
    );
    return Object.freeze({ ...built, equality: Object.freeze({
      act: built.node.judgment.application.act, roles: equalityRoles,
      interpreter, roleDictionary: resolvedPack.roleDictionary,
    }) });
  }
  const distinctRoot = (p: Pack, claim: LinkHandle, K: LinkHandle) => node(p, [], claim, [], K);
  const eqPropNode = (K: LinkHandle, A: LinkHandle, B: LinkHandle, R0: LinkHandle, r: LinkHandle) =>
    node(eqPropPack, [[pk, K], [pa, A], [pb, B], [pr, R0]], eqProp(K, A, B), [r], K);
  const neqPropNode = (
    K: LinkHandle, A: LinkHandle, B: LinkHandle, RA: LinkHandle, RB: LinkHandle,
    r: LinkHandle, d: LinkHandle,
  ) => node(
    neqPropPack, [[nk, K], [na, A], [nb, B], [nra, RA], [nrb, RB]],
    neqProp(K, A, B), [r, d], K,
  );
  const directLNode = (K: LinkHandle, A: LinkHandle, B: LinkHandle, R0: LinkHandle, r: LinkHandle) =>
    node(directL, [[dlk, K], [dla, A], [dlb, B], [dlr, R0]], eqValue(K, A, B, L), [r], K);
  const directUNode = (
    K: LinkHandle, A: LinkHandle, B: LinkHandle, RA: LinkHandle, RB: LinkHandle,
    r: LinkHandle, d: LinkHandle,
  ) => node(
    directU, [[duk, K], [dua, A], [dub, B], [dura, RA], [durb, RB]],
    eqValue(K, A, B, U), [r, d], K,
  );
  const alternateValueNode = (K: LinkHandle, A: LinkHandle, B: LinkHandle) => node(
    alternateValuePack, [[alk, K], [ala, A], [alb, B]],
    eqValue(K, A, B, alternateValue), [], K,
  );
  const reflect = (
    p: Pack, roles: readonly LinkHandle[], values: readonly LinkHandle[],
    claim: LinkHandle, premise: LinkHandle, K: LinkHandle,
    ruleAdmission: LinkHandle = p.ruleAdmission,
  ) => node(p, roles.map((role, i) => [role, values[i]!] as const), claim, [premise], K, ruleAdmission);

  const forwardLNode = (K: LinkHandle, A: LinkHandle, B: LinkHandle, premise: LinkHandle) =>
    reflect(forwardL, [flk, fla, flb], [K, A, B], eqValue(K, A, B, L), premise, K);
  const forwardUNode = (K: LinkHandle, A: LinkHandle, B: LinkHandle, premise: LinkHandle) =>
    reflect(forwardU, [fuk, fua, fub], [K, A, B], eqValue(K, A, B, U), premise, K);
  const reverseLNode = (K: LinkHandle, A: LinkHandle, B: LinkHandle, premise: LinkHandle) =>
    reflect(reverseL, [rlk, rla, rlb], [K, A, B], eqProp(K, A, B), premise, K);
  const reverseUNode = (K: LinkHandle, A: LinkHandle, B: LinkHandle, premise: LinkHandle) =>
    reflect(reverseU, [ruk, rua, rub], [K, A, B], neqProp(K, A, B), premise, K);

  const proof = (target: Built, nodes: readonly Built[]): StructuralDerivationEvidence =>
    Object.freeze({ theory, targetOccurrence: target.occurrence, nodes: Object.freeze(nodes.map((x) => x.node)) });
  function replay(equalities: readonly EqualityReplayEvidence[], derivation: StructuralDerivationEvidence, read: ReadMemory = memory) {
    const before = read.linkCount;
    for (const equality of equalities) void replayEqualityEvaluation(read, equality);
    const checked = replayStructuralDerivation(read, derivation);
    same(read.linkCount, before, "reflection replay must be read-only");
    return checked;
  }

  return {
    memory, basis, theory, foreignTheory, fresh, alternateValue,
    distinctOC, distinctCO, distinctOCPack, distinctCOPack,
    forwardL, forwardU, reverseL, reverseU,
    eqProp, neqProp, eqValue,
    resolvedNode, distinctRoot, eqPropNode, neqPropNode, directLNode, directUNode, alternateValueNode,
    forwardLNode, forwardUNode, reverseLNode, reverseUNode, proof, replay,
  };
}

// Forward positive reflection: proof(EqProp) -> explicit L, while the proposition is a distinct Link.
{
  const f = fixture(), A = f.fresh(), B = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.O);
  defineLocalRepresentativeBinding(f.memory, K, A, f.basis.O);
  defineLocalRepresentativeBinding(f.memory, K, B, f.basis.O);
  const r = f.resolvedNode(K, A, B, f.basis.O, f.basis.O);
  const p = f.eqPropNode(K, A, B, f.basis.O, r.occurrence);
  const v = f.forwardLNode(K, A, B, p.occurrence);
  const checked = f.replay([r.equality], f.proof(v, [v, p, r]));
  same(checked.target.judgment.claim, f.eqValue(K, A, B, f.basis.L), "EqProp reflects to L");
  assert(p.node.judgment.judgment.claim !== f.basis.L, "proof-level proposition is not L itself");
}

// Forward negative reflection requires an explicit NeqProp proof backed by closed Distinct evidence.
{
  const f = fixture(), A = f.fresh(), B = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.O);
  defineLocalRepresentativeBinding(f.memory, K, A, f.basis.O);
  defineLocalRepresentativeBinding(f.memory, K, B, f.basis.C);
  const r = f.resolvedNode(K, A, B, f.basis.O, f.basis.C);
  const d = f.distinctRoot(f.distinctOCPack, f.distinctOC, K);
  const p = f.neqPropNode(K, A, B, f.basis.O, f.basis.C, r.occurrence, d.occurrence);
  const v = f.forwardUNode(K, A, B, p.occurrence);
  same(
    f.replay([r.equality], f.proof(v, [r, v, d, p])).target.judgment.claim,
    f.eqValue(K, A, B, f.basis.U), "NeqProp reflects to U",
  );
  assert(p.node.judgment.judgment.claim !== f.basis.U, "refutation proposition is not U itself");
}

// Reverse reflection uses independently derived EqValue evidence, not a proof cycle.
{
  const f = fixture(), A = f.fresh(), B = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.O);
  defineLocalRepresentativeBinding(f.memory, K, A, f.basis.O);
  defineLocalRepresentativeBinding(f.memory, K, B, f.basis.O);
  const r = f.resolvedNode(K, A, B, f.basis.O, f.basis.O);
  const value = f.directLNode(K, A, B, f.basis.O, r.occurrence);
  const target = f.reverseLNode(K, A, B, value.occurrence);
  same(
    f.replay([r.equality], f.proof(target, [target, r, value])).target.judgment.claim,
    f.eqProp(K, A, B), "independent L reflects back to EqProp",
  );
}
{
  const f = fixture(), A = f.fresh(), B = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.C);
  defineLocalRepresentativeBinding(f.memory, K, A, f.basis.C);
  defineLocalRepresentativeBinding(f.memory, K, B, f.basis.O);
  const r = f.resolvedNode(K, A, B, f.basis.C, f.basis.O);
  const d = f.distinctRoot(f.distinctCOPack, f.distinctCO, K);
  const value = f.directUNode(K, A, B, f.basis.C, f.basis.O, r.occurrence, d.occurrence);
  const target = f.reverseUNode(K, A, B, value.occurrence);
  same(
    f.replay([r.equality], f.proof(target, [d, target, value, r])).target.judgment.claim,
    f.neqProp(K, A, B), "independent U reflects back to NeqProp",
  );
}

// Reflection stays context-relative: the same A/B can prove Eq in outer K and Neq in inner K.
{
  const f = fixture(), A = f.fresh(), B = f.fresh();
  const outer = defineContext(f.memory, f.basis.R, f.basis.O);
  const inner = defineContext(f.memory, outer, f.basis.C);
  defineLocalRepresentativeBinding(f.memory, outer, A, f.basis.O);
  defineLocalRepresentativeBinding(f.memory, outer, B, f.basis.O);
  defineLocalRepresentativeBinding(f.memory, inner, A, f.basis.O);
  defineLocalRepresentativeBinding(f.memory, inner, B, f.basis.C);
  const ro = f.resolvedNode(outer, A, B, f.basis.O, f.basis.O);
  const po = f.eqPropNode(outer, A, B, f.basis.O, ro.occurrence);
  const vo = f.forwardLNode(outer, A, B, po.occurrence);
  same(f.replay([ro.equality], f.proof(vo, [po, vo, ro])).target.judgment.claim, f.eqValue(outer, A, B, f.basis.L), "outer L");
  const ri = f.resolvedNode(inner, A, B, f.basis.O, f.basis.C);
  const di = f.distinctRoot(f.distinctOCPack, f.distinctOC, inner);
  const pi = f.neqPropNode(inner, A, B, f.basis.O, f.basis.C, ri.occurrence, di.occurrence);
  const vi = f.forwardUNode(inner, A, B, pi.occurrence);
  same(f.replay([ri.equality], f.proof(vi, [vi, ri, pi, di])).target.judgment.claim, f.eqValue(inner, A, B, f.basis.U), "inner U");
}

// A valid host-false Eq_K outside the closed Distinct table proves neither NeqProp nor U.
{
  const f = fixture(), A = f.fresh(), B = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.O);
  const r = f.resolvedNode(K, A, B, A, B);
  same(replayEqualityEvaluation(f.memory, r.equality), false, "precondition: host convenience result is false");
  const d = f.distinctRoot(f.distinctOCPack, f.distinctOC, K);
  const p = f.neqPropNode(K, A, B, A, B, r.occurrence, d.occurrence);
  const v = f.forwardUNode(K, A, B, p.occurrence);
  reject(() => f.replay([r.equality], f.proof(v, [r, d, p, v])), "uncovered false must remain unknown");
}

// Missing proof occurrence is not a negative proof and cannot synthesize a reflected result.
{
  const f = fixture(), A = f.fresh(), B = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.O);
  const r = f.resolvedNode(K, A, B, f.basis.O, f.basis.O);
  const p = f.eqPropNode(K, A, B, f.basis.O, r.occurrence);
  const value = f.forwardLNode(K, A, B, p.occurrence);
  reject(() => f.replay([r.equality], f.proof(value, [r, value])), "absence of EqProp proof occurrence");
}

// Symmetrically, absence of NeqProp evidence is not U, even when a valid NeqProp occurrence could exist.
{
  const f = fixture(), A = f.fresh(), B = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.O);
  defineLocalRepresentativeBinding(f.memory, K, A, f.basis.O);
  defineLocalRepresentativeBinding(f.memory, K, B, f.basis.C);
  const r = f.resolvedNode(K, A, B, f.basis.O, f.basis.C);
  const d = f.distinctRoot(f.distinctOCPack, f.distinctOC, K);
  const p = f.neqPropNode(K, A, B, f.basis.O, f.basis.C, r.occurrence, d.occurrence);
  const value = f.forwardUNode(K, A, B, p.occurrence);
  reject(
    () => f.replay([r.equality], f.proof(value, [r, d, value])),
    "absence of NeqProp proof occurrence cannot synthesize U",
  );
}

// A valid independently replayable EqValue(...,ALT) fact still cannot impersonate L or U.
{
  const f = fixture(), A = f.fresh(), B = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.O);
  const value = f.alternateValueNode(K, A, B);
  same(
    f.replay([], f.proof(value, [value])).target.judgment.claim,
    f.eqValue(K, A, B, f.alternateValue),
    "alternate EqValue fact independently replays",
  );
  const asL = f.reverseLNode(K, A, B, value.occurrence);
  reject(() => f.replay([], f.proof(asL, [value, asL])), "alternate value atom cannot impersonate L");
  const asU = f.reverseUNode(K, A, B, value.occurrence);
  reject(() => f.replay([], f.proof(asU, [value, asU])), "alternate value atom cannot impersonate U");
}

// Wrong reflection direction, K mismatch and foreign admission all fail structurally.
{
  const f = fixture(), A = f.fresh(), B = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.O);
  const otherK = defineContext(f.memory, f.basis.R, f.basis.C);
  const r = f.resolvedNode(K, A, B, A, A);
  const valueL = f.directLNode(K, A, B, A, r.occurrence);
  const wrongSide = f.reverseUNode(K, A, B, valueL.occurrence);
  reject(() => f.replay([r.equality], f.proof(wrongSide, [r, valueL, wrongSide])), "L cannot reflect to NeqProp");

  const wrongK = f.reverseLNode(otherK, A, B, valueL.occurrence);
  reject(() => f.replay([r.equality], f.proof(wrongK, [r, valueL, wrongK])), "reflection preserves explicit K");

  const foreignAdmission = f.memory.ensure(f.foreignTheory, f.forwardL.rule);
  const p = f.eqPropNode(K, A, B, A, r.occurrence);
  const bad = {
    ...f.forwardLNode(K, A, B, p.occurrence),
  } satisfies Built;
  const badNode: Built = Object.freeze({ occurrence: bad.occurrence, node: Object.freeze({
    ...bad.node,
    judgment: Object.freeze({
      ...bad.node.judgment,
      application: Object.freeze({ ...bad.node.judgment.application, ruleAdmission: foreignAdmission }),
    }),
  }) });
  reject(() => f.replay([r.equality], f.proof(badNode, [r, p, badNode])), "foreign Theory admission");
}

// Host metadata is ignored; exact proof structure still determines reflection.
{
  const f = fixture(), A = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.O);
  const r = f.resolvedNode(K, A, A, A, A);
  const noisy = Object.freeze({ ...r.equality, proved: false, value: false, branch: "U" });
  const p = f.eqPropNode(K, A, A, A, r.occurrence);
  const v = f.forwardLNode(K, A, A, p.occurrence);
  same(f.replay([noisy], f.proof(v, [v, r, p])).target.judgment.claim, f.eqValue(K, A, A, f.basis.L), "host metadata ignored");
}

class WriteInjectingProbe implements ReadMemory {
  private injected = false;
  constructor(private readonly source: Memory, private readonly start: LinkHandle, private readonly end: LinkHandle) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined { return this.source.find(start, end); }
  incoming(end: LinkHandle): readonly LinkHandle[] { return this.source.incoming(end); }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    if (!this.injected) { this.injected = true; this.source.ensure(this.start, this.end); }
    return this.source.outgoing(start);
  }
}

// Mutation during equality/proof replay cannot manufacture a reflected value.
{
  const f = fixture(), A = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.O);
  const r = f.resolvedNode(K, A, A, A, A);
  const p = f.eqPropNode(K, A, A, A, r.occurrence);
  const v = f.forwardLNode(K, A, A, p.occurrence);
  const x = f.fresh(), y = f.fresh();
  assert(f.memory.find(x, y) === undefined, "injection pair starts absent");
  reject(() => f.replay([r.equality], f.proof(v, [r, p, v]), new WriteInjectingProbe(f.memory, x, y)), "write injection");
}
