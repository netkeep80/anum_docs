import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  decodeCarrierStream,
  type AnumCarrierVocabulary,
} from "../src/anum-carrier.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  materializeQuaternaryAnum,
  serializeMaterializedQuaternaryAnum,
} from "../src/quaternary-anum.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 A4 JSON sequence layers: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function distinct<T>(actual: T, expected: T, message: string): void {
  assert(!Object.is(actual, expected), `${message}: values unexpectedly equal`);
}

type JsonVector = string | readonly JsonVector[];

function parseJsonVector(source: string): JsonVector {
  const parsed: unknown = JSON.parse(source);
  const validate = (value: unknown): JsonVector => {
    if (typeof value === "string") {
      assert(value === "R" || value === "C", "fixture scalar must be R or C");
      return value;
    }
    assert(Array.isArray(value), "fixture value must be a JSON array or scalar name");
    return Object.freeze(value.map(validate));
  };
  return validate(parsed);
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const text = new TextDecoder();

function scalar(name: string): LinkHandle {
  if (name === "R") return basis.R;
  if (name === "C") return basis.C;
  throw new Error("unsupported fixture scalar: " + name);
}

/**
 * Approved v0.15 JSON-array source denotation candidate.
 *
 * This is the plain R-rooted fold. It is deliberately NOT ExactSequence.
 */
function rootedJsonDenotation(value: JsonVector): LinkHandle {
  if (typeof value === "string") return scalar(value);
  let current = basis.R;
  for (const item of value) {
    current = memory.ensure(current, rootedJsonDenotation(item));
  }
  return current;
}

/**
 * Research comparison only:
 * recursively use historical ExactSequence as an array carrier.
 *
 * A nested array is passed outward by its denoted/resulting Link.
 * Since the empty sequence is R by definition, [[]] and [R] are expected to
 * supply the same element value R to the outer ExactSequence. This is semantic
 * composition, not a positional-carrier defect.
 */
function exactJsonCarrier(value: JsonVector): LinkHandle {
  if (typeof value === "string") return scalar(value);
  return materializeExactSequence(memory, value.map(exactJsonCarrier));
}

function recursive8961(link: LinkHandle): string {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    link,
  );
  return text.decode(
    serializeV013HierarchicalCarrier(memory, basis, carrier),
  );
}

function nestedEmpty(depth: number): JsonVector {
  assert(Number.isInteger(depth) && depth >= 1, "nested depth must be positive");
  let value: JsonVector = Object.freeze([]);
  for (let level = 1; level < depth; level += 1) {
    value = Object.freeze([value]);
  }
  return value;
}

function nestedEmptySource(depth: number): string {
  return JSON.stringify(nestedEmpty(depth));
}

// ---------------------------------------------------------------------------
// 1. JSON source identity is its own layer.
// ---------------------------------------------------------------------------

const sourceCorpus = Object.freeze([
  "[]",
  '["R"]',
  '["R","R"]',
  '["C"]',
  '["R","C"]',
  "[[]]",
  '[[],"C"]',
  "[[[]]]",
]);

const normalizedSources = sourceCorpus.map((source) => JSON.stringify(JSON.parse(source)));
same(new Set(normalizedSources).size, sourceCorpus.length, "JSON structural sources stay pairwise distinct");

// ---------------------------------------------------------------------------
// 2. R-rooted denotation: source distinctions may intentionally collapse.
// ---------------------------------------------------------------------------

const rooted = new Map(sourceCorpus.map((source) => [
  source,
  rootedJsonDenotation(parseJsonVector(source)),
] as const));

same(rooted.get("[]"), basis.R, "rooted []");
same(rooted.get('["R"]'), basis.R, "rooted [R] shares R denotation");
same(rooted.get('["R","R"]'), basis.R, "rooted [R,R] shares R denotation");
same(rooted.get("[[]]"), basis.R, "rooted nested empty shares R denotation");
same(rooted.get("[[[]]]"), basis.R, "rooted doubly nested empty shares R denotation");

same(rooted.get('["C"]'), basis.C, "rooted [C] shares C denotation");
same(rooted.get('["R","C"]'), basis.C, "rooted leading R before C is denotationally transparent");
same(rooted.get('[[],"C"]'), basis.C, "rooted empty nested prefix before C is denotationally transparent");

same(recursive8961(rooted.get("[]")!), "8", "recursive codec of rooted empty denotation");
same(recursive8961(rooted.get("[[]]")!), "8", "recursive codec sees the same rooted R denotation");
same(recursive8961(rooted.get('["C"]')!), "68", "recursive codec of rooted C denotation");

// ---------------------------------------------------------------------------
// 3. Historical ExactSequence: positional marking is stronger, but does not
//    by itself preserve a nested-container/type boundary.
// ---------------------------------------------------------------------------

const exact = new Map(sourceCorpus.map((source) => [
  source,
  exactJsonCarrier(parseJsonVector(source)),
] as const));

same(exact.get("[]"), basis.R, "Exact [] carrier");
distinct(exact.get('["R"]'), exact.get("[]"), "Exact [R] distinguishes one position from empty");
distinct(exact.get('["R","R"]'), exact.get('["R"]'), "Exact repeated R preserves second position");
distinct(exact.get('["C"]'), basis.C, "Exact [C] stays distinct from scalar C");
distinct(exact.get('["R","C"]'), exact.get('["C"]'), "Exact leading R position is preserved");

// Expected composition law: [] denotes R, so an outer sequence sees the same value R.
same(
  exact.get("[[]]"),
  exact.get('["R"]'),
  "recursive ExactSequence composes []=R as the same outer element value",
);
same(
  exact.get('[[],"C"]'),
  exact.get('["R","C"]'),
  "recursive ExactSequence composes nested []=R in the outer prefix",
);
distinct(
  exact.get("[[[]]]"),
  exact.get("[[]]"),
  "a further outer ExactSequence position creates another distinguishable carrier",
);

same(recursive8961(exact.get("[]")!), "8", "Exact [] recursive structure");
same(recursive8961(exact.get('["R"]')!), "98", "Exact [R] is START(R)");
same(recursive8961(exact.get("[[]]")!), "98", "Exact [[]] shares the same carrier as Exact [R]");
distinct(
  recursive8961(exact.get("[[[]]]")!),
  recursive8961(exact.get("[[]]")!),
  "recursive codec reflects distinct deeper Exact carrier",
);

// ExactSequence itself still round-trips the values it was actually given.
for (const source of ['["R"]', '["R","R"]', '["C"]', '["R","C"]'] as const) {
  const parsed = parseJsonVector(source);
  assert(Array.isArray(parsed), "top-level exact fixture is array");
  const expected = parsed.map((item) => exactJsonCarrier(item));
  const actual = readExactSequence(memory, exact.get(source)!).values;
  same(actual.length, expected.length, source + " ExactSequence length");
  for (let index = 0; index < expected.length; index += 1) {
    same(actual[index], expected[index], source + " ExactSequence value " + index);
  }
}

// ---------------------------------------------------------------------------
// 4. Anum/Q: same square-bracket glyphs, different layer.
//    Nested empty Q sources retain exact source/carrier structure while their
//    interpreted anumLink denotation may all be R.
// ---------------------------------------------------------------------------

const abitVocabulary: AnumCarrierVocabulary = Object.freeze({
  opening: basis.O,
  closing: basis.C,
  linked: basis.L,
  unlinked: basis.U,
});

function abitCarrier(source: string): LinkHandle {
  let current = basis.R;
  for (const abit of source) {
    const value =
      abit === "[" ? basis.O :
      abit === "]" ? basis.C :
      abit === "1" ? basis.L :
      abit === "0" ? basis.U :
      undefined;
    assert(value !== undefined, "Q fixture contains only abits");
    current = memory.ensure(current, value);
  }
  return current;
}

const qNestedSources = Object.freeze([
  "[]",
  "[[]]",
  "[[[]]]",
  "[[[[]]]]",
]);

const qCarriers: LinkHandle[] = [];
for (const source of qNestedSources) {
  const anum = materializeQuaternaryAnum(memory, basis, source);
  same(anum.anumLink, basis.R, source + " Q interpreted denotation is R");
  same(
    serializeMaterializedQuaternaryAnum(memory, basis, anum),
    source,
    source + " Q source hierarchy round-trips",
  );

  const carrier = abitCarrier(source);
  same(
    decodeCarrierStream(memory, carrier, abitVocabulary),
    source,
    source + " rooted abit carrier round-trips exact bracket stream",
  );
  qCarriers.push(carrier);
}
same(new Set(qCarriers).size, qCarriers.length, "Q abit carriers distinguish nested empty bracket sources");

// ---------------------------------------------------------------------------
// 5. Arbitrarily deep nested empties expose the layer distinction clearly.
// ---------------------------------------------------------------------------

const depthLimit = 32;
const exactNestedCarriers: LinkHandle[] = [];
const qNestedCarriers: LinkHandle[] = [];

for (let depth = 1; depth <= depthLimit; depth += 1) {
  const value = nestedEmpty(depth);
  const source = nestedEmptySource(depth);

  same(rootedJsonDenotation(value), basis.R, `rooted nested empty depth ${depth} collapses to R`);

  const exactCarrier = exactJsonCarrier(value);
  exactNestedCarriers.push(exactCarrier);

  const q = materializeQuaternaryAnum(memory, basis, source);
  same(q.anumLink, basis.R, `Q nested empty depth ${depth} denotes R`);
  same(serializeMaterializedQuaternaryAnum(memory, basis, q), source, `Q depth ${depth} source round-trip`);

  const qCarrier = abitCarrier(source);
  qNestedCarriers.push(qCarrier);
  same(decodeCarrierStream(memory, qCarrier, abitVocabulary), source, `Q depth ${depth} carrier round-trip`);
}

// Exact recursive wrapping distinguishes the depth chain itself...
same(
  new Set(exactNestedCarriers).size,
  exactNestedCarriers.length,
  "recursive ExactSequence carriers distinguish nested-empty depths 1..32",
);
// Depth 2 ([[]]) equals [R] after element denotation because [] = R by definition.
same(exactNestedCarriers[1], exact.get('["R"]'), "Exact nested-empty depth 2 composes []=R");

same(
  new Set(qNestedCarriers).size,
  qNestedCarriers.length,
  "rooted Q abit carriers distinguish nested-empty depths 1..32",
);

console.log([
  "MTS_V015_A4=SEQUENCE_LAYER_MATRIX_GREEN",
  "JSON_SOURCE_IDENTITY=DISTINCT",
  "ROOTED_FOLD_NESTED_EMPTY_DENOTATION=R",
  "ROOTED_FOLD_POSITIONAL_IDENTITY=NO",
  "EXACT_SEQUENCE_POSITION_IDENTITY=YES",
  "EMPTY_SEQUENCE_DENOTATION=R",
  "EXACT_SEQUENCE_NESTED_EMPTY_EQUALS_R_ELEMENT=EXPECTED",
  "Q_SOURCE_NESTING_ROUNDTRIP=YES",
  "Q_INTERPRETED_NESTED_EMPTY_DENOTATION=R",
  "Q_ABIT_CARRIER_NESTING_IDENTITY=YES",
  "RECURSIVE_8961=ENCODES_SELECTED_LINK_NOT_JSON_OR_Q_SOURCE",
  "A4_DECISION=AUTHOR_REVIEW_REQUIRED",
].join(" "));
