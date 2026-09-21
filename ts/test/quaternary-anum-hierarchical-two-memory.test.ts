// mts-version-evidence: required-from=0.12

import { readFileSync } from "node:fs";
import {
  normalizeRawForm,
  parseRawQuaternary,
} from "../src/anum.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  materializeQuaternaryAnum,
  resolveQuaternaryAnum,
  serializeMaterializedQuaternaryAnum,
  type MaterializedQuaternaryAnum,
} from "../src/quaternary-anum.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`hierarchical Q two-memory: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function bind(
  mapping: Map<LinkHandle, LinkHandle>,
  inverse: Map<LinkHandle, LinkHandle>,
  left: LinkHandle,
  right: LinkHandle,
): boolean {
  const existingRight = mapping.get(left);
  if (existingRight !== undefined) return existingRight === right;
  const existingLeft = inverse.get(right);
  if (existingLeft !== undefined) return existingLeft === left;
  mapping.set(left, right);
  inverse.set(right, left);
  return true;
}

function mappedRelationsRemainCompatible(
  left: Memory,
  right: Memory,
  mapping: ReadonlyMap<LinkHandle, LinkHandle>,
  inverse: ReadonlyMap<LinkHandle, LinkHandle>,
): boolean {
  for (const [leftLink, rightLink] of mapping) {
    const leftPoles = left.poles(leftLink);
    const rightPoles = right.poles(rightLink);

    const mappedStart = mapping.get(leftPoles.start);
    if (mappedStart !== undefined && mappedStart !== rightPoles.start) return false;
    const mappedEnd = mapping.get(leftPoles.end);
    if (mappedEnd !== undefined && mappedEnd !== rightPoles.end) return false;

    const inverseStart = inverse.get(rightPoles.start);
    if (inverseStart !== undefined && inverseStart !== leftPoles.start) return false;
    const inverseEnd = inverse.get(rightPoles.end);
    if (inverseEnd !== undefined && inverseEnd !== leftPoles.end) return false;
  }
  return true;
}

function structurallyEquivalentState(
  left: Memory,
  right: Memory,
  leftSelected: LinkHandle,
  rightSelected: LinkHandle,
): boolean {
  const leftLinks = left.allLinks();
  const rightLinks = right.allLinks();
  if (leftLinks.length !== rightLinks.length) return false;

  const mapping = new Map<LinkHandle, LinkHandle>();
  const inverse = new Map<LinkHandle, LinkHandle>();
  if (!bind(mapping, inverse, left.root, right.root)) return false;
  if (!bind(mapping, inverse, leftSelected, rightSelected)) return false;

  const search = (): boolean => {
    if (!mappedRelationsRemainCompatible(left, right, mapping, inverse)) return false;
    if (mapping.size === leftLinks.length) return true;

    const nextLeft = leftLinks.find((link) => !mapping.has(link));
    if (nextLeft === undefined) return false;

    for (const nextRight of rightLinks) {
      if (inverse.has(nextRight)) continue;
      mapping.set(nextLeft, nextRight);
      inverse.set(nextRight, nextLeft);
      if (search()) return true;
      mapping.delete(nextLeft);
      inverse.delete(nextRight);
    }
    return false;
  };

  return search();
}

interface FixtureExpectation {
  readonly path: string;
  readonly canonical: string;
  readonly verifyA: (
    memory: Memory,
    materialized: MaterializedQuaternaryAnum,
  ) => void;
}

const fixtures: readonly FixtureExpectation[] = Object.freeze([
  {
    path: "../examples/anum/conformance/q-hierarchical-byte-4d.anum",
    canonical: "[01001101]",
    verifyA(memory, materialized): void {
      assert(materialized.items.length === 1, "byte fixture has one root child");
      const first = materialized.items[0];
      assert(first?.kind === "child", "byte fixture root item is a child Anum");
      const before = memory.linkCount;
      same(
        resolveQuaternaryAnum(memory, ensureRootBasis(memory), materialized),
        first.anum.anumLink,
        "one Resolve of bracketed byte returns the exact inner byte Anum",
      );
      same(memory.linkCount, before, "bracketed-byte Resolve is read-only");
    },
  },
  {
    path: "../examples/anum/conformance/q-hierarchical-relative-indirect.anum",
    canonical: "01[[10]]",
    verifyA(memory, materialized): void {
      const basis = ensureRootBasis(memory);
      const before = memory.linkCount;
      same(
        resolveQuaternaryAnum(memory, basis, materialized),
        undefined,
        "relative-indirect address stays not-found when addressed semantic Links are absent",
      );
      same(
        memory.linkCount,
        before,
        "not-found Resolve does not materialize B01 or its addressed result",
      );
    },
  },
  {
    path: "../examples/anum/conformance/q-hierarchical-adjacent-bytes.anum",
    canonical: "[01001101][01010100]",
    verifyA(memory, materialized): void {
      const basis = ensureRootBasis(memory);
      assert(
        materialized.items.length === 2,
        "adjacent bytes remain two root-level hierarchical items",
      );
      const first = materialized.items[0];
      const second = materialized.items[1];
      assert(first?.kind === "child", "first adjacent byte remains one child Anum");
      assert(second?.kind === "child", "second adjacent byte remains one child Anum");
      assert(first.anum.items.length === 8, "first byte keeps its own 8-bit boundary");
      assert(second.anum.items.length === 8, "second byte keeps its own 8-bit boundary");
      assert(
        first.anum.anumLink !== second.anum.anumLink,
        "different byte payloads remain different exact child Anum Links",
      );

      const firstStep = memory.find(basis.R, first.anum.anumLink);
      assert(firstStep !== undefined, "parent has exact first grouped-byte edge");
      same(
        memory.find(firstStep, second.anum.anumLink),
        materialized.anumLink,
        "parent exact topology is a two-item chain of grouped byte Anums",
      );

      const before = memory.linkCount;
      same(
        resolveQuaternaryAnum(memory, basis, materialized),
        undefined,
        "adjacent grouped-byte address stays not-found without target materialization",
      );
      same(
        memory.linkCount,
        before,
        "adjacent grouped-byte Resolve stays read-only",
      );
    },
  },
  {
    path: "../examples/anum/conformance/q-hierarchical-nested-byte-pair.anum",
    canonical: "[[01001101][01010100]]",
    verifyA(memory, materialized): void {
      const basis = ensureRootBasis(memory);
      assert(
        materialized.items.length === 1,
        "nested byte pair has one outer root child",
      );
      const outer = materialized.items[0];
      assert(outer?.kind === "child", "nested byte pair outer item is a child Anum");
      assert(
        outer.anum.items.length === 2,
        "nested pair preserves two child byte groups inside its own local R context",
      );
      const first = outer.anum.items[0];
      const second = outer.anum.items[1];
      assert(first?.kind === "child", "nested pair first item remains one child byte Anum");
      assert(second?.kind === "child", "nested pair second item remains one child byte Anum");
      assert(first.anum.items.length === 8, "nested first byte keeps eight data bits");
      assert(second.anum.items.length === 8, "nested second byte keeps eight data bits");

      same(
        memory.find(basis.R, outer.anum.anumLink),
        materialized.anumLink,
        "outer R[ adds one exact indirection level around the byte-pair hierarchy",
      );

      const before = memory.linkCount;
      same(
        resolveQuaternaryAnum(memory, basis, materialized),
        outer.anum.anumLink,
        "one Resolve removes only the outer R[ level",
      );
      same(memory.linkCount, before, "nested pair Resolve stays read-only");
    },
  },
]);

for (const fixture of fixtures) {
  const source = readFileSync(fixture.path, "utf8");
  const canonicalFixture = normalizeRawForm(parseRawQuaternary(source));
  same(canonicalFixture, fixture.canonical, `canonical fixture ${fixture.path}`);

  const memoryA = new Memory();
  const basisA = ensureRootBasis(memoryA);
  const loadedA = materializeQuaternaryAnum(memoryA, basisA, source);
  assert(memoryA.linkCount > 5, `${fixture.path} materializes hierarchical non-basis Links`);
  fixture.verifyA(memoryA, loadedA);

  const beforeSerializeA = memoryA.linkCount;
  const wire = serializeMaterializedQuaternaryAnum(memoryA, basisA, loadedA);
  same(memoryA.linkCount, beforeSerializeA, `${fixture.path} serializer is read-only`);
  same(wire, canonicalFixture, `${fixture.path} canonical hierarchical wire`);

  const memoryB = new Memory();
  const basisB = ensureRootBasis(memoryB);
  const loadedB = materializeQuaternaryAnum(memoryB, basisB, wire);

  assert(
    structurallyEquivalentState(memoryA, memoryB, loadedA.anumLink, loadedB.anumLink),
    `${fixture.path} A/B full exact-Anum state parity`,
  );

  const beforeSerializeB = memoryB.linkCount;
  same(
    serializeMaterializedQuaternaryAnum(memoryB, basisB, loadedB),
    wire,
    `${fixture.path} Memory B canonical reserialization`,
  );
  same(memoryB.linkCount, beforeSerializeB, `${fixture.path} B serializer is read-only`);
}

// AN-F05: adjacent grouped bytes and one extra outer R[ hierarchy are exact-distinct
// even though both faithfully preserve the same two byte payload groups.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const adjacentSource = "[01001101][01010100]";
  const nestedSource = "[[01001101][01010100]]";
  const adjacent = materializeQuaternaryAnum(memory, basis, adjacentSource);
  const nested = materializeQuaternaryAnum(memory, basis, nestedSource);

  assert(
    adjacent.anumLink !== nested.anumLink,
    "AN-F05 adjacent and nested byte-pair carriers are exact-distinct Links",
  );
  same(
    serializeMaterializedQuaternaryAnum(memory, basis, adjacent),
    adjacentSource,
    "AN-F05 adjacent carrier keeps its faithful hierarchy",
  );
  same(
    serializeMaterializedQuaternaryAnum(memory, basis, nested),
    nestedSource,
    "AN-F05 nested carrier keeps its extra R[ hierarchy",
  );
}

// Capability boundary: materializing an exact Anum/address must not
// materialize the semantic Link addressed by that Anum.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const address = materializeQuaternaryAnum(memory, basis, "01[10]");

  assert(
    address.anumLink !== basis.R,
    "address materialization creates a non-root exact Anum",
  );
  same(
    memory.find(basis.U, basis.L),
    undefined,
    "address materialization does not create semantic B01",
  );
  same(
    memory.find(basis.L, basis.U),
    undefined,
    "address materialization does not create semantic B10",
  );

  const beforeResolve = memory.linkCount;
  same(
    resolveQuaternaryAnum(memory, basis, address),
    undefined,
    "understood/materialized address remains NOT_FOUND without target materialization",
  );
  same(
    memory.linkCount,
    beforeResolve,
    "NOT_FOUND Resolve stays read-only after address materialization",
  );
}

console.log("Hierarchical Quaternary Anum two-memory transport: GREEN.");
