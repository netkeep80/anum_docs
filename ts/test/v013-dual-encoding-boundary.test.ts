import {
  deserializeStream,
  symbolicStackAlgebra,
} from "../src/anum.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  materializeQuaternaryAnum,
  materializeQuaternaryAnumTarget,
  resolveQuaternaryAnum,
  serializeMaterializedQuaternaryAnum,
} from "../src/quaternary-anum.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`#1583 dual encoding: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    `${message}: expected ${String(expected)}, got ${String(actual)}`,
  );
}

function structuralWire(
  memory: Memory,
  semantic: LinkHandle,
): string {
  const basis = ensureRootBasis(memory);
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    semantic,
  );
  return Buffer.from(
    serializeV013HierarchicalCarrier(memory, basis, carrier),
  ).toString("utf8");
}

// ---------------------------------------------------------------------------
// W1-W4 / form A: direct structural encoding describes Link topology itself.
// ---------------------------------------------------------------------------

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  same(structuralWire(memory, basis.R), "8", "R direct structural wire");
  same(structuralWire(memory, basis.O), "98", "O direct structural wire");
  same(structuralWire(memory, basis.C), "68", "C direct structural wire");
  same(structuralWire(memory, basis.L), "19868", "L direct structural wire");
  same(structuralWire(memory, basis.U), "16898", "U direct structural wire");
}

// ---------------------------------------------------------------------------
// R1/R2: ExactSequence is a third layer: ordered-position identity.
// Seq([])=R, while an explicit R position is a START-selfclosed cell.
// ---------------------------------------------------------------------------

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  const empty = materializeExactSequence(memory, []);
  same(empty, basis.R, "empty ExactSequence is R");

  const oneRoot = materializeExactSequence(memory, [basis.R]);
  same(
    oneRoot,
    basis.O,
    "one explicit R position is exactly START(R)=O",
  );

  const read = readExactSequence(memory, oneRoot);
  same(read.values.length, 1, "Seq([R]) has one exact position");
  same(read.values[0], basis.R, "Seq([R]) preserves R as the position value");
  same(read.cells[0], basis.O, "Seq([R]) cell is O");

  // Same semantic Link, different role:
  // O is simultaneously a structural START form and the canonical carrier
  // of the exact one-position sequence [R].
  same(
    structuralWire(memory, oneRoot),
    "98",
    "Seq([R]) carrier has O's direct structural description",
  );
}

// ---------------------------------------------------------------------------
// R2: Q is sequential/contextual denotation, not an injective Link-tree code.
// ---------------------------------------------------------------------------

{
  same(
    deserializeStream("", symbolicStackAlgebra).denotation,
    "R",
    "empty Q denotation",
  );
  same(
    deserializeStream("[]", symbolicStackAlgebra).denotation,
    "R",
    "empty nested Q context also denotes R",
  );
  same(
    deserializeStream("1", symbolicStackAlgebra).denotation,
    "L",
    "Q 1 denotes L",
  );
  same(
    deserializeStream("0", symbolicStackAlgebra).denotation,
    "U",
    "Q 0 denotes U",
  );
}

// The exact materialized Q Link alone does not distinguish epsilon from [].
// The supplied hierarchy witness does preserve/replay the two source forms.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  const epsilon = materializeQuaternaryAnum(memory, basis, "");
  const emptyNested = materializeQuaternaryAnum(memory, basis, "[]");

  same(epsilon.anumLink, basis.R, "epsilon Q carrier is R");
  same(emptyNested.anumLink, basis.R, "[] Q carrier also collapses to R");
  same(
    epsilon.anumLink,
    emptyNested.anumLink,
    "epsilon and [] have the same final Link carrier",
  );

  same(
    serializeMaterializedQuaternaryAnum(memory, basis, epsilon),
    "",
    "epsilon hierarchy replays epsilon",
  );
  same(
    serializeMaterializedQuaternaryAnum(memory, basis, emptyNested),
    "[]",
    "[] hierarchy replays the nested source",
  );

  same(epsilon.items.length, 0, "epsilon hierarchy has no items");
  same(emptyNested.items.length, 1, "[] hierarchy keeps one child occurrence");
  assert(
    emptyNested.items[0]?.kind === "child",
    "[] distinction lives in the hierarchy witness, not final Link identity",
  );
}

// Q source 1 demonstrates three different objects:
// source token -> rooted Q address carrier -> resolved semantic target L.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const one = materializeQuaternaryAnum(memory, basis, "1");

  assert(one.anumLink !== basis.L, "Q source 1 carrier is not semantic L");
  same(
    memory.find(basis.R, basis.L),
    one.anumLink,
    "Q source 1 exact carrier is rooted R->L address Link",
  );
  same(
    resolveQuaternaryAnum(memory, basis, one),
    basis.L,
    "one root-cut resolves Q source 1 to semantic L",
  );
}

// ---------------------------------------------------------------------------
// R3 executable falsifier: current closed Q sources do not yield O/C as values.
// The structural proof in #1583 establishes the general finite-closure result;
// this corpus guards representative production paths, including nesting.
// ---------------------------------------------------------------------------

{
  const sources = Object.freeze([
    "",
    "[]",
    "1",
    "0",
    "10",
    "01",
    "11",
    "00",
    "[1]",
    "[0]",
    "1[0]",
    "0[1]",
    "[[]]",
    "[[1]]",
    "[10]",
    "10[01]",
    "[1][0]",
    "1[]0",
  ]);

  for (const source of sources) {
    const symbolic = deserializeStream(source, symbolicStackAlgebra).denotation;
    assert(symbolic !== "O", `${source}: Q denotation must not be O`);
    assert(symbolic !== "C", `${source}: Q denotation must not be C`);

    const memory = new Memory();
    const basis = ensureRootBasis(memory);
    const exact = materializeQuaternaryAnum(memory, basis, source);
    const target = materializeQuaternaryAnumTarget(
      memory,
      basis,
      exact,
    );

    assert(target !== basis.O, `${source}: Q target must not materialize O`);
    assert(target !== basis.C, `${source}: Q target must not materialize C`);
  }
}

console.log([
  "#1583 W1-W4 dual encoding witness: GREEN",
  "DIRECT_STRUCTURAL_ROOT_START_END_PAIR=EXPLICIT",
  "EXACT_SEQUENCE_LAYER=DISTINCT",
  "SEQ_ONE_ROOT_EQUALS_O=TRUE",
  "Q_EPSILON_AND_EMPTY_NESTED_DENOTATION_COLLIDE_AT_R=TRUE",
  "Q_ONE_RESOLVES_TO_L=TRUE",
  "Q_CLOSED_VALUE_START_END=NOT_OBSERVED_AND_STRUCTURALLY_EXCLUDED",
].join(" "));
