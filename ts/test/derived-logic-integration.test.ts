import { defineDictionaryEffect, defineDictionaryScope } from "../src/dictionary.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  InterpreterReplayError,
  replayContextualReading,
  replayEqualityEvaluation,
  type ContextualReadingEvidence,
  type ContextualReadingRoles,
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
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  type SelectedSegmentSpec,
  type SourceFrontEndEvidence,
} from "../src/source.js";
import { defineContext, defineLocalRepresentativeBinding } from "../src/state.js";
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
  if (!condition) throw new Error(`P9g integration: ${message}`);
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
  throw new Error(`P9g integration: ${message}: expected rejection`);
}

type Binding = readonly [LinkHandle, LinkHandle];
interface Environment {
  readonly expectedInterpreter: StructuralInterpreter;
  readonly interpreter: LinkHandle;
}
interface Pack {
  readonly roleDictionary: LinkHandle;
  readonly rule: LinkHandle;
  readonly ruleAdmission: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly derivationAdmission: LinkHandle;
}
interface Built {
  readonly occurrence: LinkHandle;
  readonly node: StructuralDerivationNodeEvidence;
}
interface ResolvedBuilt extends Built {
  readonly equality: EqualityReplayEvidence;
}
interface DotBuilt extends Built {
  readonly contextual: ContextualReadingEvidence;
}

function fixture() {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const { R, O, C, L, U } = basis;
  assert(O !== C && L !== U, "root representatives and L/U must be distinct");
  let cursor = U;
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const exact = (values: readonly LinkHandle[]) => materializeExactSequence(memory, values);
  const pair = (left: LinkHandle, right: LinkHandle) => memory.ensure(left, right);

  const grammar = fresh(), theory = fresh(), foreignTheory = fresh();
  const dotRole = fresh(), otherForm = fresh();
  const dotMeaning = pair(L, R);
  assert(dotRole !== dotMeaning && otherForm !== dotRole, "contextual dot role is not DotMeaning or glyph shape");

  function dictionaryFor(form: LinkHandle) {
    const content = materializeSourceContent(memory, new Uint8Array([0x2e]));
    const before = defineDictionaryScope(memory, R, R);
    const effect = defineDictionaryEffect(memory, before, R, R, content, form);
    return { content, dictionary: effect.afterScope, occurrence: effect.occurrence };
  }
  function sourceFor(form: LinkHandle): SourceFrontEndEvidence {
    const dictionary = dictionaryFor(form);
    const source = defineSourceForm(memory, dictionary.content);
    const specs: readonly SelectedSegmentSpec[] = Object.freeze([
      Object.freeze({ start: 0, end: 1, form, dictionaryOccurrence: dictionary.occurrence }),
    ]);
    return buildSelectedSourceEvidence(
      memory,
      source,
      specs,
      { dictionary: dictionary.dictionary, grammar, theory },
    );
  }
  const admittedDotSource = sourceFor(dotRole);
  const dotMeaningSource = sourceFor(dotMeaning);

  function environment(selectedTheory: LinkHandle): Environment {
    const expectedInterpreter: StructuralInterpreter = {
      dictionary: admittedDotSource.dictionary,
      grammar,
      theory: selectedTheory,
    };
    return Object.freeze({
      expectedInterpreter,
      interpreter: defineStructuralInterpreter(
        memory,
        admittedDotSource.dictionary,
        grammar,
        selectedTheory,
      ),
    });
  }
  const main = environment(theory);
  const foreign = environment(foreignTheory);

  const andTag = fresh(), foreignAndTag = fresh();
  const orTag = fresh(), foreignOrTag = fresh();
  const resolvedTag = fresh(), distinctTag = fresh();
  const eqPropTag = fresh(), neqPropTag = fresh(), eqValueTag = fresh();
  const dotTag = fresh(), ifTag = fresh();
  const alternateValue = fresh();
  assert(alternateValue !== L && alternateValue !== U, "alternate truth atom differs from L/U");

  const and = (P: LinkHandle, Q: LinkHandle, tag = andTag) => pair(tag, pair(P, Q));
  const or = (P: LinkHandle, Q: LinkHandle, tag = orTag) => pair(tag, pair(P, Q));
  const resolved = (K: LinkHandle, A: LinkHandle, B: LinkHandle, RA: LinkHandle, RB: LinkHandle) =>
    exact([resolvedTag, K, A, B, RA, RB]);
  const distinct = (RA: LinkHandle, RB: LinkHandle) => exact([distinctTag, RA, RB]);
  const eqProp = (K: LinkHandle, A: LinkHandle, B: LinkHandle) => exact([eqPropTag, K, A, B]);
  const neqProp = (K: LinkHandle, A: LinkHandle, B: LinkHandle) => exact([neqPropTag, K, A, B]);
  const eqValue = (K: LinkHandle, A: LinkHandle, B: LinkHandle, V: LinkHandle) =>
    exact([eqValueTag, K, A, B, V]);
  const dotValue = (K: LinkHandle, C0: LinkHandle) => exact([dotTag, K, C0]);
  const ifValue = (
    K: LinkHandle,
    C0: LinkHandle,
    T: LinkHandle,
    E: LinkHandle,
    result: LinkHandle,
  ) => exact([ifTag, K, C0, T, E, result]);

  function pack(
    selectedTheory: LinkHandle,
    roles: readonly LinkHandle[],
    conclusion: LinkHandle,
    premises: readonly LinkHandle[],
  ): Pack {
    const roleDictionary = defineStructuralRoleDictionary(memory, roles);
    const rule = defineStructuralRule(memory, roleDictionary, conclusion);
    const ruleAdmission = admitStructuralRule(memory, selectedTheory, rule);
    const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
    const derivationAdmission = admitStructuralDerivationRule(memory, selectedTheory, derivationRule);
    return Object.freeze({ roleDictionary, rule, ruleAdmission, derivationRule, derivationAdmission });
  }

  function node(
    p: Pack,
    bindings: readonly Binding[],
    claim: LinkHandle,
    premises: readonly LinkHandle[],
    K: LinkHandle,
    selectedTheory: LinkHandle = theory,
    env: Environment = main,
    ruleAdmission: LinkHandle = p.ruleAdmission,
  ): Built {
    const act = defineActHeader(memory, env.interpreter, p.roleDictionary, K);
    for (const [role, value] of bindings) defineActField(memory, act, role, value);
    const judgment: StructuralJudgmentEvidence = {
      application: {
        act,
        rule: p.rule,
        ruleAdmission,
        claimedBody: claim,
        expectedInterpreter: env.expectedInterpreter,
        expectedAfterContext: K,
      },
      judgment: { theory: selectedTheory, context: K, claim },
    };
    const occurrence = defineStructuralProofOccurrence(memory, act, claim);
    return Object.freeze({
      occurrence,
      node: Object.freeze({
        occurrence,
        judgment,
        derivationRule: p.derivationRule,
        derivationRuleAdmission: p.derivationAdmission,
        premiseOccurrenceSequence: exact(premises),
      }),
    });
  }

  const rootRole = fresh();
  const root = pack(theory, [rootRole], rootRole, []);
  const prove = (claim: LinkHandle, K: LinkHandle) => node(root, [[rootRole, claim]], claim, [], K);

  const pRole = fresh(), qRole = fresh(), rRole = fresh();
  const mp = pack(theory, [pRole, qRole], qRole, [pRole, pair(pRole, qRole)]);
  const mpNode = (P: LinkHandle, Q: LinkHandle, premises: readonly LinkHandle[], K: LinkHandle) =>
    node(mp, [[pRole, P], [qRole, Q]], Q, premises, K);

  const andIntro = pack(theory, [pRole, qRole], and(pRole, qRole), [pRole, qRole]);
  const andLeft = pack(theory, [pRole, qRole], pRole, [and(pRole, qRole)]);
  const andIntroNode = (P: LinkHandle, Q: LinkHandle, premises: readonly LinkHandle[], K: LinkHandle) =>
    node(andIntro, [[pRole, P], [qRole, Q]], and(P, Q), premises, K);
  const andLeftNode = (P: LinkHandle, Q: LinkHandle, premise: LinkHandle, K: LinkHandle) =>
    node(andLeft, [[pRole, P], [qRole, Q]], P, [premise], K);

  const orRoles = defineStructuralRoleDictionary(memory, [pRole, qRole]);
  const orRule = defineStructuralRule(memory, orRoles, or(pRole, qRole));
  const orRuleAdmission = admitStructuralRule(memory, theory, orRule);
  const orLeftDerivationRule = defineStructuralDerivationRule(memory, orRule, [pRole]);
  const orRightDerivationRule = defineStructuralDerivationRule(memory, orRule, [qRole]);
  const orLeft: Pack = Object.freeze({
    roleDictionary: orRoles,
    rule: orRule,
    ruleAdmission: orRuleAdmission,
    derivationRule: orLeftDerivationRule,
    derivationAdmission: admitStructuralDerivationRule(memory, theory, orLeftDerivationRule),
  });
  const orRight: Pack = Object.freeze({
    roleDictionary: orRoles,
    rule: orRule,
    ruleAdmission: orRuleAdmission,
    derivationRule: orRightDerivationRule,
    derivationAdmission: admitStructuralDerivationRule(memory, theory, orRightDerivationRule),
  });
  const orIntroNode = (
    p: Pack,
    P: LinkHandle,
    Q: LinkHandle,
    premise: LinkHandle,
    K: LinkHandle,
  ) => node(p, [[pRole, P], [qRole, Q]], or(P, Q), [premise], K);
  const orCase = pack(
    theory,
    [pRole, qRole, rRole],
    rRole,
    [or(pRole, qRole), pair(pRole, rRole), pair(qRole, rRole)],
  );
  const orCaseNode = (
    P: LinkHandle,
    Q: LinkHandle,
    R0: LinkHandle,
    premises: readonly LinkHandle[],
    K: LinkHandle,
  ) => node(orCase, [[pRole, P], [qRole, Q], [rRole, R0]], R0, premises, K);

  const kRole = fresh(), aRole = fresh(), bRole = fresh(), raRole = fresh(), rbRole = fresh();
  const equalityRoles: EqualityRoles = Object.freeze({
    context: kRole,
    left: aRole,
    right: bRole,
    leftRepresentative: raRole,
    rightRepresentative: rbRole,
  });
  const resolvedPack = pack(
    theory,
    [kRole, aRole, bRole, raRole, rbRole],
    resolved(kRole, aRole, bRole, raRole, rbRole),
    [],
  );
  const distinctOC = distinct(O, C), distinctCO = distinct(C, O);
  const distinctOCPack = pack(theory, [], distinctOC, []);
  const distinctCOPack = pack(theory, [], distinctCO, []);

  const ek = fresh(), ea = fresh(), eb = fresh(), er = fresh();
  const eqPropPack = pack(
    theory,
    [ek, ea, eb, er],
    eqProp(ek, ea, eb),
    [resolved(ek, ea, eb, er, er)],
  );
  const nk = fresh(), na = fresh(), nb = fresh(), nra = fresh(), nrb = fresh();
  const neqPropPack = pack(
    theory,
    [nk, na, nb, nra, nrb],
    neqProp(nk, na, nb),
    [resolved(nk, na, nb, nra, nrb), distinct(nra, nrb)],
  );
  const flk = fresh(), fla = fresh(), flb = fresh();
  const forwardL = pack(
    theory,
    [flk, fla, flb],
    eqValue(flk, fla, flb, L),
    [eqProp(flk, fla, flb)],
  );
  const fuk = fresh(), fua = fresh(), fub = fresh();
  const forwardU = pack(
    theory,
    [fuk, fua, fub],
    eqValue(fuk, fua, fub, U),
    [neqProp(fuk, fua, fub)],
  );
  const rlk = fresh(), rla = fresh(), rlb = fresh();
  const reverseL = pack(
    theory,
    [rlk, rla, rlb],
    eqProp(rlk, rla, rlb),
    [eqValue(rlk, rla, rlb, L)],
  );
  const ruk = fresh(), rua = fresh(), rub = fresh();
  const reverseU = pack(
    theory,
    [ruk, rua, rub],
    neqProp(ruk, rua, rub),
    [eqValue(ruk, rua, rub, U)],
  );
  const alk = fresh(), ala = fresh(), alb = fresh();
  const alternatePack = pack(
    theory,
    [alk, ala, alb],
    eqValue(alk, ala, alb, alternateValue),
    [],
  );

  function resolvedNode(
    K: LinkHandle,
    A: LinkHandle,
    B: LinkHandle,
    RA: LinkHandle,
    RB: LinkHandle,
  ): ResolvedBuilt {
    const built = node(
      resolvedPack,
      [[kRole, K], [aRole, A], [bRole, B], [raRole, RA], [rbRole, RB]],
      resolved(K, A, B, RA, RB),
      [],
      K,
    );
    return Object.freeze({
      ...built,
      equality: Object.freeze({
        act: built.node.judgment.application.act,
        roles: equalityRoles,
        interpreter: main.interpreter,
        roleDictionary: resolvedPack.roleDictionary,
      }),
    });
  }
  const distinctNode = (p: Pack, claim: LinkHandle, K: LinkHandle) => node(p, [], claim, [], K);
  const eqPropNode = (K: LinkHandle, A: LinkHandle, B: LinkHandle, R0: LinkHandle, premise: LinkHandle) =>
    node(eqPropPack, [[ek, K], [ea, A], [eb, B], [er, R0]], eqProp(K, A, B), [premise], K);
  const neqPropNode = (
    K: LinkHandle,
    A: LinkHandle,
    B: LinkHandle,
    RA: LinkHandle,
    RB: LinkHandle,
    resolvedOccurrence: LinkHandle,
    distinctOccurrence: LinkHandle,
  ) => node(
    neqPropPack,
    [[nk, K], [na, A], [nb, B], [nra, RA], [nrb, RB]],
    neqProp(K, A, B),
    [resolvedOccurrence, distinctOccurrence],
    K,
  );
  const forwardLNode = (K: LinkHandle, A: LinkHandle, B: LinkHandle, premise: LinkHandle) =>
    node(forwardL, [[flk, K], [fla, A], [flb, B]], eqValue(K, A, B, L), [premise], K);
  const forwardUNode = (K: LinkHandle, A: LinkHandle, B: LinkHandle, premise: LinkHandle) =>
    node(forwardU, [[fuk, K], [fua, A], [fub, B]], eqValue(K, A, B, U), [premise], K);
  const reverseLNode = (K: LinkHandle, A: LinkHandle, B: LinkHandle, premise: LinkHandle) =>
    node(reverseL, [[rlk, K], [rla, A], [rlb, B]], eqProp(K, A, B), [premise], K);
  const reverseUNode = (K: LinkHandle, A: LinkHandle, B: LinkHandle, premise: LinkHandle) =>
    node(reverseU, [[ruk, K], [rua, A], [rub, B]], neqProp(K, A, B), [premise], K);
  const alternateNode = (K: LinkHandle, A: LinkHandle, B: LinkHandle) =>
    node(alternatePack, [[alk, K], [ala, A], [alb, B]], eqValue(K, A, B, alternateValue), [], K);

  const contextualValues = Array.from({ length: 10 }, () => fresh());
  const contextualRoles: ContextualReadingRoles = Object.freeze({
    source: contextualValues[0]!,
    sourceSelection: contextualValues[1]!,
    formSequence: contextualValues[2]!,
    dictionary: contextualValues[3]!,
    grammar: contextualValues[4]!,
    theory: contextualValues[5]!,
    beforeContext: contextualValues[6]!,
    contextualRole: contextualValues[7]!,
    result: contextualValues[8]!,
    afterContext: contextualValues[9]!,
  });
  const contextualRoleList = Object.freeze([
    contextualRoles.source,
    contextualRoles.sourceSelection,
    contextualRoles.formSequence,
    contextualRoles.dictionary,
    contextualRoles.grammar,
    contextualRoles.theory,
    contextualRoles.beforeContext,
    contextualRoles.contextualRole,
    contextualRoles.result,
    contextualRoles.afterContext,
  ]);
  const dotRoleDictionary = defineStructuralRoleDictionary(memory, contextualRoleList);
  const dotRule = defineStructuralRule(
    memory,
    dotRoleDictionary,
    dotValue(contextualRoles.beforeContext, contextualRoles.result),
  );
  const dotRuleAdmission = admitStructuralRule(memory, theory, dotRule);
  const dotDerivationRule = defineStructuralDerivationRule(memory, dotRule, []);
  const dotDerivationAdmission = admitStructuralDerivationRule(memory, theory, dotDerivationRule);

  function dotNode(
    K: LinkHandle,
    C0: LinkHandle,
    source: SourceFrontEndEvidence = admittedDotSource,
    afterContext: LinkHandle = K,
  ): DotBuilt {
    const sourceInterpreter = defineStructuralInterpreter(
      memory,
      source.dictionary,
      source.grammar,
      source.theory,
    );
    const act = defineActHeader(memory, sourceInterpreter, dotRoleDictionary, afterContext);
    const fields: readonly Binding[] = [
      [contextualRoles.source, source.source],
      [contextualRoles.sourceSelection, source.selectionSequence],
      [contextualRoles.formSequence, source.formSequence],
      [contextualRoles.dictionary, source.dictionary],
      [contextualRoles.grammar, source.grammar],
      [contextualRoles.theory, source.theory],
      [contextualRoles.beforeContext, K],
      [contextualRoles.contextualRole, dotRole],
      [contextualRoles.result, C0],
      [contextualRoles.afterContext, afterContext],
    ];
    for (const [role, value] of fields) defineActField(memory, act, role, value);
    const claim = dotValue(K, C0);
    const judgment: StructuralJudgmentEvidence = {
      application: {
        act,
        rule: dotRule,
        ruleAdmission: dotRuleAdmission,
        claimedBody: claim,
        expectedInterpreter: {
          dictionary: source.dictionary,
          grammar: source.grammar,
          theory: source.theory,
        },
        expectedAfterContext: afterContext,
      },
      judgment: { theory, context: K, claim },
    };
    const occurrence = defineStructuralProofOccurrence(memory, act, claim);
    return Object.freeze({
      occurrence,
      contextual: Object.freeze({
        sourceEvidence: source,
        act,
        roles: contextualRoles,
        interpreter: sourceInterpreter,
        roleDictionary: dotRoleDictionary,
      }),
      node: Object.freeze({
        occurrence,
        judgment,
        derivationRule: dotDerivationRule,
        derivationRuleAdmission: dotDerivationAdmission,
        premiseOccurrenceSequence: exact([]),
      }),
    });
  }

  const lk = fresh(), lt = fresh(), le = fresh();
  const ifL = pack(
    theory,
    [lk, lt, le],
    ifValue(lk, L, lt, le, lt),
    [dotValue(lk, L)],
  );
  const uk = fresh(), ut = fresh(), ue = fresh();
  const ifU = pack(
    theory,
    [uk, ut, ue],
    ifValue(uk, U, ut, ue, ue),
    [dotValue(uk, U)],
  );
  const ifLNode = (K: LinkHandle, T: LinkHandle, E: LinkHandle, premise: LinkHandle) =>
    node(ifL, [[lk, K], [lt, T], [le, E]], ifValue(K, L, T, E, T), [premise], K);
  const ifUNode = (K: LinkHandle, T: LinkHandle, E: LinkHandle, premise: LinkHandle) =>
    node(ifU, [[uk, K], [ut, T], [ue, E]], ifValue(K, U, T, E, E), [premise], K);

  function derivation(target: Built, nodes: readonly Built[], selectedTheory = theory): StructuralDerivationEvidence {
    return Object.freeze({
      theory: selectedTheory,
      targetOccurrence: target.occurrence,
      nodes: Object.freeze(nodes.map((item) => item.node)),
    });
  }
  function replay(
    target: Built,
    nodes: readonly Built[],
    equalities: readonly EqualityReplayEvidence[] = [],
    contextual: readonly ContextualReadingEvidence[] = [],
    read: ReadMemory = memory,
  ) {
    const before = read.linkCount;
    for (const evidence of equalities) void replayEqualityEvaluation(read, evidence);
    for (const evidence of contextual) void replayContextualReading(read, evidence);
    const checked = replayStructuralDerivation(read, derivation(target, nodes));
    same(read.linkCount, before, "integrated replay must be read-only");
    return checked;
  }

  return {
    memory,
    basis,
    theory,
    foreignTheory,
    foreign,
    fresh,
    pair,
    and,
    or,
    foreignAndTag,
    foreignOrTag,
    alternateValue,
    dotMeaning,
    dotMeaningSource,
    distinctOC,
    eqProp,
    neqProp,
    eqValue,
    ifValue,
    mp,
    prove,
    mpNode,
    andIntroNode,
    andLeftNode,
    orLeft,
    orRight,
    orIntroNode,
    orCaseNode,
    resolvedNode,
    distinctNode,
    distinctOCPack,
    eqPropNode,
    neqPropNode,
    forwardLNode,
    forwardUNode,
    reverseLNode,
    reverseUNode,
    alternateNode,
    dotNode,
    ifLNode,
    ifUNode,
    derivation,
    replay,
  };
}

// Full positive composition: Eq proof -> explicit L, explicit K.current=L -> dot/IF,
// then AND -> OR/case with raw implication carriers -> MP. Every dependency is structural.
{
  const f = fixture();
  const A = f.fresh(), B = f.fresh(), T = f.fresh(), E = f.fresh();
  const fallback = f.fresh(), result = f.fresh(), final = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.L);
  defineLocalRepresentativeBinding(f.memory, K, A, f.basis.O);
  defineLocalRepresentativeBinding(f.memory, K, B, f.basis.O);

  const resolved = f.resolvedNode(K, A, B, f.basis.O, f.basis.O);
  same(replayEqualityEvaluation(f.memory, resolved.equality), true, "closed Eq_K positive precondition");
  const eq = f.eqPropNode(K, A, B, f.basis.O, resolved.occurrence);
  const value = f.forwardLNode(K, A, B, eq.occurrence);

  const dot = f.dotNode(K, f.basis.L);
  const selected = f.ifLNode(K, T, E, dot.occurrence);
  const valueClaim = f.eqValue(K, A, B, f.basis.L);
  const ifClaim = f.ifValue(K, f.basis.L, T, E, T);
  const conjunction = f.andIntroNode(valueClaim, ifClaim, [value.occurrence, selected.occurrence], K);
  const andClaim = f.and(valueClaim, ifClaim);
  const choice = f.orIntroNode(f.orLeft, andClaim, fallback, conjunction.occurrence, K);
  const implicationLeft = f.prove(f.pair(andClaim, result), K);
  const implicationRight = f.prove(f.pair(fallback, result), K);
  const cases = f.orCaseNode(
    andClaim,
    fallback,
    result,
    [choice.occurrence, implicationLeft.occurrence, implicationRight.occurrence],
    K,
  );
  const finalImplication = f.prove(f.pair(result, final), K);
  const target = f.mpNode(result, final, [cases.occurrence, finalImplication.occurrence], K);

  const checked = f.replay(
    target,
    [
      finalImplication,
      target,
      implicationRight,
      selected,
      resolved,
      cases,
      value,
      conjunction,
      dot,
      implicationLeft,
      choice,
      eq,
    ],
    [resolved.equality],
    [dot.contextual],
  );
  same(checked.target.judgment.claim, final, "integrated target");
  assert(f.pair(valueClaim, ifClaim) !== f.and(valueClaim, ifClaim), "raw Pair != AND carrier");
  assert(f.and(valueClaim, ifClaim) !== f.or(valueClaim, ifClaim), "AND != OR carrier");
}

// Raw Pair / foreign tags cannot cross the tagged connective boundaries.
{
  const f = fixture(), P = f.fresh(), Q = f.fresh(), R0 = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.L);
  for (const impostor of [f.pair(P, Q), f.and(P, Q, f.foreignAndTag)]) {
    const fake = f.prove(impostor, K);
    const target = f.andLeftNode(P, Q, fake.occurrence, K);
    reject(() => f.replay(target, [target, fake]), "raw/foreign carrier cannot impersonate AND");
  }
  const pToR = f.prove(f.pair(P, R0), K);
  const qToR = f.prove(f.pair(Q, R0), K);
  for (const impostor of [f.pair(P, Q), f.or(P, Q, f.foreignOrTag)]) {
    const fake = f.prove(impostor, K);
    const target = f.orCaseNode(P, Q, R0, [fake.occurrence, pToR.occurrence, qToR.occurrence], K);
    reject(() => f.replay(target, [target, fake, pToR, qToR]), "raw/foreign carrier cannot impersonate OR");
  }
}

// OR branch evidence is structural; a host label cannot turn Q into the LEFT premise P.
{
  const f = fixture(), P = f.fresh(), Q = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.L);
  const q = f.prove(Q, K);
  const target = f.orIntroNode(f.orLeft, P, Q, q.occurrence, K);
  const labelled = Object.freeze({
    occurrence: target.occurrence,
    node: Object.freeze({ ...target.node, branch: "left", ruleKind: "or-left" }),
  });
  reject(() => f.replay(labelled, [labelled, q]), "host OR branch label has no authority");
}

// Raw implication authority is Theory-local; missing structural premises remain missing despite host order/metadata.
{
  const f = fixture(), P = f.fresh(), Q = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.L);
  const p = f.prove(P, K), implication = f.prove(f.pair(P, Q), K);
  const foreignTarget = f.mpNode(P, Q, [p.occurrence, implication.occurrence], K);
  const forgedForeign = Object.freeze({
    occurrence: foreignTarget.occurrence,
    node: Object.freeze({
      ...foreignTarget.node,
      judgment: Object.freeze({
        ...foreignTarget.node.judgment,
        application: Object.freeze({
          ...foreignTarget.node.judgment.application,
          expectedInterpreter: f.foreign.expectedInterpreter,
          ruleKind: "modusPonens",
        }),
        judgment: Object.freeze({
          ...foreignTarget.node.judgment.judgment,
          theory: f.foreignTheory,
        }),
      }),
    }),
  });
  reject(
    () => replayStructuralDerivation(
      f.memory,
      f.derivation(forgedForeign, [forgedForeign, p, implication], f.foreignTheory),
    ),
    "cross-Theory Pair implication",
  );

  const missing = f.mpNode(P, Q, [p.occurrence, implication.occurrence], K);
  const irrelevant = f.prove(f.fresh(), K);
  reject(
    () => f.replay(missing, [irrelevant, missing, p]),
    "host reorder/irrelevant node cannot replace missing implication premise",
  );
}

// Closed negative reflection requires the explicit Distinct proof. Uncovered host-false remains unknown.
{
  const f = fixture(), A = f.fresh(), B = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.L);
  const unresolved = f.resolvedNode(K, A, B, A, B);
  same(replayEqualityEvaluation(f.memory, unresolved.equality), false, "host equality convenience result is false");
  const wrongDistinct = f.distinctNode(f.distinctOCPack, f.distinctOC, K);
  const neq = f.neqPropNode(K, A, B, A, B, unresolved.occurrence, wrongDistinct.occurrence);
  const value = f.forwardUNode(K, A, B, neq.occurrence);
  reject(
    () => f.replay(value, [value, neq, wrongDistinct, unresolved], [unresolved.equality]),
    "uncovered Eq_K false cannot become NeqProp/U",
  );

  defineLocalRepresentativeBinding(f.memory, K, A, f.basis.O);
  defineLocalRepresentativeBinding(f.memory, K, B, f.basis.C);
  const closed = f.resolvedNode(K, A, B, f.basis.O, f.basis.C);
  const distinct = f.distinctNode(f.distinctOCPack, f.distinctOC, K);
  const closedNeq = f.neqPropNode(K, A, B, f.basis.O, f.basis.C, closed.occurrence, distinct.occurrence);
  const missingNeq = f.forwardUNode(K, A, B, closedNeq.occurrence);
  reject(
    () => f.replay(missingNeq, [missingNeq, closed, distinct], [closed.equality]),
    "absence of NeqProp proof cannot synthesize U",
  );
}

// A valid alternate EqValue fact replays independently but cannot impersonate either reflection atom.
{
  const f = fixture(), A = f.fresh(), B = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.L);
  const alternate = f.alternateNode(K, A, B);
  same(
    f.replay(alternate, [alternate]).target.judgment.claim,
    f.eqValue(K, A, B, f.alternateValue),
    "alternate EqValue is a valid fact",
  );
  const asL = f.reverseLNode(K, A, B, alternate.occurrence);
  reject(() => f.replay(asL, [asL, alternate]), "alternate EqValue cannot impersonate L");
  const asU = f.reverseUNode(K, A, B, alternate.occurrence);
  reject(() => f.replay(asU, [asU, alternate]), "alternate EqValue cannot impersonate U");

  const l = f.prove(f.eqValue(K, A, B, f.basis.L), K);
  const negative = f.reverseUNode(K, A, B, l.occurrence);
  reject(() => f.replay(negative, [negative, l]), "L cannot reflect to NeqProp");
  const u = f.prove(f.eqValue(K, A, B, f.basis.U), K);
  const positive = f.reverseLNode(K, A, B, u.occurrence);
  reject(() => f.replay(positive, [positive, u]), "U cannot reflect to EqProp");
}

// Explicit K/Role_ctx remain the only dot authority; DotMeaning and host metadata cannot select IF.
{
  const f = fixture(), T = f.fresh(), E = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.L);
  const dotMeaning = f.dotNode(K, f.basis.L, f.dotMeaningSource);
  const meaningTarget = f.ifLNode(K, T, E, dotMeaning.occurrence);
  reject(
    () => f.replay(meaningTarget, [meaningTarget, dotMeaning], [], [dotMeaning.contextual]),
    "DotMeaning cannot impersonate contextual dot role",
  );

  const wrongK = defineContext(f.memory, f.basis.R, f.basis.U);
  const wrong = f.dotNode(K, f.basis.U, undefined, wrongK);
  const wrongTarget = f.ifUNode(K, T, E, wrong.occurrence);
  reject(
    () => f.replay(wrongTarget, [wrongTarget, wrong], [], [wrong.contextual]),
    "wrong explicit K cannot choose IF branch",
  );

  const dot = f.dotNode(K, f.basis.L);
  const noisy = Object.freeze({ ...dot.contextual, branch: "else", condition: false });
  const target = f.ifLNode(K, T, E, dot.occurrence);
  same(
    f.replay(target, [target, dot], [], [noisy]).target.judgment.claim,
    f.ifValue(K, f.basis.L, T, E, T),
    "host IF metadata ignored",
  );
}

class WriteInjectingProbe implements ReadMemory {
  private injected = false;
  constructor(
    private readonly source: Memory,
    private readonly start: LinkHandle,
    private readonly end: LinkHandle,
  ) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined { return this.source.find(start, end); }
  incoming(end: LinkHandle): readonly LinkHandle[] { return this.source.incoming(end); }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    if (!this.injected) {
      this.injected = true;
      this.source.ensure(this.start, this.end);
    }
    return this.source.outgoing(start);
  }
}

// Cross-layer verification remains read-only and rejects mutation during contextual/equality replay.
{
  const f = fixture(), A = f.fresh(), T = f.fresh(), E = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.L);
  defineLocalRepresentativeBinding(f.memory, K, A, f.basis.O);
  const resolved = f.resolvedNode(K, A, A, f.basis.O, f.basis.O);
  const eq = f.eqPropNode(K, A, A, f.basis.O, resolved.occurrence);
  const value = f.forwardLNode(K, A, A, eq.occurrence);
  const dot = f.dotNode(K, f.basis.L);
  const target = f.ifLNode(K, T, E, dot.occurrence);
  const x = f.fresh(), y = f.fresh();
  assert(f.memory.find(x, y) === undefined, "injection pair starts absent");
  reject(
    () => f.replay(
      target,
      [target, dot, value, eq, resolved],
      [resolved.equality],
      [dot.contextual],
      new WriteInjectingProbe(f.memory, x, y),
    ),
    "write injection",
  );
}

const P9_OBJECT_LOGIC_COMPOSITION_BOUNDARY_ESTABLISHED = true;
const P9_HIDDEN_HOST_AUTHORITY_ESTABLISHED = false;
const P9_TRUSTED_CONNECTIVE_OPCODE_REQUIRED = false;
assert(P9_OBJECT_LOGIC_COMPOSITION_BOUNDARY_ESTABLISHED, "composition classification");
assert(!P9_HIDDEN_HOST_AUTHORITY_ESTABLISHED, "no hidden host authority classification");
assert(!P9_TRUSTED_CONNECTIVE_OPCODE_REQUIRED, "no connective/reflection/IF opcode classification");
