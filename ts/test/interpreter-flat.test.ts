import {
  InterpreterReplayError,
  replayFlatReading,
  replayFlatSubselectionContinuation,
  replayFlatSubselectionReading,
  type FlatReadingEvidence,
  type FlatReadingRoles,
} from "../src/interpreter.js";
import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  type SelectedSegmentSpec,
  type SourceFrontEndEvidence,
  type SourceSubselectionEvidence,
} from "../src/source.js";
import { defineDictionaryEffect, defineDictionaryScope } from "../src/dictionary.js";
import { defineContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import { Memory, type LinkHandle, type LinkPoles, type ReadMemory } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function reject(effect: () => unknown): void {
  try { effect(); }
  catch (error) {
    assert(error instanceof InterpreterReplayError, `expected InterpreterReplayError, got ${String(error)}`);
    same(error.code, "invalid-flat-evidence", "flat error code");
    return;
  }
  throw new Error("expected invalid-flat-evidence");
}
function anchors(memory: Memory, count: number): LinkHandle[] {
  const result: LinkHandle[] = [];
  let current = memory.root;
  for (let i = 0; i < count; i += 1) {
    current = memory.ensureStartSelfClosed(current);
    result.push(current);
  }
  return result;
}
function rootedFold(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  let current = memory.root;
  for (const value of values) current = memory.ensure(current, value);
  return current;
}
function leftFold(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  assert(values.length > 0, "left fold requires a value");
  let current = values[0]!;
  for (let i = 1; i < values.length; i += 1) current = memory.ensure(current, values[i]!);
  return current;
}
function continuedFold(memory: Memory, prefix: LinkHandle, values: readonly LinkHandle[]): LinkHandle {
  let current = prefix;
  for (const value of values) current = memory.ensure(current, value);
  return current;
}

interface SourceFixture {
  readonly evidence: SourceFrontEndEvidence;
  readonly byteRefs: readonly LinkHandle[];
}
function segment(start: number, form: LinkHandle, dictionaryOccurrence: LinkHandle): SelectedSegmentSpec {
  return Object.freeze({ start, end: start + 1, form, dictionaryOccurrence });
}
function sourceFixture(memory: Memory, forms: readonly LinkHandle[]): SourceFixture {
  const byteRefs = anchors(memory, 256);
  const [grammar, theory] = anchors(memory, 2);
  assert(grammar && theory, "source vocabulary");
  let history = memory.root;
  let dictionary = defineDictionaryScope(memory, memory.root, history);
  const specs: SelectedSegmentSpec[] = [];
  const bytes = new Uint8Array(forms.length);
  for (let i = 0; i < forms.length; i += 1) {
    const form = forms[i]!;
    const value = 0x61 + i;
    bytes[i] = value;
    const effect = defineDictionaryEffect(
      memory, dictionary, memory.root, history,
      materializeSourceContent(memory, byteRefs, new Uint8Array([value])), form,
    );
    specs.push(segment(i, form, effect.occurrence));
    history = effect.historyAfter;
    dictionary = effect.afterScope;
  }
  const source = defineSourceForm(memory, materializeSourceContent(memory, byteRefs, bytes));
  return Object.freeze({
    byteRefs: Object.freeze(byteRefs),
    evidence: buildSelectedSourceEvidence(
      memory, byteRefs, source, specs, { dictionary, grammar, theory },
    ),
  });
}

function roles(memory: Memory): FlatReadingRoles {
  const r = anchors(memory, 9);
  assert(r.length === 9, "flat role vocabulary");
  return Object.freeze({
    source: r[0]!, sourceSelection: r[1]!, formSequence: r[2]!, dictionary: r[3]!,
    grammar: r[4]!, theory: r[5]!, beforeContext: r[6]!, result: r[7]!, afterContext: r[8]!,
  });
}
interface Selected {
  readonly selectionSequence: LinkHandle;
  readonly formSequence: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
}
interface ActOptions {
  readonly sourceEvidence: SourceFrontEndEvidence;
  readonly selected: Selected;
  readonly roles: FlatReadingRoles;
  readonly interpreter: LinkHandle;
  readonly roleDictionary: LinkHandle;
  readonly beforeContext: LinkHandle;
  readonly result: LinkHandle;
  readonly afterContext: LinkHandle;
  readonly omitResult?: boolean;
  readonly extraResult?: LinkHandle;
  readonly headerAfterContext?: LinkHandle;
}
function act(memory: Memory, options: ActOptions): FlatReadingEvidence {
  const a = defineActHeader(
    memory, options.interpreter, options.roleDictionary,
    options.headerAfterContext ?? options.afterContext,
  );
  const fields: readonly [LinkHandle, LinkHandle][] = [
    [options.roles.source, options.sourceEvidence.source],
    [options.roles.sourceSelection, options.selected.selectionSequence],
    [options.roles.formSequence, options.selected.formSequence],
    [options.roles.dictionary, options.sourceEvidence.dictionary],
    [options.roles.grammar, options.selected.grammar],
    [options.roles.theory, options.selected.theory],
    [options.roles.beforeContext, options.beforeContext],
    [options.roles.afterContext, options.afterContext],
  ];
  for (const [role, value] of fields) defineActField(memory, a, role, value);
  if (!options.omitResult) defineActField(memory, a, options.roles.result, options.result);
  if (options.extraResult !== undefined) defineActField(memory, a, options.roles.result, options.extraResult);
  return Object.freeze({
    sourceEvidence: options.sourceEvidence, act: a, roles: options.roles,
    interpreter: options.interpreter, roleDictionary: options.roleDictionary,
  });
}
function full(evidence: SourceFrontEndEvidence): Selected { return evidence; }
function subselection(
  memory: Memory,
  evidence: SourceFrontEndEvidence,
  start: number,
  end: number,
  forms: readonly LinkHandle[],
): SourceSubselectionEvidence {
  const selectionSequence = rootedFold(
    memory, evidence.segments.slice(start, end).map((item) => item.selection),
  );
  const formSequence = rootedFold(memory, forms);
  return Object.freeze({
    startSegment: start, endSegment: end, selectionSequence, formSequence,
    grammar: evidence.grammar, theory: evidence.theory,
    grammarMembership: memory.ensure(evidence.grammar, formSequence),
    theoryMembership: memory.ensure(evidence.theory, formSequence),
  });
}

class Probe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("flat replay must not use find"); }
  outgoing(start: LinkHandle): readonly LinkHandle[] { return this.source.outgoing(start); }
  incoming(): readonly LinkHandle[] { throw new Error("flat replay must not use incoming"); }
}

function fullCase(formsCount: number) {
  const memory = new Memory();
  const refs = anchors(memory, Math.max(formsCount, 2) + 5);
  const forms = refs.slice(0, formsCount);
  const parent = refs[formsCount]!;
  const current = refs[formsCount + 1]!;
  const interpreter = refs[formsCount + 2]!;
  const roleDictionary = refs[formsCount + 3]!;
  assert(parent && current && interpreter && roleDictionary, "full fixture refs");
  const source = sourceFixture(memory, forms);
  const vocabulary = roles(memory);
  const beforeContext = defineContext(memory, parent, current);
  const result = forms.length === 0 ? memory.root : forms.length === 1 ? forms[0]! : leftFold(memory, forms);
  const afterContext = defineContext(memory, parent, result);
  const evidence = act(memory, {
    sourceEvidence: source.evidence, selected: full(source.evidence), roles: vocabulary,
    interpreter, roleDictionary, beforeContext, result, afterContext,
  });
  const before = memory.linkCount;
  same(replayFlatReading(new Probe(memory), source.byteRefs, evidence), result, `full flat ${formsCount}`);
  same(memory.linkCount, before, "full flat replay read-only");
  return {
    memory, source, vocabulary, forms, parent, current, interpreter, roleDictionary,
    beforeContext, result, afterContext, evidence,
  };
}

fullCase(0);
fullCase(1);
const pair = fullCase(2);

{
  const { memory, source, vocabulary, forms, parent, interpreter, roleDictionary, beforeContext } = pair;
  const [other, otherParent] = anchors(memory, 2);
  assert(other && otherParent && forms[0] && forms[1], "negative refs");
  const wrong = memory.ensure(forms[0], other);
  const wrongAfter = defineContext(memory, parent, wrong);
  const forged = act(memory, {
    sourceEvidence: source.evidence, selected: full(source.evidence), roles: vocabulary,
    interpreter, roleDictionary, beforeContext, result: wrong, afterContext: wrongAfter,
  });
  reject(() => replayFlatReading(memory, source.byteRefs, forged));

  const missing = act(memory, {
    sourceEvidence: source.evidence, selected: full(source.evidence), roles: vocabulary,
    interpreter, roleDictionary, beforeContext, result: wrong, afterContext: wrongAfter, omitResult: true,
  });
  reject(() => replayFlatReading(memory, source.byteRefs, missing));

  const multiple = act(memory, {
    sourceEvidence: source.evidence, selected: full(source.evidence), roles: vocabulary,
    interpreter, roleDictionary, beforeContext, result: pair.result, afterContext: pair.afterContext,
    extraResult: wrong,
  });
  reject(() => replayFlatReading(memory, source.byteRefs, multiple));

  const driftContext = defineContext(memory, otherParent, pair.result);
  const drift = act(memory, {
    sourceEvidence: source.evidence, selected: full(source.evidence), roles: vocabulary,
    interpreter, roleDictionary, beforeContext, result: pair.result, afterContext: driftContext,
  });
  reject(() => replayFlatReading(memory, source.byteRefs, drift));

  const wrongHeader = act(memory, {
    sourceEvidence: source.evidence, selected: full(source.evidence), roles: vocabulary,
    interpreter, roleDictionary, beforeContext, result: pair.result, afterContext: pair.afterContext,
    headerAfterContext: beforeContext,
  });
  reject(() => replayFlatReading(memory, source.byteRefs, wrongHeader));
}

{
  const { memory, source, vocabulary, forms, parent, interpreter, roleDictionary } = pair;
  const [prefix, other] = anchors(memory, 2);
  assert(prefix && other && forms[0] && forms[1], "subselection refs");
  const whole: SourceSubselectionEvidence = Object.freeze({
    startSegment: 0,
    endSegment: source.evidence.segments.length,
    selectionSequence: source.evidence.selectionSequence,
    formSequence: source.evidence.formSequence,
    grammar: source.evidence.grammar,
    theory: source.evidence.theory,
    grammarMembership: source.evidence.grammarMembership,
    theoryMembership: source.evidence.theoryMembership,
  });
  same(
    replayFlatSubselectionReading(memory, source.byteRefs, pair.evidence, whole),
    pair.result, "whole-range subselection equals full reading",
  );

  const beforeContext = defineContext(memory, parent, prefix);
  const continuationResult = continuedFold(memory, prefix, forms);
  const continuationAfter = defineContext(memory, parent, continuationResult);
  const continuationEvidence = act(memory, {
    sourceEvidence: source.evidence, selected: whole, roles: vocabulary,
    interpreter, roleDictionary, beforeContext, result: continuationResult, afterContext: continuationAfter,
  });
  const before = memory.linkCount;
  same(
    replayFlatSubselectionContinuation(new Probe(memory), source.byteRefs, continuationEvidence, whole),
    continuationResult, "continuation exact left fold",
  );
  same(memory.linkCount, before, "continuation read-only");

  const empty = subselection(memory, source.evidence, 1, 1, []);
  const emptyAfter = defineContext(memory, parent, prefix);
  const emptyEvidence = act(memory, {
    sourceEvidence: source.evidence, selected: empty, roles: vocabulary,
    interpreter, roleDictionary, beforeContext, result: prefix, afterContext: emptyAfter,
  });
  same(
    replayFlatSubselectionContinuation(memory, source.byteRefs, emptyEvidence, empty),
    prefix, "empty continuation returns prefix",
  );

  const forgedResult = memory.ensure(prefix, other);
  const forgedAfter = defineContext(memory, parent, forgedResult);
  const forged = act(memory, {
    sourceEvidence: source.evidence, selected: whole, roles: vocabulary,
    interpreter, roleDictionary, beforeContext, result: forgedResult, afterContext: forgedAfter,
  });
  reject(() => replayFlatSubselectionContinuation(memory, source.byteRefs, forged, whole));

  const forgedSelection: SourceSubselectionEvidence = Object.freeze({
    ...whole, formSequence: empty.formSequence,
  });
  reject(() => replayFlatSubselectionReading(memory, source.byteRefs, pair.evidence, forgedSelection));
}
