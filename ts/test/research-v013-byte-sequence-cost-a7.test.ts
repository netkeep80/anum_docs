import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import { materializeSequence } from "../src/sequence.js";
import {
  decomposeV013SemanticLink,
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function booleanValues(byte: number, basis: RootBasis): readonly LinkHandle[] {
  const values: LinkHandle[] = [];
  for (let shift = 7; shift >= 0; shift -= 1) {
    // Author research premise for A7:
    // TRUE = L (connectedness/existence), FALSE = U (disconnectedness/non-existence).
    values.push(((byte >>> shift) & 1) === 1 ? basis.L : basis.U);
  }
  return Object.freeze(values);
}

function structuralWire(memory: Memory, basis: RootBasis, semantic: LinkHandle): string {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(memory, basis, semantic);
  return String.fromCharCode(...serializeV013HierarchicalCarrier(memory, basis, carrier));
}

function exactSequence(memory: Memory, _basis: RootBasis, values: readonly LinkHandle[]): LinkHandle {
  return materializeExactSequence(memory, values);
}

function foldResult(memory: Memory, basis: RootBasis, values: readonly LinkHandle[]): LinkHandle {
  const description = Object.freeze({
    root: basis.R,
    items: Object.freeze(values.map((value) => Object.freeze({
      kind: "atom" as const,
      value,
    }))),
  });
  return materializeSequence(memory, description).result;
}

function rootedLeftFold(memory: Memory, basis: RootBasis, values: readonly LinkHandle[]): LinkHandle {
  let current = basis.R;
  for (const value of values) current = memory.ensure(current, value);
  return current;
}

function balancedPairTree(memory: Memory, _basis: RootBasis, values: readonly LinkHandle[]): LinkHandle {
  let level = [...values];
  while (level.length > 1) {
    assert(level.length % 2 === 0, "balanced byte tree requires an even level");
    const next: LinkHandle[] = [];
    for (let index = 0; index < level.length; index += 2) {
      next.push(memory.ensure(level[index]!, level[index + 1]!));
    }
    level = next;
  }
  return level[0]!;
}

/**
 * Research-only alternative representation, not an accepted byte law.
 *
 * The eight semantic Boolean values are projected to the orientation of their
 * first root pole:
 *
 *   TRUE  = L = O -> C  => START selector
 *   FALSE = U = C -> O  => END selector
 *
 * The selectors are nested around R in source order. This does NOT claim that
 * START is TRUE or END is FALSE. It tests whether a Link can losslessly
 * describe the L/U sequence through a structurally grounded Boolean projection.
 */
function booleanSelectorPath(memory: Memory, basis: RootBasis, values: readonly LinkHandle[]): LinkHandle {
  let current = basis.R;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]!;
    if (value === basis.L) current = memory.ensureStartSelfClosed(current);
    else if (value === basis.U) current = memory.ensureEndSelfClosed(current);
    else throw new Error("selector path accepts only L/U");
  }
  return current;
}

function readBooleanSelectorPath(
  memory: Memory,
  basis: RootBasis,
  semantic: LinkHandle,
): readonly LinkHandle[] {
  const values: LinkHandle[] = [];
  let current = semantic;
  while (current !== basis.R) {
    const decomposition = decomposeV013SemanticLink(memory, basis, current);
    if (decomposition.aspect === "START") {
      values.push(basis.L);
      current = decomposition.children[0]!;
      continue;
    }
    if (decomposition.aspect === "END") {
      values.push(basis.U);
      current = decomposition.children[0]!;
      continue;
    }
    throw new Error("selector path contains a non-unary step");
  }
  return Object.freeze(values);
}

interface Scheme {
  readonly id: string;
  readonly expectedLength: number;
  readonly build: (memory: Memory, basis: RootBasis, values: readonly LinkHandle[]) => LinkHandle;
}

const schemes: readonly Scheme[] = Object.freeze([
  Object.freeze({ id: "exact-sequence", expectedLength: 57, build: exactSequence }),
  Object.freeze({ id: "fold-result", expectedLength: 47, build: foldResult }),
  Object.freeze({ id: "rooted-left-fold", expectedLength: 49, build: rootedLeftFold }),
  Object.freeze({ id: "balanced-pair-tree", expectedLength: 47, build: balancedPairTree }),
  Object.freeze({ id: "boolean-selector-path", expectedLength: 9, build: booleanSelectorPath }),
]);

for (const scheme of schemes) {
  const lengths: number[] = [];
  const wires = new Set<string>();

  for (let byte = 0; byte <= 0xff; byte += 1) {
    const memory = new Memory();
    const basis = ensureRootBasis(memory);
    const values = booleanValues(byte, basis);

    // Ground the Boolean premise in actual root-basis topology.
    const l = memory.poles(basis.L);
    const u = memory.poles(basis.U);
    same(l.start, basis.O, "TRUE/L starts at O");
    same(l.end, basis.C, "TRUE/L ends at C");
    same(u.start, basis.C, "FALSE/U starts at C");
    same(u.end, basis.O, "FALSE/U ends at O");

    const semantic = scheme.build(memory, basis, values);
    const wire = structuralWire(memory, basis, semantic);
    lengths.push(wire.length);
    assert(!wires.has(wire), `${scheme.id}: distinct byte values must have distinct structural wires`);
    wires.add(wire);

    if (scheme.id === "boolean-selector-path") {
      const read = readBooleanSelectorPath(memory, basis, semantic);
      same(read.length, 8, "selector path has exactly eight Boolean positions");
      for (let index = 0; index < 8; index += 1) {
        same(read[index], values[index], `selector path replays Boolean position ${index}`);
      }
      assert(/^[96]{8}8$/.test(wire), "selector path is eight START/END selectors terminated by ROOT");
    }
  }

  same(wires.size, 256, `${scheme.id}: all byte values are injective`);
  same(Math.min(...lengths), scheme.expectedLength, `${scheme.id}: Lmin`);
  same(Math.max(...lengths), scheme.expectedLength, `${scheme.id}: Lmax`);
  same(
    lengths.reduce((sum, value) => sum + value, 0) / lengths.length,
    scheme.expectedLength,
    `${scheme.id}: Lavg`,
  );
}
