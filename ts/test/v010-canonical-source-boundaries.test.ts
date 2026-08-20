import {
  materializeByteVocabulary,
  materializeCanonicalByteSequence,
  readCanonicalByteSequence,
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
  SourceError,
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

function canonicalPrefixes(memory: ReadMemory, carrier: LinkHandle): readonly LinkHandle[] {
  const exact = readExactSequence(memory, carrier);
  return Object.freeze([memory.root, ...exact.cells]);
}

// A carried RootBasis is structural evidence, not host authority, when every
// component is checked against its defining poles. This uses only poles(), so
// selected replay need not widen its current read capability to find/incoming.
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
const byteRefs = materializeByteVocabulary(memory, basis);
assert(byteRefs.every((ref) => ref !== memory.root), "canonical Byte(p) vocabulary excludes ROOT");

// Canonical basis can be carried by source evidence and verified read-only using
// only its equations. No arbitrary byteRefs table and no whole-network lookup is
// needed during replay.
const countBeforeBasisRead = memory.linkCount;
const narrowRead = new PolesOnlyProbe(memory);
const verifiedBasis = verifyRootBasisStructurally(narrowRead, basis);
same(verifiedBasis.R, basis.R, "verified R");
same(verifiedBasis.O, basis.O, "verified O");
same(verifiedBasis.C, basis.C, "verified C");
same(verifiedBasis.L, basis.L, "verified L");
same(verifiedBasis.U, basis.U, "verified U");
same(memory.linkCount, countBeforeBasisRead, "root-basis verification is read-only");

// Canonical accepted source content keeps physical bytes in ExactSequence cells.
// Repeated semantic byte values reuse Byte(p), while positions remain distinct.
const bytes = new Uint8Array([0x41, 0x41, 0x00, 0xff]);
const canonicalContent = materializeCanonicalByteSequence(memory, basis, bytes);
const canonical = readCanonicalByteSequence(narrowRead, verifiedBasis, canonicalContent);
deepSame(Array.from(canonical.bytes), Array.from(bytes), "canonical bytes round-trip with verified basis");
same(canonical.cells.length, bytes.length, "one exact cell per byte position");
assert(canonical.byteLinks[0] === canonical.byteLinks[1], "repeated 0x41 reuses one semantic Byte(p)");
assert(canonical.cells[0] !== canonical.cells[1], "repeated 0x41 keeps two structural positions");

// Legacy source selection uses an ordered prefix-boundary coordinate set.
// ExactSequence already supplies the same role without any new identity concept:
// [R, ...cells]. Each segment can therefore keep span=startBoundary->endBoundary.
const prefixes = canonicalPrefixes(narrowRead, canonicalContent);
same(prefixes.length, bytes.length + 1, "canonical boundary count");
same(prefixes[0], memory.root, "empty canonical prefix is ROOT");
same(prefixes[prefixes.length - 1], canonicalContent, "last canonical prefix is whole content");

const firstStart = prefixes[0]!;
const firstEnd = prefixes[2]!;
const secondStart = prefixes[2]!;
const secondEnd = prefixes[4]!;
const firstSpan = memory.ensure(firstStart, firstEnd);
const secondSpan = memory.ensure(secondStart, secondEnd);
const firstSlice = materializeCanonicalByteSequence(memory, basis, bytes.slice(0, 2));
const secondSlice = materializeCanonicalByteSequence(memory, basis, bytes.slice(2, 4));

same(firstStart, memory.root, "first segment begins at empty-prefix boundary");
same(firstEnd, canonical.cells[1]!, "first segment ends at second exact cell");
same(secondStart, firstEnd, "adjacent segments share one structural boundary");
same(secondEnd, canonicalContent, "last segment ends at whole-content boundary");
deepSame(
  Array.from(readCanonicalByteSequence(narrowRead, verifiedBasis, firstSlice).bytes),
  [0x41, 0x41],
  "first canonical slice",
);
deepSame(
  Array.from(readCanonicalByteSequence(narrowRead, verifiedBasis, secondSlice).bytes),
  [0x00, 0xff],
  "second canonical slice",
);
same(memory.poles(firstSpan).start, firstStart, "first span start boundary");
same(memory.poles(firstSpan).end, firstEnd, "first span end boundary");
same(memory.poles(secondSpan).start, secondStart, "second span start boundary");
same(memory.poles(secondSpan).end, secondEnd, "second span end boundary");

// ROOT remains a legal ExactSequence value generally; positions are carried by
// the self-closed Cell, so [R] is not confused with []. The legacy source
// root-exclusion from #734/#735 must therefore stay carrier-local.
const exactRootValue = materializeExactSequence(memory, [memory.root]);
assert(exactRootValue !== memory.root, "ExactSequence([R]) differs from ExactSequence([])");
const exactRootDecoded = readExactSequence(narrowRead, exactRootValue);
deepSame(exactRootDecoded.values, [memory.root], "ExactSequence preserves ROOT value");
deepSame(canonicalPrefixes(narrowRead, exactRootValue), [memory.root, exactRootValue], "ROOT value gets an explicit exact position");

// Current compatibility source API still materializes another topology even if
// the injected vocabulary itself is the canonical Byte(p) vocabulary.
const legacyContent = materializeSourceContent(memory, byteRefs, bytes);
assert(legacyContent !== canonicalContent, "legacy rooted fold and canonical ExactSequence are distinct carriers");
deepSame(
  Array.from(readSourceContent(memory, byteRefs, legacyContent).bytes),
  Array.from(bytes),
  "legacy-valid fixture keeps the same physical byte content",
);

// This is the executable post-cutover gap owned by #736: the accepted canonical
// carrier is readable by byte-carrier.ts but rejected by source.ts, so current
// selected replay cannot consume canonical source evidence without migration.
expectSourceError(
  () => readSourceContent(memory, byteRefs, canonicalContent),
  "invalid-source-content",
);

// SourceForm itself is carrier-agnostic and can already wrap canonical content;
// the migration boundary is therefore source content decoding/selection, not a
// new SourceForm semantic primitive.
const canonicalSource = defineSourceForm(memory, canonicalContent);
same(memory.poles(canonicalSource).end, canonicalContent, "SourceForm wraps canonical content unchanged");
