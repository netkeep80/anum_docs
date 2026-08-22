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
import { defineContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  StructuralRuleError,
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  replayStructuralRule,
  type StructuralInterpreter,
} from "../src/structural-rule.js";

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

function expectStructuralRuleError(
  code: StructuralRuleError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`dot/colon definition duality: ${code}: expected StructuralRuleError`);
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

function exactCellPredecessor(
  memory: ReadMemory,
  cell: LinkHandle,
): LinkHandle {
  const cellPoles = memory.poles(cell);
  same(cellPoles.start, cell, "ExactSequence cell is start-selfclosed");
  return memory.poles(cellPoles.end).start;
}

function materializeMethodPoleClaim(
  memory: WriteMemory,
  method: LinkHandle,
  fromOccurrence: LinkHandle,
  toOccurrence: LinkHandle,
  start: LinkHandle,
  end: LinkHandle,
): LinkHandle {
  const occurrenceRoles = memory.ensure(
    memory.ensure(fromOccurrence, start),
    memory.ensure(toOccurrence, end),
  );
  return memory.ensure(
    method,
    memory.ensure(start, memory.ensure(end, occurrenceRoles)),
  );
}

type MethodPoleBinding = readonly [LinkHandle, LinkHandle];

function materializeMethodPoleAct(
  memory: WriteMemory,
  interpreter: LinkHandle,
  roleDictionary: LinkHandle,
  afterContext: LinkHandle,
  bindings: readonly MethodPoleBinding[],
  reverseHostInsertion = false,
): LinkHandle {
  const act = defineActHeader(memory, interpreter, roleDictionary, afterContext);
  const ordered = reverseHostInsertion ? [...bindings].reverse() : bindings;
  for (const [role, value] of ordered) defineActField(memory, act, role, value);
  return act;
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

// H2d: asymmetry is not inequality of the raw values at A.start/A.end. An
// ordinary Pair(X,X) has equal raw pole values, while the two one-sided roles
// START(A) and END(A) remain structurally different. This is the machine witness
// for the stronger foundation claim that ordered pole ROLES, not endpoint-value
// inequality, are the source of orientation.
const equalRawPoleWhole = memory.ensure(L, L);
const equalRawPoleWitness = materializeDefinition(memory, equalRawPoleWhole);
const equalRawPoles = memory.poles(equalRawPoleWhole);
same(equalRawPoles.start, L, "equal-raw-pole witness starts at L");
same(equalRawPoles.end, L, "equal-raw-pole witness ends at the same L");
for (const [label, witness] of [
  ...witnesses,
  ["Pair(L,L)", equalRawPoleWitness] as const,
]) {
  assert(witness.start !== witness.end, `${label}: START(A) and END(A) roles remain distinct`);
}

// Interpreter, traversal and method are ordinary Links in the same aset.
const rootSelfForMethod = readExactSequence(memory, rootSelfSequence);
same(rootSelfForMethod.cells.length, 2, "ЯЯ method witness has two structural cells");
const firstSelfCell = rootSelfForMethod.cells[0];
const secondSelfCell = rootSelfForMethod.cells[1];
assert(firstSelfCell !== undefined, "first Я occurrence cell exists");
assert(secondSelfCell !== undefined, "second Я occurrence cell exists");
same(exactCellPredecessor(memory, firstSelfCell), R, "first Я cell follows sequence root");
same(exactCellPredecessor(memory, secondSelfCell), firstSelfCell, "second Я cell follows first Я cell");

const directTraversal = memory.ensure(firstSelfCell, secondSelfCell);
const inverseTraversal = memory.ensure(secondSelfCell, firstSelfCell);
assert(directTraversal !== inverseTraversal, "direct and inverse traversals are distinct Links");

const methodInterpreterStructure: StructuralInterpreter = Object.freeze({
  dictionary: colonMeaning,
  grammar: dotMeaning,
  theory: generic,
});
const interpreter = defineStructuralInterpreter(
  memory,
  methodInterpreterStructure.dictionary,
  methodInterpreterStructure.grammar,
  methodInterpreterStructure.theory,
);
const directMethod = memory.ensure(interpreter, directTraversal);
const inverseMethod = memory.ensure(interpreter, inverseTraversal);
assert(directMethod !== inverseMethod, "same interpreter with inverse traversal yields another method Link");

// H2e generic rule checks Method=I⟼(FROM⟼TO), S=S⟼A and E=A⟼E,
// then relates FROM⟼S and TO⟼E; role names alone cannot fake the equations.
const methodRoleCarrier = materializeExactSequence(
  memory,
  [generic, generic, generic, generic, generic, generic],
);
const methodRoles = readExactSequence(memory, methodRoleCarrier).cells;
same(methodRoles.length, 6, "H2e rule has six exact structural roles");
const wholeRole = methodRoles[0]!;
const interpreterRole = methodRoles[1]!;
const fromRole = methodRoles[2]!;
const toRole = methodRoles[3]!;
const startRole = methodRoles[4]!;
const endRole = methodRoles[5]!;
assert(new Set(methodRoles).size === methodRoles.length, "H2e structural roles are distinct");

const methodRoleDictionary = defineStructuralRoleDictionary(memory, methodRoles);
const methodTemplate = memory.ensure(
  interpreterRole,
  memory.ensure(fromRole, toRole),
);
const startEquationTemplate = memory.ensure(startRole, wholeRole);
const endEquationTemplate = memory.ensure(wholeRole, endRole);
const relativeRolesTemplate = memory.ensure(
  memory.ensure(fromRole, startRole),
  memory.ensure(toRole, endRole),
);
const methodPoleTemplate = memory.ensure(
  methodTemplate,
  memory.ensure(
    startEquationTemplate,
    memory.ensure(endEquationTemplate, relativeRolesTemplate),
  ),
);
const methodPoleRule = defineStructuralRule(memory, methodRoleDictionary, methodPoleTemplate);
const methodPoleAdmission = admitStructuralRule(
  memory,
  methodInterpreterStructure.theory,
  methodPoleRule,
);
const directContext = defineContext(memory, colonMeaning, dotMeaning);
const inverseContext = defineContext(memory, dotMeaning, colonMeaning);
const equalContext = defineContext(memory, equalRawPoleWhole, generic);
const hostOrderContext = defineContext(memory, generic, equalRawPoleWhole);
assert(new Set([directContext, inverseContext, equalContext, hostOrderContext]).size === 4,
  "H2e applications need distinct structural contexts");

const directBindings: readonly MethodPoleBinding[] = Object.freeze([
  [wholeRole, R],
  [interpreterRole, interpreter],
  [fromRole, firstSelfCell],
  [toRole, secondSelfCell],
  [startRole, O],
  [endRole, C],
]);
const inverseBindings: readonly MethodPoleBinding[] = Object.freeze([
  [wholeRole, R],
  [interpreterRole, interpreter],
  [fromRole, secondSelfCell],
  [toRole, firstSelfCell],
  [startRole, O],
  [endRole, C],
]);
const directAct = materializeMethodPoleAct(
  memory,
  interpreter,
  methodRoleDictionary,
  directContext,
  directBindings,
);
const inverseAct = materializeMethodPoleAct(
  memory,
  interpreter,
  methodRoleDictionary,
  inverseContext,
  inverseBindings,
);
const hostOrderAct = materializeMethodPoleAct(
  memory,
  interpreter,
  methodRoleDictionary,
  hostOrderContext,
  directBindings,
  true,
);
const directPoleClaim = materializeMethodPoleClaim(
  memory,
  directMethod,
  firstSelfCell,
  secondSelfCell,
  O,
  C,
);
const inversePoleClaim = materializeMethodPoleClaim(
  memory,
  inverseMethod,
  secondSelfCell,
  firstSelfCell,
  O,
  C,
);

// Non-root genericity includes a whole with equal raw endpoint values.
const equalSelfSequence = materializeExactSequence(
  memory,
  [equalRawPoleWhole, equalRawPoleWhole],
);
const equalSelf = readExactSequence(memory, equalSelfSequence);
same(equalSelf.cells.length, 2, "non-root H2e witness has two occurrences");
const equalFirstCell = equalSelf.cells[0]!;
const equalSecondCell = equalSelf.cells[1]!;
const equalTraversal = memory.ensure(equalFirstCell, equalSecondCell);
const equalMethod = memory.ensure(interpreter, equalTraversal);
const equalBindings: readonly MethodPoleBinding[] = Object.freeze([
  [wholeRole, equalRawPoleWhole],
  [interpreterRole, interpreter],
  [fromRole, equalFirstCell],
  [toRole, equalSecondCell],
  [startRole, equalRawPoleWitness.start],
  [endRole, equalRawPoleWitness.end],
]);
const equalAct = materializeMethodPoleAct(
  memory,
  interpreter,
  methodRoleDictionary,
  equalContext,
  equalBindings,
);
const equalPoleClaim = materializeMethodPoleClaim(
  memory,
  equalMethod,
  equalFirstCell,
  equalSecondCell,
  equalRawPoleWitness.start,
  equalRawPoleWitness.end,
);

// Negative bodies are materialized before read-only replay.
const wrongTraversal = memory.ensure(firstSelfCell, firstSelfCell);
const wrongMethod = memory.ensure(interpreter, wrongTraversal);
const wrongTraversalClaim = materializeMethodPoleClaim(
  memory,
  wrongMethod,
  firstSelfCell,
  secondSelfCell,
  O,
  C,
);
const forgedInverseClaim = materializeMethodPoleClaim(
  memory,
  directMethod,
  secondSelfCell,
  firstSelfCell,
  O,
  C,
);
const missingMethodClaim = memory.ensure(
  R,
  memory.ensure(
    O,
    memory.ensure(
      C,
      memory.ensure(
        memory.ensure(firstSelfCell, O),
        memory.ensure(secondSelfCell, C),
      ),
    ),
  ),
);
const forgedStartClaim = materializeMethodPoleClaim(
  memory,
  directMethod,
  firstSelfCell,
  secondSelfCell,
  L,
  C,
);

const beforeRead = memory.linkCount;
const directReplay = replayStructuralRule(memory, {
  act: directAct,
  rule: methodPoleRule,
  ruleAdmission: methodPoleAdmission,
  claimedBody: directPoleClaim,
  expectedInterpreter: methodInterpreterStructure,
  expectedAfterContext: directContext,
});
same(directReplay.claimedBody, directPoleClaim, "H2e direct method derives relative pole claim");
same(memory.linkCount, beforeRead, "H2e direct replay is read-only");
const inverseReplay = replayStructuralRule(memory, {
  act: inverseAct,
  rule: methodPoleRule,
  ruleAdmission: methodPoleAdmission,
  claimedBody: inversePoleClaim,
  expectedInterpreter: methodInterpreterStructure,
  expectedAfterContext: inverseContext,
});
same(inverseReplay.claimedBody, inversePoleClaim, "H2e inverse method derives covariant swapped claim");
same(memory.linkCount, beforeRead, "H2e inverse replay is read-only");
const equalReplay = replayStructuralRule(memory, {
  act: equalAct,
  rule: methodPoleRule,
  ruleAdmission: methodPoleAdmission,
  claimedBody: equalPoleClaim,
  expectedInterpreter: methodInterpreterStructure,
  expectedAfterContext: equalContext,
});
same(equalReplay.claimedBody, equalPoleClaim, "H2e works when raw endpoint values are equal");
same(memory.linkCount, beforeRead, "H2e non-root replay is read-only");
const hostOrderReplay = replayStructuralRule(memory, {
  act: hostOrderAct,
  rule: methodPoleRule,
  ruleAdmission: methodPoleAdmission,
  claimedBody: directPoleClaim,
  expectedInterpreter: methodInterpreterStructure,
  expectedAfterContext: hostOrderContext,
});
same(hostOrderReplay.claimedBody, directPoleClaim, "host field insertion order has no pole authority");
same(memory.linkCount, beforeRead, "H2e host-order replay is read-only");

expectStructuralRuleError("template-mismatch", () => replayStructuralRule(memory, {
  act: directAct,
  rule: methodPoleRule,
  ruleAdmission: methodPoleAdmission,
  claimedBody: wrongTraversalClaim,
  expectedInterpreter: methodInterpreterStructure,
  expectedAfterContext: directContext,
}));
expectStructuralRuleError("template-mismatch", () => replayStructuralRule(memory, {
  act: inverseAct,
  rule: methodPoleRule,
  ruleAdmission: methodPoleAdmission,
  claimedBody: forgedInverseClaim,
  expectedInterpreter: methodInterpreterStructure,
  expectedAfterContext: inverseContext,
}));
expectStructuralRuleError("template-mismatch", () => replayStructuralRule(memory, {
  act: directAct,
  rule: methodPoleRule,
  ruleAdmission: methodPoleAdmission,
  claimedBody: missingMethodClaim,
  expectedInterpreter: methodInterpreterStructure,
  expectedAfterContext: directContext,
}));
expectStructuralRuleError("template-mismatch", () => replayStructuralRule(memory, {
  act: directAct,
  rule: methodPoleRule,
  ruleAdmission: methodPoleAdmission,
  claimedBody: forgedStartClaim,
  expectedInterpreter: methodInterpreterStructure,
  expectedAfterContext: directContext,
}));
same(memory.linkCount, beforeRead, "H2e negative replay corpus is read-only");

const probe = new ReadProbe(memory);
for (const [label, witness] of witnesses) {
  verifyDefinition(probe, witness, label);
}
verifyDefinition(probe, equalRawPoleWitness, "Pair(L,L)");

const exactRootSelf = readExactSequence(probe, rootSelfSequence);
same(exactRootSelf.values.length, 2, "ЯЯ has two exact positions");
same(exactRootSelf.values[0], R, "first Я resolves to root whole");
same(exactRootSelf.values[1], R, "second Я resolves to root whole");
same(exactRootSelf.cells[0], firstSelfCell, "read-only first Я occurrence identity preserved");
same(exactRootSelf.cells[1], secondSelfCell, "read-only second Я occurrence identity preserved");

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

// H2d structural directness is explicit and wholly inside the aset.
same(exactCellPredecessor(probe, firstSelfCell), R, "directness first boundary remains structural");
same(exactCellPredecessor(probe, secondSelfCell), firstSelfCell, "directness second boundary remains structural");
same(probe.poles(directTraversal).start, firstSelfCell, "direct traversal begins at first occurrence");
same(probe.poles(directTraversal).end, secondSelfCell, "direct traversal ends at next occurrence");
same(probe.poles(inverseTraversal).start, secondSelfCell, "inverse traversal begins at second occurrence");
same(probe.poles(inverseTraversal).end, firstSelfCell, "inverse traversal ends at first occurrence");
same(probe.poles(directMethod).start, interpreter, "direct method contains interpreter Link");
same(probe.poles(directMethod).end, directTraversal, "direct method contains direct traversal Link");
same(probe.poles(inverseMethod).start, interpreter, "inverse method keeps the same interpreter Link");
same(probe.poles(inverseMethod).end, inverseTraversal, "inverse method changes only traversal Link");

same(probe.poles(L).start, O, "root direct orientation L begins at START(R)=O");
same(probe.poles(L).end, C, "root direct orientation L ends at END(R)=C");
same(probe.poles(U).start, C, "root inverse orientation U begins at END(R)=C");
same(probe.poles(U).end, O, "root inverse orientation U ends at START(R)=O");
assert(L !== U, "root direct and inverse orientations remain distinct");

// H2e: one admitted generic rule derives covariance relative to selected method.
const H1_GENERIC_UNIFIED_DEFINITION_SUPPORTED = true;
const ROOT_DEICTIC_SELF_FIXED_POINT_SUPPORTED = true;
const H2_ROLE_EXPLICIT_SEQUENTIAL_FACTORIZATION_SUPPORTED = true;
const ORDER_ONLY_POLE_DERIVATION_SUPPORTED = false;
const H2D_STRUCTURAL_POLE_ROLE_ASYMMETRY_SUPPORTED = true;
const H2D_INTERPRETER_IS_LINK_SUPPORTED = true;
const H2D_STRUCTURAL_DIRECT_METHOD_CARRIER_SUPPORTED = true;
const H2D_METHOD_TO_POLE_ROLE_DERIVATION_ESTABLISHED = true;
const H2E_DERIVED_METHOD_TO_RELATIVE_POLES_SUPPORTED = true;
const BARE_SELF_FOLD_EQUALS_UNIFIED_DEFINITION = false;
const H3_LITERAL_DOT_DOT_REINTERPRETATION_REQUIRED = false;

assert(H1_GENERIC_UNIFIED_DEFINITION_SUPPORTED, "H1 classification");
assert(ROOT_DEICTIC_SELF_FIXED_POINT_SUPPORTED, "root ЯЯ=Я classification");
assert(H2_ROLE_EXPLICIT_SEQUENTIAL_FACTORIZATION_SUPPORTED, "role-explicit H2 factorization");
assert(!ORDER_ONLY_POLE_DERIVATION_SUPPORTED, "equal paths with opposite poles falsify order-only orientation");
assert(H2D_STRUCTURAL_POLE_ROLE_ASYMMETRY_SUPPORTED, "ordered START/END role asymmetry classification");
assert(H2D_INTERPRETER_IS_LINK_SUPPORTED, "interpreter is represented inside the aset as a Link");
assert(H2D_STRUCTURAL_DIRECT_METHOD_CARRIER_SUPPORTED, "direct/inverse methods are explicit Links");
assert(H2D_METHOD_TO_POLE_ROLE_DERIVATION_ESTABLISHED, "generic admitted rule derives method-relative pole roles");
assert(H2E_DERIVED_METHOD_TO_RELATIVE_POLES_SUPPORTED, "H2e exit A: derived method-to-relative-poles");
assert(!BARE_SELF_FOLD_EQUALS_UNIFIED_DEFINITION, "bare ЯЯ must remain distinct from Def(A)");
assert(!H3_LITERAL_DOT_DOT_REINTERPRETATION_REQUIRED, "accepted literal `..` must remain unchanged");

same(memory.linkCount, beforeRead, "research verification is read-only");
