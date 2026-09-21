import {
  MemoryError,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 cyclic graph description: ${message}`);
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

type QTree =
  | Readonly<{ kind: "ROOT" }>
  | Readonly<{ kind: "START"; child: QTree }>
  | Readonly<{ kind: "END"; child: QTree }>
  | Readonly<{ kind: "PAIR"; left: QTree; right: QTree }>;

interface GraphRecord {
  readonly start: number;
  readonly end: number;
}

interface GraphDescription {
  readonly records: readonly GraphRecord[];
}

const qRoot = (): QTree => Object.freeze({ kind: "ROOT" });
const qStart = (child: QTree): QTree =>
  Object.freeze({ kind: "START", child });
const qEnd = (child: QTree): QTree =>
  Object.freeze({ kind: "END", child });
const qPair = (left: QTree, right: QTree): QTree =>
  Object.freeze({ kind: "PAIR", left, right });

function qNat(value: number): QTree {
  assert(Number.isSafeInteger(value) && value >= 0, "natural index");
  let result = qRoot();
  for (let index = 0; index < value; index += 1) {
    result = qStart(result);
  }
  return result;
}

function qRef(index: number): QTree {
  return qEnd(qNat(index));
}

function qRecord(record: GraphRecord): QTree {
  return qPair(qRef(record.start), qRef(record.end));
}

function qList(records: readonly GraphRecord[]): QTree {
  let result = qRoot();
  for (let index = records.length - 1; index >= 0; index -= 1) {
    result = qStart(qPair(qRecord(records[index]!), result));
  }
  return result;
}

function qGraph(records: readonly GraphRecord[]): QTree {
  // START(ROOT) is a representation-local "graph-v1" tag.
  // It is not a fifth wire symbol and does not denote a semantic target.
  return qPair(qStart(qRoot()), qList(records));
}

function serialize(tree: QTree): Uint8Array {
  const bytes: number[] = [];

  const visit = (node: QTree): void => {
    switch (node.kind) {
      case "ROOT":
        bytes.push(0x38); // "8"
        return;
      case "START":
        bytes.push(0x39); // "9"
        visit(node.child);
        return;
      case "END":
        bytes.push(0x36); // "6"
        visit(node.child);
        return;
      case "PAIR":
        bytes.push(0x31); // "1"
        visit(node.left);
        visit(node.right);
        return;
    }
  };

  visit(tree);
  return Uint8Array.from(bytes);
}

function parse(bytes: Uint8Array): QTree {
  let offset = 0;

  const read = (): QTree => {
    assert(offset < bytes.length, "truncated quaternary tree");
    const opcode = bytes[offset++]!;

    if (opcode === 0x38) return qRoot();
    if (opcode === 0x39) return qStart(read());
    if (opcode === 0x36) return qEnd(read());
    if (opcode === 0x31) return qPair(read(), read());
    throw new Error("v0.13 cyclic graph description: non-quaternary physical state");
  };

  const result = read();
  same(offset, bytes.length, "no trailing physical states");
  return result;
}

function readNat(tree: QTree): number {
  let value = 0;
  let cursor = tree;
  while (cursor.kind === "START") {
    value += 1;
    cursor = cursor.child;
  }
  assert(cursor.kind === "ROOT", "reference index must be START* ROOT");
  return value;
}

function readRef(tree: QTree): number {
  assert(tree.kind === "END", "reference must be END(Nat)");
  return readNat(tree.child);
}

function readRecord(tree: QTree): GraphRecord {
  assert(tree.kind === "PAIR", "graph node record must be PAIR");
  return Object.freeze({
    start: readRef(tree.left),
    end: readRef(tree.right),
  });
}

function readList(tree: QTree): readonly GraphRecord[] {
  const records: GraphRecord[] = [];
  let cursor = tree;

  while (cursor.kind !== "ROOT") {
    assert(cursor.kind === "START", "graph record list must be START-cons");
    assert(cursor.child.kind === "PAIR", "graph list cons payload must be PAIR");
    records.push(readRecord(cursor.child.left));
    cursor = cursor.child.right;
  }

  return Object.freeze(records);
}

function decodeGraph(tree: QTree): GraphDescription {
  assert(tree.kind === "PAIR", "graph envelope must be PAIR");
  assert(tree.left.kind === "START", "graph envelope version tag");
  assert(tree.left.child.kind === "ROOT", "graph-v1 tag is START(ROOT)");

  const records = readList(tree.right);
  assert(records.length > 0, "graph must describe at least the selected Link");

  for (const [index, record] of records.entries()) {
    assert(
      record.start >= 0 &&
        record.start < records.length &&
        record.end >= 0 &&
        record.end < records.length,
      `record ${index} references an unknown representation-local node`,
    );
  }

  return Object.freeze({ records });
}

function describeFiniteGraph(
  memory: ReadMemory,
  selected: LinkHandle,
): GraphDescription {
  const localIndex = new Map<LinkHandle, number>();
  const records: Array<GraphRecord | undefined> = [];

  const visit = (link: LinkHandle): number => {
    const known = localIndex.get(link);
    if (known !== undefined) return known;

    // The index is assigned on first structural occurrence, before traversing
    // children. Therefore self/mutual cycles become finite local references.
    const index = records.length;
    localIndex.set(link, index);
    records.push(undefined);

    const poles = memory.poles(link);
    const start = visit(poles.start);
    const end = visit(poles.end);
    records[index] = Object.freeze({ start, end });
    return index;
  };

  same(visit(selected), 0, "selected Link is canonical representation node 0");
  assert(records.every((record) => record !== undefined), "all graph records resolved");

  return Object.freeze({
    records: Object.freeze(records as GraphRecord[]),
  });
}

function graphWire(
  memory: ReadMemory,
  selected: LinkHandle,
): Uint8Array {
  return serialize(qGraph(describeFiniteGraph(memory, selected).records));
}

class SyntheticReadMemory implements ReadMemory {
  constructor(
    readonly root: LinkHandle,
    private readonly cells: ReadonlyMap<LinkHandle, LinkPoles>,
  ) {}

  get linkCount(): number {
    return this.cells.size;
  }

  poles(link: LinkHandle): LinkPoles {
    const value = this.cells.get(link);
    if (value === undefined) throw new MemoryError("synthetic unknown Link");
    return value;
  }

  find(): LinkHandle | undefined {
    return undefined;
  }

  outgoing(): readonly LinkHandle[] {
    return [];
  }

  incoming(): readonly LinkHandle[] {
    return [];
  }
}

const handle = (): LinkHandle => Object.freeze({}) as LinkHandle;

interface RootedCycleFixture {
  readonly memory: ReadMemory;
  readonly target: LinkHandle;
}

function rootedCycleFixture(reverseAllocation: boolean): RootedCycleFixture {
  // Deliberately vary object creation and Map insertion order. None of it may
  // enter transport identity.
  const made = Array.from({ length: 9 }, () => handle());
  const order = reverseAllocation ? [...made].reverse() : made;

  const R = order[0]!;
  const O = order[1]!;
  const C = order[2]!;
  const L = order[3]!;
  const U = order[4]!;
  const A = order[5]!;
  const B = order[6]!;
  const noise1 = order[7]!;
  const noise2 = order[8]!;

  // Root basis plus a genuinely non-self mutual cycle:
  //
  //   A = O ⟼ B
  //   B = A ⟼ C
  //
  // A <-> B is cyclic, while O/C provide explicit paths to R.
  const entries: Array<readonly [LinkHandle, LinkPoles]> = [
    [R, Object.freeze({ start: R, end: R })],
    [O, Object.freeze({ start: O, end: R })],
    [C, Object.freeze({ start: R, end: C })],
    [L, Object.freeze({ start: O, end: C })],
    [U, Object.freeze({ start: C, end: O })],
    [A, Object.freeze({ start: O, end: B })],
    [B, Object.freeze({ start: A, end: C })],
    [noise1, Object.freeze({ start: noise1, end: U })],
    [noise2, Object.freeze({ start: L, end: noise2 })],
  ];

  if (reverseAllocation) entries.reverse();

  return Object.freeze({
    memory: new SyntheticReadMemory(R, new Map(entries)),
    target: A,
  });
}

const first = rootedCycleFixture(false);
const second = rootedCycleFixture(true);

const descriptionA = describeFiniteGraph(first.memory, first.target);
const descriptionB = describeFiniteGraph(second.memory, second.target);

// Deterministic DFS is start-before-end and assigns a local index on first
// occurrence, so the same rooted topology yields the same representation-local
// table regardless of sender handles or allocation/insertion history.
const expected = Object.freeze([
  Object.freeze({ start: 1, end: 3 }), // A = O -> B
  Object.freeze({ start: 1, end: 2 }), // O = O -> R
  Object.freeze({ start: 2, end: 2 }), // R = R -> R
  Object.freeze({ start: 0, end: 4 }), // B = A -> C
  Object.freeze({ start: 2, end: 4 }), // C = R -> C
]);

same(
  JSON.stringify(descriptionA.records),
  JSON.stringify(expected),
  "rooted mutual-cycle canonical record table",
);
same(
  JSON.stringify(descriptionB.records),
  JSON.stringify(expected),
  "allocation-independent canonical record table",
);

const wireA = graphWire(first.memory, first.target);
const wireB = graphWire(second.memory, second.target);
sameBytes(wireA, wireB, "allocation-independent finite graph wire");

assert(
  wireA.every(
    (byte) => byte === 0x31 || byte === 0x36 || byte === 0x38 || byte === 0x39,
  ),
  "graph wire uses only physical alphabet 1/6/8/9",
);

const decoded = decodeGraph(parse(wireA));
same(
  JSON.stringify(decoded.records),
  JSON.stringify(expected),
  "wire round-trip preserves cyclic graph references",
);

// Representation-local refs are not sender Link IDs. They are canonical
// first-occurrence coordinates derived solely from labelled start/end topology.
assert(
  new TextDecoder().decode(wireA).length > expected.length,
  "wire carries structural graph description rather than runtime handles",
);

// Non-quaternary physical state fails closed in the representation parser.
{
  const corrupted = Uint8Array.from(wireA);
  corrupted[Math.floor(corrupted.length / 2)] = 0x32; // "2"
  let rejected = false;
  try {
    parse(corrupted);
  } catch (error) {
    assert(
      error instanceof Error &&
        error.message.includes("non-quaternary physical state"),
      "invalid fifth physical value has the exact rejection boundary",
    );
    rejected = true;
  }
  assert(rejected, "invalid fifth physical value is rejected");
}

console.log(
  `MTS v0.13 rooted mutual-cycle graph -> canonical finite 1/6/8/9 description: ${new TextDecoder().decode(wireA)}; allocation-independent and DESCRIPTION != TARGET: GREEN.`,
);
