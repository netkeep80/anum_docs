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
import {
  defineContext,
  defineLocalRepresentativeBinding,
  readContext,
} from "../src/state.js";
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
  const [dictionary, grammar, theory] = refs;
  assert(dictionary && grammar && theory, "interpreter refs");
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
  ruleFixture: RuleFixture,
  after: LinkHandle,
  fields: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  const result = defineActHeader(memory, owner.handle, ruleFixture.roleDictionary, after);
  for (const [role, value] of fields) defineActField(memory, result, role, value);
  return result;
}
function parentContext(
  memory: Memory,
  owner: InterpreterFixture,
  marker: LinkHandle,
): TypedContext {
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
const refs = anchors(memory, 30);
const [
  marker0, marker1, marker2, marker3, A, B, C,
  arrowCarrier, oneCarrier, equalCarrier, infinityCarrier, colonCarrier,
  leftRole, rightRole, valueRole, contextRole, leftRepresentativeRole,
  rightRepresentativeRole, sourceRole, formRole, beforeRole, afterRole,
  representative, otherRepresentative, runValue0, runValue1, runValue2,
] = refs;
assert(
  marker0 && marker1 && marker2 && marker3 && A && B && C && arrowCarrier && oneCarrier &&
  equalCarrier && infinityCarrier && colonCarrier && leftRole && rightRole && valueRole &&
  contextRole && leftRepresentativeRole && rightRepresentativeRole && sourceRole && formRole &&
  beforeRole && afterRole && representative && otherRepresentative && runValue0 && runValue1 && runValue2,
  "M5 refs",
);

// Carrier/use identity is retained even when root meanings intentionally collide.
const arrowUse = memory.ensure(arrowCarrier, basis.L);
const abitOneUse = memory.ensure(oneCarrier, basis.L);
const equalUse = memory.ensure(equalCarrier, basis.R);
const infinityUse = memory.ensure(infinityCarrier, basis.R);
const colonMeaning = memory.ensure(basis.R, basis.L);
const colonUse = memory.ensure(colonCarrier, colonMeaning);
assert(arrowUse !== abitOneUse, "FORMAL arrow use must not flatten into quaternary 1 use");
assert(equalUse !== infinityUse, "FORMAL = use must not flatten into infinity use");

// Admitted relation Rule: exact FORMAL sequence, no precedence or associativity primitive.
const relationTemplateForm = materializeExactSequence(memory, [leftRole, arrowUse, rightRole]);
const relationTemplateResult = memory.ensure(leftRole, rightRole);
const relationBody = materializeExactSequence(memory, [relationTemplateForm, relationTemplateResult]);
const relationRule = rule(memory, formalI, [leftRole, rightRole], relationBody);

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
  const claimedBody = materializeExactSequence(memory, [readContext(memory, child.context).current, result]);
  const selectedAct = act(memory, formalI, relationRule, parent.context, [
    [leftRole, left], [rightRole, right],
  ]);
  const probe = new ReplayProbe(memory);
  const before = memory.linkCount;
  const replayed = replayFormalClose(
    probe,
    closeEvidence(child, parent, formalI, parentOwner, result, relationRule, selectedAct, claimedBody),
  );
  same(replayed.result, result, "relation close result");
  same(memory.linkCount, before, "relation close replay is read-only");
  assert(probe.outgoingCalls > 0, "relation close uses structural Act fields");
  return result;
}

const relationParent = parentContext(memory, rootI, marker0);
const relation = evaluateRelation(relationParent, rootI, A, B);
same(relation, memory.ensure(A, B), "(A ⟼ B)");
const relationParentStateBefore = readContext(memory, relationParent.context);
const relationParentAfter = continueFormalContext(memory, relationParent, rootI.structure, relation);
same(readContext(memory, relationParent.context).current, relationParentStateBefore.current, "CLOSE does not mutate parent");
same(readContext(memory, relationParentAfter.context).parent, relationParentStateBefore.parent, "PARENT_CONTINUE preserves lexical parent");
const continuedValues = readExactSequence(memory, readContext(memory, relationParentAfter.context).current).values;
same(continuedValues.at(-1), relation, "PARENT_CONTINUE appends result");

// Right and left nested FORMAL groups stay structurally distinct.
const rightParent = parentContext(memory, rootI, marker1);
let rightOuter = openFormalContext(memory, rightParent, rootI.structure, formalI.handle);
rightOuter = continueFormalContext(memory, rightOuter, formalI.structure, A);
rightOuter = continueFormalContext(memory, rightOuter, formalI.structure, arrowUse);
const bc = evaluateRelation(rightOuter, formalI, B, C);
rightOuter = continueFormalContext(memory, rightOuter, formalI.structure, bc);
const rightNested = (() => {
  const result = memory.ensure(A, bc);
  const claimed = materializeExactSequence(memory, [readContext(memory, rightOuter.context).current, result]);
  const selectedAct = act(memory, formalI, relationRule, rightParent.context, [[leftRole, A], [rightRole, bc]]);
  replayFormalClose(memory, closeEvidence(rightOuter, rightParent, formalI, rootI, result, relationRule, selectedAct, claimed));
  return result;
})();

const leftParent = parentContext(memory, rootI, marker2);
let leftOuter = openFormalContext(memory, leftParent, rootI.structure, formalI.handle);
const ab = evaluateRelation(leftOuter, formalI, A, B);
leftOuter = continueFormalContext(memory, leftOuter, formalI.structure, ab);
leftOuter = continueFormalContext(memory, leftOuter, formalI.structure, arrowUse);
leftOuter = continueFormalContext(memory, leftOuter, formalI.structure, C);
const leftNested = (() => {
  const result = memory.ensure(ab, C);
  const claimed = materializeExactSequence(memory, [readContext(memory, leftOuter.context).current, result]);
  const selectedAct = act(memory, formalI, relationRule, leftParent.context, [[leftRole, ab], [rightRole, C]]);
  replayFormalClose(memory, closeEvidence(leftOuter, leftParent, formalI, rootI, result, relationRule, selectedAct, claimed));
  return result;
})();
assert(rightNested !== leftNested, "(A ⟼ (B ⟼ C)) must differ from ((A ⟼ B) ⟼ C)");

// Bare A ⟼ B ⟼ C has no admitted foundation relation shape.
{
  const parent = parentContext(memory, rootI, marker3);
  let bare = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  for (const value of [A, arrowUse, B, arrowUse, C]) {
    bare = continueFormalContext(memory, bare, formalI.structure, value);
  }
  const result = memory.ensure(memory.ensure(A, B), C);
  const claimed = materializeExactSequence(memory, [readContext(memory, bare.context).current, result]);
  const selectedAct = act(memory, formalI, relationRule, parent.context, [[leftRole, A], [rightRole, B]]);
  expectRuleError("template-mismatch", () => replayFormalClose(
    memory,
    closeEvidence(bare, parent, formalI, rootI, result, relationRule, selectedAct, claimed),
  ));
}

// Explicit one-value grouping Rule is admitted; empty FORMAL remains unadmitted.
const oneTemplateForm = materializeExactSequence(memory, [valueRole]);
const oneBody = materializeExactSequence(memory, [oneTemplateForm, valueRole]);
const oneRule = rule(memory, formalI, [valueRole], oneBody);
{
  const parent = parentContext(memory, rootI, anchors(memory, 1)[0] ?? memory.root);
  let child = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  child = continueFormalContext(memory, child, formalI.structure, A);
  const claimed = materializeExactSequence(memory, [readContext(memory, child.context).current, A]);
  const selectedAct = act(memory, formalI, oneRule, parent.context, [[valueRole, A]]);
  replayFormalClose(memory, closeEvidence(child, parent, formalI, rootI, A, oneRule, selectedAct, claimed));

  const empty = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  expectContextError("empty-formal-context", () => replayFormalClose(
    memory,
    closeEvidence(empty, parent, formalI, rootI, A, oneRule, selectedAct, claimed),
  ));
}

// Q OPEN/CLOSE re-entry: [] -> R; [ [] ] also returns R, but parent FORMAL keeps the explicit position.
{
  const parent = parentContext(memory, rootI, anchors(memory, 1)[0] ?? memory.root);
  let formal = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  const emptyQ = openQuaternaryContext(memory, formal, formalI.structure, qI.handle);
  const before = memory.linkCount;
  same(replayQuaternaryClose(memory, emptyQ, qI.structure, formal, formalI.structure, memory.root), memory.root, "[] closes to R");
  same(memory.linkCount, before, "Q close replay is read-only");
  formal = continueFormalContext(memory, formal, formalI.structure, memory.root);
  const values = readExactSequence(memory, readContext(memory, formal.context).current).values;
  same(values.length, 1, "returned R is one FORMAL position");
  same(values[0], memory.root, "returned R position value");

  let outerQ = openQuaternaryContext(memory, formal, formalI.structure, qI.handle);
  const innerQ = openQuaternaryContext(memory, outerQ, qI.structure, qI.handle);
  const innerResult = replayQuaternaryClose(memory, innerQ, qI.structure, outerQ, qI.structure, memory.root);
  outerQ = continueQuaternaryContext(memory, outerQ, qI.structure, innerResult);
  const outerResult = replayQuaternaryClose(memory, outerQ, qI.structure, formal, formalI.structure, memory.root);
  same(outerResult, memory.root, "[[]] closes canonically to R");

  let wrapper = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  wrapper = continueFormalContext(memory, wrapper, formalI.structure, outerResult);
  const claimed = materializeExactSequence(memory, [readContext(memory, wrapper.context).current, memory.root]);
  const selectedAct = act(memory, formalI, oneRule, parent.context, [[valueRole, memory.root]]);
  replayFormalClose(memory, closeEvidence(wrapper, parent, formalI, rootI, memory.root, oneRule, selectedAct, claimed));
  same(readExactSequence(memory, readContext(memory, wrapper.context).current).values.length, 1, "([[]]) contains one R before close");
}

// Colon is a distinct admitted FORMAL use even though its meaning is itself structural.
{
  const parent = parentContext(memory, rootI, anchors(memory, 1)[0] ?? memory.root);
  let child = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  child = continueFormalContext(memory, child, formalI.structure, A);
  child = continueFormalContext(memory, child, formalI.structure, colonUse);
  child = continueFormalContext(memory, child, formalI.structure, B);
  const templateForm = materializeExactSequence(memory, [sourceRole, colonUse, formRole]);
  const templateEntry = memory.ensure(sourceRole, formRole);
  const selectedRule = rule(memory, formalI, [sourceRole, formRole], materializeExactSequence(memory, [templateForm, templateEntry]));
  const entry = memory.ensure(A, B);
  const claimed = materializeExactSequence(memory, [readContext(memory, child.context).current, entry]);
  const selectedAct = act(memory, formalI, selectedRule, parent.context, [[sourceRole, A], [formRole, B]]);
  replayFormalClose(memory, closeEvidence(child, parent, formalI, rootI, entry, selectedRule, selectedAct, claimed));
}

// FORMAL `=`: structural Rule first, then one-hop context-local representative judgment.
const equalityTemplateForm = materializeExactSequence(memory, [leftRole, equalUse, rightRole]);
const equalityBody = materializeExactSequence(memory, [equalityTemplateForm, memory.root]);
const equalityRule = rule(
  memory,
  formalI,
  [contextRole, leftRole, rightRole, leftRepresentativeRole, rightRepresentativeRole],
  equalityBody,
);
{
  const resolutionContext = defineContext(memory, memory.root, anchors(memory, 1)[0] ?? memory.root);
  defineLocalRepresentativeBinding(memory, resolutionContext, A, representative);
  defineLocalRepresentativeBinding(memory, resolutionContext, B, representative);
  const parent = parentContext(memory, rootI, anchors(memory, 1)[0] ?? memory.root);
  let child = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  child = continueFormalContext(memory, child, formalI.structure, A);
  child = continueFormalContext(memory, child, formalI.structure, equalUse);
  child = continueFormalContext(memory, child, formalI.structure, B);
  const claimed = materializeExactSequence(memory, [readContext(memory, child.context).current, memory.root]);
  const selectedAct = act(memory, formalI, equalityRule, parent.context, [
    [contextRole, resolutionContext], [leftRole, A], [rightRole, B],
    [leftRepresentativeRole, representative], [rightRepresentativeRole, representative],
  ]);
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

  const distinctContext = defineContext(memory, memory.root, anchors(memory, 1)[0] ?? memory.root);
  defineLocalRepresentativeBinding(memory, distinctContext, A, representative);
  defineLocalRepresentativeBinding(memory, distinctContext, B, otherRepresentative);
  // Even if representative itself has a local binding, equality does not compute transitive closure.
  defineLocalRepresentativeBinding(memory, distinctContext, representative, otherRepresentative);
  const distinctParent = parentContext(memory, rootI, anchors(memory, 1)[0] ?? memory.root);
  let distinctChild = openFormalContext(memory, distinctParent, rootI.structure, formalI.handle);
  distinctChild = continueFormalContext(memory, distinctChild, formalI.structure, A);
  distinctChild = continueFormalContext(memory, distinctChild, formalI.structure, equalUse);
  distinctChild = continueFormalContext(memory, distinctChild, formalI.structure, B);
  const distinctClaim = materializeExactSequence(memory, [readContext(memory, distinctChild.context).current, memory.root]);
  const distinctAct = act(memory, formalI, equalityRule, distinctParent.context, [
    [contextRole, distinctContext], [leftRole, A], [rightRole, B],
    [leftRepresentativeRole, representative], [rightRepresentativeRole, otherRepresentative],
  ]);
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

// Negative lifecycle evidence: wrong parent, wrong I and wrong continuation I all reject.
{
  const parent = parentContext(memory, rootI, anchors(memory, 1)[0] ?? memory.root);
  const otherParent = parentContext(memory, rootI, anchors(memory, 1)[0] ?? memory.root);
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
  expectContextError("context-interpreter-mismatch", () => continueFormalContext(
    memory,
    parent,
    qI.structure,
    A,
  ));
}

// Run is temporal order; K.parent remains lexical structure and does not encode the step sequence.
{
  const lexicalParent = defineContext(memory, memory.root, anchors(memory, 1)[0] ?? memory.root);
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
  const acts = replayRun(memory, {
    runRoot: run2,
    initialContext: k0,
    terminalContext: k2,
    steps: [
      { act: firstAct, beforeRole, afterRole },
      { act: secondAct, beforeRole, afterRole },
    ],
  });
  same(acts.length, 2, "Run preserves two temporal steps");
  same(readContext(memory, k0).parent, lexicalParent, "k0 lexical parent");
  same(readContext(memory, k1).parent, lexicalParent, "k1 lexical parent");
  same(readContext(memory, k2).parent, lexicalParent, "k2 lexical parent");
}
