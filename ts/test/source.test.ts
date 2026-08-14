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
const vocabularyAndFixtures = anchors(memory, 260);
const byteRefs = vocabularyAndFixtures.slice(0, 256);
const nonByte = vocabularyAndFixtures[256];
const other = vocabularyAndFixtures[257];
assert(byteRefs.length === 256 && nonByte !== undefined && other !== undefined, "fixture anchors must exist");

{
  const before = memory.linkCount;
  const empty = materializeSourceContent(memory, byteRefs, new Uint8Array());
  assertSame(empty, memory.root, "empty source content must be root");
  const read = readSourceContent(new ChainOnlyProbe(memory), byteRefs, empty);
  assertDeepEqual(Array.from(read.bytes), [], "empty bytes");
  assertDeepEqual(read.prefixes, [memory.root], "empty prefixes");
  assertSame(memory.linkCount, before, "empty source read must not materialize");
}

const utf8 = new Uint8Array([0x61, 0xe2, 0x9f, 0xbc, 0x62]);
const content = materializeSourceContent(memory, byteRefs, utf8);
assertSame(
  materializeSourceContent(memory, byteRefs, new Uint8Array(utf8)),
  content,
  "equal bytes must reuse canonical content",
);

{
  const before = memory.linkCount;
  const read = readSourceContent(new ChainOnlyProbe(memory), byteRefs, content);
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

const distinctContent = materializeSourceContent(memory, byteRefs, new Uint8Array([0x61, 0x62]));
const distinctSource = defineSourceForm(memory, distinctContent);
assert(distinctContent !== content, "different bytes must have different content");
assert(distinctSource !== source, "different content must have different source form");

const nonByteContent = memory.ensure(memory.root, nonByte);
expectSourceError(
  () => readSourceContent(memory, byteRefs, nonByteContent),
  "invalid-source-content",
);

const cyclicContent = memory.ensureStartSelfClosed(other);
expectSourceError(
  () => readSourceContent(memory, byteRefs, cyclicContent),
  "invalid-source-content",
);

const foreign = new Memory();
expectSourceError(
  () => readSourceContent(memory, byteRefs, foreign.root),
  "invalid-source-content",
);
expectSourceError(
  () => defineSourceForm(memory, foreign.root),
  "invalid-source-content",
);

const ordinary = memory.ensure(nonByte, other);
expectSourceError(() => readSourceForm(memory, ordinary), "invalid-source");
expectSourceError(() => readSourceForm(memory, foreign.root), "invalid-source");

expectSourceError(
  () => materializeSourceContent(memory, byteRefs.slice(0, 255), new Uint8Array([0])),
  "invalid-byte-vocabulary",
);
const duplicatedVocabulary = [...byteRefs];
duplicatedVocabulary[255] = duplicatedVocabulary[0]!;
expectSourceError(
  () => readSourceContent(memory, duplicatedVocabulary, content),
  "invalid-byte-vocabulary",
);
const foreignVocabulary = [...byteRefs];
foreignVocabulary[255] = foreign.root;
expectSourceError(
  () => readSourceContent(memory, foreignVocabulary, content),
  "invalid-byte-vocabulary",
);

interface DictionaryFixture {
  readonly dictionary: LinkHandle;
  readonly occurrences: readonly LinkHandle[];
}

function dictionaryWith(
  target: Memory,
  vocabulary: readonly LinkHandle[],
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
      materializeSourceContent(target, vocabulary, bytes),
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
  const refs = anchors(target, 264);
  const bytes = refs.slice(0, 256);
  const [formA, formArrow, formB, grammar, theory] = refs.slice(256, 261);
  assert(
    bytes.length === 256 && formA !== undefined && formArrow !== undefined &&
    formB !== undefined && grammar !== undefined && theory !== undefined,
    "front-end fixture refs",
  );
  const raw = new Uint8Array([0x61, 0xe2, 0x9f, 0xbc, 0x62]);
  const sourceForm = defineSourceForm(target, materializeSourceContent(target, bytes, raw));
  const dictionary = dictionaryWith(target, bytes, [
    [new Uint8Array([0x61]), formA],
    [new Uint8Array([0xe2, 0x9f, 0xbc]), formArrow],
    [new Uint8Array([0x62]), formB],
  ]);
  const evidence = buildSelectedSourceEvidence(
    target,
    bytes,
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
    replaySelectedSourceEvidence(new ChainOnlyProbe(target), bytes, evidence),
    [formA, formArrow, formB],
    "multibyte arrow is one caller-selected segment",
  );
  assertSame(target.linkCount, before, "front-end replay must be read-only");
  assertSame(evidence.segments[1]?.start, 1, "arrow start byte coordinate");
  assertSame(evidence.segments[1]?.end, 4, "arrow end byte coordinate");
}

{
  const target = new Memory();
  const refs = anchors(target, 262);
  const bytes = refs.slice(0, 256);
  const [formOne, formTwo, grammar, theory] = refs.slice(256, 260);
  assert(bytes.length === 256 && formOne && formTwo && grammar && theory, "dictionary fixture refs");
  const raw = new Uint8Array([0x78]);
  const sourceForm = defineSourceForm(target, materializeSourceContent(target, bytes, raw));
  const one = dictionaryWith(target, bytes, [[raw, formOne]]);
  const two = dictionaryWith(target, bytes, [[raw, formTwo]]);
  const evidenceOne = buildSelectedSourceEvidence(
    target, bytes, sourceForm, [spec(0, 1, formOne, one.occurrences[0]!)],
    { dictionary: one.dictionary, grammar, theory },
  );
  const evidenceTwo = buildSelectedSourceEvidence(
    target, bytes, sourceForm, [spec(0, 1, formTwo, two.occurrences[0]!)],
    { dictionary: two.dictionary, grammar, theory },
  );
  assertSame(evidenceOne.content, evidenceTwo.content, "same bytes share content");
  assertSame(evidenceOne.source, evidenceTwo.source, "same bytes share source form");
  assertDeepEqual(replaySelectedSourceEvidence(target, bytes, evidenceOne), [formOne], "dictionary one");
  assertDeepEqual(replaySelectedSourceEvidence(target, bytes, evidenceTwo), [formTwo], "dictionary two");
}

{
  const target = new Memory();
  const refs = anchors(target, 265);
  const bytes = refs.slice(0, 256);
  const [left, right, grammar, theory, unrelated] = refs.slice(256, 261);
  assert(bytes.length === 256 && left && right && grammar && theory && unrelated, "semantic form fixture refs");
  const existingForm = target.ensure(left, right);
  const raw = new Uint8Array([0x78]);
  const sourceForm = defineSourceForm(target, materializeSourceContent(target, bytes, raw));
  const dictionary = dictionaryWith(target, bytes, [[raw, existingForm]]);
  const evidence = buildSelectedSourceEvidence(
    target, bytes, sourceForm, [spec(0, 1, existingForm, dictionary.occurrences[0]!)],
    { dictionary: dictionary.dictionary, grammar, theory },
  );
  assertSame(replaySelectedSourceEvidence(target, bytes, evidence)[0], existingForm, "existing Link is direct resolved form");

  const forgedSpan = target.ensureStartSelfClosed(unrelated);
  const forgedSpanEvidence: SourceFrontEndEvidence = Object.freeze({
    ...evidence,
    segments: Object.freeze([
      Object.freeze({ ...evidence.segments[0]!, span: forgedSpan }),
    ]),
  });
  expectSourceError(
    () => replaySelectedSourceEvidence(target, bytes, forgedSpanEvidence),
    "invalid-source-evidence",
  );

  const forgedGrammar: SourceFrontEndEvidence = Object.freeze({
    ...evidence,
    grammarMembership: target.ensure(grammar, unrelated),
  });
  expectSourceError(
    () => replaySelectedSourceEvidence(target, bytes, forgedGrammar),
    "invalid-admission-evidence",
  );
}

{
  const target = new Memory();
  const refs = anchors(target, 264);
  const bytes = refs.slice(0, 256);
  const [formA, formB, formAB, grammar, theory] = refs.slice(256, 261);
  assert(bytes.length === 256 && formA && formB && formAB && grammar && theory, "ambiguous fixture refs");
  const a = new Uint8Array([0x61]);
  const b = new Uint8Array([0x62]);
  const ab = new Uint8Array([0x61, 0x62]);
  const sourceForm = defineSourceForm(target, materializeSourceContent(target, bytes, ab));
  const dictionary = dictionaryWith(target, bytes, [[a, formA], [b, formB], [ab, formAB]]);
  const split = buildSelectedSourceEvidence(
    target, bytes, sourceForm,
    [spec(0, 1, formA, dictionary.occurrences[0]!), spec(1, 2, formB, dictionary.occurrences[1]!)],
    { dictionary: dictionary.dictionary, grammar, theory },
  );
  const whole = buildSelectedSourceEvidence(
    target, bytes, sourceForm,
    [spec(0, 2, formAB, dictionary.occurrences[2]!)],
    { dictionary: dictionary.dictionary, grammar, theory },
  );
  assertDeepEqual(replaySelectedSourceEvidence(target, bytes, split), [formA, formB], "split segmentation");
  assertDeepEqual(replaySelectedSourceEvidence(target, bytes, whole), [formAB], "whole segmentation");
}

{
  const target = new Memory();
  const refs = anchors(target, 264);
  const bytes = refs.slice(0, 256);
  const [formX, formY, grammar, theory] = refs.slice(256, 260);
  assert(bytes.length === 256 && formX && formY && grammar && theory, "history fixture refs");
  const x = new Uint8Array([0x78]);
  const y = new Uint8Array([0x79]);
  const sourceForm = defineSourceForm(target, materializeSourceContent(target, bytes, x));
  const dictionary = dictionaryWith(target, bytes, [[x, formX], [y, formY]]);
  const evidence = buildSelectedSourceEvidence(
    target, bytes, sourceForm, [spec(0, 1, formX, dictionary.occurrences[0]!)],
    { dictionary: dictionary.dictionary, grammar, theory },
  );
  assertDeepEqual(replaySelectedSourceEvidence(target, bytes, evidence), [formX], "earlier visible occurrence remains valid");
}

{
  const target = new Memory();
  const refs = anchors(target, 266);
  const bytes = refs.slice(0, 256);
  const [form, otherForm, grammar, theory] = refs.slice(256, 260);
  assert(bytes.length === 256 && form && otherForm && grammar && theory, "foreign dictionary fixture refs");
  const x = new Uint8Array([0x78]);
  const y = new Uint8Array([0x79]);
  const sourceForm = defineSourceForm(target, materializeSourceContent(target, bytes, x));
  const primary = dictionaryWith(target, bytes, [[x, form]]);
  const structurallyOther = dictionaryWith(target, bytes, [[y, otherForm], [x, form]]);
  const evidence = buildSelectedSourceEvidence(
    target,
    bytes,
    sourceForm,
    [spec(0, 1, form, structurallyOther.occurrences[1]!)],
    { dictionary: primary.dictionary, grammar, theory },
  );
  expectSourceError(
    () => replaySelectedSourceEvidence(target, bytes, evidence),
    "invalid-dictionary-evidence",
  );
}

{
  const target = new Memory();
  const refs = anchors(target, 260);
  const bytes = refs.slice(0, 256);
  const [form, grammar, theory] = refs.slice(256, 259);
  assert(bytes.length === 256 && form && grammar && theory, "partition fixture refs");
  const ab = new Uint8Array([0x61, 0x62]);
  const sourceForm = defineSourceForm(target, materializeSourceContent(target, bytes, ab));
  const dictionary = dictionaryWith(target, bytes, [[new Uint8Array([0x62]), form]]);
  expectSourceError(
    () => buildSelectedSourceEvidence(
      target,
      bytes,
      sourceForm,
      [spec(1, 2, form, dictionary.occurrences[0]!)],
      { dictionary: dictionary.dictionary, grammar, theory },
    ),
    "invalid-selected-partition",
  );
}
