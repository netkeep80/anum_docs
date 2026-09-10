import {
  Memory,
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
  constructor(
    readonly root: LinkHandle,
    private readonly links: ReadonlyMap<LinkHandle, LinkPoles>,
  ) {}

  get linkCount(): number { return this.links.size; }

  poles(link: LinkHandle): LinkPoles {
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

const [r, s, x] = opaqueHandles(3);
assert(r !== undefined && s !== undefined && x !== undefined, "fixture handles exist");

// Noncanonical physical presentation:
//   r = r⟼r      = ∞
//   s = s⟼r      = ♂∞
//   x = s⟼r      = physical duplicate of the same semantic ordered poles
//
// No-instance/same-pole semantics requires x=s semantically even though the
// raw carrier presents s as selfclosed and x as an ordinary record.
const raw = new RawReadMemory(r, new Map<LinkHandle, LinkPoles>([
  [r, Object.freeze({ start: r, end: r })],
  [s, Object.freeze({ start: s, end: r })],
  [x, Object.freeze({ start: s, end: r })],
]));

same(rawShape(raw, r), "full", "raw ∞ shape");
same(rawShape(raw, s), "start", "raw ♂∞ shape");
same(rawShape(raw, x), "ordinary", "physical alias has different raw closure class");

const normalizedS = normalizeGroundedForm(raw, s);
const normalizedX = normalizeGroundedForm(raw, x);
assert(normalizedS.kind === "start", "S=S⟼R normalizes to ♂∞ form");
assert(normalizedS.end.kind === "root", "♂∞ external end normalizes to ∞");
assert(
  sameGroundedForm(normalizedX, normalizedS),
  "physical duplicate S⟼R must normalize to the same semantic form as S=S⟼R",
);

console.log("MTS AR0 grounded-form normalization: GREEN");
