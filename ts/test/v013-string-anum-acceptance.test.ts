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
  materializeV012StringAnum,
  readV012StringAnum,
  serializeV012StringAnum,
} from "../src/v012-string-anum.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 STRING acceptance: ${message}`);
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

function allocationNoise(memory: Memory, basis: RootBasis, rounds: number): void {
  let current: LinkHandle = memory.ensure(basis.U, basis.L);
  for (let index = 0; index < rounds; index += 1) {
    current = index % 2 === 0
      ? memory.ensure(current, basis.C)
      : memory.ensure(basis.O, current);
  }
}

// Exact bytes, deliberately mixing NUL, the historical quaternary glyph bytes,
// non-ASCII UTF-8 bytes, and 0xff. STRING identity here is byte identity; no
// Unicode normalization or host string semantics participate.
const payload = Uint8Array.from([
  0x00,
  0x31, // "1"
  0x36, // "6"
  0x38, // "8"
  0x39, // "9"
  0xe2, 0x88, 0x9e, // UTF-8 "∞"
  0xff,
]);

// ---------------------------------------------------------------------------
// Memory A: bytes -> stored STRING anum -> exact structural read.
// ---------------------------------------------------------------------------

const memoryA = new Memory();
const basisA = ensureRootBasis(memoryA);
allocationNoise(memoryA, basisA, 5);

const stringA = materializeV012StringAnum(memoryA, basisA, payload);
const readA = readV012StringAnum(memoryA, basisA, stringA.anumLink);
sameBytes(readA.bytes, payload, "A reads exact stored STRING bytes");
same(readA.prefixes[0], basisA.R, "A STRING anum starts from local R");
same(
  readA.prefixes[readA.prefixes.length - 1],
  stringA.anumLink,
  "A final rooted prefix is exact STRING anum Link",
);
sameBytes(
  serializeV012StringAnum(memoryA, basisA, stringA),
  payload,
  "A faithful STRING serialization",
);

// The physical transfer boundary carries only bytes. It is a different
// Link-carrier from the semantic STRING anum.
const physicalA = materializeCanonicalByteSequence(memoryA, basisA, payload);
assert(physicalA !== stringA.anumLink, "A physical byte carrier != STRING anum");
const emitted = readCanonicalByteSequence(
  memoryA,
  basisA,
  physicalA,
).bytes;
sameBytes(emitted, payload, "A emits exact physical bytes");

// ---------------------------------------------------------------------------
// Memory B: independent allocation -> physical receive -> stored STRING anum.
// ---------------------------------------------------------------------------

const memoryB = new Memory();
const basisB = ensureRootBasis(memoryB);
allocationNoise(memoryB, basisB, 11);

const physicalB = materializeCanonicalByteSequence(memoryB, basisB, emitted);
const received = readCanonicalByteSequence(
  memoryB,
  basisB,
  physicalB,
).bytes;
sameBytes(received, payload, "B receives exact physical bytes");

const stringB = materializeV012StringAnum(memoryB, basisB, received);
const readB = readV012StringAnum(memoryB, basisB, stringB.anumLink);
sameBytes(readB.bytes, payload, "B reads exact stored STRING bytes");
same(readB.prefixes[0], basisB.R, "B STRING anum starts from local R");
same(
  readB.prefixes[readB.prefixes.length - 1],
  stringB.anumLink,
  "B final rooted prefix is exact STRING anum Link",
);
sameBytes(
  serializeV012StringAnum(memoryB, basisB, stringB),
  payload,
  "B faithful STRING serialization",
);

assert(
  stringA.anumLink !== stringB.anumLink,
  "STRING anum handles remain Memory-local",
);
assert(physicalB !== stringB.anumLink, "B physical carrier != STRING anum");

// Re-reading/re-materializing the exact same STRING is canonical and idempotent.
const beforeRepeat = memoryB.linkCount;
const repeatedB = materializeV012StringAnum(memoryB, basisB, received);
same(repeatedB.anumLink, stringB.anumLink, "B repeated STRING returns same local anum");
same(memoryB.linkCount, beforeRepeat, "B repeated STRING writes zero Links");

// ---------------------------------------------------------------------------
// New-foundation compatibility:
// the *stored STRING anum Link itself* has an allocation-independent canonical
// 1/6/8/9 structural description. No v0.12 Q spelling is reused as authority.
// ---------------------------------------------------------------------------

const carrierA = materializeV013HierarchicalCarrierFromSemanticLink(
  memoryA,
  basisA,
  stringA.anumLink,
);
const carrierB = materializeV013HierarchicalCarrierFromSemanticLink(
  memoryB,
  basisB,
  stringB.anumLink,
);

assert(carrierA !== stringA.anumLink, "A v0.13 description != STRING target");
assert(carrierB !== stringB.anumLink, "B v0.13 description != STRING target");

const quaternaryA = serializeV013HierarchicalCarrier(
  memoryA,
  basisA,
  carrierA,
);
const quaternaryB = serializeV013HierarchicalCarrier(
  memoryB,
  basisB,
  carrierB,
);

sameBytes(
  quaternaryA,
  quaternaryB,
  "same STRING topology -> allocation-independent v0.13 quaternary description",
);
assert(
  quaternaryA.length > 0 &&
    quaternaryA.every(
      (byte) => byte === 0x31 || byte === 0x36 || byte === 0x38 || byte === 0x39,
    ),
  "STRING anum structural description uses only physical 1/6/8/9 alphabet",
);

console.log(
  `MTS v0.13 STRING anum AC3: ${payload.length} exact bytes -> rooted stored Link anum -> two-Memory byte parity -> allocation-independent 1/6/8/9 description (${quaternaryA.length} symbols): GREEN.`,
);
