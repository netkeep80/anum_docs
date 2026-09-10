import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`AR0 grounded normal form: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

class RawReadMemory implements ReadMemory {
  polesCalls = 0;

  constructor(
    readonly root: LinkHandle,
    private readonly links: ReadonlyMap<LinkHandle, LinkPoles>,
  ) {}

  get linkCount(): number { return this.links.size; }

  poles(link: LinkHandle): LinkPoles {
    this.polesCalls += 1;
    const poles = this.links.get(link);
    if (poles === undefined) throw new Error("unknown raw Link");
    return poles;
  }

  find(): LinkHandle | undefined {
    throw new Error("AR0 normalization must not call find");
  }

  outgoing(): readonly LinkHandle[] {
    throw new Error("AR0 normalization must not scan outgoing");
  }

  incoming(): readonly LinkHandle[] {
    throw new Error("AR0 normalization must not scan incoming");
  }
}

function opaqueHandles(count: number): readonly LinkHandle[] {
  const memory = new Memory();
  const result: LinkHandle[] = [memory.root];
  let cursor = memory.ensureStartSelfClosed(memory.root);
  while (result.length < count) {
    result.push(cursor);
    cursor = memory.ensureStartSelfClosed(cursor);
  }
  return Object.freeze(result);
}

type RawShape = "full" | "start" | "end" | "ordinary";

function rawShape(memory: ReadMemory, link: LinkHandle): RawShape {
  const poles = memory.poles(link);
  if (poles.start === link && poles.end === link) return "full";
  if (poles.start === link) return "start";
  if (poles.end === link) return "end";
  return "ordinary";
}

// Research meta-representation only. The semantic notation is ostensive:
//   root        -> ∞
//   start(F)    -> ♂F
//   end(F)      -> F♀
//   pair(F,G)   -> F⟼G
// These tags are not proposed as new MTS entities or public opcodes.
type GroundedForm =
  | { readonly kind: "root" }
  | { readonly kind: "start"; readonly end: GroundedForm }
  | { readonly kind: "end"; readonly start: GroundedForm }
  | { readonly kind: "pair"; readonly start: GroundedForm; readonly end: GroundedForm };

const ROOT_FORM: GroundedForm = Object.freeze({ kind: "root" });

function sameGroundedForm(left: GroundedForm, right: GroundedForm): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "root":
      return true;
    case "start":
      return right.kind === "start" && sameGroundedForm(left.end, right.end);
    case "end":
      return right.kind === "end" && sameGroundedForm(left.start, right.start);
    case "pair":
      return right.kind === "pair"
        && sameGroundedForm(left.start, right.start)
        && sameGroundedForm(left.end, right.end);
  }
}

function differentGroundedForm(left: GroundedForm, right: GroundedForm): boolean {
  return !sameGroundedForm(left, right);
}

function startForm(end: GroundedForm): GroundedForm {
  return Object.freeze({ kind: "start", end });
}

function endForm(start: GroundedForm): GroundedForm {
  return Object.freeze({ kind: "end", start });
}

function linkForm(start: GroundedForm, end: GroundedForm): GroundedForm {
  // ∞⟼∞ = ∞
  if (start.kind === "root" && end.kind === "root") return ROOT_FORM;

  // (♂E)⟼E = ♂E
  if (start.kind === "start" && sameGroundedForm(start.end, end)) return start;

  // B⟼(B♀) = B♀
  if (end.kind === "end" && sameGroundedForm(end.start, start)) return end;

  return Object.freeze({ kind: "pair", start, end });
}

class UngroundedFormError extends Error {
  override readonly name = "UngroundedFormError";
}

function normalizeGroundedForm(
  memory: ReadMemory,
  link: LinkHandle,
  active: ReadonlySet<LinkHandle> = new Set<LinkHandle>(),
): GroundedForm {
  if (active.has(link)) throw new UngroundedFormError("non-self recursive dependency cycle");

  const nextActive = new Set(active);
  nextActive.add(link);
  const poles = memory.poles(link);
  const startSelf = poles.start === link;
  const endSelf = poles.end === link;

  if (startSelf && endSelf) return ROOT_FORM;
  if (startSelf) return startForm(normalizeGroundedForm(memory, poles.end, nextActive));
  if (endSelf) return endForm(normalizeGroundedForm(memory, poles.start, nextActive));

  return linkForm(
    normalizeGroundedForm(memory, poles.start, nextActive),
    normalizeGroundedForm(memory, poles.end, nextActive),
  );
}

function expectUngrounded(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof UngroundedFormError, `${message}: wrong error ${String(error)}`);
    return;
  }
  throw new Error(`AR0 grounded normal form: ${message}: expected UNDERGROUNDED`);
}

// D1-D5 — canonical production Memory is a positive control, not the authority
// for the normalizer. R/O/C/L/U must map to the MTS-native four form families.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const r = normalizeGroundedForm(memory, basis.R);
  const o = normalizeGroundedForm(memory, basis.O);
  const c = normalizeGroundedForm(memory, basis.C);
  const l = normalizeGroundedForm(memory, basis.L);
  const u = normalizeGroundedForm(memory, basis.U);

  same(r.kind, "root", "D1 R normalizes to ∞");
  assert(o.kind === "start" && o.end.kind === "root", "D2 O normalizes to ♂∞");
  assert(c.kind === "end" && c.start.kind === "root", "D3 C normalizes to ∞♀");
  assert(l.kind === "pair", "D4 L normalizes to ♂∞⟼∞♀");
  assert(u.kind === "pair", "D5 U normalizes to ∞♀⟼♂∞");
  assert(differentGroundedForm(r, o), "D5a ∞ differs from ♂∞");
  assert(differentGroundedForm(o, c), "D5b ♂∞ differs from ∞♀");
  assert(differentGroundedForm(l, u), "D5c ordered pole orientation remains semantic");
}

const handles = opaqueHandles(17);
const [
  r,
  rFullAlias,
  rrPairAlias,
  s,
  sPairAlias,
  e,
  ePairAlias,
  p,
  pAlias,
  swapped,
  nested,
  nestedAlias,
  cycleA,
  cycleB,
  asymmetricA,
  asymmetricB,
  nestedStartAlias,
] = handles;
assert(
  r !== undefined
    && rFullAlias !== undefined
    && rrPairAlias !== undefined
    && s !== undefined
    && sPairAlias !== undefined
    && e !== undefined
    && ePairAlias !== undefined
    && p !== undefined
    && pAlias !== undefined
    && swapped !== undefined
    && nested !== undefined
    && nestedAlias !== undefined
    && cycleA !== undefined
    && cycleB !== undefined
    && asymmetricA !== undefined
    && asymmetricB !== undefined
    && nestedStartAlias !== undefined,
  "raw fixture handles exist",
);

// Deliberately noncanonical physical carrier. Duplicate rows are legal here so
// the experiment cannot inherit semantic identity from Memory.byPair.
const raw = new RawReadMemory(r, new Map<LinkHandle, LinkPoles>([
  // D6-D7: two different physical ways to present the same semantic ∞.
  [r, Object.freeze({ start: r, end: r })],
  [rFullAlias, Object.freeze({ start: rFullAlias, end: rFullAlias })],
  [rrPairAlias, Object.freeze({ start: r, end: r })],

  // D8-D9: S=S⟼R = ♂∞ and a second physical row S⟼R.
  [s, Object.freeze({ start: s, end: r })],
  [sPairAlias, Object.freeze({ start: s, end: r })],

  // D10-D11: E=R⟼E = ∞♀ and a second physical row R⟼E.
  [e, Object.freeze({ start: r, end: e })],
  [ePairAlias, Object.freeze({ start: r, end: e })],

  // D12-D14: ordinary pair, duplicate, pole-swapped pair and nested aliases.
  [p, Object.freeze({ start: s, end: e })],
  [pAlias, Object.freeze({ start: sPairAlias, end: ePairAlias })],
  [swapped, Object.freeze({ start: e, end: s })],
  [nested, Object.freeze({ start: p, end: s })],
  [nestedAlias, Object.freeze({ start: pAlias, end: sPairAlias })],

  // A physical pair whose start/end are themselves only aliases of ♂∞ and ∞.
  // It must still reduce to ♂∞ after recursive semantic normalization.
  [nestedStartAlias, Object.freeze({ start: sPairAlias, end: rrPairAlias })],

  // D15: symmetric rootless mutual recursion remains UNDERGROUNDED.
  [cycleA, Object.freeze({ start: cycleB, end: r })],
  [cycleB, Object.freeze({ start: cycleA, end: r })],

  // D16: orientation-asymmetric rootless mutual recursion also remains
  // UNDERGROUNDED; global rigidity must not manufacture semantic identity.
  [asymmetricA, Object.freeze({ start: asymmetricB, end: r })],
  [asymmetricB, Object.freeze({ start: r, end: asymmetricA })],
]));

same(rawShape(raw, r), "full", "raw selected ∞ shape");
same(rawShape(raw, s), "start", "raw ♂∞ shape");
same(rawShape(raw, sPairAlias), "ordinary", "raw ♂∞ alias looks ordinary");
same(rawShape(raw, e), "end", "raw ∞♀ shape");
same(rawShape(raw, ePairAlias), "ordinary", "raw ∞♀ alias looks ordinary");

const normalizedR = normalizeGroundedForm(raw, r);
const normalizedFullAlias = normalizeGroundedForm(raw, rFullAlias);
const normalizedRrPairAlias = normalizeGroundedForm(raw, rrPairAlias);
const normalizedS = normalizeGroundedForm(raw, s);
const normalizedSPairAlias = normalizeGroundedForm(raw, sPairAlias);
const normalizedE = normalizeGroundedForm(raw, e);
const normalizedEPairAlias = normalizeGroundedForm(raw, ePairAlias);
const normalizedP = normalizeGroundedForm(raw, p);
const normalizedPAlias = normalizeGroundedForm(raw, pAlias);
const normalizedSwapped = normalizeGroundedForm(raw, swapped);
const normalizedNested = normalizeGroundedForm(raw, nested);
const normalizedNestedAlias = normalizeGroundedForm(raw, nestedAlias);
const normalizedNestedStartAlias = normalizeGroundedForm(raw, nestedStartAlias);

assert(sameGroundedForm(normalizedFullAlias, normalizedR), "D6 second physical full selfclosure collapses to ∞");
assert(sameGroundedForm(normalizedRrPairAlias, normalizedR), "D7 physical R⟼R row collapses to ∞");
assert(normalizedS.kind === "start" && normalizedS.end.kind === "root", "D8 S=S⟼R is ♂∞");
assert(sameGroundedForm(normalizedSPairAlias, normalizedS), "D9 physical S⟼R row collapses to ♂∞");
assert(normalizedE.kind === "end" && normalizedE.start.kind === "root", "D10 E=R⟼E is ∞♀");
assert(sameGroundedForm(normalizedEPairAlias, normalizedE), "D11 physical R⟼E row collapses to ∞♀");
assert(normalizedP.kind === "pair", "D12 ordinary grounded pair stays ordinary");
assert(sameGroundedForm(normalizedPAlias, normalizedP), "D12a ordinary duplicate with aliased poles collapses");
assert(differentGroundedForm(normalizedSwapped, normalizedP), "D13 swapped ordered poles remain different");
assert(sameGroundedForm(normalizedNestedAlias, normalizedNested), "D14 nested aliases collapse recursively");
assert(sameGroundedForm(normalizedNestedStartAlias, normalizedS), "D14a pair of semantic aliases reduces to ♂∞");

expectUngrounded(() => normalizeGroundedForm(raw, cycleA), "D15 symmetric rootless cycle");
expectUngrounded(() => normalizeGroundedForm(raw, asymmetricA), "D16 asymmetric rootless cycle");

// RawReadMemory throws on discovery APIs. Reaching this line proves the whole
// matrix used only root/linkCount/poles and no find/outgoing/incoming scan.
assert(raw.polesCalls > 0, "normalization inspected finite pole evidence");

console.log("MTS AR0 grounded-form normalization: D1-D16 GREEN");
