import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type RootBasis,
  type WriteMemory,
} from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import {
  materializeSourceNamespaceProfile,
} from "../src/source-namespace.js";
import {
  V015FormalDecodeError,
} from "../src/v015-formal-decoder.js";
import {
  materializeV015LinkDefinitionProfile,
  V015LinkDefinitionError,
} from "../src/v015-link-definition.js";
import {
  compileV015FormalDefinitionsToRecursive,
  type V015FormalRecursiveCompileResult,
} from "../src/v015-formal-recursive-compiler.js";
import {
  V013HierarchicalCarrierError,
  materializeV013HierarchicalCarrier,
  materializeV013HierarchicalCarrierFromSemanticLink,
  materializeV013SemanticLinkFromHierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";
import {
  readV012StringAnum,
} from "../src/v012-string-anum.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.15 B3 compiler: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function sameJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
}
function wireText(wire: Uint8Array): string {
  return new TextDecoder().decode(wire);
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly grammarRoot: LinkHandle;
  readonly namespaceProfileRoot: LinkHandle;
  readonly definitionProfileRoot: LinkHandle;
}
function fixture(noise = 0): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, basis.C));
  for (let i = 0; i < noise; i += 1) {
    memory.ensure(fresh(), basis.O);
  }

  const syntaxTag = fresh();
  const markerSeed = fresh();
  const pairForm = fresh();
  const nameRefForm = fresh();
  const declarationForm = fresh();
  const blockForm = fresh();
  const leftRole = fresh();
  const rightRole = fresh();
  const referencedNameRole = fresh();
  const declarationNameRole = fresh();
  const declarationBodyRole = fresh();
  const blockItemRole = fresh();

  const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
    {
      form: pairForm,
      fields: [
        { role: leftRole, target: "child", min: 1, max: 1 },
        { role: rightRole, target: "child", min: 1, max: 1 },
      ],
    },
    {
      form: nameRefForm,
      fields: [{ role: referencedNameRole, target: "carrier", min: 1, max: 1 }],
    },
    {
      form: declarationForm,
      fields: [
        { role: declarationNameRole, target: "carrier", min: 1, max: 1 },
        { role: declarationBodyRole, target: "child", min: 1, max: 1 },
      ],
    },
    {
      form: blockForm,
      fields: [{ role: blockItemRole, target: "child", min: 0, max: null }],
    },
  ];

  const grammarRoot = materializeNativeSyntaxGrammar(memory, basis, {
    syntaxTag,
    markerSeed,
    rules,
  });
  const namespaceProfileRoot = materializeSourceNamespaceProfile(memory, {
    blockForm,
    declarationForm,
    blockItemRole,
    declarationNameRole,
    declarationBodyRole,
  });
  const definitionProfileRoot = materializeV015LinkDefinitionProfile(memory, {
    pairForm,
    nameRefForm,
    pairLeftRole: leftRole,
    pairRightRole: rightRole,
    referencedNameRole,
  });
  return Object.freeze({
    memory,
    basis,
    grammarRoot,
    namespaceProfileRoot,
    definitionProfileRoot,
  });
}

const enc = new TextEncoder();
function compile(f: Fixture, source: string): V015FormalRecursiveCompileResult {
  return compileV015FormalDefinitionsToRecursive(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    enc.encode(source),
  );
}
function nameOf(f: Fixture, handle: LinkHandle): string {
  return new TextDecoder().decode(readV012StringAnum(f.memory, f.basis, handle).bytes);
}
function byName(
  f: Fixture,
  result: V015FormalRecursiveCompileResult,
): ReadonlyMap<string, (typeof result.definitions)[number]> {
  return new Map(result.definitions.map((definition) => [
    nameOf(f, definition.nameCarrier),
    definition,
  ]));
}
function wires(
  f: Fixture,
  result: V015FormalRecursiveCompileResult,
): readonly Readonly<[string, string]>[] {
  return Object.freeze(result.definitions.map((definition) =>
    Object.freeze([nameOf(f, definition.nameCarrier), wireText(definition.wire)] as const),
  ));
}

const latin = [
  "R : R->R",
  "O : O->R",
  "C : R->C",
  "L : O->C",
  "U : C->O",
].join("\n");
const unicode = [
  "∞ : ∞(∞)",
  "♂∞ : ♂∞(∞)",
  "∞♀ : ∞(∞♀)",
  "⟼ : ♂∞(∞♀)",
  "↛ : ∞♀(♂∞)",
].join("\n");

{
  const f = fixture();
  const result = compile(f, latin);
  sameJson(wires(f, result), [
    ["R", "8"],
    ["O", "98"],
    ["C", "68"],
    ["L", "19868"],
    ["U", "16898"],
  ], "Latin FORMAL compiles to exact canonical wires");

  const indexed = byName(f, result);
  for (const name of ["O", "C", "L", "U"]) {
    const definition = indexed.get(name);
    assert(definition !== undefined, `${name} compiled definition exists`);
    assert(
      definition.semantic !== definition.recursiveCarrier,
      `${name}: semantic Link and recursive representation carrier stay distinct`,
    );
    same(
      materializeV013SemanticLinkFromHierarchicalCarrier(
        f.memory,
        f.basis,
        materializeV013HierarchicalCarrier(
          f.memory,
          f.basis,
          definition.wire,
        ),
      ),
      definition.semantic,
      `${name}: physical wire -> carrier -> semantic round-trip returns same Link`,
    );
  }
}

{
  const f = fixture();
  const result = compile(f, unicode);
  sameJson(wires(f, result), [
    ["∞", "8"],
    ["♂∞", "98"],
    ["∞♀", "68"],
    ["⟼", "19868"],
    ["↛", "16898"],
  ], "Unicode FORMAL compiles to same RootBasis wires");
}

{
  const source = [
    latin,
    "X : L->U",
  ].join("\n");
  const f = fixture();
  const result = compile(f, source);
  const indexed = byName(f, result);
  const x = indexed.get("X");
  assert(x !== undefined, "generic X definition exists");
  same(wireText(x.wire), "11986816898", "generic X=L->U canonical recursive wire");
  assert(
    x.semantic !== f.basis.R &&
    x.semantic !== f.basis.O &&
    x.semantic !== f.basis.C &&
    x.semantic !== f.basis.L &&
    x.semantic !== f.basis.U,
    "generic X is not a RootBasis special case",
  );
  same(
    materializeV013SemanticLinkFromHierarchicalCarrier(
      f.memory,
      f.basis,
      materializeV013HierarchicalCarrier(f.memory, f.basis, x.wire),
    ),
    x.semantic,
    "generic X physical wire round-trip",
  );
}

{
  const a = fixture(0);
  const b = fixture(17);
  const ar = compile(a, [latin, "X : L->U"].join("\n"));
  const br = compile(b, [latin, "X : L->U"].join("\n"));
  sameJson(
    wires(a, ar),
    wires(b, br),
    "independent Memories and unrelated allocation noise preserve byte-identical wires",
  );
}

{
  const f = fixture();
  const result = compile(f, [
    "A : A->A",
    "B : B(B)",
  ].join("\n"));
  sameJson(wires(f, result), [["A", "8"], ["B", "8"]], "aliases of same semantic ROOT share wire");
  const indexed = byName(f, result);
  same(indexed.get("A")?.semantic, indexed.get("B")?.semantic, "aliases resolve to same semantic Link");
}

{
  const f = fixture();
  const result = compile(f, [
    "U : C->O",
    "L : O->C",
    "C : R->C",
    "O : O->R",
    "R : R->R",
  ].join("\n"));
  sameJson(
    wires(f, result),
    [
      ["U", "16898"],
      ["L", "19868"],
      ["C", "68"],
      ["O", "98"],
      ["R", "8"],
    ],
    "compiler output preserves source definition order while dependency resolution is order-independent",
  );
}

{
  const f = fixture();
  let decodeRejected = false;
  try {
    compile(f, "R : R->");
  } catch (error) {
    assert(error instanceof V015FormalDecodeError, "malformed source fails at B2 stage");
    decodeRejected = true;
  }
  assert(decodeRejected, "malformed source produces no compiler result");
}

{
  const f = fixture();
  let semanticRejected = false;
  try {
    compile(f, "A : A->B");
  } catch (error) {
    assert(error instanceof V015LinkDefinitionError, "unbound name fails at B1 semantic stage");
    same(error.code, "unbound-name", "exact unbound-name semantic error");
    semanticRejected = true;
  }
  assert(semanticRejected, "unbound semantic source produces no representation result");
}

class CyclicSemanticProbe implements WriteMemory {
  constructor(
    private readonly source: Memory,
    private readonly first: LinkHandle,
    private readonly second: LinkHandle,
  ) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles {
    if (link === this.first) {
      return Object.freeze({ start: this.second, end: this.source.root });
    }
    if (link === this.second) {
      return Object.freeze({ start: this.first, end: this.source.root });
    }
    return this.source.poles(link);
  }
  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    return this.source.find(start, end);
  }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    return this.source.outgoing(start);
  }
  incoming(end: LinkHandle): readonly LinkHandle[] {
    return this.source.incoming(end);
  }
  ensureRoot(): LinkHandle { return this.source.ensureRoot(); }
  ensureStartSelfClosed(end: LinkHandle): LinkHandle {
    return this.source.ensureStartSelfClosed(end);
  }
  ensureEndSelfClosed(start: LinkHandle): LinkHandle {
    return this.source.ensureEndSelfClosed(start);
  }
  ensure(start: LinkHandle, end: LinkHandle): LinkHandle {
    return this.source.ensure(start, end);
  }
}

{
  const f = fixture();
  const first = f.memory.ensure(f.basis.L, f.basis.U);
  const second = f.memory.ensure(f.basis.U, f.basis.L);
  const probe = new CyclicSemanticProbe(f.memory, first, second);
  const before = f.memory.linkCount;
  let rejected = false;
  try {
    materializeV013HierarchicalCarrierFromSemanticLink(
      probe,
      f.basis,
      first,
    );
  } catch (error) {
    assert(
      error instanceof V013HierarchicalCarrierError,
      "unsupported semantic cycle fails in representation stage",
    );
    same(error.code, "invalid-semantic-link", "exact cyclic semantic rejection");
    rejected = true;
  }
  assert(rejected, "unsupported semantic cycle must fail closed");
  same(f.memory.linkCount, before, "failed cyclic projection publishes no carrier");
}

console.log([
  "MTS v0.15 B3 recursive compiler:",
  "FORMAL_TO_SYNTAX_ASET=GREEN",
  "SYNTAX_ASET_TO_SEMANTIC_LINK=GREEN",
  "SEMANTIC_LINK_TO_RECURSIVE_CARRIER=GREEN",
  "RECURSIVE_WIRE=8_9_6_1",
  "ROOT_BASIS_EXACT_WIRES=GREEN",
  "GENERIC_X_L_TO_U=11986816898",
  "CROSS_MEMORY_WIRE_PARITY=GREEN",
  "REPRESENTATION_NE_SEMANTIC_IDENTITY=TRUE",
  "ROUND_TRIP=GREEN",
].join(" "));
