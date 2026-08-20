import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  readSourceContent,
  readSourceForm,
  replaySelectedSourceEvidence,
  SourceError,
  type SelectedSegmentSpec,
  type SourceFrontEndEvidence,
} from "../src/source.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import {
  Memory,
  ensureRootBasis,
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

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
  );
}

function expectSourceError(effect: () => unknown, code: SourceError["code"]): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof SourceError, `expected SourceError, got ${String(error)}`);
    assertSame(error.code, code, "source error code");
    return;
  }
  throw new Error(`expected SourceError(${code})`);
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

class ChainOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("source reads must not use find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("source reads must not use outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("source reads must not use incoming"); }
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const [nonByte, other] = anchors(memory, 2);
assert(nonByte !== undefined && other !== undefined, "fixture anchors must exist");

{
  const empty = materializeSourceContent(memory, new Uint8Array());
  assertSame(empty, memory.root, "empty source content must be root");
  const before = memory.linkCount;
  const read = readSourceContent(new ChainOnlyProbe(memory), basis, empty);
  assertDeepEqual(Array.from(read.bytes), [], "empty bytes");
  assertDeepEqual(read.prefixes, [memory.root], "empty prefixes");
  assertSame(memory.linkCount, before, "empty source read must not materialize");
}

const utf8 = new Uint8Array([0x61, 0xe2, 0x9f, 0xbc, 0x62]);
const content = materializeSourceContent(memory, utf8);
assertSame(
  materializeSourceContent(memory, new Uint8Array(utf8)),
  content,
  "equal bytes must reuse canonical content",
);

{
  const before = memory.linkCount;
  const read = readSourceContent(new ChainOnlyProbe(memory), basis, content);
  assertDeepEqual(Array.from(read.bytes), Array.from(utf8), "source bytes round-trip exactly");
  assertSame(read.prefixes[0], memory.root, "source prefixes start at root");
  assertSame(read.prefixes.at(-1), content, "source prefixes end at content");
  assertSame(read.prefixes.length, utf8.length + 1, "one prefix per byte boundary");
  assertSame(memory.linkCount, before, "source content read must not materialize");
}

const source = defineSourceForm(memory, content);
assertSame(defineSourceForm(memory, content), source, "same content must reuse canonical source form");
{
  const before = memory.linkCount;
  assertSame(readSourceForm(new ChainOnlyProbe(memory), source), content, "source form payload");
  assertSame(memory.linkCount, before, "source form read must not materialize");
}

const distinctContent = materializeSourceContent(memory, new Uint8Array([0x61, 0x62]));
const distinctSource = defineSourceForm(memory, distinctContent);
assert(distinctContent !== content, "different bytes must have different content");
assert(distinctSource !== source, "different content must have different source form");

const nonByteContent = memory.ensure(memory.root, nonByte);
expectSourceError(
  () => readSourceContent(memory, basis, nonByteContent),
  "invalid-source-content",
);

const cyclicContent = memory.ensureStartSelfClosed(other);
expectSourceError(
  () => readSourceContent(memory, basis, cyclicContent),
  "invalid-source-content",
);

const foreign = new Memory();
expectSourceError(
  () => readSourceContent(memory, basis, foreign.root),
  "invalid-source-content",
);
expectSourceError(
  () => defineSourceForm(memory, foreign.root),
  "invalid-source-content",
);

const ordinary = memory.ensure(nonByte, other);
expectSourceError(() => readSourceForm(memory, ordinary), "invalid-source");
expectSourceError(() => readSourceForm(memory, foreign.root), "invalid-source");

// Basis is carried evidence, therefore forged poles are rejected through the
// same narrow source-content error without expanding read capabilities.
expectSourceError(
  () => readSourceContent(memory, { ...basis, L: basis.U }, content),
  "invalid-source-content",
);

interface DictionaryFixture {
  readonly dictionary: LinkHandle;
  readonly occurrences: readonly LinkHandle[];
}

function dictionaryWith(
  target: Memory,
  mappings: readonly (readonly [Uint8Array, LinkHandle])[],
): DictionaryFixture {
  const root = target.root;
  let history = root;
  let dictionary = defineDictionaryScope(target, root, history);
  const occurrences: LinkHandle[] = [];
  for (const [bytes, form] of mappings) {
    const effect = defineDictionaryEffect(
      target,
      dictionary,
      root,
      history,
      materializeSourceContent(target, bytes),
      form,
    );
    occurrences.push(effect.occurrence);
    history = effect.historyAfter;
    dictionary = effect.afterScope;
  }
  return Object.freeze({ dictionary, occurrences: Object.freeze(occurrences) });
}

function spec(
  start: number,
  end: number,
  form: LinkHandle,
  dictionaryOccurrence: LinkHandle,
): SelectedSegmentSpec {
  return Object.freeze({ start, end, form, dictionaryOccurrence });
}

{
  const target = new Memory();
  const [formA, formArrow, formB, grammar, theory] = anchors(target, 5);
  assert(formA && formArrow && formB && grammar && theory, "front-end fixture refs");
  const raw = new Uint8Array([0x61, 0xe2, 0x9f, 0xbc, 0x62]);
  const sourceForm = defineSourceForm(target, materializeSourceContent(target, raw));
  const dictionary = dictionaryWith(target, [
    [new Uint8Array([0x61]), formA],
    [new Uint8Array([0xe2, 0x9f, 0xbc]), formArrow],
    [new Uint8Array([0x62]), formB],
  ]);
  const evidence = buildSelectedSourceEvidence(
    target,
    sourceForm,
    [
      spec(0, 1, formA, dictionary.occurrences[0]!),
      spec(1, 4, formArrow, dictionary.occurrences[1]!),
      spec(4, 5, formB, dictionary.occurrences[2]!),
    ],
    { dictionary: dictionary.dictionary, grammar, theory },
  );

  const before = target.linkCount;
  assertDeepEqual(
    replaySelectedSourceEvidence(new ChainOnlyProbe(target), evidence),
    [formA, formArrow, formB],
    "multibyte arrow is one caller-selected segment",
  );
  assertSame(target.linkCount, before, "front-end replay must be read-only");
  assertSame(evidence.segments[1]?.start, 1, "arrow start byte coordinate");
  assertSame(evidence.segments[1]?.end, 4, "arrow end byte coordinate");
}

{
  const target = new Memory();
  const [formOne, formTwo, grammar, theory] = anchors(target, 4);
  assert(formOne && formTwo && grammar && theory, "dictionary fixture refs");
  const raw = new Uint8Array([0x78]);
  const sourceForm = defineSourceForm(target, materializeSourceContent(target, raw));
  const one = dictionaryWith(target, [[raw, formOne]]);
  const two = dictionaryWith(target, [[raw, formTwo]]);
  const evidenceOne = buildSelectedSourceEvidence(
    target, sourceForm, [spec(0, 1, formOne, one.occurrences[0]!)],
    { dictionary: one.dictionary, grammar, theory },
  );
  const evidenceTwo = buildSelectedSourceEvidence(
    target, sourceForm, [spec(0, 1, formTwo, two.occurrences[0]!)],
    { dictionary: two.dictionary, grammar, theory },
  );
  assertSame(evidenceOne.content, evidenceTwo.content, "same bytes share content");
  assertSame(evidenceOne.source, evidenceTwo.source, "same bytes share source form");
  assertDeepEqual(replaySelectedSourceEvidence(target, evidenceOne), [formOne], "dictionary one");
  assertDeepEqual(replaySelectedSourceEvidence(target, evidenceTwo), [formTwo], "dictionary two");
}

{
  const target = new Memory();
  const [left, right, grammar, theory, unrelated] = anchors(target, 5);
  assert(left && right && grammar && theory && unrelated, "semantic form fixture refs");
  const existingForm = target.ensure(left, right);
  const raw = new Uint8Array([0x78]);
  const sourceForm = defineSourceForm(target, materializeSourceContent(target, raw));
  const dictionary = dictionaryWith(target, [[raw, existingForm]]);
  const evidence = buildSelectedSourceEvidence(
    target, sourceForm, [spec(0, 1, existingForm, dictionary.occurrences[0]!)],
    { dictionary: dictionary.dictionary, grammar, theory },
  );
  assertSame(replaySelectedSourceEvidence(target, evidence)[0], existingForm, "existing Link is direct resolved form");

  const forgedSpan = target.ensureStartSelfClosed(unrelated);
  const forgedSpanEvidence: SourceFrontEndEvidence = Object.freeze({
    ...evidence,
    segments: Object.freeze([
      Object.freeze({ ...evidence.segments[0]!, span: forgedSpan }),
    ]),
  });
  expectSourceError(
    () => replaySelectedSourceEvidence(target, forgedSpanEvidence),
    "invalid-source-evidence",
  );

  const forgedGrammar: SourceFrontEndEvidence = Object.freeze({
    ...evidence,
    grammarMembership: target.ensure(grammar, unrelated),
  });
  expectSourceError(
    () => replaySelectedSourceEvidence(target, forgedGrammar),
    "invalid-admission-evidence",
  );
}

{
  const target = new Memory();
  const [formA, formB, formAB, grammar, theory] = anchors(target, 5);
  assert(formA && formB && formAB && grammar && theory, "ambiguous fixture refs");
  const a = new Uint8Array([0x61]);
  const b = new Uint8Array([0x62]);
  const ab = new Uint8Array([0x61, 0x62]);
  const sourceForm = defineSourceForm(target, materializeSourceContent(target, ab));
  const dictionary = dictionaryWith(target, [[a, formA], [b, formB], [ab, formAB]]);
  const split = buildSelectedSourceEvidence(
    target, sourceForm,
    [spec(0, 1, formA, dictionary.occurrences[0]!), spec(1, 2, formB, dictionary.occurrences[1]!)],
    { dictionary: dictionary.dictionary, grammar, theory },
  );
  const whole = buildSelectedSourceEvidence(
    target, sourceForm,
    [spec(0, 2, formAB, dictionary.occurrences[2]!)],
    { dictionary: dictionary.dictionary, grammar, theory },
  );
  assertDeepEqual(replaySelectedSourceEvidence(target, split), [formA, formB], "split segmentation");
  assertDeepEqual(replaySelectedSourceEvidence(target, whole), [formAB], "whole segmentation");
}

{
  const target = new Memory();
  const [formX, formY, grammar, theory] = anchors(target, 4);
  assert(formX && formY && grammar && theory, "history fixture refs");
  const x = new Uint8Array([0x78]);
  const y = new Uint8Array([0x79]);
  const sourceForm = defineSourceForm(target, materializeSourceContent(target, x));
  const dictionary = dictionaryWith(target, [[x, formX], [y, formY]]);
  const evidence = buildSelectedSourceEvidence(
    target, sourceForm, [spec(0, 1, formX, dictionary.occurrences[0]!)],
    { dictionary: dictionary.dictionary, grammar, theory },
  );
  assertDeepEqual(replaySelectedSourceEvidence(target, evidence), [formX], "earlier visible occurrence remains valid");
}

{
  const target = new Memory();
  const [form, otherForm, grammar, theory] = anchors(target, 4);
  assert(form && otherForm && grammar && theory, "foreign dictionary fixture refs");
  const x = new Uint8Array([0x78]);
  const y = new Uint8Array([0x79]);
  const sourceForm = defineSourceForm(target, materializeSourceContent(target, x));
  const primary = dictionaryWith(target, [[x, form]]);
  const structurallyOther = dictionaryWith(target, [[y, otherForm], [x, form]]);
  const evidence = buildSelectedSourceEvidence(
    target,
    sourceForm,
    [spec(0, 1, form, structurallyOther.occurrences[1]!)],
    { dictionary: primary.dictionary, grammar, theory },
  );
  expectSourceError(
    () => replaySelectedSourceEvidence(target, evidence),
    "invalid-dictionary-evidence",
  );
}

{
  const target = new Memory();
  const [form, grammar, theory] = anchors(target, 3);
  assert(form && grammar && theory, "partition fixture refs");
  const ab = new Uint8Array([0x61, 0x62]);
  const sourceForm = defineSourceForm(target, materializeSourceContent(target, ab));
  const dictionary = dictionaryWith(target, [[new Uint8Array([0x62]), form]]);
  expectSourceError(
    () => buildSelectedSourceEvidence(
      target,
      sourceForm,
      [spec(1, 2, form, dictionary.occurrences[0]!)],
      { dictionary: dictionary.dictionary, grammar, theory },
    ),
    "invalid-selected-partition",
  );
}
