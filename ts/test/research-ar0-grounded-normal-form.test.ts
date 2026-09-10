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

// RED scaffold: raw closure class is deliberately used as the candidate
// semantic form. The alias case below must falsify this approximation.
function candidateSemanticForm(memory: ReadMemory, link: LinkHandle): string {
  return rawShape(memory, link);
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

// Target semantic behavior: both presentations normalize to one form ♂∞.
same(
  candidateSemanticForm(raw, x),
  candidateSemanticForm(raw, s),
  "physical duplicate S⟼R must normalize to the same semantic form as S=S⟼R",
);

console.log("MTS AR0 grounded-form normalization: GREEN");
