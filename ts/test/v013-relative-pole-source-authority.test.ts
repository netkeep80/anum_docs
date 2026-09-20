import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import { exportPortableStructuralTheory } from "../src/portable-theory.js";
import { defineSourceForm } from "../src/source.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  type StructuralInterpreter,
  type StructuralRuleReplayEvidence,
} from "../src/structural-rule.js";
import {
  defineActField,
  defineActHeader,
} from "../src/structural-readers.js";
import { defineContext } from "../src/state.js";
import {
  buildV012SelectedSourceEvidence,
  materializeV012SourceContent,
  type V012SourceAuthority,
  type V012SourceResultEvidence,
} from "../src/v012-source.js";
import {
  materializeRelativePoleContext,
} from "../src/v013-relative-pole-context.js";
import {
  executeAuthorizedRelativePoleSource,
} from "../src/v013-relative-pole-execution.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 pole source authority: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function expectCode(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof Error, `expected Error, got ${String(error)}`);
    same(
      (error as Error & { readonly code?: string }).code,
      code,
      "error code",
    );
    return;
  }
  throw new Error(`v0.13 pole source authority: expected ${code}`);
}

function anchors(memory: Memory, count: number): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  const seed = memory.ensureEndSelfClosed(memory.root);
  let tag = memory.ensureStartSelfClosed(memory.root);
  for (let index = 0; index < count; index += 1) {
    tag = memory.ensureStartSelfClosed(tag);
    result.push(memory.ensure(seed, tag));
  }
  return Object.freeze(result);
}

interface InterpreterFixture {
  readonly handle: LinkHandle;
  readonly structure: StructuralInterpreter;
}

function defineInterpreter(
  memory: Memory,
  dictionary: LinkHandle,
  grammar: LinkHandle,
  theory: LinkHandle,
): InterpreterFixture {
  return Object.freeze({
    handle: defineStructuralInterpreter(memory, dictionary, grammar, theory),
    structure: Object.freeze({ dictionary, grammar, theory }),
  });
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: ReturnType<typeof ensureRootBasis>;
  readonly interpreter: InterpreterFixture;
  readonly roleDictionary: LinkHandle;
  readonly sourceUseRole: LinkHandle;
  readonly operandRole: LinkHandle;
  readonly maleUse: LinkHandle;
  readonly femaleUse: LinkHandle;
  readonly maleAuthority: V012SourceAuthority;
  readonly femaleAuthority: V012SourceAuthority;
  readonly maleSourceEvidence: ReturnType<typeof buildV012SelectedSourceEvidence>;
  readonly femaleSourceEvidence: ReturnType<typeof buildV012SelectedSourceEvidence>;
  readonly prefixRule: LinkHandle;
  readonly prefixAdmission: LinkHandle;
  readonly postfixRule: LinkHandle;
  readonly postfixAdmission: LinkHandle;
  readonly fixedTheory: unknown;
  readonly parent: LinkHandle;
  readonly a: LinkHandle;
  readonly b: LinkHandle;
  readonly c: LinkHandle;
  readonly S: LinkHandle;
  readonly T: LinkHandle;
  prefix(operand: LinkHandle): LinkHandle;
  postfix(operand: LinkHandle): LinkHandle;
  evidence(
    source: "male" | "female",
    currentContext: LinkHandle,
    rule: LinkHandle,
    admission: LinkHandle,
    operation: LinkHandle,
    operand: LinkHandle,
  ): V012SourceResultEvidence;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const refs = anchors(memory, 40);

  const maleUse = refs[0]!;
  const femaleUse = refs[1]!;
  const sourceUseRole = refs[2]!;
  const operandRole = refs[3]!;
  const grammar = refs[4]!;
  const theory = refs[5]!;

  const maleContent = materializeV012SourceContent(
    memory,
    basis,
    Uint8Array.of(0xe2, 0x99, 0x82),
  );
  const femaleContent = materializeV012SourceContent(
    memory,
    basis,
    Uint8Array.of(0xe2, 0x99, 0x80),
  );
  const maleSource = defineSourceForm(memory, maleContent);
  const femaleSource = defineSourceForm(memory, femaleContent);

  const scope0 = defineDictionaryScope(memory, memory.root, memory.root);
  const maleEffect = defineDictionaryEffect(
    memory,
    scope0,
    memory.root,
    memory.root,
    maleContent,
    maleUse,
  );
  const femaleEffect = defineDictionaryEffect(
    memory,
    maleEffect.afterScope,
    memory.root,
    maleEffect.historyAfter,
    femaleContent,
    femaleUse,
  );
  const dictionary = femaleEffect.afterScope;

  const maleSequence = materializeExactSequence(memory, [maleUse]);
  const femaleSequence = materializeExactSequence(memory, [femaleUse]);
  const maleAuthority: V012SourceAuthority = Object.freeze({
    dictionary,
    grammar,
    theory,
    grammarMembership: memory.ensure(grammar, maleSequence),
    theoryMembership: memory.ensure(theory, maleSequence),
  });
  const femaleAuthority: V012SourceAuthority = Object.freeze({
    dictionary,
    grammar,
    theory,
    grammarMembership: memory.ensure(grammar, femaleSequence),
    theoryMembership: memory.ensure(theory, femaleSequence),
  });

  const interpreter = defineInterpreter(memory, dictionary, grammar, theory);
  const roleDictionary = defineStructuralRoleDictionary(
    memory,
    [sourceUseRole, operandRole],
  );

  // SourceUse and Operand are both structural roles. The operation occurrence
  // itself carries Operand in its non-self pole.
  const prefixTemplate = memory.ensureStartSelfClosed(operandRole);
  const prefixRule = defineStructuralRule(
    memory,
    roleDictionary,
    memory.ensure(sourceUseRole, prefixTemplate),
  );
  const prefixAdmission = admitStructuralRule(memory, theory, prefixRule);

  const postfixTemplate = memory.ensureEndSelfClosed(operandRole);
  const postfixRule = defineStructuralRule(
    memory,
    roleDictionary,
    memory.ensure(sourceUseRole, postfixTemplate),
  );
  const postfixAdmission = admitStructuralRule(memory, theory, postfixRule);

  const fixedTheory = exportPortableStructuralTheory(memory, theory);

  const maleSourceEvidence = buildV012SelectedSourceEvidence(
    memory,
    basis,
    maleSource,
    [{
      start: 0,
      end: 3,
      form: maleUse,
      dictionaryOccurrence: maleEffect.occurrence,
    }],
    maleAuthority,
  );
  const femaleSourceEvidence = buildV012SelectedSourceEvidence(
    memory,
    basis,
    femaleSource,
    [{
      start: 0,
      end: 3,
      form: femaleUse,
      dictionaryOccurrence: femaleEffect.occurrence,
    }],
    femaleAuthority,
  );

  const parent = defineContext(memory, basis.R, basis.R);
  const a = refs[20]!;
  const b = refs[21]!;
  const c = refs[22]!;
  const S = memory.ensure(a, b);
  const T = memory.ensure(a, c);
  assert(S !== T, "branching fixture requires S != T");

  const prefix = (operand: LinkHandle): LinkHandle =>
    memory.ensureStartSelfClosed(operand);
  const postfix = (operand: LinkHandle): LinkHandle =>
    memory.ensureEndSelfClosed(operand);

  function evidence(
    source: "male" | "female",
    currentContext: LinkHandle,
    rule: LinkHandle,
    admission: LinkHandle,
    operation: LinkHandle,
    operand: LinkHandle,
  ): V012SourceResultEvidence {
    const selectedUse = source === "male" ? maleUse : femaleUse;
    const sourceEvidence = source === "male"
      ? maleSourceEvidence
      : femaleSourceEvidence;

    const act = defineActHeader(
      memory,
      interpreter.handle,
      roleDictionary,
      currentContext,
    );
    const sourceAttachment = defineActField(
      memory,
      act,
      sourceUseRole,
      selectedUse,
    );
    const operandAttachment = defineActField(
      memory,
      act,
      operandRole,
      operand,
    );
    const structural: StructuralRuleReplayEvidence = Object.freeze({
      act,
      rule,
      ruleAdmission: admission,
      claimedBody: memory.ensure(selectedUse, operation),
      expectedInterpreter: interpreter.structure,
      expectedAfterContext: currentContext,
    });
    return Object.freeze({
      source: sourceEvidence,
      structural,
      selectedActAttachments: Object.freeze([
        sourceAttachment,
        operandAttachment,
      ]),
      sourceUseIndex: 0,
      sourceUseRole,
    });
  }

  return Object.freeze({
    memory,
    basis,
    interpreter,
    roleDictionary,
    sourceUseRole,
    operandRole,
    maleUse,
    femaleUse,
    maleAuthority,
    femaleAuthority,
    maleSourceEvidence,
    femaleSourceEvidence,
    prefixRule,
    prefixAdmission,
    postfixRule,
    postfixAdmission,
    fixedTheory,
    parent,
    a,
    b,
    c,
    S,
    T,
    prefix,
    postfix,
    evidence,
  });
}

// Exact physical ♂ selects a concrete ♂S occurrence, and exact physical ♀
// selects a concrete a♀ occurrence. Both the Rule and execution verify Operand.
{
  const f = fixture();
  const base = defineContext(f.memory, f.parent, f.S);

  const maleOccurrence = f.prefix(f.S);
  const selected = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    base,
    f.S,
    f.evidence(
      "male",
      base,
      f.prefixRule,
      f.prefixAdmission,
      maleOccurrence,
      f.S,
    ),
    f.maleAuthority,
    f.fixedTheory,
  );
  same(selected.operation, maleOccurrence, "Rule grounds exact ♂S");
  same(selected.result, f.a, "♂S selects start(S)");

  const femaleOccurrence = f.postfix(f.a);
  const returned = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    selected.afterContext,
    f.a,
    f.evidence(
      "female",
      selected.afterContext,
      f.postfixRule,
      f.postfixAdmission,
      femaleOccurrence,
      f.a,
    ),
    f.femaleAuthority,
    f.fixedTheory,
  );
  same(returned.operation, femaleOccurrence, "Rule grounds exact a♀");
  same(returned.result, f.S, "♂S♀ returns S");
  same(returned.afterContext, base, "♂S♀ restores parent context");
}

// Evidence anchored to K_S cannot authorize execution at K_T even when both
// contexts select the same semantic a.
{
  const f = fixture();
  const baseS = defineContext(f.memory, f.parent, f.S);
  const baseT = defineContext(f.memory, f.parent, f.T);
  const kS = materializeRelativePoleContext(
    f.memory, f.basis, baseS, f.S, [f.basis.O],
  );
  const kT = materializeRelativePoleContext(
    f.memory, f.basis, baseT, f.T, [f.basis.O],
  );
  same(kS.selected, f.a, "K_S selects shared a");
  same(kT.selected, f.a, "K_T selects shared a");

  const operation = f.postfix(f.a);
  const evidence = f.evidence(
    "female",
    kS.context,
    f.postfixRule,
    f.postfixAdmission,
    operation,
    f.a,
  );
  const before = f.memory.linkCount;
  expectCode(
    "context-evidence-mismatch",
    () => executeAuthorizedRelativePoleSource(
      f.memory,
      f.basis,
      kT.context,
      f.a,
      evidence,
      f.femaleAuthority,
      f.fixedTheory,
    ),
  );
  same(f.memory.linkCount, before, "context substitution writes nothing");
}

// Glyph spelling does not determine unary direction. The same physical ♀ can
// select the admitted prefix Rule, whose concrete occurrence still carries S.
{
  const f = fixture();
  const base = defineContext(f.memory, f.parent, f.S);
  const occurrence = f.prefix(f.S);
  const selected = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    base,
    f.S,
    f.evidence(
      "female",
      base,
      f.prefixRule,
      f.prefixAdmission,
      occurrence,
      f.S,
    ),
    f.femaleAuthority,
    f.fixedTheory,
  );
  same(selected.operation, occurrence, "female source may select prefix Rule");
  same(selected.result, f.a, "direction comes from self-incidence, not glyph");
}

// A generic non-self-closed operation is not assigned unary semantics even when
// the selected Act carries an explicit Operand.
{
  const f = fixture();
  const base = defineContext(f.memory, f.parent, f.S);
  const unsupported = f.memory.ensure(f.a, f.b);
  assert(
    f.memory.poles(unsupported).start !== unsupported &&
      f.memory.poles(unsupported).end !== unsupported,
    "unsupported operation must be generic",
  );

  const rule = defineStructuralRule(
    f.memory,
    f.roleDictionary,
    f.memory.ensure(f.sourceUseRole, unsupported),
  );
  const admission = admitStructuralRule(
    f.memory,
    f.interpreter.structure.theory,
    rule,
  );
  const authority = exportPortableStructuralTheory(
    f.memory,
    f.interpreter.structure.theory,
  );
  const evidence = f.evidence(
    "female",
    base,
    rule,
    admission,
    unsupported,
    f.S,
  );

  const before = f.memory.linkCount;
  expectCode(
    "unsupported-operation-form",
    () => executeAuthorizedRelativePoleSource(
      f.memory,
      f.basis,
      base,
      f.S,
      evidence,
      f.femaleAuthority,
      authority,
    ),
  );
  same(f.memory.linkCount, before, "unsupported form writes nothing");
}

// One direct deep path remains distinct from repeated unary prefix occurrences.
{
  const f = fixture();
  const left = f.memory.ensure(f.a, f.b);
  const deepS = f.memory.ensure(left, f.c);
  const base = defineContext(f.memory, f.parent, deepS);
  const deep = materializeRelativePoleContext(
    f.memory,
    f.basis,
    base,
    deepS,
    [f.basis.O, f.basis.O],
  );
  same(deep.selected, f.a, "START,START selects a");

  const operation = f.postfix(f.a);
  const evidence = f.evidence(
    "female",
    deep.context,
    f.postfixRule,
    f.postfixAdmission,
    operation,
    f.a,
  );
  const before = f.memory.linkCount;
  expectCode(
    "multi-step-return-undefined",
    () => executeAuthorizedRelativePoleSource(
      f.memory,
      f.basis,
      deep.context,
      f.a,
      evidence,
      f.femaleAuthority,
      f.fixedTheory,
    ),
  );
  same(f.memory.linkCount, before, "undefined deep-path ascent writes nothing");
}

// Repeated unary prefixes create nested one-step Link contexts. Each concrete
// postfix occurrence carries the current semantic Link and closes one level.
{
  const f = fixture();
  const left = f.memory.ensure(f.a, f.b);
  const deepS = f.memory.ensure(left, f.c);
  const base = defineContext(f.memory, f.parent, deepS);

  const firstPrefix = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    base,
    deepS,
    f.evidence(
      "male",
      base,
      f.prefixRule,
      f.prefixAdmission,
      f.prefix(deepS),
      deepS,
    ),
    f.maleAuthority,
    f.fixedTheory,
  );
  same(firstPrefix.result, left, "first ♂ yields ♂S = left");

  const secondPrefix = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    firstPrefix.afterContext,
    left,
    f.evidence(
      "male",
      firstPrefix.afterContext,
      f.prefixRule,
      f.prefixAdmission,
      f.prefix(left),
      left,
    ),
    f.maleAuthority,
    f.fixedTheory,
  );
  same(secondPrefix.result, f.a, "second ♂ yields ♂♂S = a");

  const firstPostfix = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    secondPrefix.afterContext,
    f.a,
    f.evidence(
      "female",
      secondPrefix.afterContext,
      f.postfixRule,
      f.postfixAdmission,
      f.postfix(f.a),
      f.a,
    ),
    f.femaleAuthority,
    f.fixedTheory,
  );
  same(firstPostfix.result, left, "♂♂S♀ = ♂S");
  same(
    firstPostfix.afterContext,
    firstPrefix.afterContext,
    "first ♀ returns K2 -> K1",
  );

  const secondPostfix = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    firstPostfix.afterContext,
    left,
    f.evidence(
      "female",
      firstPostfix.afterContext,
      f.postfixRule,
      f.postfixAdmission,
      f.postfix(left),
      left,
    ),
    f.femaleAuthority,
    f.fixedTheory,
  );
  same(secondPostfix.result, deepS, "♂♂S♀♀ = S");
  same(secondPostfix.afterContext, base, "second ♀ returns K1 -> K0");
}

// StructuralRule itself rejects a substituted Operand when the Act binding and
// the concrete self-incidence disagree.
{
  const f = fixture();
  const base = defineContext(f.memory, f.parent, f.S);

  const wrongPrefixEvidence = f.evidence(
    "male",
    base,
    f.prefixRule,
    f.prefixAdmission,
    f.prefix(f.T),
    f.S,
  );
  const beforePrefix = f.memory.linkCount;
  expectCode(
    "template-mismatch",
    () => executeAuthorizedRelativePoleSource(
      f.memory,
      f.basis,
      base,
      f.S,
      wrongPrefixEvidence,
      f.maleAuthority,
      f.fixedTheory,
    ),
  );
  same(f.memory.linkCount, beforePrefix, "Rule rejects substituted prefix operand");

  const correctPrefixEvidence = f.evidence(
    "male",
    base,
    f.prefixRule,
    f.prefixAdmission,
    f.prefix(f.S),
    f.S,
  );
  const selected = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    base,
    f.S,
    correctPrefixEvidence,
    f.maleAuthority,
    f.fixedTheory,
  );

  const wrongPostfixEvidence = f.evidence(
    "female",
    selected.afterContext,
    f.postfixRule,
    f.postfixAdmission,
    f.postfix(f.b),
    f.a,
  );
  const beforePostfix = f.memory.linkCount;
  expectCode(
    "template-mismatch",
    () => executeAuthorizedRelativePoleSource(
      f.memory,
      f.basis,
      selected.afterContext,
      f.a,
      wrongPostfixEvidence,
      f.femaleAuthority,
      f.fixedTheory,
    ),
  );
  same(f.memory.linkCount, beforePostfix, "Rule rejects substituted postfix operand");
}

// Even a weak admitted prototype Rule without Operand role cannot authorize a
// concrete occurrence whose non-self pole differs from current input.
{
  const f = fixture();
  const base = defineContext(f.memory, f.parent, f.S);
  const weakRoleDictionary = defineStructuralRoleDictionary(
    f.memory,
    [f.sourceUseRole],
  );
  const weakPrototype = f.prefix(f.T);
  const weakRule = defineStructuralRule(
    f.memory,
    weakRoleDictionary,
    f.memory.ensure(f.sourceUseRole, weakPrototype),
  );
  const weakAdmission = admitStructuralRule(
    f.memory,
    f.interpreter.structure.theory,
    weakRule,
  );
  const weakTheory = exportPortableStructuralTheory(
    f.memory,
    f.interpreter.structure.theory,
  );

  const act = defineActHeader(
    f.memory,
    f.interpreter.handle,
    weakRoleDictionary,
    base,
  );
  const sourceAttachment = defineActField(
    f.memory,
    act,
    f.sourceUseRole,
    f.maleUse,
  );
  const structural: StructuralRuleReplayEvidence = Object.freeze({
    act,
    rule: weakRule,
    ruleAdmission: weakAdmission,
    claimedBody: f.memory.ensure(f.maleUse, weakPrototype),
    expectedInterpreter: f.interpreter.structure,
    expectedAfterContext: base,
  });
  const evidence: V012SourceResultEvidence = Object.freeze({
    source: f.maleSourceEvidence,
    structural,
    selectedActAttachments: Object.freeze([sourceAttachment]),
    sourceUseIndex: 0,
    sourceUseRole: f.sourceUseRole,
  });

  const before = f.memory.linkCount;
  expectCode(
    "operation-operand-mismatch",
    () => executeAuthorizedRelativePoleSource(
      f.memory,
      f.basis,
      base,
      f.S,
      evidence,
      f.maleAuthority,
      weakTheory,
    ),
  );
  same(f.memory.linkCount, before, "weak prototype with foreign operand writes nothing");
}

// Symmetric END-side navigation required by inversion:
//
//   S=a->b
//   S♀ = b
//   ♂(S♀) = S
//
// This must be source/Rule/context-driven, not a host poles(S).end shortcut.
{
  const f = fixture();
  const base = defineContext(f.memory, f.parent, f.S);

  const endEvidence = f.evidence(
    "female",
    base,
    f.postfixRule,
    f.postfixAdmission,
    f.postfix(f.S),
    f.S,
  );
  const endSelected = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    base,
    f.S,
    endEvidence,
    f.femaleAuthority,
    f.fixedTheory,
  );
  same(endSelected.result, f.b, "S♀ selects end(S)=b");
  assert(endSelected.afterContext !== base, "S♀ opens K_END");

  const returnEvidence = f.evidence(
    "male",
    endSelected.afterContext,
    f.prefixRule,
    f.prefixAdmission,
    f.prefix(f.b),
    f.b,
  );
  const returned = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    endSelected.afterContext,
    f.b,
    returnEvidence,
    f.maleAuthority,
    f.fixedTheory,
  );
  same(returned.result, f.S, "♂(S♀) returns S");
  same(returned.afterContext, base, "opposite sign closes K_END");
}

// Same-direction END nesting mirrors the already-proven START nesting.
{
  const f = fixture();

  const x = f.memory.ensure(f.a, f.b);
  const y = f.memory.ensure(f.c, f.a);
  const deepS = f.memory.ensure(x, y);
  const yEnd = f.memory.poles(y).end;
  same(yEnd, f.a, "fixture end(y)=a");

  const base = defineContext(f.memory, f.parent, deepS);

  const firstEnd = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    base,
    deepS,
    f.evidence(
      "female",
      base,
      f.postfixRule,
      f.postfixAdmission,
      f.postfix(deepS),
      deepS,
    ),
    f.femaleAuthority,
    f.fixedTheory,
  );
  same(firstEnd.result, y, "first ♀ yields end(S)=y");

  const secondEnd = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    firstEnd.afterContext,
    y,
    f.evidence(
      "female",
      firstEnd.afterContext,
      f.postfixRule,
      f.postfixAdmission,
      f.postfix(y),
      y,
    ),
    f.femaleAuthority,
    f.fixedTheory,
  );
  same(secondEnd.result, f.a, "second ♀ yields end(end(S))=a");

  const firstStart = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    secondEnd.afterContext,
    f.a,
    f.evidence(
      "male",
      secondEnd.afterContext,
      f.prefixRule,
      f.prefixAdmission,
      f.prefix(f.a),
      f.a,
    ),
    f.maleAuthority,
    f.fixedTheory,
  );
  same(firstStart.result, y, "S♀♀♂ = S♀");
  same(firstStart.afterContext, firstEnd.afterContext, "♂ closes one END level");

  const secondStart = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    firstStart.afterContext,
    y,
    f.evidence(
      "male",
      firstStart.afterContext,
      f.prefixRule,
      f.prefixAdmission,
      f.prefix(y),
      y,
    ),
    f.maleAuthority,
    f.fixedTheory,
  );
  same(secondStart.result, deepS, "S♀♀♂♂ = S");
  same(secondStart.afterContext, base, "second ♂ closes remaining END level");
}

// Author inversion is a composition of the two relative pole reads:
//
//   -S := S♀ -> ♂S
//
// No invert opcode is introduced. START and END are selected through the same
// source/Rule/context execution boundary already tested above.
{
  const f = fixture();
  let contextMarker = f.memory.ensureStartSelfClosed(f.basis.L);

  function nextBase(whole: LinkHandle): LinkHandle {
    contextMarker = f.memory.ensureStartSelfClosed(contextMarker);
    const branchParent = defineContext(f.memory, f.parent, contextMarker);
    return defineContext(f.memory, branchParent, whole);
  }

  function selectStart(whole: LinkHandle): LinkHandle {
    const base = nextBase(whole);
    const selected = executeAuthorizedRelativePoleSource(
      f.memory,
      f.basis,
      base,
      whole,
      f.evidence(
        "male",
        base,
        f.prefixRule,
        f.prefixAdmission,
        f.prefix(whole),
        whole,
      ),
      f.maleAuthority,
      f.fixedTheory,
    );
    return selected.result;
  }

  function selectEnd(whole: LinkHandle): LinkHandle {
    const base = nextBase(whole);
    const selected = executeAuthorizedRelativePoleSource(
      f.memory,
      f.basis,
      base,
      whole,
      f.evidence(
        "female",
        base,
        f.postfixRule,
        f.postfixAdmission,
        f.postfix(whole),
        whole,
      ),
      f.femaleAuthority,
      f.fixedTheory,
    );
    return selected.result;
  }

  function invert(whole: LinkHandle): {
    readonly start: LinkHandle;
    readonly end: LinkHandle;
    readonly inverse: LinkHandle;
  } {
    const start = selectStart(whole);
    const end = selectEnd(whole);
    return Object.freeze({
      start,
      end,
      inverse: f.memory.ensure(end, start),
    });
  }

  // I1: S=a->b => -S=b->a.
  const invS = invert(f.S);
  same(invS.start, f.a, "♂S is start(S)=a");
  same(invS.end, f.b, "S♀ is end(S)=b");
  const invSPoles = f.memory.poles(invS.inverse);
  same(invSPoles.start, f.b, "-S starts at S♀");
  same(invSPoles.end, f.a, "-S ends at ♂S");

  // I2/I3: inversion swaps the two relative aspects.
  const startInvS = selectStart(invS.inverse);
  const endInvS = selectEnd(invS.inverse);
  same(startInvS, invS.end, "♂(-S) = S♀");
  same(endInvS, invS.start, "(-S)♀ = ♂S");

  // I4: double inversion is ordered-pair identity.
  const invInvS = invert(invS.inverse);
  same(invInvS.inverse, f.S, "--S = S");

  // I5: ROOT is value-level self-inverse.
  const invR = invert(f.basis.R);
  same(invR.start, f.basis.R, "♂R value is R");
  same(invR.end, f.basis.R, "R♀ value is R");
  same(invR.inverse, f.basis.R, "-R = R");

  // Form-level root orientation remains distinct from value-level inversion:
  // START_FORM(R)=O, END_FORM(R)=C, so O->C=L and C->O=U.
  const startFormR = f.prefix(f.basis.R);
  const endFormR = f.postfix(f.basis.R);
  same(startFormR, f.basis.O, "proper START_FORM(R)=O");
  same(endFormR, f.basis.C, "proper END_FORM(R)=C");
  same(
    f.memory.ensure(startFormR, endFormR),
    f.basis.L,
    "START_FORM(R)->END_FORM(R)=L",
  );
  same(
    f.memory.ensure(endFormR, startFormR),
    f.basis.U,
    "END_FORM(R)->START_FORM(R)=U",
  );
  assert(
    f.basis.U !== invR.inverse,
    "form-level C->O must not be confused with value-level -R",
  );

  // I6: branching does not collapse distinct wholes sharing the same start.
  const invT = invert(f.T);
  same(invT.start, f.a, "T shares start a");
  same(invT.end, f.c, "T end is c");
  assert(invT.inverse !== invS.inverse, "-T remains distinct from -S");
  same(f.memory.poles(invT.inverse).start, f.c, "-T starts at c");
  same(f.memory.poles(invT.inverse).end, f.a, "-T ends at shared a");
}

console.log("MTS v0.13 exact operand-relative unary authority: GREEN.");
