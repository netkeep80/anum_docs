import {
  materializeByteLink,
  readByteLink,
} from "../src/byte-carrier.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";
import {
  defineSourceForm,
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

function canonicalPrefixes(memory: ReadMemory, carrier: LinkHandle): readonly LinkHandle[] {
  const exact = readExactSequence(memory, carrier);
  return Object.freeze([memory.root, ...exact.cells]);
}

function verifyRootBasisStructurally(memory: ReadMemory, basis: RootBasis): RootBasis {
  const { R, O, C, L, U } = basis;
  same(R, memory.root, "basis R must be current ROOT");
  const root = memory.poles(R);
  const open = memory.poles(O);
  const close = memory.poles(C);
  const one = memory.poles(L);
  const zero = memory.poles(U);
  assert(root.start === R && root.end === R, "R=R->R");
  assert(open.start === O && open.end === R, "O=O->R");
  assert(close.start === R && close.end === C, "C=R->C");
  assert(one.start === O && one.end === C, "L=O->C");
  assert(zero.start === C && zero.end === O, "U=C->O");
  return basis;
}

class PolesOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("canonical source verification must not use find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("canonical source verification must not use outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("canonical source verification must not use incoming"); }
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const narrowRead = new PolesOnlyProbe(memory);
const countBeforeBasisRead = memory.linkCount;
const verifiedBasis = verifyRootBasisStructurally(narrowRead, basis);
same(memory.linkCount, countBeforeBasisRead, "root-basis verification is read-only");

// Source content now uses the accepted ExactSequence<Byte(p)> carrier directly.
const bytes = new Uint8Array([0x41, 0x41, 0x00, 0xff]);
const sourceContent = materializeSourceContent(memory, bytes);
const sourceRead = readSourceContent(narrowRead, verifiedBasis, sourceContent);
deepSame(Array.from(sourceRead.bytes), Array.from(bytes), "source bytes round-trip canonically");

const exact = readExactSequence(narrowRead, sourceContent);
same(exact.cells.length, bytes.length, "one ExactSequence cell per physical byte position");
assert(exact.values[0] === exact.values[1], "repeated 0x41 reuses one semantic Byte(p)");
assert(exact.cells[0] !== exact.cells[1], "repeated 0x41 keeps distinct structural positions");
same(readByteLink(narrowRead, verifiedBasis, exact.values[0]!), 0x41, "first byte is canonical Byte(0x41)");
same(readByteLink(narrowRead, verifiedBasis, exact.values[2]!), 0x00, "third byte is canonical Byte(0x00)");
same(readByteLink(narrowRead, verifiedBasis, exact.values[3]!), 0xff, "fourth byte is canonical Byte(0xff)");

// Source selection boundaries are exactly [R, ...cells], preserving the old
// span relation without source offsets, UUIDs or semantic value copies.
deepSame(sourceRead.prefixes, [memory.root, ...exact.cells], "source exposes canonical boundary positions");
const firstStart = sourceRead.prefixes[0]!;
const firstEnd = sourceRead.prefixes[2]!;
const secondStart = sourceRead.prefixes[2]!;
const secondEnd = sourceRead.prefixes[4]!;
const firstSpan = memory.ensure(firstStart, firstEnd);
const secondSpan = memory.ensure(secondStart, secondEnd);
same(firstStart, memory.root, "first segment begins at empty-prefix boundary");
same(firstEnd, exact.cells[1]!, "first segment ends at second exact cell");
same(secondStart, firstEnd, "adjacent segments share one exact boundary");
same(secondEnd, sourceContent, "last segment ends at whole source content");
same(memory.poles(firstSpan).start, firstStart, "first span start");
same(memory.poles(firstSpan).end, firstEnd, "first span end");
same(memory.poles(secondSpan).start, secondStart, "second span start");
same(memory.poles(secondSpan).end, secondEnd, "second span end");

const firstSlice = materializeSourceContent(memory, bytes.slice(0, 2));
const secondSlice = materializeSourceContent(memory, bytes.slice(2, 4));
deepSame(Array.from(readSourceContent(narrowRead, verifiedBasis, firstSlice).bytes), [0x41, 0x41], "first source slice");
deepSame(Array.from(readSourceContent(narrowRead, verifiedBasis, secondSlice).bytes), [0x00, 0xff], "second source slice");

// ROOT remains legal in ExactSequence generally; #734/#735 was a property of
// the removed legacy restricted byte fold, not a global sequence restriction.
const exactRootValue = materializeExactSequence(memory, [memory.root]);
assert(exactRootValue !== memory.root, "ExactSequence([R]) differs from ExactSequence([])");
deepSame(readExactSequence(narrowRead, exactRootValue).values, [memory.root], "ExactSequence preserves ROOT value");
deepSame(canonicalPrefixes(narrowRead, exactRootValue), [memory.root, exactRootValue], "ROOT value has an explicit position");

// Byte(p) itself remains the accepted Q-derived value, independent of source position.
const byteZero = materializeByteLink(memory, basis, 0x00);
assert(byteZero !== memory.root, "Byte(0x00) is not ROOT");
same(readByteLink(narrowRead, verifiedBasis, byteZero), 0x00, "Byte(0x00) round-trip");

// SourceForm remains carrier-agnostic and wraps canonical content unchanged.
const source = defineSourceForm(memory, sourceContent);
same(memory.poles(source).end, sourceContent, "SourceForm wraps canonical source content");
