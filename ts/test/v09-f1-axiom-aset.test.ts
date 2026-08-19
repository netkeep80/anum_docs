import {
  encodeBytesToQuaternary,
  materializeCanonicalByteSequence,
  readCanonicalByteSequence,
  textToUtf8Bytes,
} from "../src/byte-carrier.js";
import {
  defineTypedContext,
  verifyTypedContext,
} from "../src/context-integration.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
  lookupScopedDictionary,
} from "../src/dictionary.js";
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
import {
  defineStructuralInterpreter,
  readStructuralInterpreter,
  type StructuralInterpreter,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

const INTERNAL_SIGNS = ["∞", "[", "]", "1", "0", "(", ")", "⟼", ":", "="] as const;
type Glyph = (typeof INTERNAL_SIGNS)[number];

type ContextClass = "ROOT" | "Q" | "FORMAL";

interface SignSpec {
  readonly glyph: Glyph;
  readonly start: Glyph;
  readonly end: Glyph;
  readonly context: ContextClass;
  readonly qCarrier: string;
}

const SIGN_SPECS: readonly SignSpec[] = Object.freeze([
  { glyph: "∞", start: "∞", end: "∞", context: "ROOT", qCarrier: "[11100010][10001000][10011110]" },
  { glyph: "[", start: "[", end: "∞", context: "Q", qCarrier: "[01011011]" },
  { glyph: "]", start: "∞", end: "]", context: "Q", qCarrier: "[01011101]" },
  { glyph: "1", start: "[", end: "]", context: "Q", qCarrier: "[00110001]" },
  { glyph: "0", start: "]", end: "[", context: "Q", qCarrier: "[00110000]" },
  { glyph: "(", start: "(", end: "∞", context: "FORMAL", qCarrier: "[00101000]" },
  { glyph: ")", start: "∞", end: ")", context: "FORMAL", qCarrier: "[00101001]" },
  { glyph: "⟼", start: "(", end: ")", context: "FORMAL", qCarrier: "[11100010][10011111][10111100]" },
  { glyph: ":", start: "∞", end: "⟼", context: "FORMAL", qCarrier: "[00111010]" },
  { glyph: "=", start: "=", end: "=", context: "FORMAL", qCarrier: "[00111101]" },
]);

const META_OR_DEFERRED = Object.freeze([
  "≡", "♂", "♀", "↑", "{", "}", "¬", "↛", "∧", "⇔", "⇒", "≠", "→",
]);

class ReadProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("F1 closure read path must not call find"); }
  incoming(): readonly LinkHandle[] { throw new Error("F1 closure read path must not scan incoming"); }
  outgoing(): readonly LinkHandle[] { throw new Error("F1 closure read path must not scan outgoing"); }
}

const memory = new Memory();
const basis = ensureRootBasis(memory);

function mapGet<K, V>(map: ReadonlyMap<K, V>, key: K, label: string): V {
  const value = map.get(key);
  assert(value !== undefined, `missing ${label}: ${String(key)}`);
  return value;
}

const meanings = new Map<Glyph, LinkHandle>([
  ["∞", basis.R],
  ["[", basis.O],
  ["]", basis.C],
  ["1", basis.L],
  ["0", basis.U],
  ["(", basis.O],
  [")", basis.C],
  ["⟼", basis.L],
  [":", memory.ensure(basis.R, basis.L)],
  ["=", basis.R],
]);

// F1 is a closed simultaneous constraint graph: every recursive dependency is
// another retained internal sign. No META-only glyph is needed by the graph.
const internalSet = new Set<string>(INTERNAL_SIGNS);
same(internalSet.size, 10, "minimal internal alphabet size");
for (const deferred of META_OR_DEFERRED) {
  assert(!internalSet.has(deferred), `${deferred} must stay outside minimal F1`);
}
for (const spec of SIGN_SPECS) {
  assert(internalSet.has(spec.start), `${spec.glyph} start dependency must be internal`);
  assert(internalSet.has(spec.end), `${spec.glyph} end dependency must be internal`);
}

// Current v0.8 machine projection is a falsification witness for the candidate
// equations, not the #582/#583 proof of simultaneous solution/uniqueness.
for (const spec of SIGN_SPECS) {
  const meaning = mapGet(meanings, spec.glyph, "meaning");
  const poles = memory.poles(meaning);
  same(poles.start, mapGet(meanings, spec.start, "start meaning"), `${spec.glyph} recursive start pole`);
  same(poles.end, mapGet(meanings, spec.end, "end meaning"), `${spec.glyph} recursive end pole`);
}

same(mapGet(meanings, "∞", "∞"), mapGet(meanings, "=", "="), "∞ and = reuse root meaning");
same(mapGet(meanings, "[", "["), mapGet(meanings, "(", "("), "[ and ( reuse O meaning");
same(mapGet(meanings, "]", "]"), mapGet(meanings, ")", ")"), "] and ) reuse C meaning");
same(mapGet(meanings, "1", "1"), mapGet(meanings, "⟼", "⟼"), "1 and arrow reuse L meaning");
same(new Set(meanings.values()).size, 6, "ten signs project to six structural meanings");

// Carrier is exact UTF-8 byte content, materialized as an ExactSequence of the
// canonical Byte(p) meanings. Carrier identity never comes from source offset.
const carriers = new Map<Glyph, LinkHandle>();
for (const spec of SIGN_SPECS) {
  const bytes = textToUtf8Bytes(spec.glyph);
  same(encodeBytesToQuaternary(bytes), spec.qCarrier, `${spec.glyph} canonical Rep_SQ`);
  const carrier = materializeCanonicalByteSequence(memory, basis, bytes);
  carriers.set(spec.glyph, carrier);
  same(materializeCanonicalByteSequence(memory, basis, bytes), carrier, `${spec.glyph} carrier canonical reuse`);
}
same(new Set(carriers.values()).size, 10, "distinct physical glyphs have distinct exact carriers");

// E_g = c_g ⟼ m_g is the sign's own ordinary Link. Different carriers keep
// signs distinct even where #582/#583 are expected to reuse one meaning Link.
const entries = new Map<Glyph, LinkHandle>();
for (const spec of SIGN_SPECS) {
  const carrier = mapGet(carriers, spec.glyph, "carrier");
  const meaning = mapGet(meanings, spec.glyph, "meaning");
  const entry = memory.ensure(carrier, meaning);
  entries.set(spec.glyph, entry);
  same(memory.ensure(carrier, meaning), entry, `${spec.glyph} Entry canonical reuse`);
}
same(new Set(entries.values()).size, 10, "every retained glyph has its own Entry Link");
for (const [left, right] of [["∞", "="], ["[", "("], ["]", ")"], ["1", "⟼"]] as const) {
  assert(mapGet(entries, left, "left Entry") !== mapGet(entries, right, "right Entry"), `${left}/${right} Entries stay distinct`);
}

// Build one static scoped dictionary from those same canonical Entries. History
// is occurrence/declaration evidence only; it does not clone Entry or meaning.
let dictionary = defineDictionaryScope(memory, memory.root, memory.root);
let history = memory.root;
for (const spec of SIGN_SPECS) {
  const effect = defineDictionaryEffect(
    memory,
    dictionary,
    memory.root,
    history,
    mapGet(carriers, spec.glyph, "carrier"),
    mapGet(meanings, spec.glyph, "meaning"),
  );
  same(effect.entry, mapGet(entries, spec.glyph, "Entry"), `${spec.glyph} dictionary reuses Entry`);
  dictionary = effect.afterScope;
  history = effect.historyAfter;
}

// Internal axiom presentation does not use conventional equality. For every g:
//   A_g := ExactSequence(c_g, E_:, ExactSequence(m_start, E_⟼, m_end))
// The relation result is m_g and the outer colon result is exactly E_g.
const colonEntry = mapGet(entries, ":", "colon Entry");
const arrowEntry = mapGet(entries, "⟼", "arrow Entry");
const axiomForms = new Map<Glyph, LinkHandle>();
for (const spec of SIGN_SPECS) {
  const start = mapGet(meanings, spec.start, "axiom start");
  const end = mapGet(meanings, spec.end, "axiom end");
  const relationForm = materializeExactSequence(memory, [start, arrowEntry, end]);
  const relationResult = memory.ensure(start, end);
  same(relationResult, mapGet(meanings, spec.glyph, "axiom meaning"), `${spec.glyph} axiom relation result`);

  const carrier = mapGet(carriers, spec.glyph, "axiom carrier");
  const axiomForm = materializeExactSequence(memory, [carrier, colonEntry, relationForm]);
  axiomForms.set(spec.glyph, axiomForm);
  same(memory.ensure(carrier, relationResult), mapGet(entries, spec.glyph, "axiom Entry"), `${spec.glyph} axiom Entry result`);

  const outer = readExactSequence(memory, axiomForm).values;
  same(outer.length, 3, `${spec.glyph} axiom outer arity`);
  same(outer[0], carrier, `${spec.glyph} axiom source carrier`);
  same(outer[1], colonEntry, `${spec.glyph} axiom uses self-introduced colon Sign`);
  const innerRef = outer[2];
  assert(innerRef !== undefined, `${spec.glyph} relation form exists`);
  const inner = readExactSequence(memory, innerRef).values;
  same(inner.length, 3, `${spec.glyph} relation arity`);
  same(inner[1], arrowEntry, `${spec.glyph} axiom uses self-introduced arrow Sign`);
}

// In particular ':' is introduced by a form that already contains the same
// colon Entry, and the arrow axiom contains the same arrow Entry. This is one
// simultaneous recursive theory, not a token-by-token bootstrap order.
const colonAxiom = readExactSequence(memory, mapGet(axiomForms, ":", "colon axiom")).values;
same(colonAxiom[1], colonEntry, "colon participates in its own axiom-aset");
const arrowAxiom = readExactSequence(memory, mapGet(axiomForms, "⟼", "arrow axiom")).values;
const arrowInnerRef = arrowAxiom[2];
assert(arrowInnerRef !== undefined, "arrow inner relation exists");
same(readExactSequence(memory, arrowInnerRef).values[1], arrowEntry, "arrow participates in its own axiom-aset");

// The axiom-aset is an ordinary Theory Link over an exact declaration sequence;
// no EquationObject/AxiomId/unordered-set identity is introduced.
const theoryDeclarations = materializeExactSequence(
  memory,
  SIGN_SPECS.map((spec) => mapGet(axiomForms, spec.glyph, "axiom form")),
);
const theory = memory.ensureStartSelfClosed(theoryDeclarations);
const theoryPoles = memory.poles(theory);
same(theoryPoles.start, theory, "T is structurally self-introduced");
same(theoryPoles.end, theoryDeclarations, "T carries exact axiom declaration sequence");
same(readExactSequence(memory, theoryDeclarations).values.length, 10, "T declares all ten sign axioms");

// Q and FORMAL notation contexts are Links, not a host enum. They share D/T and
// differ by explicit grammar declarations. The same empty K may therefore be
// reused structurally while I ⟼ K use evidence distinguishes interpretation.
function declarationContainer(values: readonly LinkHandle[]): LinkHandle {
  return memory.ensureStartSelfClosed(materializeExactSequence(memory, values));
}
const qGrammar = declarationContainer(
  SIGN_SPECS.filter((spec) => spec.context === "Q").map((spec) => mapGet(entries, spec.glyph, "Q Entry")),
);
const formalGrammar = declarationContainer(
  SIGN_SPECS.filter((spec) => spec.context === "FORMAL").map((spec) => mapGet(entries, spec.glyph, "FORMAL Entry")),
);
assert(qGrammar !== formalGrammar, "Q and FORMAL grammars differ structurally");

const qStructure: StructuralInterpreter = Object.freeze({ dictionary, grammar: qGrammar, theory });
const formalStructure: StructuralInterpreter = Object.freeze({ dictionary, grammar: formalGrammar, theory });
const qInterpreter = defineStructuralInterpreter(memory, dictionary, qGrammar, theory);
const formalInterpreter = defineStructuralInterpreter(memory, dictionary, formalGrammar, theory);
assert(qInterpreter !== formalInterpreter, "I_Q and I_FORMAL differ through Link structure");
same(readStructuralInterpreter(memory, qInterpreter).grammar, qGrammar, "Q interpreter grammar");
same(readStructuralInterpreter(memory, formalInterpreter).grammar, formalGrammar, "FORMAL interpreter grammar");

const qContext = defineTypedContext(memory, qInterpreter, memory.root, memory.root);
const formalContext = defineTypedContext(memory, formalInterpreter, memory.root, memory.root);
same(qContext.context, formalContext.context, "same empty K state is not cloned by context name");
assert(qContext.typing !== formalContext.typing, "I ⟼ K use evidence distinguishes Q/FORMAL interpretation");
verifyTypedContext(memory, qContext, qStructure);
verifyTypedContext(memory, formalContext, formalStructure);

// Closed read cycle: from c_g the shared dictionary recovers m_g; carrier,
// dictionary, theory and context verification remain read-only and never fall
// back to find/materialization.
const probe = new ReadProbe(memory);
const beforeRead = memory.linkCount;
for (const spec of SIGN_SPECS) {
  const carrier = mapGet(carriers, spec.glyph, "read carrier");
  const resolution = lookupScopedDictionary(probe, dictionary, carrier);
  assert(resolution !== undefined, `${spec.glyph} visible in F1 dictionary`);
  same(resolution.form, mapGet(meanings, spec.glyph, "resolved meaning"), `${spec.glyph} dictionary meaning`);
  const decoded = readCanonicalByteSequence(probe, basis, carrier);
  same(encodeBytesToQuaternary(decoded.bytes), spec.qCarrier, `${spec.glyph} read-only carrier roundtrip`);
}
verifyTypedContext(probe, qContext, qStructure);
verifyTypedContext(probe, formalContext, formalStructure);
same(memory.linkCount, beforeRead, "F1 lookup/replay verification is read-only");
