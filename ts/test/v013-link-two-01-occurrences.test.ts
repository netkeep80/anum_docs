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
import {
  materializeQuaternaryAnum,
  resolveQuaternaryAnum,
} from "../src/quaternary-anum.js";
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
  if (!condition) throw new Error(`v0.13 01♂01♀ authority: ${message}`);
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
  throw new Error(`v0.13 01♂01♀ authority: expected ${code}`);
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
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

type NumberMode = "A" | "B";

const memory = new Memory();
const basis = ensureRootBasis(memory);
const refs = anchors(memory, 40);

const numUse = refs[0]!;
const maleUse = refs[1]!;
const femaleUse = refs[2]!;
const sourceUseRole = refs[3]!;
const operandRole = refs[4]!;
const leftRole = refs[5]!;
const rightRole = refs[6]!;
const grammar = refs[7]!;
const theory = refs[8]!;
let contextMarker = refs[9]!;

const sourceText = "01♂01♀";
const sourceBytes = bytes(sourceText);
same(sourceBytes.length, 10, "01♂01♀ UTF-8 byte length");

const numBytes = bytes("01");
const maleBytes = bytes("♂");
const femaleBytes = bytes("♀");

const fullContent = materializeV012SourceContent(memory, basis, sourceBytes);
const source = defineSourceForm(memory, fullContent);

// The same dictionary Use is selected for BOTH physical 01 occurrences.
// Occurrence-level A/B meaning is therefore not encoded in spelling or lexing.
const scope0 = defineDictionaryScope(memory, memory.root, memory.root);
const numContent = materializeV012SourceContent(memory, basis, numBytes);
const maleContent = materializeV012SourceContent(memory, basis, maleBytes);
const femaleContent = materializeV012SourceContent(memory, basis, femaleBytes);

const numEffect = defineDictionaryEffect(
  memory,
  scope0,
  memory.root,
  memory.root,
  numContent,
  numUse,
);
const maleEffect = defineDictionaryEffect(
  memory,
  numEffect.afterScope,
  memory.root,
  numEffect.historyAfter,
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

const formSequence = materializeExactSequence(
  memory,
  [numUse, maleUse, numUse, femaleUse],
);
const grammarMembership = memory.ensure(grammar, formSequence);
const theoryMembership = memory.ensure(theory, formSequence);

const authority: V012SourceAuthority = Object.freeze({
  dictionary,
  grammar,
  theory,
  grammarMembership,
  theoryMembership,
});

const interpreter: InterpreterFixture = Object.freeze({
  handle: defineStructuralInterpreter(memory, dictionary, grammar, theory),
  structure: Object.freeze({ dictionary, grammar, theory }),
});

// Accepted v0.12 distinction of the two possible semantic levels of "01".
const anum01 = materializeQuaternaryAnum(memory, basis, "01");
const A = anum01.anumLink;
const B = memory.ensure(basis.U, basis.L);
same(resolveQuaternaryAnum(memory, basis, anum01), B, "des(01)=B");
assert(A !== B, "A=Anum(01) and B=des(01) are distinct");

// Number resolution: same source Use, two independently selectable admitted
// Rules in the same fixed Theory.
const numRoles = defineStructuralRoleDictionary(memory, [sourceUseRole]);
const numRuleA = defineStructuralRule(
  memory,
  numRoles,
  memory.ensure(sourceUseRole, A),
);
const numRuleB = defineStructuralRule(
  memory,
  numRoles,
  memory.ensure(sourceUseRole, B),
);
const numAdmissionA = admitStructuralRule(memory, theory, numRuleA);
const numAdmissionB = admitStructuralRule(memory, theory, numRuleB);

// Unary grouping Rules are unchanged and operand-relative.
const groupRoles = defineStructuralRoleDictionary(
  memory,
  [sourceUseRole, operandRole],
);
const prefixRule = defineStructuralRule(
  memory,
  groupRoles,
  memory.ensure(
    sourceUseRole,
    memory.ensureStartSelfClosed(operandRole),
  ),
);
const postfixRule = defineStructuralRule(
  memory,
  groupRoles,
  memory.ensure(
    sourceUseRole,
    memory.ensureEndSelfClosed(operandRole),
  ),
);
const prefixAdmission = admitStructuralRule(memory, theory, prefixRule);
const postfixAdmission = admitStructuralRule(memory, theory, postfixRule);

// The physical ♂ occurrence also explicitly authorizes the new Link between
// the already resolved left Whole and the grouped right Whole.
const pairRoles = defineStructuralRoleDictionary(
  memory,
  [sourceUseRole, leftRole, rightRole],
);
const pairTemplate = memory.ensure(leftRole, rightRole);
const pairRule = defineStructuralRule(
  memory,
  pairRoles,
  memory.ensure(sourceUseRole, pairTemplate),
);
const pairAdmission = admitStructuralRule(memory, theory, pairRule);

const fixedTheory = exportPortableStructuralTheory(memory, theory);

const selectedSource = buildV012SelectedSourceEvidence(
  memory,
  basis,
  source,
  [
    {
      start: 0,
      end: 2,
      form: numUse,
      dictionaryOccurrence: numEffect.occurrence,
    },
    {
      start: 2,
      end: 5,
      form: maleUse,
      dictionaryOccurrence: maleEffect.occurrence,
    },
    {
      start: 5,
      end: 7,
      form: numUse,
      dictionaryOccurrence: numEffect.occurrence,
    },
    {
      start: 7,
      end: 10,
      form: femaleUse,
      dictionaryOccurrence: femaleEffect.occurrence,
    },
  ],
  authority,
);

function freshContext(payload: LinkHandle): LinkHandle {
  contextMarker = memory.ensureStartSelfClosed(contextMarker);
  const parent = defineContext(memory, basis.R, contextMarker);
  return defineContext(memory, parent, payload);
}

function numberRule(mode: NumberMode): {
  readonly rule: LinkHandle;
  readonly admission: LinkHandle;
  readonly expected: LinkHandle;
} {
  return mode === "A"
    ? Object.freeze({
        rule: numRuleA,
        admission: numAdmissionA,
        expected: A,
      })
    : Object.freeze({
        rule: numRuleB,
        admission: numAdmissionB,
        expected: B,
      });
}

function numberEvidence(
  sourceUseIndex: 0 | 2,
  mode: NumberMode,
  claimed: LinkHandle,
): V012SourceResultEvidence {
  const selected = numberRule(mode);
  const afterContext = freshContext(claimed);
  const act = defineActHeader(
    memory,
    interpreter.handle,
    numRoles,
    afterContext,
  );
  const useAttachment = defineActField(
    memory,
    act,
    sourceUseRole,
    numUse,
  );
  const structural: StructuralRuleReplayEvidence = Object.freeze({
    act,
    rule: selected.rule,
    ruleAdmission: selected.admission,
    claimedBody: memory.ensure(numUse, claimed),
    expectedInterpreter: interpreter.structure,
    expectedAfterContext: afterContext,
  });
  return Object.freeze({
    source: selectedSource,
    structural,
    selectedActAttachments: Object.freeze([useAttachment]),
    sourceUseIndex,
    sourceUseRole,
  });
}

function resolveNumber(
  sourceUseIndex: 0 | 2,
  mode: NumberMode,
): LinkHandle {
  const selected = numberRule(mode);
  const evidence = numberEvidence(sourceUseIndex, mode, selected.expected);
  const before = memory.linkCount;
  const replay = replayV012SourceResultEvidence(
    memory,
    basis,
    evidence,
    authority,
    fixedTheory,
  );
  same(memory.linkCount, before, `${mode}@${sourceUseIndex}: replay read-only`);
  same(replay.selectedUse, numUse, `${mode}@${sourceUseIndex}: selected 01 Use`);
  const body = memory.poles(replay.structural.claimedBody);
  same(body.start, numUse, `${mode}@${sourceUseIndex}: grounded num Use`);
  same(body.end, selected.expected, `${mode}@${sourceUseIndex}: grounded Whole`);
  return body.end;
}

function groupingEvidence(
  sourceUseIndex: 1 | 3,
  currentContext: LinkHandle,
  selectedUse: LinkHandle,
  rule: LinkHandle,
  admission: LinkHandle,
  operation: LinkHandle,
  operand: LinkHandle,
): V012SourceResultEvidence {
  const act = defineActHeader(
    memory,
    interpreter.handle,
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
    expectedInterpreter: interpreter.structure,
    expectedAfterContext: currentContext,
  });
  return Object.freeze({
    source: selectedSource,
    structural,
    selectedActAttachments: Object.freeze([
      useAttachment,
      operandAttachment,
    ]),
    sourceUseIndex,
    sourceUseRole,
  });
}

function groupRight(right: LinkHandle): LinkHandle {
  const base = freshContext(right);
  const prefix = memory.ensureStartSelfClosed(right);
  const selected = executeAuthorizedRelativePoleSource(
    memory,
    basis,
    base,
    right,
    groupingEvidence(
      1,
      base,
      maleUse,
      prefixRule,
      prefixAdmission,
      prefix,
      right,
    ),
    authority,
    fixedTheory,
  );

  const postfix = memory.ensureEndSelfClosed(selected.result);
  const returned = executeAuthorizedRelativePoleSource(
    memory,
    basis,
    selected.afterContext,
    selected.result,
    groupingEvidence(
      3,
      selected.afterContext,
      femaleUse,
      postfixRule,
      postfixAdmission,
      postfix,
      selected.result,
    ),
    authority,
    fixedTheory,
  );

  same(returned.result, right, "♂right♀ returns right Whole");
  same(returned.afterContext, base, "♀ closes the exact ♂ context");
  return returned.result;
}

function pairEvidence(
  left: LinkHandle,
  right: LinkHandle,
  claimedPair: LinkHandle,
): V012SourceResultEvidence {
  const afterContext = freshContext(claimedPair);
  const act = defineActHeader(
    memory,
    interpreter.handle,
    pairRoles,
    afterContext,
  );
  const useAttachment = defineActField(
    memory,
    act,
    sourceUseRole,
    maleUse,
  );
  const leftAttachment = defineActField(
    memory,
    act,
    leftRole,
    left,
  );
  const rightAttachment = defineActField(
    memory,
    act,
    rightRole,
    right,
  );
  const structural: StructuralRuleReplayEvidence = Object.freeze({
    act,
    rule: pairRule,
    ruleAdmission: pairAdmission,
    claimedBody: memory.ensure(maleUse, claimedPair),
    expectedInterpreter: interpreter.structure,
    expectedAfterContext: afterContext,
  });
  return Object.freeze({
    source: selectedSource,
    structural,
    selectedActAttachments: Object.freeze([
      useAttachment,
      leftAttachment,
      rightAttachment,
    ]),
    // The very same physical ♂ occurrence that opens the grouped right operand
    // is the explicit source evidence for "start a new Link here".
    sourceUseIndex: 1,
    sourceUseRole,
  });
}

function linkResolved(
  leftMode: NumberMode,
  rightMode: NumberMode,
): LinkHandle {
  const left = resolveNumber(0, leftMode);
  const rawRight = resolveNumber(2, rightMode);
  const right = groupRight(rawRight);

  const expectedPair = memory.ensure(left, right);
  const evidence = pairEvidence(left, right, expectedPair);
  const before = memory.linkCount;
  const replay = replayV012SourceResultEvidence(
    memory,
    basis,
    evidence,
    authority,
    fixedTheory,
  );
  same(
    memory.linkCount,
    before,
    `${leftMode}${rightMode}: pair replay is read-only`,
  );
  same(replay.selectedUse, maleUse, `${leftMode}${rightMode}: ♂ authorizes pair`);

  const body = memory.poles(replay.structural.claimedBody);
  same(body.start, maleUse, `${leftMode}${rightMode}: grounded ♂ Use`);
  same(body.end, expectedPair, `${leftMode}${rightMode}: grounded pair result`);

  const pair = memory.poles(body.end);
  same(pair.start, left, `${leftMode}${rightMode}: exact left Whole`);
  same(pair.end, right, `${leftMode}${rightMode}: exact grouped right Whole`);
  return body.end;
}

const AA = linkResolved("A", "A");
const AB = linkResolved("A", "B");
const BA = linkResolved("B", "A");
const BB = linkResolved("B", "B");

same(memory.poles(AA).start, A, "AA starts at A");
same(memory.poles(AA).end, A, "AA ends at A");
same(memory.poles(BB).start, B, "BB starts at B");
same(memory.poles(BB).end, B, "BB ends at B");

same(memory.poles(AB).start, A, "AB starts at A");
same(memory.poles(AB).end, B, "AB ends at B");
same(memory.poles(BA).start, B, "BA starts at B");
same(memory.poles(BA).end, A, "BA ends at A");

assert(AA !== BB, "A->A and B->B stay distinct");
assert(AB !== BA, "A->B and B->A stay oriented and distinct");

// Author's original claim now has an exact conditional form:
// if both physical 01 occurrences are resolved by the same selected Rule,
// the source links that exact Whole to itself.
same(AA, memory.ensure(A, A), "01♂01♀ under A/A authority yields A->A");
same(BB, memory.ensure(B, B), "01♂01♀ under B/B authority yields B->B");

// Pair authority cannot silently swap independently resolved operands.
{
  const forged = memory.ensure(B, A);
  const evidence = pairEvidence(A, B, forged);
  const before = memory.linkCount;
  expectRuleError(
    "template-mismatch",
    () => replayV012SourceResultEvidence(
      memory,
      basis,
      evidence,
      authority,
      fixedTheory,
    ),
  );
  same(memory.linkCount, before, "forged swapped pair rejection is read-only");
}

// Number authority also remains occurrence-local: Rule A cannot claim B.
{
  const forged = numberEvidence(0, "A", B);
  const before = memory.linkCount;
  expectRuleError(
    "template-mismatch",
    () => replayV012SourceResultEvidence(
      memory,
      basis,
      forged,
      authority,
      fixedTheory,
    ),
  );
  same(memory.linkCount, before, "forged left number result rejection is read-only");
}

console.log(
  "MTS v0.13 literal 01♂01♀ links independently resolved 01 occurrences: GREEN.",
);
