import {
  defineSourceForm,
  materializeSourceContent,
  readSourceContent,
  readSourceForm,
  SourceError,
} from "../src/source.js";
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
