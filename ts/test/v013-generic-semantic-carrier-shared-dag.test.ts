import { readExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  materializeV013HierarchicalCarrier,
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 generic carrier: ${message}`);
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

function unquotedValues(
  memory: Memory,
  basis: RootBasis,
  carrier: LinkHandle,
): readonly LinkHandle[] {
  const namespace = memory.ensure(basis.L, basis.L);
  return Object.freeze(
    readExactSequence(memory, carrier).values.map((quoted) => {
      const poles = memory.poles(quoted);
      same(poles.start, namespace, "quoted carrier namespace");
      return poles.end;
    }),
  );
}

interface SemanticGraph {
  readonly basis: RootBasis;
  readonly x: LinkHandle;
  readonly y: LinkHandle;
  readonly shared: LinkHandle;
  readonly selfPair: LinkHandle;
  readonly tail: LinkHandle;
  readonly whole: LinkHandle;
}

function buildSemanticGraph(memory: Memory, withNoise: boolean): SemanticGraph {
  const basis = ensureRootBasis(memory);

  if (withNoise) {
    // Deliberately perturb allocation history without changing the graph below.
    const n1 = memory.ensure(basis.L, basis.U);
    const n2 = memory.ensure(n1, basis.C);
    const n3 = memory.ensureStartSelfClosed(n2);
    memory.ensure(n3, basis.O);
  }

  const x = memory.ensureStartSelfClosed(basis.C);
  const y = memory.ensureEndSelfClosed(basis.O);
  const shared = memory.ensure(x, y);

  // Ordinary X->X is not a self-incidence constructor. It is a proper PAIR
  // whose two semantic poles happen to be the same previously existing Link.
  const selfPair = memory.ensure(shared, shared);

  const tail = memory.ensureEndSelfClosed(selfPair);
  const whole = memory.ensure(shared, tail);

  return Object.freeze({
    basis,
    x,
    y,
    shared,
    selfPair,
    tail,
    whole,
  });
}

const memoryA = new Memory();
const graphA = buildSemanticGraph(memoryA, false);

// Root basis must itself be derivable from the same four carrier node forms.
const basisVectors: readonly [
  LinkHandle,
  readonly number[],
  string,
][] = Object.freeze([
  [graphA.basis.R, [0x00], "R = ROOT"],
  [graphA.basis.O, [0x01, 0x00], "O = START(ROOT)"],
  [graphA.basis.C, [0x02, 0x00], "C = END(ROOT)"],
  [
    graphA.basis.L,
    [0x03, 0x01, 0x00, 0x02, 0x00],
    "L = PAIR(O,C)",
  ],
  [
    graphA.basis.U,
    [0x03, 0x02, 0x00, 0x01, 0x00],
    "U = PAIR(C,O)",
  ],
]);

for (const [semantic, expected, label] of basisVectors) {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memoryA,
    graphA.basis,
    semantic,
  );
  sameBytes(
    serializeV013HierarchicalCarrier(memoryA, graphA.basis, carrier),
    expected,
    label,
  );
}

// Shared DAG:
//   X      = START(END(ROOT))
//   Y      = END(START(ROOT))
//   Shared = X -> Y
//   P      = Shared -> Shared
//
// The semantic sublink Shared occurs twice, but canonical carrier topology must
// retain one child Link locally even though the tree wire repeats its spelling.
const sharedCarrierA = materializeV013HierarchicalCarrierFromSemanticLink(
  memoryA,
  graphA.basis,
  graphA.shared,
);
const selfPairCarrierA = materializeV013HierarchicalCarrierFromSemanticLink(
  memoryA,
  graphA.basis,
  graphA.selfPair,
);
const selfPairValuesA = unquotedValues(
  memoryA,
  graphA.basis,
  selfPairCarrierA,
);

same(selfPairValuesA.length, 3, "self-pair carrier arity");
same(selfPairValuesA[0], graphA.basis.L, "self-pair carrier PAIR tag");
same(selfPairValuesA[1], sharedCarrierA, "self-pair left uses shared carrier");
same(selfPairValuesA[2], sharedCarrierA, "self-pair right reuses same carrier");

const sharedWire = Uint8Array.from([
  0x03,
  0x01, 0x02, 0x00,
  0x02, 0x01, 0x00,
]);
sameBytes(
  serializeV013HierarchicalCarrier(
    memoryA,
    graphA.basis,
    sharedCarrierA,
  ),
  sharedWire,
  "shared semantic sublink exact wire",
);

const selfPairWire = Uint8Array.from([
  0x03,
  ...sharedWire,
  ...sharedWire,
]);
sameBytes(
  serializeV013HierarchicalCarrier(
    memoryA,
    graphA.basis,
    selfPairCarrierA,
  ),
  selfPairWire,
  "shared child is repeated physically but not confused structurally",
);

// Mixed deeper form exercises PAIR(Shared, END(PAIR(Shared,Shared))).
const wholeCarrierA = materializeV013HierarchicalCarrierFromSemanticLink(
  memoryA,
  graphA.basis,
  graphA.whole,
);
const wholeWireA = serializeV013HierarchicalCarrier(
  memoryA,
  graphA.basis,
  wholeCarrierA,
);

// An independent Memory with a deliberately different allocation history must
// derive byte-identical representation from the same semantic pole structure.
const memoryC = new Memory();
const graphC = buildSemanticGraph(memoryC, true);

assert(graphA.shared !== graphC.shared, "shared semantic handles are local");
assert(graphA.selfPair !== graphC.selfPair, "self-pair handles are local");
assert(graphA.whole !== graphC.whole, "whole handles are local");

const wholeCarrierC = materializeV013HierarchicalCarrierFromSemanticLink(
  memoryC,
  graphC.basis,
  graphC.whole,
);
const wholeWireC = serializeV013HierarchicalCarrier(
  memoryC,
  graphC.basis,
  wholeCarrierC,
);
sameBytes(
  wholeWireC,
  wholeWireA,
  "allocation history does not enter semantic carrier wire",
);

// Fresh receiver reconstructs only the carrier. Repeated physical subtrees must
// canonicalize back to one local child carrier Link.
const memoryB = new Memory();
const basisB = ensureRootBasis(memoryB);
const selfPairCarrierB = materializeV013HierarchicalCarrier(
  memoryB,
  basisB,
  selfPairWire,
);
const selfPairValuesB = unquotedValues(
  memoryB,
  basisB,
  selfPairCarrierB,
);

same(selfPairValuesB.length, 3, "receiver self-pair carrier arity");
same(selfPairValuesB[0], basisB.L, "receiver self-pair PAIR tag");
same(
  selfPairValuesB[1],
  selfPairValuesB[2],
  "duplicated wire subtree canonicalizes to one local carrier child",
);
assert(
  selfPairValuesB[1] !== sharedCarrierA,
  "shared carrier identity remains Memory-local",
);
sameBytes(
  serializeV013HierarchicalCarrier(memoryB, basisB, selfPairCarrierB),
  selfPairWire,
  "receiver shared-DAG carrier reserializes exactly",
);

// The deeper mixed graph is also representable without allocation identifiers.
const wholeCarrierB = materializeV013HierarchicalCarrier(
  memoryB,
  basisB,
  wholeWireA,
);
sameBytes(
  serializeV013HierarchicalCarrier(memoryB, basisB, wholeCarrierB),
  wholeWireA,
  "deep mixed graph carrier round-trip",
);

console.log(
  "MTS v0.13 generic semantic Link -> ROOT/START/END/PAIR carrier with shared DAG: GREEN.",
);
