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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 hierarchical carrier: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

interface CarrierGrammar {
  readonly basis: RootBasis;
  root(): LinkHandle;
  start(child: LinkHandle): LinkHandle;
  end(child: LinkHandle): LinkHandle;
  pair(left: LinkHandle, right: LinkHandle): LinkHandle;
}

function grammar(memory: Memory): CarrierGrammar {
  const basis = ensureRootBasis(memory);
  return Object.freeze({
    basis,
    root: () => basis.R,
    start: (child) => materializeExactSequence(
      memory,
      [basis.O, child],
    ),
    end: (child) => materializeExactSequence(
      memory,
      [basis.C, child],
    ),
    pair: (left, right) => materializeExactSequence(
      memory,
      [basis.L, left, right],
    ),
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

function topValues(
  memory: Memory,
  carrier: LinkHandle,
): readonly LinkHandle[] {
  return readExactSequence(memory, carrier).values;
}

// Flat prefix/postfix spelling collides immediately.
const flatStartEndR = "♂" + "♂♀♀";
const flatEndStartR = "♂♂♀" + "♀";
same(
  flatStartEndR,
  flatEndStartR,
  "flat START(END(R)) and END(START(R)) collide",
);
same(flatStartEndR, "♂♂♀♀", "exact flat collision spelling");

// Memory A contains semantic targets and independently built carrier topology.
const memoryA = new Memory();
const gA = grammar(memoryA);

const endR_A = gA.basis.C;
const startR_A = gA.basis.O;
const semanticA = memoryA.ensureStartSelfClosed(endR_A);
const semanticB = memoryA.ensureEndSelfClosed(startR_A);
assert(semanticA !== semanticB, "nested semantic forms must be distinct");
const semanticS = memoryA.ensure(semanticA, semanticB);

const carrierEndR_A = gA.end(gA.root());
const carrierStartR_A = gA.start(gA.root());
const carrierA = gA.start(carrierEndR_A);
const carrierB = gA.end(carrierStartR_A);
const carrierS = gA.pair(carrierA, carrierB);

assert(carrierA !== carrierB, "hierarchical carrier preserves nesting order");
assert(carrierS !== semanticS, "carrier Whole is distinct from semantic Whole");

const topA = topValues(memoryA, carrierA);
const topB = topValues(memoryA, carrierB);
const topS = topValues(memoryA, carrierS);

same(topA.length, 2, "START carrier arity");
same(topA[0], gA.basis.O, "START carrier tag");
same(topA[1], carrierEndR_A, "START carrier exact child");

same(topB.length, 2, "END carrier arity");
same(topB[0], gA.basis.C, "END carrier tag");
same(topB[1], carrierStartR_A, "END carrier exact child");

same(topS.length, 3, "PAIR carrier arity");
same(topS[0], gA.basis.L, "PAIR carrier tag");
same(topS[1], carrierA, "PAIR exact left carrier");
same(topS[2], carrierB, "PAIR exact right carrier");

// Memory B starts with only the local root basis. Build the exact same carrier
// grammar there WITHOUT materializing the semantic targets.
const memoryB = new Memory();
const gB = grammar(memoryB);

same(
  findStartForm(memoryB, gB.basis.C),
  undefined,
  "START_FORM(C) absent before receiver carrier",
);
same(
  findEndForm(memoryB, gB.basis.O),
  undefined,
  "END_FORM(O) absent before receiver carrier",
);

const carrierEndR_B = gB.end(gB.root());
const carrierStartR_B = gB.start(gB.root());
const carrierA_B = gB.start(carrierEndR_B);
const carrierB_B = gB.end(carrierStartR_B);
const carrierS_B = gB.pair(carrierA_B, carrierB_B);

// Carrier construction itself must not create the semantic targets it describes.
same(
  findStartForm(memoryB, gB.basis.C),
  undefined,
  "receiver carrier does not materialize START_FORM(C)",
);
same(
  findEndForm(memoryB, gB.basis.O),
  undefined,
  "receiver carrier does not materialize END_FORM(O)",
);

const receiverTop = topValues(memoryB, carrierS_B);
same(receiverTop[0], gB.basis.L, "receiver PAIR tag is local L");
same(receiverTop[1], carrierA_B, "receiver exact left description");
same(receiverTop[2], carrierB_B, "receiver exact right description");

assert(carrierA !== carrierA_B, "carrier handles remain Memory-local");
assert(carrierB !== carrierB_B, "nested carrier handles remain Memory-local");
assert(carrierS !== carrierS_B, "top carrier handles remain Memory-local");

// The carrier is structurally self-describing by poles/ExactSequence; no flat
// glyph stream is consulted to distinguish the two colliding nested forms.
same(
  topValues(memoryB, receiverTop[1]!)[0],
  gB.basis.O,
  "receiver reads START nesting from Link carrier",
);
same(
  topValues(memoryB, receiverTop[2]!)[0],
  gB.basis.C,
  "receiver reads END nesting from Link carrier",
);

console.log(
  "MTS v0.13 hierarchical Link-carrier preserves nesting without semantic target: GREEN.",
);
