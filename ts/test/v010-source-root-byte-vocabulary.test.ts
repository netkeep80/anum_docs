import {
  materializeByteVocabulary,
  materializeCanonicalByteSequence,
  readCanonicalByteSequence,
} from "../src/byte-carrier.js";
import {
  InterpreterReplayError,
  replayRelationStep,
} from "../src/interpreter.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  SourceError,
  defineSourceForm,
  materializeSourceContent,
  readSourceContent,
  type SourceFrontEndEvidence,
} from "../src/source.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function deepSame(actual: unknown, expected: unknown, message: string): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
  );
}

function expectSourceError(effect: () => unknown, code: SourceError["code"]): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof SourceError, `expected SourceError, got ${String(error)}`);
    same(error.code, code, "source error code");
    return;
  }
  throw new Error(`expected SourceError(${code})`);
}

function expectInterpreterError(
  effect: () => unknown,
  code: InterpreterReplayError["code"],
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof InterpreterReplayError, `expected InterpreterReplayError, got ${String(error)}`);
    same(error.code, code, "interpreter replay error code");
    return;
  }
  throw new Error(`expected InterpreterReplayError(${code})`);
}

function anchors(memory: Memory, count: number): LinkHandle[] {
  const result: LinkHandle[] = [];
  let current = memory.root;
  for (let index = 0; index < count; index += 1) {
    current = memory.ensureStartSelfClosed(current);
    result.push(current);
  }
  return result;
}

const memory = new Memory();

// `0x00` below is the physical-byte index, not the MTS abit `0`.
// CI #3026 on the test-only witness proved the old behavior:
// byteRefs[0x00]=ROOT made content([0x00]) collapse to content([])=ROOT.
const malformedByteRefs = [memory.root, ...anchors(memory, 255)];
same(malformedByteRefs.length, 256, "malformed vocabulary has all physical byte slots");
same(new Set(malformedByteRefs).size, 256, "malformed vocabulary is otherwise unique");

expectSourceError(
  () => materializeSourceContent(memory, malformedByteRefs, new Uint8Array([0x00])),
  "invalid-byte-vocabulary",
);
expectSourceError(
  () => readSourceContent(memory, malformedByteRefs, memory.root),
  "invalid-byte-vocabulary",
);

// The fail-closed boundary propagates through the selected public replay path:
// source evidence is rejected before any Act/role semantics can be trusted.
const emptySource = defineSourceForm(memory, memory.root);
const sourceEvidence: SourceFrontEndEvidence = Object.freeze({
  content: memory.root,
  source: emptySource,
  dictionary: memory.root,
  grammar: memory.root,
  theory: memory.root,
  segments: Object.freeze([]),
  selectionSequence: memory.root,
  formSequence: memory.root,
  grammarMembership: memory.root,
  theoryMembership: memory.root,
});
expectInterpreterError(
  () => replayRelationStep(memory, malformedByteRefs, {
    sourceEvidence,
    act: memory.root,
    roles: {
      source: memory.root,
      sourceSelection: memory.root,
      formSequence: memory.root,
      dictionary: memory.root,
      grammar: memory.root,
      theory: memory.root,
      form: memory.root,
      beforeContext: memory.root,
      binding: memory.root,
      result: memory.root,
      afterContext: memory.root,
    },
    interpreter: memory.root,
    roleDictionary: memory.root,
  }),
  "invalid-relation-evidence",
);

// Control: the compatibility restricted carrier remains exact on its already
// accepted root-excluded domain.
const rootFreeByteRefs = anchors(memory, 256);
assert(rootFreeByteRefs.every((ref) => ref !== memory.root), "control vocabulary excludes ROOT");
const rootFreeZero = materializeSourceContent(memory, rootFreeByteRefs, new Uint8Array([0x00]));
assert(rootFreeZero !== memory.root, "root-free byte 0x00 remains distinguishable from empty");
deepSame(
  Array.from(readSourceContent(memory, rootFreeByteRefs, rootFreeZero).bytes),
  [0x00],
  "root-free compatibility vocabulary round-trips byte 0x00",
);

// Canonical v0.9+ Byte(p)/ExactSequence is a different carrier class and must
// remain unaffected; ROOT is legal as an ExactSequence value in general.
const basis = ensureRootBasis(memory);
const canonicalByteRefs = materializeByteVocabulary(memory, basis);
assert(canonicalByteRefs.every((ref) => ref !== memory.root), "canonical Byte(p) vocabulary contains no ROOT");
const canonicalZero = materializeCanonicalByteSequence(memory, basis, new Uint8Array([0x00]));
assert(canonicalZero !== memory.root, "ExactSequence preserves the canonical zero-byte position");
deepSame(
  Array.from(readCanonicalByteSequence(memory, basis, canonicalZero).bytes),
  [0x00],
  "canonical exact byte sequence round-trips byte 0x00",
);
