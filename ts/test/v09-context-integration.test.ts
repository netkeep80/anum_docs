import {
  ContextIntegrationError,
  continueFormalContext,
  continueQuaternaryContext,
  defineTypedContext,
  openFormalContext,
  openQuaternaryContext,
  replayFormalClose,
  replayFormalEquality,
  replayQuaternaryClose,
  type TypedContext,
} from "../src/context-integration.js";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import { replayRun } from "../src/run.js";
import { defineContext, defineLocalRepresentativeBinding, readContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  StructuralRuleError,
  type StructuralInterpreter,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function expectContextError(code: ContextIntegrationError["code"], effect: () => unknown): void {
  try { effect(); }
  catch (error) {
    assert(error instanceof ContextIntegrationError, `expected ContextIntegrationError, got ${String(error)}`);
    same(error.code, code, "context integration error code");
    return;
  }
  throw new Error(`expected ContextIntegrationError(${code})`);
}
function expectRuleError(code: StructuralRuleError["code"], effect: () => unknown): void {
  try { effect(); }
  catch (error) {
    assert(error instanceof StructuralRuleError, `expected StructuralRuleError, got ${String(error)}`);
    same(error.code, code, "structural rule error code");
    return;
  }
  throw new Error(`expected StructuralRuleError(${code})`);
}
function anchors(memory: Memory, count: number): LinkHandle[] {
  const result: LinkHandle[] = [];
  const seed = memory.ensureEndSelfClosed(memory.root);
  let tag = memory.ensureStartSelfClosed(memory.root);
  for (let index = 0; index < count; index += 1) {
    tag = memory.ensureStartSelfClosed(tag);
    result.push(memory.ensure(seed, tag));
  }
  return result;
}
function required(values: readonly LinkHandle[], index: number, name: string): LinkHandle {
  const value = values[index];
  assert(value !== undefined, `missing fixture ${name}`);
  return value;
}

class ReplayProbe implements ReadMemory {
  outgoingCalls = 0;
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("M5 replay must not use find"); }
  incoming(): readonly LinkHandle[] { throw new Error("M5 replay must not use incoming"); }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.outgoingCalls += 1;
    return this.source.outgoing(start);
  }
}

interface InterpreterFixture {
  readonly handle: LinkHandle;
  readonly structure: StructuralInterpreter;
}
function interpreter(memory: Memory): InterpreterFixture {
  const refs = anchors(memory, 3);
  const dictionary = required(refs, 0, "dictionary");
  const grammar = required(refs, 1, "grammar");
  const theory = required(refs, 2, "theory");
  const structure = Object.freeze({ dictionary, grammar, theory });
  return Object.freeze({
    handle: defineStructuralInterpreter(memory, dictionary, grammar, theory),
    structure,
  });
}
interface RuleFixture {
  readonly roleDictionary: LinkHandle;
  readonly rule: LinkHandle;
  readonly admission: LinkHandle;
}
function rule(
  memory: Memory,
  owner: InterpreterFixture,
  roles: readonly LinkHandle[],
  body: LinkHandle,
): RuleFixture {
  const roleDictionary = defineStructuralRoleDictionary(memory, roles);
  const ruleRef = defineStructuralRule(memory, roleDictionary, body);
  return Object.freeze({
    roleDictionary,
    rule: ruleRef,
    admission: admitStructuralRule(memory, owner.structure.theory, ruleRef),
  });
}
function act(
  memory: Memory,
  owner: InterpreterFixture,
  selected: RuleFixture,
  after: LinkHandle,
  fields: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  const result = defineActHeader(memory, owner.handle, selected.roleDictionary, after);
  for (const [roleRef, value] of fields) defineActField(memory, result, roleRef, value);
  return result;
}
function parentContext(memory: Memory, owner: InterpreterFixture, marker: LinkHandle): TypedContext {
  return defineTypedContext(
    memory,
    owner.handle,
    memory.root,
    materializeExactSequence(memory, [marker]),
  );
}
function closeEvidence(
  child: TypedContext,
  parentBefore: TypedContext,
  formal: InterpreterFixture,
  parentOwner: InterpreterFixture,
  result: LinkHandle,
  selected: RuleFixture,
  selectedAct: LinkHandle,
  claimedBody: LinkHandle,
) {
  return Object.freeze({
    child,
    parentBefore,
    expectedChildInterpreter: formal.structure,
    expectedParentInterpreter: parentOwner.structure,
    result,
    ruleReplay: Object.freeze({
      act: selectedAct,
      rule: selected.rule,
      ruleAdmission: selected.admission,
      claimedBody,
      expectedInterpreter: formal.structure,
      expectedAfterContext: parentBefore.context,
    }),
  });
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const rootI = interpreter(memory);
const formalI = interpreter(memory);
const qI = interpreter(memory);
const refs = anchors(memory, 40);
const marker0 = required(refs, 0, "marker0");
const marker1 = required(refs, 1, "marker1");
const marker2 = required(refs, 2, "marker2");
const marker3 = required(refs, 3, "marker3");
const marker4 = required(refs, 4, "marker4");
const marker5 = required(refs, 5, "marker5");
const marker6 = required(refs, 6, "marker6");
const marker7 = required(refs, 7, "marker7");
const marker8 = required(refs, 8, "marker8");
const marker9 = required(refs, 9, "marker9");
const marker10 = required(refs, 10, "marker10");
const A = required(refs, 11, "A");
const B = required(refs, 12, "B");
const C = required(refs, 13, "C");
const arrowCarrier = required(refs, 14, "arrowCarrier");
const oneCarrier = required(refs, 15, "oneCarrier");
const equalCarrier = required(refs, 16, "equalCarrier");
const infinityCarrier = required(refs, 17, "infinityCarrier");
const colonCarrier = required(refs, 18, "colonCarrier");
const leftRole = required(refs, 19, "leftRole");
const rightRole = required(refs, 20, "rightRole");
const valueRole = required(refs, 21, "valueRole");
const contextRole = required(refs, 22, "contextRole");
const leftRepresentativeRole = required(refs, 23, "leftRepresentativeRole");
const rightRepresentativeRole = required(refs, 24, "rightRepresentativeRole");
const sourceRole = required(refs, 25, "sourceRole");
const formRole = required(refs, 26, "formRole");
const beforeRole = required(refs, 27, "beforeRole");
const afterRole = required(refs, 28, "afterRole");
const representative = required(refs, 29, "representative");
const otherRepresentative = required(refs, 30, "otherRepresentative");
const runValue0 = required(refs, 31, "runValue0");
const runValue1 = required(refs, 32, "runValue1");
const runValue2 = required(refs, 33, "runValue2");

// Same root meaning does not erase sign/carrier/use identity.
const arrowUse = memory.ensure(arrowCarrier, basis.L);
const abitOneUse = memory.ensure(oneCarrier, basis.L);
const equalUse = memory.ensure(equalCarrier, basis.R);
const infinityUse = memory.ensure(infinityCarrier, basis.R);
const colonUse = memory.ensure(colonCarrier, memory.ensure(basis.R, basis.L));
assert(arrowUse !== abitOneUse, "FORMAL arrow must stay distinct from quaternary 1 use");
assert(equalUse !== infinityUse, "FORMAL = must stay distinct from infinity use");

// Relation Rule admits exactly `(left ⟼ right)` and returns `left ⟼ right`.
const relationTemplateForm = materializeExactSequence(memory, [leftRole, arrowUse, rightRole]);
const relationTemplateResult = memory.ensure(leftRole, rightRole);
const relationRule = rule(
  memory,
  formalI,
  [leftRole, rightRole],
  materializeExactSequence(memory, [relationTemplateForm, relationTemplateResult]),
);
function evaluateRelation(
  parent: TypedContext,
  parentOwner: InterpreterFixture,
  left: LinkHandle,
  right: LinkHandle,
): LinkHandle {
  let child = openFormalContext(memory, parent, parentOwner.structure, formalI.handle);
  child = continueFormalContext(memory, child, formalI.structure, left);
  child = continueFormalContext(memory, child, formalI.structure, arrowUse);
  child = continueFormalContext(memory, child, formalI.structure, right);
  const result = memory.ensure(left, right);
  const claimed = materializeExactSequence(memory, [readContext(memory, child.context).current, result]);
  const selectedAct = act(memory, formalI, relationRule, parent.context, [[leftRole, left], [rightRole, right]]);
  const probe = new ReplayProbe(memory);
  const before = memory.linkCount;
  same(
    replayFormalClose(probe, closeEvidence(child, parent, formalI, parentOwner, result, relationRule, selectedAct, claimed)).result,
    result,
    "relation close result",
  );
  same(memory.linkCount, before, "relation close replay is read-only");
  assert(probe.outgoingCalls > 0, "relation close reads structural Act fields");
  return result;
}

const relationParent = parentContext(memory, rootI, marker0);
const relation = evaluateRelation(relationParent, rootI, A, B);
same(relation, memory.ensure(A, B), "(A ⟼ B)");
const beforeParentState = readContext(memory, relationParent.context);
const afterParent = continueFormalContext(memory, relationParent, rootI.structure, relation);
same(readContext(memory, relationParent.context).current, beforeParentState.current, "CLOSE leaves parent-before immutable");
same(readContext(memory, afterParent.context).parent, beforeParentState.parent, "PARENT_CONTINUE preserves lexical parent");
const continued = readExactSequence(memory, readContext(memory, afterParent.context).current).values;
same(continued[continued.length - 1], relation, "PARENT_CONTINUE appends semantic result");

// `(A ⟼ (B ⟼ C))` and `((A ⟼ B) ⟼ C)` remain different exact trees.
const rightParent = parentContext(memory, rootI, marker1);
let rightOuter = openFormalContext(memory, rightParent, rootI.structure, formalI.handle);
rightOuter = continueFormalContext(memory, rightOuter, formalI.structure, A);
rightOuter = continueFormalContext(memory, rightOuter, formalI.structure, arrowUse);
const bc = evaluateRelation(rightOuter, formalI, B, C);
rightOuter = continueFormalContext(memory, rightOuter, formalI.structure, bc);
const rightNested = memory.ensure(A, bc);
replayFormalClose(
  memory,
  closeEvidence(
    rightOuter,
    rightParent,
    formalI,
    rootI,
    rightNested,
    relationRule,
    act(memory, formalI, relationRule, rightParent.context, [[leftRole, A], [rightRole, bc]]),
    materializeExactSequence(memory, [readContext(memory, rightOuter.context).current, rightNested]),
  ),
);

const leftParent = parentContext(memory, rootI, marker2);
let leftOuter = openFormalContext(memory, leftParent, rootI.structure, formalI.handle);
const ab = evaluateRelation(leftOuter, formalI, A, B);
leftOuter = continueFormalContext(memory, leftOuter, formalI.structure, ab);
leftOuter = continueFormalContext(memory, leftOuter, formalI.structure, arrowUse);
leftOuter = continueFormalContext(memory, leftOuter, formalI.structure, C);
const leftNested = memory.ensure(ab, C);
replayFormalClose(
  memory,
  closeEvidence(
    leftOuter,
    leftParent,
    formalI,
    rootI,
    leftNested,
    relationRule,
    act(memory, formalI, relationRule, leftParent.context, [[leftRole, ab], [rightRole, C]]),
    materializeExactSequence(memory, [readContext(memory, leftOuter.context).current, leftNested]),
  ),
);
assert(rightNested !== leftNested, "right and left nested relation trees must differ");

// No precedence/associativity shortcut admits bare `A ⟼ B ⟼ C`.
{
  const parent = parentContext(memory, rootI, marker3);
  let bare = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  for (const value of [A, arrowUse, B, arrowUse, C]) {
    bare = continueFormalContext(memory, bare, formalI.structure, value);
  }
  const result = memory.ensure(ab, C);
  const selectedAct = act(memory, formalI, relationRule, parent.context, [[leftRole, A], [rightRole, B]]);
  const claimed = materializeExactSequence(memory, [readContext(memory, bare.context).current, result]);
  expectRuleError("template-mismatch", () => replayFormalClose(
    memory,
    closeEvidence(bare, parent, formalI, rootI, result, relationRule, selectedAct, claimed),
  ));
}

// A one-value group is admitted explicitly; `()` itself is not.
const oneTemplate = materializeExactSequence(memory, [valueRole]);
const oneRule = rule(memory, formalI, [valueRole], materializeExactSequence(memory, [oneTemplate, valueRole]));
{
  const parent = parentContext(memory, rootI, marker4);
  let child = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  child = continueFormalContext(memory, child, formalI.structure, A);
  const selectedAct = act(memory, formalI, oneRule, parent.context, [[valueRole, A]]);
  const claimed = materializeExactSequence(memory, [readContext(memory, child.context).current, A]);
  replayFormalClose(memory, closeEvidence(child, parent, formalI, rootI, A, oneRule, selectedAct, claimed));

  const empty = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  expectContextError("empty-formal-context", () => replayFormalClose(
    memory,
    closeEvidence(empty, parent, formalI, rootI, A, oneRule, selectedAct, claimed),
  ));
}

// `[]`, `[[]]`, `([[]])`: Q result R survives as an explicit FORMAL position.
{
  const parent = parentContext(memory, rootI, marker5);
  let formal = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  const emptyQ = openQuaternaryContext(memory, formal, formalI.structure, qI.handle);
  const before = memory.linkCount;
  same(replayQuaternaryClose(memory, emptyQ, qI.structure, formal, formalI.structure, memory.root), memory.root, "[] -> R");
  same(memory.linkCount, before, "Q close replay is read-only");
  formal = continueFormalContext(memory, formal, formalI.structure, memory.root);
  const returnedRoot = readExactSequence(memory, readContext(memory, formal.context).current).values;
  same(returnedRoot.length, 1, "returned R is one exact FORMAL position");
  same(returnedRoot[0], memory.root, "returned R position value");

  let outerQ = openQuaternaryContext(memory, formal, formalI.structure, qI.handle);
  const innerQ = openQuaternaryContext(memory, outerQ, qI.structure, qI.handle);
  const innerResult = replayQuaternaryClose(memory, innerQ, qI.structure, outerQ, qI.structure, memory.root);
  outerQ = continueQuaternaryContext(memory, outerQ, qI.structure, innerResult);
  const outerResult = replayQuaternaryClose(memory, outerQ, qI.structure, formal, formalI.structure, memory.root);
  same(outerResult, memory.root, "[[]] -> R");

  let wrapper = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  wrapper = continueFormalContext(memory, wrapper, formalI.structure, outerResult);
  const selectedAct = act(memory, formalI, oneRule, parent.context, [[valueRole, memory.root]]);
  const claimed = materializeExactSequence(memory, [readContext(memory, wrapper.context).current, memory.root]);
  replayFormalClose(memory, closeEvidence(wrapper, parent, formalI, rootI, memory.root, oneRule, selectedAct, claimed));
  same(readExactSequence(memory, readContext(memory, wrapper.context).current).values.length, 1, "([[]]) has one root-valued form");
}

// `:` is admitted as its own sign/use and yields carrier -> form Entry structurally.
{
  const parent = parentContext(memory, rootI, marker6);
  let child = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  for (const value of [A, colonUse, B]) child = continueFormalContext(memory, child, formalI.structure, value);
  const template = materializeExactSequence(memory, [sourceRole, colonUse, formRole]);
  const entryTemplate = memory.ensure(sourceRole, formRole);
  const selectedRule = rule(memory, formalI, [sourceRole, formRole], materializeExactSequence(memory, [template, entryTemplate]));
  const entry = memory.ensure(A, B);
  const selectedAct = act(memory, formalI, selectedRule, parent.context, [[sourceRole, A], [formRole, B]]);
  const claimed = materializeExactSequence(memory, [readContext(memory, child.context).current, entry]);
  replayFormalClose(memory, closeEvidence(child, parent, formalI, rootI, entry, selectedRule, selectedAct, claimed));
}

// `=`: admitted structural Rule + one-hop context-local representative evidence.
const equalityTemplate = materializeExactSequence(memory, [leftRole, equalUse, rightRole]);
const equalityRule = rule(
  memory,
  formalI,
  [contextRole, leftRole, rightRole, leftRepresentativeRole, rightRepresentativeRole],
  materializeExactSequence(memory, [equalityTemplate, memory.root]),
);
function equalityChild(parent: TypedContext): TypedContext {
  let child = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  child = continueFormalContext(memory, child, formalI.structure, A);
  child = continueFormalContext(memory, child, formalI.structure, equalUse);
  return continueFormalContext(memory, child, formalI.structure, B);
}
{
  const resolutionContext = defineContext(memory, memory.root, marker7);
  defineLocalRepresentativeBinding(memory, resolutionContext, A, representative);
  defineLocalRepresentativeBinding(memory, resolutionContext, B, representative);
  const parent = parentContext(memory, rootI, marker7);
  const child = equalityChild(parent);
  const selectedAct = act(memory, formalI, equalityRule, parent.context, [
    [contextRole, resolutionContext], [leftRole, A], [rightRole, B],
    [leftRepresentativeRole, representative], [rightRepresentativeRole, representative],
  ]);
  const claimed = materializeExactSequence(memory, [readContext(memory, child.context).current, memory.root]);
  const before = memory.linkCount;
  replayFormalEquality(new ReplayProbe(memory), {
    ...closeEvidence(child, parent, formalI, rootI, memory.root, equalityRule, selectedAct, claimed),
    resolutionContext,
    contextRole,
    leftRole,
    rightRole,
    leftRepresentativeRole,
    rightRepresentativeRole,
  });
  same(memory.linkCount, before, "equality replay is read-only");

  const distinctContext = defineContext(memory, memory.root, marker8);
  defineLocalRepresentativeBinding(memory, distinctContext, A, representative);
  defineLocalRepresentativeBinding(memory, distinctContext, B, otherRepresentative);
  defineLocalRepresentativeBinding(memory, distinctContext, representative, otherRepresentative);
  const distinctParent = parentContext(memory, rootI, marker8);
  const distinctChild = equalityChild(distinctParent);
  const distinctAct = act(memory, formalI, equalityRule, distinctParent.context, [
    [contextRole, distinctContext], [leftRole, A], [rightRole, B],
    [leftRepresentativeRole, representative], [rightRepresentativeRole, otherRepresentative],
  ]);
  const distinctClaim = materializeExactSequence(memory, [readContext(memory, distinctChild.context).current, memory.root]);
  expectContextError("equality-distinguished", () => replayFormalEquality(memory, {
    ...closeEvidence(distinctChild, distinctParent, formalI, rootI, memory.root, equalityRule, distinctAct, distinctClaim),
    resolutionContext: distinctContext,
    contextRole,
    leftRole,
    rightRole,
    leftRepresentativeRole,
    rightRepresentativeRole,
  }));
}

// Wrong lexical parent / wrong I / wrong continuation I reject.
{
  const parent = parentContext(memory, rootI, marker9);
  const otherParent = parentContext(memory, rootI, marker10);
  let child = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  child = continueFormalContext(memory, child, formalI.structure, A);
  const claimed = materializeExactSequence(memory, [readContext(memory, child.context).current, A]);
  const selectedAct = act(memory, formalI, oneRule, otherParent.context, [[valueRole, A]]);
  expectContextError("lexical-parent-mismatch", () => replayFormalClose(
    memory,
    closeEvidence(child, otherParent, formalI, rootI, A, oneRule, selectedAct, claimed),
  ));
  expectContextError("context-interpreter-mismatch", () => replayFormalClose(memory, {
    ...closeEvidence(child, parent, formalI, rootI, A, oneRule, selectedAct, claimed),
    expectedChildInterpreter: qI.structure,
  }));
  expectContextError("context-interpreter-mismatch", () => continueFormalContext(memory, parent, qI.structure, A));
}

// Run owns temporal order; K.parent independently remains lexical nesting.
{
  const lexicalParent = defineContext(memory, memory.root, required(refs, 34, "lexicalParentCurrent"));
  const k0 = defineContext(memory, lexicalParent, runValue0);
  const k1 = defineContext(memory, lexicalParent, runValue1);
  const k2 = defineContext(memory, lexicalParent, runValue2);
  const runRoles = defineStructuralRoleDictionary(memory, [beforeRole, afterRole]);
  const firstAct = defineActHeader(memory, formalI.handle, runRoles, k1);
  defineActField(memory, firstAct, beforeRole, k0);
  defineActField(memory, firstAct, afterRole, k1);
  const secondAct = defineActHeader(memory, formalI.handle, runRoles, k2);
  defineActField(memory, secondAct, beforeRole, k1);
  defineActField(memory, secondAct, afterRole, k2);
  const run1 = memory.ensure(memory.root, firstAct);
  const run2 = memory.ensure(run1, secondAct);
  same(replayRun(memory, {
    runRoot: run2,
    initialContext: k0,
    terminalContext: k2,
    steps: [{ act: firstAct, beforeRole, afterRole }, { act: secondAct, beforeRole, afterRole }],
  }).length, 2, "Run preserves two temporal steps");
  same(readContext(memory, k0).parent, lexicalParent, "k0 lexical parent");
  same(readContext(memory, k1).parent, lexicalParent, "k1 lexical parent");
  same(readContext(memory, k2).parent, lexicalParent, "k2 lexical parent");
}
