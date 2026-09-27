// mts-version-evidence: candidate-from=0.14
// research-owner: #1656

import {
  materializeV013HierarchicalCarrier,
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 N15 ostensive grammar: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function reject(source: string, message: string): void {
  try { parseOstensive(source); } catch { return; }
  throw new Error(`${message}: expected rejection for ${JSON.stringify(source)}`);
}

type Ast =
  | Readonly<{ kind: "ROOT" }>
  | Readonly<{ kind: "NAME"; name: string }>
  | Readonly<{ kind: "START"; child: Ast }>
  | Readonly<{ kind: "END"; child: Ast }>
  | Readonly<{ kind: "PAIR"; left: Ast; right: Ast }>;

class Parser {
  private offset = 0;
  constructor(private readonly source: string) {}

  parse(): Ast {
    const result = this.expr();
    this.ws();
    if (this.offset !== this.source.length) throw new Error("trailing source");
    return result;
  }

  private ws(): void {
    while (/\s/u.test(this.source[this.offset] ?? "")) this.offset += 1;
  }

  private starts(text: string): boolean {
    this.ws();
    return this.source.startsWith(text, this.offset);
  }

  private take(text: string): boolean {
    if (!this.starts(text)) return false;
    this.offset += text.length;
    return true;
  }

  private expr(): Ast {
    const left = this.unary();
    if (!this.take("⟼")) return left;
    const right = this.unary();
    // Minimal core has exactly one ungrouped PAIR level. Any second arrow must
    // be grouped by an explicit Primary or supplied by a higher selected Grammar.
    if (this.starts("⟼")) throw new Error("implicit pair associativity");
    return Object.freeze({ kind: "PAIR", left, right });
  }

  private unary(): Ast {
    this.ws();
    if (this.starts("♂")) return this.prefix();
    return this.postfix();
  }

  private prefix(): Ast {
    assert(this.take("♂"), "prefix parser entered without male sign");
    const child = this.starts("♂") ? this.prefix() : this.primary();
    // Deliberately do not absorb ♀ here. ♂S♀ has no hidden precedence.
    return Object.freeze({ kind: "START", child });
  }

  private postfix(): Ast {
    let value = this.primary();
    while (this.take("♀")) value = Object.freeze({ kind: "END", child: value });
    return value;
  }

  private primary(): Ast {
    this.ws();
    if (this.take("∞")) return Object.freeze({ kind: "ROOT" });
    if (this.take("(")) {
      const value = this.expr();
      if (!this.take(")")) throw new Error("missing close group");
      return value;
    }

    this.ws();
    const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.source.slice(this.offset));
    if (match) {
      this.offset += match[0].length;
      return Object.freeze({ kind: "NAME", name: match[0] });
    }
    throw new Error("expected Primary");
  }
}

function parseOstensive(source: string): Ast {
  return new Parser(source).parse();
}

function recursiveWire(ast: Ast, names: ReadonlyMap<string, string> = new Map()): string {
  if (ast.kind === "ROOT") return "8";
  if (ast.kind === "START") return "9" + recursiveWire(ast.child, names);
  if (ast.kind === "END") return "6" + recursiveWire(ast.child, names);
  if (ast.kind === "PAIR") {
    return "1" + recursiveWire(ast.left, names) + recursiveWire(ast.right, names);
  }
  const wire = names.get(ast.name);
  if (wire === undefined) throw new Error("unbound Name");
  return wire;
}

function denote(
  memory: Memory,
  basis: RootBasis,
  ast: Ast,
  names: ReadonlyMap<string, LinkHandle> = new Map(),
): LinkHandle {
  if (ast.kind === "ROOT") return basis.R;
  if (ast.kind === "START") return memory.ensureStartSelfClosed(denote(memory, basis, ast.child, names));
  if (ast.kind === "END") return memory.ensureEndSelfClosed(denote(memory, basis, ast.child, names));
  if (ast.kind === "PAIR") {
    return memory.ensure(
      denote(memory, basis, ast.left, names),
      denote(memory, basis, ast.right, names),
    );
  }
  const value = names.get(ast.name);
  if (value === undefined) throw new Error("unbound Name");
  return value;
}

function kernelWitness(source: string): Readonly<{
  wire: string;
  semantic: LinkHandle;
}> {
  const ast = parseOstensive(source);
  const wire = recursiveWire(ast);
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const semantic = denote(memory, basis, ast);

  const projected = materializeV013HierarchicalCarrierFromSemanticLink(
    memory, basis, semantic,
  );
  const projectedWire = String.fromCharCode(
    ...serializeV013HierarchicalCarrier(memory, basis, projected),
  );
  same(projectedWire, wire, source + " semantic projection");

  // The existing hierarchical carrier parser is representation-only. Its
  // successful round trip therefore validates the 8/9/6/1 structural carrier
  // without granting source spelling independent semantic authority.
  const imported = materializeV013HierarchicalCarrier(
    memory,
    basis,
    Uint8Array.from([...wire].map((char) => char.charCodeAt(0))),
  );
  const importedWire = String.fromCharCode(
    ...serializeV013HierarchicalCarrier(memory, basis, imported),
  );
  same(importedWire, wire, source + " carrier round trip");

  return Object.freeze({ wire, semantic });
}

function main(): void {
  const positives = new Map<string, string>([
    ["∞", "8"],
    ["♂∞", "98"],
    ["∞♀", "68"],
    ["♂∞ ⟼ ∞♀", "19868"],
    ["∞♀ ⟼ ♂∞", "16898"],
    ["(♂∞)♀", "698"],
    ["♂(∞♀)", "968"],
    ["♂♂∞", "998"],
    ["∞♀♀", "668"],
  ]);

  for (const [source, expected] of positives) {
    same(recursiveWire(parseOstensive(source)), expected, source + " syntax translation");
    same(kernelWitness(source).wire, expected, source + " kernel witness");
  }

  // Grouping around the mixed unary forms is semantically observable.
  const left = kernelWitness("(♂∞)♀");
  const right = kernelWitness("♂(∞♀)");
  assert(left.wire !== right.wire, "698 and 968 must remain structurally distinct");
  assert(left.semantic !== right.semantic, "grouped mixed-unary denotations must differ");

  // Two independent Memories reconstruct the same canonical structural wire.
  for (const source of ["♂∞ ⟼ ∞♀", "∞♀ ⟼ ♂∞", "(♂∞)♀", "♂(∞♀)"]) {
    const a = kernelWitness(source);
    const b = kernelWitness(source);
    same(a.wire, b.wire, source + " two-memory structural identity");
  }

  reject("♂∞♀", "ungrouped prefix/postfix");
  reject("A⟼B⟼C", "implicit PAIR associativity");
  reject("♂♀", "bare theorem/meta pattern is not a core expression");
  for (const recursiveGlyph of ["8", "9", "6", "1"]) {
    reject(recursiveGlyph, "recursive glyph is not ostensive source syntax");
  }

  // Same denotation vocabulary does not mean byte-identical source spelling.
  assert(
    "∞".charCodeAt(0) !== "8".charCodeAt(0),
    "ostensive ROOT source and recursive ROOT source are distinct STRINGs",
  );

  console.log([
    "MTS v0.14 N15: OSTENSIVE_FORMAL_GRAMMAR=GREEN_RESEARCH",
    "ROOT=INFINITY_TO_8",
    "START=MALE_PREFIX_TO_9",
    "END=FEMALE_POSTFIX_TO_6",
    "PAIR=ARROW_INFIX_TO_1",
    "GROUPED_END_START=698",
    "GROUPED_START_END=968",
    "UNGROUPED_PREFIX_POSTFIX=REJECTED",
    "PAIR_IMPLICIT_ASSOCIATIVITY=NONE",
    "BARE_MALE_FEMALE=NON_EXECUTABLE_CORE",
    "RECURSIVE_GLYPHS_AS_OSTENSIVE_SOURCE=REJECTED",
    "TWO_MEMORY_GRAMMAR_WITNESS=GREEN",
    "EXISTING_HIERARCHICAL_CARRIER_KERNEL_USED=TRUE",
    "SURFACE_COMPILER_SEMANTIC_AUTHORITY=NONE",
    "DICTIONARY_GRAMMAR_THEORY_RULE_AUTHORITY_BYPASSED=FALSE",
    "MTS_V014_ACCEPTED=FALSE",
  ].join(" "));
}
main();
