import {
  V015_DIRECT_ASSOCIATION_RESEARCH,
  V015_SEMANTIC_SOURCE_ORDER_SCHEMA,
  V015DirectAssociationError,
  declareV015SemanticSourceOrder,
  directSequentialAssociation,
  type V015DirectAssociationAlgebra,
  type V015SemanticSourceOrder,
} from "../src/v015-direct-association.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectCode(action: () => unknown, code: string, message: string): void {
  try {
    action();
  } catch (error) {
    assert(error instanceof V015DirectAssociationError, `${message}: wrong error type`);
    same(error.code, code, `${message}: error code`);
    return;
  }
  throw new Error(`${message}: expected failure`);
}

function rootedFold(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  let current = memory.root;
  for (const value of values) current = memory.ensure(current, value);
  return current;
}

const memory = new Memory();
const { R, O, C, L, U } = ensureRootBasis(memory);
const algebra: V015DirectAssociationAlgebra<LinkHandle> = Object.freeze({
  link: (start: LinkHandle, end: LinkHandle) => memory.ensure(start, end),
});
const source = (...values: LinkHandle[]): V015SemanticSourceOrder<LinkHandle> =>
  declareV015SemanticSourceOrder(values);

same(V015_DIRECT_ASSOCIATION_RESEARCH.status, "RESEARCH_NOT_ACCEPTED", "P1 remains research only");
same(V015_DIRECT_ASSOCIATION_RESEARCH.minimumArity, 1, "P1 minimum arity");
same(V015_DIRECT_ASSOCIATION_RESEARCH.emptyArity, "REJECTED_NO_UNIT", "P1 empty arity");
same(V015_DIRECT_ASSOCIATION_RESEARCH.singleton, "IDENTITY", "P1 singleton law");
same(V015_DIRECT_ASSOCIATION_RESEARCH.algebraicAssociativity, false, "P1 is not algebraic associativity");
same(
  V015_DIRECT_ASSOCIATION_RESEARCH.exactSequenceIdentityDistinctFromDenotation,
  true,
  "ExactSequence identity boundary is retained",
);

// Positive recurrence D1=A1; D(k+1)=Dk⟼A(k+1).
same(directSequentialAssociation(source(O), algebra), O, "singleton denotes A");
same(directSequentialAssociation(source(O, C), algebra), L, "pair denotes A⟼B");
const triple = directSequentialAssociation(source(O, C, U), algebra);
same(triple, memory.ensure(L, U), "triple denotes (A⟼B)⟼C");
const four = directSequentialAssociation(source(O, C, U, R), algebra);
same(four, memory.ensure(memory.ensure(L, U), R), "four denotes ((A⟼B)⟼C)⟼D");

// P1 consumes an already-resolved semantic/source order. Representative surface
// carriers may differ later in P2/P4, but once resolved to the same order they
// must have one DirectAssociation denotation.
for (const label of ["ABC", "A B C", "[A,B,C]", "A⟼B⟼C"]) {
  const resolved = source(O, C, U);
  same(
    directSequentialAssociation(resolved, algebra),
    triple,
    `${label}: same semantic/source order has same denotation`,
  );
}

// The source-order carrier snapshots order. Later host-array mutation is not
// semantic authority.
const hostValues = [O, C, U];
const frozenOrder = declareV015SemanticSourceOrder(hostValues);
hostValues.reverse();
same(
  directSequentialAssociation(frozenOrder, algebra),
  triple,
  "host array mutation cannot rewrite declared semantic/source order",
);

// Empty input cannot manufacture ROOT or any implicit unit Link.
expectCode(
  () => directSequentialAssociation(source(), algebra),
  "empty-semantic-source-order",
  "empty DirectAssociation is rejected",
);

// A raw/forged host container is not a semantic/source-order authority.
const forged = {
  schema: "host-array-order",
  values: [O, C],
} as unknown as V015SemanticSourceOrder<LinkHandle>;
expectCode(
  () => directSequentialAssociation(forged, algebra),
  "invalid-semantic-source-order",
  "unselected host order is rejected",
);

// Default sequential association is not algebraic associativity.
const rightGrouped = memory.ensure(O, memory.ensure(C, U));
assert(triple !== rightGrouped, "DirectAssociation triple must not collapse to A⟼(B⟼C)");

// Rooted source/storage fold is a distinct mechanism.
const directPair = directSequentialAssociation(source(O, C), algebra);
const rootedPair = rootedFold(memory, [O, C]);
assert(directPair !== rootedPair, "R-rooted source fold must not be DirectAssociation");

// ExactSequence positional identity remains stronger than DirectAssociation
// denotation. A = A⟼B gives a concrete [A] vs [A,B] denotation collision.
const B = L;
const A = memory.ensureStartSelfClosed(B);
same(memory.poles(A).start, A, "collision witness A is START(B)");
same(memory.poles(A).end, B, "collision witness payload B");
const singletonDenotation = directSequentialAssociation(source(A), algebra);
const pairDenotation = directSequentialAssociation(source(A, B), algebra);
same(singletonDenotation, pairDenotation, "DirectAssociation may be non-injective");
const exactSingleton = materializeExactSequence(memory, [A]);
const exactPair = materializeExactSequence(memory, [A, B]);
assert(exactSingleton !== exactPair, "ExactSequence keeps distinct positional identity");
same(readExactSequence(memory, exactSingleton).values.length, 1, "ExactSequence singleton preserved");
same(readExactSequence(memory, exactPair).values.length, 2, "ExactSequence pair preserved");

console.log("V15_P1_DIRECT_SEQUENTIAL_ASSOCIATION = GREEN_RESEARCH");
console.log("SEMANTIC_SOURCE_ORDER = EXPLICIT_CARRIER");
console.log("ARITY_0 = REJECTED_NO_UNIT");
console.log("ARITY_1 = IDENTITY");
console.log("ROOTED_FOLD = DISTINCT_MECHANISM");
console.log("EXACT_SEQUENCE_IDENTITY = DISTINCT_FROM_DENOTATION");
console.log("accepted MTS v0.14 semantic delta = NONE");
