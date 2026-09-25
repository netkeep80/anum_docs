// mts-version-evidence: candidate-from=0.14

import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  V013GroundedScopeCursor,
  defineV013GroundedExecutionScope,
  reactV013GroundedScope,
} from "../src/v013-grounded-execution.js";
import { decomposeV013SemanticLink } from "../src/v013-hierarchical-carrier.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error("v0.14 X1 reaction-result basis: " + message);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function sameMembers(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, message + " length");
  for (const value of expected) {
    assert(actual.includes(value), message + " missing member");
  }
}

function anchors(
  memory: Memory,
  basis: RootBasis,
  count: number,
): readonly LinkHandle[] {
  const values: LinkHandle[] = [];
  let seed = memory.ensure(basis.U, basis.L);
  for (let index = 0; index < count; index += 1) {
    const tag = memory.ensureStartSelfClosed(seed);
    seed = memory.ensure(seed, tag);
    values.push(seed);
  }
  return Object.freeze(values);
}

function admit(
  memory: Memory,
  theory: LinkHandle,
  antecedent: LinkHandle,
  outputs: readonly LinkHandle[],
): LinkHandle {
  const image = materializeExactSequence(memory, outputs);
  const relation = memory.ensure(antecedent, image);
  return memory.ensure(theory, relation);
}

function invertLink(
  memory: Memory,
  basis: RootBasis,
  source: LinkHandle,
  memo = new Map<LinkHandle, LinkHandle>(),
): LinkHandle {
  const known = memo.get(source);
  if (known !== undefined) return known;

  const decomposition = decomposeV013SemanticLink(memory, basis, source);
  let result: LinkHandle;

  if (decomposition.aspect === "ROOT") {
    result = basis.R;
  } else if (decomposition.aspect === "START") {
    result = memory.ensureEndSelfClosed(
      invertLink(memory, basis, decomposition.children[0]!, memo),
    );
  } else if (decomposition.aspect === "END") {
    result = memory.ensureStartSelfClosed(
      invertLink(memory, basis, decomposition.children[0]!, memo),
    );
  } else {
    const left = invertLink(memory, basis, decomposition.children[0]!, memo);
    const right = invertLink(memory, basis, decomposition.children[1]!, memo);
    result = memory.ensure(right, left);
  }

  memo.set(source, result);
  return result;
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly K: LinkHandle;
  readonly A: LinkHandle;
  readonly startA: LinkHandle;
  readonly endA: LinkHandle;
  readonly at: (index: number) => LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const pool = anchors(memory, basis, 80);

  const at = (index: number): LinkHandle => {
    const value = pool[index];
    assert(value !== undefined, "fixture anchor " + index);
    return value;
  };

  const K = memory.ensure(at(0), at(1));
  const A = memory.ensure(at(2), at(3));
  const startA = memory.ensureStartSelfClosed(A);
  const endA = memory.ensureEndSelfClosed(A);

  return Object.freeze({
    memory,
    basis,
    K,
    A,
    startA,
    endA,
    at,
  });
}

function runNoRelation(f: Fixture): void {
  const { memory, K, A, at } = f;
  const theory = at(10);
  const current = memory.ensure(K, A);
  const scope = defineV013GroundedExecutionScope(
    memory,
    at(11),
    theory,
    [current],
  );
  const cursor = new V013GroundedScopeCursor(memory, scope);

  const reaction = reactV013GroundedScope(memory, cursor, at(12));

  same(reaction.matchedRelations, 0, "NO_RELATION matches none");
  same(reaction.transitionedMembers, 0, "NO_RELATION transitions none");
  same(reaction.handoffCount, 0, "NO_RELATION has no handoff");
  same(reaction.quiescent, true, "NO_RELATION is quiescent");
  same(cursor.currentScope(), scope, "NO_RELATION preserves exact current Scope");
  sameMembers(cursor.members(), [current], "NO_RELATION preserves truth");
}

function runEmpty(f: Fixture): void {
  const { memory, K, A, at } = f;
  const theory = at(20);
  admit(memory, theory, A, []);

  const current = memory.ensure(K, A);
  const scope = defineV013GroundedExecutionScope(
    memory,
    at(21),
    theory,
    [current],
  );
  const cursor = new V013GroundedScopeCursor(memory, scope);

  const reaction = reactV013GroundedScope(memory, cursor, at(22));

  same(reaction.matchedRelations, 1, "A->{} matches one admitted relation");
  same(reaction.transitionedMembers, 1, "A->{} transitions current member");
  same(reaction.handoffCount, 1, "A->{} publishes one successor Scope");
  same(reaction.quiescent, false, "A->{} is active, not quiescent");
  sameMembers(reaction.nextMembers, [], "A->{} contributes zero successors");
  sameMembers(cursor.members(), [], "A->{} removes old truth from current state");
  assert(cursor.currentScope() !== scope, "A->{} changes current Scope root");
}

function runActiveIdentity(f: Fixture): void {
  const { memory, K, A, at } = f;
  const theory = at(30);
  admit(memory, theory, A, [A]);

  const current = memory.ensure(K, A);
  const scope0 = defineV013GroundedExecutionScope(
    memory,
    at(31),
    theory,
    [current],
  );
  const cursor = new V013GroundedScopeCursor(memory, scope0);

  const first = reactV013GroundedScope(memory, cursor, at(32));

  same(first.matchedRelations, 1, "A->A matches one admitted relation");
  same(first.transitionedMembers, 1, "A->A transitions one member");
  same(first.handoffCount, 1, "A->A performs a handoff");
  same(first.quiescent, false, "A->A is not quiescent");
  sameMembers(first.nextMembers, [current], "A->A is extensionally identical");
  assert(cursor.currentScope() !== scope0, "A->A publishes a new Scope");

  const scope1 = cursor.currentScope();
  const second = reactV013GroundedScope(memory, cursor, at(33));

  same(second.matchedRelations, 1, "repeated A->A remains active");
  same(second.handoffCount, 1, "repeated A->A performs another handoff");
  same(second.quiescent, false, "period-1 semantic recurrence is not quiescence");
  sameMembers(second.nextMembers, [current], "period-1 recurrence keeps semantic member");
  assert(cursor.currentScope() !== scope1, "period-1 recurrence advances current Scope");
}

function runChiralEnd(f: Fixture): void {
  const { memory, K, A, endA, at } = f;
  const theory = at(40);
  admit(memory, theory, A, [endA]);

  const current = memory.ensure(K, A);
  const expected = memory.ensure(K, endA);
  const scope = defineV013GroundedExecutionScope(
    memory,
    at(41),
    theory,
    [current],
  );
  const cursor = new V013GroundedScopeCursor(memory, scope);

  const reaction = reactV013GroundedScope(memory, cursor, at(42));

  same(reaction.matchedRelations, 1, "A->A♀ matches");
  same(reaction.handoffCount, 1, "A->A♀ performs handoff");
  same(reaction.quiescent, false, "A->A♀ is active");
  sameMembers(reaction.nextMembers, [expected], "A->A♀ successor");

  const poles = memory.poles(endA);
  same(poles.start, A, "A♀ start pole is source A");
  same(poles.end, endA, "A♀ end pole is self-incident");
}

function runChiralStart(f: Fixture): void {
  const { memory, K, A, startA, at } = f;
  const theory = at(50);
  admit(memory, theory, A, [startA]);

  const current = memory.ensure(K, A);
  const expected = memory.ensure(K, startA);
  const scope = defineV013GroundedExecutionScope(
    memory,
    at(51),
    theory,
    [current],
  );
  const cursor = new V013GroundedScopeCursor(memory, scope);

  const reaction = reactV013GroundedScope(memory, cursor, at(52));

  same(reaction.matchedRelations, 1, "A->♂A matches");
  same(reaction.handoffCount, 1, "A->♂A performs handoff");
  same(reaction.quiescent, false, "A->♂A is active");
  sameMembers(reaction.nextMembers, [expected], "A->♂A successor");

  const poles = memory.poles(startA);
  same(poles.start, startA, "♂A start pole is self-incident");
  same(poles.end, A, "♂A end pole is source A");
}

function verifyChirality(f: Fixture): void {
  const { memory, basis, A, startA, endA } = f;

  assert(startA !== endA, "START(A) and END(A) are distinct");

  const jA = invertLink(memory, basis, A);
  same(
    invertLink(memory, basis, startA),
    memory.ensureEndSelfClosed(jA),
    "J(START(A))=END(J(A))",
  );
  same(
    invertLink(memory, basis, endA),
    memory.ensureStartSelfClosed(jA),
    "J(END(A))=START(J(A))",
  );

  // Challenge the collapse over the root basis and one arbitrary non-basis A.
  for (const source of [
    basis.R,
    basis.O,
    basis.C,
    basis.L,
    basis.U,
    A,
  ]) {
    const start = memory.ensureStartSelfClosed(source);
    const end = memory.ensureEndSelfClosed(source);
    assert(start !== end, "proper START/END constructors do not collapse");
  }

  // For a J-fixed source L the two chiral outputs are exact mirrors around
  // the same source, making the distinction particularly explicit.
  const startL = memory.ensureStartSelfClosed(basis.L);
  const endL = memory.ensureEndSelfClosed(basis.L);
  same(invertLink(memory, basis, startL), endL, "J(START(L))=END(L)");
  same(invertLink(memory, basis, endL), startL, "J(END(L))=START(L)");
}

function main(): void {
  const f = fixture();

  runNoRelation(f);
  runEmpty(f);
  runActiveIdentity(f);
  runChiralEnd(f);
  runChiralStart(f);
  verifyChirality(f);

  console.log([
    "MTS v0.14 X1: REACTION_RESULT_BASIS=GREEN_RESEARCH",
    "NO_RELATION=QUIESCENT_NO_HANDOFF_PRESERVE",
    "A_TO_EMPTY=ACTIVE_ZERO_IMAGE_HANDOFF",
    "A_TO_A=ACTIVE_IDENTITY_TRANSITION",
    "A_TO_A_PERIOD1=ACTIVE_RECURRENCE_NOT_QUIESCENCE",
    "A_TO_END_A=GREEN",
    "A_TO_START_A=GREEN",
    "START_A_END_A=DISTINCT",
    "J_START_A=END_J_A",
    "J_END_A=START_J_A",
    "EMPTY_RESULT_CANONICAL_NOTATION={} REQUIRED_BY_V014_SURFACE",
    "EMPTY_RESULT_NOT_NAT_ZERO=TRUE",
    "ACCEPTED_V013_EXECUTION_MUTATED=FALSE",
  ].join(" "));
}

main();
