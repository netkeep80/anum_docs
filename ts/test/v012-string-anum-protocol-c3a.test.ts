import * as contextIntegration from "../src/context-integration.js";
import {
  Memory,
  type LinkHandle,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 STRING Anum C3a: ${message}`);
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

function anchors(memory: Memory): readonly [LinkHandle, LinkHandle] {
  const seed = memory.ensureEndSelfClosed(memory.root);
  const tagA = memory.ensureStartSelfClosed(memory.root);
  const tagB = memory.ensureStartSelfClosed(tagA);
  return Object.freeze([
    memory.ensure(seed, tagA),
    memory.ensure(seed, tagB),
  ]) as readonly [LinkHandle, LinkHandle];
}

const memory = new Memory();
const R = memory.root;
const [a, b] = anchors(memory);
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

// Discriminator against the wrong unconditional-root-wrap CLOSE model.
const wrongAbNestedAb = memory.ensure(A, rootedA);
same(
  authoritativeVectors.find((vector) => vector.source === "ab[ab]")?.expected,
  A2,
  "ab[ab] authoritative topology",
);
assert(A2 !== wrongAbNestedAb, "ab[ab] must not use unconditional R ⟼ child wrapping");

// Empty nested Anum is a real R result. Its disappearance in []ab follows
// from R ⟼ R = R, not from deleting [] as a host-parser no-op.
same(
  authoritativeVectors.find((vector) => vector.source === "[]")?.expected,
  R,
  "[] denotes R",
);
same(
  authoritativeVectors.find((vector) => vector.source === "[]ab")?.expected,
  A,
  "[]ab collapses through root identity before flat ab",
);

// Additional explicit nesting is observable in Link topology itself.
assert(rootedA !== A, "[ab] preserves one rooted level distinct from ab");
assert(AThenRootedA !== A2, "ab[[ab]] preserves rooted child level distinct from ab[ab]");

// C3a deliberately does not emulate STRING execution. It proves the corpus is
// first-class while the current production runtime still lacks STRING lifecycle.
const stringRuntimeAvailable = Object.prototype.hasOwnProperty.call(
  contextIntegration,
  "openStringContext",
);
const classification = Object.freeze({
  authoritativeVectorCount: authoritativeVectors.length,
  stringRuntimeAvailable,
  candidateSatisfiedByCurrentRuntime: stringRuntimeAvailable,
  verdict: "RED" as const,
  reason: "STRING_ANUM_RUNTIME_NOT_IMPLEMENTED" as const,
});

same(classification.authoritativeVectorCount, 8, "all confirmed STRING vectors are executable evidence");
same(classification.stringRuntimeAvailable, false, "current runtime has no STRING context lifecycle");
same(classification.candidateSatisfiedByCurrentRuntime, false, "current runtime does not satisfy C3 STRING corpus");
same(classification.verdict, "RED", "C3a runtime classification");
same(classification.reason, "STRING_ANUM_RUNTIME_NOT_IMPLEMENTED", "C3a RED reason");

console.log("MTS v0.12 C3a STRING Anum corpus: 8 authoritative vectors bound; runtime RED confirmed.");
