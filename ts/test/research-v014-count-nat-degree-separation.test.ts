// mts-version-evidence: candidate-from=0.14

import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error("v0.14 N3 Count/Nat/Degree: " + message);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function expectExactSequenceError(effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof ExactSequenceError,
      "invalid Count input must fail as non-ExactSequence",
    );
    return;
  }
  throw new Error("invalid Count input unexpectedly accepted");
}

/**
 * Cardinal-like Count over canonical ExactSequence position structure.
 *
 * No host integer is returned or stored as semantic identity. The traversal
 * first validates the canonical sequence, then folds one ordinary Nat successor
 * N -> L per exact Cell/position.
 */
function countExactSequence(
  memory: Memory,
  sequence: LinkHandle,
  zero: LinkHandle,
  unit: LinkHandle,
): LinkHandle {
  const exact = readExactSequence(memory, sequence);
  let result = zero;
  for (const _cell of exact.cells) {
    result = memory.ensure(result, unit);
  }
  return result;
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);

  // -----------------------------------------------------------------------
  // N3.1 — two distinct derived scales share the same successor constructor
  // after their different bases.
  // -----------------------------------------------------------------------

  const succNat = (value: LinkHandle): LinkHandle =>
    memory.ensure(value, L);
  const succDegree = (value: LinkHandle): LinkHandle =>
    memory.ensure(value, L);

  const N0 = U;
  const N1 = succNat(N0);
  const N2 = succNat(N1);
  const N3 = succNat(N2);

  const D1 = L;
  const D2 = succDegree(D1);
  const D3 = succDegree(D2);

  same(N0, U, "N0=U");
  same(N1, memory.ensure(U, L), "N1=U⟼L");
  assert(N1 !== D1, "Nat one must not collapse to Degree one");
  same(D1, L, "D1=L");
  same(D2, memory.ensure(L, L), "D2=L⟼L");

  // Matching positive levels remain separated in the bounded challenge because
  // ordered-pole identity plus successor injectivity preserves the unequal base.
  assert(N1 !== D1, "N1 != D1");
  assert(N2 !== D2, "N2 != D2");
  assert(N3 !== D3, "N3 != D3");

  // -----------------------------------------------------------------------
  // N3.2 — Count returns Nat by ExactSequence position cardinality.
  // -----------------------------------------------------------------------

  const A = memory.ensure(O, U);
  const B = memory.ensure(C, L);
  const Cx = memory.ensure(U, O);
  const nested = memory.ensure(
    memory.ensure(A, B),
    memory.ensure(Cx, A),
  );

  const empty = materializeExactSequence(memory, []);
  const oneA = materializeExactSequence(memory, [A]);
  const oneNested = materializeExactSequence(memory, [nested]);
  const twoDifferent = materializeExactSequence(memory, [A, B]);
  const twoEqual = materializeExactSequence(memory, [A, A]);
  const three = materializeExactSequence(memory, [A, B, Cx]);

  same(empty, R, "canonical empty ExactSequence is rooted at R");

  same(
    countExactSequence(memory, empty, U, L),
    N0,
    "Count([])=N0",
  );
  same(
    countExactSequence(memory, oneA, U, L),
    N1,
    "Count([A])=N1",
  );
  same(
    countExactSequence(memory, oneNested, U, L),
    N1,
    "nested Link value occupies one sequence position",
  );
  same(
    countExactSequence(memory, twoDifferent, U, L),
    N2,
    "Count([A,B])=N2",
  );
  same(
    countExactSequence(memory, twoEqual, U, L),
    N2,
    "equal repeated values still occupy two positions",
  );
  same(
    countExactSequence(memory, three, U, L),
    N3,
    "Count([A,B,C])=N3",
  );

  // Same cardinality, different values => same Nat result.
  same(
    countExactSequence(memory, twoDifferent, U, L),
    countExactSequence(memory, twoEqual, U, L),
    "Count depends on exact position count, not element identity",
  );

  // Cardinal one is explicitly Nat one and therefore not Degree one.
  const singletonCount = countExactSequence(memory, oneA, U, L);
  same(singletonCount, N1, "singleton Count returns Nat one");
  assert(
    singletonCount !== D1,
    "singleton Count must not return historical Degree one L",
  );

  // -----------------------------------------------------------------------
  // N3.3 — canonical Count is structural and allocation-stable.
  // Repeating Count materializes no duplicate semantic Nat Links.
  // -----------------------------------------------------------------------

  const beforeRepeat = memory.linkCount;
  same(
    countExactSequence(memory, three, U, L),
    N3,
    "repeated Count returns canonical N3",
  );
  same(
    memory.linkCount,
    beforeRepeat,
    "repeated Count adds no duplicate Links",
  );

  // -----------------------------------------------------------------------
  // N3.4 — invalid arbitrary Link topology is not a countable sequence merely
  // because it exists in Memory.
  // -----------------------------------------------------------------------

  const arbitraryPair = memory.ensure(A, B);
  expectExactSequenceError(() =>
    countExactSequence(memory, arbitraryPair, U, L),
  );

  // Outer START shape alone is not the criterion. A START-shaped Link may
  // legitimately be an ExactSequence Cell if its full previous-chain reaches R.
  // Build an explicitly malformed Cell whose payload points to a non-sequence
  // predecessor, so canonical ancestry must fail.
  const malformedPrevious = memory.ensure(A, B);
  const malformedPayload = memory.ensure(malformedPrevious, Cx);
  const malformedCell = memory.ensureStartSelfClosed(malformedPayload);
  expectExactSequenceError(() =>
    countExactSequence(memory, malformedCell, U, L),
  );

  // -----------------------------------------------------------------------
  // N3.5 — explicit semantic-role classification.
  // -----------------------------------------------------------------------

  const outputs: readonly LinkHandle[] = [
    countExactSequence(memory, empty, U, L),
    countExactSequence(memory, oneA, U, L),
    countExactSequence(memory, twoDifferent, U, L),
    countExactSequence(memory, three, U, L),
  ];

  same(outputs[0], N0, "Count output 0 is Nat");
  same(outputs[1], N1, "Count output 1 is Nat");
  same(outputs[2], N2, "Count output 2 is Nat");
  same(outputs[3], N3, "Count output 3 is Nat");

  // Host loop counters above are only bounded test controls. Semantic Count
  // results are ordinary canonical Links and are recovered from exact sequence
  // structure plus U/L, never from a stored host number.
  for (const output of outputs) {
    memory.poles(output);
  }

  console.log([
    "MTS v0.14 N3: COUNT_NAT_DEGREE_SEPARATION=GREEN_RESEARCH",
    "NAT_BASE=U",
    "NAT_SUCCESSOR=N_TO_L",
    "DEGREE_BASE=L",
    "DEGREE_SUCCESSOR=D_TO_L",
    "N1_NOT_D1=TRUE",
    "COUNT_EMPTY=N0",
    "COUNT_SINGLETON=N1",
    "COUNT_TWO_POSITIONS=N2",
    "COUNT_REPEATED_EQUAL_VALUES=POSITION_SENSITIVE",
    "COUNT_NESTED_VALUE=ONE_POSITION",
    "COUNT_RESULT_SCALE=NAT",
    "COUNT_RESULT_SCALE_DEGREE=FALSE",
    "INVALID_NON_EXACT_SEQUENCE=REJECTED",
    "HOST_INTEGER_SEMANTIC_IDENTITY=NONE",
    "HISTORICAL_DEGREE_PRESERVED=TRUE",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
