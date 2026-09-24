import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext } from "../src/state.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error(`v0.13 A68a uniform active rewrite: ${m}`);
}

function same<T>(actual: T, expected: T, m: string): void {
  assert(Object.is(actual, expected), `${m}: values differ`);
}

function sameSet(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  m: string,
): void {
  same(new Set(actual).size, new Set(expected).size, `${m}: cardinality`);
  for (const value of expected) {
    assert(actual.includes(value), `${m}: missing expected value`);
  }
}

function expectThrows(fn: () => void, m: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, m);
}

/**
 * Candidate single machine instruction.
 *
 *   active(K -> A)
 *   selected(A -> B_i)
 *   ------------------
 *   next(K -> B_i)
 *
 * The selected continuation carrier is validated completely before any output
 * materialization. The rewrite itself has no ROOT/START/END/PAIR dispatch and
 * no deletion primitive. Canonical Link identity is allowed to collapse the
 * result automatically when K -> B_i is already a fixed point.
 */
function rewriteSelectedOne(
  memory: Memory,
  activeTruth: LinkHandle,
  selectedContinuationCarrier: LinkHandle,
): readonly LinkHandle[] {
  const active = memory.poles(activeTruth);
  const context = active.start;
  const antecedent = active.end;

  const selected = readExactSequence(memory, selectedContinuationCarrier).values;
  const targets = selected.map((continuation) => {
    const c = memory.poles(continuation);
    same(c.start, antecedent, "selected continuation starts at active antecedent");
    return c.end;
  });

  return Object.freeze(
    targets.map((target) => memory.ensure(context, target)),
  );
}

function carrier(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  return materializeExactSequence(memory, values);
}

function exercise(noise: boolean): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  if (noise) {
    memory.ensure(memory.ensure(b.U, b.C), memory.ensure(b.O, b.L));
  }

  const current = memory.ensure(b.O, b.C);
  const k = defineContext(memory, memory.root, current);
  const a = memory.ensure(b.L, b.U);
  const b1 = memory.ensure(b.O, b.L);
  const b2 = memory.ensure(b.C, b.U);
  const ambient = memory.ensure(b1, b2);

  const active = memory.ensure(k, a);
  const toB1 = memory.ensure(a, b1);
  const toB2 = memory.ensure(a, b2);
  const ambientContinuation = memory.ensure(a, ambient);

  // ZERO: the selected next frontier is empty. This is semantic removal from
  // the active frontier, but it is not yet positive evidence of completion.
  const zero = rewriteSelectedOne(memory, active, carrier(memory, []));
  same(zero.length, 0, "ZERO selected continuations produce empty next frontier");
  same(memory.poles(active).start, k, "ZERO leaves physical active history readable");
  same(memory.poles(active).end, a, "ZERO preserves historical active value");

  // ONE: ordinary transformation. The old truth remains physical but is not in
  // the next frontier unless a selected continuation derives it again.
  const one = rewriteSelectedOne(memory, active, carrier(memory, [toB1]));
  const kb1 = memory.ensure(k, b1);
  sameSet(one, [kb1], "ONE exact transformed frontier");
  assert(!one.includes(active), "ordinary ONE excludes stale parent from next frontier");
  assert(memory.find(k, ambient) === undefined,
    "omitted ambient continuation is inert even when physically present");
  same(memory.poles(ambientContinuation).start, a,
    "ambient continuation remains physically readable");

  // MANY: one active state splits extensionally into multiple next states.
  const many = rewriteSelectedOne(
    memory,
    active,
    carrier(memory, [toB1, toB2]),
  );
  const kb2 = memory.ensure(k, b2);
  sameSet(many, [kb1, kb2], "MANY exact split frontier");
  assert(!many.includes(active), "MANY excludes stale parent unless re-derived");

  // Scheduling/order of the selected continuation carrier is semantically
  // irrelevant to the extensional next frontier.
  const reverseMany = rewriteSelectedOne(
    memory,
    active,
    carrier(memory, [toB2, toB1]),
  );
  sameSet(reverseMany, many, "selected continuation order preserves frontier set");

  // Identity recurrence is not "stale activity": if A -> A is explicitly
  // selected, the same K -> A identity is legitimately derived again.
  const loop = memory.ensure(a, a);
  const identity = rewriteSelectedOne(memory, active, carrier(memory, [loop]));
  sameSet(identity, [active], "selected identity continuation re-derives old active identity");

  // END fixed point: the generic rewrite knows nothing about END. The ordinary
  // memory.ensure(K,target) operation canonically collapses to END(K).
  const endK = memory.ensureEndSelfClosed(k);
  const toEnd = memory.ensure(a, endK);
  const terminal = rewriteSelectedOne(memory, active, carrier(memory, [toEnd]));
  sameSet(terminal, [endK], "generic rewrite canonically reduces to END(K)");
  same(memory.ensure(k, endK), endK, "END fixed point remains canonical");

  // Ordinary survivor and terminal reduction may coexist. END(K) is therefore
  // branch/value-local residue, not proof that all K activity is globally done.
  const mixed = rewriteSelectedOne(
    memory,
    active,
    carrier(memory, [toB1, toEnd]),
  );
  sameSet(mixed, [kb1, endK], "ordinary survivor and END reduction coexist");

  // START-side chiral mirror: again the rewrite has no START branch.
  const x = memory.ensure(b.C, b.L);
  const startX = memory.ensureStartSelfClosed(x);
  const startAntecedent = memory.ensure(b.U, b.L);
  const startActive = memory.ensure(startX, startAntecedent);
  const backToX = memory.ensure(startAntecedent, x);
  const startReduced = rewriteSelectedOne(
    memory,
    startActive,
    carrier(memory, [backToX]),
  );
  sameSet(startReduced, [startX], "generic rewrite canonically reduces to START(X)");
  same(memory.ensure(startX, x), startX, "START fixed point remains canonical");

  // Fail closed before the first output write if any selected continuation is
  // malformed. The carrier itself and continuations may exist physically; no
  // partially materialized next state is allowed.
  const badCurrent = memory.ensure(b.U, b.O);
  const badK = defineContext(memory, k, badCurrent);
  const badA = memory.ensure(b.L, b.C);
  const badB1 = memory.ensure(b.O, b.U);
  const badB2 = memory.ensure(b.C, b.O);
  const foreignA = memory.ensure(b.U, b.C);
  const goodSelected = memory.ensure(badA, badB1);
  const malformedSelected = memory.ensure(foreignA, badB2);
  const malformedCarrier = carrier(memory, [goodSelected, malformedSelected]);

  assert(memory.find(badK, badB1) === undefined,
    "malformed fixture first output absent before rewrite");
  assert(memory.find(badK, badB2) === undefined,
    "malformed fixture second output absent before rewrite");
  const beforeMalformed = memory.linkCount;
  expectThrows(
    () => rewriteSelectedOne(memory, memory.ensure(badK, badA), malformedCarrier),
    "foreign selected continuation must fail",
  );
  assert(memory.find(badK, badB1) === undefined,
    "malformed selection leaves no partial first output");
  assert(memory.find(badK, badB2) === undefined,
    "malformed selection leaves no partial second output");
  same(memory.linkCount, beforeMalformed + 1,
    "only explicit activeTruth fixture materializes during failing call setup");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-uniform-active-rewrite-a68a.test.ts"),
    "utf8",
  );
  const begin = own.indexOf("function rewriteSelectedOne(");
  const end = own.indexOf("\nfunction carrier(", begin);
  assert(begin >= 0 && end > begin, "rewriteSelectedOne source slice");
  const core = own.slice(begin, end);

  for (const forbidden of [
    "switch",
    "ensureStartSelfClosed",
    "ensureEndSelfClosed",
    "decomposeV013SemanticLink",
    ".delete(",
    ".remove(",
    "deleteLink",
    "removeLink",
    "\"ROOT\"",
    "\"START\"",
    "\"END\"",
    "\"PAIR\"",
  ]) {
    assert(!core.includes(forbidden), `uniform rewrite core excludes ${forbidden}`);
  }

  assert(
    core.includes("same(c.start, antecedent"),
    "selected continuation authority is checked before materialization",
  );
  assert(
    core.includes("memory.ensure(context, target)"),
    "single generic pair materialization is the rewrite output primitive",
  );
}

function main(): void {
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A68a: UNIFORM_ACTIVE_REWRITE=GREEN_SCOPED_RESEARCH",
    "PRIMITIVE=ACTIVE_K_A_PLUS_SELECTED_A_B_TO_NEXT_K_B",
    "SEMANTIC_CASE_DISPATCH=0",
    "PHYSICAL_DELETE=0",
    "ZERO=EMPTY_NEXT_FRONTIER_NO_POSITIVE_TERMINAL_WITNESS",
    "ONE=TRANSFORMATION",
    "MANY=SPLIT",
    "OLD_LINKS=PHYSICALLY_READABLE_ACTIVE_ONLY_IF_REDERIVED",
    "IDENTITY_CONTINUATION=OLD_ACTIVE_IDENTITY_LEGITIMATELY_REDERIVED",
    "OMITTED_AMBIENT_CONTINUATION=INERT",
    "END_REDUCTION=CANONICAL_WITHOUT_END_BRANCH",
    "START_REDUCTION=CANONICAL_WITHOUT_START_BRANCH",
    "MIXED_END_AND_SURVIVOR=COEXIST",
    "MALFORMED_SELECTED_CARRIER=FAILS_BEFORE_OUTPUT_WRITE",
    "SELECTED_ORDER=EXTENSIONALLY_INERT",
    "HOST_SELECTED_CARRIER_TRAVERSAL=RESIDUAL",
    "ACTIVE_FRONTIER_CARRIER=NEXT_BOUNDARY_A68B",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
