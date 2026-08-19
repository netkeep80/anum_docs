import {
  type Abit,
  executeAbits,
  type StackAlgebra,
} from "../src/anum.js";
import {
  ByteCarrierError,
  byteToQuaternaryBits,
  decodeBytesFromQuaternary,
  encodeBytesToQuaternary,
  materializeByteLink,
  materializeByteVocabulary,
  materializeCanonicalByteSequence,
  readByteLink,
  readCanonicalByteSequence,
  textToUtf8Bytes,
  utf8BytesToText,
} from "../src/byte-carrier.js";
import {
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  Memory,
  type ReadMemory,
} from "../src/memory.js";
import { charToAnum } from "../src/tooling/payload.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function sameBytes(actual: Uint8Array, expected: Uint8Array, message: string): void {
  same(actual.length, expected.length, `${message} length`);
  for (let index = 0; index < actual.length; index += 1) {
    same(actual[index], expected[index], `${message}[${index}]`);
  }
}

function expectByteCarrierError(
  code: ByteCarrierError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof ByteCarrierError, `expected ByteCarrierError, got ${String(error)}`);
    same(error.code, code, "byte carrier error code");
    return;
  }
  throw new Error(`expected ByteCarrierError(${code})`);
}

class PolesOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("byte read must not use find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("byte read must not use outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("byte read must not use incoming"); }
}

// Physical bytes have one exact canonical Q group each, below Unicode.
{
  same(byteToQuaternaryBits(0x00), "00000000", "zero byte bits");
  same(byteToQuaternaryBits(0xff), "11111111", "max byte bits");
  expectByteCarrierError("invalid-byte", () => byteToQuaternaryBits(-1));
  expectByteCarrierError("invalid-byte", () => byteToQuaternaryBits(256));

  const allBytes = Uint8Array.from({ length: 256 }, (_, value) => value);
  const carrier = encodeBytesToQuaternary(allBytes);
  same(carrier.length, 2560, "all-byte canonical carrier length");
  sameBytes(decodeBytesFromQuaternary(carrier), allBytes, "all-byte canonical inverse");
  same(encodeBytesToQuaternary(new Uint8Array()), "", "empty byte carrier");
  sameBytes(decodeBytesFromQuaternary(""), new Uint8Array(), "empty byte inverse");

  same(encodeBytesToQuaternary(Uint8Array.of(0x5b)), "[01011011]", "STRING glyph [ carrier");
  expectByteCarrierError("invalid-quaternary-byte-carrier", () => decodeBytesFromQuaternary("[]"));
  expectByteCarrierError("invalid-quaternary-byte-carrier", () => decodeBytesFromQuaternary("[0101101]"));
  expectByteCarrierError("invalid-quaternary-byte-carrier", () => decodeBytesFromQuaternary("[01011012]"));
  expectByteCarrierError("invalid-quaternary-byte-carrier", () => decodeBytesFromQuaternary(" [01011011]"));
}

// Byte(p) is reproduced from accepted Q denotation, not from an opaque ID table.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const algebra: StackAlgebra<LinkHandle> = Object.freeze({
    root: basis.R,
    linked: basis.L,
    unlinked: basis.U,
    link: (start: LinkHandle, end: LinkHandle) => memory.ensure(start, end),
  });

  const vocabulary = materializeByteVocabulary(memory, basis);
  same(vocabulary.length, 256, "byte vocabulary size");
  same(new Set(vocabulary).size, 256, "byte vocabulary semantic uniqueness");

  for (let value = 0; value < 256; value += 1) {
    const bits = byteToQuaternaryBits(value);
    const accepted = executeAbits(
      [...`[${bits}]`] as Abit[],
      algebra,
    ).denotation;
    const derived = vocabulary[value];
    assert(derived !== undefined, `missing byte ${value}`);
    same(derived, accepted, `Byte(${value}) == Denote_Q([p])`);
    same(materializeByteLink(memory, basis, value), derived, `Byte(${value}) canonical reuse`);
    same(readByteLink(memory, basis, derived), value, `Byte(${value}) structural inverse`);
  }

  const before = memory.linkCount;
  const again = materializeByteVocabulary(memory, basis);
  same(memory.linkCount, before, "byte vocabulary rematerialization is canonical reuse");
  for (let value = 0; value < 256; value += 1) {
    same(again[value], vocabulary[value], `byte vocabulary reuse ${value}`);
  }

  const readOnly = new PolesOnlyProbe(memory);
  for (let value = 0; value < 256; value += 1) {
    const link = vocabulary[value];
    assert(link !== undefined, `missing read-only byte ${value}`);
    same(readByteLink(readOnly, basis, link), value, `read-only byte ${value}`);
  }
  same(memory.linkCount, before, "byte structural inverse does not materialize");
  expectByteCarrierError("not-byte-link", () => readByteLink(memory, basis, basis.L));
}

// Source occurrence belongs to ExactSequence structure; repeated bytes reuse values.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const bytes = Uint8Array.of(0x5b, 0x5b, 0x00, 0xff, 0x5b);
  const carrier = materializeCanonicalByteSequence(memory, basis, bytes);
  assert(carrier !== basis.R, "nonempty byte sequence must not collapse to root");

  const before = memory.linkCount;
  const decoded = readCanonicalByteSequence(new PolesOnlyProbe(memory), basis, carrier);
  sameBytes(decoded.bytes, bytes, "exact byte sequence inverse");
  same(decoded.byteLinks[0], decoded.byteLinks[1], "repeated byte reuses one semantic Byte(p)");
  same(decoded.byteLinks[0], decoded.byteLinks[4], "later repeated byte reuses one semantic Byte(p)");
  same(memory.linkCount, before, "exact byte sequence read is non-materializing");
  same(materializeCanonicalByteSequence(memory, basis, bytes), carrier, "exact byte sequence canonical reuse");

  same(materializeCanonicalByteSequence(memory, basis, new Uint8Array()), basis.R, "empty byte sequence is root");
}

// Strict UTF-8 is a layer above exact bytes; no normalization is performed.
{
  const texts = [
    "A",
    "0",
    "1",
    "[",
    "]",
    "(",
    ")",
    ":",
    "=",
    "М",
    "∞",
    "⟼",
    "🙂",
  ] as const;

  for (const text of texts) {
    const bytes = textToUtf8Bytes(text);
    same(utf8BytesToText(bytes), text, `UTF-8 roundtrip ${JSON.stringify(text)}`);
    sameBytes(
      decodeBytesFromQuaternary(encodeBytesToQuaternary(bytes)),
      bytes,
      `Q byte carrier roundtrip ${JSON.stringify(text)}`,
    );
  }

  const combining = "e\u0301";
  const precomposed = "é";
  const combiningCarrier = encodeBytesToQuaternary(textToUtf8Bytes(combining));
  const precomposedCarrier = encodeBytesToQuaternary(textToUtf8Bytes(precomposed));
  assert(combiningCarrier !== precomposedCarrier, "canonical bytes must not Unicode-normalize text");
  same(utf8BytesToText(decodeBytesFromQuaternary(combiningCarrier)), combining, "combining text preserved");
  same(utf8BytesToText(decodeBytesFromQuaternary(precomposedCarrier)), precomposed, "precomposed text preserved");

  const invalid = Uint8Array.of(0xff);
  const truncated = Uint8Array.of(0xe2, 0x82);
  sameBytes(decodeBytesFromQuaternary(encodeBytesToQuaternary(invalid)), invalid, "invalid FF remains exact bytes");
  sameBytes(decodeBytesFromQuaternary(encodeBytesToQuaternary(truncated)), truncated, "truncated UTF-8 remains exact bytes");
  expectByteCarrierError("invalid-utf8", () => utf8BytesToText(invalid));
  expectByteCarrierError("invalid-utf8", () => utf8BytesToText(truncated));
  expectByteCarrierError("invalid-unicode-text", () => textToUtf8Bytes("\ud800"));
}

// v0.8 public tooling remains untouched: its code-point envelope is explicitly legacy.
{
  const legacy = charToAnum("∞");
  const canonical = encodeBytesToQuaternary(textToUtf8Bytes("∞"));
  same(legacy, "[111000101000100010011110]", "accepted v0.8 code-point envelope spelling");
  same(canonical, "[11100010][10001000][10011110]", "v0.9 per-byte spelling");
  assert(legacy !== canonical, "candidate carrier delta must stay explicit before acceptance");
}
