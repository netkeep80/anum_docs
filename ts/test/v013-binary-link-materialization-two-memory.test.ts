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
  materializeV012StringAnum,
  serializeV012StringAnum,
} from "../src/v012-string-anum.js";
import {
  V013RelativeFormMaterializationError,
  materializeAuthorizedBinaryLinkSource,
} from "../src/v013-relative-form-materialization.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 binary materialization: ${message}`);
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
  readonly sourceUseRole: LinkHandle;
  readonly leftRole: LinkHandle;
  readonly rightRole: LinkHandle;
  readonly use: LinkHandle;
  readonly occurrence: LinkHandle;
  readonly grammarMembership: LinkHandle;
  readonly theoryMembership: LinkHandle;
  readonly roleDictionary: LinkHandle;
  readonly rule: LinkHandle;
  readonly admission: LinkHandle;
  readonly badRule: LinkHandle;
  readonly badAdmission: LinkHandle;
  readonly contextSeed: LinkHandle;
}

function refs(memory: Memory, basis: RootBasis, count: number): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  let current = memory.ensure(basis.L, basis.U);
  for (let index = 0; index < count; index += 1) {
    current = index % 2 === 0
      ? memory.ensure(current, basis.C)
      : memory.ensure(basis.O, current);
    result.push(current);
  }
  return Object.freeze(result);
}

function buildAuthority(memory: Memory): LocalAuthority {
  const basis = ensureRootBasis(memory);
  const local = refs(memory, basis, 18);

  const sourceUseRole = local[0]!;
  const leftRole = local[1]!;
  const rightRole = local[2]!;
  const grammar = local[3]!;
  const theory = local[4]!;
  const use = local[5]!;
  const contextSeed = local[6]!;

  let dictionary = defineDictionaryScope(memory, memory.root, memory.root);
  const effect = defineDictionaryEffect(
    memory,
    dictionary,
    memory.root,
    memory.root,
    materializeV012SourceContent(memory, basis, bytes("♂")),
    use,
  );
  dictionary = effect.afterScope;

  const formSequence = materializeExactSequence(memory, [use]);
  const grammarMembership = memory.ensure(grammar, formSequence);
  const theoryMembership = memory.ensure(theory, formSequence);

  const interpreter = Object.freeze({
    handle: defineStructuralInterpreter(memory, dictionary, grammar, theory),
    structure: Object.freeze({ dictionary, grammar, theory }),
  });

  const roleDictionary = defineStructuralRoleDictionary(
    memory,
    [sourceUseRole, leftRole, rightRole],
  );

  // A binary construction request never contains the target Left->Right.
  //
  //   (Use->Left) -> (Use->Right)
  const leftRequest = memory.ensure(sourceUseRole, leftRole);
  const rightRequest = memory.ensure(sourceUseRole, rightRole);
  const requestTemplate = memory.ensure(leftRequest, rightRequest);
  const rule = defineStructuralRule(memory, roleDictionary, requestTemplate);
  const admission = admitStructuralRule(memory, theory, rule);

  // Deliberately different request contract. It is a valid admitted Rule, but
  // the constructor boundary must reject it after replay because its second
  // request arm is Right->Use rather than Use->Right.
  const badRightRequest = memory.ensure(rightRole, sourceUseRole);
  const badTemplate = memory.ensure(leftRequest, badRightRequest);
  const badRule = defineStructuralRule(memory, roleDictionary, badTemplate);
  const badAdmission = admitStructuralRule(memory, theory, badRule);

  return Object.freeze({
    basis,
    dictionary,
    grammar,
    theory,
    fixedTheory: exportPortableStructuralTheory(memory, theory),
    interpreter,
    sourceUseRole,
    leftRole,
    rightRole,
    use,
    occurrence: effect.occurrence,
    grammarMembership,
    theoryMembership,
    roleDictionary,
    rule,
    admission,
    badRule,
    badAdmission,
    contextSeed,
  });
}

function authority(local: LocalAuthority): V012SourceAuthority {
  return Object.freeze({
    dictionary: local.dictionary,
    grammar: local.grammar,
    theory: local.theory,
    grammarMembership: local.grammarMembership,
    theoryMembership: local.theoryMembership,
  });
}

function transportSource(
  sender: Memory,
  senderLocal: LocalAuthority,
  receiver: Memory,
  receiverLocal: LocalAuthority,
): {
  readonly senderSource: LinkHandle;
  readonly receiverSource: LinkHandle;
} {
  const payload = bytes("♂");
  const senderString = materializeV012StringAnum(
    sender,
    senderLocal.basis,
    payload,
  );
  const wire = serializeV012StringAnum(
    sender,
    senderLocal.basis,
    senderString,
  );
  assert(sameBytes(wire, payload), "wire preserves exact source bytes");

  const receiverString = materializeV012StringAnum(
    receiver,
    receiverLocal.basis,
    wire,
  );
  const roundTrip = serializeV012StringAnum(
    receiver,
    receiverLocal.basis,
    receiverString,
  );
  assert(sameBytes(roundTrip, wire), "receiver reserializes exact source bytes");

  return Object.freeze({
    senderSource: defineSourceForm(sender, senderString.anumLink),
    receiverSource: defineSourceForm(receiver, receiverString.anumLink),
  });
}

function makeOperands(
  memory: Memory,
  local: LocalAuthority,
): readonly [LinkHandle, LinkHandle] {
  // Produce fresh operand candidates without ever ensuring Left->Right itself.
  // Authority setup may already contain many ordinary Links, so absence of the
  // target must be established rather than assumed from a convenient pair.
  let leftSeed = local.contextSeed;
  let rightSeed = local.use;

  for (let attempt = 0; attempt < 16; attempt += 1) {
    leftSeed = memory.ensureStartSelfClosed(leftSeed);
    rightSeed = memory.ensureEndSelfClosed(rightSeed);
    const left = memory.ensure(leftSeed, local.grammar);
    const right = memory.ensure(local.theory, rightSeed);

    if (left !== right && memory.find(left, right) === undefined) {
      return Object.freeze([left, right]);
    }
  }

  throw new Error("v0.13 binary materialization: could not obtain absent target fixture");
}

function evidence(
  memory: Memory,
  local: LocalAuthority,
  source: LinkHandle,
  left: LinkHandle,
  right: LinkHandle,
  malformed = false,
): V012SourceResultEvidence {
  const selected = buildV012SelectedSourceEvidence(
    memory,
    local.basis,
    source,
    [{
      start: 0,
      end: bytes("♂").length,
      form: local.use,
      dictionaryOccurrence: local.occurrence,
    }],
    authority(local),
  );

  const currentContext = defineContext(
    memory,
    local.basis.R,
    local.contextSeed,
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
    local.use,
  );
  const leftAttachment = defineActField(
    memory,
    act,
    local.leftRole,
    left,
  );
  const rightAttachment = defineActField(
    memory,
    act,
    local.rightRole,
    right,
  );

  const leftRequest = memory.ensure(local.use, left);
  const rightRequest = malformed
    ? memory.ensure(right, local.use)
    : memory.ensure(local.use, right);
  const request = memory.ensure(leftRequest, rightRequest);

  const structural: StructuralRuleReplayEvidence = Object.freeze({
    act,
    rule: malformed ? local.badRule : local.rule,
    ruleAdmission: malformed ? local.badAdmission : local.admission,
    claimedBody: request,
    expectedInterpreter: local.interpreter.structure,
    expectedAfterContext: currentContext,
  });

  return Object.freeze({
    source: selected,
    structural,
    selectedActAttachments: Object.freeze([
      useAttachment,
      leftAttachment,
      rightAttachment,
    ]),
    sourceUseIndex: 0,
    sourceUseRole: local.sourceUseRole,
  });
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
      `expected materialization error, got ${String(error)}`,
    );
    same(error.code, code, "materialization error code");
    return;
  }
  throw new Error(`v0.13 binary materialization: expected ${code}`);
}

const memoryA = new Memory();
const memoryB = new Memory();
const localA = buildAuthority(memoryA);
const localB = buildAuthority(memoryB);
const wire = transportSource(memoryA, localA, memoryB, localB);

const [leftA, rightA] = makeOperands(memoryA, localA);
const [leftB, rightB] = makeOperands(memoryB, localB);

assert(leftA !== leftB, "left handles are Memory-local");
assert(rightA !== rightB, "right handles are Memory-local");

const evidenceA = evidence(
  memoryA,
  localA,
  wire.senderSource,
  leftA,
  rightA,
);
const evidenceB = evidence(
  memoryB,
  localB,
  wire.receiverSource,
  leftB,
  rightB,
);

// Building source, Act, Rule evidence and request carrier must not smuggle the
// target Link into either Memory.
same(memoryA.find(leftA, rightA), undefined, "A target absent after evidence");
same(memoryB.find(leftB, rightB), undefined, "B target absent after evidence");

const beforeA = memoryA.linkCount;
const targetA = materializeAuthorizedBinaryLinkSource(
  memoryA,
  localA.basis,
  evidenceA,
  authority(localA),
  localA.fixedTheory,
);
same(memoryA.linkCount, beforeA + 1, "A writes exactly one missing binary target");
same(memoryA.poles(targetA).start, leftA, "A target exact left");
same(memoryA.poles(targetA).end, rightA, "A target exact right");

const beforeB = memoryB.linkCount;
const targetB = materializeAuthorizedBinaryLinkSource(
  memoryB,
  localB.basis,
  evidenceB,
  authority(localB),
  localB.fixedTheory,
);
same(memoryB.linkCount, beforeB + 1, "B writes exactly one missing binary target");
same(memoryB.poles(targetB).start, leftB, "B target exact left");
same(memoryB.poles(targetB).end, rightB, "B target exact right");
assert(targetA !== targetB, "target handles remain Memory-local");

// Canonical ensure makes repeated authorized construction idempotent.
const repeatB = memoryB.linkCount;
same(
  materializeAuthorizedBinaryLinkSource(
    memoryB,
    localB.basis,
    evidenceB,
    authority(localB),
    localB.fixedTheory,
  ),
  targetB,
  "repeated authorization returns same local target",
);
same(memoryB.linkCount, repeatB, "repeated authorization writes zero Links");

// PAIR is a topology class, not merely a binary parser opcode. Existing
// canonical pairs that resolve to one of their operands are ROOT/START/END
// forms and must be rejected by PAIR authority.
for (const [left, right, expectedExisting, label] of [
  [
    localB.basis.R,
    localB.basis.R,
    localB.basis.R,
    "188 would collapse to canonical 8/R",
  ],
  [
    localB.basis.O,
    localB.basis.R,
    localB.basis.O,
    "1988 would collapse to canonical 98/O",
  ],
  [
    localB.basis.R,
    localB.basis.C,
    localB.basis.C,
    "1868 would collapse to canonical 68/C",
  ],
] as const) {
  same(memoryB.find(left, right), expectedExisting, `${label}: existing target`);
  const noncanonicalEvidence = evidence(
    memoryB,
    localB,
    wire.receiverSource,
    left,
    right,
  );
  const before = memoryB.linkCount;
  expectMaterializationError(
    () => materializeAuthorizedBinaryLinkSource(
      memoryB,
      localB.basis,
      noncanonicalEvidence,
      authority(localB),
      localB.fixedTheory,
    ),
    "noncanonical-binary-form",
  );
  same(memoryB.linkCount, before, `${label}: rejection writes zero Links`);
}

// Equal poles remain a valid ordinary PAIR when the target is a distinct Link.
{
  const equalOperand = memoryB.ensureStartSelfClosed(localB.contextSeed);
  same(
    memoryB.find(equalOperand, equalOperand),
    undefined,
    "ordinary equal-pole PAIR target absent initially",
  );
  const equalEvidence = evidence(
    memoryB,
    localB,
    wire.receiverSource,
    equalOperand,
    equalOperand,
  );
  const before = memoryB.linkCount;
  const equalPair = materializeAuthorizedBinaryLinkSource(
    memoryB,
    localB.basis,
    equalEvidence,
    authority(localB),
    localB.fixedTheory,
  );
  same(memoryB.linkCount, before + 1, "ordinary equal-pole PAIR writes one Link");
  assert(equalPair !== equalOperand, "ordinary equal-pole PAIR target is distinct");
  same(memoryB.poles(equalPair).start, equalOperand, "equal-pole PAIR exact left");
  same(memoryB.poles(equalPair).end, equalOperand, "equal-pole PAIR exact right");
}

// A fixed-Theory Rule may authorize some other structural request, but this
// constructor boundary accepts only its declared binary request contract.
{
  const [foreignLeft, foreignRight] = makeOperands(memoryB, localB);
  const malformedEvidence = evidence(
    memoryB,
    localB,
    wire.receiverSource,
    foreignLeft,
    foreignRight,
    true,
  );
  same(
    memoryB.find(foreignLeft, foreignRight),
    undefined,
    "foreign target absent before malformed request",
  );
  const before = memoryB.linkCount;
  expectMaterializationError(
    () => materializeAuthorizedBinaryLinkSource(
      memoryB,
      localB.basis,
      malformedEvidence,
      authority(localB),
      localB.fixedTheory,
    ),
    "constructor-request-mismatch",
  );
  same(memoryB.linkCount, before, "malformed request writes nothing");
  same(
    memoryB.find(foreignLeft, foreignRight),
    undefined,
    "malformed request leaves target absent",
  );
}

console.log(
  "MTS v0.13 binary authority preserves canonical PAIR topology and rejects ROOT/START/END collapses: GREEN.",
);
