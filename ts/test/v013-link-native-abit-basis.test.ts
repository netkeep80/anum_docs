import {
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  MemoryError,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 Link-native abit basis: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

type StructuralClass = "ROOT" | "START" | "END" | "PAIR";
type SelfIncidenceBits = "00" | "01" | "10" | "11";

interface Classification {
  readonly bits: SelfIncidenceBits;
  readonly kind: StructuralClass;
  readonly arity: 0 | 1 | 2;
  readonly physical: "8" | "9" | "6" | "1";
  readonly sign: LinkHandle;
}

function classify(
  memory: Memory,
  basis: RootBasis,
  link: LinkHandle,
): Classification {
  const poles = memory.poles(link);
  const startSelf = poles.start === link;
  const endSelf = poles.end === link;
  const bits = `${startSelf ? "1" : "0"}${endSelf ? "1" : "0"}` as SelfIncidenceBits;

  switch (bits) {
    case "11":
      same(link, basis.R, "the only both-self-closed semantic Link is R");
      return Object.freeze({
        bits,
        kind: "ROOT",
        arity: 0,
        physical: "8",
        sign: basis.R,
      });
    case "10":
      return Object.freeze({
        bits,
        kind: "START",
        arity: 1,
        physical: "9",
        sign: basis.O,
      });
    case "01":
      return Object.freeze({
        bits,
        kind: "END",
        arity: 1,
        physical: "6",
        sign: basis.C,
      });
    case "00":
      return Object.freeze({
        bits,
        kind: "PAIR",
        arity: 2,
        physical: "1",
        sign: basis.L,
      });
  }
}

function canonicalWire(
  memory: Memory,
  basis: RootBasis,
  semantic: LinkHandle,
): string {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    semantic,
  );
  return new TextDecoder().decode(
    serializeV013HierarchicalCarrier(memory, basis, carrier),
  );
}

function buildSemanticCorpus(
  memory: Memory,
  basis: RootBasis,
): readonly LinkHandle[] {
  const result: LinkHandle[] = [
    basis.R,
    basis.O,
    basis.C,
    basis.L,
    basis.U,
  ];
  let frontier: readonly LinkHandle[] = [
    basis.O,
    basis.C,
    basis.L,
    basis.U,
  ];

  for (let depth = 0; depth < 3; depth += 1) {
    const next: LinkHandle[] = [];
    for (const link of frontier) {
      const start = memory.ensureStartSelfClosed(link);
      const end = memory.ensureEndSelfClosed(link);
      const equalPolePair = memory.ensure(link, link);
      const mixedPair = memory.ensure(link, basis.L);
      next.push(start, end, equalPolePair, mixedPair);
      result.push(start, end, equalPolePair, mixedPair);
    }
    frontier = Object.freeze(next);
  }

  return Object.freeze(result);
}

function addAllocationNoise(memory: Memory, basis: RootBasis): void {
  const a = memory.ensure(basis.U, basis.O);
  const b = memory.ensureStartSelfClosed(a);
  const c = memory.ensureEndSelfClosed(b);
  memory.ensure(c, basis.C);
}

function expectForeignHandleRejected(
  memory: Memory,
  basis: RootBasis,
  foreign: LinkHandle,
): void {
  try {
    classify(memory, basis, foreign);
  } catch (error) {
    assert(error instanceof MemoryError, "foreign abit candidate fails as MemoryError");
    return;
  }
  throw new Error("v0.13 Link-native abit basis: foreign handle was accepted");
}

const memoryA = new Memory();
const basisA = ensureRootBasis(memoryA);
const corpusA = buildSemanticCorpus(memoryA, basisA);

const memoryB = new Memory();
const basisB = ensureRootBasis(memoryB);
addAllocationNoise(memoryB, basisB);
const corpusB = buildSemanticCorpus(memoryB, basisB);

same(corpusA.length, corpusB.length, "two-memory corpus cardinality");

// The historical 0/1 -> 1/6/9/8 table is exactly the two-bit
// self-incidence classifier of the Link itself.
const expected = Object.freeze({
  "00": Object.freeze({ kind: "PAIR", physical: "1", arity: 2, sign: basisA.L }),
  "01": Object.freeze({ kind: "END", physical: "6", arity: 1, sign: basisA.C }),
  "10": Object.freeze({ kind: "START", physical: "9", arity: 1, sign: basisA.O }),
  "11": Object.freeze({ kind: "ROOT", physical: "8", arity: 0, sign: basisA.R }),
} as const);

const observedBits = new Set<SelfIncidenceBits>();
const observedKinds = new Set<StructuralClass>();

for (let index = 0; index < corpusA.length; index += 1) {
  const linkA = corpusA[index]!;
  const linkB = corpusB[index]!;
  const classA = classify(memoryA, basisA, linkA);
  const classB = classify(memoryB, basisB, linkB);

  observedBits.add(classA.bits);
  observedKinds.add(classA.kind);

  same(classA.kind, expected[classA.bits].kind, "historical table class");
  same(classA.physical, expected[classA.bits].physical, "historical table physical sign");
  same(classA.arity, expected[classA.bits].arity, "historical table arity");
  same(classA.sign, expected[classA.bits].sign, "Link-native sign for structural class");

  same(classB.bits, classA.bits, "allocation-independent self-incidence bits");
  same(classB.kind, classA.kind, "allocation-independent structural class");
  same(classB.physical, classA.physical, "allocation-independent physical spelling");

  assert(linkA !== linkB, "semantic handles are Memory-local");

  const wireA = canonicalWire(memoryA, basisA, linkA);
  const wireB = canonicalWire(memoryB, basisB, linkB);
  same(wireB, wireA, "two-memory canonical wire");
  same(wireA[0], classA.physical, "wire tag is derived from local Link topology");
}

same(observedBits.size, 4, "exactly four self-incidence bit combinations observed");
same(observedKinds.size, 4, "exactly four structural classes observed");

// The canonical root-neighbourhood Links are the Link-native signs of those
// four classes. They remain ordinary decomposable Links, not a second ontology.
same(classify(memoryA, basisA, basisA.R).bits, "11", "R is ROOT class");
same(classify(memoryA, basisA, basisA.O).bits, "10", "O is START class");
same(classify(memoryA, basisA, basisA.C).bits, "01", "C is END class");
same(classify(memoryA, basisA, basisA.L).bits, "00", "L is PAIR class");

{
  const r = memoryA.poles(basisA.R);
  const o = memoryA.poles(basisA.O);
  const c = memoryA.poles(basisA.C);
  const l = memoryA.poles(basisA.L);

  same(r.start, basisA.R, "R start");
  same(r.end, basisA.R, "R end");
  same(o.start, basisA.O, "O start");
  same(o.end, basisA.R, "O end");
  same(c.start, basisA.R, "C start");
  same(c.end, basisA.C, "C end");
  same(l.start, basisA.O, "L start");
  same(l.end, basisA.C, "L end");
}

// U is useful in the rooted basis but it does not create a fifth structural
// class: U=C->O is an ordinary PAIR and therefore starts with physical abit 1.
same(classify(memoryA, basisA, basisA.U).kind, "PAIR", "U is not a fifth class");
same(classify(memoryA, basisA, basisA.U).sign, basisA.L, "U uses PAIR sign L");
same(canonicalWire(memoryA, basisA, basisA.U), "16898", "U canonical description");

// Abit sign identity and the canonical description of that sign are different
// layers. O is the Link-native START sign, while semantic O serializes as 98.
same(classify(memoryA, basisA, basisA.O).physical, "9", "START physical spelling");
same(classify(memoryA, basisA, basisA.O).sign, basisA.O, "START Link-native sign");
same(canonicalWire(memoryA, basisA, basisA.O), "98", "description(O) is not the one-byte START sign");
same(canonicalWire(memoryA, basisA, basisA.C), "68", "description(C)");
same(canonicalWire(memoryA, basisA, basisA.L), "19868", "description(L)");

// Inspect the actual Link-native carrier: a START node stores a quoted O Link
// as its tag; a PAIR node stores a quoted L Link. The host glyph is not the
// carrier's semantic identity.
{
  const carrierO = materializeV013HierarchicalCarrierFromSemanticLink(
    memoryA,
    basisA,
    basisA.O,
  );
  assert(carrierO !== basisA.O, "representation carrier is not semantic O");
  const namespace = memoryA.ensure(basisA.L, basisA.L);
  const startValues = readExactSequence(memoryA, carrierO).values;
  same(startValues.length, 2, "START carrier arity");
  const quotedStart = memoryA.poles(startValues[0]!);
  same(quotedStart.start, namespace, "START tag quote namespace");
  same(quotedStart.end, basisA.O, "START tag is stored as Link O");

  const carrierU = materializeV013HierarchicalCarrierFromSemanticLink(
    memoryA,
    basisA,
    basisA.U,
  );
  const pairValues = readExactSequence(memoryA, carrierU).values;
  same(pairValues.length, 3, "PAIR carrier arity");
  const quotedPair = memoryA.poles(pairValues[0]!);
  same(quotedPair.start, namespace, "PAIR tag quote namespace");
  same(quotedPair.end, basisA.L, "PAIR tag is stored as Link L");
}

// A sender-local handle cannot become abit identity in another Memory.
expectForeignHandleRejected(memoryA, basisA, basisB.O);
expectForeignHandleRejected(memoryB, basisB, basisA.L);

console.log(
  "MTS v0.13 Link-native abit basis: self-incidence 00/01/10/11 -> PAIR/END/START/ROOT -> L/C/O/R -> 1/6/9/8, U is not a fifth class, two-memory and sign-vs-description boundaries: GREEN.",
);
