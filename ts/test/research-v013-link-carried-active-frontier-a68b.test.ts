import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext } from "../src/state.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error(`v0.13 A68b link-carried active frontier: ${m}`);
}

function same<T>(actual: T, expected: T, m: string): void {
  assert(Object.is(actual, expected), `${m}: values differ`);
}

function sameValues(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  m: string,
): void {
  same(actual.length, expected.length, `${m}: length`);
  for (let i = 0; i < expected.length; i += 1) {
    same(actual[i], expected[i], `${m}: value[${i}]`);
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

function carrier(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  return materializeExactSequence(memory, values);
}

/**
 * A selected work item binds one exact active truth to one exact selected
 * continuation carrier:
 *
 *   Work = activeTruth -> selectedContinuationCarrier
 *
 * The Work link must remain an ordinary PAIR. START/END aliasing would erase
 * one of the two protocol roles and is rejected by the reader below.
 */
function defineWork(
  memory: Memory,
  activeTruth: LinkHandle,
  selectedContinuationCarrier: LinkHandle,
): LinkHandle {
  const work = memory.ensure(activeTruth, selectedContinuationCarrier);
  assert(work !== activeTruth && work !== selectedContinuationCarrier,
    "work item must be an ordinary pair");
  return work;
}

interface PlannedRewrite {
  readonly context: LinkHandle;
  readonly targets: readonly LinkHandle[];
}

/**
 * Read and validate the complete selected frontier before any output write.
 *
 * Activity and continuation authority come only from the selected work carrier.
 * No ambient adjacency/membership query is used.
 */
function planWorkFrontier(
  memory: Memory,
  selectedWorkFrontier: LinkHandle,
): readonly PlannedRewrite[] {
  const works = readExactSequence(memory, selectedWorkFrontier).values;

  return Object.freeze(works.map((work) => {
    const wp = memory.poles(work);
    assert(wp.start !== work && wp.end !== work,
      "selected work must be an ordinary pair");

    const activeTruth = wp.start;
    const selectedContinuationCarrier = wp.end;

    const active = memory.poles(activeTruth);
    assert(active.start !== activeTruth && active.end !== activeTruth,
      "selected active truth must be an ordinary contextual pair");

    const antecedent = active.end;
    const selected =
      readExactSequence(memory, selectedContinuationCarrier).values;

    const targets = selected.map((continuation) => {
      const c = memory.poles(continuation);
      same(c.start, antecedent,
        "selected continuation starts at exact active antecedent");
      return c.end;
    });

    return Object.freeze({
      context: active.start,
      targets: Object.freeze(targets),
    });
  }));
}

interface FrontierStep {
  readonly transition: LinkHandle;
  readonly nextFrontier: LinkHandle;
}

/**
 * Persistent active-frontier replacement.
 *
 * Every output is still the same A68a primitive:
 *
 *   K -> B_i
 *
 * but the active input set, selected continuation authority and output set are
 * all Link-carried. The old physical Links remain immutable history.
 */
function executeFrontierStep(
  memory: Memory,
  selectedWorkFrontier: LinkHandle,
): FrontierStep {
  const plan = planWorkFrontier(memory, selectedWorkFrontier);

  const outputs: LinkHandle[] = [];
  for (const item of plan) {
    for (const target of item.targets) {
      outputs.push(memory.ensure(item.context, target));
    }
  }

  const nextFrontier = carrier(memory, outputs);
  const transition = memory.ensure(selectedWorkFrontier, nextFrontier);
  return Object.freeze({ transition, nextFrontier });
}

function exercise(noise: boolean): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  if (noise) {
    memory.ensure(memory.ensure(b.C, b.L), memory.ensure(b.U, b.O));
  }

  const k1 = defineContext(memory, memory.root, memory.ensure(b.O, b.C));
  const a1 = memory.ensure(b.L, b.U);
  const b1 = memory.ensure(b.O, b.L);
  const ambientB = memory.ensure(b.C, b.U);
  const active1 = memory.ensure(k1, a1);
  const toB1 = memory.ensure(a1, b1);
  const ambientContinuation = memory.ensure(a1, ambientB);

  const k2 = defineContext(memory, k1, memory.ensure(b.U, b.C));
  const a2 = memory.ensure(b.L, b.C);
  const active2 = memory.ensure(k2, a2);

  const staleK = defineContext(memory, k1, memory.ensure(b.C, b.O));
  const staleA = memory.ensure(b.U, b.L);
  const staleB = memory.ensure(b.C, b.L);
  const staleActive = memory.ensure(staleK, staleA);
  const staleContinuation = memory.ensure(staleA, staleB);

  const selected1 = carrier(memory, [toB1]);
  const selectedZero = carrier(memory, []);
  same(selectedZero, memory.root, "empty ExactSequence carrier is R");

  const work1 = defineWork(memory, active1, selected1);
  const work2Zero = defineWork(memory, active2, selectedZero);

  // Positive scoped ZERO: unlike a bare host empty list, Work2 explicitly
  // binds this exact active truth to the canonical empty ExactSequence R.
  const zeroInput = carrier(memory, [work2Zero]);
  const zeroStep = executeFrontierStep(memory, zeroInput);
  same(zeroStep.nextFrontier, memory.root,
    "scoped ZERO produces canonical empty next frontier");
  assert(zeroStep.transition !== memory.root,
    "scoped ZERO leaves positive non-root transition evidence");
  const zeroTransition = memory.poles(zeroStep.transition);
  same(zeroTransition.start, zeroInput, "ZERO transition binds exact input frontier");
  same(zeroTransition.end, memory.root, "ZERO transition binds exact empty output");
  const zeroWork = memory.poles(work2Zero);
  same(zeroWork.start, active2, "ZERO work binds exact active truth");
  same(zeroWork.end, memory.root, "ZERO work binds exact empty authority");

  // Mixed active frontier: one branch transforms, one branch disappears.
  // A physically present stale third branch is not selected and cannot fire.
  const selectedFrontier = carrier(memory, [work1, work2Zero]);
  assert(memory.find(k1, b1) === undefined,
    "selected ONE output absent before frontier step");
  assert(memory.find(k1, ambientB) === undefined,
    "ambient unselected output absent before frontier step");
  assert(memory.find(staleK, staleB) === undefined,
    "stale unselected output absent before frontier step");

  const step = executeFrontierStep(memory, selectedFrontier);
  const kb1 = memory.ensure(k1, b1);
  sameValues(
    readExactSequence(memory, step.nextFrontier).values,
    [kb1],
    "next active frontier contains only selected derived ordinary state",
  );

  const tp = memory.poles(step.transition);
  same(tp.start, selectedFrontier, "transition START is selected work frontier");
  same(tp.end, step.nextFrontier, "transition END is exact next frontier");

  assert(memory.find(k1, ambientB) === undefined,
    "ambient continuation cannot grant next activity");
  assert(memory.find(staleK, staleB) === undefined,
    "stale physical active truth cannot fire outside selected frontier");
  same(memory.poles(ambientContinuation).start, a1,
    "ambient continuation remains physically readable");
  same(memory.poles(staleActive).start, staleK,
    "stale active truth remains physically readable");
  same(memory.poles(staleContinuation).start, staleA,
    "stale continuation remains physically readable");

  // Input frontier itself is immutable history and remains exactly readable.
  sameValues(
    readExactSequence(memory, selectedFrontier).values,
    [work1, work2Zero],
    "selected input frontier remains immutable",
  );

  // Identity recurrence is represented explicitly, not inherited from stale
  // physical membership.
  const loop = memory.ensure(a1, a1);
  const identityWork = defineWork(memory, active1, carrier(memory, [loop]));
  const identityInput = carrier(memory, [identityWork]);
  const identityStep = executeFrontierStep(memory, identityInput);
  sameValues(
    readExactSequence(memory, identityStep.nextFrontier).values,
    [active1],
    "selected identity continuation explicitly keeps same active identity",
  );

  // Replaying the same selected frontier is extensionally and structurally
  // canonical. This is state-transition identity, not temporal occurrence
  // identity; repeated-event provenance remains a separate question.
  const replay = executeFrontierStep(memory, selectedFrontier);
  same(replay.nextFrontier, step.nextFrontier,
    "repeated identical selected frontier has same next carrier");
  same(replay.transition, step.transition,
    "repeated identical frontier step has canonical same transition identity");

  // Whole-frontier preflight: one early-valid work followed by one malformed
  // work must fail before the first output or frontier transition write.
  const goodK = defineContext(memory, k2, memory.ensure(b.O, b.U));
  const goodA = memory.ensure(b.L, b.O);
  const goodB = memory.ensure(b.U, b.O);
  const goodActive = memory.ensure(goodK, goodA);
  const goodContinuation = memory.ensure(goodA, goodB);
  const goodWork = defineWork(
    memory,
    goodActive,
    carrier(memory, [goodContinuation]),
  );

  const badK = defineContext(memory, k2, memory.ensure(b.C, b.L));
  const badA = memory.ensure(b.U, b.C);
  const foreignA = memory.ensure(b.O, b.C);
  const badTarget = memory.ensure(b.L, b.C);
  const badActive = memory.ensure(badK, badA);
  const malformedContinuation = memory.ensure(foreignA, badTarget);
  const badWork = defineWork(
    memory,
    badActive,
    carrier(memory, [malformedContinuation]),
  );

  const malformedInput = carrier(memory, [goodWork, badWork]);
  assert(memory.find(goodK, goodB) === undefined,
    "preflight good output absent before malformed whole-frontier step");
  assert(memory.find(badK, badTarget) === undefined,
    "preflight bad output absent before malformed whole-frontier step");
  const beforeMalformed = memory.linkCount;
  expectThrows(
    () => executeFrontierStep(memory, malformedInput),
    "malformed later work must fail whole selected frontier",
  );
  same(memory.linkCount, beforeMalformed,
    "malformed selected frontier performs no output/transition write");
  assert(memory.find(goodK, goodB) === undefined,
    "malformed later work prevents partial earlier output");
  assert(memory.find(badK, badTarget) === undefined,
    "malformed work produces no bad output");

  // Empty-to-empty carries no separate event identity: R -> R canonicalizes to
  // R. If temporal evidence for such an event is required it needs a distinct
  // occurrence/lifecycle carrier; A68b does not invent one.
  const emptyStep = executeFrontierStep(memory, memory.root);
  same(emptyStep.nextFrontier, memory.root, "empty input stays empty");
  same(emptyStep.transition, memory.root,
    "empty-to-empty transition collapses to ROOT identity");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-link-carried-active-frontier-a68b.test.ts"),
    "utf8",
  );
  const begin = own.indexOf("function planWorkFrontier(");
  const end = own.indexOf("\nfunction exercise(", begin);
  assert(begin >= 0 && end > begin, "A68b core source slice");
  const core = own.slice(begin, end);

  for (const forbidden of [
    "switch",
    "ensureStartSelfClosed",
    "ensureEndSelfClosed",
    "decomposeV013SemanticLink",
    ".find(",
    ".outgoing(",
    ".incoming(",
    "allLinks(",
    ".delete(",
    ".remove(",
    "deleteLink",
    "removeLink",
    "\"ROOT\"",
    "\"START\"",
    "\"END\"",
    "\"PAIR\"",
  ]) {
    assert(!core.includes(forbidden), `A68b core excludes ${forbidden}`);
  }

  assert(core.includes("readExactSequence(memory, selectedWorkFrontier)"),
    "active work membership comes from exact selected frontier");
  assert(core.includes("readExactSequence(memory, selectedContinuationCarrier)"),
    "continuation authority comes from work-bound exact carrier");
  assert(core.includes("memory.ensure(item.context, target)"),
    "A68a generic K->B materialization remains sole rewrite output");
  assert(core.includes("materializeExactSequence(memory, values)"),
    "next active set is Link-carried ExactSequence");
}

function main(): void {
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A68b: LINK_CARRIED_ACTIVE_FRONTIER=GREEN_SCOPED_RESEARCH",
    "WORK_ITEM=ACTIVE_TRUTH_TO_SELECTED_CONTINUATION_CARRIER",
    "ACTIVE_MEMBERSHIP=SELECTED_EXACT_SEQUENCE_ONLY",
    "CONTINUATION_AUTHORITY=WORK_BOUND_EXACT_SEQUENCE_ONLY",
    "SCOPED_ZERO=ACTIVE_TRUTH_TO_R_POSITIVE_EVIDENCE",
    "NEXT_FRONTIER=LINK_CARRIED_EXACT_SEQUENCE",
    "FRONTIER_TRANSITION=SELECTED_WORK_FRONTIER_TO_NEXT_FRONTIER",
    "STALE_PHYSICAL_ACTIVE_TRUTH=INERT",
    "AMBIENT_UNSELECTED_CONTINUATION=INERT",
    "ONE_PLUS_ZERO=MIXED_TRANSFORM_AND_LOCAL_DISAPPEAR",
    "IDENTITY_RECURRENCE=EXPLICITLY_REDERIVED",
    "WHOLE_FRONTIER_PREFLIGHT=FAILS_BEFORE_ANY_OUTPUT_WRITE",
    "REPEATED_IDENTICAL_STEP=CANONICAL_SAME_TRANSITION_IDENTITY",
    "TEMPORAL_OCCURRENCE_IDENTITY=NOT_CLAIMED",
    "EMPTY_TO_EMPTY_TRANSITION=ROOT_NO_SEPARATE_EVENT_IDENTITY",
    "AMBIENT_MEMORY_SCAN=0 SEMANTIC_CASE_DISPATCH=0 PHYSICAL_DELETE=0",
    "HOST_EXACT_SEQUENCE_TRAVERSAL=RESIDUAL",
    "WORK_AUTHORITY_ADMISSION=EXTERNAL_RESIDUAL",
    "NEXT=A68C_RECURSIVE_ASYNCHRONOUS_FRONTIER_EXECUTION",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
