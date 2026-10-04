import {
  materializeExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 A4 JSON rooted sequence: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    `${message}: ${String(actual)} !== ${String(expected)}`,
  );
}

function sequenceSame(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, `${message}: length`);
  for (let i = 0; i < expected.length; i += 1) {
    same(actual[i], expected[i], `${message}: value ${i}`);
  }
}

/**
 * Author direction:
 *
 *   Seq()       = R
 *   Seq(xs, x)  = Seq(xs) -> x
 *
 * R is the initial cursor and the stop marker when decoding backwards.
 */
function rootedFold(
  memory: Memory,
  root: LinkHandle,
  values: readonly LinkHandle[],
): LinkHandle {
  let current = root;
  for (const value of values) current = memory.ensure(current, value);
  return current;
}

/**
 * Decode the rooted sequence by following START/previous poles backwards until
 * the cursor itself becomes R.
 *
 * Important: R terminates the cursor chain. It is not emitted as a payload
 * merely because the source spelling started with R. Therefore []/[R]/[R,R]
 * intentionally share the same canonical rooted carrier.
 *
 * An END-self-closed carrier such as C is valid: poles(C)=(R,C), so in sequence
 * role it decodes as the one payload C and then terminates at R.
 */
function readRootedSequence(
  memory: Memory,
  root: LinkHandle,
  carrier: LinkHandle,
): readonly LinkHandle[] {
  const reversed: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();
  let cursor = carrier;

  while (cursor !== root) {
    assert(!seen.has(cursor), "rooted sequence predecessor cycle");
    seen.add(cursor);

    const poles = memory.poles(cursor);
    assert(
      poles.start !== cursor,
      "proper rooted sequence cell cannot be START-self-closed",
    );

    reversed.push(poles.end);
    cursor = poles.start;
  }

  reversed.reverse();
  return Object.freeze(reversed);
}

const memory = new Memory();
const basis = ensureRootBasis(memory);

const X = memory.ensure(basis.L, basis.U);
const Y = memory.ensure(basis.U, basis.L);

const foldEmpty = rootedFold(memory, basis.R, []);
const foldR = rootedFold(memory, basis.R, [basis.R]);
const foldRR = rootedFold(memory, basis.R, [basis.R, basis.R]);
const foldC = rootedFold(memory, basis.R, [basis.C]);
const foldRC = rootedFold(memory, basis.R, [basis.R, basis.C]);
const foldCR = rootedFold(memory, basis.R, [basis.C, basis.R]);
const foldCC = rootedFold(memory, basis.R, [basis.C, basis.C]);
const foldXYX = rootedFold(memory, basis.R, [X, Y, X]);

// R is the terminator/initial cursor, so leading R is intentionally normalized.
same(foldEmpty, basis.R, "[] rooted carrier");
same(foldR, basis.R, "[R] is the same terminated carrier as []");
same(foldRR, basis.R, "repeated leading terminator remains R");
same(foldRC, foldC, "leading R is structural terminator, not payload");

// Carrier identity may coincide with scalar Link identity. Role is contextual.
same(foldC, basis.C, "[C] rooted carrier may be the same Link as scalar C");

// Non-leading R remains representable as an ordinary payload.
assert(foldCR !== foldC, "[C,R] retains trailing R payload");

// Ordinary order and repetition remain represented.
assert(foldCC !== foldC, "[C,C] retains repeated ordinary payload");
sequenceSame(
  readRootedSequence(memory, basis.R, foldXYX),
  [X, Y, X],
  "ordinary order/repetition round-trip",
);

const vectors = [
  [foldEmpty, []],
  [foldR, []],
  [foldRR, []],
  [foldC, [basis.C]],
  [foldRC, [basis.C]],
  [foldCR, [basis.C, basis.R]],
  [foldCC, [basis.C, basis.C]],
  [foldXYX, [X, Y, X]],
] as const;

for (const [carrier, expected] of vectors) {
  sequenceSame(
    readRootedSequence(memory, basis.R, carrier),
    expected,
    "rooted sequence decode",
  );
}

// ExactSequence remains a valid, distinct representation layer. It intentionally
// preserves a leading R as an ordinary positional occurrence, unlike the
// root-terminated JSON-array candidate. v0.14 requires this distinction; it
// does not require JSON arrays to use ExactSequence identity.
const exactEmpty = materializeExactSequence(memory, []);
const exactR = materializeExactSequence(memory, [basis.R]);
same(exactEmpty, basis.R, "ExactSequence empty carrier");
assert(
  exactR !== exactEmpty,
  "ExactSequence positional semantics remain distinct from rooted terminator semantics",
);

console.log([
  "MTS_V015_A4=ROOT_TERMINATED_SEQUENCE_GREEN_RESEARCH",
  "JSON_ARRAY_SOURCE_CANDIDATE=R_ROOTED_SEQUENCE",
  "ROOT_ROLE=INITIAL_CURSOR_AND_BACKWARD_TERMINATOR",
  "FOLD_EMPTY_EQ_FOLD_R=INTENDED",
  "FOLD_EMPTY_EQ_FOLD_RR=INTENDED",
  "FOLD_RC_EQ_FOLD_C=INTENDED_LEADING_TERMINATOR_NORMALIZATION",
  "FOLD_SINGLETON_C_EQ_SCALAR_C=ALLOWED_CONTEXTUAL_ROLE",
  "NONLEADING_R_PAYLOAD=GREEN",
  "ORDINARY_ORDER_AND_REPETITION=GREEN",
  "BACKWARD_DECODE_TERMINATES_AT_R=GREEN",
  "EXACT_SEQUENCE=SEPARATE_STRONGER_POSITIONAL_REPRESENTATION",
  "EXACT_SEQUENCE_REQUIRED_FOR_JSON_ARRAY=FALSE_THIS_CANDIDATE",
  "AUTHOR_DIRECTION=R_IS_SEQUENCE_TERMINATOR_RECORDED",
  "ACCEPTED_V014_UNCHANGED",
].join(" "));
