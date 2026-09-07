import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function distinct(values: readonly LinkHandle[], label: string): void {
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      assert(values[left] !== values[right], `${label}: positions ${left} and ${right} collapsed`);
    }
  }
}

const memory = new Memory();
const { R, O, C, L, U } = ensureRootBasis(memory);

// Include root-basis and unrelated nested starts so the falsifier cannot depend
// on an atomic-looking fixture or on host numeric labels.
const nestedA = memory.ensure(U, U);
const nestedB = memory.ensure(L, U);
const nestedC = memory.ensure(nestedA, nestedB);
const nestedD = memory.ensure(nestedB, nestedA);
const starts = [R, O, C, L, U, nestedA, nestedB, nestedC, nestedD] as const;
distinct(starts, "successor injectivity start corpus");

const successor = (start: LinkHandle): LinkHandle => memory.ensure(start, L);

// Equal starts resolve to one canonical successor, and every successor recovers
// the exact source Link as its left pole plus the shared L as its right pole.
for (let index = 0; index < starts.length; index += 1) {
  const start = starts[index]!;
  const first = successor(start);
  const second = successor(start);
  same(first, second, `equal start ${index} has canonical successor`);

  const poles = memory.poles(first);
  same(poles.start, start, `successor ${index} recovers exact start`);
  same(poles.end, L, `successor ${index} has exact L end`);
}

// Distinct starts must remain distinct after appending the same right pole L.
for (let left = 0; left < starts.length; left += 1) {
  for (let right = left + 1; right < starts.length; right += 1) {
    const leftStart = starts[left]!;
    const rightStart = starts[right]!;
    assert(leftStart !== rightStart, `start corpus ${left}/${right} must be distinct`);
    assert(
      successor(leftStart) !== successor(rightStart),
      `distinct starts ${left}/${right} must have distinct successors`,
    );
  }
}

// General theorem source is ordered-pole identity, not this finite enumeration:
// if (A -> L) = (B -> L), the one canonical Link has one exact start pole.
// Reading that pole from either presentation therefore yields A=B; L=L is the
// shared right-pole obligation. The corpus above only falsifies hidden collisions.
for (let left = 0; left < starts.length; left += 1) {
  for (let right = 0; right < starts.length; right += 1) {
    const leftStart = starts[left]!;
    const rightStart = starts[right]!;
    const leftSuccessor = successor(leftStart);
    const rightSuccessor = successor(rightStart);
    if (leftSuccessor === rightSuccessor) {
      same(memory.poles(leftSuccessor).start, leftStart, "equal successor left pole");
      same(memory.poles(rightSuccessor).start, rightStart, "equal successor right pole");
      same(leftStart, rightStart, "ordered-pole identity recovers equal starts");
    }
  }
}

console.log("T4_SUCCESSOR_INJECTIVITY_FINITE_STRUCTURE = SUPPORTED");
console.log("T4_GENERAL_ORDERED_POLE_DERIVATION = SUPPORTED");
console.log("PRODUCTION_DELTA = NONE");
console.log("PROOF_ANET = NOT TESTED");
console.log("REUSE = NOT TESTED");
