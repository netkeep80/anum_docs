import {
  materializeByteVocabulary,
  materializeCanonicalByteSequence,
  readCanonicalByteSequence,
} from "../src/byte-carrier.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  materializeSourceContent,
  readSourceContent,
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

// `0` below is the physical-byte array index 0x00, not the MTS abit `0`.
// The current compatibility validator accepts any 256 unique owned Links, so
// ROOT can presently masquerade as the semantic reference for byte 0x00.
const malformedByteRefs = [memory.root, ...anchors(memory, 255)];
same(malformedByteRefs.length, 256, "malformed vocabulary has all physical byte slots");
same(new Set(malformedByteRefs).size, 256, "malformed vocabulary is otherwise unique");

const empty = materializeSourceContent(memory, malformedByteRefs, new Uint8Array());
const oneZeroByte = materializeSourceContent(memory, malformedByteRefs, new Uint8Array([0x00]));

same(empty, memory.root, "empty restricted source carrier is ROOT");
same(
  oneZeroByte,
  empty,
  "current validator admits byteRefs[0x00]=ROOT, so one byte collapses to empty",
);
deepSame(
  Array.from(readSourceContent(memory, malformedByteRefs, oneZeroByte).bytes),
  [],
  "reader cannot recover the collapsed physical byte",
);

const oneByte = materializeSourceContent(memory, malformedByteRefs, new Uint8Array([0x01]));
const leadingZeroThenOne = materializeSourceContent(
  memory,
  malformedByteRefs,
  new Uint8Array([0x00, 0x01]),
);
same(
  leadingZeroThenOne,
  oneByte,
  "leading ROOT-valued byte also disappears before a following byte",
);

// Control: the legacy restricted carrier remains injective on its accepted
// root-excluded value domain.
const rootFreeByteRefs = anchors(memory, 256);
assert(rootFreeByteRefs.every((ref) => ref !== memory.root), "control vocabulary excludes ROOT");
const rootFreeZero = materializeSourceContent(memory, rootFreeByteRefs, new Uint8Array([0x00]));
assert(rootFreeZero !== memory.root, "root-free byte 0x00 remains distinguishable from empty");
deepSame(
  Array.from(readSourceContent(memory, rootFreeByteRefs, rootFreeZero).bytes),
  [0x00],
  "root-free compatibility vocabulary round-trips byte 0x00",
);

// The accepted canonical v0.9 byte carrier is a different class:
// Byte(p)=Denote_Q([p]) and source content is ExactSequence<Byte(p)>.
// It must stay unaffected by the restricted-carrier negative witness.
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
