import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  materializeV013HierarchicalCarrier,
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 quaternary canonicality: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function sameBytes(
  actual: Uint8Array,
  expected: Uint8Array,
  message: string,
): void {
  assert(
    actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]),
    `${message}: byte sequences differ`,
  );
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function text(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

interface RootSpec {
  readonly kind: "root";
}

interface StartSpec {
  readonly kind: "start";
  readonly child: Spec;
}

interface EndSpec {
  readonly kind: "end";
  readonly child: Spec;
}

interface PairSpec {
  readonly kind: "pair";
  readonly left: Spec;
  readonly right: Spec;
}

type Spec = RootSpec | StartSpec | EndSpec | PairSpec;

const ROOT: RootSpec = Object.freeze({ kind: "root" });

function start(child: Spec): StartSpec {
  return Object.freeze({ kind: "start", child });
}

function end(child: Spec): EndSpec {
  return Object.freeze({ kind: "end", child });
}

function pair(left: Spec, right: Spec): PairSpec {
  return Object.freeze({ kind: "pair", left, right });
}

function specsThroughDepth(depth: number): readonly Spec[] {
  let current: readonly Spec[] = Object.freeze([ROOT]);

  for (let level = 0; level < depth; level += 1) {
    const next: Spec[] = [ROOT];

    for (const child of current) {
      next.push(start(child), end(child));
    }
    for (const left of current) {
      for (const right of current) {
        next.push(pair(left, right));
      }
    }

    current = Object.freeze(next);
  }

  return current;
}

function directSpell(spec: Spec): string {
  switch (spec.kind) {
    case "root":
      return "8";
    case "start":
      return `9${directSpell(spec.child)}`;
    case "end":
      return `6${directSpell(spec.child)}`;
    case "pair":
      return `1${directSpell(spec.left)}${directSpell(spec.right)}`;
  }
}

function materializeSpec(
  memory: Memory,
  basis: RootBasis,
  spec: Spec,
): LinkHandle {
  switch (spec.kind) {
    case "root":
      return basis.R;
    case "start":
      return memory.ensureStartSelfClosed(
        materializeSpec(memory, basis, spec.child),
      );
    case "end":
      return memory.ensureEndSelfClosed(
        materializeSpec(memory, basis, spec.child),
      );
    case "pair":
      return memory.ensure(
        materializeSpec(memory, basis, spec.left),
        materializeSpec(memory, basis, spec.right),
      );
  }
}

function canonicalWire(
  memory: Memory,
  basis: RootBasis,
  semantic: LinkHandle,
): Uint8Array {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    semantic,
  );
  return serializeV013HierarchicalCarrier(memory, basis, carrier);
}

function addAllocationNoise(memory: Memory, basis: RootBasis): void {
  const n1 = memory.ensure(basis.U, basis.L);
  const n2 = memory.ensureEndSelfClosed(n1);
  const n3 = memory.ensure(n2, basis.O);
  const n4 = memory.ensureStartSelfClosed(n3);
  memory.ensure(n4, basis.C);
}

const corpus = specsThroughDepth(3);
same(corpus.length, 676, "depth-3 structural syntax corpus size");

const memoryA = new Memory();
const basisA = ensureRootBasis(memoryA);

const memoryB = new Memory();
const basisB = ensureRootBasis(memoryB);
addAllocationNoise(memoryB, basisB);

const wireToSemanticA = new Map<string, LinkHandle>();
const wireToSemanticB = new Map<string, LinkHandle>();
const semanticToWireA = new Map<LinkHandle, string>();
const semanticToWireB = new Map<LinkHandle, string>();
const aliasToCanonical = new Map<string, string>();

for (const spec of corpus) {
  const semanticA = materializeSpec(memoryA, basisA, spec);
  const semanticB = materializeSpec(memoryB, basisB, spec);

  const wireA = text(canonicalWire(memoryA, basisA, semanticA));
  const wireB = text(canonicalWire(memoryB, basisB, semanticB));
  same(wireB, wireA, "allocation history preserves canonical anum");

  const previousSemanticA = wireToSemanticA.get(wireA);
  if (previousSemanticA === undefined) {
    wireToSemanticA.set(wireA, semanticA);
  } else {
    same(
      semanticA,
      previousSemanticA,
      "one canonical anum does not identify two local semantic Links in A",
    );
  }

  const previousSemanticB = wireToSemanticB.get(wireB);
  if (previousSemanticB === undefined) {
    wireToSemanticB.set(wireB, semanticB);
  } else {
    same(
      semanticB,
      previousSemanticB,
      "one canonical anum does not identify two local semantic Links in B",
    );
  }

  const previousWireA = semanticToWireA.get(semanticA);
  if (previousWireA === undefined) {
    semanticToWireA.set(semanticA, wireA);
  } else {
    same(
      wireA,
      previousWireA,
      "one local semantic Link has one canonical anum in A",
    );
  }

  const previousWireB = semanticToWireB.get(semanticB);
  if (previousWireB === undefined) {
    semanticToWireB.set(semanticB, wireB);
  } else {
    same(
      wireB,
      previousWireB,
      "one local semantic Link has one canonical anum in B",
    );
  }

  const direct = directSpell(spec);
  if (direct !== wireA) {
    aliasToCanonical.set(direct, wireA);
  }
}

assert(
  wireToSemanticA.size > 100,
  "corpus contains a broad set of distinct constructive semantic Links",
);
same(
  wireToSemanticA.size,
  semanticToWireA.size,
  "A canonical wire count equals distinct semantic Link count",
);
same(
  wireToSemanticB.size,
  semanticToWireB.size,
  "B canonical wire count equals distinct semantic Link count",
);

same(aliasToCanonical.get("188"), "8", "raw PAIR(R,R) aliases R");
same(aliasToCanonical.get("1988"), "98", "raw PAIR(O,R) aliases O");
same(aliasToCanonical.get("1868"), "68", "raw PAIR(R,C) aliases C");
assert(
  aliasToCanonical.size > 3,
  "corpus exposes noncanonical raw syntax beyond the three root examples",
);

// Representation parsing is intentionally only syntactic: canonicality of the
// semantic form is enforced later by constructor authority, not by this parser.
{
  const representation = new Memory();
  const basis = ensureRootBasis(representation);
  const aliasCarrier = materializeV013HierarchicalCarrier(
    representation,
    basis,
    bytes("188"),
  );
  same(
    text(serializeV013HierarchicalCarrier(representation, basis, aliasCarrier)),
    "188",
    "representation layer preserves syntactically valid noncanonical alias",
  );
}

// Every canonical wire in the corpus has one canonical local representation
// carrier in a fresh Memory and repeated parsing is idempotent.
{
  const representation = new Memory();
  const basis = ensureRootBasis(representation);
  const wireToCarrier = new Map<string, LinkHandle>();

  for (const wire of wireToSemanticA.keys()) {
    const encoded = bytes(wire);
    const carrier = materializeV013HierarchicalCarrier(
      representation,
      basis,
      encoded,
    );
    sameBytes(
      serializeV013HierarchicalCarrier(representation, basis, carrier),
      encoded,
      "canonical carrier round-trip",
    );

    const known = wireToCarrier.get(wire);
    if (known === undefined) {
      wireToCarrier.set(wire, carrier);
    } else {
      same(carrier, known, "same wire reuses same local carrier");
    }

    const beforeRepeat = representation.linkCount;
    const repeated = materializeV013HierarchicalCarrier(
      representation,
      basis,
      encoded,
    );
    same(repeated, carrier, "repeated parse returns same local carrier");
    same(
      representation.linkCount,
      beforeRepeat,
      "repeated parse writes zero representation Links",
    );
  }
}

console.log(
  `MTS v0.13 quaternary canonicality corpus: ${corpus.length} syntaxes, ${wireToSemanticA.size} distinct semantic Links, allocation-independent canonical wires: GREEN.`,
);
