import {
  materializeCanonicalByteSequence,
  textToUtf8Bytes,
} from "../src/byte-carrier.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`C2 minimal sign basis: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function vector(id: string, condition: boolean): void {
  assert(condition, `vector failed: ${id}`);
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const R = basis.R;

// C2 first separates semantic derivation from every physical/source sign.
// Only ROOT plus the generic rooted constructors are used in this phase.
const O = memory.ensureStartSelfClosed(R);
const C = memory.ensureEndSelfClosed(R);
const L = memory.ensure(O, C);
const colonMeaning = memory.ensure(R, L);
const dotMeaning = memory.ensure(L, R);

same(O, basis.O, "START(R) derives accepted O");
same(C, basis.C, "END(R) derives accepted C");
same(L, basis.L, "Pair(O,C) derives accepted L");

const colonPoles = memory.poles(colonMeaning);
const dotPoles = memory.poles(dotMeaning);
same(colonPoles.start, R, "ColonMeaning starts at R");
same(colonPoles.end, L, "ColonMeaning ends at L");
same(dotPoles.start, L, "DotMeaning starts at L");
same(dotPoles.end, R, "DotMeaning ends at R");
same(memory.ensure(colonPoles.end, colonPoles.start), dotMeaning, "DotMeaning is inverse of ColonMeaning");
assert(colonMeaning !== dotMeaning, "colon and dot semantic Links remain oriented and distinct");

const semanticLinkCount = memory.linkCount;

// Representation is introduced only after both semantic values already exist.
// Carrier/Entry identity therefore cannot be an authority for those values.
const colonBytes = textToUtf8Bytes(":");
const dotBytes = textToUtf8Bytes(".");
const arrowBytes = textToUtf8Bytes("⟼");
same(colonBytes.length, 1, "colon UTF-8 arity");
same(colonBytes[0], 0x3a, "colon UTF-8 byte");
same(dotBytes.length, 1, "dot UTF-8 arity");
same(dotBytes[0], 0x2e, "dot UTF-8 byte");

const colonCarrier = materializeCanonicalByteSequence(memory, basis, colonBytes);
const dotCarrier = materializeCanonicalByteSequence(memory, basis, dotBytes);
const arrowCarrier = materializeCanonicalByteSequence(memory, basis, arrowBytes);
assert(memory.linkCount > semanticLinkCount, "physical carriers are a later representation layer");

const arrowEntry = memory.ensure(arrowCarrier, L);
const colonEntry = memory.ensure(colonCarrier, colonMeaning);
const dotEntry = memory.ensure(dotCarrier, dotMeaning);

assert(colonCarrier !== colonMeaning, "colon carrier must differ from ColonMeaning");
assert(dotCarrier !== dotMeaning, "dot carrier must differ from DotMeaning");
assert(colonEntry !== colonMeaning, "colon Entry must differ from ColonMeaning");
assert(dotEntry !== dotMeaning, "dot Entry must differ from DotMeaning");
assert(colonEntry !== dotEntry, "colon and dot Entries must remain distinct");

// Accepted F1 axiom presentation:
//   A_g = ExactSequence(c_g, E_:, ExactSequence(m_start, E_⟼, m_end))
// Reproduce only ':' and '.' so C2 tests the real presentation dependency
// without changing the accepted v0.10 theory or production runtime.
const colonRelation = materializeExactSequence(memory, [R, arrowEntry, L]);
const colonAxiom = materializeExactSequence(memory, [colonCarrier, colonEntry, colonRelation]);
const colonOuter = readExactSequence(memory, colonAxiom).values;
const colonInner = readExactSequence(memory, colonRelation).values;
same(colonOuter[0], colonCarrier, "colon axiom source carrier");
same(colonOuter[1], colonEntry, "colon axiom requires the colon Entry it presents");
same(colonInner[0], R, "colon relation starts at R");
same(colonInner[1], arrowEntry, "colon relation uses arrow Entry");
same(colonInner[2], L, "colon relation ends at L");
same(memory.ensure(R, L), colonMeaning, "colon relation result is derived ColonMeaning");
same(memory.ensure(colonCarrier, colonMeaning), colonEntry, "colon axiom result reuses pre-existing colon Entry");

const dotRelation = materializeExactSequence(memory, [L, arrowEntry, R]);
const dotAxiom = materializeExactSequence(memory, [dotCarrier, colonEntry, dotRelation]);
const dotOuter = readExactSequence(memory, dotAxiom).values;
const dotInner = readExactSequence(memory, dotRelation).values;
same(dotOuter[0], dotCarrier, "dot axiom source carrier");
same(dotOuter[1], colonEntry, "dot axiom uses already-admitted colon syntax");
same(dotInner[0], L, "dot relation starts at L");
same(dotInner[1], arrowEntry, "dot relation uses arrow Entry");
same(dotInner[2], R, "dot relation ends at R");
same(memory.ensure(L, R), dotMeaning, "dot relation result is derived DotMeaning");
same(memory.ensure(dotCarrier, dotMeaning), dotEntry, "dot axiom result reuses dot Entry");

const dotDeclarationContainsDotEntry = dotOuter.includes(dotEntry) || dotInner.includes(dotEntry);
assert(!dotDeclarationContainsDotEntry, "dot declaration must not require its own Entry");

// Executable C2 classification. Semantic simplification succeeds, but the
// current colon-based declaration notation remains a simultaneous fixed point.
const verdict = Object.freeze({
  SEMANTIC_SIMPLIFICATION_SUPPORTED:
    colonPoles.start === R
    && colonPoles.end === L
    && dotPoles.start === L
    && dotPoles.end === R,
  SELF_HOSTED_PRESENTATION_CYCLE_REMAINS:
    colonOuter[1] === colonEntry,
  REPRESENTATION_SIGNS_RETAINED:
    colonCarrier !== colonMeaning
    && dotCarrier !== dotMeaning
    && colonEntry !== colonMeaning
    && dotEntry !== dotMeaning
    && colonEntry !== dotEntry,
  DOT_DECLARATION_IS_ACYCLIC_WITH_RESPECT_TO_ITS_OWN_ENTRY:
    !dotDeclarationContainsDotEntry,
});

vector("c2-semantic-simplification-supported", verdict.SEMANTIC_SIMPLIFICATION_SUPPORTED);
vector("c2-self-hosted-presentation-cycle-remains", verdict.SELF_HOSTED_PRESENTATION_CYCLE_REMAINS);
vector("c2-representation-signs-retained", verdict.REPRESENTATION_SIGNS_RETAINED);
vector(
  "c2-dot-declaration-does-not-self-reference-dot-entry",
  verdict.DOT_DECLARATION_IS_ACYCLIC_WITH_RESPECT_TO_ITS_OWN_ENTRY,
);
