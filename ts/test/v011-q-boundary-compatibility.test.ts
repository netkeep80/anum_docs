import {
  IncrementalQuaternaryDecoder,
  QuaternaryDecodeError,
  StreamError,
  deserializeStream,
  normalizeRawForm,
  parseRawQuaternary,
  symbolicStackAlgebra,
  type Abit,
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

function expectRawNonAbit(source: string, offset: number, symbol: string): void {
  try {
    parseRawQuaternary(source);
  } catch (error) {
    assert(error instanceof QuaternaryDecodeError, `expected QuaternaryDecodeError for ${source}`);
    assertSame(error.code, "non-abit", `raw error code for ${source}`);
    assertSame(error.offset, offset, `raw error offset for ${source}`);
    assertSame(error.symbol, symbol, `raw rejected symbol for ${source}`);
    return;
  }
  throw new Error(`expected raw Q rejection for ${source}`);
}

function expectDirectNonAbit(source: string): void {
  try {
    deserializeStream(source, symbolicStackAlgebra);
  } catch (error) {
    assert(error instanceof StreamError, `expected StreamError for ${source}`);
    assertSame(error.code, "non-abit", `direct error code for ${source}`);
    return;
  }
  throw new Error(`expected direct Q rejection for ${source}`);
}

// The production type and both Q decoders expose exactly the four accepted abits.
const admitted: readonly Abit[] = ["[", "]", "1", "0"];
assertDeepEqual(admitted, ["[", "]", "1", "0"], "Q alphabet remains exactly four abits");
for (const abit of admitted) {
  assertSame(normalizeRawForm(parseRawQuaternary(abit)), abit, `raw Q admits ${abit}`);
}

// Dot and colon remain representation/context signs, never Q abits.
for (const symbol of [".", ":"] as const) {
  expectRawNonAbit(symbol, 0, symbol);
  expectDirectNonAbit(symbol);
  expectRawNonAbit(`[${symbol}]`, 1, symbol);
  expectDirectNonAbit(`[${symbol}]`);
}
expectRawNonAbit("[..]", 1, ".");
expectDirectNonAbit("[..]");

// Contextual notation does not create a second Q grammar. For the candidate
// examples A:[.], A:[..], A[.] and A[..], the Q-bearing inner source is still
// rejected by the production Q boundary before Q execution. An outer A:E
// binder therefore supplies no inherited admission for '.' inside Q.
for (const vector of [
  { contextualShape: "A:[.]", qSource: "[.]" },
  { contextualShape: "A:[..]", qSource: "[..]" },
  { contextualShape: "A[.]", qSource: "[.]" },
  { contextualShape: "A[..]", qSource: "[..]" },
] as const) {
  expectRawNonAbit(vector.qSource, 1, ".");
  expectDirectNonAbit(vector.qSource);
  assert(vector.contextualShape.includes("."), "fixture must exercise contextual dot shape");
}

// Existing legal Q nesting is unchanged.
for (const source of ["[]", "[10]", "[[10]]"] as const) {
  assertSame(normalizeRawForm(parseRawQuaternary(source)), source, `legal Q source ${source}`);
  deserializeStream(source, symbolicStackAlgebra);
}

// Incremental rejection is fail-closed and transactional: a rejected dot-bearing
// Q chunk cannot smuggle partial state into a later retry.
const incremental = new IncrementalQuaternaryDecoder();
incremental.feed("[10]");
const committedOffset = incremental.offset;
const committedForm = normalizeRawForm(incremental.finish());
try {
  incremental.feed("[.]");
  throw new Error("expected incremental Q rejection");
} catch (error) {
  assert(error instanceof QuaternaryDecodeError, `expected incremental decode error, got ${String(error)}`);
  assertSame(error.code, "non-abit", "incremental error code");
  assertSame(error.offset, committedOffset + 1, "incremental rejected dot offset");
  assertSame(error.symbol, ".", "incremental rejected symbol");
}
assertSame(incremental.offset, committedOffset, "rejected Q chunk preserves committed offset");
assertSame(normalizeRawForm(incremental.finish()), committedForm, "rejected Q chunk preserves committed tokens");

incremental.feed("[]");
assertSame(normalizeRawForm(incremental.finish()), "[10][]", "legal retry remains accepted after rejection");
