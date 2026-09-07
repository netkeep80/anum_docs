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
const { L, U } = ensureRootBasis(memory);

// Host indices below label the finite challenge corpus only. Semantic identity is
// always recovered from ordinary Link construction, equality and exact poles.
const nat: LinkHandle[] = [U];
for (let index = 0; index < 8; index += 1) {
  nat.push(memory.ensure(nat[nat.length - 1]!, L));
}

const degree: LinkHandle[] = [L];
for (let index = 1; index < 8; index += 1) {
  degree.push(memory.ensure(degree[degree.length - 1]!, L));
}

// New candidate boundary: zero is U, while L remains the unit Link rather than
// being silently identified with the measured natural number one.
same(nat[0], U, "N0 is the zero/unlinked boundary U");
same(degree[0], L, "historical D1 remains the unit Link L");
const n1 = memory.ensure(U, L);
same(nat[1], n1, "N1 is exactly U -> L");
assert(nat[1] !== L, "N1 must not collapse to the unit Link L");

const n1Poles = memory.poles(nat[1]!);
same(n1Poles.start, U, "N1 starts at zero boundary U");
same(n1Poles.end, L, "N1 ends with one unit Link L");

// One uniform structural successor works from N0 onward: Succ(N) = N -> L.
const countAfterConstruction = memory.linkCount;
for (let index = 0; index < 8; index += 1) {
  same(memory.ensure(nat[index]!, L), nat[index + 1]!, `uniform successor N${index} -> N${index + 1}`);
}
same(memory.linkCount, countAfterConstruction, "re-resolving tested successors must not create new Links");

// Every positive tested Nat retains its exact predecessor as the left pole and
// the already-established unit L as the right pole.
for (let index = 1; index <= 8; index += 1) {
  const poles = memory.poles(nat[index]!);
  same(poles.start, nat[index - 1]!, `N${index} predecessor`);
  same(poles.end, L, `N${index} unit end`);
}

// The finite candidate carrier does not collapse.
distinct(nat, "zero-rooted Nat finite corpus");

// Preserve and verify the historical connectivity-degree family independently.
same(degree[0], L, "D1 = L");
for (let index = 1; index < degree.length; index += 1) {
  same(memory.ensure(degree[index - 1]!, L), degree[index]!, `historical D${index + 1} construction`);
  const poles = memory.poles(degree[index]!);
  same(poles.start, degree[index - 1]!, `historical D${index + 1} predecessor`);
  same(poles.end, L, `historical D${index + 1} unit end`);
}
distinct(degree, "historical L-degree finite corpus");

// In the tested finite range the new zero-rooted Nat family and historical
// L-degree family are structurally separate. This is falsification evidence,
// not yet the general separation theorem owned by the next Peano-law stage.
for (let natIndex = 0; natIndex < nat.length; natIndex += 1) {
  for (let degreeIndex = 0; degreeIndex < degree.length; degreeIndex += 1) {
    assert(
      nat[natIndex] !== degree[degreeIndex],
      `N${natIndex} unexpectedly collapsed to historical D${degreeIndex + 1}`,
    );
  }
}

console.log("ZERO_ROOTED_NAT_CARRIER_FINITE_STRUCTURE = SUPPORTED");
console.log("UNIFORM_SUCCESSOR_FINITE_STRUCTURE = SUPPORTED");
console.log("UNIT_LINK_SEPARATED_FROM_NAT_ONE = SUPPORTED");
console.log("HISTORICAL_L_DEGREE_FAMILY = PRESERVED");
console.log("production delta = NONE");
console.log("accepted semantic delta = NONE at N1 finite-structure stage");
