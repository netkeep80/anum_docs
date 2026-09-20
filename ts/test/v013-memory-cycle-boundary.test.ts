import {
  Memory,
  MemoryError,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 cycle boundary: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function expectMemoryError(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof MemoryError, `${message}: expected MemoryError`);
    return;
  }
  throw new Error(`v0.13 cycle boundary: ${message}: expected rejection`);
}

function assertConstructiveOrder(
  memory: Memory,
  links: readonly LinkHandle[],
): void {
  for (const link of links) {
    const linkIndex = memory.issuanceIndex(link);
    const poles = memory.poles(link);

    if (link === memory.root) {
      same(poles.start, link, "root starts from itself");
      same(poles.end, link, "root ends in itself");
      continue;
    }

    for (const [name, pole] of [
      ["start", poles.start],
      ["end", poles.end],
    ] as const) {
      if (pole === link) continue;
      assert(
        memory.issuanceIndex(pole) < linkIndex,
        `${name} dependency of a non-root Link points to an older Link`,
      );
    }

    assert(
      !(poles.start === link && poles.end === link),
      "non-root Link is never self-closed at both poles",
    );
  }
}

function assertNoNonSelfCycle(
  memory: Memory,
  links: readonly LinkHandle[],
): void {
  const allowed = new Set(links);
  const active = new Set<LinkHandle>();
  const done = new Set<LinkHandle>();

  const visit = (link: LinkHandle): void => {
    if (done.has(link)) return;
    assert(!active.has(link), "dependency graph has a non-self cycle");
    active.add(link);

    const poles = memory.poles(link);
    for (const pole of [poles.start, poles.end]) {
      if (pole === link || !allowed.has(pole)) continue;
      visit(pole);
    }

    active.delete(link);
    done.add(link);
  };

  for (const link of links) visit(link);
}

const memory = new Memory();
const basis = ensureRootBasis(memory);

// Grow a mixed constructive graph only through the public Memory API.
// Every constructor receives already existing local endpoints.
let frontier: readonly LinkHandle[] = Object.freeze([
  basis.R,
  basis.O,
  basis.C,
  basis.L,
  basis.U,
]);

for (let round = 0; round < 4; round += 1) {
  const snapshot = [...frontier];
  const next: LinkHandle[] = [...snapshot];

  for (const value of snapshot.slice(0, 12)) {
    next.push(memory.ensureStartSelfClosed(value));
    next.push(memory.ensureEndSelfClosed(value));
  }

  for (let index = 0; index < Math.min(snapshot.length, 12); index += 1) {
    const left = snapshot[index]!;
    const right = snapshot[(index * 5 + 3) % snapshot.length]!;
    next.push(memory.ensure(left, right));
    next.push(memory.ensure(right, left));
    next.push(memory.ensure(left, left));
  }

  frontier = Object.freeze([...new Set(next)]);
}

// Add a guaranteed fresh ordinary-pair spine so the witness is broad even
// when many combinatorial constructor requests canonicalize to existing Links.
let spine = basis.L;
for (let index = 0; index < 96; index += 1) {
  spine = memory.ensure(spine, basis.U);
}

const semanticSnapshot = Object.freeze([...memory.allLinks()]);
assert(semanticSnapshot.length > 100, "fixture exercises a broad constructive graph");

assertConstructiveOrder(memory, semanticSnapshot);
assertNoNonSelfCycle(memory, semanticSnapshot);

// The issuance ordering is meta-evidence only: generic carrier projection must
// still depend solely on poles and must serialize every sampled reachable Link.
for (const semantic of semanticSnapshot) {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    semantic,
  );
  const wire = serializeV013HierarchicalCarrier(memory, basis, carrier);
  assert(wire.length > 0, "every sampled reachable semantic Link has finite wire");
}

// Public construction cannot use a foreign handle as a placeholder for a
// not-yet-created endpoint.
{
  const foreign = new Memory();
  expectMemoryError(
    () => memory.ensure(memory.root, foreign.root),
    "foreign endpoint cannot seed a future mutual cycle",
  );
  expectMemoryError(
    () => memory.ensureStartSelfClosed(foreign.root),
    "foreign START endpoint is rejected",
  );
  expectMemoryError(
    () => memory.ensureEndSelfClosed(foreign.root),
    "foreign END endpoint is rejected",
  );
}

// A forged would-be future handle is also rejected before construction.
{
  const forged = Object.freeze({}) as LinkHandle;
  expectMemoryError(
    () => memory.ensure(memory.root, forged),
    "forged future endpoint is rejected",
  );
}

// The abstract read boundary itself does not encode this constructive
// restriction. A synthetic ReadMemory can expose a mutual-cycle topology.
// This does not make the cycle grounded or materializable; it proves only that
// "not constructible by Memory" is narrower than "not describable as poles".
{
  class SyntheticReadMemory implements ReadMemory {
    constructor(
      readonly root: LinkHandle,
      private readonly cells: ReadonlyMap<LinkHandle, LinkPoles>,
    ) {}

    get linkCount(): number { return this.cells.size; }

    poles(link: LinkHandle): LinkPoles {
      const value = this.cells.get(link);
      if (value === undefined) throw new MemoryError("synthetic unknown Link");
      return value;
    }

    find(): LinkHandle | undefined { return undefined; }
    outgoing(): readonly LinkHandle[] { return []; }
    incoming(): readonly LinkHandle[] { return []; }
  }

  const handle = (): LinkHandle => Object.freeze({}) as LinkHandle;
  const syntheticRoot = handle();
  const a = handle();
  const b = handle();
  const synthetic = new SyntheticReadMemory(
    syntheticRoot,
    new Map<LinkHandle, LinkPoles>([
      [syntheticRoot, Object.freeze({ start: syntheticRoot, end: syntheticRoot })],
      [a, Object.freeze({ start: a, end: b })],
      [b, Object.freeze({ start: b, end: a })],
    ]),
  );

  same(synthetic.poles(a).end, b, "abstract topology may expose A -> B");
  same(synthetic.poles(b).end, a, "abstract topology may expose B -> A");
}

// The ordering invariant gives a direct contradiction for a hypothetical
// distinct two-Link cycle:
//
//   A depends on B => index(B) < index(A)
//   B depends on A => index(A) < index(B)
//
// The test cannot construct A/B because no public constructor accepts unresolved
// endpoints. This is a boundary of current Memory, not an ontological theorem.
console.log(
  `MTS v0.13 current Memory cycle boundary: ${semanticSnapshot.length} reachable Links are acyclic modulo direct self-incidence; abstract ReadMemory may describe a mutual cycle but concrete Memory cannot construct one: GREEN.`,
);
