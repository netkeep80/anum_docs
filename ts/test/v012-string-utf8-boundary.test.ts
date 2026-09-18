import { readFileSync } from "node:fs";
import {
  ByteCarrierError,
  encodeBytesToQuaternary,
  textToUtf8Bytes,
  utf8BytesToText,
} from "../src/byte-carrier.js";
import {
  Memory,
  ensureRootBasis,
} from "../src/memory.js";
import {
  materializeQuaternaryAnum,
  serializeMaterializedQuaternaryAnum,
} from "../src/quaternary-anum.js";
import {
  materializeV012StringAnum,
  serializeV012StringAnum,
} from "../src/v012-string-anum.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 STRING UTF-8 boundary: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function sameBytes(actual: Uint8Array, expected: Uint8Array, message: string): void {
  same(actual.length, expected.length, `${message} length`);
  for (let index = 0; index < actual.length; index += 1) {
    same(actual[index], expected[index], `${message}[${index}]`);
  }
}

function expectInvalidUtf8(effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof ByteCarrierError, "malformed UTF-8 uses ByteCarrierError");
    same(error.code, "invalid-utf8", "malformed UTF-8 error code");
    return;
  }
  throw new Error("v0.12 STRING UTF-8 boundary: expected invalid-utf8");
}

// Real file: one ASCII character, one three-byte UTF-8 character and the
// literal source glyph "[". Exact STRING topology remains byte-based.
{
  const fixture = new Uint8Array(
    readFileSync("../examples/anum/conformance/string-utf8-mixed.string.anum"),
  );
  const text = "A∞[";
  const expected = textToUtf8Bytes(text);
  sameBytes(fixture, expected, "real UTF-8 fixture bytes");
  same(fixture.length, 5, "A + infinity + left bracket occupies five exact bytes");

  const memoryA = new Memory();
  const basisA = ensureRootBasis(memoryA);
  const stringA = materializeV012StringAnum(memoryA, basisA, fixture);

  same(stringA.items.length, 5, "STRING exact hierarchy has one child per physical byte");
  for (const [index, item] of stringA.items.entries()) {
    assert(item.kind === "child", `fixture byte ${index} is a child Anum`);
    same(item.anum.items.length, 8, `fixture byte ${index} keeps eight Q bits`);
  }

  const expectedQ = encodeBytesToQuaternary(fixture);
  same(
    serializeMaterializedQuaternaryAnum(memoryA, basisA, stringA),
    expectedQ,
    "exact STRING hierarchy is canonical grouped-Q carrier",
  );

  const beforeRead = memoryA.linkCount;
  const wire = serializeV012StringAnum(memoryA, basisA, stringA);
  same(memoryA.linkCount, beforeRead, "STRING byte read is non-materializing");
  sameBytes(wire, fixture, "STRING bytes roundtrip");
  same(utf8BytesToText(wire), text, "strict UTF-8 text reading");

  // The last source character is "[" but its STRING byte Anum is not the
  // semantic Q OPEN Link merely because the glyph spelling is the same.
  const last = stringA.items[4];
  assert(last?.kind === "child", "left-bracket source byte is a child Anum");
  assert(
    last.anum.anumLink !== basisA.O,
    "STRING glyph [ is not semantic Q OPEN by spelling",
  );

  // A -> bytes -> B preserves the same faithful carrier and text reading.
  const memoryB = new Memory();
  const basisB = ensureRootBasis(memoryB);
  const stringB = materializeV012StringAnum(memoryB, basisB, wire);
  sameBytes(
    serializeV012StringAnum(memoryB, basisB, stringB),
    fixture,
    "Memory B faithful bytes",
  );
  same(
    serializeMaterializedQuaternaryAnum(memoryB, basisB, stringB),
    expectedQ,
    "Memory B canonical grouped-Q hierarchy",
  );
  same(
    utf8BytesToText(serializeV012StringAnum(memoryB, basisB, stringB)),
    text,
    "Memory B strict UTF-8 reading",
  );
}

// A multi-byte Unicode character spans several Byte_v012 children. Unicode
// grouping does not silently insert another exact Anum nesting level.
{
  const bytes = textToUtf8Bytes("∞");
  sameBytes(bytes, Uint8Array.of(0xe2, 0x88, 0x9e), "infinity UTF-8 bytes");

  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const string = materializeV012StringAnum(memory, basis, bytes);
  same(string.items.length, 3, "infinity STRING Anum has three byte children");
  same(utf8BytesToText(serializeV012StringAnum(memory, basis, string)), "∞", "infinity text");

  const nestedCarrier = materializeQuaternaryAnum(
    memory,
    basis,
    "[[11100010][10001000][10011110]]",
  );
  assert(
    nestedCarrier.anumLink !== string.anumLink,
    "Unicode code-point grouping does not imply an extra exact carrier R[ level",
  );
}

// Two adjacent characters may occupy a different number of bytes while the
// exact STRING carrier remains one rooted byte-Anum sequence.
{
  const bytes = textToUtf8Bytes("A∞");
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const string = materializeV012StringAnum(memory, basis, bytes);

  same(bytes.length, 4, "A + infinity UTF-8 byte count");
  same(string.items.length, 4, "A + infinity exact STRING byte-child count");
  same(utf8BytesToText(serializeV012StringAnum(memory, basis, string)), "A∞", "adjacent text");
}

// Exact bytes can be a valid STRING carrier while UTF-8 reading is
// UNINTERPRETABLE. Failed text reading does not mutate the carrier memory.
{
  const bytes = Uint8Array.of(0xff);
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const string = materializeV012StringAnum(memory, basis, bytes);

  same(string.items.length, 1, "malformed UTF-8 remains one exact byte child");
  sameBytes(serializeV012StringAnum(memory, basis, string), bytes, "malformed exact byte survives");
  const before = memory.linkCount;
  expectInvalidUtf8(() => utf8BytesToText(serializeV012StringAnum(memory, basis, string)));
  same(memory.linkCount, before, "failed UTF-8 reading is non-materializing");
}

console.log("MTS v0.12 STRING strict UTF-8 boundary: GREEN.");
