import { readFileSync } from "node:fs";
import * as publicApi from "../src/public.js";
import {
  deserializeAnum,
  normalizeRawForm,
  parseRawQuaternary,
  type StackAlgebra,
} from "../src/anum.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

type SerializeQuaternaryLink = (
  memory: ReadMemory,
  basis: RootBasis,
  link: LinkHandle,
) => string;

function requireQuaternarySerializer(): SerializeQuaternaryLink {
  const candidate = (publicApi as unknown as { readonly serializeQuaternaryLink?: unknown })
    .serializeQuaternaryLink;
  assert(
    typeof candidate === "function",
    "public production API serializeQuaternaryLink is required for two-memory ANUM transport",
  );
  return candidate as SerializeQuaternaryLink;
}

function loadQuaternary(
  memory: Memory,
  source: string,
): { readonly basis: RootBasis; readonly link: LinkHandle } {
  const basis = ensureRootBasis(memory);
  const algebra: StackAlgebra<LinkHandle> = Object.freeze({
    root: basis.R,
    linked: basis.L,
    unlinked: basis.U,
    link(start: LinkHandle, end: LinkHandle): LinkHandle {
      return memory.ensure(start, end);
    },
  });
  const form = parseRawQuaternary(source);
  const result = deserializeAnum(form, algebra);
  return Object.freeze({ basis, link: result.denotation });
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

const fixture = readFileSync("../examples/anum/conformance/q-flat-110.anum", "utf8");
const canonicalFixture = normalizeRawForm(parseRawQuaternary(fixture));
same(canonicalFixture, "110", "golden Q fixture spelling");

const memoryA = new Memory();
const loadedA = loadQuaternary(memoryA, fixture);
assert(memoryA.linkCount > 5, "fixture must materialize non-basis Links in Memory A");

const serializeQuaternaryLink = requireQuaternarySerializer();
const wire = serializeQuaternaryLink(memoryA, loadedA.basis, loadedA.link);
same(wire, canonicalFixture, "Memory A must serialize back to the canonical fixture");

const memoryB = new Memory();
const loadedB = loadQuaternary(memoryB, wire);
assert(
  structurallyEquivalentState(memoryA, memoryB, loadedA.link, loadedB.link),
  "Memory A and Memory B must be root-preserving structurally isomorphic after Q transport",
);

same(
  serializeQuaternaryLink(memoryB, loadedB.basis, loadedB.link),
  wire,
  "Memory B canonical Q reserialization",
);
