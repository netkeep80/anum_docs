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
  exportPortableStructuralTheory,
} from "../src/portable-theory.js";
import { defineSourceForm } from "../src/source.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  StructuralRuleError,
  type StructuralInterpreter,
  type StructuralRuleReplayEvidence,
} from "../src/structural-rule.js";
import {
  defineActField,
  defineActHeader,
} from "../src/structural-readers.js";
import { defineContext } from "../src/state.js";
import {
  materializeQuaternaryAnum,
  resolveQuaternaryAnum,
  serializeMaterializedQuaternaryAnum,
} from "../src/quaternary-anum.js";
import {
  buildV012SelectedSourceEvidence,
  materializeV012SourceContent,
  replayV012SourceResultEvidence,
  type V012SourceAuthority,
  type V012SourceResultEvidence,
} from "../src/v012-source.js";
import {
  executeAuthorizedRelativePoleSource,
} from "../src/v013-relative-pole-execution.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 combined group source: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function expectRuleError(
  code: StructuralRuleError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof StructuralRuleError,
      `expected StructuralRuleError, got ${String(error)}`,
    );
    same(error.code, code, "StructuralRule error code");
    return;
  }
  throw new Error(`v0.13 combined group source: expected ${code}`);
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function sameBytes(
  actual: Uint8Array,
  expected: Uint8Array,
  message: string,
): void {
  assert(
    actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]),
    message,
  );
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

interface Mode {
  readonly name: "carrier-A" | "resolved-B";
  readonly authority: V012SourceAuthority;
  readonly fixedTheory: unknown;
  readonly interpreter: InterpreterFixture;
  readonly sourceEvidence: ReturnType<typeof buildV012SelectedSourceEvidence>;
  readonly middleRule: LinkHandle;
  readonly middleAdmission: LinkHandle;
  readonly prefixAdmission: LinkHandle;
  readonly postfixAdmission: LinkHandle;
  readonly expectedWhole: LinkHandle;
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const refs = anchors(memory, 32);

const maleUse = refs[0]!;
const middleUse = refs[1]!;
const femaleUse = refs[2]!;
const sourceUseRole = refs[3]!;
const operandRole = refs[4]!;
const grammar = refs[5]!;
const theoryA = refs[6]!;
const theoryB = refs[7]!;
const contextSeed = refs[8]!;

const sourceText = "♂01♀";
const fullBytes = bytes(sourceText);
const maleBytes = bytes("♂");
const middleBytes = bytes("01");
const femaleBytes = bytes("♀");

same(fullBytes.length, 8, "♂01♀ UTF-8 byte length");
same(maleBytes.length, 3, "♂ UTF-8 byte length");
same(middleBytes.length, 2, "01 byte length");
same(femaleBytes.length, 3, "♀ UTF-8 byte length");

const fullContent = materializeV012SourceContent(memory, basis, fullBytes);
const source = defineSourceForm(memory, fullContent);

// One fixed Dictionary selects one exact Use for each physical source segment.
// A/B are NOT selected by spelling or by a second Dictionary entry for "01".
const scope0 = defineDictionaryScope(memory, memory.root, memory.root);
const maleContent = materializeV012SourceContent(memory, basis, maleBytes);
const middleContent = materializeV012SourceContent(memory, basis, middleBytes);
const femaleContent = materializeV012SourceContent(memory, basis, femaleBytes);

const maleEffect = defineDictionaryEffect(
  memory,
  scope0,
  memory.root,
  memory.root,
  maleContent,
  maleUse,
);
const middleEffect = defineDictionaryEffect(
  memory,
  maleEffect.afterScope,
  memory.root,
  maleEffect.historyAfter,
  middleContent,
  middleUse,
);
const femaleEffect = defineDictionaryEffect(
  memory,
  middleEffect.afterScope,
  memory.root,
  middleEffect.historyAfter,
  femaleContent,
  femaleUse,
);
const dictionary = femaleEffect.afterScope;

const selectedForms = materializeExactSequence(
  memory,
  [maleUse, middleUse, femaleUse],
);
const grammarMembership = memory.ensure(grammar, selectedForms);

// Baseline v0.12 A/B distinction for the exact middle source "01".
const anum01 = materializeQuaternaryAnum(memory, basis, "01");
const A = anum01.anumLink;
const exactR0 = memory.ensure(basis.R, basis.U);
same(A, memory.ensure(exactR0, basis.L), "A=(R->U)->L");
same(
  serializeMaterializedQuaternaryAnum(memory, basis, anum01),
  "01",
  "A faithfully serializes as 01",
);

const B = memory.ensure(basis.U, basis.L);
const beforeResolve = memory.linkCount;
same(resolveQuaternaryAnum(memory, basis, anum01), B, "B=des(01)=U->L");
same(memory.linkCount, beforeResolve, "01 Resolve is read-only");
assert(A !== B, "A and B are distinct Links");

const groupRoles = defineStructuralRoleDictionary(
  memory,
  [sourceUseRole, operandRole],
);
const prefixTemplate = memory.ensureStartSelfClosed(operandRole);
const postfixTemplate = memory.ensureEndSelfClosed(operandRole);
const prefixRule = defineStructuralRule(
  memory,
  groupRoles,
  memory.ensure(sourceUseRole, prefixTemplate),
);
const postfixRule = defineStructuralRule(
  memory,
  groupRoles,
  memory.ensure(sourceUseRole, postfixTemplate),
);

// The middle-resolution Rule is stronger: its result is a grounded constant,
// not a free Operand role. Same physical "01" Use; selected Theory decides A/B.
const middleRoles = defineStructuralRoleDictionary(memory, [sourceUseRole]);
const middleRuleA = defineStructuralRule(
  memory,
  middleRoles,
  memory.ensure(sourceUseRole, A),
);
const middleRuleB = defineStructuralRule(
  memory,
  middleRoles,
  memory.ensure(sourceUseRole, B),
);

const theoryMembershipA = memory.ensure(theoryA, selectedForms);
const theoryMembershipB = memory.ensure(theoryB, selectedForms);

const prefixAdmissionA = admitStructuralRule(memory, theoryA, prefixRule);
const postfixAdmissionA = admitStructuralRule(memory, theoryA, postfixRule);
const middleAdmissionA = admitStructuralRule(memory, theoryA, middleRuleA);

const prefixAdmissionB = admitStructuralRule(memory, theoryB, prefixRule);
const postfixAdmissionB = admitStructuralRule(memory, theoryB, postfixRule);
const middleAdmissionB = admitStructuralRule(memory, theoryB, middleRuleB);

function interpreter(theory: LinkHandle): InterpreterFixture {
  return Object.freeze({
    handle: defineStructuralInterpreter(memory, dictionary, grammar, theory),
    structure: Object.freeze({ dictionary, grammar, theory }),
  });
}

const interpreterA = interpreter(theoryA);
const interpreterB = interpreter(theoryB);

const authorityA: V012SourceAuthority = Object.freeze({
  dictionary,
  grammar,
  theory: theoryA,
  grammarMembership,
  theoryMembership: theoryMembershipA,
});
const authorityB: V012SourceAuthority = Object.freeze({
  dictionary,
  grammar,
  theory: theoryB,
  grammarMembership,
  theoryMembership: theoryMembershipB,
});

const fixedTheoryA = exportPortableStructuralTheory(memory, theoryA);
const fixedTheoryB = exportPortableStructuralTheory(memory, theoryB);

function sourceEvidence(authority: V012SourceAuthority) {
  return buildV012SelectedSourceEvidence(
    memory,
    basis,
    source,
    [
      {
        start: 0,
        end: 3,
        form: maleUse,
        dictionaryOccurrence: maleEffect.occurrence,
      },
      {
        start: 3,
        end: 5,
        form: middleUse,
        dictionaryOccurrence: middleEffect.occurrence,
      },
      {
        start: 5,
        end: 8,
        form: femaleUse,
        dictionaryOccurrence: femaleEffect.occurrence,
      },
    ],
    authority,
  );
}

const sourceEvidenceA = sourceEvidence(authorityA);
const sourceEvidenceB = sourceEvidence(authorityB);

same(sourceEvidenceA.source, source, "A mode uses exact same source");
same(sourceEvidenceB.source, source, "B mode uses exact same source");
same(sourceEvidenceA.dictionary, sourceEvidenceB.dictionary, "same Dictionary");
same(sourceEvidenceA.grammar, sourceEvidenceB.grammar, "same Grammar");
same(
  sourceEvidenceA.formSequence,
  sourceEvidenceB.formSequence,
  "same selected Use sequence",
);
assert(
  sourceEvidenceA.theory !== sourceEvidenceB.theory,
  "only selected Theory authority differs between A/B modes",
);

const modeA: Mode = Object.freeze({
  name: "carrier-A",
  authority: authorityA,
  fixedTheory: fixedTheoryA,
  interpreter: interpreterA,
  sourceEvidence: sourceEvidenceA,
  middleRule: middleRuleA,
  middleAdmission: middleAdmissionA,
  prefixAdmission: prefixAdmissionA,
  postfixAdmission: postfixAdmissionA,
  expectedWhole: A,
});
const modeB: Mode = Object.freeze({
  name: "resolved-B",
  authority: authorityB,
  fixedTheory: fixedTheoryB,
  interpreter: interpreterB,
  sourceEvidence: sourceEvidenceB,
  middleRule: middleRuleB,
  middleAdmission: middleAdmissionB,
  prefixAdmission: prefixAdmissionB,
  postfixAdmission: postfixAdmissionB,
  expectedWhole: B,
});

function middleEvidence(
  mode: Mode,
  claimedWhole: LinkHandle,
): V012SourceResultEvidence {
  const afterContext = defineContext(memory, contextSeed, mode.authority.theory);
  const act = defineActHeader(
    memory,
    mode.interpreter.handle,
    middleRoles,
    afterContext,
  );
  const useAttachment = defineActField(
    memory,
    act,
    sourceUseRole,
    middleUse,
  );
  const structural: StructuralRuleReplayEvidence = Object.freeze({
    act,
    rule: mode.middleRule,
    ruleAdmission: mode.middleAdmission,
    claimedBody: memory.ensure(middleUse, claimedWhole),
    expectedInterpreter: mode.interpreter.structure,
    expectedAfterContext: afterContext,
  });
  return Object.freeze({
    source: mode.sourceEvidence,
    structural,
    selectedActAttachments: Object.freeze([useAttachment]),
    sourceUseIndex: 1,
    sourceUseRole,
  });
}

function resolveMiddle(mode: Mode): LinkHandle {
  const evidence = middleEvidence(mode, mode.expectedWhole);
  const before = memory.linkCount;
  const replay = replayV012SourceResultEvidence(
    memory,
    basis,
    evidence,
    mode.authority,
    mode.fixedTheory,
  );
  same(memory.linkCount, before, `${mode.name}: middle replay is read-only`);
  same(replay.selectedUses.length, 3, `${mode.name}: three source segments`);
  same(replay.selectedUses[0], maleUse, `${mode.name}: segment 0 is ♂ Use`);
  same(replay.selectedUses[1], middleUse, `${mode.name}: segment 1 is 01 Use`);
  same(replay.selectedUses[2], femaleUse, `${mode.name}: segment 2 is ♀ Use`);
  same(replay.selectedUse, middleUse, `${mode.name}: middle Rule uses segment 1`);

  const body = memory.poles(replay.structural.claimedBody);
  same(body.start, middleUse, `${mode.name}: grounded middle Use`);
  same(body.end, mode.expectedWhole, `${mode.name}: grounded middle Whole`);
  return body.end;
}

function groupEvidence(
  mode: Mode,
  sourceUseIndex: 0 | 2,
  currentContext: LinkHandle,
  rule: LinkHandle,
  admission: LinkHandle,
  selectedUse: LinkHandle,
  operation: LinkHandle,
  operand: LinkHandle,
): V012SourceResultEvidence {
  const act = defineActHeader(
    memory,
    mode.interpreter.handle,
    groupRoles,
    currentContext,
  );
  const useAttachment = defineActField(
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
    expectedInterpreter: mode.interpreter.structure,
    expectedAfterContext: currentContext,
  });
  return Object.freeze({
    source: mode.sourceEvidence,
    structural,
    selectedActAttachments: Object.freeze([
      useAttachment,
      operandAttachment,
    ]),
    sourceUseIndex,
    sourceUseRole,
  });
}

function executeCombined(mode: Mode): LinkHandle {
  const whole = resolveMiddle(mode);
  same(whole, mode.expectedWhole, `${mode.name}: middle authority selects expected Whole`);

  // The outer operators consume the Whole chosen by the middle source Rule.
  const baseParent = defineContext(memory, basis.R, mode.authority.theory);
  const base = defineContext(memory, baseParent, whole);

  const prefix = memory.ensureStartSelfClosed(whole);
  const selected = executeAuthorizedRelativePoleSource(
    memory,
    basis,
    base,
    whole,
    groupEvidence(
      mode,
      0,
      base,
      prefixRule,
      mode.prefixAdmission,
      maleUse,
      prefix,
      whole,
    ),
    mode.authority,
    mode.fixedTheory,
  );

  const postfix = memory.ensureEndSelfClosed(selected.result);
  const returned = executeAuthorizedRelativePoleSource(
    memory,
    basis,
    selected.afterContext,
    selected.result,
    groupEvidence(
      mode,
      2,
      selected.afterContext,
      postfixRule,
      mode.postfixAdmission,
      femaleUse,
      postfix,
      selected.result,
    ),
    mode.authority,
    mode.fixedTheory,
  );

  same(returned.result, whole, `${mode.name}: literal ♂01♀ returns selected Whole`);
  same(returned.afterContext, base, `${mode.name}: ♀ closes exact ♂ context`);
  return returned.result;
}

// Same physical source and same segment Uses, different fixed Theory:
// middle resolution changes, unary law does not.
same(executeCombined(modeA), A, "Theory A: ♂01♀ returns A");
same(executeCombined(modeB), B, "Theory B: ♂01♀ returns B");

// A producer cannot claim B under the fixed A middle Rule.
{
  const forged = middleEvidence(modeA, B);
  const before = memory.linkCount;
  expectRuleError(
    "template-mismatch",
    () => replayV012SourceResultEvidence(
      memory,
      basis,
      forged,
      modeA.authority,
      modeA.fixedTheory,
    ),
  );
  same(memory.linkCount, before, "forged A->B middle result rejection is read-only");
}

// Nor can it claim A under the fixed B middle Rule.
{
  const forged = middleEvidence(modeB, A);
  const before = memory.linkCount;
  expectRuleError(
    "template-mismatch",
    () => replayV012SourceResultEvidence(
      memory,
      basis,
      forged,
      modeB.authority,
      modeB.fixedTheory,
    ),
  );
  same(memory.linkCount, before, "forged B->A middle result rejection is read-only");
}

// Physical bytes are exactly the author source, not three independently supplied
// glyph sources.
sameBytes(fullBytes, bytes("♂01♀"), "exact combined physical source bytes");

console.log(
  "MTS v0.13 combined physical ♂01♀ source with explicit A/B Theory authority: GREEN.",
);
