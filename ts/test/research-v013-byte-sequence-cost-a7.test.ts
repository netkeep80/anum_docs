import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import { serializeQuaternaryLink } from "../src/quaternary-serialization.js";
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

// Existing accepted v0.12 precedent: once the semantic domain is already known
// to be a flat Q fold of L/U, the contextual serializer emits one Q value sign
// per Boolean instead of recursively spelling each L/U Link as a generic tree.
// This is a comparison baseline only; its old Q alphabet is not the v0.13
// ROOT/START/END/PAIR foundation alphabet.
{
  const wires = new Set<string>();
  for (let byte = 0; byte <= 0xff; byte += 1) {
    const memory = new Memory();
    const basis = ensureRootBasis(memory);
    const values = booleanValues(byte, basis);
    const semantic = foldResult(memory, basis, values);
    const wire = serializeQuaternaryLink(memory, basis, semantic);
    same(wire.length, 8, "legacy contextual flat-Q byte length");
    same(wire, byte.toString(2).padStart(8, "0"), "legacy contextual flat-Q exact bits");
    wires.add(wire);
  }
  same(wires.size, 256, "legacy contextual flat-Q remains injective for all bytes");
}

function aspectSignForBooleanPair(
  basis: RootBasis,
  first: LinkHandle,
  second: LinkHandle,
): LinkHandle {
  const s = first === basis.L ? "1" : first === basis.U ? "0" : undefined;
  const e = second === basis.L ? "1" : second === basis.U ? "0" : undefined;
  assert(s !== undefined && e !== undefined, "contextual pair accepts only L/U");

  if (s === "1" && e === "1") return basis.R;
  if (s === "1" && e === "0") return basis.O;
  if (s === "0" && e === "1") return basis.C;
  return basis.L;
}

function physicalAspectSign(basis: RootBasis, sign: LinkHandle): string {
  if (sign === basis.R) return "8";
  if (sign === basis.O) return "9";
  if (sign === basis.C) return "6";
  if (sign === basis.L) return "1";
  throw new Error("not a v0.13 root aspect sign");
}

function rootAspectSign(basis: RootBasis, symbol: string): LinkHandle {
  if (symbol === "8") return basis.R;
  if (symbol === "9") return basis.O;
  if (symbol === "6") return basis.C;
  if (symbol === "1") return basis.L;
  throw new Error("not a v0.13 root aspect symbol");
}

/**
 * Research-only contextual codec for the SAME ExactSequence<L/U> target.
 *
 * One v0.13 aspect sign contributes its own two structural truth predicates:
 *
 *   R -> 11
 *   O -> 10
 *   C -> 01
 *   L -> 00
 *
 * Under an explicit BYTE8 Boolean context, predicate truth is reified as
 * TRUE=L and predicate falsehood as FALSE=U. Four signs therefore reconstruct
 * eight semantic Boolean positions and then the original ExactSequence Link.
 *
 * This witness proves a possible four-abit payload only under that explicit
 * context. It does not yet provide Link-native Dictionary/Grammar/Theory
 * authority for selecting the codec and does not count context-establishment
 * cost C_init.
 */
function encodeContextualByte8(memory: Memory, basis: RootBasis, target: LinkHandle): string {
  const values = readExactSequence(memory, target).values;
  same(values.length, 8, "BYTE8 context requires exactly eight Boolean values");
  let wire = "";
  for (let index = 0; index < 8; index += 2) {
    const sign = aspectSignForBooleanPair(basis, values[index]!, values[index + 1]!);
    const expected =
      (values[index] === basis.L ? "1" : "0") +
      (values[index + 1] === basis.L ? "1" : "0");
    same(
      decomposeV013SemanticLink(memory, basis, sign).selfIncidence,
      expected,
      "aspect sign structurally carries the requested Boolean pair",
    );
    wire += physicalAspectSign(basis, sign);
  }
  return wire;
}

function decodeContextualByte8(
  memory: Memory,
  basis: RootBasis,
  wire: string,
): LinkHandle {
  same(wire.length, 4, "BYTE8 contextual payload has four aspect signs");
  const values: LinkHandle[] = [];
  for (const symbol of wire) {
    const sign = rootAspectSign(basis, symbol);
    const pair = decomposeV013SemanticLink(memory, basis, sign).selfIncidence;
    values.push(pair[0] === "1" ? basis.L : basis.U);
    values.push(pair[1] === "1" ? basis.L : basis.U);
  }
  return materializeExactSequence(memory, values);
}

{
  // With a fixed four-sign alphabet, 3 positions distinguish only 4^3 = 64
  // values while 4 positions distinguish exactly 4^4 = 256 byte values.
  assert(4 ** 3 < 256, "three v0.13 abits cannot distinguish every byte");
  same(4 ** 4, 256, "four v0.13 abits are the fixed-length lower bound");

  const wires = new Set<string>();
  for (let byte = 0; byte <= 0xff; byte += 1) {
    const memory = new Memory();
    const basis = ensureRootBasis(memory);
    const target = materializeExactSequence(memory, booleanValues(byte, basis));
    const wire = encodeContextualByte8(memory, basis, target);
    same(wire.length, 4, "contextual BYTE8 payload length");
    assert(/^[8961]{4}$/.test(wire), "contextual BYTE8 uses only v0.13 aspect signs");
    assert(!wires.has(wire), "contextual BYTE8 must be injective");
    wires.add(wire);

    const replayed = decodeContextualByte8(memory, basis, wire);
    same(replayed, target, "contextual BYTE8 reconstructs the same ExactSequence<L/U> Link");
  }
  same(wires.size, 256, "contextual BYTE8 covers all 256 byte values");
}
