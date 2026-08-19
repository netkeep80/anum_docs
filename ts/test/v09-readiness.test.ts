import {
  continueFormalContext,
  continueQuaternaryContext,
  defineTypedContext,
  openFormalContext,
  openQuaternaryContext,
  replayFormalEquality,
  replayQuaternaryClose,
  type TypedContext,
} from "../src/context-integration.js";
import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  appendQuaternaryValue,
  readQuaternaryState,
} from "../src/quaternary-state.js";
import { defineContext, readContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  replayStructuralRule,
  StructuralRuleError,
  type StructuralInterpreter,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectExactError(effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof ExactSequenceError, `expected ExactSequenceError, got ${String(error)}`);
    same(error.code, "not-exact-sequence", "cycle rejection code");
    return;
  }
  throw new Error("expected cyclic exact sequence rejection");
}

function expectRuleError(code: StructuralRuleError["code"], effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `expected StructuralRuleError, got ${String(error)}`);
    same(error.code, code, "rule rejection code");
    return;
  }
  throw new Error(`expected StructuralRuleError(${code})`);
}

function anchors(memory: Memory, count: number): readonly LinkHandle[] {
  const values: LinkHandle[] = [];
  const seed = memory.ensureEndSelfClosed(memory.root);
  let tag = memory.ensureStartSelfClosed(memory.root);
  for (let index = 0; index < count; index += 1) {
    tag = memory.ensureStartSelfClosed(tag);
    values.push(memory.ensure(seed, tag));
  }
  return Object.freeze(values);
}

class ReadProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("readiness replay must not use find"); }
  incoming(): readonly LinkHandle[] { throw new Error("readiness replay must not use incoming"); }
  outgoing(start: LinkHandle): readonly LinkHandle[] { return this.source.outgoing(start); }
}

interface InterpreterFixture {
  readonly handle: LinkHandle;
  readonly structure: StructuralInterpreter;
}

function interpreter(
  memory: Memory,
  dictionary: LinkHandle,
  grammar: LinkHandle,
  theory: LinkHandle,
): InterpreterFixture {
  const structure = Object.freeze({ dictionary, grammar, theory });
  return Object.freeze({
    handle: defineStructuralInterpreter(memory, dictionary, grammar, theory),
    structure,
  });
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const pool = anchors(memory, 48);
let cursor = 0;
function next(name: string): LinkHandle {
  const value = pool[cursor++];
  assert(value !== undefined, `missing readiness fixture ${name}`);
  return value;
}

// Negative carrier metacheck: a root-starting fold cannot admit R as a value.
// It collapses [] with [R], and [L] with [R,L]. ExactSequence is required instead.
{
  const fold = (values: readonly LinkHandle[]): LinkHandle => {
    let current = memory.root;
    for (const value of values) current = memory.ensure(current, value);
    return current;
  };
  same(fold([]), fold([basis.R]), "restricted rooted fold empty/[R] collision");
  same(fold([basis.L]), fold([basis.R, basis.L]), "restricted rooted fold leading-R collision");
}

// Same semantic value may occupy two structural positions without semantic cloning.
{
  const repeated = next("repeated-value");
  const carrier = materializeExactSequence(memory, [repeated, repeated]);
  const decoded = readExactSequence(memory, carrier);
  same(decoded.values.length, 2, "two repeated positions recovered");
  same(decoded.values[0], repeated, "first repeated value reuses semantic Link");
  same(decoded.values[1], repeated, "second repeated value reuses semantic Link");
  assert(decoded.cells[0] !== decoded.cells[1], "positions are distinct recursive Cells");
  same(materializeExactSequence(memory, [repeated, repeated]), carrier, "repeated sequence carrier canonical reuse");
}

// Malformed predecessor cycle is rejected even though every local shape looks like a Cell.
{
  const cycleCell = next("cycle-cell");
  const cyclePayload = next("cycle-payload");
  const cycleValue = next("cycle-value");
  const cycleMemory: ReadMemory = {
    root: memory.root,
    linkCount: memory.linkCount,
    poles(link: LinkHandle): LinkPoles {
      if (link === cycleCell) return Object.freeze({ start: cycleCell, end: cyclePayload });
      if (link === cyclePayload) return Object.freeze({ start: cycleCell, end: cycleValue });
      return memory.poles(link);
    },
    find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined { return memory.find(start, end); },
    outgoing(start: LinkHandle): readonly LinkHandle[] { return memory.outgoing(start); },
    incoming(end: LinkHandle): readonly LinkHandle[] { return memory.incoming(end); },
  };
  expectExactError(() => readExactSequence(cycleMemory, cycleCell));
}

// Q emptiness/non-emptiness is reconstructed from Links; a disagreeing host shadow flag has no authority.
{
  const value = next("q-value");
  const nonEmpty = appendQuaternaryValue(memory, memory.root, value);
  const forgedEmptyShadow = Object.freeze({ started: false, current: memory.root });
  const actual = readQuaternaryState(memory, nonEmpty);
  assert(!forgedEmptyShadow.started, "fixture shadow claims empty");
  assert(actual.started, "structural Q state remains nonempty despite shadow");
  same(actual.current, value, "structural Q payload wins over shadow");

  const forgedStartedShadow = Object.freeze({ started: true, current: value });
  const empty = readQuaternaryState(memory, memory.root);
  assert(forgedStartedShadow.started, "fixture shadow claims started");
  assert(!empty.started, "root remains structurally QEmpty despite shadow");
}

const rootI = interpreter(memory, next("root-D"), next("root-G"), next("root-T"));
const formalI = interpreter(memory, next("formal-D"), next("formal-G"), next("formal-T"));
const qI = interpreter(memory, next("q-D"), next("q-G"), next("q-T"));
assert(rootI.handle !== formalI.handle && formalI.handle !== qI.handle, "readiness interpreters differ structurally");

function parentContext(marker: LinkHandle): TypedContext {
  return defineTypedContext(memory, rootI.handle, memory.root, materializeExactSequence(memory, [marker]));
}

// Explicit nonempty Q CLOSE vector inside FORMAL.
{
  const parent = parentContext(next("q-parent"));
  let formal = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  let q = openQuaternaryContext(memory, formal, formalI.structure, qI.handle);
  q = continueQuaternaryContext(memory, q, qI.structure, basis.L);
  const result = memory.ensure(memory.root, basis.L);
  const before = memory.linkCount;
  same(
    replayQuaternaryClose(new ReadProbe(memory), q, qI.structure, formal, formalI.structure, result),
    result,
    "nonempty Q close result",
  );
  same(memory.linkCount, before, "nonempty Q close replay read-only");
  formal = continueFormalContext(memory, formal, formalI.structure, result);
  const values = readExactSequence(memory, readContext(memory, formal.context).current).values;
  same(values[values.length - 1], result, "FORMAL parent consumes nonempty Q result");
}

const equalCarrier = next("equal-carrier");
const equalUse = memory.ensure(equalCarrier, basis.R);
const contextRole = next("context-role");
const leftRole = next("left-role");
const rightRole = next("right-role");
const leftRepresentativeRole = next("left-representative-role");
const rightRepresentativeRole = next("right-representative-role");
const equalityForm = materializeExactSequence(memory, [leftRole, equalUse, rightRole]);
const equalityRoles = [contextRole, leftRole, rightRole, leftRepresentativeRole, rightRepresentativeRole] as const;
const equalityDictionary = defineStructuralRoleDictionary(memory, equalityRoles);
const equalityRule = defineStructuralRule(
  memory,
  equalityDictionary,
  materializeExactSequence(memory, [equalityForm, memory.root]),
);
const equalityAdmission = admitStructuralRule(memory, formalI.structure.theory, equalityRule);

// `A = A` with no local binding is true because both local representatives default to A itself.
{
  const member = next("unbound-member");
  const resolutionContext = defineContext(memory, memory.root, next("resolution-current"));
  const parent = parentContext(next("equality-parent"));
  let child = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  for (const value of [member, equalUse, member]) {
    child = continueFormalContext(memory, child, formalI.structure, value);
  }
  const act = defineActHeader(memory, formalI.handle, equalityDictionary, parent.context);
  defineActField(memory, act, contextRole, resolutionContext);
  defineActField(memory, act, leftRole, member);
  defineActField(memory, act, rightRole, member);
  defineActField(memory, act, leftRepresentativeRole, member);
  defineActField(memory, act, rightRepresentativeRole, member);
  const claimedBody = materializeExactSequence(memory, [readContext(memory, child.context).current, memory.root]);
  const before = memory.linkCount;
  replayFormalEquality(new ReadProbe(memory), {
    child,
    parentBefore: parent,
    expectedChildInterpreter: formalI.structure,
    expectedParentInterpreter: rootI.structure,
    result: memory.root,
    ruleReplay: {
      act,
      rule: equalityRule,
      ruleAdmission: equalityAdmission,
      claimedBody,
      expectedInterpreter: formalI.structure,
      expectedAfterContext: parent.context,
    },
    resolutionContext,
    contextRole,
    leftRole,
    rightRole,
    leftRepresentativeRole,
    rightRepresentativeRole,
  });
  same(memory.linkCount, before, "unbound identical equality replay read-only");
}

// Explicit wrong-before-context vector for generic Rule replay.
{
  const parentRole = next("parent-role");
  const beforeRole = next("before-role");
  const resultRole = next("result-role");
  const roleDictionary = defineStructuralRoleDictionary(memory, [parentRole, beforeRole, resultRole]);
  const templateBefore = defineContext(memory, parentRole, beforeRole);
  const templateAfter = defineContext(memory, parentRole, resultRole);
  const rule = defineStructuralRule(memory, roleDictionary, materializeExactSequence(memory, [templateBefore, templateAfter]));
  const admission = admitStructuralRule(memory, formalI.structure.theory, rule);

  const parent = next("actual-parent");
  const beforeValue = next("actual-before");
  const result = next("actual-result");
  const wrongBeforeValue = next("wrong-before");
  const correctAfter = defineContext(memory, parent, result);
  const wrongBefore = defineContext(memory, parent, wrongBeforeValue);
  const act = defineActHeader(memory, formalI.handle, roleDictionary, correctAfter);
  defineActField(memory, act, parentRole, parent);
  defineActField(memory, act, beforeRole, beforeValue);
  defineActField(memory, act, resultRole, result);

  expectRuleError("template-mismatch", () => replayStructuralRule(memory, {
    act,
    rule,
    ruleAdmission: admission,
    claimedBody: materializeExactSequence(memory, [wrongBefore, correctAfter]),
    expectedInterpreter: formalI.structure,
    expectedAfterContext: correctAfter,
  }));
}
