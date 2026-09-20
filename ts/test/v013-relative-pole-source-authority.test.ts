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
import {
  PortableStructuralTheoryError,
  exportPortableStructuralTheory,
} from "../src/portable-theory.js";
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

function expectExecutionError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof Error, `expected Error, got ${String(error)}`);
    same(
      (error as Error & { readonly code?: string }).code,
      code,
      "execution error code",
    );
    return;
  }
  throw new Error(`v0.13 pole source authority: expected ${code}`);
}

function expectTheoryError(effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof PortableStructuralTheoryError,
      `expected PortableStructuralTheoryError, got ${String(error)}`,
    );
    return;
  }
  throw new Error("v0.13 pole source authority: expected fixed-Theory rejection");
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
  readonly maleUse: LinkHandle;
  readonly femaleUse: LinkHandle;
  readonly prefixOperation: LinkHandle;
  readonly postfixOperation: LinkHandle;
  readonly unsupportedOperation: LinkHandle;
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
  sourceResult(
    source: "male" | "female",
    currentContext: LinkHandle,
    rule: LinkHandle,
    admission: LinkHandle,
    operation: LinkHandle,
  ): V012SourceResultEvidence;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const refs = anchors(memory, 36);

  const maleUse = refs[0]!;
  const femaleUse = refs[1]!;
  const sourceUseRole = refs[2]!;
  const grammar = refs[3]!;
  const theory = refs[4]!;

  // Operation direction is carried by the operation Link itself:
  // prefix  P = P -> x
  // postfix Q = x -> Q
  const prefixOperation = memory.ensureStartSelfClosed(refs[5]!);
  const postfixOperation = memory.ensureEndSelfClosed(refs[6]!);
  const unsupportedOperation = memory.ensure(refs[7]!, refs[8]!);

  const prefixPoles = memory.poles(prefixOperation);
  const postfixPoles = memory.poles(postfixOperation);
  const unsupportedPoles = memory.poles(unsupportedOperation);
  same(prefixPoles.start, prefixOperation, "prefix operation is start-self-closed");
  assert(prefixPoles.end !== prefixOperation, "prefix operation is proper");
  same(postfixPoles.end, postfixOperation, "postfix operation is end-self-closed");
  assert(postfixPoles.start !== postfixOperation, "postfix operation is proper");
  assert(
    unsupportedPoles.start !== unsupportedOperation &&
      unsupportedPoles.end !== unsupportedOperation,
    "unsupported operation is not unary self-incidence",
  );

  const maleContent = materializeV012SourceContent(
    memory,
    basis,
    Uint8Array.of(0xe2, 0x99, 0x82), // UTF-8 "♂"
  );
  const femaleContent = materializeV012SourceContent(
    memory,
    basis,
    Uint8Array.of(0xe2, 0x99, 0x80), // UTF-8 "♀"
  );
  const maleSource = defineSourceForm(memory, maleContent);
  const femaleSource = defineSourceForm(memory, femaleContent);

  const scope0 = defineDictionaryScope(memory, memory.root, memory.root);
  const maleDictionaryEffect = defineDictionaryEffect(
    memory,
    scope0,
    memory.root,
    memory.root,
    maleContent,
    maleUse,
  );
  const femaleDictionaryEffect = defineDictionaryEffect(
    memory,
    maleDictionaryEffect.afterScope,
    memory.root,
    maleDictionaryEffect.historyAfter,
    femaleContent,
    femaleUse,
  );
  const dictionary = femaleDictionaryEffect.afterScope;

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
  const roleDictionary = defineStructuralRoleDictionary(memory, [sourceUseRole]);

  const prefixRule = defineStructuralRule(
    memory,
    roleDictionary,
    memory.ensure(maleUse, prefixOperation),
  );
  const prefixAdmission = admitStructuralRule(memory, theory, prefixRule);

  const postfixRule = defineStructuralRule(
    memory,
    roleDictionary,
    memory.ensure(femaleUse, postfixOperation),
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
      dictionaryOccurrence: maleDictionaryEffect.occurrence,
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
      dictionaryOccurrence: femaleDictionaryEffect.occurrence,
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

  function sourceResult(
    source: "male" | "female",
    currentContext: LinkHandle,
    rule: LinkHandle,
    admission: LinkHandle,
    operation: LinkHandle,
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
    const attachment = defineActField(
      memory,
      act,
      sourceUseRole,
      selectedUse,
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
      selectedActAttachments: Object.freeze([attachment]),
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
    maleUse,
    femaleUse,
    prefixOperation,
    postfixOperation,
    unsupportedOperation,
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
    sourceResult,
  });
}

// No operation vocabulary is supplied. The Rule chooses one operation Link;
// execution derives prefix/postfix only from self-incidence of that Link.
{
  const f = fixture();
  const base = defineContext(f.memory, f.parent, f.S);

  const maleEvidence = f.sourceResult(
    "male",
    base,
    f.prefixRule,
    f.prefixAdmission,
    f.prefixOperation,
  );
  const selected = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    base,
    f.S,
    maleEvidence,
    f.maleAuthority,
    f.fixedTheory,
  );
  same(selected.operation, f.prefixOperation, "Rule selected exact prefix form");
  same(selected.result, f.a, "start-self-closed prefix selects start(S)");

  const femaleEvidence = f.sourceResult(
    "female",
    selected.afterContext,
    f.postfixRule,
    f.postfixAdmission,
    f.postfixOperation,
  );
  const returned = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    selected.afterContext,
    f.a,
    femaleEvidence,
    f.femaleAuthority,
    f.fixedTheory,
  );
  same(returned.operation, f.postfixOperation, "Rule selected exact postfix form");
  same(returned.result, f.S, "end-self-closed postfix returns selected Whole");
  same(returned.afterContext, base, "postfix returns to exact parent K");
}

// Evidence for K_S cannot authorize execution at K_T even if both select a.
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

  const evidence = f.sourceResult(
    "female",
    kS.context,
    f.postfixRule,
    f.postfixAdmission,
    f.postfixOperation,
  );
  const before = f.memory.linkCount;
  expectExecutionError(
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

// The same physical ♀ may be assigned a proper prefix form by a later Rule.
// Old Theory rejects it; later exact Theory authorizes it. No glyph switch is
// allowed to overrule the operation's own self-incidence.
{
  const f = fixture();
  const base = defineContext(f.memory, f.parent, f.S);
  const alternateRule = defineStructuralRule(
    f.memory,
    f.roleDictionary,
    f.memory.ensure(f.femaleUse, f.prefixOperation),
  );
  const alternateAdmission = admitStructuralRule(
    f.memory,
    f.interpreter.structure.theory,
    alternateRule,
  );
  const alternateEvidence = f.sourceResult(
    "female",
    base,
    alternateRule,
    alternateAdmission,
    f.prefixOperation,
  );

  const before = f.memory.linkCount;
  expectTheoryError(() => executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    base,
    f.S,
    alternateEvidence,
    f.femaleAuthority,
    f.fixedTheory,
  ));
  same(f.memory.linkCount, before, "old Theory rejects late Rule without writes");

  const laterTheory = exportPortableStructuralTheory(
    f.memory,
    f.interpreter.structure.theory,
  );
  const changed = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    base,
    f.S,
    alternateEvidence,
    f.femaleAuthority,
    laterTheory,
  );
  same(changed.result, f.a, "later Rule makes the same ♀ source prefix-like");
}

// A generic non-self-closed operation is not silently assigned unary semantics.
{
  const f = fixture();
  const base = defineContext(f.memory, f.parent, f.S);
  const rule = defineStructuralRule(
    f.memory,
    f.roleDictionary,
    f.memory.ensure(f.femaleUse, f.unsupportedOperation),
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
  const evidence = f.sourceResult(
    "female",
    base,
    rule,
    admission,
    f.unsupportedOperation,
  );

  const before = f.memory.linkCount;
  expectExecutionError(
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

// Prefix/postfix orientation is now structural, but one postfix step from a
// deeper START,START position is still semantically unresolved.
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

  const evidence = f.sourceResult(
    "female",
    deep.context,
    f.postfixRule,
    f.postfixAdmission,
    f.postfixOperation,
  );
  const before = f.memory.linkCount;
  expectExecutionError(
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
  same(f.memory.linkCount, before, "undefined nested ascent writes nothing");
}

console.log("MTS v0.13 pole source/Rule/self-incidence authority: GREEN.");
