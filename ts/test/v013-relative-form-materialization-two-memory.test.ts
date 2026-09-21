import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import { exportPortableStructuralTheory } from "../src/portable-theory.js";
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
  type V012SourceAuthority,
  type V012SourceResultEvidence,
} from "../src/v012-source.js";
import {
  materializeV012StringAnum,
  serializeV012StringAnum,
} from "../src/v012-string-anum.js";
import {
  V013RelativeFormMaterializationError,
  materializeAuthorizedRelativeUnaryFormSource,
} from "../src/v013-relative-form-materialization.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 authorized form materialization: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

type Kind = "start" | "end";

const GLYPH: Readonly<Record<Kind, string>> = Object.freeze({
  start: "♂",
  end: "♀",
});

interface InterpreterFixture {
  readonly handle: LinkHandle;
  readonly structure: StructuralInterpreter;
}

interface LocalAuthority {
  readonly basis: RootBasis;
  readonly dictionary: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly fixedTheory: unknown;
  readonly interpreter: InterpreterFixture;
  readonly roleDictionary: LinkHandle;
  readonly sourceUseRole: LinkHandle;
  readonly operandRole: LinkHandle;
  readonly uses: Readonly<Record<Kind, LinkHandle>>;
  readonly occurrences: Readonly<Record<Kind, LinkHandle>>;
  readonly memberships: Readonly<Record<Kind, {
    readonly grammar: LinkHandle;
    readonly theory: LinkHandle;
  }>>;
  readonly rules: Readonly<Record<Kind, {
    readonly rule: LinkHandle;
    readonly admission: LinkHandle;
  }>>;
}

function neutralRefs(memory: Memory, basis: RootBasis, count: number): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  let current = memory.ensure(basis.L, basis.U);
  for (let index = 0; index < count; index += 1) {
    current = index % 2 === 0
      ? memory.ensure(current, basis.L)
      : memory.ensure(basis.U, current);
    result.push(current);
  }
  return Object.freeze(result);
}

function buildAuthority(memory: Memory): LocalAuthority {
  const basis = ensureRootBasis(memory);
  const refs = neutralRefs(memory, basis, 16);

  const sourceUseRole = refs[0]!;
  const operandRole = refs[1]!;
  const grammar = refs[2]!;
  const theory = refs[3]!;
  const uses = Object.freeze({
    start: refs[4]!,
    end: refs[5]!,
  });

  assert(sourceUseRole !== operandRole, "roles must be distinct");
  assert(uses.start !== uses.end, "uses must be distinct");

  let history = memory.root;
  let dictionary = defineDictionaryScope(memory, memory.root, history);
  const occurrences = {} as Record<Kind, LinkHandle>;

  for (const kind of ["start", "end"] as const) {
    const effect = defineDictionaryEffect(
      memory,
      dictionary,
      memory.root,
      history,
      materializeV012SourceContent(memory, basis, bytes(GLYPH[kind])),
      uses[kind],
    );
    occurrences[kind] = effect.occurrence;
    history = effect.historyAfter;
    dictionary = effect.afterScope;
  }

  const memberships = {} as Record<Kind, {
    grammar: LinkHandle;
    theory: LinkHandle;
  }>;
  for (const kind of ["start", "end"] as const) {
    const sequence = materializeExactSequence(memory, [uses[kind]]);
    memberships[kind] = Object.freeze({
      grammar: memory.ensure(grammar, sequence),
      theory: memory.ensure(theory, sequence),
    });
  }

  const interpreter = Object.freeze({
    handle: defineStructuralInterpreter(memory, dictionary, grammar, theory),
    structure: Object.freeze({ dictionary, grammar, theory }),
  });
  const roleDictionary = defineStructuralRoleDictionary(
    memory,
    [sourceUseRole, operandRole],
  );

  // The Rule proves only the construction request. The target self-incidence
  // Link is deliberately absent from both Rule and evidence.
  const startRule = defineStructuralRule(
    memory,
    roleDictionary,
    memory.ensure(sourceUseRole, operandRole),
  );
  const endRule = defineStructuralRule(
    memory,
    roleDictionary,
    memory.ensure(operandRole, sourceUseRole),
  );

  const rules = Object.freeze({
    start: Object.freeze({
      rule: startRule,
      admission: admitStructuralRule(memory, theory, startRule),
    }),
    end: Object.freeze({
      rule: endRule,
      admission: admitStructuralRule(memory, theory, endRule),
    }),
  });

  return Object.freeze({
    basis,
    dictionary,
    grammar,
    theory,
    fixedTheory: exportPortableStructuralTheory(memory, theory),
    interpreter,
    roleDictionary,
    sourceUseRole,
    operandRole,
    uses,
    occurrences: Object.freeze(occurrences),
    memberships: Object.freeze(memberships),
    rules,
  });
}

function sourceAuthority(local: LocalAuthority, kind: Kind): V012SourceAuthority {
  return Object.freeze({
    dictionary: local.dictionary,
    grammar: local.grammar,
    theory: local.theory,
    grammarMembership: local.memberships[kind].grammar,
    theoryMembership: local.memberships[kind].theory,
  });
}

function buildEvidence(
  memory: Memory,
  local: LocalAuthority,
  kind: Kind,
  source: LinkHandle,
  currentContext: LinkHandle,
  operand: LinkHandle,
): V012SourceResultEvidence {
  const selected = buildV012SelectedSourceEvidence(
    memory,
    local.basis,
    source,
    [{
      start: 0,
      end: bytes(GLYPH[kind]).length,
      form: local.uses[kind],
      dictionaryOccurrence: local.occurrences[kind],
    }],
    sourceAuthority(local, kind),
  );

  const act = defineActHeader(
    memory,
    local.interpreter.handle,
    local.roleDictionary,
    currentContext,
  );
  const useAttachment = defineActField(
    memory,
    act,
    local.sourceUseRole,
    local.uses[kind],
  );
  const operandAttachment = defineActField(
    memory,
    act,
    local.operandRole,
    operand,
  );

  const request = kind === "start"
    ? memory.ensure(local.uses[kind], operand)
    : memory.ensure(operand, local.uses[kind]);

  const structural: StructuralRuleReplayEvidence = Object.freeze({
    act,
    rule: local.rules[kind].rule,
    ruleAdmission: local.rules[kind].admission,
    claimedBody: request,
    expectedInterpreter: local.interpreter.structure,
    expectedAfterContext: currentContext,
  });

  return Object.freeze({
    source: selected,
    structural,
    selectedActAttachments: Object.freeze([
      useAttachment,
      operandAttachment,
    ]),
    sourceUseIndex: 0,
    sourceUseRole: local.sourceUseRole,
  });
}

function makeOperand(memory: Memory, local: LocalAuthority): LinkHandle {
  // Build the operand only after authority/source infrastructure exists so no
  // setup helper can accidentally pre-materialize its relative forms.
  const left = memory.ensure(local.interpreter.handle, local.grammar);
  const right = memory.ensure(local.dictionary, local.theory);
  const operand = memory.ensure(left, right);
  assert(operand !== memory.root, "operand must be non-root");
  return operand;
}

function findStartForm(memory: Memory, whole: LinkHandle): LinkHandle | undefined {
  return memory.allLinks().find((link) => {
    const poles = memory.poles(link);
    return link !== whole && poles.start === link && poles.end === whole;
  });
}

function findEndForm(memory: Memory, whole: LinkHandle): LinkHandle | undefined {
  return memory.allLinks().find((link) => {
    const poles = memory.poles(link);
    return link !== whole && poles.start === whole && poles.end === link;
  });
}

function transportGlyph(
  sender: Memory,
  senderBasis: RootBasis,
  receiver: Memory,
  receiverBasis: RootBasis,
  glyph: string,
): {
  readonly senderSource: LinkHandle;
  readonly receiverSource: LinkHandle;
} {
  const payload = bytes(glyph);
  const senderString = materializeV012StringAnum(sender, senderBasis, payload);
  const wire = serializeV012StringAnum(sender, senderBasis, senderString);
  assert(sameBytes(wire, payload), "sender emits exact physical glyph bytes");

  const receiverString = materializeV012StringAnum(receiver, receiverBasis, wire);
  const roundTrip = serializeV012StringAnum(receiver, receiverBasis, receiverString);
  assert(sameBytes(roundTrip, wire), "receiver preserves exact physical glyph bytes");

  return Object.freeze({
    senderSource: defineSourceForm(sender, senderString.anumLink),
    receiverSource: defineSourceForm(receiver, receiverString.anumLink),
  });
}

function expectStructuralRuleError(
  effect: () => unknown,
  code: StructuralRuleError["code"],
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
  throw new Error(`v0.13 authorized form materialization: expected ${code}`);
}

function expectMaterializationError(
  effect: () => unknown,
  code: V013RelativeFormMaterializationError["code"],
): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof V013RelativeFormMaterializationError,
      `expected V013RelativeFormMaterializationError, got ${String(error)}`,
    );
    same(error.code, code, "materialization error code");
    return;
  }
  throw new Error(`v0.13 authorized form materialization: expected ${code}`);
}

const memoryA = new Memory();
const memoryB = new Memory();
const authorityA = buildAuthority(memoryA);
const authorityB = buildAuthority(memoryB);

const startWire = transportGlyph(
  memoryA,
  authorityA.basis,
  memoryB,
  authorityB.basis,
  GLYPH.start,
);
const endWire = transportGlyph(
  memoryA,
  authorityA.basis,
  memoryB,
  authorityB.basis,
  GLYPH.end,
);

const S_A = makeOperand(memoryA, authorityA);
const S_B = makeOperand(memoryB, authorityB);
assert(S_A !== S_B, "independent Memories must use independent Whole handles");

const baseA = defineContext(memoryA, authorityA.basis.R, S_A);
const baseB = defineContext(memoryB, authorityB.basis.R, S_B);

// Test-only whole-Memory scans prove absence. They are observers only and never
// participate in source/Rule authority or target selection.
same(findStartForm(memoryA, S_A), undefined, "A START target absent initially");
same(findStartForm(memoryB, S_B), undefined, "B START target absent initially");
same(findEndForm(memoryA, S_A), undefined, "A END target absent initially");
same(findEndForm(memoryB, S_B), undefined, "B END target absent initially");

const startEvidenceA = buildEvidence(
  memoryA, authorityA, "start", startWire.senderSource, baseA, S_A,
);
const startEvidenceB = buildEvidence(
  memoryB, authorityB, "start", startWire.receiverSource, baseB, S_B,
);

// Evidence construction itself must not smuggle the target into Memory.
same(findStartForm(memoryA, S_A), undefined, "A START target absent after evidence");
same(findStartForm(memoryB, S_B), undefined, "B START target absent after evidence");

const beforeStartA = memoryA.linkCount;
const P_A = materializeAuthorizedRelativeUnaryFormSource(
  memoryA,
  authorityA.basis,
  baseA,
  startEvidenceA,
  sourceAuthority(authorityA, "start"),
  authorityA.fixedTheory,
);
same(memoryA.linkCount, beforeStartA + 1, "A START authorization writes exactly one target Link");

const beforeStartB = memoryB.linkCount;
const P_B = materializeAuthorizedRelativeUnaryFormSource(
  memoryB,
  authorityB.basis,
  baseB,
  startEvidenceB,
  sourceAuthority(authorityB, "start"),
  authorityB.fixedTheory,
);
same(memoryB.linkCount, beforeStartB + 1, "B START authorization writes exactly one target Link");

same(findStartForm(memoryA, S_A), P_A, "A materializes exact START_FORM(S)");
same(findStartForm(memoryB, S_B), P_B, "B materializes exact START_FORM(S)");
same(memoryA.poles(P_A).start, P_A, "A P self-starts");
same(memoryA.poles(P_A).end, S_A, "A P carries local S");
same(memoryB.poles(P_B).start, P_B, "B P self-starts");
same(memoryB.poles(P_B).end, S_B, "B P carries local S");
assert(P_A !== P_B, "target form handles remain Memory-local");

// Repeating the same authorized materialization is idempotent.
const repeatStartB = memoryB.linkCount;
same(
  materializeAuthorizedRelativeUnaryFormSource(
    memoryB,
    authorityB.basis,
    baseB,
    startEvidenceB,
    sourceAuthority(authorityB, "start"),
    authorityB.fixedTheory,
  ),
  P_B,
  "repeated START returns canonical local form",
);
same(memoryB.linkCount, repeatStartB, "repeated START writes nothing");

// END is symmetric and still missing before its own authorization.
const endEvidenceA = buildEvidence(
  memoryA, authorityA, "end", endWire.senderSource, baseA, S_A,
);
const endEvidenceB = buildEvidence(
  memoryB, authorityB, "end", endWire.receiverSource, baseB, S_B,
);
same(findEndForm(memoryA, S_A), undefined, "A END target absent after evidence");
same(findEndForm(memoryB, S_B), undefined, "B END target absent after evidence");

const beforeEndA = memoryA.linkCount;
const Q_A = materializeAuthorizedRelativeUnaryFormSource(
  memoryA,
  authorityA.basis,
  baseA,
  endEvidenceA,
  sourceAuthority(authorityA, "end"),
  authorityA.fixedTheory,
);
same(memoryA.linkCount, beforeEndA + 1, "A END authorization writes exactly one target Link");

const beforeEndB = memoryB.linkCount;
const Q_B = materializeAuthorizedRelativeUnaryFormSource(
  memoryB,
  authorityB.basis,
  baseB,
  endEvidenceB,
  sourceAuthority(authorityB, "end"),
  authorityB.fixedTheory,
);
same(memoryB.linkCount, beforeEndB + 1, "B END authorization writes exactly one target Link");

same(memoryA.poles(Q_A).start, S_A, "A Q carries local S");
same(memoryA.poles(Q_A).end, Q_A, "A Q self-ends");
same(memoryB.poles(Q_B).start, S_B, "B Q carries local S");
same(memoryB.poles(Q_B).end, Q_B, "B Q self-ends");

// Forged orientation: START Rule cannot justify an END-shaped request.
{
  const forged = buildEvidence(
    memoryB, authorityB, "start", startWire.receiverSource, baseB, S_B,
  );
  const request = memoryB.ensure(S_B, authorityB.uses.start);
  const evidence = Object.freeze({
    ...forged,
    structural: Object.freeze({
      ...forged.structural,
      claimedBody: request,
    }),
  });
  const before = memoryB.linkCount;
  expectStructuralRuleError(
    () => materializeAuthorizedRelativeUnaryFormSource(
      memoryB,
      authorityB.basis,
      baseB,
      evidence,
      sourceAuthority(authorityB, "start"),
      authorityB.fixedTheory,
    ),
    "template-mismatch",
  );
  same(memoryB.linkCount, before, "forged orientation writes nothing");
}

// A Rule-grounded request for a different operand still cannot materialize
// against the current context.
{
  const T_B = memoryB.ensure(authorityB.basis.C, authorityB.basis.L);
  assert(T_B !== S_B, "foreign operand differs from current Whole");
  const foreignEvidence = buildEvidence(
    memoryB, authorityB, "start", startWire.receiverSource, baseB, T_B,
  );
  const before = memoryB.linkCount;
  expectMaterializationError(
    () => materializeAuthorizedRelativeUnaryFormSource(
      memoryB,
      authorityB.basis,
      baseB,
      foreignEvidence,
      sourceAuthority(authorityB, "start"),
      authorityB.fixedTheory,
    ),
    "constructor-request-mismatch",
  );
  same(memoryB.linkCount, before, "foreign operand request writes nothing");
  same(findStartForm(memoryB, T_B), undefined, "foreign START target stays absent");
}

console.log(
  "MTS v0.13 missing relative unary forms materialize only after source/Rule authority: GREEN.",
);
