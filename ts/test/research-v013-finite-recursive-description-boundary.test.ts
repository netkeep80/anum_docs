import {
  Memory,
  MemoryError,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type RootBasis,
  type WriteMemory,
} from "../src/memory.js";
import {
  V013HierarchicalCarrierError,
  decomposeV013SemanticLink,
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`v0.13 finite recursive description boundary: ${message}`);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

/**
 * Minimal graph-capable test memory.
 *
 * It deliberately allows reserving handles before their poles are bound so the
 * research witness can express a finite rooted distinct-node cycle. Ordinary
 * carrier writes still go through the same WriteMemory surface used by
 * production helpers.
 *
 * The reserve/bind API is fixture-only evidence. It is NOT proposed as MTS
 * semantic authority or a production transport format.
 */
class SyntheticGraphMemory implements WriteMemory {
  private readonly cells = new Map<LinkHandle, LinkPoles>();
  readonly root: LinkHandle;

  constructor() {
    this.root = this.reserve();
    this.bind(this.root, this.root, this.root);
  }

  get linkCount(): number {
    return this.cells.size;
  }

  reserve(): LinkHandle {
    return Object.freeze({}) as LinkHandle;
  }

  bind(link: LinkHandle, start: LinkHandle, end: LinkHandle): LinkHandle {
    assert(!this.cells.has(link), "fixture Link is bound exactly once");
    const duplicate = this.find(start, end);
    assert(duplicate === undefined, "fixture preserves canonical ordered-pair uniqueness");
    this.cells.set(link, Object.freeze({ start, end }));
    return link;
  }

  poles(link: LinkHandle): LinkPoles {
    const poles = this.cells.get(link);
    if (poles === undefined) throw new MemoryError("synthetic unknown Link");
    return poles;
  }

  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    for (const [link, poles] of this.cells) {
      if (poles.start === start && poles.end === end) return link;
    }
    return undefined;
  }

  outgoing(start: LinkHandle): readonly LinkHandle[] {
    const result: LinkHandle[] = [];
    for (const [link, poles] of this.cells) {
      if (poles.start === start) result.push(link);
    }
    return Object.freeze(result);
  }

  incoming(end: LinkHandle): readonly LinkHandle[] {
    const result: LinkHandle[] = [];
    for (const [link, poles] of this.cells) {
      if (poles.end === end) result.push(link);
    }
    return Object.freeze(result);
  }

  ensureRoot(): LinkHandle {
    return this.root;
  }

  ensureStartSelfClosed(end: LinkHandle): LinkHandle {
    for (const [link, poles] of this.cells) {
      if (link !== end && poles.start === link && poles.end === end) return link;
    }
    const link = this.reserve();
    return this.bind(link, link, end);
  }

  ensureEndSelfClosed(start: LinkHandle): LinkHandle {
    for (const [link, poles] of this.cells) {
      if (link !== start && poles.start === start && poles.end === link) return link;
    }
    const link = this.reserve();
    return this.bind(link, start, link);
  }

  ensure(start: LinkHandle, end: LinkHandle): LinkHandle {
    const existing = this.find(start, end);
    if (existing !== undefined) return existing;
    return this.bind(this.reserve(), start, end);
  }
}

function ensureSyntheticBasis(memory: SyntheticGraphMemory): RootBasis {
  const R = memory.ensureRoot();
  const O = memory.ensureStartSelfClosed(R);
  const C = memory.ensureEndSelfClosed(R);
  const L = memory.ensure(O, C);
  const U = memory.ensure(C, O);
  return Object.freeze({ R, O, C, L, U });
}

function expectTreeCarrierRejectsCycle(
  memory: SyntheticGraphMemory,
  basis: RootBasis,
  semantic: LinkHandle,
  label: string,
): void {
  try {
    materializeV013HierarchicalCarrierFromSemanticLink(memory, basis, semantic);
  } catch (error) {
    assert(
      error instanceof V013HierarchicalCarrierError,
      `${label}: stable carrier error type`,
    );
    same(
      error.code,
      "invalid-semantic-link",
      `${label}: current tree carrier rejects recursive revisit`,
    );
    return;
  }
  throw new Error(
    `v0.13 finite recursive description boundary: ${label}: expected current tree carrier rejection`,
  );
}

// ---------------------------------------------------------------------------
// 1. Shared semantic DAG is admissible, but the REF-free tree wire repeats it.
// ---------------------------------------------------------------------------
//
// Let:
//   X0 = O
//   X(n+1) = Xn -> Xn
//
// Semantic growth is one new Link per level because both poles reuse the same
// existing child. The current physical tree spelling nevertheless obeys:
//
//   W0 = |98| = 2
//   W(n+1) = 1 + 2*Wn
//   Wn = 3*2^n - 1
//
// This is transport expansion, not semantic graph growth.
//
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let semantic = basis.O;

  for (let depth = 0; depth <= 10; depth += 1) {
    const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
      memory,
      basis,
      semantic,
    );
    const wire = serializeV013HierarchicalCarrier(memory, basis, carrier);
    same(
      wire.length,
      3 * (2 ** depth) - 1,
      `shared DAG depth ${depth} has exact REF-free tree-wire expansion`,
    );

    if (depth < 10) {
      const child = semantic;
      semantic = memory.ensure(child, child);
      const poles = memory.poles(semantic);
      same(poles.start, child, `shared DAG depth ${depth + 1} reuses left child`);
      same(poles.end, child, `shared DAG depth ${depth + 1} reuses right child`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. A rooted distinct-node cycle is locally classifiable by the SAME four
//    ROOT/START/END/PAIR aspects.
// ---------------------------------------------------------------------------
//
//   R = R -> R
//   O = O -> R
//   C = R -> C
//
//   A = O -> B
//   B = A -> C
//
// A/B are finite as a presented graph (two cyclic nodes plus rooted side
// anchors). No new local aspect is needed: both are ordinary PAIR links.
//
const graphMemory = new SyntheticGraphMemory();
const graphBasis = ensureSyntheticBasis(graphMemory);
const A = graphMemory.reserve();
const B = graphMemory.reserve();
graphMemory.bind(A, graphBasis.O, B);
graphMemory.bind(B, A, graphBasis.C);

{
  const a = decomposeV013SemanticLink(graphMemory, graphBasis, A);
  const b = decomposeV013SemanticLink(graphMemory, graphBasis, B);

  same(a.aspect, "PAIR", "cycle A remains locally PAIR");
  same(a.selfIncidence, "00", "cycle A local self-incidence");
  same(a.children[0], graphBasis.O, "cycle A keeps rooted O side");
  same(a.children[1], B, "cycle A keeps recursive B side");

  same(b.aspect, "PAIR", "cycle B remains locally PAIR");
  same(b.selfIncidence, "00", "cycle B local self-incidence");
  same(b.children[0], A, "cycle B keeps recursive A side");
  same(b.children[1], graphBasis.C, "cycle B keeps rooted C side");
}

// ---------------------------------------------------------------------------
// 3. The CURRENT hierarchical carrier cannot finitely spell that graph.
// ---------------------------------------------------------------------------
//
// materializeV013HierarchicalCarrierFromSemanticLink is a recursive TREE
// projection. Its active-node guard rejects the A -> B -> A revisit because
// the grammar has constructors but no Link-native binding/reference/fixpoint
// operation.
//
// Crucially, part (2) showed that the four local aspects themselves still
// classify the cyclic links. Therefore this witness distinguishes:
//
//   aspect foundation capability
//   != current self-contained tree grammar capability
//   != graph-level finite recursive description capability
//
expectTreeCarrierRejectsCycle(
  graphMemory,
  graphBasis,
  A,
  "rooted A -> B -> A cycle from A",
);
expectTreeCarrierRejectsCycle(
  graphMemory,
  graphBasis,
  B,
  "rooted B -> A -> B cycle from B",
);

// This witness deliberately does NOT introduce REF, binding or fixed-point
// semantics. It establishes the missing mechanism before any repair is chosen:
//
// - shared DAGs are semantically representable today, while REF-free wire can
//   expand exponentially;
// - rooted distinct-node cycles remain locally expressible by the four aspect
//   classes;
// - current tree projection cannot give them a finite carrier;
// - therefore cycle failure is not evidence for a fifth aspect and must not be
//   promoted into an acyclic-ontology law;
// - a future finite recursive codec, if adopted, needs explicit Link/Rule/Theory
//   authority for naming/reusing a node rather than sender IDs or host identity.
//
console.log(
  "MTS v0.13 finite recursive description boundary: shared DAG tree-wire expansion quantified; rooted mutual cycle remains locally classifiable but current REF-free tree carrier rejects the revisit, isolating the missing graph-reference/binding layer: GREEN.",
);
