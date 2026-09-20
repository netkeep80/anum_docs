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
import {
  exportPortableStructuralTheory,
} from "../src/portable-theory.js";
import {
  defineSourceForm,
} from "../src/source.js";
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
  replayV012SourceResultEvidence,
  replayV012StructuralRuleAgainstTheoryAuthority,
  type V012SourceAuthority,
  type V012SourceResultEvidence,
} from "../src/v012-source.js";
import {
  materializeV012StringAnum,
  serializeV012StringAnum,
} from "../src/v012-string-anum.js";
import {
  executeAuthorizedRelativePoleSource,
} from "../src/v013-relative-pole-execution.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 relative two-memory: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

const GLYPHS = Object.freeze({
  start: "♂",
  end: "♀",
  direct: "⟼",
  inverse: "-⟼",
} as const);

type GlyphKind = keyof typeof GLYPHS;

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function anchors(memory: Memory, count: number): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  let current = ensureRootBasis(memory).L;
  for (let index = 0; index < count; index += 1) {
    current = memory.ensureStartSelfClosed(current);
    result.push(current);
  }
  return Object.freeze(result);
}

interface InterpreterFixture {
  readonly handle: LinkHandle;
  readonly structure: StructuralInterpreter;
}

interface LocalAuthority {
  readonly basis: RootBasis;
  readonly interpreter: InterpreterFixture;
  readonly dictionary: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly fixedTheory: unknown;
  readonly sourceUseRole: LinkHandle;
  readonly operandRole: LinkHandle;
  readonly roleDictionary: LinkHandle;
  readonly uses: Readonly<Record<GlyphKind, LinkHandle>>;
  readonly occurrences: Readonly<Record<GlyphKind, LinkHandle>>;
  readonly memberships: Readonly<Record<GlyphKind, {
    readonly grammar: LinkHandle;
    readonly theory: LinkHandle;
  }>>;
  readonly rules: Readonly<Record<GlyphKind, {
    readonly rule: LinkHandle;
    readonly admission: LinkHandle;
  }>>;
  readonly contextSeed: LinkHandle;
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

function buildLocalAuthority(memory: Memory): LocalAuthority {
  const basis = ensureRootBasis(memory);
  const refs = anchors(memory, 24);

  const sourceUseRole = refs[0]!;
  const operandRole = refs[1]!;
  const grammar = refs[2]!;
  const theory = refs[3]!;
  const contextSeed = refs[4]!;

  const uses = Object.freeze({
    start: refs[5]!,
    end: refs[6]!,
    direct: refs[7]!,
    inverse: refs[8]!,
  });

  let history = memory.root;
  let dictionary = defineDictionaryScope(memory, memory.root, history);
  const occurrenceMap = {} as Record<GlyphKind, LinkHandle>;

  for (const kind of Object.keys(GLYPHS) as GlyphKind[]) {
    const effect = defineDictionaryEffect(
      memory,
      dictionary,
      memory.root,
      history,
      materializeV012SourceContent(memory, basis, bytes(GLYPHS[kind])),
      uses[kind],
    );
    occurrenceMap[kind] = effect.occurrence;
    history = effect.historyAfter;
    dictionary = effect.afterScope;
  }

  const membershipMap = {} as Record<GlyphKind, {
    grammar: LinkHandle;
    theory: LinkHandle;
  }>;

  for (const kind of Object.keys(GLYPHS) as GlyphKind[]) {
    const formSequence = materializeExactSequence(memory, [uses[kind]]);
    membershipMap[kind] = Object.freeze({
      grammar: memory.ensure(grammar, formSequence),
      theory: memory.ensure(theory, formSequence),
    });
  }

  const interpreter = defineInterpreter(memory, dictionary, grammar, theory);
  const roleDictionary = defineStructuralRoleDictionary(
    memory,
    [sourceUseRole, operandRole],
  );

  // All four meanings are expressed by topology around the same Operand role.
  const startTemplate = memory.ensureStartSelfClosed(operandRole);
  const endTemplate = memory.ensureEndSelfClosed(operandRole);
  const directTemplate = memory.ensure(startTemplate, endTemplate);
  const inverseTemplate = memory.ensure(endTemplate, startTemplate);

  const bodies: Readonly<Record<GlyphKind, LinkHandle>> = Object.freeze({
    start: memory.ensure(sourceUseRole, startTemplate),
    end: memory.ensure(sourceUseRole, endTemplate),
    direct: memory.ensure(sourceUseRole, directTemplate),
    inverse: memory.ensure(sourceUseRole, inverseTemplate),
  });

  const ruleMap = {} as Record<GlyphKind, {
    rule: LinkHandle;
    admission: LinkHandle;
  }>;
  for (const kind of Object.keys(GLYPHS) as GlyphKind[]) {
    const rule = defineStructuralRule(memory, roleDictionary, bodies[kind]);
    ruleMap[kind] = Object.freeze({
      rule,
      admission: admitStructuralRule(memory, theory, rule),
    });
  }

  const fixedTheory = exportPortableStructuralTheory(memory, theory);

  return Object.freeze({
    basis,
    interpreter,
    dictionary,
    grammar,
    theory,
    fixedTheory,
    sourceUseRole,
    operandRole,
    roleDictionary,
    uses,
    occurrences: Object.freeze(occurrenceMap),
    memberships: Object.freeze(membershipMap),
    rules: Object.freeze(ruleMap),
    contextSeed,
  });
}

function sourceAuthority(
  local: LocalAuthority,
  kind: GlyphKind,
): V012SourceAuthority {
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
  kind: GlyphKind,
  source: LinkHandle,
  currentContext: LinkHandle,
  operand: LinkHandle,
  operation: LinkHandle,
): V012SourceResultEvidence {
  const sourceBytes = bytes(GLYPHS[kind]);
  const selected = buildV012SelectedSourceEvidence(
    memory,
    local.basis,
    source,
    [{
      start: 0,
      end: sourceBytes.length,
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

  const structural: StructuralRuleReplayEvidence = Object.freeze({
    act,
    rule: local.rules[kind].rule,
    ruleAdmission: local.rules[kind].admission,
    claimedBody: memory.ensure(local.uses[kind], operation),
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

function freshBase(
  memory: Memory,
  local: LocalAuthority,
  operand: LinkHandle,
  ordinal: number,
): LinkHandle {
  let marker = local.contextSeed;
  for (let i = 0; i <= ordinal; i += 1) {
    marker = memory.ensureStartSelfClosed(marker);
  }
  const parent = defineContext(memory, local.basis.R, marker);
  return defineContext(memory, parent, operand);
}

function localOperation(
  memory: Memory,
  local: LocalAuthority,
  kind: GlyphKind,
  source: LinkHandle,
  operand: LinkHandle,
  ordinal: number,
): LinkHandle {
  const base = freshBase(memory, local, operand, ordinal);

  if (kind === "start") {
    const operation = memory.ensureStartSelfClosed(operand);
    const result = executeAuthorizedRelativePoleSource(
      memory,
      local.basis,
      base,
      operand,
      buildEvidence(memory, local, kind, source, base, operand, operation),
      sourceAuthority(local, kind),
      local.fixedTheory,
    );
    same(result.operation, operation, "START Rule grounds exact local occurrence");
    same(
      result.result,
      memory.poles(operand).start,
      "START form result is local start(Operand)",
    );
    return result.operation;
  }

  if (kind === "end") {
    const operation = memory.ensureEndSelfClosed(operand);
    const result = executeAuthorizedRelativePoleSource(
      memory,
      local.basis,
      base,
      operand,
      buildEvidence(memory, local, kind, source, base, operand, operation),
      sourceAuthority(local, kind),
      local.fixedTheory,
    );
    same(result.operation, operation, "END Rule grounds exact local occurrence");
    same(
      result.result,
      memory.poles(operand).end,
      "END form result is local end(Operand)",
    );
    return result.operation;
  }

  const startForm = memory.ensureStartSelfClosed(operand);
  const endForm = memory.ensureEndSelfClosed(operand);
  const operation = kind === "direct"
    ? memory.ensure(startForm, endForm)
    : memory.ensure(endForm, startForm);

  const replay = replayV012SourceResultEvidence(
    memory,
    local.basis,
    buildEvidence(memory, local, kind, source, base, operand, operation),
    sourceAuthority(local, kind),
    local.fixedTheory,
  );
  same(
    memory.poles(replay.structural.claimedBody).end,
    operation,
    `${kind} Rule grounds exact local orientation`,
  );
  return operation;
}

function groundOrientationResult(
  memory: Memory,
  local: LocalAuthority,
  kind: "direct" | "inverse",
  operation: LinkHandle,
  operand: LinkHandle,
): LinkHandle {
  const operandPoles = memory.poles(operand);

  // Result authority is structural and local. These roles deliberately live in
  // a separate Rule dictionary from the source->form Rule: source transport has
  // already grounded the exact operation, and this Rule proves what that form
  // resolves to.
  const roleSeed = memory.ensure(local.contextSeed, local.basis.U);
  let roleTag = memory.ensure(local.basis.U, local.contextSeed);
  roleTag = memory.ensureStartSelfClosed(roleTag);
  const sourceUseRole = memory.ensure(roleSeed, roleTag);
  roleTag = memory.ensureStartSelfClosed(roleTag);
  const startRole = memory.ensure(roleSeed, roleTag);
  roleTag = memory.ensureStartSelfClosed(roleTag);
  const endRole = memory.ensure(roleSeed, roleTag);
  const roleDictionary = defineStructuralRoleDictionary(
    memory,
    [sourceUseRole, startRole, endRole],
  );

  const operandTemplate = memory.ensure(startRole, endRole);
  const startFormTemplate = memory.ensureStartSelfClosed(operandTemplate);
  const endFormTemplate = memory.ensureEndSelfClosed(operandTemplate);

  const formTemplate = kind === "direct"
    ? memory.ensure(startFormTemplate, endFormTemplate)
    : memory.ensure(endFormTemplate, startFormTemplate);
  const resultTemplate = kind === "direct"
    ? operandTemplate
    : memory.ensure(endRole, startRole);

  const transitionTemplate = memory.ensure(formTemplate, resultTemplate);
  const body = memory.ensure(sourceUseRole, transitionTemplate);
  const rule = defineStructuralRule(memory, roleDictionary, body);
  const admission = admitStructuralRule(memory, local.theory, rule);
  const fixedTheory = exportPortableStructuralTheory(memory, local.theory);

  const result = kind === "direct"
    ? operand
    : memory.ensure(operandPoles.end, operandPoles.start);

  const transition = memory.ensure(operation, result);
  const claimedBody = memory.ensure(local.uses[kind], transition);
  const afterContext = defineContext(memory, local.basis.R, claimedBody);
  const act = defineActHeader(
    memory,
    local.interpreter.handle,
    roleDictionary,
    afterContext,
  );
  defineActField(memory, act, sourceUseRole, local.uses[kind]);
  defineActField(memory, act, startRole, operandPoles.start);
  defineActField(memory, act, endRole, operandPoles.end);

  const evidence: StructuralRuleReplayEvidence = Object.freeze({
    act,
    rule,
    ruleAdmission: admission,
    claimedBody,
    expectedInterpreter: local.interpreter.structure,
    expectedAfterContext: afterContext,
  });

  const before = memory.linkCount;
  const replay = replayV012StructuralRuleAgainstTheoryAuthority(
    memory,
    evidence,
    fixedTheory,
  );
  same(replay.claimedBody, claimedBody, `${kind} result Rule replays`);
  same(memory.linkCount, before, `${kind} result replay is read-only`);
  return result;
}

function transportPhysicalSource(
  sender: Memory,
  senderBasis: RootBasis,
  receiver: Memory,
  receiverBasis: RootBasis,
  glyph: string,
): {
  readonly senderSource: LinkHandle;
  readonly receiverSource: LinkHandle;
  readonly wire: Uint8Array;
} {
  const payload = bytes(glyph);

  const senderString = materializeV012StringAnum(
    sender,
    senderBasis,
    payload,
  );
  const beforeSenderSerialize = sender.linkCount;
  const wire = serializeV012StringAnum(
    sender,
    senderBasis,
    senderString,
  );
  same(
    sender.linkCount,
    beforeSenderSerialize,
    "sender STRING serialization is read-only",
  );
  assert(bytesEqual(wire, payload), "wire preserves exact physical glyph bytes");

  const receiverString = materializeV012StringAnum(
    receiver,
    receiverBasis,
    wire,
  );
  const beforeReceiverSerialize = receiver.linkCount;
  const receiverWire = serializeV012StringAnum(
    receiver,
    receiverBasis,
    receiverString,
  );
  same(
    receiver.linkCount,
    beforeReceiverSerialize,
    "receiver STRING reserialization is read-only",
  );
  assert(bytesEqual(receiverWire, wire), "receiver faithful STRING wire parity");

  return Object.freeze({
    senderSource: defineSourceForm(sender, senderString.anumLink),
    receiverSource: defineSourceForm(receiver, receiverString.anumLink),
    wire,
  });
}

const memoryA = new Memory();
const memoryB = new Memory();
const authorityA = buildLocalAuthority(memoryA);
const authorityB = buildLocalAuthority(memoryB);

assert(authorityA.basis.R !== authorityB.basis.R, "independent memories have unrelated handles");
assert(authorityA.basis.L !== authorityB.basis.L, "independent memories have unrelated L handles");

const resultA = {} as Record<GlyphKind, LinkHandle>;
const resultB = {} as Record<GlyphKind, LinkHandle>;

let ordinal = 0;
for (const kind of Object.keys(GLYPHS) as GlyphKind[]) {
  const transported = transportPhysicalSource(
    memoryA,
    authorityA.basis,
    memoryB,
    authorityB.basis,
    GLYPHS[kind],
  );

  assert(
    transported.senderSource !== transported.receiverSource,
    `${kind} source handles are local to each Memory`,
  );

  resultA[kind] = localOperation(
    memoryA,
    authorityA,
    kind,
    transported.senderSource,
    authorityA.basis.L,
    ordinal,
  );
  resultB[kind] = localOperation(
    memoryB,
    authorityB,
    kind,
    transported.receiverSource,
    authorityB.basis.L,
    ordinal,
  );
  ordinal += 1;

  assert(
    resultA[kind] !== resultB[kind],
    `${kind} operation handles are local to each Memory`,
  );
}

// The receiver reconstructs the exact local quartet around its own L.
const pA = resultA.start;
const qA = resultA.end;
const dA = resultA.direct;
const iA = resultA.inverse;
const pB = resultB.start;
const qB = resultB.end;
const dB = resultB.direct;
const iB = resultB.inverse;

same(memoryA.poles(pA).start, pA, "A P self-start");
same(memoryA.poles(pA).end, authorityA.basis.L, "A P operand L");
same(memoryB.poles(pB).start, pB, "B P self-start");
same(memoryB.poles(pB).end, authorityB.basis.L, "B P operand L");

same(memoryA.poles(qA).start, authorityA.basis.L, "A Q operand L");
same(memoryA.poles(qA).end, qA, "A Q self-end");
same(memoryB.poles(qB).start, authorityB.basis.L, "B Q operand L");
same(memoryB.poles(qB).end, qB, "B Q self-end");

same(memoryA.poles(dA).start, pA, "A D starts at P");
same(memoryA.poles(dA).end, qA, "A D ends at Q");
same(memoryB.poles(dB).start, pB, "B D starts at P");
same(memoryB.poles(dB).end, qB, "B D ends at Q");

same(memoryA.poles(iA).start, qA, "A I starts at Q");
same(memoryA.poles(iA).end, pA, "A I ends at P");
same(memoryB.poles(iB).start, qB, "B I starts at Q");
same(memoryB.poles(iB).end, pB, "B I ends at P");

// Root basis remains only the projection at R, not the reconstructed quartet
// around L.
assert(pA !== authorityA.basis.O && pB !== authorityB.basis.O, "START_FORM(L) is not O");
assert(qA !== authorityA.basis.C && qB !== authorityB.basis.C, "END_FORM(L) is not C");
assert(dA !== authorityA.basis.L && dB !== authorityB.basis.L, "DIRECT_FORM(L) is not L");
assert(iA !== authorityA.basis.U && iB !== authorityB.basis.U, "INVERSE_FORM(L) is not U");

// End-to-end semantic result after physical-source transport and local form
// reconstruction. No sender handle participates in receiver result authority.
same(
  groundOrientationResult(
    memoryA,
    authorityA,
    "direct",
    dA,
    authorityA.basis.L,
  ),
  authorityA.basis.L,
  "A DIRECT_FORM(L) resolves to L",
);
same(
  groundOrientationResult(
    memoryB,
    authorityB,
    "direct",
    dB,
    authorityB.basis.L,
  ),
  authorityB.basis.L,
  "B DIRECT_FORM(L) resolves to local L",
);
same(
  groundOrientationResult(
    memoryA,
    authorityA,
    "inverse",
    iA,
    authorityA.basis.L,
  ),
  authorityA.basis.U,
  "A INVERSE_FORM(L) resolves to -L=U",
);
same(
  groundOrientationResult(
    memoryB,
    authorityB,
    "inverse",
    iB,
    authorityB.basis.L,
  ),
  authorityB.basis.U,
  "B INVERSE_FORM(L) resolves to local -L=U",
);

console.log(
  "MTS v0.13 relative four-form physical-source two-memory transport: GREEN.",
);
