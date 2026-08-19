import {
  ContextIntegrationError, continueFormalContext, continueQuaternaryContext,
  defineTypedContext, openFormalContext, openQuaternaryContext,
  replayFormalClose, replayFormalEquality, replayQuaternaryClose, type TypedContext,
} from "../src/context-integration.js";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle, type LinkPoles, type ReadMemory } from "../src/memory.js";
import { replayRun } from "../src/run.js";
import { defineContext, defineLocalRepresentativeBinding, readContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  admitStructuralRule, defineStructuralInterpreter, defineStructuralRoleDictionary,
  defineStructuralRule, StructuralRuleError, type StructuralInterpreter,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function expectContextError(code: ContextIntegrationError["code"], effect: () => unknown): void {
  try { effect(); } catch (error) {
    assert(error instanceof ContextIntegrationError, `expected ContextIntegrationError, got ${String(error)}`);
    same(error.code, code, "context integration error code"); return;
  }
  throw new Error(`expected ContextIntegrationError(${code})`);
}
function expectRuleError(code: StructuralRuleError["code"], effect: () => unknown): void {
  try { effect(); } catch (error) {
    assert(error instanceof StructuralRuleError, `expected StructuralRuleError, got ${String(error)}`);
    same(error.code, code, "structural rule error code"); return;
  }
  throw new Error(`expected StructuralRuleError(${code})`);
}
function anchors(memory: Memory, count: number): readonly LinkHandle[] {
  const result: LinkHandle[] = []; const seed = memory.ensureEndSelfClosed(memory.root);
  let tag = memory.ensureStartSelfClosed(memory.root);
  for (let index = 0; index < count; index += 1) {
    tag = memory.ensureStartSelfClosed(tag); result.push(memory.ensure(seed, tag));
  }
  return Object.freeze(result);
}
class ReplayProbe implements ReadMemory {
  outgoingCalls = 0; constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; } get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("M5 replay must not use find"); }
  incoming(): readonly LinkHandle[] { throw new Error("M5 replay must not use incoming"); }
  outgoing(start: LinkHandle): readonly LinkHandle[] { this.outgoingCalls += 1; return this.source.outgoing(start); }
}
interface IFix { readonly handle: LinkHandle; readonly structure: StructuralInterpreter; }
interface RFix { readonly roleDictionary: LinkHandle; readonly rule: LinkHandle; readonly admission: LinkHandle; }
function interpreter(memory: Memory, dictionary: LinkHandle, grammar: LinkHandle, theory: LinkHandle): IFix {
  const structure = Object.freeze({ dictionary, grammar, theory });
  return Object.freeze({ handle: defineStructuralInterpreter(memory, dictionary, grammar, theory), structure });
}
function rule(memory: Memory, owner: IFix, roles: readonly LinkHandle[], body: LinkHandle): RFix {
  const roleDictionary = defineStructuralRoleDictionary(memory, roles); const ruleRef = defineStructuralRule(memory, roleDictionary, body);
  return Object.freeze({ roleDictionary, rule: ruleRef, admission: admitStructuralRule(memory, owner.structure.theory, ruleRef) });
}
function act(memory: Memory, owner: IFix, selected: RFix, after: LinkHandle,
  fields: readonly (readonly [LinkHandle, LinkHandle])[]): LinkHandle {
  const result = defineActHeader(memory, owner.handle, selected.roleDictionary, after);
  for (const [roleRef, value] of fields) defineActField(memory, result, roleRef, value); return result;
}
function parentContext(memory: Memory, owner: IFix, marker: LinkHandle): TypedContext {
  return defineTypedContext(memory, owner.handle, memory.root, materializeExactSequence(memory, [marker]));
}
function evidence(child: TypedContext, parent: TypedContext, parentOwner: IFix, result: LinkHandle,
  selected: RFix, selectedAct: LinkHandle) {
  return Object.freeze({ child, parentBefore: parent, expectedChildInterpreter: formalI.structure,
    expectedParentInterpreter: parentOwner.structure, result,
    ruleReplay: Object.freeze({ act: selectedAct, rule: selected.rule, ruleAdmission: selected.admission,
      claimedBody: materializeExactSequence(memory, [readContext(memory, child.context).current, result]),
      expectedInterpreter: formalI.structure, expectedAfterContext: parent.context }) });
}
function formalChild(parent: TypedContext, parentOwner: IFix, values: readonly LinkHandle[]): TypedContext {
  let child = openFormalContext(memory, parent, parentOwner.structure, formalI.handle);
  for (const value of values) child = continueFormalContext(memory, child, formalI.structure, value); return child;
}

const memory = new Memory(); const basis = ensureRootBasis(memory); const pool = anchors(memory, 64); let cursor = 0;
function next(name: string): LinkHandle { const value = pool[cursor++]; assert(value !== undefined, `missing ${name}`); return value; }
// One recursively distinct pool is partitioned once; repeated recipes are not instance factories.
const rootI = interpreter(memory, next("root-D"), next("root-G"), next("root-T"));
const formalI = interpreter(memory, next("formal-D"), next("formal-G"), next("formal-T"));
const qI = interpreter(memory, next("q-D"), next("q-G"), next("q-T"));
assert(rootI.handle !== formalI.handle && formalI.handle !== qI.handle, "I fixtures differ structurally");
const marker0 = next("m0"), marker1 = next("m1"), marker2 = next("m2"), marker3 = next("m3");
const marker4 = next("m4"), marker5 = next("m5"), marker6 = next("m6"), marker7 = next("m7");
const marker8 = next("m8"), marker9 = next("m9"), marker10 = next("m10");
const A = next("A"), B = next("B"), C = next("C");
const arrowCarrier = next("arrow"), oneCarrier = next("one"), equalCarrier = next("equal");
const infinityCarrier = next("infinity"), colonCarrier = next("colon");
const leftRole = next("left"), rightRole = next("right"), valueRole = next("value"), contextRole = next("context");
const leftRepRole = next("leftRep"), rightRepRole = next("rightRep"), sourceRole = next("source"), formRole = next("form");
const beforeRole = next("before"), afterRole = next("after"), representative = next("rep"), otherRep = next("otherRep");
const run0 = next("run0"), run1 = next("run1"), run2 = next("run2"), lexicalCurrent = next("lexical");
const arrowUse = memory.ensure(arrowCarrier, basis.L), oneUse = memory.ensure(oneCarrier, basis.L);
const equalUse = memory.ensure(equalCarrier, basis.R), infinityUse = memory.ensure(infinityCarrier, basis.R);
const colonUse = memory.ensure(colonCarrier, memory.ensure(basis.R, basis.L));
assert(arrowUse !== oneUse, "arrow use != quaternary 1 use"); assert(equalUse !== infinityUse, "= use != infinity use");

const relationForm = materializeExactSequence(memory, [leftRole, arrowUse, rightRole]);
const relationResult = memory.ensure(leftRole, rightRole);
const relationRule = rule(memory, formalI, [leftRole, rightRole], materializeExactSequence(memory, [relationForm, relationResult]));
function relation(parent: TypedContext, parentOwner: IFix, left: LinkHandle, right: LinkHandle): LinkHandle {
  const child = formalChild(parent, parentOwner, [left, arrowUse, right]); const result = memory.ensure(left, right);
  const selectedAct = act(memory, formalI, relationRule, parent.context, [[leftRole, left], [rightRole, right]]);
  const replayEvidence = evidence(child, parent, parentOwner, result, relationRule, selectedAct);
  const before = memory.linkCount; const probe = new ReplayProbe(memory);
  same(replayFormalClose(probe, replayEvidence).result, result, "relation result");
  same(memory.linkCount, before, "relation replay read-only"); assert(probe.outgoingCalls > 0, "Act fields read structurally"); return result;
}
const p0 = parentContext(memory, rootI, marker0); const ab0 = relation(p0, rootI, A, B);
same(ab0, memory.ensure(A, B), "(A ⟼ B)"); const p0before = readContext(memory, p0.context);
const p0after = continueFormalContext(memory, p0, rootI.structure, ab0);
same(readContext(memory, p0.context).current, p0before.current, "CLOSE leaves parent immutable");
same(readContext(memory, p0after.context).parent, p0before.parent, "PARENT_CONTINUE keeps lexical parent");
const p0values = readExactSequence(memory, readContext(memory, p0after.context).current).values;
same(p0values[p0values.length - 1], ab0, "PARENT_CONTINUE appends result");

const rightParent = parentContext(memory, rootI, marker1);
let rightOuter = formalChild(rightParent, rootI, [A, arrowUse]); const bc = relation(rightOuter, formalI, B, C);
rightOuter = continueFormalContext(memory, rightOuter, formalI.structure, bc); const rightNested = memory.ensure(A, bc);
replayFormalClose(memory, evidence(rightOuter, rightParent, rootI, rightNested, relationRule,
  act(memory, formalI, relationRule, rightParent.context, [[leftRole, A], [rightRole, bc]])));
const leftParent = parentContext(memory, rootI, marker2); let leftOuter = openFormalContext(memory, leftParent, rootI.structure, formalI.handle);
const ab = relation(leftOuter, formalI, A, B); leftOuter = continueFormalContext(memory, leftOuter, formalI.structure, ab);
leftOuter = continueFormalContext(memory, leftOuter, formalI.structure, arrowUse);
leftOuter = continueFormalContext(memory, leftOuter, formalI.structure, C); const leftNested = memory.ensure(ab, C);
replayFormalClose(memory, evidence(leftOuter, leftParent, rootI, leftNested, relationRule,
  act(memory, formalI, relationRule, leftParent.context, [[leftRole, ab], [rightRole, C]])));
assert(rightNested !== leftNested, "right/left nested relation forms differ");

{
  const parent = parentContext(memory, rootI, marker3); const bare = formalChild(parent, rootI, [A, arrowUse, B, arrowUse, C]);
  const result = memory.ensure(ab, C); const selectedAct = act(memory, formalI, relationRule, parent.context, [[leftRole, A], [rightRole, B]]);
  expectRuleError("template-mismatch", () => replayFormalClose(memory, evidence(bare, parent, rootI, result, relationRule, selectedAct)));
}

const oneForm = materializeExactSequence(memory, [valueRole]);
const oneRule = rule(memory, formalI, [valueRole], materializeExactSequence(memory, [oneForm, valueRole]));
{
  const parent = parentContext(memory, rootI, marker4); const child = formalChild(parent, rootI, [A]);
  const selectedAct = act(memory, formalI, oneRule, parent.context, [[valueRole, A]]);
  replayFormalClose(memory, evidence(child, parent, rootI, A, oneRule, selectedAct));
  const empty = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  expectContextError("empty-formal-context", () => replayFormalClose(memory, evidence(empty, parent, rootI, A, oneRule, selectedAct)));
}

{
  const parent = parentContext(memory, rootI, marker5); let formal = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  const emptyQ = openQuaternaryContext(memory, formal, formalI.structure, qI.handle); const before = memory.linkCount;
  same(replayQuaternaryClose(memory, emptyQ, qI.structure, formal, formalI.structure, memory.root), memory.root, "[] -> R");
  same(memory.linkCount, before, "Q close read-only"); formal = continueFormalContext(memory, formal, formalI.structure, memory.root);
  const values = readExactSequence(memory, readContext(memory, formal.context).current).values;
  same(values.length, 1, "returned R is one FORMAL position"); same(values[0], memory.root, "returned position value R");
  let outerQ = openQuaternaryContext(memory, formal, formalI.structure, qI.handle);
  const innerQ = openQuaternaryContext(memory, outerQ, qI.structure, qI.handle);
  const inner = replayQuaternaryClose(memory, innerQ, qI.structure, outerQ, qI.structure, memory.root);
  outerQ = continueQuaternaryContext(memory, outerQ, qI.structure, inner);
  const outer = replayQuaternaryClose(memory, outerQ, qI.structure, formal, formalI.structure, memory.root); same(outer, memory.root, "[[]] -> R");
  const wrapper = formalChild(parent, rootI, [outer]); const selectedAct = act(memory, formalI, oneRule, parent.context, [[valueRole, memory.root]]);
  replayFormalClose(memory, evidence(wrapper, parent, rootI, memory.root, oneRule, selectedAct));
  same(readExactSequence(memory, readContext(memory, wrapper.context).current).values.length, 1, "([[]]) keeps one R-valued form");
}

{
  const parent = parentContext(memory, rootI, marker6); const child = formalChild(parent, rootI, [A, colonUse, B]);
  const form = materializeExactSequence(memory, [sourceRole, colonUse, formRole]); const entryTemplate = memory.ensure(sourceRole, formRole);
  const colonRule = rule(memory, formalI, [sourceRole, formRole], materializeExactSequence(memory, [form, entryTemplate]));
  const entry = memory.ensure(A, B); const selectedAct = act(memory, formalI, colonRule, parent.context, [[sourceRole, A], [formRole, B]]);
  replayFormalClose(memory, evidence(child, parent, rootI, entry, colonRule, selectedAct));
}

const equalityForm = materializeExactSequence(memory, [leftRole, equalUse, rightRole]);
const equalityRule = rule(memory, formalI, [contextRole, leftRole, rightRole, leftRepRole, rightRepRole],
  materializeExactSequence(memory, [equalityForm, memory.root]));
function equalityEvidence(parent: TypedContext, context: LinkHandle, leftRep: LinkHandle, rightRep: LinkHandle) {
  const child = formalChild(parent, rootI, [A, equalUse, B]);
  const selectedAct = act(memory, formalI, equalityRule, parent.context, [[contextRole, context], [leftRole, A], [rightRole, B],
    [leftRepRole, leftRep], [rightRepRole, rightRep]]);
  return { ...evidence(child, parent, rootI, memory.root, equalityRule, selectedAct), resolutionContext: context,
    contextRole, leftRole, rightRole, leftRepresentativeRole: leftRepRole, rightRepresentativeRole: rightRepRole };
}
{
  const context = defineContext(memory, memory.root, marker7);
  defineLocalRepresentativeBinding(memory, context, A, representative); defineLocalRepresentativeBinding(memory, context, B, representative);
  const parent = parentContext(memory, rootI, marker7); const replayEvidence = equalityEvidence(parent, context, representative, representative);
  const before = memory.linkCount; replayFormalEquality(new ReplayProbe(memory), replayEvidence);
  same(memory.linkCount, before, "equality replay read-only");
  const distinct = defineContext(memory, memory.root, marker8);
  defineLocalRepresentativeBinding(memory, distinct, A, representative); defineLocalRepresentativeBinding(memory, distinct, B, otherRep);
  defineLocalRepresentativeBinding(memory, distinct, representative, otherRep); // no transitive closure in M5
  expectContextError("equality-distinguished", () => replayFormalEquality(memory,
    equalityEvidence(parentContext(memory, rootI, marker8), distinct, representative, otherRep)));
}

{
  const parent = parentContext(memory, rootI, marker9), otherParent = parentContext(memory, rootI, marker10);
  const child = formalChild(parent, rootI, [A]);
  const wrongParentAct = act(memory, formalI, oneRule, otherParent.context, [[valueRole, A]]);
  expectContextError("lexical-parent-mismatch", () => replayFormalClose(memory, evidence(child, otherParent, rootI, A, oneRule, wrongParentAct)));
  const correctAct = act(memory, formalI, oneRule, parent.context, [[valueRole, A]]);
  expectContextError("context-interpreter-mismatch", () => replayFormalClose(memory,
    { ...evidence(child, parent, rootI, A, oneRule, correctAct), expectedChildInterpreter: qI.structure }));
  expectContextError("context-interpreter-mismatch", () => continueFormalContext(memory, parent, qI.structure, A));
}

{
  const lexicalParent = defineContext(memory, memory.root, lexicalCurrent);
  const k0 = defineContext(memory, lexicalParent, run0), k1 = defineContext(memory, lexicalParent, run1), k2 = defineContext(memory, lexicalParent, run2);
  const roles = defineStructuralRoleDictionary(memory, [beforeRole, afterRole]);
  const a0 = defineActHeader(memory, formalI.handle, roles, k1); defineActField(memory, a0, beforeRole, k0); defineActField(memory, a0, afterRole, k1);
  const a1 = defineActHeader(memory, formalI.handle, roles, k2); defineActField(memory, a1, beforeRole, k1); defineActField(memory, a1, afterRole, k2);
  const r0 = memory.ensure(memory.root, a0), r1 = memory.ensure(r0, a1);
  same(replayRun(memory, { runRoot: r1, initialContext: k0, terminalContext: k2,
    steps: [{ act: a0, beforeRole, afterRole }, { act: a1, beforeRole, afterRole }] }).length, 2, "Run temporal order");
  same(readContext(memory, k0).parent, lexicalParent, "k0 lexical parent"); same(readContext(memory, k1).parent, lexicalParent, "k1 lexical parent");
  same(readContext(memory, k2).parent, lexicalParent, "k2 lexical parent");
}
