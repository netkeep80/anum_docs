import {
  materializeByteLink,
} from "../src/byte-carrier.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  V012StringAnumError,
  materializeV012StringAnum,
  materializeV012StringByteAnum,
  readV012StringAnum,
  readV012StringByteAnum,
} from "../src/v012-string-anum.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 STRING structural read: ${message}`);
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

function expectError(
  code: V012StringAnumError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof V012StringAnumError, `expected V012StringAnumError, got ${String(error)}`);
    same(error.code, code, "error code");
    return;
  }
  throw new Error(`v0.12 STRING structural read: expected ${code}`);
}

class PolesOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("STRING structural read must not use find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("STRING structural read must not use outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("STRING structural read must not use incoming"); }
}

// Byte_v012 is structurally invertible from the Link role itself.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  for (let value = 0; value < 256; value += 1) {
    const byteAnum = materializeV012StringByteAnum(memory, basis, value);
    const before = memory.linkCount;
    same(
      readV012StringByteAnum(new PolesOnlyProbe(memory), basis, byteAnum.anumLink),
      value,
      `Byte_v012(${value}) structural inverse`,
    );
    same(memory.linkCount, before, `Byte_v012(${value}) read writes nothing`);
  }

  // Historical Byte_v09 is an intentionally different structure and must not
  // become accepted merely because both roles are called "byte".
  const legacy = materializeByteLink(memory, basis, 0x4d);
  expectError(
    "not-v012-string-byte-anum",
    () => readV012StringByteAnum(new PolesOnlyProbe(memory), basis, legacy),
  );
  expectError(
    "not-v012-string-byte-anum",
    () => readV012StringByteAnum(new PolesOnlyProbe(memory), basis, basis.L),
  );
}

// A role-selected STRING Anum can be read back using poles only. Its prefixes
// are exactly the rooted carrier positions needed for source occurrence spans.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const bytes = Uint8Array.of(0x41, 0xe2, 0x88, 0x9e, 0x5b);
  const string = materializeV012StringAnum(memory, basis, bytes);

  const before = memory.linkCount;
  const read = readV012StringAnum(new PolesOnlyProbe(memory), basis, string.anumLink);
  same(memory.linkCount, before, "STRING structural read writes nothing");
  sameBytes(read.bytes, bytes, "STRING structural bytes");
  same(read.byteLinks.length, bytes.length, "one Byte_v012 Link per physical byte");
  same(read.prefixes.length, bytes.length + 1, "root plus one prefix per byte");
  same(read.prefixes[0], basis.R, "first source prefix is R");
  same(read.prefixes[read.prefixes.length - 1], string.anumLink, "last prefix is exact STRING Anum");

  for (let index = 0; index < read.byteLinks.length; index += 1) {
    const prefix = read.prefixes[index + 1];
    const previous = read.prefixes[index];
    const byteLink = read.byteLinks[index];
    assert(prefix !== undefined && previous !== undefined && byteLink !== undefined, `prefix fixture ${index}`);
    const poles = memory.poles(prefix);
    same(poles.start, previous, `prefix ${index + 1} starts at previous prefix`);
    same(poles.end, byteLink, `prefix ${index + 1} ends at Byte_v012`);
  }
}

// Empty STRING is exactly R and reads as an empty source.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const read = readV012StringAnum(new PolesOnlyProbe(memory), basis, basis.R);
  sameBytes(read.bytes, new Uint8Array(), "empty STRING bytes");
  same(read.byteLinks.length, 0, "empty STRING byte links");
  same(read.prefixes.length, 1, "empty STRING has only root prefix");
  same(read.prefixes[0], basis.R, "empty STRING prefix is R");
}

// Arbitrary rooted Links are not silently accepted as STRING Anums when their
// top-level values are not valid Byte_v012 Anums.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const malformed = memory.ensure(basis.R, basis.L);
  const before = memory.linkCount;
  expectError(
    "not-v012-string-anum",
    () => readV012StringAnum(new PolesOnlyProbe(memory), basis, malformed),
  );
  same(memory.linkCount, before, "rejected STRING read writes nothing");
}

console.log("MTS v0.12 STRING structural inverse: GREEN.");
