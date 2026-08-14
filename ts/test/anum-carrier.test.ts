import {
  CarrierInputError,
  decodeCarrierStream,
  deserializeCarrier,
  type AnumCarrierVocabulary,
} from "../src/anum-carrier.js";
import {
  RootedSequenceError,
  readRootedSequence,
} from "../src/rooted-sequence.js";
import {
  StreamError,
  deserializeStream,
  symbolicStackAlgebra,
} from "../src/anum.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
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

function expectCarrierError(effect: () => unknown, code: CarrierInputError["code"]): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof CarrierInputError, `expected CarrierInputError, got ${String(error)}`);
    assertSame(error.code, code, "carrier error code");
    return;
  }
  throw new Error(`expected CarrierInputError(${code})`);
}

function expectRootedSequenceError(effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof RootedSequenceError, `expected RootedSequenceError, got ${String(error)}`);
    assertSame(error.code, "not-rooted-sequence", "rooted-sequence error code");
    return;
  }
  throw new Error("expected RootedSequenceError(not-rooted-sequence)");
}

function expectStreamError(effect: () => unknown, code: StreamError["code"]): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StreamError, `expected StreamError, got ${String(error)}`);
    assertSame(error.code, code, "stream error code");
    return;
  }
  throw new Error(`expected StreamError(${code})`);
}

interface Fixture {
  readonly memory: Memory;
  readonly read: ReadMemory;
  readonly vocabulary: AnumCarrierVocabulary;
  readonly root: LinkHandle;
  carrier(source: string): LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const vocabulary: AnumCarrierVocabulary = Object.freeze({
    opening: O,
    closing: C,
    linked: L,
    unlinked: U,
  });
  const values = new Map<string, LinkHandle>([
    ["[", O],
    ["]", C],
    ["1", L],
    ["0", U],
  ]);

  return {
    memory,
    read: memory,
    vocabulary,
    root: R,
    carrier(source: string): LinkHandle {
      let current = R;
      for (const symbol of source) {
        const value = values.get(symbol);
        if (value === undefined) throw new Error(`invalid fixture symbol: ${symbol}`);
        current = memory.ensure(current, value);
      }
      return current;
    },
  };
}

{
  const { memory, read, vocabulary, root, carrier } = fixture();
  const openingCarrier = carrier("[");
  const before = memory.linkCount;

  assertDeepEqual(readRootedSequence(read, root).values, [], "R is empty rooted sequence");
  const closingSequence = readRootedSequence(read, vocabulary.closing);
  assertDeepEqual(closingSequence.values, [vocabulary.closing], "C contributes one closing value");
  assertDeepEqual(closingSequence.prefixes, [root, vocabulary.closing], "C rooted prefixes");

  assert(openingCarrier !== vocabulary.opening, "carrier '[' is distinct from vocabulary O");
  assertSame(decodeCarrierStream(read, openingCarrier, vocabulary), "[", "explicit '[' carrier");
  expectRootedSequenceError(() => readRootedSequence(read, vocabulary.opening));
  expectCarrierError(
    () => decodeCarrierStream(read, vocabulary.opening, vocabulary),
    "not-rooted-sequence",
  );
  assertSame(memory.linkCount, before, "rooted sequence reads must not materialize");
}

{
  const { read, vocabulary, carrier } = fixture();
  assertSame(decodeCarrierStream(read, carrier("0"), vocabulary), "0", "single zero carrier");
  assertSame(carrier("]["), vocabulary.unlinked, "canonical U can have explicit carrier role for ][");
  assertSame(
    decodeCarrierStream(read, vocabulary.unlinked, vocabulary),
    "][",
    "explicit carrier role must win over vocabulary-value role",
  );
}

const validSources = ["", "1", "10", "[]", "[][]", "[10]", "1[10]", "[[10]]", "1110"];
for (const source of validSources) {
  const { memory, read, vocabulary, carrier } = fixture();
  const selected = carrier(source);
  const before = memory.linkCount;
  const raw = deserializeStream(source, symbolicStackAlgebra);
  const fromCarrier = deserializeCarrier(read, selected, vocabulary, symbolicStackAlgebra);

  assertSame(decodeCarrierStream(read, selected, vocabulary), source, `carrier source parity: ${source}`);
  assertDeepEqual(fromCarrier, raw, `carrier denotation parity: ${source}`);
  assertSame(memory.linkCount, before, `carrier path is read-only: ${source}`);
}

for (const vector of [
  { source: "]", error: "unexpected-close" },
  { source: "1]", error: "unexpected-close" },
  { source: "[", error: "unclosed-open" },
  { source: "[1", error: "unclosed-open" },
] as const) {
  const { read, vocabulary, carrier } = fixture();
  const selected = carrier(vector.source);
  expectStreamError(() => deserializeStream(vector.source, symbolicStackAlgebra), vector.error);
  expectStreamError(
    () => deserializeCarrier(read, selected, vocabulary, symbolicStackAlgebra),
    vector.error,
  );
}

{
  const { memory, read, vocabulary, root } = fixture();
  const other = memory.ensureStartSelfClosed(vocabulary.linked);
  const carrier = memory.ensure(root, other);
  const before = memory.linkCount;
  expectCarrierError(() => decodeCarrierStream(read, carrier, vocabulary), "non-abit");
  assertSame(memory.linkCount, before, "non-abit rejection must not materialize");
}

{
  const { read, vocabulary, root } = fixture();
  const wrong: AnumCarrierVocabulary = {
    opening: vocabulary.closing,
    closing: vocabulary.opening,
    linked: vocabulary.linked,
    unlinked: vocabulary.unlinked,
  };
  expectCarrierError(() => decodeCarrierStream(read, root, wrong), "invalid-vocabulary");
}

{
  const { read, vocabulary, root } = fixture();
  const foreignRoot = new Memory().root;
  const foreign: AnumCarrierVocabulary = { ...vocabulary, opening: foreignRoot };
  expectCarrierError(() => decodeCarrierStream(read, root, foreign), "invalid-vocabulary");
}

{
  const { memory, read, vocabulary, root } = fixture();
  const before = memory.linkCount;
  assertSame(decodeCarrierStream(read, root, vocabulary), "", "R is empty carrier");
  assertSame(decodeCarrierStream(read, vocabulary.closing, vocabulary), "]", "C is canonical ] carrier");
  assertSame(decodeCarrierStream(read, vocabulary.unlinked, vocabulary), "][", "U is canonical ][ carrier");
  assertSame(memory.linkCount, before, "structural carrier cases are read-only");
}
