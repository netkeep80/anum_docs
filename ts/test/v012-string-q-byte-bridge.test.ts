import {
  byteToQuaternaryBits,
  materializeByteLink,
} from "../src/byte-carrier.js";
import {
  Memory,
  ensureRootBasis,
} from "../src/memory.js";
import {
  materializeQuaternaryAnum,
  resolveQuaternaryAnum,
} from "../src/quaternary-anum.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 STRING/Q byte bridge: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

const memory = new Memory();
const basis = ensureRootBasis(memory);

for (const value of [0x4d, 0x5b] as const) {
  const bits = byteToQuaternaryBits(value);
  const grouped = materializeQuaternaryAnum(memory, basis, `[${bits}]`);
  const first = grouped.items[0];

  assert(first?.kind === "child", `Byte(${value}) Q carrier has one child Anum`);
  same(grouped.items.length, 1, `Byte(${value}) Q carrier has one root item`);
  same(first.anum.items.length, 8, `Byte(${value}) child keeps exactly eight Q bits`);

  same(
    resolveQuaternaryAnum(memory, basis, grouped),
    first.anum.anumLink,
    `Byte(${value}) one Q Resolve returns the exact inner byte Anum`,
  );

  same(
    materializeByteLink(memory, basis, value),
    first.anum.anumLink,
    `Byte(${value}) STRING value must be derived from the grouped Q child Anum`,
  );
}

console.log("MTS v0.12 STRING/Q grouped-byte bridge: GREEN.");
