import {
  ExactSequenceError,
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
  QuaternaryAnumError,
  materializeQuaternaryAnum,
  serializeMaterializedQuaternaryAnum,
  type MaterializedQuaternaryAnum,
  type QuaternaryAnumHierarchy,
} from "../src/quaternary-anum.js";
import {
  materializeV012StringAnum,
  readV012StringAnum,
} from "../src/v012-string-anum.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 root-origin law: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function expectExactSequenceError(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof ExactSequenceError, `${message}: wrong error type`);
    same(error.code, "not-exact-sequence", `${message}: exact error code`);
    return;
  }
  throw new Error(`v0.13 root-origin law: ${message}: expected rejection`);
}

function expectQuaternaryError(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof QuaternaryAnumError, `${message}: wrong error type`);
    same(
      error.code,
      "invalid-anum-representation",
      `${message}: exact error code`,
    );
    return;
  }
  throw new Error(`v0.13 root-origin law: ${message}: expected rejection`);
}

function verifyExactSequenceStartsAtRoot(
  memory: Memory,
  final: LinkHandle,
): void {
  const read = readExactSequence(memory, final);
  let previous = memory.root;

  for (let index = 0; index < read.cells.length; index += 1) {
    const cell = read.cells[index]!;
    const value = read.values[index]!;
    const cellPoles = memory.poles(cell);
    same(cellPoles.start, cell, `cell ${index}: START-selfclosed position`);

    const payload = memory.poles(cellPoles.end);
    same(payload.start, previous, `cell ${index}: predecessor is rooted prefix`);
    same(payload.end, value, `cell ${index}: exact value`);
    previous = cell;
  }

  same(previous, final, "final cell equals selected sequence");
  if (read.cells.length === 0) {
    same(final, memory.root, "empty exact sequence is exactly R");
  }
}

function verifyHierarchyStartsAtRoot(
  memory: Memory,
  basis: RootBasis,
  hierarchy: QuaternaryAnumHierarchy,
  label: string,
): void {
  let current = basis.R;

  for (let index = 0; index < hierarchy.items.length; index += 1) {
    const item = hierarchy.items[index]!;
    if (item.kind === "child") {
      verifyHierarchyStartsAtRoot(
        memory,
        basis,
        item.anum,
        `${label}.child[${index}]`,
      );
    }

    const value = item.kind === "value" ? item.link : item.anum.anumLink;
    const next = memory.find(current, value);
    assert(next !== undefined, `${label}[${index}]: exact rooted edge exists`);
    current = next;
  }

  same(current, hierarchy.anumLink, `${label}: local context starts from R`);
}

const memory = new Memory();
const basis = ensureRootBasis(memory);

// ---------------------------------------------------------------------------
// 1. ExactSequence: the production carrier starts at memory.root by structure.
// ---------------------------------------------------------------------------

{
  const ordinary = memory.ensure(basis.L, basis.U);
  const vectors: readonly (readonly LinkHandle[])[] = Object.freeze([
    Object.freeze([]),
    Object.freeze([basis.R]),
    Object.freeze([basis.L, basis.U]),
    Object.freeze([basis.R, ordinary, basis.C, basis.O]),
  ]);

  for (const [index, values] of vectors.entries()) {
    const final = materializeExactSequence(memory, values);
    verifyExactSequenceStartsAtRoot(memory, final);

    const read = readExactSequence(memory, final);
    same(read.values.length, values.length, `ExactSequence ${index}: length`);
    for (let item = 0; item < values.length; item += 1) {
      same(
        read.values[item],
        values[item],
        `ExactSequence ${index}: value ${item}`,
      );
    }
  }
}

// A structurally similar START-selfclosed chain whose predecessor is L rather
// than R is not accepted as ExactSequence. Root-origin is therefore checked by
// the reader; it is not merely a builder convention.
{
  const payload = memory.ensure(basis.L, basis.U);
  const unrootedCell = memory.ensureStartSelfClosed(payload);
  const before = memory.linkCount;

  expectExactSequenceError(
    () => readExactSequence(memory, unrootedCell),
    "unrooted sequence-like chain",
  );
  same(memory.linkCount, before, "unrooted ExactSequence rejection is read-only");
}

// ---------------------------------------------------------------------------
// 2. Hierarchical quaternary Anum: EVERY local nested context begins from R.
// ---------------------------------------------------------------------------

{
  const sources = Object.freeze([
    "",
    "01",
    "[]",
    "0[1]0",
    "[01]1[0]",
    "0[1[0]1]0",
  ]);

  for (const source of sources) {
    const anum = materializeQuaternaryAnum(memory, basis, source);
    verifyHierarchyStartsAtRoot(memory, basis, anum, `Anum(${source})`);

    same(
      serializeMaterializedQuaternaryAnum(memory, basis, anum),
      source,
      `Anum(${source}) rooted round-trip`,
    );
  }
}

// A forged hierarchy cannot replace the implicit leading R by another Link.
// Serializer/replay always starts exact verification from basis.R.
{
  const unrootedTarget = memory.ensure(basis.L, basis.U);
  const forged: MaterializedQuaternaryAnum = Object.freeze({
    anumLink: unrootedTarget,
    items: Object.freeze([
      Object.freeze({
        kind: "value" as const,
        abit: "1" as const,
        link: basis.L,
      }),
    ]),
    rootClosed: false,
  });
  const before = memory.linkCount;

  expectQuaternaryError(
    () => serializeMaterializedQuaternaryAnum(memory, basis, forged),
    "forged unrooted Anum hierarchy",
  );
  same(memory.linkCount, before, "unrooted Anum rejection is read-only");
}

// ---------------------------------------------------------------------------
// 3. STRING is a concrete production Anum specialization and exposes R as the
//    first exact source prefix.
// ---------------------------------------------------------------------------

{
  const bytes = Uint8Array.from([0x00, 0x31, 0xe2, 0x88, 0x9e, 0xff]);
  const string = materializeV012StringAnum(memory, basis, bytes);
  const read = readV012StringAnum(memory, basis, string.anumLink);

  same(read.prefixes[0], basis.R, "STRING first prefix is R");
  same(
    read.prefixes[read.prefixes.length - 1],
    string.anumLink,
    "STRING final prefix is selected Anum",
  );

  for (let index = 0; index < read.byteLinks.length; index += 1) {
    const previous = read.prefixes[index]!;
    const current = read.prefixes[index + 1]!;
    const poles = memory.poles(current);
    same(poles.start, previous, `STRING prefix ${index + 1}: predecessor`);
    same(poles.end, read.byteLinks[index], `STRING prefix ${index + 1}: byte`);
  }
}

console.log(
  "MTS v0.13 AC6 root-origin law: ExactSequence, every hierarchical Anum context, and STRING prefixes originate at local R; unrooted lookalikes fail closed: GREEN.",
);
