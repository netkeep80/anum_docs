import {
  continueStringAnum,
  continueStringSign,
  defineTypedContext,
  openStringContext,
  replayStringClose,
  type TypedContext,
} from "../src/context-integration.js";
import {
  Memory,
  type LinkHandle,
} from "../src/memory.js";
import {
  defineStructuralInterpreter,
  type StructuralInterpreter,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 STRING Anum C3: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

interface AuthoritativeVector {
  readonly id: string;
  readonly authority: "AUTHORITATIVE";
  readonly source: string;
  readonly expected: LinkHandle;
}

interface InterpreterFixture {
  readonly handle: LinkHandle;
  readonly structure: StructuralInterpreter;
}

function anchors(memory: Memory, count: number): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  const seed = memory.ensureEndSelfClosed(memory.root);
  let tag = memory.ensureStartSelfClosed(memory.root);
  for (let index = 0; index < count; index += 1) {
    tag = memory.ensureStartSelfClosed(tag);
    result.push(memory.ensure(seed, tag));
  }
  return Object.freeze(result);
}

const memory = new Memory();
const R = memory.root;
const pool = anchors(memory, 10);
let cursor = 0;

function next(label: string): LinkHandle {
  const value = pool[cursor++];
  assert(value !== undefined, `missing fixture: ${label}`);
  return value;
}

function interpreter(label: string): InterpreterFixture {
  const dictionary = next(`${label}-dictionary`);
  const grammar = next(`${label}-grammar`);
  const theory = next(`${label}-theory`);
  const structure: StructuralInterpreter = Object.freeze({ dictionary, grammar, theory });
  return Object.freeze({
    handle: defineStructuralInterpreter(memory, dictionary, grammar, theory),
    structure,
  });
}

const rootI = interpreter("root");
const stringI = interpreter("string");
const a = next("sign-a");
const b = next("sign-b");
const A = memory.ensure(a, b);
const rootedA = memory.ensure(R, A);
const A2 = memory.ensure(A, A);
const AThenRootedA = memory.ensure(A, rootedA);

const authoritativeVectors: readonly AuthoritativeVector[] = Object.freeze([
  { id: "S-EMPTY", authority: "AUTHORITATIVE", source: "", expected: R },
  { id: "S-FLAT-AB", authority: "AUTHORITATIVE", source: "ab", expected: A },
  { id: "S-EMPTY-NESTED", authority: "AUTHORITATIVE", source: "[]", expected: R },
  { id: "S-NESTED-AB", authority: "AUTHORITATIVE", source: "[ab]", expected: rootedA },
  { id: "S-FLAT-THEN-NESTED-SAME", authority: "AUTHORITATIVE", source: "ab[ab]", expected: A2 },
  { id: "S-DOUBLE-NESTING-PRESERVES-ROOT-LEVEL", authority: "AUTHORITATIVE", source: "ab[[ab]]", expected: AThenRootedA },
  { id: "S-EMPTY-NESTED-THEN-FLAT-COLLAPSES", authority: "AUTHORITATIVE", source: "[]ab", expected: A },
  { id: "S-FLAT-THEN-NESTED-EMPTY-THEN-FLAT", authority: "AUTHORITATIVE", source: "ab[[]ab]", expected: A2 },
]);

same(authoritativeVectors.length, 8, "initial authoritative corpus size");
for (const vector of authoritativeVectors) {
  same(vector.authority, "AUTHORITATIVE", `${vector.id} authority`);
}

// Canonical root collapse is semantic Link identity, not a parser special case.
same(memory.ensure(R, R), R, "R ⟼ R collapses canonically to R");

// These are immutable discriminators established by the C3a corpus.
const wrongAbNestedAb = memory.ensure(A, rootedA);
assert(A2 !== wrongAbNestedAb, "ab[ab] must not use unconditional R ⟼ child wrapping");
assert(rootedA !== A, "[ab] preserves one rooted level distinct from ab");
assert(AThenRootedA !== A2, "ab[[ab]] preserves rooted child level distinct from ab[ab]");

/**
 * Test-only lexical driver. It recognizes only `a`, `b`, `[` and `]` and delegates
 * every semantic transition to the production STRING lifecycle. The recursive
 * host call stack is syntax traversal only; lexical-parent authority remains the
 * explicit TypedContext passed to open/replay operations.
 */
function interpretStringAnum(source: string): LinkHandle {
  let offset = 0;
  const rootParent: TypedContext = defineTypedContext(memory, rootI.handle, R, R);

  function parse(
    parentBefore: TypedContext,
    expectedParentInterpreter: StructuralInterpreter,
    nested: boolean,
  ): LinkHandle {
    let current = openStringContext(
      memory,
      parentBefore,
      expectedParentInterpreter,
      stringI.handle,
    );

    while (offset < source.length) {
      const token = source[offset];
      if (token === "]") {
        assert(nested, `unexpected ] at ${offset}`);
        offset += 1;
        return replayStringClose(
          memory,
          current,
          stringI.structure,
          parentBefore,
          expectedParentInterpreter,
        );
      }
      if (token === "[") {
        offset += 1;
        const childResult = parse(current, stringI.structure, true);
        current = continueStringAnum(memory, current, stringI.structure, childResult);
        continue;
      }
      if (token === "a" || token === "b") {
        offset += 1;
        current = continueStringSign(
          memory,
          current,
          stringI.structure,
          token === "a" ? a : b,
        );
        continue;
      }
      throw new Error(`v0.12 STRING Anum C3: unsupported test token ${String(token)} at ${offset}`);
    }

    assert(!nested, "unclosed [ in test source");
    return replayStringClose(
      memory,
      current,
      stringI.structure,
      parentBefore,
      expectedParentInterpreter,
    );
  }

  const result = parse(rootParent, rootI.structure, false);
  same(offset, source.length, `consumed source ${JSON.stringify(source)}`);
  return result;
}

for (const vector of authoritativeVectors) {
  same(
    interpretStringAnum(vector.source),
    vector.expected,
    `${vector.id} production STRING topology`,
  );
}

console.log("MTS v0.12 C3 STRING Anum runtime: 8 authoritative vectors GREEN.");
