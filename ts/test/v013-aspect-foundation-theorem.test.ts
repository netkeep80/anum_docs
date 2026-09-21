import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";
import {
  decomposeV013SemanticLink,
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
  type V013StructuralAspect,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 aspect foundation theorem: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

type Spec =
  | { readonly kind: "R" }
  | { readonly kind: "S"; readonly child: Spec }
  | { readonly kind: "E"; readonly child: Spec }
  | { readonly kind: "P"; readonly left: Spec; readonly right: Spec };

const R_SPEC: Spec = Object.freeze({ kind: "R" });

function specs(depth: number): readonly Spec[] {
  if (depth === 0) return Object.freeze([R_SPEC]);
  const previous = specs(depth - 1);
  const result: Spec[] = [R_SPEC];

  for (const child of previous) {
    result.push(Object.freeze({ kind: "S", child }));
    result.push(Object.freeze({ kind: "E", child }));
  }
  for (const left of previous) {
    for (const right of previous) {
      result.push(Object.freeze({ kind: "P", left, right }));
    }
  }
  return Object.freeze(result);
}

function materializeSpec(
  memory: Memory,
  basis: RootBasis,
  spec: Spec,
): LinkHandle {
  if (spec.kind === "R") return basis.R;
  if (spec.kind === "S") {
    return memory.ensureStartSelfClosed(materializeSpec(memory, basis, spec.child));
  }
  if (spec.kind === "E") {
    return memory.ensureEndSelfClosed(materializeSpec(memory, basis, spec.child));
  }
  return memory.ensure(
    materializeSpec(memory, basis, spec.left),
    materializeSpec(memory, basis, spec.right),
  );
}

function digit(aspect: V013StructuralAspect): string {
  if (aspect === "ROOT") return "8";
  if (aspect === "START") return "9";
  if (aspect === "END") return "6";
  return "1";
}

function theoremWire(
  memory: ReadMemory,
  basis: RootBasis,
  link: LinkHandle,
  active = new Set<LinkHandle>(),
): string {
  if (active.has(link)) {
    throw new Error("v0.13 aspect foundation theorem: non-well-founded semantic cycle");
  }
  const decomposition = decomposeV013SemanticLink(memory, basis, link);
  if (decomposition.aspect === "ROOT") return "8";

  active.add(link);
  try {
    return digit(decomposition.aspect) +
      decomposition.children
        .map((child) => theoremWire(memory, basis, child, active))
        .join("");
  } finally {
    active.delete(link);
  }
}

function runtimeWire(
  memory: Memory,
  basis: RootBasis,
  link: LinkHandle,
): string {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    link,
  );
  return new TextDecoder().decode(
    serializeV013HierarchicalCarrier(memory, basis, carrier),
  );
}

function noDiscoveryProbe(memory: Memory): ReadMemory {
  return Object.freeze({
    root: memory.root,
    linkCount: memory.linkCount,
    poles: (link: LinkHandle) => memory.poles(link),
    find: () => {
      throw new Error("find() is forbidden in local aspect decomposition");
    },
    outgoing: () => {
      throw new Error("outgoing() is forbidden in local aspect decomposition");
    },
    incoming: () => {
      throw new Error("incoming() is forbidden in local aspect decomposition");
    },
  });
}

function addAllocationNoise(memory: Memory, basis: RootBasis): void {
  const a = memory.ensure(basis.U, basis.L);
  const b = memory.ensureStartSelfClosed(a);
  const c = memory.ensureEndSelfClosed(b);
  memory.ensure(c, a);
}

// ---------------------------------------------------------------------------
// T1. Exactly four local self-incidence classes exist and each is realized.
// ---------------------------------------------------------------------------

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const witnesses = [
    [basis.R, "ROOT", "11", basis.R, 0],
    [basis.O, "START", "10", basis.O, 1],
    [basis.C, "END", "01", basis.C, 1],
    [basis.L, "PAIR", "00", basis.L, 2],
  ] as const;

  const signatures = new Set<string>();
  const aspects = new Set<string>();

  for (const [link, aspect, signature, sign, arity] of witnesses) {
    const decomposition = decomposeV013SemanticLink(memory, basis, link);
    same(decomposition.aspect, aspect, `${aspect}: aspect`);
    same(decomposition.selfIncidence, signature, `${aspect}: self-incidence`);
    same(decomposition.sign, sign, `${aspect}: Link-native sign`);
    same(decomposition.children.length, arity, `${aspect}: reconstruction arity`);
    signatures.add(decomposition.selfIncidence);
    aspects.add(decomposition.aspect);
  }

  same(signatures.size, 4, "all four boolean self-incidence combinations are realized");
  same(aspects.size, 4, "all four local structural aspects are realized");

  // U is semantically useful but is not an additional local aspect.
  const u = decomposeV013SemanticLink(memory, basis, basis.U);
  same(u.aspect, "PAIR", "U is ordinary PAIR");
  same(u.selfIncidence, "00", "U has ordinary non-self poles");
  same(u.sign, basis.L, "U uses the PAIR aspect sign L");
}

// ---------------------------------------------------------------------------
// T2. The accepted v0.12 Q sign basis is not the self-incidence partition,
// while v0.13 R/O/C/L is exactly one representative per aspect.
// This is a structural comparison, not a compactness comparison.
// ---------------------------------------------------------------------------

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const repoRoot = resolve(process.cwd(), "..");
  const contract12 = JSON.parse(
    readFileSync(join(repoRoot, "contracts/mts-contract-v0.12.json"), "utf8"),
  );

  same(
    contract12.quaternaryInterpreter.alphabet.join(""),
    "[]10",
    "accepted v0.12 Q alphabet",
  );

  const v012SignLinks = [basis.O, basis.C, basis.L, basis.U];
  const v013SignLinks = [basis.R, basis.O, basis.C, basis.L];

  const v012Classes = v012SignLinks.map(
    (link) => decomposeV013SemanticLink(memory, basis, link).selfIncidence,
  );
  const v013Classes = v013SignLinks.map(
    (link) => decomposeV013SemanticLink(memory, basis, link).selfIncidence,
  );

  same(new Set(v012Classes).size, 3, "v0.12 O/C/L/U signs cover only three self-incidence classes");
  assert(!v012Classes.includes("11"), "v0.12 Q signs do not contain ROOT class as an abit");
  same(new Set(v013Classes).size, 4, "v0.13 R/O/C/L signs cover all four classes exactly once");
  same([...new Set(v013Classes)].sort().join(","), "00,01,10,11", "v0.13 complete aspect partition");
}

// ---------------------------------------------------------------------------
// T3. Sufficiency over a finite-grounded corpus.
//
// Depth 3 contains 676 structural constructor syntaxes. Canonical Link identity
// may collapse aliases, but every resulting semantic Link must admit a finite,
// deterministic ROOT/START/END/PAIR decomposition, and the implementation wire
// must be exactly the theorem-derived wire.
// ---------------------------------------------------------------------------

{
  const corpus = specs(3);
  same(corpus.length, 676, "depth-3 structural syntax corpus size");

  const memoryA = new Memory();
  const basisA = ensureRootBasis(memoryA);

  const memoryB = new Memory();
  const basisB = ensureRootBasis(memoryB);
  addAllocationNoise(memoryB, basisB);

  const seenA = new Set<LinkHandle>();
  const seenAspects = new Set<V013StructuralAspect>();

  for (const spec of corpus) {
    const linkA = materializeSpec(memoryA, basisA, spec);
    const linkB = materializeSpec(memoryB, basisB, spec);

    const decompositionA = decomposeV013SemanticLink(memoryA, basisA, linkA);
    const decompositionB = decomposeV013SemanticLink(memoryB, basisB, linkB);
    same(decompositionB.aspect, decompositionA.aspect, "two-memory local aspect parity");
    same(
      decompositionB.selfIncidence,
      decompositionA.selfIncidence,
      "two-memory self-incidence parity",
    );

    const expectedA = theoremWire(memoryA, basisA, linkA);
    const expectedB = theoremWire(memoryB, basisB, linkB);
    same(expectedB, expectedA, "finite-grounded theorem wire is allocation-independent");

    if (!seenA.has(linkA)) {
      seenA.add(linkA);
      seenAspects.add(decompositionA.aspect);
      same(
        runtimeWire(memoryA, basisA, linkA),
        expectedA,
        "runtime projection equals read-only aspect theorem",
      );
    }
  }

  assert(seenA.size > 100, "corpus produces more than 100 distinct semantic Links");
  same(seenAspects.size, 4, "corpus exercises all four aspects");
}

// ---------------------------------------------------------------------------
// T4. Equal-pole ordinary Links remain PAIR; shared children do not require a
// fifth aspect. Tree duplication is a transport-cost issue, not insufficiency.
// ---------------------------------------------------------------------------

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const x = memory.ensure(basis.U, basis.L);
  const pair = memory.ensure(x, x);
  assert(pair !== x, "equal-pole pair is a distinct semantic Link");

  const decomposition = decomposeV013SemanticLink(memory, basis, pair);
  same(decomposition.aspect, "PAIR", "equal-pole ordinary Link class");
  same(decomposition.children.length, 2, "equal-pole pair has two child occurrences");
  same(decomposition.children[0], x, "equal-pole left child");
  same(decomposition.children[1], x, "equal-pole right child");
}

// ---------------------------------------------------------------------------
// T5. Local aspect classification requires only root/basis verification,
// poles() and equality. Discovery APIs are forbidden by the probe.
// ---------------------------------------------------------------------------

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const link = memory.ensure(
    memory.ensureStartSelfClosed(basis.C),
    memory.ensureEndSelfClosed(basis.O),
  );
  const probe = noDiscoveryProbe(memory);

  const decomposition = decomposeV013SemanticLink(probe, basis, link);
  same(decomposition.aspect, "PAIR", "probe classifies nontrivial Link");
  same(decomposition.selfIncidence, "00", "probe uses local pole equality only");
}

console.log(
  "MTS v0.13 aspect foundation A5a: four self-incidence classes are all realized; R/O/C/L is a complete Link-native aspect basis unlike v0.12 O/C/L/U; 676 finite-grounded syntaxes decompose deterministically and match the runtime carrier without discovery/host authority: GREEN.",
);
