import { readFileSync } from "node:fs";
import {
  materializeCanonicalByteSequence,
  readCanonicalByteSequence,
} from "../src/byte-carrier.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  V013HierarchicalCarrierError,
  materializeV013HierarchicalCarrier,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 file wire: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function sameBytes(
  actual: Uint8Array,
  expected: Uint8Array,
  message: string,
): void {
  assert(
    actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]),
    `${message}: byte sequences differ`,
  );
}

function expectCarrierError(
  effect: () => unknown,
  code: V013HierarchicalCarrierError["code"],
  message: string,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof V013HierarchicalCarrierError, `${message}: wrong error`);
    same(error.code, code, `${message}: exact error code`);
    return;
  }
  throw new Error(`v0.13 file wire: ${message}: expected ${code}`);
}

function addNoise(memory: Memory, basis: RootBasis): readonly LinkHandle[] {
  const a = memory.ensure(basis.U, basis.L);
  const b = memory.ensureStartSelfClosed(a);
  const c = memory.ensure(basis.C, b);
  const d = memory.ensureEndSelfClosed(c);
  return Object.freeze([a, b, c, d]);
}

const file = Uint8Array.from(
  readFileSync("../examples/anum/conformance/v013-structural-1968698.anum"),
);
const expected = new TextEncoder().encode("1968698");

sameBytes(file, expected, "fixture is exact canonical physical anum");
same(new TextDecoder().decode(file), "1968698", "fixture text");

// F01 version delta: ROOT is explicit "8". An empty structural wire is not an
// implicit root and must fail before representation writes.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const before = memory.linkCount;
  expectCarrierError(
    () => materializeV013HierarchicalCarrier(memory, basis, new Uint8Array()),
    "invalid-wire",
    "empty wire is not ROOT",
  );
  same(memory.linkCount, before, "empty wire rejection writes zero Links");
}

// F16: real file -> Memory A -> canonical byte Link-carrier -> physical wire.
const memoryA = new Memory();
const basisA = ensureRootBasis(memoryA);
addNoise(memoryA, basisA);

const fileCarrierA = materializeV013HierarchicalCarrier(
  memoryA,
  basisA,
  file,
);
const canonicalA = serializeV013HierarchicalCarrier(
  memoryA,
  basisA,
  fileCarrierA,
);
sameBytes(canonicalA, expected, "Memory A canonical serialization");

const physicalA = materializeCanonicalByteSequence(
  memoryA,
  basisA,
  canonicalA,
);
const emitted = readCanonicalByteSequence(
  memoryA,
  basisA,
  physicalA,
).bytes;
sameBytes(emitted, expected, "Memory A physical byte carrier");

// Independent Memory B has a different allocation history.
const memoryB = new Memory();
const basisB = ensureRootBasis(memoryB);
const noiseB = addNoise(memoryB, basisB);
memoryB.ensureStartSelfClosed(noiseB[noiseB.length - 1]!);

const physicalB = materializeCanonicalByteSequence(
  memoryB,
  basisB,
  emitted,
);
const received = readCanonicalByteSequence(
  memoryB,
  basisB,
  physicalB,
).bytes;
sameBytes(received, expected, "Memory B receives exact file wire");

const fileCarrierB = materializeV013HierarchicalCarrier(
  memoryB,
  basisB,
  received,
);
const canonicalB = serializeV013HierarchicalCarrier(
  memoryB,
  basisB,
  fileCarrierB,
);

sameBytes(canonicalB, expected, "Memory B canonical serialization");
sameBytes(canonicalB, canonicalA, "two-Memory canonical parity");
assert(fileCarrierA !== fileCarrierB, "carrier handles remain Memory-local");

// Replaying the same real file is representation-idempotent.
const beforeReplayB = memoryB.linkCount;
const repeatedB = materializeV013HierarchicalCarrier(
  memoryB,
  basisB,
  file,
);
same(repeatedB, fileCarrierB, "same file returns same local carrier");
same(memoryB.linkCount, beforeReplayB, "same file replay writes zero Links");

console.log(
  "MTS v0.13 real-file 1968698 -> Memory A -> physical wire -> Memory B: GREEN.",
);
