import {
  analyzeDirectDeixisCarrier,
  type DeicticOccurrence,
  type DirectDeixisVocabulary,
} from "../src/direct-deixis.js";
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
  type WriteMemory,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`dot/colon definition duality: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function sameJson(actual: unknown, expected: unknown, message: string): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
  );
}

class ReadProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("research verification must not call find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("research verification must not scan outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("research verification must not scan incoming"); }
}

interface DefinitionWitness {
  readonly whole: LinkHandle;
  readonly start: LinkHandle;
  readonly end: LinkHandle;
  readonly dual: LinkHandle;
  readonly definition: LinkHandle;
  readonly recursiveSelfForm: LinkHandle;
}

function materializeDefinition(
  memory: WriteMemory,
  whole: LinkHandle,
): DefinitionWitness {
  const start = memory.ensureStartSelfClosed(whole);
  const end = memory.ensureEndSelfClosed(whole);
  const dual = memory.ensure(start, end);
  const definition = memory.ensure(whole, dual);
  const recursiveSelfForm = memory.ensure(whole, whole);
  return Object.freeze({
    whole,
    start,
    end,
    dual,
    definition,
    recursiveSelfForm,
  });
}

function verifyDefinition(
  memory: ReadMemory,
  witness: DefinitionWitness,
  label: string,
): void {
  const startPoles = memory.poles(witness.start);
  same(startPoles.start, witness.start, `${label}: START(A) is start-selfclosed`);
  same(startPoles.end, witness.whole, `${label}: START(A) targets A`);

  const endPoles = memory.poles(witness.end);
  same(endPoles.start, witness.whole, `${label}: END(A) starts at A`);
  same(endPoles.end, witness.end, `${label}: END(A) is end-selfclosed`);

  const dualPoles = memory.poles(witness.dual);
  same(dualPoles.start, witness.start, `${label}: Dual(A) starts at START(A)`);
  same(dualPoles.end, witness.end, `${label}: Dual(A) ends at END(A)`);

  const definitionPoles = memory.poles(witness.definition);
  same(definitionPoles.start, witness.whole, `${label}: Def(A) starts at whole A`);
  same(definitionPoles.end, witness.dual, `${label}: Def(A) ends at Dual(A)`);

  const recursivePoles = memory.poles(witness.recursiveSelfForm);
  same(recursivePoles.start, witness.whole, `${label}: ЯЯ starts at Я`);
  same(recursivePoles.end, witness.whole, `${label}: ЯЯ ends at Я`);
}

function rootedSequence(
  memory: WriteMemory,
  values: readonly LinkHandle[],
): LinkHandle {
  let current = memory.root;
  for (const value of values) current = memory.ensure(current, value);
  return current;
}

function deicticPronoun(
  memory: WriteMemory,
  vocabulary: DirectDeixisVocabulary,
  pole: "start" | "end",
): LinkHandle {
  const marker = pole === "start" ? vocabulary.startPole : vocabulary.endPole;
  return memory.ensure(
    vocabulary.pronounTag,
    rootedSequence(memory, [marker]),
  );
}

function deicticNode(
  memory: WriteMemory,
  vocabulary: DirectDeixisVocabulary,
  children: readonly LinkHandle[],
): LinkHandle {
  return memory.ensure(
    vocabulary.nodeTag,
    rootedSequence(memory, children),
  );
}

function poleValue(
  witness: DefinitionWitness,
  occurrence: DeicticOccurrence,
): LinkHandle {
  return occurrence.pole === "start" ? witness.start : witness.end;
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const { R, O, C, L, U } = basis;

// Research H1: a complete unified definition is derived entirely from the
// already accepted constructors. No new semantic primitive is introduced.
const generic = memory.ensure(L, U);
const samples = [
  ["R", R],
  ["O", O],
  ["C", C],
  ["L", L],
  ["U", U],
  ["Pair(L,U)", generic],
] as const;

const witnesses = samples.map(([label, whole]) => [
  label,
  materializeDefinition(memory, whole),
] as const);

const rootWitness = witnesses[0]?.[1];
assert(rootWitness !== undefined, "root witness must exist");
const nonRootWitness = witnesses.find(([label]) => label === "L")?.[1];
assert(nonRootWitness !== undefined, "non-root L witness must exist");

// Root specialization of the generic definition recovers the already accepted
// sign-meaning derivation exactly.
same(rootWitness.start, O, "Dual root START is O");
same(rootWitness.end, C, "Dual root END is C");
same(rootWitness.dual, L, "Dual(R)=Pair(O,C)=L");

const colonMeaning = memory.ensure(R, L);
const dotMeaning = memory.ensure(L, R);
same(rootWitness.definition, colonMeaning, "Def(R)=Pair(R,L)=ColonMeaning");

// Deictic/self-reference reading:
//   .  ~ Я
//   .. ~ ЯЯ
// The structural self-form is Pair(A,A). ROOT is its accepted full fixed point;
// finite negative witnesses below must not be promoted into a proof of global
// uniqueness (that uniqueness is already a separate accepted foundation law).
same(rootWitness.recursiveSelfForm, R, "ЯЯ(R)=Pair(R,R)=R");
for (const [label, witness] of witnesses.slice(1)) {
  assert(
    witness.recursiveSelfForm !== witness.whole,
    `${label}: non-root ЯЯ must not collapse to Я`,
  );
}

// Exact occurrence sequence is not semantic pair identity. This preserves the
// accepted distinction between two deictic positions and their root fold.
const rootSelfSequence = materializeExactSequence(memory, [R, R]);
assert(rootSelfSequence !== R, "ExactSequence(Я,Я) must preserve two positions");
assert(colonMeaning !== R, "ColonMeaning must not equal root ЯЯ fold result");
assert(colonMeaning !== rootWitness.recursiveSelfForm, "Def(R) must not equal ЯЯ(R)");
assert(dotMeaning !== colonMeaning, "DotMeaning and ColonMeaning remain oriented/distinct");

const colonPoles = memory.poles(colonMeaning);
same(memory.ensure(colonPoles.end, colonPoles.start), dotMeaning, "DotMeaning remains Inv(ColonMeaning)");

// H2 uses the already accepted Direct Deixis vocabulary as a structural analogue
// for metanotational Я. It does NOT identify PRONOUN with physical '.' or with
// DotMeaning. Pole meaning is explicit carrier evidence, never inferred from path.
const deicticVocabulary: DirectDeixisVocabulary = Object.freeze({
  nodeTag: L,
  opaqueTag: U,
  pronounTag: generic,
  upStep: memory.ensure(U, L),
  startPole: O,
  endPole: C,
});
const yaStart = deicticPronoun(memory, deicticVocabulary, "start");
const yaEnd = deicticPronoun(memory, deicticVocabulary, "end");
const orientedCarrier = deicticNode(memory, deicticVocabulary, [yaStart, yaEnd]);
const reversedCarrier = deicticNode(memory, deicticVocabulary, [yaEnd, yaStart]);
assert(orientedCarrier !== reversedCarrier, "opposite explicit pole sequences need distinct carriers");

const reverseRootDefinition = memory.ensure(R, U);
assert(reverseRootDefinition !== colonMeaning, "Pair(R,U) must differ from ColonMeaning=Pair(R,L)");

// All construction ends here. The actual witness verification below has only
// ReadMemory authority and must leave memory unchanged.
const beforeRead = memory.linkCount;
const probe = new ReadProbe(memory);

for (const [label, witness] of witnesses) {
  verifyDefinition(probe, witness, label);
}

const exactRootSelf = readExactSequence(probe, rootSelfSequence);
same(exactRootSelf.values.length, 2, "ЯЯ has two exact positions");
same(exactRootSelf.values[0], R, "first Я resolves to root whole");
same(exactRootSelf.values[1], R, "second Я resolves to root whole");

same(probe.poles(rootWitness.definition).start, R, "root definition whole pole");
same(probe.poles(rootWitness.definition).end, L, "root definition dual pole");
same(probe.poles(rootWitness.recursiveSelfForm).start, R, "root ЯЯ start");
same(probe.poles(rootWitness.recursiveSelfForm).end, R, "root ЯЯ end");

// H2a/H2b: the same two structural positions may carry opposite explicit pole
// evidence. This is the executable distinction between order and orientation.
const oriented = analyzeDirectDeixisCarrier(probe, orientedCarrier, deicticVocabulary);
const reversed = analyzeDirectDeixisCarrier(probe, reversedCarrier, deicticVocabulary);
same(oriented.length, 2, "oriented Я_start Я_end arity");
same(reversed.length, 2, "reversed Я_end Я_start arity");
sameJson(oriented.map(({ path }) => path), [[0], [1]], "oriented occurrence paths");
sameJson(reversed.map(({ path }) => path), [[0], [1]], "reversed occurrence paths stay identical");
sameJson(oriented.map(({ pole }) => pole), ["start", "end"], "oriented explicit poles");
sameJson(reversed.map(({ pole }) => pole), ["end", "start"], "reversed explicit poles");
sameJson(oriented.map(({ up }) => up), [0, 0], "oriented occurrences are direct self-deixis");
sameJson(reversed.map(({ up }) => up), [0, 0], "reversed occurrences are direct self-deixis");

const rootSeqStart = poleValue(rootWitness, oriented[0]!);
const rootSeqEnd = poleValue(rootWitness, oriented[1]!);
same(rootSeqStart, O, "explicit Я_start(R) selects START(R)=O");
same(rootSeqEnd, C, "explicit Я_end(R) selects END(R)=C");
same(probe.poles(rootWitness.dual).start, rootSeqStart, "SeqDual(R) start matches Dual(R)");
same(probe.poles(rootWitness.dual).end, rootSeqEnd, "SeqDual(R) end matches Dual(R)");
same(rootWitness.dual, L, "SeqDual(R)=Pair(O,C)=L");
same(rootWitness.definition, colonMeaning, "SeqDef(R)=Def(R)=ColonMeaning");

// The factorization is generic in the selected whole, not a ROOT-only glyph trick.
const nonRootSeqStart = poleValue(nonRootWitness, oriented[0]!);
const nonRootSeqEnd = poleValue(nonRootWitness, oriented[1]!);
same(probe.poles(nonRootWitness.dual).start, nonRootSeqStart, "SeqDual(L) start matches Dual(L)");
same(probe.poles(nonRootWitness.dual).end, nonRootSeqEnd, "SeqDual(L) end matches Dual(L)");
same(probe.poles(nonRootWitness.definition).end, nonRootWitness.dual, "SeqDef(L)=Def(L)");

const reverseRootStart = poleValue(rootWitness, reversed[0]!);
const reverseRootEnd = poleValue(rootWitness, reversed[1]!);
same(reverseRootStart, C, "reversed first Я explicitly selects END(R)=C");
same(reverseRootEnd, O, "reversed second Я explicitly selects START(R)=O");
same(probe.poles(U).start, reverseRootStart, "reversed root dual starts at C");
same(probe.poles(U).end, reverseRootEnd, "reversed root dual ends at O");
same(probe.poles(reverseRootDefinition).start, R, "reversed unified root form starts at R");
same(probe.poles(reverseRootDefinition).end, U, "reversed unified root form ends at U");
assert(reverseRootDefinition !== colonMeaning, "reversed explicit orientation must not define colon");

// Executable research classification. Sequential/unified equivalence is
// supported only when the two self-occurrences carry explicit opposite pole
// roles. Bare ЯЯ and occurrence order alone are insufficient.
const H1_GENERIC_UNIFIED_DEFINITION_SUPPORTED = true;
const ROOT_DEICTIC_SELF_FIXED_POINT_SUPPORTED = true;
const H2_ROLE_EXPLICIT_SEQUENTIAL_FACTORIZATION_SUPPORTED = true;
const ORDER_ONLY_POLE_DERIVATION_SUPPORTED = false;
const BARE_SELF_FOLD_EQUALS_UNIFIED_DEFINITION = false;
const H3_LITERAL_DOT_DOT_REINTERPRETATION_REQUIRED = false;

assert(H1_GENERIC_UNIFIED_DEFINITION_SUPPORTED, "H1 classification");
assert(ROOT_DEICTIC_SELF_FIXED_POINT_SUPPORTED, "root ЯЯ=Я classification");
assert(H2_ROLE_EXPLICIT_SEQUENTIAL_FACTORIZATION_SUPPORTED, "role-explicit H2 factorization");
assert(!ORDER_ONLY_POLE_DERIVATION_SUPPORTED, "equal paths with opposite poles falsify order-only orientation");
assert(!BARE_SELF_FOLD_EQUALS_UNIFIED_DEFINITION, "bare ЯЯ must remain distinct from Def(A)");
assert(!H3_LITERAL_DOT_DOT_REINTERPRETATION_REQUIRED, "accepted literal `..` must remain unchanged");

same(memory.linkCount, beforeRead, "research verification is read-only");
