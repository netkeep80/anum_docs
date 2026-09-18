import {
  byteToQuaternaryBits,
  encodeBytesToQuaternary,
  materializeByteLink,
} from "../src/byte-carrier.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
} from "../src/memory.js";
import {
  materializeQuaternaryAnum,
  resolveQuaternaryAnum,
  serializeMaterializedQuaternaryAnum,
} from "../src/quaternary-anum.js";
import {
  materializeV012StringAnum,
  materializeV012StringByteAnum,
  serializeV012StringAnum,
} from "../src/v012-string-anum.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 STRING/Q byte bridge: ${message}`);
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

function signature(
  memory: ReadMemory,
  link: LinkHandle,
  memo = new Map<LinkHandle, string>(),
  active = new Set<LinkHandle>(),
): string {
  const cached = memo.get(link);
  if (cached !== undefined) return cached;
  if (link === memory.root) return "R";
  assert(!active.has(link), "unexpected non-root recursive cycle");
  active.add(link);
  try {
    const poles = memory.poles(link);
    const result =
      poles.start === link
        ? `S(${signature(memory, poles.end, memo, active)})`
        : poles.end === link
          ? `E(${signature(memory, poles.start, memo, active)})`
          : `P(${signature(memory, poles.start, memo, active)},${signature(memory, poles.end, memo, active)})`;
    memo.set(link, result);
    return result;
  } finally {
    active.delete(link);
  }
}

// All 256 v0.12 STRING byte values are exactly the child Anums carried by
// canonical grouped-Q bytes. This is the author-decided replacement for the
// historical Byte_v09 denotation inside the v0.12 candidate path.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  for (let value = 0; value < 256; value += 1) {
    const bits = byteToQuaternaryBits(value);
    const grouped = materializeQuaternaryAnum(memory, basis, `[${bits}]`);
    const first = grouped.items[0];
    assert(first?.kind === "child", `Byte(${value}) Q carrier has one child Anum`);
    same(grouped.items.length, 1, `Byte(${value}) Q carrier has one root item`);
    same(first.anum.items.length, 8, `Byte(${value}) child keeps eight Q bits`);

    const byteAnum = materializeV012StringByteAnum(memory, basis, value);
    same(
      byteAnum.anumLink,
      first.anum.anumLink,
      `Byte_v012(${value}) is the exact grouped-Q child Anum`,
    );
    same(
      resolveQuaternaryAnum(memory, basis, grouped),
      byteAnum.anumLink,
      `Resolve_Q([bits(${value})]) returns Byte_v012(${value})`,
    );
    same(
      serializeMaterializedQuaternaryAnum(memory, basis, byteAnum),
      bits,
      `Byte_v012(${value}) preserves exact eight-bit local Anum`,
    );
  }

  // Explicit semantic delta discriminator: do not silently mutate/reuse the
  // historical Byte_v09 definition in the v0.12 candidate.
  assert(
    materializeByteLink(memory, basis, 0x4d) !==
      materializeV012StringByteAnum(memory, basis, 0x4d).anumLink,
    "Byte_v09(0x4d) remains structurally distinct from Byte_v012(0x4d)",
  );
}

// Two adjacent grouped bytes are one exact rooted STRING Anum whose direct
// children are exactly the two Byte_v012 Anums.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const bytes = Uint8Array.of(0x4d, 0x54); // "MT"
  const wire = encodeBytesToQuaternary(bytes);
  same(wire, "[01001101][01010100]", "canonical MT grouped-Q carrier");

  const stringAnum = materializeV012StringAnum(memory, basis, bytes);
  const directQ = materializeQuaternaryAnum(memory, basis, wire);
  same(stringAnum.anumLink, directQ.anumLink, "STRING exact Anum is top-level exact Q Anum");
  same(stringAnum.items.length, 2, "MT STRING Anum has two byte children");

  const first = stringAnum.items[0];
  const second = stringAnum.items[1];
  assert(first?.kind === "child", "MT first item is byte child Anum");
  assert(second?.kind === "child", "MT second item is byte child Anum");

  same(
    first.anum.anumLink,
    materializeV012StringByteAnum(memory, basis, 0x4d).anumLink,
    "MT first child is Byte_v012(M)",
  );
  same(
    second.anum.anumLink,
    materializeV012StringByteAnum(memory, basis, 0x54).anumLink,
    "MT second child is Byte_v012(T)",
  );

  const firstCell = memory.find(basis.R, first.anum.anumLink);
  assert(firstCell !== undefined, "STRING first byte is rooted at R");
  same(
    memory.find(firstCell, second.anum.anumLink),
    stringAnum.anumLink,
    "STRING exact hierarchy is R -> Byte(M) -> Byte(T)",
  );

  const before = memory.linkCount;
  sameBytes(serializeV012StringAnum(memory, basis, stringAnum), bytes, "MT byte roundtrip");
  same(memory.linkCount, before, "STRING serialization is read-only");
}

// Empty STRING is the rooted empty Anum.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const empty = materializeV012StringAnum(memory, basis, new Uint8Array());
  same(empty.anumLink, basis.R, "empty STRING Anum is R");
  sameBytes(serializeV012StringAnum(memory, basis, empty), new Uint8Array(), "empty roundtrip");
}

// A -> bytes -> B reconstructs the same exact STRING structure without sharing
// technical Link handles as semantic authority.
{
  const source = Uint8Array.of(0x4d, 0x54, 0x5b);

  const memoryA = new Memory();
  const basisA = ensureRootBasis(memoryA);
  const stringA = materializeV012StringAnum(memoryA, basisA, source);
  const beforeA = memoryA.linkCount;
  const wire = serializeV012StringAnum(memoryA, basisA, stringA);
  same(memoryA.linkCount, beforeA, "Memory A serialization is read-only");

  const memoryB = new Memory();
  const basisB = ensureRootBasis(memoryB);
  const stringB = materializeV012StringAnum(memoryB, basisB, wire);
  const beforeB = memoryB.linkCount;
  sameBytes(serializeV012StringAnum(memoryB, basisB, stringB), wire, "Memory B reserialization");
  same(memoryB.linkCount, beforeB, "Memory B serialization is read-only");

  same(
    signature(memoryA, stringA.anumLink),
    signature(memoryB, stringB.anumLink),
    "A/B exact STRING Anum structural equivalence",
  );
  same(
    serializeMaterializedQuaternaryAnum(memoryA, basisA, stringA),
    serializeMaterializedQuaternaryAnum(memoryB, basisB, stringB),
    "A/B canonical grouped-Q hierarchy equality",
  );
}

console.log("MTS v0.12 STRING/Q grouped-byte hierarchy: GREEN.");
