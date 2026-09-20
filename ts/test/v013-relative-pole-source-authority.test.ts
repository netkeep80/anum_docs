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

interface SignFixture {
  readonly memory: Memory;
  readonly basis: ReturnType<typeof ensureRootBasis>;
  readonly interpreter: InterpreterFixture;
  readonly sourceUseRole: LinkHandle;
  readonly operationVocabulary: LinkHandle;
  readonly selectStartOperation: LinkHandle;
  readonly contextualReturnOperation: LinkHandle;
  readonly maleUse: LinkHandle;
  readonly femaleUse: LinkHandle;
  readonly maleSourceEvidence: ReturnType<typeof buildV012SelectedSourceEvidence>;
  readonly femaleSourceEvidence: ReturnType<typeof buildV012SelectedSourceEvidence>;
  readonly maleAuthority: V012SourceAuthority;
  readonly femaleAuthority: V012SourceAuthority;
  readonly selectRule: LinkHandle;
  readonly selectAdmission: LinkHandle;
  readonly returnRule: LinkHandle;
  readonly returnAdmission: LinkHandle;
  readonly fixedTheory: unknown;
  readonly roleDictionary: LinkHandle;
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

function fixture(): SignFixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const refs = anchors(memory, 40);

  const maleUse = refs[0]!;
  const femaleUse = refs[1]!;
  const sourceUseRole = refs[2]!;
  const grammar = refs[3]!;
  const theory = refs[4]!;
  const selectStartOperation = refs[5]!;
  const contextualReturnOperation = refs[6]!;
  const operationVocabulary = memory.ensure(
    selectStartOperation,
    contextualReturnOperation,
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

  const maleFormSequence = materializeExactSequence(memory, [maleUse]);
  const femaleFormSequence = materializeExactSequence(memory, [femaleUse]);
  const maleGrammarMembership = memory.ensure(grammar, maleFormSequence);
  const maleTheoryMembership = memory.ensure(theory, maleFormSequence);
  const femaleGrammarMembership = memory.ensure(grammar, femaleFormSequence);
  const femaleTheoryMembership = memory.ensure(theory, femaleFormSequence);

  const maleAuthority: V012SourceAuthority = Object.freeze({
    dictionary,
    grammar,
    theory,
    grammarMembership: maleGrammarMembership,
    theoryMembership: maleTheoryMembership,
  });
  const femaleAuthority: V012SourceAuthority = Object.freeze({
    dictionary,
    grammar,
    theory,
    grammarMembership: femaleGrammarMembership,
    theoryMembership: femaleTheoryMembership,
  });

  const interpreter = defineInterpreter(memory, dictionary, grammar, theory);
  const roleDictionary = defineStructuralRoleDictionary(memory, [sourceUseRole]);

  // The Rule body itself is grounded. The declared sourceUseRole is carried by
  // the Act only so source evidence can be tied to the same exact Use.
  const selectRuleBody = memory.ensure(maleUse, selectStartOperation);
  const selectRule = defineStructuralRule(memory, roleDictionary, selectRuleBody);
  const selectAdmission = admitStructuralRule(memory, theory, selectRule);

  const returnRuleBody = memory.ensure(femaleUse, contextualReturnOperation);
  const returnRule = defineStructuralRule(memory, roleDictionary, returnRuleBody);
  const returnAdmission = admitStructuralRule(memory, theory, returnRule);

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
    const selectedUseAttachment = defineActField(
      memory,
      act,
      sourceUseRole,
      selectedUse,
    );
    const claimedBody = memory.ensure(selectedUse, operation);
    const structural: StructuralRuleReplayEvidence = Object.freeze({
      act,
      rule,
      ruleAdmission: admission,
      claimedBody,
      expectedInterpreter: interpreter.structure,
      expectedAfterContext: currentContext,
    });
    return Object.freeze({
      source: sourceEvidence,
      structural,
      selectedActAttachments: Object.freeze([selectedUseAttachment]),
      sourceUseIndex: 0,
      sourceUseRole,
    });
  }

  return Object.freeze({
    memory,
    basis,
    interpreter,
    sourceUseRole,
    operationVocabulary,
    selectStartOperation,
    contextualReturnOperation,
    maleUse,
    femaleUse,
    maleSourceEvidence,
    femaleSourceEvidence,
    maleAuthority,
    femaleAuthority,
    selectRule,
    selectAdmission,
    returnRule,
    returnAdmission,
    fixedTheory,
    roleDictionary,
    parent,
    a,
    b,
    c,
    S,
    T,
    sourceResult,
  });
}

// Exact physical "♂" source + fixed Rule + selected K chooses START selection.
// Exact physical "♀" source + fixed Rule + selected K_pos chooses contextual
// return. No glyph switch in this witness decides the operation.
{
  const f = fixture();
  const base = defineContext(f.memory, f.parent, f.S);

  const maleEvidence = f.sourceResult(
    "male",
    base,
    f.selectRule,
    f.selectAdmission,
    f.selectStartOperation,
  );
  const selected = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    base,
    f.S,
    f.operationVocabulary,
    maleEvidence,
    f.maleAuthority,
    f.fixedTheory,
  );
  same(selected.result, f.a, "authorized ♂ selects start(S)");
  assert(selected.afterContext !== base, "♂ creates a distinct position context");

  const femaleEvidence = f.sourceResult(
    "female",
    selected.afterContext,
    f.returnRule,
    f.returnAdmission,
    f.contextualReturnOperation,
  );
  const returned = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    selected.afterContext,
    f.a,
    f.operationVocabulary,
    femaleEvidence,
    f.femaleAuthority,
    f.fixedTheory,
  );
  same(returned.result, f.S, "authorized ♀ returns selected Whole S");
  same(returned.afterContext, base, "authorized ♀ returns to exact parent K");
}

// The Act/Rule is anchored to the exact selected context. Substituting K_T for
// evidence built against K_S must fail before any contextual return is accepted.
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

  const evidenceForKS = f.sourceResult(
    "female",
    kS.context,
    f.returnRule,
    f.returnAdmission,
    f.contextualReturnOperation,
  );
  const before = f.memory.linkCount;
  expectExecutionError(
    "context-evidence-mismatch",
    () => executeAuthorizedRelativePoleSource(
      f.memory,
      f.basis,
      kT.context,
      f.a,
      f.operationVocabulary,
      evidenceForKS,
      f.femaleAuthority,
      f.fixedTheory,
    ),
  );
  same(f.memory.linkCount, before, "context substitution rejection writes nothing");
}

// A later Rule may intentionally change the operation for the same physical
// glyph. The old fixed Theory rejects it; a later exact Theory may authorize it.
// This proves the action is Rule-grounded rather than hard-coded by glyph.
{
  const f = fixture();
  const base = defineContext(f.memory, f.parent, f.S);

  const alternateRuleBody = f.memory.ensure(
    f.femaleUse,
    f.selectStartOperation,
  );
  const alternateRule = defineStructuralRule(
    f.memory,
    f.roleDictionary,
    alternateRuleBody,
  );
  const alternateAdmission = admitStructuralRule(
    f.memory,
    f.memory.poles(f.interpreter.handle).end
      ? f.interpreter.structure.theory
      : f.interpreter.structure.theory,
    alternateRule,
  );

  const alternateEvidence = f.sourceResult(
    "female",
    base,
    alternateRule,
    alternateAdmission,
    f.selectStartOperation,
  );

  const beforeOldTheory = f.memory.linkCount;
  expectTheoryError(() => executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    base,
    f.S,
    f.operationVocabulary,
    alternateEvidence,
    f.femaleAuthority,
    f.fixedTheory,
  ));
  same(f.memory.linkCount, beforeOldTheory, "old Theory rejects late Rule without writes");

  const laterTheory = exportPortableStructuralTheory(
    f.memory,
    f.interpreter.structure.theory,
  );
  const changed = executeAuthorizedRelativePoleSource(
    f.memory,
    f.basis,
    base,
    f.S,
    f.operationVocabulary,
    alternateEvidence,
    f.femaleAuthority,
    laterTheory,
  );
  same(changed.result, f.a, "later authorized Rule makes the same ♀ source select START");
}

// Valid source+Rule authority is not enough to silently reinterpret unknown
// operations as own-end or end-self-close.
{
  const f = fixture();
  const base = defineContext(f.memory, f.parent, f.S);
  const ownEndOperation = anchors(f.memory, 1)[0]!;
  const ownEndRuleBody = f.memory.ensure(f.femaleUse, ownEndOperation);
  const ownEndRule = defineStructuralRule(
    f.memory,
    f.roleDictionary,
    ownEndRuleBody,
  );
  const ownEndAdmission = admitStructuralRule(
    f.memory,
    f.interpreter.structure.theory,
    ownEndRule,
  );
  const authority = exportPortableStructuralTheory(
    f.memory,
    f.interpreter.structure.theory,
  );
  const evidence = f.sourceResult(
    "female",
    base,
    ownEndRule,
    ownEndAdmission,
    ownEndOperation,
  );

  const before = f.memory.linkCount;
  expectExecutionError(
    "unsupported-operation",
    () => executeAuthorizedRelativePoleSource(
      f.memory,
      f.basis,
      base,
      f.S,
      f.operationVocabulary,
      evidence,
      f.femaleAuthority,
      authority,
    ),
  );
  same(f.memory.linkCount, before, "unsupported operation rejection writes nothing");
}

// Multi-step ascent semantics are intentionally left unresolved. The current
// primitive must not silently choose WHOLE_RETURN for START,START.
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
    f.returnRule,
    f.returnAdmission,
    f.contextualReturnOperation,
  );
  const before = f.memory.linkCount;
  expectExecutionError(
    "multi-step-return-undefined",
    () => executeAuthorizedRelativePoleSource(
      f.memory,
      f.basis,
      deep.context,
      f.a,
      f.operationVocabulary,
      evidence,
      f.femaleAuthority,
      f.fixedTheory,
    ),
  );
  same(f.memory.linkCount, before, "undefined nested ascent writes nothing");
}

console.log("MTS v0.13 pole source/Rule/context authority experiment: GREEN.");
