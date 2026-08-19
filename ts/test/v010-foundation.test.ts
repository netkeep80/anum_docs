import {
  encodeBytesToQuaternary,
  materializeCanonicalByteSequence,
  readCanonicalByteSequence,
  textToUtf8Bytes,
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
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.10 foundation: ${message}`);
}

function same<T>(actual: T, expected: T, vector: string): void {
  assert(Object.is(actual, expected), `${vector}: ${String(actual)} !== ${String(expected)}`);
}

function vector(id: string, condition: boolean): void {
  assert(condition, `vector failed: ${id}`);
}

const INTERNAL_SIGNS = ["∞", "[", "]", "1", "0", "(", ")", "⟼", ":", "=", "."] as const;
type Glyph = (typeof INTERNAL_SIGNS)[number];

interface SignSpec {
  readonly glyph: Glyph;
  readonly start: Glyph;
  readonly end: Glyph;
  readonly qCarrier: string;
}

const SIGN_SPECS: readonly SignSpec[] = Object.freeze([
  { glyph: "∞", start: "∞", end: "∞", qCarrier: "[11100010][10001000][10011110]" },
  { glyph: "[", start: "[", end: "∞", qCarrier: "[01011011]" },
  { glyph: "]", start: "∞", end: "]", qCarrier: "[01011101]" },
  { glyph: "1", start: "[", end: "]", qCarrier: "[00110001]" },
  { glyph: "0", start: "]", end: "[", qCarrier: "[00110000]" },
  { glyph: "(", start: "(", end: "∞", qCarrier: "[00101000]" },
  { glyph: ")", start: "∞", end: ")", qCarrier: "[00101001]" },
  { glyph: "⟼", start: "(", end: ")", qCarrier: "[11100010][10011111][10111100]" },
  { glyph: ":", start: "∞", end: "⟼", qCarrier: "[00111010]" },
  { glyph: "=", start: "=", end: "=", qCarrier: "[00111101]" },
  { glyph: ".", start: "⟼", end: "∞", qCarrier: "[00101110]" },
]);

const META_OR_SUPERSEDED = Object.freeze(["≡", "♂", "♀", "↑", "{", "}", "¬", "↛", "∧", "⇔", "⇒", "≠", "→"]);

class ReadProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("v0.10 foundation read path must not call find"); }
  incoming(): readonly LinkHandle[] { throw new Error("v0.10 foundation read path must not scan incoming"); }
  outgoing(): readonly LinkHandle[] { throw new Error("v0.10 foundation read path must not scan outgoing"); }
}

function mapGet<K, V>(map: ReadonlyMap<K, V>, key: K, label: string): V {
  const value = map.get(key);
  assert(value !== undefined, `missing ${label}: ${String(key)}`);
  return value;
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const colonMeaning = memory.ensure(basis.R, basis.L);
const dotMeaning = memory.ensure(basis.L, basis.R);

const meanings = new Map<Glyph, LinkHandle>([
  ["∞", basis.R],
  ["[", basis.O],
  ["]", basis.C],
  ["1", basis.L],
  ["0", basis.U],
  ["(", basis.O],
  [")", basis.C],
  ["⟼", basis.L],
  [":", colonMeaning],
  ["=", basis.R],
  [".", dotMeaning],
]);

const internalSet = new Set<string>(INTERNAL_SIGNS);
vector("v010-internal-sign-registry-has-eleven-signs", internalSet.size === 11);
for (const sign of META_OR_SUPERSEDED) {
  assert(!internalSet.has(sign), `${sign} must remain outside v0.10 internal signs`);
}
for (const spec of SIGN_SPECS) {
  assert(internalSet.has(spec.start), `${spec.glyph} start dependency must be internal`);
  assert(internalSet.has(spec.end), `${spec.glyph} end dependency must be internal`);
}

for (const spec of SIGN_SPECS) {
  const poles = memory.poles(mapGet(meanings, spec.glyph, "meaning"));
  same(poles.start, mapGet(meanings, spec.start, "start meaning"), `${spec.glyph}-recursive-start`);
  same(poles.end, mapGet(meanings, spec.end, "end meaning"), `${spec.glyph}-recursive-end`);
}

const colonPoles = memory.poles(colonMeaning);
const dotPoles = memory.poles(dotMeaning);
same(colonPoles.start, basis.R, "v010-colon-meaning-preserved:start");
same(colonPoles.end, basis.L, "v010-colon-meaning-preserved:end");
same(dotPoles.start, basis.L, "v010-dot-root-projection-is-L-to-R:start");
same(dotPoles.end, basis.R, "v010-dot-root-projection-is-L-to-R:end");
vector("v010-dot-self-introduction", dotPoles.start === mapGet(meanings, "⟼", "arrow") && dotPoles.end === mapGet(meanings, "∞", "root"));
vector("v010-dot-is-not-new-root-primitive", dotMeaning !== basis.R);
same(memory.ensure(colonPoles.end, colonPoles.start), dotMeaning, "v010-dot-is-pole-swap-of-colon");
same(memory.ensure(dotPoles.end, dotPoles.start), colonMeaning, "v010-colon-is-pole-swap-of-dot");

const carriers = new Map<Glyph, LinkHandle>();
for (const spec of SIGN_SPECS) {
  const bytes = textToUtf8Bytes(spec.glyph);
  same(encodeBytesToQuaternary(bytes), spec.qCarrier, `${spec.glyph}-canonical-carrier`);
  const carrier = materializeCanonicalByteSequence(memory, basis, bytes);
  carriers.set(spec.glyph, carrier);
  same(materializeCanonicalByteSequence(memory, basis, bytes), carrier, `${spec.glyph}-carrier-reuse`);
}
vector(
  "v010-dot-byte-carrier-is-00101110",
  encodeBytesToQuaternary(textToUtf8Bytes(".")) === "[00101110]",
);
same(new Set(carriers.values()).size, 11, "eleven distinct glyph carriers");

const entries = new Map<Glyph, LinkHandle>();
for (const spec of SIGN_SPECS) {
  const entry = memory.ensure(
    mapGet(carriers, spec.glyph, "carrier"),
    mapGet(meanings, spec.glyph, "meaning"),
  );
  entries.set(spec.glyph, entry);
}
vector("v010-dot-entry-distinct-from-meaning", mapGet(entries, ".", "dot entry") !== dotMeaning);
same(new Set(entries.values()).size, 11, "eleven distinct sign entries");

const colonEntry = mapGet(entries, ":", "colon entry");
const arrowEntry = mapGet(entries, "⟼", "arrow entry");
const axiomForms = new Map<Glyph, LinkHandle>();
for (const spec of SIGN_SPECS) {
  const start = mapGet(meanings, spec.start, "axiom start");
  const end = mapGet(meanings, spec.end, "axiom end");
  const relationForm = materializeExactSequence(memory, [start, arrowEntry, end]);
  const relationResult = memory.ensure(start, end);
  same(relationResult, mapGet(meanings, spec.glyph, "axiom meaning"), `${spec.glyph}-axiom-result`);

  const carrier = mapGet(carriers, spec.glyph, "axiom carrier");
  const axiomForm = materializeExactSequence(memory, [carrier, colonEntry, relationForm]);
  axiomForms.set(spec.glyph, axiomForm);
  same(memory.ensure(carrier, relationResult), mapGet(entries, spec.glyph, "axiom entry"), `${spec.glyph}-axiom-entry`);
}

const dotAxiom = readExactSequence(memory, mapGet(axiomForms, ".", "dot axiom")).values;
same(dotAxiom[1], colonEntry, "dot axiom uses self-introduced colon entry");
const dotInnerRef = dotAxiom[2];
assert(dotInnerRef !== undefined, "dot axiom relation exists");
const dotInner = readExactSequence(memory, dotInnerRef).values;
same(dotInner[0], basis.L, "dot axiom starts at arrow meaning L");
same(dotInner[1], arrowEntry, "dot axiom uses self-introduced arrow entry");
same(dotInner[2], basis.R, "dot axiom ends at root meaning R");

const declarations = materializeExactSequence(
  memory,
  SIGN_SPECS.map((spec) => mapGet(axiomForms, spec.glyph, "axiom form")),
);
const theory = memory.ensureStartSelfClosed(declarations);
const theoryPoles = memory.poles(theory);
same(theoryPoles.start, theory, "eleven-sign theory is self-introduced");
same(theoryPoles.end, declarations, "eleven-sign theory carries exact declarations");
same(readExactSequence(memory, declarations).values.length, 11, "v010-eleven-sign-axiom-aset-closed");
vector("v010-eleven-sign-axiom-aset-closed", true);

const probe = new ReadProbe(memory);
const beforeRead = memory.linkCount;
for (const spec of SIGN_SPECS) {
  const carrier = mapGet(carriers, spec.glyph, "read carrier");
  const decoded = readCanonicalByteSequence(probe, basis, carrier);
  same(encodeBytesToQuaternary(decoded.bytes), spec.qCarrier, `${spec.glyph}-read-only-carrier`);
  const axiom = readExactSequence(probe, mapGet(axiomForms, spec.glyph, "read axiom")).values;
  same(axiom.length, 3, `${spec.glyph}-read-only-axiom-arity`);
}
same(readExactSequence(probe, declarations).values.length, 11, "read-only theory declaration count");
vector("v010-eleven-sign-closure-read-only", memory.linkCount === beforeRead);
