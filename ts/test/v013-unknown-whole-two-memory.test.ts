import {
  materializeCanonicalByteSequence,
  readCanonicalByteSequence,
} from "../src/byte-carrier.js";
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
  materializeV013HierarchicalCarrier,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";
import {
  materializeAuthorizedBinaryLinkSource,
  materializeAuthorizedRelativeUnaryFormSource,
} from "../src/v013-relative-form-materialization.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 unknown Whole: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function sameBytes(
  actual: Uint8Array,
  expected: readonly number[] | Uint8Array,
  message: string,
): void {
  assert(
    actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]),
    `${message}: byte sequences differ`,
  );
}

function findStartForm(
  memory: Memory,
  whole: LinkHandle,
): LinkHandle | undefined {
  return memory.allLinks().find((link) => {
    if (link === whole) return false;
    const poles = memory.poles(link);
    return poles.start === link && poles.end === whole;
  });
}

function findEndForm(
  memory: Memory,
  whole: LinkHandle,
): LinkHandle | undefined {
  return memory.allLinks().find((link) => {
    if (link === whole) return false;
    const poles = memory.poles(link);
    return poles.start === whole && poles.end === link;
  });
}

interface SenderCarrierBuilder {
  readonly basis: RootBasis;
  root(): LinkHandle;
  start(child: LinkHandle): LinkHandle;
  end(child: LinkHandle): LinkHandle;
  pair(left: LinkHandle, right: LinkHandle): LinkHandle;
}

function senderCarrierBuilder(memory: Memory): SenderCarrierBuilder {
  const basis = ensureRootBasis(memory);
  const namespace = memory.ensure(basis.L, basis.L);
  const quote = (value: LinkHandle): LinkHandle =>
    memory.ensure(namespace, value);
  const node = (values: readonly LinkHandle[]): LinkHandle =>
    materializeExactSequence(memory, values.map(quote));

  return Object.freeze({
    basis,
    root: () => basis.R,
    start: (child: LinkHandle) => node([basis.O, child]),
    end: (child: LinkHandle) => node([basis.C, child]),
    pair: (left: LinkHandle, right: LinkHandle) =>
      node([basis.L, left, right]),
  });
}

// Sender semantic Whole and independently described carrier.
const memoryA = new Memory();
const sender = senderCarrierBuilder(memoryA);

const semanticLeftA = memoryA.ensureStartSelfClosed(sender.basis.C);
const semanticRightA = memoryA.ensureEndSelfClosed(sender.basis.O);
const semanticWholeA = memoryA.ensure(semanticLeftA, semanticRightA);

const endRootCarrierA = sender.end(sender.root());
const startRootCarrierA = sender.start(sender.root());
const leftCarrierA = sender.start(endRootCarrierA);
const rightCarrierA = sender.end(startRootCarrierA);
const wholeCarrierA = sender.pair(leftCarrierA, rightCarrierA);

const wireA = serializeV013HierarchicalCarrier(
  memoryA,
  sender.basis,
  wholeCarrierA,
);
sameBytes(
  wireA,
  [0x03, 0x01, 0x02, 0x00, 0x02, 0x01, 0x00],
  "sender exact hierarchy wire",
);

const physicalA = materializeCanonicalByteSequence(
  memoryA,
  sender.basis,
  wireA,
);
const emitted = readCanonicalByteSequence(
  memoryA,
  sender.basis,
  physicalA,
).bytes;
sameBytes(emitted, wireA, "sender physical byte carrier");

// Receiver initially knows only its own rooted basis.
const memoryB = new Memory();
const basisB = ensureRootBasis(memoryB);

same(
  findStartForm(memoryB, basisB.C),
  undefined,
  "receiver unknown START_FORM(C) absent initially",
);
same(
  findEndForm(memoryB, basisB.O),
  undefined,
  "receiver unknown END_FORM(O) absent initially",
);

// Physical transport and representation-only reconstruction from R3d.
const physicalB = materializeCanonicalByteSequence(
  memoryB,
  basisB,
  emitted,
);
const received = readCanonicalByteSequence(
  memoryB,
  basisB,
  physicalB,
).bytes;
const wholeCarrierB = materializeV013HierarchicalCarrier(
  memoryB,
  basisB,
  received,
);
sameBytes(
  serializeV013HierarchicalCarrier(memoryB, basisB, wholeCarrierB),
  wireA,
  "receiver hierarchy wire parity before semantic reconstruction",
);

same(
  findStartForm(memoryB, basisB.C),
  undefined,
  "transported carrier still does not create START_FORM(C)",
);
same(
  findEndForm(memoryB, basisB.O),
  undefined,
  "transported carrier still does not create END_FORM(O)",
);

// ---------------------------------------------------------------------------
// Exact transported wire becomes source authority for semantic reconstruction.
// Host recursion below traverses only the fixed-arity physical framing.
// Every semantic write is separately admitted by fixed-Theory StructuralRule.
// ---------------------------------------------------------------------------

type Kind = "root" | "start" | "end" | "pair";

const OPCODE: Readonly<Record<Kind, number>> = Object.freeze({
  root: 0x00,
  start: 0x01,
  end: 0x02,
  pair: 0x03,
});

interface InterpreterFixture {
  readonly handle: LinkHandle;
  readonly structure: StructuralInterpreter;
}

interface ReconstructionAuthority {
  readonly basis: RootBasis;
  readonly dictionary: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly fixedTheory: unknown;
  readonly interpreter: InterpreterFixture;
  readonly sourceUseRole: LinkHandle;
  readonly operandRole: LinkHandle;
  readonly leftRole: LinkHandle;
  readonly rightRole: LinkHandle;
  readonly unaryRoles: LinkHandle;
  readonly pairRoles: LinkHandle;
  readonly uses: Readonly<Record<Kind, LinkHandle>>;
  readonly occurrences: Readonly<Record<Kind, LinkHandle>>;
  readonly source: LinkHandle;
  readonly selectedSource: ReturnType<typeof buildV012SelectedSourceEvidence>;
  readonly grammarMembership: LinkHandle;
  readonly theoryMembership: LinkHandle;
  readonly rules: Readonly<{
    start: { readonly rule: LinkHandle; readonly admission: LinkHandle };
    end: { readonly rule: LinkHandle; readonly admission: LinkHandle };
    pair: { readonly rule: LinkHandle; readonly admission: LinkHandle };
  }>;
  readonly contextParent: LinkHandle;
}

function neutralRefs(
  memory: Memory,
  basis: RootBasis,
  count: number,
): readonly LinkHandle[] {
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

function buildReconstructionAuthority(
  memory: Memory,
  basis: RootBasis,
  wire: Uint8Array,
): ReconstructionAuthority {
  const refs = neutralRefs(memory, basis, 20);
  const sourceUseRole = refs[0]!;
  const operandRole = refs[1]!;
  const leftRole = refs[2]!;
  const rightRole = refs[3]!;
  const grammar = refs[4]!;
  const theory = refs[5]!;
  const contextParent = refs[6]!;

  const uses = Object.freeze({
    root: refs[7]!,
    start: refs[8]!,
    end: refs[9]!,
    pair: refs[10]!,
  });

  let history = memory.root;
  let dictionary = defineDictionaryScope(memory, memory.root, history);
  const occurrences = {} as Record<Kind, LinkHandle>;

  for (const kind of ["root", "start", "end", "pair"] as const) {
    const effect = defineDictionaryEffect(
      memory,
      dictionary,
      memory.root,
      history,
      materializeV012SourceContent(
        memory,
        basis,
        Uint8Array.from([OPCODE[kind]]),
      ),
      uses[kind],
    );
    occurrences[kind] = effect.occurrence;
    history = effect.historyAfter;
    dictionary = effect.afterScope;
  }

  const sourceContent = materializeV012SourceContent(memory, basis, wire);
  const source = defineSourceForm(memory, sourceContent);

  const kinds: readonly Kind[] = Object.freeze([
    "pair",
    "start",
    "end",
    "root",
    "end",
    "start",
    "root",
  ]);
  const formSequence = materializeExactSequence(
    memory,
    kinds.map((kind) => uses[kind]),
  );
  const grammarMembership = memory.ensure(grammar, formSequence);
  const theoryMembership = memory.ensure(theory, formSequence);
  const sourceAuthority: V012SourceAuthority = Object.freeze({
    dictionary,
    grammar,
    theory,
    grammarMembership,
    theoryMembership,
  });

  const selectedSource = buildV012SelectedSourceEvidence(
    memory,
    basis,
    source,
    kinds.map((kind, index) => Object.freeze({
      start: index,
      end: index + 1,
      form: uses[kind],
      dictionaryOccurrence: occurrences[kind],
    })),
    sourceAuthority,
  );

  const interpreter = Object.freeze({
    handle: defineStructuralInterpreter(memory, dictionary, grammar, theory),
    structure: Object.freeze({ dictionary, grammar, theory }),
  });

  const unaryRoles = defineStructuralRoleDictionary(
    memory,
    [sourceUseRole, operandRole],
  );
  const pairRoles = defineStructuralRoleDictionary(
    memory,
    [sourceUseRole, leftRole, rightRole],
  );

  const startRule = defineStructuralRule(
    memory,
    unaryRoles,
    memory.ensure(sourceUseRole, operandRole),
  );
  const endRule = defineStructuralRule(
    memory,
    unaryRoles,
    memory.ensure(operandRole, sourceUseRole),
  );

  const leftRequest = memory.ensure(sourceUseRole, leftRole);
  const rightRequest = memory.ensure(sourceUseRole, rightRole);
  const pairRule = defineStructuralRule(
    memory,
    pairRoles,
    memory.ensure(leftRequest, rightRequest),
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
    pair: Object.freeze({
      rule: pairRule,
      admission: admitStructuralRule(memory, theory, pairRule),
    }),
  });

  return Object.freeze({
    basis,
    dictionary,
    grammar,
    theory,
    fixedTheory: exportPortableStructuralTheory(memory, theory),
    interpreter,
    sourceUseRole,
    operandRole,
    leftRole,
    rightRole,
    unaryRoles,
    pairRoles,
    uses,
    occurrences: Object.freeze(occurrences),
    source,
    selectedSource,
    grammarMembership,
    theoryMembership,
    rules,
    contextParent,
  });
}

const authorityB = buildReconstructionAuthority(
  memoryB,
  basisB,
  received,
);

function sourceAuthority(
  local: ReconstructionAuthority,
): V012SourceAuthority {
  return Object.freeze({
    dictionary: local.dictionary,
    grammar: local.grammar,
    theory: local.theory,
    grammarMembership: local.grammarMembership,
    theoryMembership: local.theoryMembership,
  });
}

// Even full source/dictionary/Rule authority must not pre-create targets.
same(
  findStartForm(memoryB, basisB.C),
  undefined,
  "source authority does not smuggle START_FORM(C)",
);
same(
  findEndForm(memoryB, basisB.O),
  undefined,
  "source authority does not smuggle END_FORM(O)",
);

function unaryEvidence(
  local: ReconstructionAuthority,
  sourceUseIndex: number,
  kind: "start" | "end",
  currentContext: LinkHandle,
  operand: LinkHandle,
): V012SourceResultEvidence {
  const use = local.uses[kind];
  const selectedRule = local.rules[kind];

  const act = defineActHeader(
    memoryB,
    local.interpreter.handle,
    local.unaryRoles,
    currentContext,
  );
  const useAttachment = defineActField(
    memoryB,
    act,
    local.sourceUseRole,
    use,
  );
  const operandAttachment = defineActField(
    memoryB,
    act,
    local.operandRole,
    operand,
  );

  const request = kind === "start"
    ? memoryB.ensure(use, operand)
    : memoryB.ensure(operand, use);

  const structural: StructuralRuleReplayEvidence = Object.freeze({
    act,
    rule: selectedRule.rule,
    ruleAdmission: selectedRule.admission,
    claimedBody: request,
    expectedInterpreter: local.interpreter.structure,
    expectedAfterContext: currentContext,
  });

  return Object.freeze({
    source: local.selectedSource,
    structural,
    selectedActAttachments: Object.freeze([
      useAttachment,
      operandAttachment,
    ]),
    sourceUseIndex,
    sourceUseRole: local.sourceUseRole,
  });
}

function pairEvidence(
  local: ReconstructionAuthority,
  sourceUseIndex: number,
  left: LinkHandle,
  right: LinkHandle,
): V012SourceResultEvidence {
  const use = local.uses.pair;
  const selectedRule = local.rules.pair;
  const marker = memoryB.ensure(local.contextParent, use);
  const context = defineContext(memoryB, local.contextParent, marker);

  const act = defineActHeader(
    memoryB,
    local.interpreter.handle,
    local.pairRoles,
    context,
  );
  const useAttachment = defineActField(
    memoryB,
    act,
    local.sourceUseRole,
    use,
  );
  const leftAttachment = defineActField(
    memoryB,
    act,
    local.leftRole,
    left,
  );
  const rightAttachment = defineActField(
    memoryB,
    act,
    local.rightRole,
    right,
  );

  const request = memoryB.ensure(
    memoryB.ensure(use, left),
    memoryB.ensure(use, right),
  );

  const structural: StructuralRuleReplayEvidence = Object.freeze({
    act,
    rule: selectedRule.rule,
    ruleAdmission: selectedRule.admission,
    claimedBody: request,
    expectedInterpreter: local.interpreter.structure,
    expectedAfterContext: context,
  });

  return Object.freeze({
    source: local.selectedSource,
    structural,
    selectedActAttachments: Object.freeze([
      useAttachment,
      leftAttachment,
      rightAttachment,
    ]),
    sourceUseIndex,
    sourceUseRole: local.sourceUseRole,
  });
}

interface Decoded {
  readonly result: LinkHandle;
  readonly next: number;
}

function semanticDecode(offset: number): Decoded {
  assert(offset < received.length, "semantic traversal stays inside wire");
  const opcode = received[offset]!;

  if (opcode === OPCODE.root) {
    return Object.freeze({ result: basisB.R, next: offset + 1 });
  }

  if (opcode === OPCODE.start || opcode === OPCODE.end) {
    const child = semanticDecode(offset + 1);
    const kind = opcode === OPCODE.start ? "start" as const : "end" as const;

    // Use a non-root parent so Context(parent,current) cannot collapse its
    // payload into C/O and accidentally create the target before authority.
    const currentContext = defineContext(
      memoryB,
      authorityB.contextParent,
      child.result,
    );
    const evidence = unaryEvidence(
      authorityB,
      offset,
      kind,
      currentContext,
      child.result,
    );

    if (kind === "start" && child.result === basisB.C) {
      same(
        findStartForm(memoryB, basisB.C),
        undefined,
        "START_FORM(C) absent immediately before authorized write",
      );
    }
    if (kind === "end" && child.result === basisB.O) {
      same(
        findEndForm(memoryB, basisB.O),
        undefined,
        "END_FORM(O) absent immediately before authorized write",
      );
    }

    const before = memoryB.linkCount;
    const result = materializeAuthorizedRelativeUnaryFormSource(
      memoryB,
      basisB,
      currentContext,
      evidence,
      sourceAuthority(authorityB),
      authorityB.fixedTheory,
    );

    if (
      (kind === "start" && child.result === basisB.C) ||
      (kind === "end" && child.result === basisB.O)
    ) {
      same(
        memoryB.linkCount,
        before + 1,
        `${kind} unknown nested form writes exactly one semantic Link`,
      );
    }

    return Object.freeze({ result, next: child.next });
  }

  if (opcode === OPCODE.pair) {
    const left = semanticDecode(offset + 1);
    const right = semanticDecode(left.next);

    same(
      memoryB.find(left.result, right.result),
      undefined,
      "final unknown binary Whole absent before pair evidence",
    );
    const evidence = pairEvidence(
      authorityB,
      offset,
      left.result,
      right.result,
    );
    same(
      memoryB.find(left.result, right.result),
      undefined,
      "pair evidence does not smuggle final Whole",
    );

    const before = memoryB.linkCount;
    const result = materializeAuthorizedBinaryLinkSource(
      memoryB,
      basisB,
      evidence,
      sourceAuthority(authorityB),
      authorityB.fixedTheory,
    );
    same(
      memoryB.linkCount,
      before + 1,
      "authorized pair writes exactly one final unknown Whole",
    );

    return Object.freeze({ result, next: right.next });
  }

  throw new Error("v0.13 unknown Whole: unexpected validated opcode");
}

const decoded = semanticDecode(0);
same(decoded.next, received.length, "semantic traversal consumes exact wire");
const semanticWholeB = decoded.result;

const semanticLeftB = findStartForm(memoryB, basisB.C);
const semanticRightB = findEndForm(memoryB, basisB.O);
assert(semanticLeftB !== undefined, "receiver reconstructed START_FORM(C)");
assert(semanticRightB !== undefined, "receiver reconstructed END_FORM(O)");

const wholePolesB = memoryB.poles(semanticWholeB);
same(wholePolesB.start, semanticLeftB, "receiver Whole exact reconstructed left");
same(wholePolesB.end, semanticRightB, "receiver Whole exact reconstructed right");

assert(
  semanticLeftA !== semanticLeftB,
  "START form handles remain Memory-local",
);
assert(
  semanticRightA !== semanticRightB,
  "END form handles remain Memory-local",
);
assert(
  semanticWholeA !== semanticWholeB,
  "final semantic Whole handles remain Memory-local",
);

// Semantic reconstruction does not alter the transported description.
sameBytes(
  serializeV013HierarchicalCarrier(memoryB, basisB, wholeCarrierB),
  wireA,
  "carrier remains canonical after semantic reconstruction",
);

console.log(
  "MTS v0.13 unknown semantic Whole transported and reconstructed under source/Rule authority: GREEN.",
);
