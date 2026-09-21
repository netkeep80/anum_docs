import {
  encodeBytesToQuaternary,
} from "../src/byte-carrier.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  QuaternaryAnumError,
  materializeQuaternaryAnum,
  resolveQuaternaryAnum,
  serializeMaterializedQuaternaryAnum,
  type MaterializedQuaternaryAnum,
} from "../src/quaternary-anum.js";
import {
  materializeV012StringAnum,
  serializeV012StringAnum,
} from "../src/v012-string-anum.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 codec comparison: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function wire(
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

function expectInvalidV012Witness(
  effect: () => unknown,
  message: string,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof QuaternaryAnumError, `${message}: wrong error type`);
    same(error.code, "invalid-anum-representation", `${message}: error code`);
    return;
  }
  throw new Error(`v0.13 codec comparison: ${message}: expected rejection`);
}

interface UnknownWhole {
  readonly left: LinkHandle;
  readonly right: LinkHandle;
  readonly whole: LinkHandle;
}

function buildUnknownWhole(
  memory: Memory,
  basis: RootBasis,
): UnknownWhole {
  const left = memory.ensureStartSelfClosed(basis.C);
  const right = memory.ensureEndSelfClosed(basis.O);
  return Object.freeze({
    left,
    right,
    whole: memory.ensure(left, right),
  });
}

function addAllocationNoise(memory: Memory, basis: RootBasis): void {
  const a = memory.ensure(basis.U, basis.L);
  const b = memory.ensureEndSelfClosed(a);
  const c = memory.ensure(b, basis.O);
  memory.ensureStartSelfClosed(c);
}

// ---------------------------------------------------------------------------
// C1. v0.12 hierarchical Q spelling is not a function of Link topology alone.
// ---------------------------------------------------------------------------

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  const empty = materializeQuaternaryAnum(memory, basis, "");
  const rootClose = materializeQuaternaryAnum(memory, basis, "]");
  const nestedEmpty = materializeQuaternaryAnum(memory, basis, "[]");

  same(empty.anumLink, basis.R, "empty source has R topology");
  same(rootClose.anumLink, basis.R, "root-close source has R topology");
  same(nestedEmpty.anumLink, basis.R, "nested-empty source has R topology");

  same(
    serializeMaterializedQuaternaryAnum(memory, basis, empty),
    "",
    "empty source witness is preserved",
  );
  same(
    serializeMaterializedQuaternaryAnum(memory, basis, rootClose),
    "]",
    "root-close witness is preserved",
  );
  same(
    serializeMaterializedQuaternaryAnum(memory, basis, nestedEmpty),
    "[]",
    "nested-empty witness is preserved",
  );

  assert(
    empty.anumLink === rootClose.anumLink &&
      rootClose.anumLink === nestedEmpty.anumLink,
    "same v0.12 Link topology admits different exact protocol spellings",
  );
}

// A bare arbitrary semantic Link is not enough input for the accepted v0.12
// serializer. Its MaterializedQuaternaryAnum host witness carries protocol
// hierarchy that cannot be recovered from anumLink alone.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const unknown = buildUnknownWhole(memory, basis);
  const bare = Object.freeze({
    anumLink: unknown.whole,
    items: Object.freeze([]),
    rootClosed: false,
  }) as MaterializedQuaternaryAnum;

  expectInvalidV012Witness(
    () => serializeMaterializedQuaternaryAnum(memory, basis, bare),
    "bare semantic Link is not a v0.12 serialization witness",
  );
}

// ---------------------------------------------------------------------------
// C2. v0.13 canonical structural wire is derived from semantic Link topology.
// ---------------------------------------------------------------------------

{
  const memoryA = new Memory();
  const basisA = ensureRootBasis(memoryA);
  const unknownA = buildUnknownWhole(memoryA, basisA);

  const memoryB = new Memory();
  const basisB = ensureRootBasis(memoryB);
  addAllocationNoise(memoryB, basisB);
  const unknownB = buildUnknownWhole(memoryB, basisB);

  assert(unknownA.whole !== unknownB.whole, "unknown Whole handles are Memory-local");

  const wireA = wire(memoryA, basisA, unknownA.whole);
  const wireB = wire(memoryB, basisB, unknownB.whole);

  same(wireA, "1968698", "generic unknown Whole canonical wire");
  same(wireB, wireA, "allocation-independent generic Link serialization");
}

// ---------------------------------------------------------------------------
// C3. v0.12 is more compact for pre-agreed bootstrap meanings.
// ---------------------------------------------------------------------------

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  const qL = materializeQuaternaryAnum(memory, basis, "1");
  const qU = materializeQuaternaryAnum(memory, basis, "0");

  same(resolveQuaternaryAnum(memory, basis, qL), basis.L, "v0.12 one-symbol L lookup");
  same(resolveQuaternaryAnum(memory, basis, qU), basis.U, "v0.12 one-symbol U lookup");
  same(serializeMaterializedQuaternaryAnum(memory, basis, qL), "1", "v0.12 L source length");
  same(serializeMaterializedQuaternaryAnum(memory, basis, qU), "0", "v0.12 U source length");

  same(wire(memory, basis, basis.L), "19868", "v0.13 topology description of L");
  same(wire(memory, basis, basis.U), "16898", "v0.13 topology description of U");
}

// ---------------------------------------------------------------------------
// C4. Shared-DAG counterexample: unique semantic growth is linear while the
// current reference-free tree wire grows exponentially.
// ---------------------------------------------------------------------------

const dagMetrics: Array<{
  readonly depth: number;
  readonly uniqueNewSemanticLinks: number;
  readonly wireLength: number;
}> = [];

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const beforeSemantic = memory.linkCount;
  const chain: LinkHandle[] = [basis.U];

  for (let depth = 1; depth <= 10; depth += 1) {
    const previous = chain[chain.length - 1]!;
    chain.push(memory.ensure(previous, previous));
  }

  const afterSemantic = memory.linkCount;
  same(
    afterSemantic - beforeSemantic,
    10,
    "shared-DAG family adds one semantic Link per level",
  );

  for (let depth = 0; depth < chain.length; depth += 1) {
    const encoded = wire(memory, basis, chain[depth]!);
    const expectedLength = 6 * (2 ** depth) - 1;
    same(encoded.length, expectedLength, `shared-DAG wire recurrence at depth ${depth}`);
    dagMetrics.push(Object.freeze({
      depth,
      uniqueNewSemanticLinks: depth,
      wireLength: encoded.length,
    }));
  }
}

// ---------------------------------------------------------------------------
// C5. STRING workload: keep the accepted specialized v0.12 physical codec in
// the comparison. Generic structural transport is not assumed to be smaller.
// ---------------------------------------------------------------------------

const stringMetrics: Array<{
  readonly bytes: number;
  readonly v012PhysicalBytes: number;
  readonly v012QSourceSymbols: number;
  readonly v013GenericTopologySymbols: number;
}> = [];

for (const length of [1, 2, 4, 8]) {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const source = Uint8Array.from(
    Array.from({ length }, (_, index) => (index * 73 + 41) & 0xff),
  );

  const stringAnum = materializeV012StringAnum(memory, basis, source);
  const physical = serializeV012StringAnum(memory, basis, stringAnum);
  const qSource = encodeBytesToQuaternary(source);
  const generic = wire(memory, basis, stringAnum.anumLink);

  same(physical.length, length, `v0.12 STRING physical byte count for n=${length}`);
  same(qSource.length, length * 10, `v0.12 canonical Q source symbols for n=${length}`);

  stringMetrics.push(Object.freeze({
    bytes: length,
    v012PhysicalBytes: physical.length,
    v012QSourceSymbols: qSource.length,
    v013GenericTopologySymbols: generic.length,
  }));
}

console.log("MTS codec comparison — generic capability:");
console.log(
  "v0.12 exact Q serialization preserves host hierarchy witness; same anumLink R can serialize as '', ']' or '[]'.",
);
console.log(
  "v0.13 serializes the unknown semantic Whole directly from Link topology as 1968698 in independent Memories.",
);
console.log("MTS codec comparison — shared DAG:");
for (const metric of dagMetrics) {
  console.log(
    `depth=${metric.depth} uniqueNewSemanticLinks=${metric.uniqueNewSemanticLinks} v013WireSymbols=${metric.wireLength}`,
  );
}
console.log("MTS codec comparison — STRING:");
for (const metric of stringMetrics) {
  console.log(
    `bytes=${metric.bytes} v012PhysicalBytes=${metric.v012PhysicalBytes} v012QSymbols=${metric.v012QSourceSymbols} v013GenericTopologySymbols=${metric.v013GenericTopologySymbols}`,
  );
}
console.log(
  "MTS v0.12/v0.13 codec comparison: generic topology inverse advantage + bootstrap/STRING compactness and shared-DAG costs are all preserved as evidence: GREEN.",
);
