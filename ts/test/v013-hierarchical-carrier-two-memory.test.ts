import {
  materializeCanonicalByteSequence,
  readCanonicalByteSequence,
} from "../src/byte-carrier.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
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
  if (!condition) throw new Error(`v0.13 carrier wire: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function sameBytes(
  actual: Uint8Array,
  expected: readonly number[] | Uint8Array,
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
): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof V013HierarchicalCarrierError,
      `expected carrier error, got ${String(error)}`,
    );
    same(error.code, code, "carrier error code");
    return;
  }
  throw new Error(`v0.13 carrier wire: expected ${code}`);
}

interface IndependentCarrierBuilder {
  readonly basis: RootBasis;
  readonly namespace: LinkHandle;
  root(): LinkHandle;
  start(child: LinkHandle): LinkHandle;
  end(child: LinkHandle): LinkHandle;
  pair(left: LinkHandle, right: LinkHandle): LinkHandle;
  values(carrier: LinkHandle): readonly LinkHandle[];
}

function independentBuilder(memory: Memory): IndependentCarrierBuilder {
  const basis = ensureRootBasis(memory);
  const namespace = memory.ensure(basis.L, basis.L);
  const quote = (value: LinkHandle): LinkHandle =>
    memory.ensure(namespace, value);

  const node = (values: readonly LinkHandle[]): LinkHandle =>
    materializeExactSequence(memory, values.map(quote));

  const readValues = (carrier: LinkHandle): readonly LinkHandle[] =>
    Object.freeze(readExactSequence(memory, carrier).values.map((quoted) => {
      const poles = memory.poles(quoted);
      same(poles.start, namespace, "independent carrier quote namespace");
      return poles.end;
    }));

  return Object.freeze({
    basis,
    namespace,
    root: () => basis.R,
    start: (child: LinkHandle) => node([basis.O, child]),
    end: (child: LinkHandle) => node([basis.C, child]),
    pair: (left: LinkHandle, right: LinkHandle) =>
      node([basis.L, left, right]),
    values: readValues,
  });
}

function findStartForm(
  memory: Memory,
  whole: LinkHandle,
): LinkHandle | undefined {
  return memory.allLinks().find((link) => {
    if (link === whole) return false;
    const poles = memory.poles(link);
    return poles.start === link && poles.end === whole;
  });
}

function findEndForm(
  memory: Memory,
  whole: LinkHandle,
): LinkHandle | undefined {
  return memory.allLinks().find((link) => {
    if (link === whole) return false;
    const poles = memory.poles(link);
    return poles.start === whole && poles.end === link;
  });
}

// Build sender carrier independently of the runtime parser so the wire test is
// not a materialize->serialize self-fulfilling round-trip.
const memoryA = new Memory();
const buildA = independentBuilder(memoryA);

// Semantic links exist on A, but are distinct from their representation.
const endR_A = buildA.basis.C;
const startR_A = buildA.basis.O;
const semanticLeftA = memoryA.ensureStartSelfClosed(endR_A);
const semanticRightA = memoryA.ensureEndSelfClosed(startR_A);
const semanticWholeA = memoryA.ensure(semanticLeftA, semanticRightA);

const carrierEndR_A = buildA.end(buildA.root());
const carrierStartR_A = buildA.start(buildA.root());
const carrierLeftA = buildA.start(carrierEndR_A);
const carrierRightA = buildA.end(carrierStartR_A);
const carrierWholeA = buildA.pair(carrierLeftA, carrierRightA);

assert(carrierWholeA !== semanticWholeA, "sender carrier is not semantic Whole");

const beforeSerializeA = memoryA.linkCount;
const wire = serializeV013HierarchicalCarrier(
  memoryA,
  buildA.basis,
  carrierWholeA,
);
same(memoryA.linkCount, beforeSerializeA, "serializer is read-only");

// PAIR(START(END(ROOT)), END(START(ROOT))).
sameBytes(
  wire,
  [0x31, 0x39, 0x36, 0x38, 0x36, 0x39, 0x38],
  "exact canonical quaternary wire 1968698",
);

// Existing canonical byte Link-carrier is the physical storage layer.
const physicalA = materializeCanonicalByteSequence(
  memoryA,
  buildA.basis,
  wire,
);
const emitted = readCanonicalByteSequence(
  memoryA,
  buildA.basis,
  physicalA,
).bytes;
sameBytes(emitted, wire, "sender byte Link-carrier reproduces wire");

// Receiver starts with only its rooted basis.
const memoryB = new Memory();
const basisB = ensureRootBasis(memoryB);

same(
  findStartForm(memoryB, basisB.C),
  undefined,
  "receiver START_FORM(C) absent initially",
);
same(
  findEndForm(memoryB, basisB.O),
  undefined,
  "receiver END_FORM(O) absent initially",
);

// Physical bytes are first stored as ordinary canonical byte Links.
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
sameBytes(received, wire, "receiver reads exact physical bytes");

// Physical representation must not itself materialize the described targets.
same(
  findStartForm(memoryB, basisB.C),
  undefined,
  "byte carrier does not create START_FORM(C)",
);
same(
  findEndForm(memoryB, basisB.O),
  undefined,
  "byte carrier does not create END_FORM(O)",
);

// Parse only representation topology.
const carrierWholeB = materializeV013HierarchicalCarrier(
  memoryB,
  basisB,
  received,
);

same(
  findStartForm(memoryB, basisB.C),
  undefined,
  "hierarchical parser does not create START_FORM(C)",
);
same(
  findEndForm(memoryB, basisB.O),
  undefined,
  "hierarchical parser does not create END_FORM(O)",
);

const beforeSerializeB = memoryB.linkCount;
const wireB = serializeV013HierarchicalCarrier(
  memoryB,
  basisB,
  carrierWholeB,
);
same(memoryB.linkCount, beforeSerializeB, "receiver serializer is read-only");
sameBytes(wireB, wire, "receiver carrier has canonical wire parity");

assert(
  carrierWholeA !== carrierWholeB,
  "hierarchical carrier handles are Memory-local",
);

// The receiver carrier still exposes exact hierarchy by Link poles.
const namespaceB = memoryB.ensure(basisB.L, basisB.L);
const unquoteB = (quoted: LinkHandle): LinkHandle => {
  const poles = memoryB.poles(quoted);
  same(poles.start, namespaceB, "receiver quoted value namespace");
  return poles.end;
};
const topB = readExactSequence(memoryB, carrierWholeB).values.map(unquoteB);
same(topB.length, 3, "receiver PAIR carrier arity");
same(topB[0], basisB.L, "receiver PAIR tag");
const leftB = topB[1]!;
const rightB = topB[2]!;
const leftValues = readExactSequence(memoryB, leftB).values.map(unquoteB);
const rightValues = readExactSequence(memoryB, rightB).values.map(unquoteB);
same(leftValues[0], basisB.O, "receiver left child is START");
same(rightValues[0], basisB.C, "receiver right child is END");

// Malformed physical framing is rejected before representation writes.
for (const malformed of [
  Uint8Array.from([0xff]),
  Uint8Array.from([0x39]),
  Uint8Array.from([0x38, 0x38]),
]) {
  const isolated = new Memory();
  const isolatedBasis = ensureRootBasis(isolated);
  const before = isolated.linkCount;
  expectCarrierError(
    () => materializeV013HierarchicalCarrier(
      isolated,
      isolatedBasis,
      malformed,
    ),
    "invalid-wire",
  );
  same(
    isolated.linkCount,
    before,
    "malformed framing writes zero representation Links",
  );
}

// A semantic root-basis Link is not silently accepted as a quoted hierarchy
// node merely because it happens to be an ExactSequence-compatible shape.
{
  const before = memoryB.linkCount;
  expectCarrierError(
    () => serializeV013HierarchicalCarrier(memoryB, basisB, basisB.O),
    "invalid-carrier",
  );
  same(memoryB.linkCount, before, "invalid carrier serialization is read-only");
}

console.log(
  "MTS v0.13 historical 1/6/8/9 quaternary carrier two-memory transport: GREEN.",
);
