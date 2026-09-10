import {
  CarrierInputError,
  decodeCarrierStream,
  deserializeCarrier,
  validateCarrierVocabulary,
  type AnumCarrierVocabulary,
} from "../src/anum-carrier.js";
import {
  symbolicStackAlgebra,
  type StreamDenotation,
} from "../src/anum.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";
import { readRootedSequence } from "../src/rooted-sequence.js";
import {
  QuaternarySerializationError,
  serializeQuaternaryLink,
} from "../src/quaternary-serialization.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`AR5 Q bootstrap probe: ${message}`);
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

function vocabularyOf(basis: RootBasis): AnumCarrierVocabulary {
  return Object.freeze({
    opening: basis.O,
    closing: basis.C,
    linked: basis.L,
    unlinked: basis.U,
  });
}

function carrier(memory: Memory, basis: RootBasis, source: string): LinkHandle {
  const values = new Map<string, LinkHandle>([
    ["[", basis.O],
    ["]", basis.C],
    ["1", basis.L],
    ["0", basis.U],
  ]);
  let current = basis.R;
  for (const symbol of source) {
    const value = values.get(symbol);
    assert(value !== undefined, `fixture source contains non-Q symbol ${JSON.stringify(symbol)}`);
    current = memory.ensure(current, value);
  }
  return current;
}

function expectCarrierError(effect: () => unknown, code: CarrierInputError["code"]): void {
  let rejected = false;
  try {
    effect();
  } catch (error) {
    assert(error instanceof CarrierInputError, `expected CarrierInputError, got ${String(error)}`);
    same(error.code, code, "carrier error code");
    rejected = true;
  }
  assert(rejected, `expected CarrierInputError(${code})`);
}

function expectSerializationError(
  effect: () => unknown,
  code: QuaternarySerializationError["code"],
): void {
  let rejected = false;
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof QuaternarySerializationError,
      `expected QuaternarySerializationError, got ${String(error)}`,
    );
    same(error.code, code, "serialization error code");
    rejected = true;
  }
  assert(rejected, `expected QuaternarySerializationError(${code})`);
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("AR5 Q bootstrap forbids find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("AR5 Q bootstrap forbids outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("AR5 Q bootstrap forbids incoming"); }
}

// F08: R alone is not a Q vocabulary. A read-only receiver cannot decode a
// carrier by silently treating root as all four abits or inferring a basis from
// spelling. The vocabulary must already identify five distinct canonical Links.
{
  const rootOnly = new Memory();
  const R = rootOnly.root;
  const degenerate: AnumCarrierVocabulary = Object.freeze({
    opening: R,
    closing: R,
    linked: R,
    unlinked: R,
  });
  expectCarrierError(() => validateCarrierVocabulary(rootOnly, degenerate), "invalid-vocabulary");
  expectCarrierError(() => decodeCarrierStream(rootOnly, R, degenerate), "invalid-vocabulary");
}

const memoryA = new Memory();
const basisA = ensureRootBasis(memoryA);
const vocabA = vocabularyOf(basisA);
validateCarrierVocabulary(memoryA, vocabA);

// The declared basis is checked from Link topology, not trusted by field name.
const swappedA: AnumCarrierVocabulary = Object.freeze({
  opening: basisA.C,
  closing: basisA.O,
  linked: basisA.L,
  unlinked: basisA.U,
});
expectCarrierError(() => validateCarrierVocabulary(memoryA, swappedA), "invalid-vocabulary");

// Validation and decoding are closure-local: no ambient index/discovery API is
// available to this reader.
const source = "[10]";
const carrierA = carrier(memoryA, basisA, source);
const poleOnlyA = new PoleOnlyProbe(memoryA);
validateCarrierVocabulary(poleOnlyA, vocabA);
same(decodeCarrierStream(poleOnlyA, carrierA, vocabA), source, "pole-only Q carrier decode");

// F07: the source/carrier occurrence representing the printed glyph '[' is a
// different Link from the root semantic opening Link O. Spelling never equates
// occurrence identity with semantic abit identity.
const openingCarrierA = carrier(memoryA, basisA, "[");
assert(openingCarrierA !== basisA.O, "carrier occurrence '[' must differ from semantic O");
same(decodeCarrierStream(memoryA, openingCarrierA, vocabA), "[", "source '[' decode");

// Even stronger identity-vs-Use witness already permitted by canonical
// topology: U is the semantic vocabulary value for abit 0, but under the
// explicit carrier-sequence reader the same Link is also the rooted carrier ][.
same(carrier(memoryA, basisA, "]["), basisA.U, "canonical U is also carrier for ][");
same(decodeCarrierStream(memoryA, basisA.U, vocabA), "][", "carrier Use of U is explicit");

// The carrier is first an ordinary rooted sequence of semantic vocabulary
// Links. Balanced Q evaluation is a selected operational interpretation over
// that carrier, not an intrinsic alternate identity of the carrier Link.
deepSame(
  readRootedSequence(memoryA, carrierA).values,
  [basisA.O, basisA.L, basisA.U, basisA.C],
  "carrier structural values",
);
const denotationA: StreamDenotation<string> = deserializeCarrier(
  memoryA,
  carrierA,
  vocabA,
  symbolicStackAlgebra,
);
same(denotationA.operations.join(","), "OPEN,VALUE,VALUE,CLOSE", "balanced Q operations");

// The current serializer explicitly has a smaller proven domain than arbitrary
// Link topology. This prevents treating the operational Q profile as a claimed
// universal Link -> Q inverse.
same(serializeQuaternaryLink(memoryA, basisA, basisA.R), "", "flat serializer root");
same(serializeQuaternaryLink(memoryA, basisA, basisA.L), "1", "flat serializer L");
const outsideFlatDomain = memoryA.ensureStartSelfClosed(basisA.L);
expectSerializationError(
  () => serializeQuaternaryLink(memoryA, basisA, outsideFlatDomain),
  "not-serializable",
);

// Root-relative, not handle-global: a second Memory has a structurally
// equivalent local basis but cannot accept foreign handles from A. Rebuilding
// the same carrier against B's own root basis yields the same source and Q
// denotation.
const memoryB = new Memory();
const basisB = ensureRootBasis(memoryB);
const vocabB = vocabularyOf(basisB);
const carrierB = carrier(memoryB, basisB, source);
expectCarrierError(
  () => validateCarrierVocabulary(memoryB, vocabA),
  "invalid-vocabulary",
);
same(decodeCarrierStream(memoryB, carrierB, vocabB), source, "B decodes same Q source");
const denotationB = deserializeCarrier(memoryB, carrierB, vocabB, symbolicStackAlgebra);
deepSame(denotationB, denotationA, "root-relative memories agree on Q operational result");

const classification = Object.freeze({
  rootAloneIsInsufficient: true,
  basisMustBeCanonicalRelativeToSelectedRoot: true,
  basisValidationIsPoleOnly: true,
  sourceGlyphOccurrenceIsNotSemanticAbitIdentity: true,
  sameLinkMayHaveDifferentExplicitUses: true,
  carrierStructurePrecedesOperationalQInterpretation: true,
  balancedQIsOperationalProfile: true,
  currentQSerializerIsNotUniversalLinkInverse: true,
  crossMemoryEquivalenceIsRootRelativeNotHandlePortable: true,
  verdict: "GREEN-CANDIDATE" as const,
  reason: "Q_REQUIRES_PRE_SHARED_ROOT_BASIS_AND_EXPLICIT_PROFILE" as const,
});

same(classification.verdict, "GREEN-CANDIDATE", "AR5 classification");
same(
  classification.reason,
  "Q_REQUIRES_PRE_SHARED_ROOT_BASIS_AND_EXPLICIT_PROFILE",
  "AR5 reason",
);

console.log("MTS AR5 Q bootstrap: root-relative basis boundary exercised.");
