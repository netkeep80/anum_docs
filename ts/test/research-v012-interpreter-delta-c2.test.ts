import {
  encodeBytesToQuaternary,
  readCanonicalByteSequence,
  textToUtf8Bytes,
} from "../src/byte-carrier.js";
import {
  continueFormalContext,
  continueQuaternaryContext,
  defineTypedContext,
  openFormalContext,
  openQuaternaryContext,
  replayQuaternaryClose,
  type TypedContext,
} from "../src/context-integration.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import { materializeSourceContent } from "../src/source.js";
import { readContext } from "../src/state.js";
import {
  defineStructuralInterpreter,
  type StructuralInterpreter,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function sameBytes(actual: Uint8Array, expected: readonly number[], message: string): void {
  same(actual.length, expected.length, `${message} length`);
  for (let index = 0; index < expected.length; index += 1) {
    same(actual[index], expected[index], `${message}[${index}]`);
  }
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
const basis = ensureRootBasis(memory);
const pool = anchors(memory, 16);
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
const formalI = interpreter("formal");
const qI = interpreter("q");
// Comparison identity only. C2 intentionally does not implement STRING execution.
const stringI = interpreter("string-candidate");

assert(rootI.handle !== formalI.handle, "I_ROOT and I_FORMAL must differ structurally");
assert(formalI.handle !== qI.handle, "I_FORMAL and I_Q must differ structurally");
assert(qI.handle !== stringI.handle, "I_Q and candidate I_STRING must differ structurally");

// Retained cross-layer law: physical STRING `1` is UTF-8 byte 0x31, whose
// canonical Q carrier is [00110001]. The byte Link is not the Q abit L.
const oneBytes = textToUtf8Bytes("1");
sameBytes(oneBytes, [0x31], "STRING glyph 1 UTF-8 bytes");
same(encodeBytesToQuaternary(oneBytes), "[00110001]", "STRING glyph 1 canonical Q representation");
const oneSourceContent = materializeSourceContent(memory, oneBytes);
const oneSource = readCanonicalByteSequence(memory, basis, oneSourceContent);
sameBytes(oneSource.bytes, [0x31], "STRING glyph 1 source bytes round-trip");
same(oneSource.byteLinks.length, 1, "STRING glyph 1 has one canonical byte Link");
const oneByteLink = oneSource.byteLinks[0];
assert(oneByteLink !== undefined, "STRING glyph 1 byte Link exists");
assert(oneByteLink !== basis.L, "STRING glyph 1 byte Link must not collapse to Q abit 1/L");

// Accepted v0.11 nested-bracket evidence: FORMAL explicitly opens an I_Q child.
// This composes the existing lifecycle rather than inventing a source parser.
const parentCurrent = materializeExactSequence(memory, [next("parent-marker")]);
const parent: TypedContext = defineTypedContext(memory, rootI.handle, memory.root, parentCurrent);
let formal = openFormalContext(memory, parent, rootI.structure, formalI.handle);
let qChild = openQuaternaryContext(memory, formal, formalI.structure, qI.handle);
same(qChild.interpreter, qI.handle, "accepted FORMAL bracket child is I_Q");
assert(qChild.interpreter !== stringI.handle, "accepted FORMAL bracket child is not candidate I_STRING");

qChild = continueQuaternaryContext(memory, qChild, qI.structure, basis.L);
const qOneResult = memory.ensure(memory.root, basis.L);
same(
  replayQuaternaryClose(memory, qChild, qI.structure, formal, formalI.structure, qOneResult),
  qOneResult,
  "accepted Q child closes with Q abit 1 result",
);
formal = continueFormalContext(memory, formal, formalI.structure, qOneResult);
const formalValues = readExactSequence(memory, readContext(memory, formal.context).current).values;
same(formalValues.at(-1), qOneResult, "FORMAL parent consumes accepted Q child result");

const classification = Object.freeze({
  sameGlyphRolesDistinct: oneByteLink !== basis.L,
  representationSeparationRetained: encodeBytesToQuaternary(oneBytes) === "[00110001]" && oneByteLink !== basis.L,
  currentFormalBracketQChildConfirmed: qChild.interpreter === qI.handle,
  candidateRequiredFormalBracketChild: stringI.handle,
  candidateSatisfiedByCurrentRuntime: qChild.interpreter === stringI.handle,
  verdict: "RED" as const,
  reason: "FORMAL_SQUARE_BRACKET_CHILD_INTERPRETER_MISMATCH" as const,
});

same(classification.sameGlyphRolesDistinct, true, "same physical glyph has distinct STRING/Q roles");
same(classification.representationSeparationRetained, true, "representation remains distinct from interpretation");
same(classification.currentFormalBracketQChildConfirmed, true, "current FORMAL bracket path remains Q-typed");
same(classification.candidateRequiredFormalBracketChild, stringI.handle, "candidate comparison target is I_STRING");
same(classification.candidateSatisfiedByCurrentRuntime, false, "accepted runtime does not satisfy v0.12 FORMAL [] -> I_STRING");
same(classification.verdict, "RED", "v0.12 interpreter delta classification");
same(
  classification.reason,
  "FORMAL_SQUARE_BRACKET_CHILD_INTERPRETER_MISMATCH",
  "v0.12 interpreter delta RED reason",
);

console.log("MTS v0.12 C2 interpreter delta: RED confirmed against accepted v0.11 runtime.");
