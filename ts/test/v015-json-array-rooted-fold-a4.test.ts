import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 A4 JSON sequence carrier: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function rootedFold(
  memory: Memory,
  root: LinkHandle,
  values: readonly LinkHandle[],
): LinkHandle {
  let current = root;
  for (const value of values) current = memory.ensure(current, value);
  return current;
}

const memory = new Memory();
const basis = ensureRootBasis(memory);

// Author-approved source-level candidate:
// Seq() = R
// Seq(xs,x) = Seq(xs) -> x
const foldEmpty = rootedFold(memory, basis.R, []);
const foldR = rootedFold(memory, basis.R, [basis.R]);
const foldRR = rootedFold(memory, basis.R, [basis.R, basis.R]);
const foldC = rootedFold(memory, basis.R, [basis.C]);
const foldRC = rootedFold(memory, basis.R, [basis.R, basis.C]);

same(foldEmpty, basis.R, "[] rooted fold");
same(foldR, basis.R, "[R] rooted fold collides with []");
same(foldRR, basis.R, "[R,R] rooted fold collides with []");
same(foldC, basis.C, "[C] rooted fold collides with scalar C identity");
same(foldRC, foldC, "leading R is erased: [R,C] collides with [C]");

// Historical ExactSequence is deliberately a positional carrier rather than the
// rooted-fold denotation. It preserves R as an ordinary occurrence and keeps
// the sequence carrier distinct from its element identity.
const exactEmpty = materializeExactSequence(memory, []);
const exactR = materializeExactSequence(memory, [basis.R]);
const exactRR = materializeExactSequence(memory, [basis.R, basis.R]);
const exactC = materializeExactSequence(memory, [basis.C]);
const exactRC = materializeExactSequence(memory, [basis.R, basis.C]);

same(exactEmpty, basis.R, "ExactSequence empty root");
assert(exactR !== exactEmpty, "ExactSequence distinguishes [R] from []");
assert(exactRR !== exactR, "ExactSequence preserves repeated R positions");
assert(exactC !== basis.C, "ExactSequence [C] stays distinct from scalar C");
assert(exactRC !== exactC, "ExactSequence preserves leading R");

const vectors = [
  [exactEmpty, []],
  [exactR, [basis.R]],
  [exactRR, [basis.R, basis.R]],
  [exactC, [basis.C]],
  [exactRC, [basis.R, basis.C]],
] as const;

for (const [carrier, expected] of vectors) {
  const actual = readExactSequence(memory, carrier).values;
  same(actual.length, expected.length, "ExactSequence round-trip length");
  for (let i = 0; i < expected.length; i += 1) {
    same(actual[i], expected[i], `ExactSequence round-trip value ${i}`);
  }
}

console.log([
  "MTS_V015_A4=ROOTED_FOLD_POSITIONAL_FALSIFIER_GREEN",
  "JSON_ARRAY_SOURCE_CANDIDATE=R_ROOTED_FOLD",
  "FOLD_EMPTY_EQ_FOLD_R=TRUE",
  "FOLD_EMPTY_EQ_FOLD_RR=TRUE",
  "FOLD_RC_EQ_FOLD_C=TRUE",
  "FOLD_SINGLETON_C_EQ_SCALAR_C=TRUE",
  "ROOTED_FOLD_EXACT_POSITION_IDENTITY=FALSE",
  "EXACT_SEQUENCE_R_AS_VALUE=GREEN",
  "EXACT_SEQUENCE_REPEAT_POSITION_IDENTITY=GREEN",
  "EXACT_SEQUENCE_SEQUENCE_VS_SCALAR_IDENTITY=GREEN",
  "A4_DECISION=AUTHOR_REVIEW_REQUIRED",
].join(" "));
