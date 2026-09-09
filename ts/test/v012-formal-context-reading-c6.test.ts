import {
  ContextIntegrationError,
  continueFormalContext,
  defineTypedContext,
  openFormalContext,
  replayFormalClose,
  type FormalCloseEvidence,
  type TypedContext,
} from "../src/context-integration.js";
import { defineDictionaryEffect, defineDictionaryScope } from "../src/dictionary.js";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  InterpreterReplayError,
  replayContextualReading,
  replayFlatReading,
  type ContextualReadingEvidence,
  type ContextualReadingRoles,
  type FlatReadingEvidence,
  type FlatReadingRoles,
} from "../src/interpreter.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  type SelectedSegmentSpec,
  type SourceFrontEndEvidence,
} from "../src/source.js";
import { defineContext, readContext } from "../src/state.js";
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
  if (!condition) throw new Error(`v0.12 C6a: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function vector(id: string, condition: boolean): void {
  assert(condition, `vector failed: ${id}`);
}
function contextError(code: ContextIntegrationError["code"], effect: () => unknown): boolean {
  try { effect(); }
  catch (error) {
    assert(error instanceof ContextIntegrationError, `expected ContextIntegrationError, got ${String(error)}`);
    same(error.code, code, "context error code");
    return true;
  }
  throw new Error(`v0.12 C6a: expected ContextIntegrationError(${code})`);
}
function ruleError(code: StructuralRuleError["code"], effect: () => unknown): boolean {
  try { effect(); }
  catch (error) {
    assert(error instanceof StructuralRuleError, `expected StructuralRuleError, got ${String(error)}`);
    same(error.code, code, "rule error code");
    return true;
  }
  throw new Error(`v0.12 C6a: expected StructuralRuleError(${code})`);
}
function replayError(effect: () => unknown): boolean {
  try { effect(); }
  catch (error) {
    assert(error instanceof InterpreterReplayError, `expected InterpreterReplayError, got ${String(error)}`);
    same(error.code, "invalid-flat-evidence", "contextual replay error code");
    return true;
  }
  throw new Error("v0.12 C6a: expected invalid-flat-evidence");
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
class Probe implements ReadMemory {
  outgoingCalls = 0;
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("C6a must not use find/ambient discovery"); }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.outgoingCalls += 1;
    return this.source.outgoing(start);
  }
  incoming(): readonly LinkHandle[] { throw new Error("C6a must not use incoming/parent discovery"); }
}

interface InterpreterFixture {
  readonly handle: LinkHandle;
  readonly structure: StructuralInterpreter;
}
interface RuleFixture {
  readonly roleDictionary: LinkHandle;
  readonly rule: LinkHandle;
  readonly admission: LinkHandle;
}
function interpreter(memory: Memory, dictionary: LinkHandle, grammar: LinkHandle, theory: LinkHandle): InterpreterFixture {
  const structure = Object.freeze({ dictionary, grammar, theory });
  return Object.freeze({ handle: defineStructuralInterpreter(memory, dictionary, grammar, theory), structure });
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
function structuralAct(
  memory: Memory,
  owner: InterpreterFixture,
  selected: RuleFixture,
  after: LinkHandle,
  fields: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  const value = defineActHeader(memory, owner.handle, selected.roleDictionary, after);
  for (const [roleRef, fieldValue] of fields) defineActField(memory, value, roleRef, fieldValue);
  return value;
}
function parentContext(memory: Memory, owner: InterpreterFixture, marker: LinkHandle): TypedContext {
  return defineTypedContext(memory, owner.handle, memory.root, materializeExactSequence(memory, [marker]));
}
function formalChild(
  memory: Memory,
  formal: InterpreterFixture,
  parent: TypedContext,
  parentOwner: InterpreterFixture,
  values: readonly LinkHandle[],
): TypedContext {
  let child = openFormalContext(memory, parent, parentOwner.structure, formal.handle);
  for (const value of values) child = continueFormalContext(memory, child, formal.structure, value);
  return child;
}
function closeEvidence(
  memory: Memory,
  formal: InterpreterFixture,
  child: TypedContext,
  parent: TypedContext,
  parentOwner: InterpreterFixture,
  result: LinkHandle,
  selected: RuleFixture,
  selectedAct: LinkHandle,
): FormalCloseEvidence {
  return Object.freeze({
    child,
    parentBefore: parent,
    expectedChildInterpreter: formal.structure,
    expectedParentInterpreter: parentOwner.structure,
    result,
    ruleReplay: Object.freeze({
      act: selectedAct,
      rule: selected.rule,
      ruleAdmission: selected.admission,
      claimedBody: materializeExactSequence(memory, [readContext(memory, child.context).current, result]),
      expectedInterpreter: formal.structure,
      expectedAfterContext: parent.context,
    }),
  });
}

// A. Parentheses are an explicit FORMAL child transition, including empty fail-closed.
{
  const memory = new Memory();
  const pool = anchors(memory, 24);
  let cursor = 0;
  const next = (name: string): LinkHandle => {
    const value = pool[cursor++];
    assert(value !== undefined, `missing ${name}`);
    return value;
  };
  const rootI = interpreter(memory, next("root-D"), next("root-G"), next("root-T"));
  const formalI = interpreter(memory, next("formal-D"), next("formal-G"), next("formal-T"));
  const marker = next("parent-marker"), A = next("A"), valueRole = next("value-role");
  assert(rootI.handle !== formalI.handle, "FORMAL interpreter must be explicit and distinct");

  const oneForm = materializeExactSequence(memory, [valueRole]);
  const oneRule = rule(memory, formalI, [valueRole], materializeExactSequence(memory, [oneForm, valueRole]));
  const parent = parentContext(memory, rootI, marker);
  const opened = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  const openedState = readContext(memory, opened.context);
  vector("v012-formal-parentheses-open-formal-child",
    opened.interpreter === formalI.handle && openedState.parent === parent.context && openedState.current === memory.root);

  const child = continueFormalContext(memory, opened, formalI.structure, A);
  const selectedAct = structuralAct(memory, formalI, oneRule, parent.context, [[valueRole, A]]);
  const evidence = closeEvidence(memory, formalI, child, parent, rootI, A, oneRule, selectedAct);
  const parentBefore = readContext(memory, parent.context);
  const before = memory.linkCount;
  const probe = new Probe(memory);
  same(replayFormalClose(probe, evidence).result, A, "non-empty FORMAL close result");
  same(memory.linkCount, before, "FORMAL close replay is read-only");
  same(readContext(memory, parent.context).current, parentBefore.current, "child close does not continue parent");
  const continued = continueFormalContext(memory, parent, rootI.structure, A);
  const parentValues = readExactSequence(memory, readContext(memory, continued.context).current).values;
  vector("v012-formal-parent-continues-after-child-result",
    parentValues.length === 2 && parentValues[1] === A && probe.outgoingCalls > 0);

  const empty = openFormalContext(memory, parent, rootI.structure, formalI.handle);
  const rejected = contextError("empty-formal-context", () =>
    replayFormalClose(memory, closeEvidence(memory, formalI, empty, parent, rootI, A, oneRule, selectedAct))
  );
  vector("v012-formal-empty-parentheses-fail-closed", rejected);
  vector("v012-formal-empty-parentheses-are-not-a-valid-result", rejected && readContext(memory, empty.context).current === memory.root);
}

interface DictionaryFixture {
  readonly dictionary: LinkHandle;
  readonly occurrence: LinkHandle;
}
function oneEntryDictionary(memory: Memory, sourceContent: LinkHandle, form: LinkHandle): DictionaryFixture {
  const before = defineDictionaryScope(memory, memory.root, memory.root);
  const effect = defineDictionaryEffect(memory, before, memory.root, memory.root, sourceContent, form);
  return Object.freeze({ dictionary: effect.afterScope, occurrence: effect.occurrence });
}
function dotSource(
  memory: Memory,
  form: LinkHandle,
  dictionary: DictionaryFixture,
  grammar: LinkHandle,
  theory: LinkHandle,
): SourceFrontEndEvidence {
  const content = materializeSourceContent(memory, new Uint8Array([0x2e]));
  const source = defineSourceForm(memory, content);
  const specs: readonly SelectedSegmentSpec[] = Object.freeze([
    Object.freeze({ start: 0, end: 1, form, dictionaryOccurrence: dictionary.occurrence }),
  ]);
  return buildSelectedSourceEvidence(memory, source, specs, { dictionary: dictionary.dictionary, grammar, theory });
}
function contextualRoles(memory: Memory): ContextualReadingRoles {
  const values = anchors(memory, 10);
  return Object.freeze({
    source: values[0]!, sourceSelection: values[1]!, formSequence: values[2]!, dictionary: values[3]!,
    grammar: values[4]!, theory: values[5]!, beforeContext: values[6]!, contextualRole: values[7]!,
    result: values[8]!, afterContext: values[9]!,
  });
}
function contextualRoleList(value: ContextualReadingRoles): readonly LinkHandle[] {
  return Object.freeze([
    value.source, value.sourceSelection, value.formSequence, value.dictionary, value.grammar,
    value.theory, value.beforeContext, value.contextualRole, value.result, value.afterContext,
  ]);
}
function contextualAct(
  memory: Memory,
  source: SourceFrontEndEvidence,
  vocabulary: ContextualReadingRoles,
  contextualRole: LinkHandle,
  beforeContext: LinkHandle,
  result: LinkHandle,
  afterContext: LinkHandle,
): ContextualReadingEvidence {
  const interpreterRef = defineStructuralInterpreter(memory, source.dictionary, source.grammar, source.theory);
  const roleDictionary = defineStructuralRoleDictionary(memory, contextualRoleList(vocabulary));
  const act = defineActHeader(memory, interpreterRef, roleDictionary, afterContext);
  const fields: readonly [LinkHandle, LinkHandle][] = [
    [vocabulary.source, source.source], [vocabulary.sourceSelection, source.selectionSequence],
    [vocabulary.formSequence, source.formSequence], [vocabulary.dictionary, source.dictionary],
    [vocabulary.grammar, source.grammar], [vocabulary.theory, source.theory],
    [vocabulary.beforeContext, beforeContext], [vocabulary.contextualRole, contextualRole],
    [vocabulary.result, result], [vocabulary.afterContext, afterContext],
  ];
  for (const [roleRef, fieldValue] of fields) defineActField(memory, act, roleRef, fieldValue);
  return Object.freeze({ sourceEvidence: source, act, roles: vocabulary, interpreter: interpreterRef, roleDictionary });
}

// B. Contextual dot resolves only through the K explicitly carried by Act evidence.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const pool = anchors(memory, 20);
  const dotRole = pool[0]!, A = pool[1]!, B = pool[2]!, grammar = pool[3]!, theory = pool[4]!;
  assert(A !== B, "outer and inner current must differ");
  assert(dotRole !== memory.ensure(basis.L, basis.R), "contextual role is not DotMeaning");
  const dotContent = materializeSourceContent(memory, new Uint8Array([0x2e]));
  const dictionary = oneEntryDictionary(memory, dotContent, dotRole);
  const source = dotSource(memory, dotRole, dictionary, grammar, theory);
  const vocabulary = contextualRoles(memory);
  const outerContext = defineContext(memory, memory.root, A);
  const innerContext = defineContext(memory, outerContext, B);
  same(readContext(memory, outerContext).current, A, "outer current");
  same(readContext(memory, innerContext).parent, outerContext, "inner parent is explicit outer K");
  same(readContext(memory, innerContext).current, B, "inner current");

  const probe = new Probe(memory);
  const outerEvidence = contextualAct(memory, source, vocabulary, dotRole, outerContext, A, outerContext);
  const innerEvidence = contextualAct(memory, source, vocabulary, dotRole, innerContext, B, innerContext);
  const before = memory.linkCount;
  const outerResult = replayContextualReading(probe, outerEvidence);
  const innerResult = replayContextualReading(probe, innerEvidence);
  same(memory.linkCount, before, "explicit-K contextual replays are read-only");
  vector("v012-formal-contextual-dot-uses-explicit-selected-k", outerResult === A && innerResult === B);

  const forgedAfter = defineContext(memory, memory.root, B);
  const wrongAuthority = contextualAct(memory, source, vocabulary, dotRole, outerContext, B, forgedAfter);
  const wrongRejected = replayError(() => replayContextualReading(new Probe(memory), wrongAuthority));
  assert(wrongRejected, "outer K claiming inner current must reject");

  const parentI = interpreter(memory, pool[5]!, pool[6]!, pool[7]!);
  const formalI = interpreter(memory, pool[8]!, pool[9]!, pool[10]!);
  const typedInner = defineTypedContext(memory, parentI.handle, outerContext, B);
  same(typedInner.context, innerContext, "typed inner context reuses exact K_inner");
  const child = openFormalContext(memory, typedInner, parentI.structure, formalI.handle);
  same(readContext(memory, child.context).parent, innerContext, "FORMAL child has explicit K_inner parent");
  const afterChild = replayContextualReading(new Probe(memory), outerEvidence);
  vector("v012-child-creation-does-not-auto-select-contextual-k", afterChild === A);
  vector("v012-nearest-lexical-frame-is-not-semantic-authority", afterChild === A && wrongRejected);
  vector("v012-ambient-current-is-not-semantic-authority", outerResult === A && innerResult === B && wrongRejected);
  vector("v012-hidden-parent-traversal-is-not-semantic-authority", afterChild === A && probe.outgoingCalls > 0);
}

function flatRoles(memory: Memory): FlatReadingRoles {
  const values = anchors(memory, 9);
  return Object.freeze({
    source: values[0]!, sourceSelection: values[1]!, formSequence: values[2]!, dictionary: values[3]!,
    grammar: values[4]!, theory: values[5]!, beforeContext: values[6]!, result: values[7]!, afterContext: values[8]!,
  });
}
function flatSource(memory: Memory, forms: readonly LinkHandle[]): SourceFrontEndEvidence {
  const [grammar, theory] = anchors(memory, 2);
  assert(grammar !== undefined && theory !== undefined, "flat source vocabulary");
  let history = memory.root;
  let dictionary = defineDictionaryScope(memory, memory.root, history);
  const specs: SelectedSegmentSpec[] = [];
  const bytes = new Uint8Array(forms.length);
  for (let index = 0; index < forms.length; index += 1) {
    const byte = 0x61 + index;
    bytes[index] = byte;
    const content = materializeSourceContent(memory, new Uint8Array([byte]));
    const effect = defineDictionaryEffect(memory, dictionary, memory.root, history, content, forms[index]!);
    specs.push(Object.freeze({ start: index, end: index + 1, form: forms[index]!, dictionaryOccurrence: effect.occurrence }));
    history = effect.historyAfter;
    dictionary = effect.afterScope;
  }
  const source = defineSourceForm(memory, materializeSourceContent(memory, bytes));
  return buildSelectedSourceEvidence(memory, source, specs, { dictionary, grammar, theory });
}
function flatAct(
  memory: Memory,
  source: SourceFrontEndEvidence,
  vocabulary: FlatReadingRoles,
  beforeContext: LinkHandle,
  result: LinkHandle,
  afterContext: LinkHandle,
): FlatReadingEvidence {
  const interpreterRef = defineStructuralInterpreter(memory, source.dictionary, source.grammar, source.theory);
  const roleDictionary = defineStructuralRoleDictionary(memory, [
    vocabulary.source, vocabulary.sourceSelection, vocabulary.formSequence, vocabulary.dictionary,
    vocabulary.grammar, vocabulary.theory, vocabulary.beforeContext, vocabulary.result, vocabulary.afterContext,
  ]);
  const act = defineActHeader(memory, interpreterRef, roleDictionary, afterContext);
  const fields: readonly [LinkHandle, LinkHandle][] = [
    [vocabulary.source, source.source], [vocabulary.sourceSelection, source.selectionSequence],
    [vocabulary.formSequence, source.formSequence], [vocabulary.dictionary, source.dictionary],
    [vocabulary.grammar, source.grammar], [vocabulary.theory, source.theory],
    [vocabulary.beforeContext, beforeContext], [vocabulary.result, result], [vocabulary.afterContext, afterContext],
  ];
  for (const [roleRef, fieldValue] of fields) defineActField(memory, act, roleRef, fieldValue);
  return Object.freeze({ sourceEvidence: source, act, roles: vocabulary, interpreter: interpreterRef, roleDictionary });
}

// C. Generic left reading and FORMAL grammar are separate evidence paths.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const pool = anchors(memory, 40);
  const A = pool[0]!, B = pool[1]!, C = pool[2]!, parentAnchor = pool[3]!, currentAnchor = pool[4]!;
  const source = flatSource(memory, [A, B, C]);
  const vocabulary = flatRoles(memory);
  const AB = memory.ensure(A, B);
  const ABC = memory.ensure(AB, C);
  const beforeContext = defineContext(memory, parentAnchor, currentAnchor);
  const afterContext = defineContext(memory, parentAnchor, ABC);
  const evidence = flatAct(memory, source, vocabulary, beforeContext, ABC, afterContext);
  const before = memory.linkCount;
  const flatResult = replayFlatReading(new Probe(memory), evidence);
  same(memory.linkCount, before, "generic flat replay is read-only");
  same(flatResult, ABC, "generic [A,B,C] is explicit left fold");

  const rootI = interpreter(memory, pool[5]!, pool[6]!, pool[7]!);
  const formalI = interpreter(memory, pool[8]!, pool[9]!, pool[10]!);
  const arrowCarrier = pool[11]!, arrowUse = memory.ensure(arrowCarrier, basis.L);
  const leftRole = pool[12]!, rightRole = pool[13]!;
  const relationForm = materializeExactSequence(memory, [leftRole, arrowUse, rightRole]);
  const relationRule = rule(
    memory,
    formalI,
    [leftRole, rightRole],
    materializeExactSequence(memory, [relationForm, memory.ensure(leftRole, rightRole)]),
  );
  const relation = (parent: TypedContext, parentOwner: InterpreterFixture, left: LinkHandle, right: LinkHandle): LinkHandle => {
    const child = formalChild(memory, formalI, parent, parentOwner, [left, arrowUse, right]);
    const result = memory.ensure(left, right);
    const selectedAct = structuralAct(memory, formalI, relationRule, parent.context, [[leftRole, left], [rightRole, right]]);
    same(
      replayFormalClose(new Probe(memory), closeEvidence(memory, formalI, child, parent, parentOwner, result, relationRule, selectedAct)).result,
      result,
      "nested FORMAL relation result",
    );
    return result;
  };

  const bareParent = parentContext(memory, rootI, pool[14]!);
  const bare = formalChild(memory, formalI, bareParent, rootI, [A, arrowUse, B, arrowUse, C]);
  const bareAct = structuralAct(memory, formalI, relationRule, bareParent.context, [[leftRole, A], [rightRole, B]]);
  const bareRejected = ruleError("template-mismatch", () =>
    replayFormalClose(
      memory,
      closeEvidence(memory, formalI, bare, bareParent, rootI, ABC, relationRule, bareAct),
    )
  );

  const rightParent = parentContext(memory, rootI, pool[15]!);
  let rightOuter = formalChild(memory, formalI, rightParent, rootI, [A, arrowUse]);
  const BC = relation(rightOuter, formalI, B, C);
  rightOuter = continueFormalContext(memory, rightOuter, formalI.structure, BC);
  const rightNested = memory.ensure(A, BC);
  replayFormalClose(
    memory,
    closeEvidence(
      memory, formalI, rightOuter, rightParent, rootI, rightNested, relationRule,
      structuralAct(memory, formalI, relationRule, rightParent.context, [[leftRole, A], [rightRole, BC]]),
    ),
  );

  const leftParent = parentContext(memory, rootI, pool[16]!);
  let leftOuter = openFormalContext(memory, leftParent, rootI.structure, formalI.handle);
  const nestedAB = relation(leftOuter, formalI, A, B);
  leftOuter = continueFormalContext(memory, leftOuter, formalI.structure, nestedAB);
  leftOuter = continueFormalContext(memory, leftOuter, formalI.structure, arrowUse);
  leftOuter = continueFormalContext(memory, leftOuter, formalI.structure, C);
  const leftNested = memory.ensure(nestedAB, C);
  replayFormalClose(
    memory,
    closeEvidence(
      memory, formalI, leftOuter, leftParent, rootI, leftNested, relationRule,
      structuralAct(memory, formalI, relationRule, leftParent.context, [[leftRole, nestedAB], [rightRole, C]]),
    ),
  );

  vector("v012-link-left-association-is-not-formal-grammar", leftNested !== rightNested && leftNested === ABC);
  vector("v012-generic-flat-reader-is-not-formal-grammar", flatResult === leftNested && bareRejected);
}
