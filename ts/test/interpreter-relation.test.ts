import {
  InterpreterReplayError,
  replayRelationStep,
  replayRelationSubselectionStep,
  type RelationReplayEvidence,
  type RelationRoles,
} from "../src/interpreter.js";
import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  type SelectedSegmentSpec,
  type SourceFrontEndEvidence,
  type SourceSubselectionEvidence,
} from "../src/source.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import { defineContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  Memory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertSame<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectReplayError(effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof InterpreterReplayError, `expected InterpreterReplayError, got ${String(error)}`);
    assertSame(error.code, "invalid-relation-evidence", "relation error code");
    return;
  }
  throw new Error("expected InterpreterReplayError");
}

function anchors(memory: Memory, count: number): LinkHandle[] {
  const result: LinkHandle[] = [];
  let current = memory.root;
  for (let index = 0; index < count; index += 1) {
    current = memory.ensureStartSelfClosed(current);
    result.push(current);
  }
  return result;
}

function fold(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  let current = memory.root;
  for (const value of values) current = memory.ensure(current, value);
  return current;
}

function spec(
  start: number,
  end: number,
  form: LinkHandle,
  dictionaryOccurrence: LinkHandle,
): SelectedSegmentSpec {
  return Object.freeze({ start, end, form, dictionaryOccurrence });
}

interface SourceFixture {
  readonly evidence: SourceFrontEndEvidence;
  readonly byteRefs: readonly LinkHandle[];
}

function sourceFixture(
  memory: Memory,
  forms: readonly LinkHandle[],
): SourceFixture {
  const byteRefs = anchors(memory, 256);
  const [grammar, theory] = anchors(memory, 2);
  assert(byteRefs.length === 256 && grammar !== undefined && theory !== undefined, "source fixture refs");

  let history = memory.root;
  let dictionary = defineDictionaryScope(memory, memory.root, history);
  const occurrences: LinkHandle[] = [];
  const bytes = new Uint8Array(forms.length);
  for (let index = 0; index < forms.length; index += 1) {
    const form = forms[index];
    assert(form !== undefined, "source form");
    const value = 0x61 + index;
    bytes[index] = value;
    const effect = defineDictionaryEffect(
      memory,
      dictionary,
      memory.root,
      history,
      materializeSourceContent(memory, byteRefs, new Uint8Array([value])),
      form,
    );
    occurrences.push(effect.occurrence);
    history = effect.historyAfter;
    dictionary = effect.afterScope;
  }

  const source = defineSourceForm(memory, materializeSourceContent(memory, byteRefs, bytes));
  const evidence = buildSelectedSourceEvidence(
    memory,
    byteRefs,
    source,
    forms.map((form, index) => spec(index, index + 1, form, occurrences[index]!)),
    { dictionary, grammar, theory },
  );
  return Object.freeze({ evidence, byteRefs: Object.freeze(byteRefs) });
}

function relationRoles(memory: Memory): RelationRoles {
  const refs = anchors(memory, 11);
  assert(refs.length === 11, "relation role refs");
  return Object.freeze({
    source: refs[0]!,
    sourceSelection: refs[1]!,
    formSequence: refs[2]!,
    dictionary: refs[3]!,
    grammar: refs[4]!,
    theory: refs[5]!,
    form: refs[6]!,
    beforeContext: refs[7]!,
    binding: refs[8]!,
    result: refs[9]!,
    afterContext: refs[10]!,
  });
}

interface RelationActOptions {
  readonly sourceEvidence: SourceFrontEndEvidence;
  readonly selected: {
    readonly selectionSequence: LinkHandle;
    readonly formSequence: LinkHandle;
    readonly grammar: LinkHandle;
    readonly theory: LinkHandle;
    readonly form: LinkHandle;
  };
  readonly roles: RelationRoles;
  readonly interpreter: LinkHandle;
  readonly roleDictionary: LinkHandle;
  readonly beforeContext: LinkHandle;
  readonly binding: LinkHandle;
  readonly result: LinkHandle;
  readonly afterContext: LinkHandle;
  readonly headerInterpreter?: LinkHandle;
  readonly headerRoleDictionary?: LinkHandle;
  readonly headerAfterContext?: LinkHandle;
  readonly omitResult?: boolean;
  readonly extraResult?: LinkHandle;
}

function relationAct(memory: Memory, options: RelationActOptions): RelationReplayEvidence {
  const act = defineActHeader(
    memory,
    options.headerInterpreter ?? options.interpreter,
    options.headerRoleDictionary ?? options.roleDictionary,
    options.headerAfterContext ?? options.afterContext,
  );
  const fields: readonly [LinkHandle, LinkHandle][] = [
    [options.roles.source, options.sourceEvidence.source],
    [options.roles.sourceSelection, options.selected.selectionSequence],
    [options.roles.formSequence, options.selected.formSequence],
    [options.roles.dictionary, options.sourceEvidence.dictionary],
    [options.roles.grammar, options.selected.grammar],
    [options.roles.theory, options.selected.theory],
    [options.roles.form, options.selected.form],
    [options.roles.beforeContext, options.beforeContext],
    [options.roles.binding, options.binding],
    [options.roles.afterContext, options.afterContext],
  ];
  for (const [role, value] of fields) defineActField(memory, act, role, value);
  if (!options.omitResult) defineActField(memory, act, options.roles.result, options.result);
  if (options.extraResult !== undefined) defineActField(memory, act, options.roles.result, options.extraResult);
  return Object.freeze({
    sourceEvidence: options.sourceEvidence,
    act,
    roles: options.roles,
    interpreter: options.interpreter,
    roleDictionary: options.roleDictionary,
  });
}

function fullSelected(evidence: SourceFrontEndEvidence, form: LinkHandle) {
  return Object.freeze({
    selectionSequence: evidence.selectionSequence,
    formSequence: evidence.formSequence,
    grammar: evidence.grammar,
    theory: evidence.theory,
    form,
  });
}

class ReadOnlyProbe implements ReadMemory {
  outgoingCalls = 0;

  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("relation replay must not use find"); }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.outgoingCalls += 1;
    return this.source.outgoing(start);
  }
  incoming(): readonly LinkHandle[] { throw new Error("relation replay must not use incoming"); }
}

function validRelation(
  formFactory: (memory: Memory, fixed: LinkHandle) => LinkHandle,
  resultFactory: (memory: Memory, binding: LinkHandle, fixed: LinkHandle) => LinkHandle,
) {
  const memory = new Memory();
  const [fixed, parent, binding, interpreter, roleDictionary] = anchors(memory, 5);
  assert(fixed && parent && binding && interpreter && roleDictionary, "relation fixture refs");
  const form = formFactory(memory, fixed);
  const source = sourceFixture(memory, [form]);
  const roles = relationRoles(memory);
  const beforeContext = defineContext(memory, parent, binding);
  const result = resultFactory(memory, binding, fixed);
  const afterContext = defineContext(memory, parent, result);
  const evidence = relationAct(memory, {
    sourceEvidence: source.evidence,
    selected: fullSelected(source.evidence, form),
    roles,
    interpreter,
    roleDictionary,
    beforeContext,
    binding,
    result,
    afterContext,
  });
  const before = memory.linkCount;
  const probe = new ReadOnlyProbe(memory);
  assertSame(replayRelationStep(probe, source.byteRefs, evidence), result, "relation result");
  assertSame(memory.linkCount, before, "relation replay must be read-only");
  assert(probe.outgoingCalls > 0, "act fields must use indexed outgoing(act)");
  return { memory, source, roles, form, fixed, parent, binding, interpreter, roleDictionary, beforeContext, result, afterContext };
}

validRelation(
  (memory, fixed) => memory.ensureStartSelfClosed(fixed),
  (memory, binding, fixed) => memory.ensure(binding, fixed),
);
validRelation(
  (memory, fixed) => memory.ensureEndSelfClosed(fixed),
  (memory, binding, fixed) => memory.ensure(fixed, binding),
);

{
  const { memory, source, roles, form, parent, binding, interpreter, roleDictionary, beforeContext, afterContext } = validRelation(
    (target, fixed) => target.ensureStartSelfClosed(fixed),
    (target, selectedBinding, fixed) => target.ensure(selectedBinding, fixed),
  );
  const [other] = anchors(memory, 1);
  assert(other, "negative fixture ref");
  const wrongResult = memory.ensure(other, binding);
  const forged = relationAct(memory, {
    sourceEvidence: source.evidence,
    selected: fullSelected(source.evidence, form),
    roles,
    interpreter,
    roleDictionary,
    beforeContext,
    binding,
    result: wrongResult,
    afterContext,
  });
  expectReplayError(() => replayRelationStep(memory, source.byteRefs, forged));

  const wrongBinding = relationAct(memory, {
    sourceEvidence: source.evidence,
    selected: fullSelected(source.evidence, form),
    roles,
    interpreter,
    roleDictionary,
    beforeContext,
    binding: other,
    result: wrongResult,
    afterContext,
  });
  expectReplayError(() => replayRelationStep(memory, source.byteRefs, wrongBinding));

  const changedParentContext = defineContext(memory, other, wrongResult);
  const changedParent = relationAct(memory, {
    sourceEvidence: source.evidence,
    selected: fullSelected(source.evidence, form),
    roles,
    interpreter,
    roleDictionary,
    beforeContext,
    binding,
    result: wrongResult,
    afterContext: changedParentContext,
  });
  expectReplayError(() => replayRelationStep(memory, source.byteRefs, changedParent));

  for (const header of [
    { headerInterpreter: other },
    { headerRoleDictionary: other },
    { headerAfterContext: beforeContext },
  ]) {
    const forgedHeader = relationAct(memory, {
      sourceEvidence: source.evidence,
      selected: fullSelected(source.evidence, form),
      roles,
      interpreter,
      roleDictionary,
      beforeContext,
      binding,
      result: wrongResult,
      afterContext,
      ...header,
    });
    expectReplayError(() => replayRelationStep(memory, source.byteRefs, forgedHeader));
  }

  const missingResult = relationAct(memory, {
    sourceEvidence: source.evidence,
    selected: fullSelected(source.evidence, form),
    roles,
    interpreter,
    roleDictionary,
    beforeContext,
    binding,
    result: wrongResult,
    afterContext,
    omitResult: true,
  });
  expectReplayError(() => replayRelationStep(memory, source.byteRefs, missingResult));

  const secondResult = memory.ensure(binding, other);
  const multipleResult = relationAct(memory, {
    sourceEvidence: source.evidence,
    selected: fullSelected(source.evidence, form),
    roles,
    interpreter,
    roleDictionary,
    beforeContext,
    binding,
    result: wrongResult,
    afterContext,
    extraResult: secondResult,
  });
  expectReplayError(() => replayRelationStep(memory, source.byteRefs, multipleResult));

  const forgedSource: SourceFrontEndEvidence = Object.freeze({
    ...source.evidence,
    grammarMembership: memory.ensure(source.evidence.grammar, other),
  });
  expectReplayError(() => replayRelationStep(memory, source.byteRefs, Object.freeze({ ...forged, sourceEvidence: forgedSource })));

  // Keep the original fixture parent live in this block and prove no implicit context selection exists.
  assert(parent !== other, "explicit parent fixture must be distinct");
}

for (const makeForm of [
  (memory: Memory, left: LinkHandle, right: LinkHandle) => memory.ensure(left, right),
  (memory: Memory) => memory.root,
]) {
  const memory = new Memory();
  const [left, right, parent, binding, interpreter, roleDictionary] = anchors(memory, 6);
  assert(left && right && parent && binding && interpreter && roleDictionary, "invalid-form refs");
  const form = makeForm(memory, left, right);
  const source = sourceFixture(memory, [form]);
  const roles = relationRoles(memory);
  const beforeContext = defineContext(memory, parent, binding);
  const result = memory.ensure(binding, right);
  const afterContext = defineContext(memory, parent, result);
  const evidence = relationAct(memory, {
    sourceEvidence: source.evidence,
    selected: fullSelected(source.evidence, form),
    roles,
    interpreter,
    roleDictionary,
    beforeContext,
    binding,
    result,
    afterContext,
  });
  expectReplayError(() => replayRelationStep(memory, source.byteRefs, evidence));
}

{
  const memory = new Memory();
  const [fixed, otherForm, parent, binding, interpreter, roleDictionary] = anchors(memory, 6);
  assert(fixed && otherForm && parent && binding && interpreter && roleDictionary, "subselection refs");
  const form = memory.ensureStartSelfClosed(fixed);
  const source = sourceFixture(memory, [otherForm, form]);
  const roles = relationRoles(memory);
  const segment = source.evidence.segments[1]!;
  const selectionSequence = fold(memory, [segment.selection]);
  const formSequence = fold(memory, [form]);
  const subselection: SourceSubselectionEvidence = Object.freeze({
    startSegment: 1,
    endSegment: 2,
    selectionSequence,
    formSequence,
    grammar: source.evidence.grammar,
    theory: source.evidence.theory,
    grammarMembership: memory.ensure(source.evidence.grammar, formSequence),
    theoryMembership: memory.ensure(source.evidence.theory, formSequence),
  });
  const beforeContext = defineContext(memory, parent, binding);
  const result = memory.ensure(binding, fixed);
  const afterContext = defineContext(memory, parent, result);
  const evidence = relationAct(memory, {
    sourceEvidence: source.evidence,
    selected: { selectionSequence, formSequence, grammar: subselection.grammar, theory: subselection.theory, form },
    roles,
    interpreter,
    roleDictionary,
    beforeContext,
    binding,
    result,
    afterContext,
  });
  const before = memory.linkCount;
  assertSame(
    replayRelationSubselectionStep(memory, source.byteRefs, evidence, subselection),
    result,
    "single relation subselection",
  );
  assertSame(memory.linkCount, before, "subselection relation replay must be read-only");

  const all: SourceSubselectionEvidence = Object.freeze({
    startSegment: 0,
    endSegment: 2,
    selectionSequence: source.evidence.selectionSequence,
    formSequence: source.evidence.formSequence,
    grammar: source.evidence.grammar,
    theory: source.evidence.theory,
    grammarMembership: source.evidence.grammarMembership,
    theoryMembership: source.evidence.theoryMembership,
  });
  expectReplayError(() => replayRelationSubselectionStep(memory, source.byteRefs, evidence, all));

  const forged: SourceSubselectionEvidence = Object.freeze({
    ...subselection,
    formSequence: source.evidence.formSequence,
  });
  expectReplayError(() => replayRelationSubselectionStep(memory, source.byteRefs, evidence, forged));
}
