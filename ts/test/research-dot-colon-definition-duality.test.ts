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

// Executable classification of this first slice only. H2 (an exact structural
// sequential factorization of Def(A)) remains deliberately unresolved.
const H1_GENERIC_UNIFIED_DEFINITION_SUPPORTED = true;
const ROOT_DEICTIC_SELF_FIXED_POINT_SUPPORTED = true;
const H2_SEQUENTIAL_UNIFIED_EQUIVALENCE_ESTABLISHED = false;
const H3_LITERAL_DOT_DOT_REINTERPRETATION_REQUIRED = false;

assert(H1_GENERIC_UNIFIED_DEFINITION_SUPPORTED, "H1 classification");
assert(ROOT_DEICTIC_SELF_FIXED_POINT_SUPPORTED, "root ЯЯ=Я classification");
assert(!H2_SEQUENTIAL_UNIFIED_EQUIVALENCE_ESTABLISHED, "H2 must remain open after H1 witness");
assert(!H3_LITERAL_DOT_DOT_REINTERPRETATION_REQUIRED, "accepted literal `..` must remain unchanged");

same(memory.linkCount, beforeRead, "research verification is read-only");
