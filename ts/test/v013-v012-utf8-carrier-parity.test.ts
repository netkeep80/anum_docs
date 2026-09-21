import {
  ByteCarrierError,
  textToUtf8Bytes,
  utf8BytesToText,
} from "../src/byte-carrier.js";
import {
  Memory,
  ensureRootBasis,
} from "../src/memory.js";
import {
  materializeV012StringAnum,
  serializeV012StringAnum,
} from "../src/v012-string-anum.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13/v0.12 UTF-8 parity: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function sameBytes(actual: Uint8Array, expected: Uint8Array, message: string): void {
  same(actual.length, expected.length, `${message}: length`);
  for (let index = 0; index < actual.length; index += 1) {
    same(actual[index], expected[index], `${message}[${index}]`);
  }
}

function structuralWire(
  memory: Memory,
  semantic: number,
): Uint8Array {
  const basis = ensureRootBasis(memory);
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    semantic,
  );
  return serializeV013HierarchicalCarrier(memory, basis, carrier);
}

function expectInvalidUtf8(effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof ByteCarrierError, "malformed UTF-8 uses ByteCarrierError");
    same(error.code, "invalid-utf8", "malformed UTF-8 error code");
    return;
  }
  throw new Error("v0.13/v0.12 UTF-8 parity: expected invalid-utf8");
}

// ---------------------------------------------------------------------------
// U1. UTF-8 reading is an interpretation over exact STRING bytes. It does not
// rewrite the exact STRING Link or its v0.13 structural description.
// ---------------------------------------------------------------------------

{
  const text = "A∞[";
  const bytes = textToUtf8Bytes(text);
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const string = materializeV012StringAnum(memory, basis, bytes);

  const exactBefore = serializeV012StringAnum(memory, basis, string);
  const structuralBefore = structuralWire(memory, string.anumLink);
  const beforeRead = memory.linkCount;

  same(utf8BytesToText(exactBefore), text, "strict UTF-8 read");
  same(memory.linkCount, beforeRead, "UTF-8 read is non-materializing");

  const exactAfter = serializeV012StringAnum(memory, basis, string);
  const structuralAfter = structuralWire(memory, string.anumLink);

  sameBytes(exactAfter, exactBefore, "UTF-8 read preserves exact bytes");
  sameBytes(
    structuralAfter,
    structuralBefore,
    "UTF-8 read preserves v0.13 structural description of the STRING anum",
  );

  // Literal '[' is just a STRING byte here; text reading does not grant it
  // legacy Q OPEN or v0.13 structural START authority.
  same(exactAfter[exactAfter.length - 1], 0x5b, "literal left bracket byte preserved");
}

// ---------------------------------------------------------------------------
// U2. Valid exact STRING bytes may be UTF-8 UNINTERPRETABLE. The failure does
// not invalidate, normalize or mutate the exact carrier.
// ---------------------------------------------------------------------------

{
  const bytes = Uint8Array.of(0xff);
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const string = materializeV012StringAnum(memory, basis, bytes);

  const exactBefore = serializeV012StringAnum(memory, basis, string);
  const structuralBefore = structuralWire(memory, string.anumLink);
  const beforeRead = memory.linkCount;

  expectInvalidUtf8(() => utf8BytesToText(exactBefore));

  same(memory.linkCount, beforeRead, "failed UTF-8 read writes nothing");
  sameBytes(
    serializeV012StringAnum(memory, basis, string),
    bytes,
    "malformed exact byte remains a valid exact STRING carrier",
  );
  sameBytes(
    structuralWire(memory, string.anumLink),
    structuralBefore,
    "failed UTF-8 interpretation preserves v0.13 structural description",
  );
}

// ---------------------------------------------------------------------------
// U3. Unicode normalization is not STRING identity. Canonically equivalent
// Unicode text spellings remain distinct exact byte sequences / STRING Links.
// ---------------------------------------------------------------------------

{
  const nfc = textToUtf8Bytes("\u00e9");      // U+00E9
  const nfd = textToUtf8Bytes("e\u0301");     // U+0065 U+0301
  assert(
    nfc.length !== nfd.length ||
      nfc.some((byte, index) => byte !== nfd[index]),
    "NFC and NFD fixtures must have different exact bytes",
  );

  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const stringNfc = materializeV012StringAnum(memory, basis, nfc);
  const stringNfd = materializeV012StringAnum(memory, basis, nfd);

  assert(stringNfc.anumLink !== stringNfd.anumLink, "different exact bytes remain different STRING anums");
  same(utf8BytesToText(nfc), "\u00e9", "NFC text reading");
  same(utf8BytesToText(nfd), "e\u0301", "NFD text reading");

  const wireNfc = structuralWire(memory, stringNfc.anumLink);
  const wireNfd = structuralWire(memory, stringNfd.anumLink);
  assert(
    wireNfc.length !== wireNfd.length ||
      wireNfc.some((byte, index) => byte !== wireNfd[index]),
    "different exact STRING identities retain different v0.13 structural descriptions",
  );
}

// ---------------------------------------------------------------------------
// U4. Bytes that happen to spell v0.13 physical digits remain STRING bytes;
// glyph spelling alone does not select structural meaning.
// ---------------------------------------------------------------------------

{
  const bytes = new TextEncoder().encode("1689");
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const string = materializeV012StringAnum(memory, basis, bytes);

  sameBytes(
    serializeV012StringAnum(memory, basis, string),
    bytes,
    "physical 1/6/8/9 glyphs remain exact STRING bytes",
  );
  assert(string.anumLink !== basis.L, "STRING '1' is not PAIR sign L");
  assert(string.anumLink !== basis.C, "STRING '6' is not END sign C");
  assert(string.anumLink !== basis.R, "STRING '8' is not ROOT sign R");
  assert(string.anumLink !== basis.O, "STRING '9' is not START sign O");
}

console.log(
  "MTS v0.13/v0.12 UTF-8 carrier parity: exact bytes remain authoritative; UTF-8 is read-only interpretation, malformed bytes stay exact, normalization does not redefine identity, and glyph spelling grants no structural authority: GREEN.",
);
