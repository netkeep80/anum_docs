import {
  IncrementalQuaternaryDecoder,
  QuaternaryDecodeError,
  StreamError,
  deserializeAnum,
  deserializeStream,
  executeAbits,
  normalizeRawForm,
  parseRawQuaternary,
  symbolicStackAlgebra,
  type StackAlgebra,
  type StackOperation,
} from "../src/anum.js";

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

function expectDecodeError(effect: () => unknown, offset: number): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof QuaternaryDecodeError, `expected decode error, got ${String(error)}`);
    assertSame(error.code, "non-abit", "decode error code");
    assertSame(error.offset, offset, "portable code-point offset");
    return;
  }
  throw new Error(`expected QuaternaryDecodeError at ${offset}`);
}

interface ValidVector {
  readonly id: string;
  readonly source: string;
  readonly expectedDenotation: string;
  readonly expectedResolvedValues?: readonly string[];
  readonly expectedDistinctRootRefs?: readonly string[];
  readonly expectedOperations: readonly StackOperation[];
}

const validVectors: readonly ValidVector[] = [
  { id: "empty-stream-is-root", source: "", expectedDenotation: "R", expectedOperations: [] },
  { id: "single-one-is-L", source: "1", expectedDenotation: "L", expectedResolvedValues: ["L"], expectedOperations: ["VALUE"] },
  { id: "flat-pair-left-fold", source: "10", expectedDenotation: "(L⟼U)", expectedResolvedValues: ["L", "U"], expectedOperations: ["VALUE", "VALUE"] },
  { id: "empty-group-is-root", source: "[]", expectedDenotation: "R", expectedResolvedValues: [], expectedOperations: ["OPEN", "CLOSE"] },
  { id: "two-empty-groups-collapse-to-root", source: "[][]", expectedDenotation: "R", expectedResolvedValues: [], expectedOperations: ["OPEN", "CLOSE", "OPEN", "CLOSE"] },
  { id: "nonempty-group-root-wraps-inner-result", source: "[10]", expectedDenotation: "(R⟼(L⟼U))", expectedResolvedValues: ["L", "U"], expectedOperations: ["OPEN", "VALUE", "VALUE", "CLOSE"] },
  { id: "group-result-is-one-parent-value", source: "1[10]", expectedDenotation: "(L⟼(R⟼(L⟼U)))", expectedResolvedValues: ["L", "L", "U"], expectedOperations: ["VALUE", "OPEN", "VALUE", "VALUE", "CLOSE"] },
  { id: "nested-root-wrap", source: "[[10]]", expectedDenotation: "(R⟼(R⟼(L⟼U)))", expectedResolvedValues: ["L", "U"], expectedOperations: ["OPEN", "OPEN", "VALUE", "VALUE", "CLOSE", "CLOSE"] },
  { id: "repeated-position-reuses-semantic-L", source: "1110", expectedDenotation: "(((L⟼L)⟼L)⟼U)", expectedResolvedValues: ["L", "L", "L", "U"], expectedDistinctRootRefs: ["L", "U"], expectedOperations: ["VALUE", "VALUE", "VALUE", "VALUE"] },
];

for (const vector of validVectors) {
  const result = deserializeStream(vector.source, symbolicStackAlgebra);
  assertSame(result.denotation, vector.expectedDenotation, `${vector.id} denotation`);
  assertDeepEqual(result.operations, vector.expectedOperations, `${vector.id} operations`);
  if (vector.expectedResolvedValues !== undefined) {
    assertDeepEqual(result.resolvedValues, vector.expectedResolvedValues, `${vector.id} values`);
  }
  if (vector.expectedDistinctRootRefs !== undefined) {
    assertDeepEqual(
      [...new Set(result.resolvedValues)].sort(),
      [...vector.expectedDistinctRootRefs].sort(),
      `${vector.id} distinct values`,
    );
  }
}

for (const vector of [
  { source: "]", error: "unexpected-close" },
  { source: "1]", error: "unexpected-close" },
  { source: "[", error: "unclosed-open" },
  { source: "[1", error: "unclosed-open" },
  { source: "2", error: "non-abit" },
] as const) {
  expectStreamError(
    () => deserializeStream(vector.source, symbolicStackAlgebra),
    vector.error,
  );
}

for (const source of ["", "[]", "1", "10", "[1]", "[[]]", "1110"]) {
  assertDeepEqual(
    deserializeAnum(parseRawQuaternary(source), symbolicStackAlgebra),
    deserializeStream(source, symbolicStackAlgebra),
    `parsed/raw parity for ${source}`,
  );
}

assertSame(deserializeStream("[][]", symbolicStackAlgebra).denotation, "R", "empty groups collapse to R");
expectStreamError(() => deserializeStream("R", symbolicStackAlgebra), "non-abit");
expectDecodeError(() => parseRawQuaternary("R"), 0);

const numericAlgebra: StackAlgebra<number> = {
  root: 0,
  linked: 1,
  unlinked: 2,
  link: (start, end) => start === 0 && end === 0 ? 0 : start * 100 + end + 10,
};
assertSame(executeAbits(["[", "1", "0", "]"], numericAlgebra).denotation, 122, "stack engine must be generic over result type");

const commented = parseRawQuaternary("  [ 0 1 ]  # byte shell\n][");
assertSame(normalizeRawForm(commented), "[01]][", "comments and whitespace are lexical only");
assertDeepEqual(commented.tokens.map((token) => token.offset), [2, 4, 6, 8, 24, 25], "Python-compatible offsets");

const streamedText = " [0# comment spans\n1] ][ [[ ]] ";
const batch = parseRawQuaternary(streamedText);
const streamedDecoder = new IncrementalQuaternaryDecoder();
for (const chunk of [" [0# com", "ment spans", "\n1] ", "][ [", "[ ]", "] "]) {
  streamedDecoder.feed(chunk);
}
const streamed = streamedDecoder.finish();
assertSame(normalizeRawForm(streamed), normalizeRawForm(batch), "batch/incremental values must match");
assertDeepEqual(streamed.tokens.map((token) => token.offset), batch.tokens.map((token) => token.offset), "batch/incremental offsets must match");

const rejected = new IncrementalQuaternaryDecoder();
expectDecodeError(() => rejected.feed("[0x"), 2);
assertSame(rejected.offset, 0, "rejected first chunk must roll back offset");
assertDeepEqual(rejected.finish().tokens, [], "rejected first chunk must roll back tokens");
rejected.feed("[01]");
assertDeepEqual(rejected.finish().tokens.map((token) => token.offset), [0, 1, 2, 3], "retry offsets");

const later = new IncrementalQuaternaryDecoder();
later.feed("[");
expectDecodeError(() => later.feed("0x"), 2);
assertSame(later.offset, 1, "rejected later chunk preserves prior offset");
later.feed("01]");
assertSame(normalizeRawForm(later.finish()), "[01]", "retry after later rejection");

const commentRollback = new IncrementalQuaternaryDecoder();
commentRollback.feed("# comment");
const commentOffset = commentRollback.offset;
expectDecodeError(() => commentRollback.feed("\n0x"), commentOffset + 2);
assertSame(commentRollback.offset, commentOffset, "rejected chunk rolls back comment transition");
commentRollback.feed("\n01");
assertDeepEqual(commentRollback.finish().tokens.map((token) => token.offset), [commentOffset + 1, commentOffset + 2], "comment retry offsets");

const astralBefore = parseRawQuaternary("#😀\n1");
assertDeepEqual(astralBefore.tokens.map((token) => token.offset), [3], "astral code point before abit counts once");

const astralInvalid = new IncrementalQuaternaryDecoder();
expectDecodeError(() => astralInvalid.feed("1😀"), 1);
assertSame(astralInvalid.offset, 0, "astral rejection rolls back valid prefix in same chunk");
assertDeepEqual(astralInvalid.finish().tokens, [], "astral rejection rolls back tokens");

const astralChunks = new IncrementalQuaternaryDecoder();
astralChunks.feed("#😀");
assertSame(astralChunks.offset, 2, "astral comment chunk uses code-point length");
astralChunks.feed("\n1");
assertDeepEqual(astralChunks.finish().tokens.map((token) => token.offset), [3], "astral chunk boundary preserves absolute offset");

const astralRetry = new IncrementalQuaternaryDecoder();
astralRetry.feed("#😀");
expectDecodeError(() => astralRetry.feed("\n0😀"), 4);
assertSame(astralRetry.offset, 2, "failed astral feed rolls back offset");
assertDeepEqual(astralRetry.finish().tokens, [], "failed astral feed rolls back tokens");
astralRetry.feed("\n01");
assertDeepEqual(astralRetry.finish().tokens.map((token) => token.offset), [3, 4], "astral retry preserves portable offsets");

const pythonSeparator = parseRawQuaternary("\u001c1");
assertDeepEqual(pythonSeparator.tokens.map((token) => token.offset), [1], "Python control separator is whitespace");
expectDecodeError(() => parseRawQuaternary("\ufeff1"), 0);
