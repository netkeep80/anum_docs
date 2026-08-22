import { defineDictionaryEffect, defineDictionaryScope } from "../src/dictionary.js";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  InterpreterReplayError, replayContextualReading,
  type ContextualReadingEvidence, type ContextualReadingRoles,
} from "../src/interpreter.js";
import {
  Memory, ensureRootBasis,
  type LinkHandle, type LinkPoles, type ReadMemory,
} from "../src/memory.js";
import {
  buildSelectedSourceEvidence, defineSourceForm, materializeSourceContent,
  type SelectedSegmentSpec, type SourceFrontEndEvidence,
} from "../src/source.js";
import { defineContext } from "../src/state.js";
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
  if (!condition) throw new Error(`P9e dot-context IF: ${message}`);
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
  throw new Error(`P9e dot-context IF: ${message}: expected rejection`);
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
interface DotNode extends BuiltNode { readonly contextual: ContextualReadingEvidence; }
interface DotOptions {
  readonly source?: SourceFrontEndEvidence;
  readonly contextualRole?: LinkHandle;
  readonly afterContext?: LinkHandle;
  readonly omitBeforeContext?: boolean;
}

function fixture() {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const { R, L, U } = basis;
  assert(L !== U, "L/U must be distinct");
  let cursor = U;
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const exact = (values: readonly LinkHandle[]) => materializeExactSequence(memory, values);

  const dotRole = fresh(), otherForm = fresh(), grammar = fresh(), theory = fresh(), foreignTheory = fresh();
  const dotTag = fresh(), ifTag = fresh();
  const dotMeaning = memory.ensure(L, R);
  assert(dotRole !== dotMeaning && otherForm !== dotRole, "Role_ctx must be explicit data, not DotMeaning/glyph shape");

  const values = Array.from({ length: 10 }, () => fresh());
  const roles: ContextualReadingRoles = Object.freeze({
    source: values[0]!, sourceSelection: values[1]!, formSequence: values[2]!,
    dictionary: values[3]!, grammar: values[4]!, theory: values[5]!,
    beforeContext: values[6]!, contextualRole: values[7]!, result: values[8]!, afterContext: values[9]!,
  });
  const contextualRoleList = Object.freeze([
    roles.source, roles.sourceSelection, roles.formSequence, roles.dictionary, roles.grammar,
    roles.theory, roles.beforeContext, roles.contextualRole, roles.result, roles.afterContext,
  ]);
  const dotRoleDictionary = defineStructuralRoleDictionary(memory, contextualRoleList);

  const dotValue = (K: LinkHandle, C: LinkHandle) => exact([dotTag, K, C]);
  const ifValue = (
    K: LinkHandle, C: LinkHandle, T: LinkHandle, E: LinkHandle, result: LinkHandle,
  ) => exact([ifTag, K, C, T, E, result]);

  const dotRule = defineStructuralRule(memory, dotRoleDictionary, dotValue(roles.beforeContext, roles.result));
  const dotRuleAdmission = admitStructuralRule(memory, theory, dotRule);
  const dotDerivationRule = defineStructuralDerivationRule(memory, dotRule, []);
  const dotDerivationAdmission = admitStructuralDerivationRule(memory, theory, dotDerivationRule);

  function pack(
    declaredRoles: readonly LinkHandle[], conclusion: LinkHandle, premises: readonly LinkHandle[],
  ): RulePack {
    const roleDictionary = defineStructuralRoleDictionary(memory, declaredRoles);
    const rule = defineStructuralRule(memory, roleDictionary, conclusion);
    const ruleAdmission = admitStructuralRule(memory, theory, rule);
    const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
    const derivationAdmission = admitStructuralDerivationRule(memory, theory, derivationRule);
    return Object.freeze({ roleDictionary, rule, ruleAdmission, derivationRule, derivationAdmission });
  }

  const lK = fresh(), lT = fresh(), lE = fresh();
  const ifL = pack(
    [lK, lT, lE], ifValue(lK, L, lT, lE, lT), [dotValue(lK, L)],
  );
  const uK = fresh(), uT = fresh(), uE = fresh();
  const ifU = pack(
    [uK, uT, uE], ifValue(uK, U, uT, uE, uE), [dotValue(uK, U)],
  );

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
      memory, source, specs, { dictionary: dictionary.dictionary, grammar, theory },
    );
  }
  const admittedDotSource = sourceFor(dotRole);
  const glyphOnlySource = sourceFor(otherForm);
  const dotMeaningSource = sourceFor(dotMeaning);

  function dotNode(K: LinkHandle, C: LinkHandle, options: DotOptions = {}): DotNode {
    const source = options.source ?? admittedDotSource;
    const afterContext = options.afterContext ?? K;
    const interpreter = defineStructuralInterpreter(memory, source.dictionary, source.grammar, source.theory);
    const act = defineActHeader(memory, interpreter, dotRoleDictionary, afterContext);
    const fields: Binding[] = [
      [roles.source, source.source], [roles.sourceSelection, source.selectionSequence],
      [roles.formSequence, source.formSequence], [roles.dictionary, source.dictionary],
      [roles.grammar, source.grammar], [roles.theory, source.theory],
      [roles.contextualRole, options.contextualRole ?? dotRole], [roles.result, C],
      [roles.afterContext, afterContext],
    ];
    if (!options.omitBeforeContext) fields.push([roles.beforeContext, K]);
    for (const [role, value] of fields) defineActField(memory, act, role, value);

    const claim = dotValue(K, C);
    const expectedInterpreter: StructuralInterpreter = {
      dictionary: source.dictionary, grammar: source.grammar, theory: source.theory,
    };
    const judgment: StructuralJudgmentEvidence = {
      application: {
        act, rule: dotRule, ruleAdmission: dotRuleAdmission, claimedBody: claim,
        expectedInterpreter, expectedAfterContext: afterContext,
      },
      judgment: { theory, context: K, claim },
    };
    const occurrence = defineStructuralProofOccurrence(memory, act, claim);
    return Object.freeze({
      occurrence,
      contextual: Object.freeze({ sourceEvidence: source, act, roles, interpreter, roleDictionary: dotRoleDictionary }),
      node: Object.freeze({
        occurrence, judgment, derivationRule: dotDerivationRule,
        derivationRuleAdmission: dotDerivationAdmission,
        premiseOccurrenceSequence: exact([]),
      }),
    });
  }

  function ifNode(
    p: RulePack, K: LinkHandle, C: LinkHandle, T: LinkHandle, E: LinkHandle,
    result: LinkHandle, dotOccurrence: LinkHandle, ruleAdmission: LinkHandle = p.ruleAdmission,
  ): BuiltNode {
    const interpreter = defineStructuralInterpreter(memory, admittedDotSource.dictionary, grammar, theory);
    const act = defineActHeader(memory, interpreter, p.roleDictionary, K);
    const bindings: Binding[] = p === ifL
      ? [[lK, K], [lT, T], [lE, E]]
      : [[uK, K], [uT, T], [uE, E]];
    for (const [role, value] of bindings) defineActField(memory, act, role, value);
    const claim = ifValue(K, C, T, E, result);
    const judgment: StructuralJudgmentEvidence = {
      application: {
        act, rule: p.rule, ruleAdmission, claimedBody: claim,
        expectedInterpreter: { dictionary: admittedDotSource.dictionary, grammar, theory },
        expectedAfterContext: K,
      },
      judgment: { theory, context: K, claim },
    };
    const occurrence = defineStructuralProofOccurrence(memory, act, claim);
    return Object.freeze({ occurrence, node: Object.freeze({
      occurrence, judgment, derivationRule: p.derivationRule,
      derivationRuleAdmission: p.derivationAdmission,
      premiseOccurrenceSequence: exact([dotOccurrence]),
    }) });
  }

  const proof = (target: BuiltNode, dot: DotNode, nodes: readonly BuiltNode[] = [target, dot]): StructuralDerivationEvidence =>
    Object.freeze({ theory, targetOccurrence: target.occurrence, nodes: Object.freeze(nodes.map((x) => x.node)) });

  function replay(dot: DotNode, derivation: StructuralDerivationEvidence, readMemory: ReadMemory = memory) {
    const before = readMemory.linkCount;
    // Same Act is checked twice: contextual replay proves roles.result=K.current;
    // structural replay turns the exact same role bindings into DotValue(K,C).
    void replayContextualReading(readMemory, dot.contextual);
    const checked = replayStructuralDerivation(readMemory, derivation);
    same(readMemory.linkCount, before, "composed replay must be read-only");
    return checked;
  }
  function output(claim: LinkHandle): LinkHandle {
    const seq = readExactSequence(memory, claim).values;
    same(seq[0], ifTag, "IF tag");
    assert(seq.length === 6 && seq[5] !== undefined, "IF result slot");
    return seq[5]!;
  }

  return {
    memory, basis, theory, foreignTheory, dotRole, dotMeaning, otherForm,
    glyphOnlySource, dotMeaningSource, ifL, ifU, fresh, dotNode, ifNode, proof, replay, output,
  };
}

// Explicit K.current=L chooses Then through IF-L structural matching.
{
  const f = fixture(), T = f.fresh(), E = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.L);
  const dot = f.dotNode(K, f.basis.L);
  const target = f.ifNode(f.ifL, K, f.basis.L, T, E, T, dot.occurrence);
  const checked = f.replay(dot, f.proof(target, dot, [dot, target]));
  same(f.output(checked.target.judgment.claim), T, "L -> Then");
}

// Explicit K.current=U chooses Else; host node order is not branch authority.
{
  const f = fixture(), T = f.fresh(), E = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.U);
  const dot = f.dotNode(K, f.basis.U);
  const target = f.ifNode(f.ifU, K, f.basis.U, T, E, E, dot.occurrence);
  const checked = f.replay(dot, f.proof(target, dot, [target, dot]));
  same(f.output(checked.target.judgment.claim), E, "U -> Else");
}

// Same payload under two explicit nested contexts can choose opposite branches.
{
  const f = fixture(), T = f.fresh(), E = f.fresh();
  const outer = defineContext(f.memory, f.basis.R, f.basis.L);
  const inner = defineContext(f.memory, outer, f.basis.U);
  const outerDot = f.dotNode(outer, f.basis.L);
  const outerTarget = f.ifNode(f.ifL, outer, f.basis.L, T, E, T, outerDot.occurrence);
  same(f.output(f.replay(outerDot, f.proof(outerTarget, outerDot)).target.judgment.claim), T, "outer L");
  const innerDot = f.dotNode(inner, f.basis.U);
  const innerTarget = f.ifNode(f.ifU, inner, f.basis.U, T, E, E, innerDot.occurrence);
  same(f.output(f.replay(innerDot, f.proof(innerTarget, innerDot)).target.judgment.claim), E, "inner U");
}

// A non-L/U current is a valid contextual value but neither IF eliminator accepts it.
{
  const f = fixture(), C = f.fresh(), T = f.fresh(), E = f.fresh();
  const K = defineContext(f.memory, f.basis.R, C);
  const dot = f.dotNode(K, C);
  const proposed = f.ifNode(f.ifL, K, C, T, E, T, dot.occurrence);
  reject(() => f.replay(dot, f.proof(proposed, dot)), "non-L/U current must stay underdetermined");
}

// Wrong branch proposals reject in both directions.
{
  const f = fixture(), T = f.fresh(), E = f.fresh();
  const KL = defineContext(f.memory, f.basis.R, f.basis.L);
  const dotL = f.dotNode(KL, f.basis.L);
  const wrongU = f.ifNode(f.ifU, KL, f.basis.L, T, E, E, dotL.occurrence);
  reject(() => f.replay(dotL, f.proof(wrongU, dotL)), "IF-U under L");
  const KU = defineContext(f.memory, f.basis.R, f.basis.U);
  const dotU = f.dotNode(KU, f.basis.U);
  const wrongL = f.ifNode(f.ifL, KU, f.basis.U, T, E, T, dotU.occurrence);
  reject(() => f.replay(dotU, f.proof(wrongL, dotU)), "IF-L under U");
}

// Missing/wrong explicit K rejects before any IF branch can acquire authority.
{
  const f = fixture(), T = f.fresh(), E = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.L);
  const missing = f.dotNode(K, f.basis.L, { omitBeforeContext: true });
  const target = f.ifNode(f.ifL, K, f.basis.L, T, E, T, missing.occurrence);
  reject(() => f.replay(missing, f.proof(target, missing)), "missing explicit K");

  const wrongAfter = defineContext(f.memory, f.basis.R, f.basis.U);
  const wrong = f.dotNode(K, f.basis.U, { afterContext: wrongAfter });
  const wrongTarget = f.ifNode(f.ifU, K, f.basis.U, T, E, E, wrong.occurrence);
  reject(() => f.replay(wrong, f.proof(wrongTarget, wrong)), "wrong K/current result");
}

// Physical '.', another dictionary form, and DotMeaning cannot impersonate the admitted Role_ctx.
{
  const f = fixture(), T = f.fresh(), E = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.L);
  for (const source of [f.glyphOnlySource, f.dotMeaningSource]) {
    const dot = f.dotNode(K, f.basis.L, { source });
    const target = f.ifNode(f.ifL, K, f.basis.L, T, E, T, dot.occurrence);
    reject(() => f.replay(dot, f.proof(target, dot)), "non-Role_ctx dot source");
  }
  assert(f.dotRole !== f.dotMeaning, "DotMeaning must remain distinct from occurrence role");
}

// Host metadata cannot select a branch; the same contextual Act still proves L only.
{
  const f = fixture(), T = f.fresh(), E = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.L);
  const dot = f.dotNode(K, f.basis.L);
  const noisy: DotNode = Object.freeze({
    ...dot,
    contextual: Object.freeze({ ...dot.contextual, branch: "else", condition: false }),
  });
  const target = f.ifNode(f.ifL, K, f.basis.L, T, E, T, dot.occurrence);
  same(f.output(f.replay(noisy, f.proof(target, dot)).target.judgment.claim), T, "host metadata ignored");
}

// Foreign Theory admission cannot authorize IF-L.
{
  const f = fixture(), T = f.fresh(), E = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.L);
  const dot = f.dotNode(K, f.basis.L);
  const foreignAdmission = f.memory.ensure(f.foreignTheory, f.ifL.rule);
  const target = f.ifNode(f.ifL, K, f.basis.L, T, E, T, dot.occurrence, foreignAdmission);
  reject(() => f.replay(dot, f.proof(target, dot)), "wrong Theory admission");
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
    if (!this.injected) { this.injected = true; this.source.ensure(this.start, this.end); }
    return this.source.outgoing(start);
  }
}

// Replay-time mutation is rejected; unstable evidence never becomes a branch.
{
  const f = fixture(), T = f.fresh(), E = f.fresh();
  const K = defineContext(f.memory, f.basis.R, f.basis.L);
  const dot = f.dotNode(K, f.basis.L);
  const target = f.ifNode(f.ifL, K, f.basis.L, T, E, T, dot.occurrence);
  const a = f.fresh(), b = f.fresh();
  assert(f.memory.find(a, b) === undefined, "injection pair starts absent");
  reject(
    () => f.replay(dot, f.proof(target, dot), new WriteInjectingProbe(f.memory, a, b)),
    "write injection",
  );
}
