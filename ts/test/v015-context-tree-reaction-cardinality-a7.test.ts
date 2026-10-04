import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
} from "../src/memory.js";
import {
  materializeExactSequence,
  readExactSequence,
  ExactSequenceError,
} from "../src/exact-sequence.js";
import {
  defineContext,
  readContext,
  StateError,
} from "../src/state.js";
import { exportCanonicalTopology } from "../src/canonical-topology.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`v0.15 A7 Context-tree reaction cardinality: ${message}`);
  }
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function setSame<T>(
  actual: readonly T[],
  expected: readonly T[],
  message: string,
): void {
  same(new Set(actual).size, new Set(expected).size, `${message}: cardinality`);
  for (const value of expected) {
    assert(actual.includes(value), `${message}: missing expected value`);
  }
}

function contextOrUndefined(
  memory: ReadMemory,
  value: LinkHandle,
): { readonly parent: LinkHandle; readonly current: LinkHandle } | undefined {
  try {
    return readContext(memory, value);
  } catch (error) {
    if (error instanceof StateError && error.code === "invalid-context") {
      return undefined;
    }
    throw error;
  }
}

function deriveEndBoundary(memory: ReadMemory): LinkHandle {
  const R = memory.root;
  const found: LinkHandle[] = [];
  for (const candidate of memory.outgoing(R)) {
    if (candidate === R) continue;
    const poles = memory.poles(candidate);
    if (poles.start === R && poles.end === candidate) found.push(candidate);
  }
  same(found.length, 1, "unique R-rooted END boundary");
  return found[0]!;
}

function readEnvironment(
  memory: ReadMemory,
  environment: LinkHandle,
): { readonly boundary: LinkHandle; readonly theory: LinkHandle } {
  const boundary = deriveEndBoundary(memory);
  const poles = memory.poles(environment);
  assert(
    poles.start === boundary && poles.end !== environment,
    "environment must be ordinary C->Theory",
  );
  return Object.freeze({ boundary, theory: poles.end });
}

function rootEnvironmentOf(
  memory: ReadMemory,
  context: LinkHandle,
): LinkHandle {
  const seen = new Set<LinkHandle>();
  let cursor = context;
  while (true) {
    assert(!seen.has(cursor), "Context ancestry cycle");
    seen.add(cursor);
    const state = contextOrUndefined(memory, cursor);
    if (state === undefined) {
      readEnvironment(memory, cursor);
      return cursor;
    }
    cursor = state.parent;
  }
}

function theoryOfContext(memory: ReadMemory, context: LinkHandle): LinkHandle {
  return readEnvironment(memory, rootEnvironmentOf(memory, context)).theory;
}

function discoverEntries(memory: ReadMemory): readonly LinkHandle[] {
  const C = deriveEndBoundary(memory);
  const entries: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();

  for (const environment of memory.outgoing(C)) {
    const ep = memory.poles(environment);
    if (ep.start !== C || ep.end === environment) continue;

    for (const payload of memory.outgoing(environment)) {
      const pp = memory.poles(payload);
      if (pp.start !== environment || pp.end === payload) continue;

      for (const candidate of memory.incoming(payload)) {
        if (seen.has(candidate)) continue;
        const cp = memory.poles(candidate);
        if (cp.start !== candidate || cp.end !== payload) continue;
        const state = contextOrUndefined(memory, candidate);
        if (
          state === undefined ||
          state.parent !== environment ||
          state.current !== pp.end
        ) continue;

        readEnvironment(memory, environment);
        seen.add(candidate);
        entries.push(candidate);
      }
    }
  }

  return Object.freeze(entries);
}

function childContexts(
  memory: ReadMemory,
  parent: LinkHandle,
): readonly LinkHandle[] {
  const children: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();

  for (const payload of memory.outgoing(parent)) {
    const pp = memory.poles(payload);
    if (pp.start !== parent || pp.end === payload) continue;

    for (const candidate of memory.incoming(payload)) {
      if (seen.has(candidate)) continue;
      const cp = memory.poles(candidate);
      if (cp.start !== candidate || cp.end !== payload) continue;
      const state = contextOrUndefined(memory, candidate);
      if (
        state === undefined ||
        state.parent !== parent ||
        state.current !== pp.end
      ) continue;
      seen.add(candidate);
      children.push(candidate);
    }
  }

  return Object.freeze(children);
}

function closureOf(
  memory: ReadMemory,
  context: LinkHandle,
): LinkHandle | undefined {
  let closure: LinkHandle | undefined;
  for (const candidate of memory.outgoing(context)) {
    const p = memory.poles(candidate);
    if (p.start !== context || p.end !== candidate || p.start === candidate) {
      continue;
    }
    assert(
      closure === undefined || closure === candidate,
      "multiple END closures for one Context",
    );
    closure = candidate;
  }
  return closure;
}

function frontier(memory: ReadMemory): readonly LinkHandle[] {
  const active: LinkHandle[] = [];
  const visiting = new Set<LinkHandle>();
  const visited = new Set<LinkHandle>();

  const walk = (context: LinkHandle): void => {
    assert(!visiting.has(context), "Context child cycle");
    if (visited.has(context)) return;
    visiting.add(context);

    const children = childContexts(memory, context);
    const closure = closureOf(memory, context);
    if (children.length > 0) {
      assert(closure === undefined, "closed non-leaf Context");
      for (const child of children) walk(child);
    } else if (closure === undefined) {
      active.push(context);
    }

    visiting.delete(context);
    visited.add(context);
  };

  for (const entry of discoverEntries(memory)) walk(entry);
  return Object.freeze(active);
}

function relation(
  memory: Memory,
  antecedent: LinkHandle,
  outputs: readonly LinkHandle[],
): LinkHandle {
  return memory.ensure(
    antecedent,
    materializeExactSequence(memory, outputs),
  );
}
function admit(
  memory: Memory,
  theory: LinkHandle,
  value: LinkHandle,
): LinkHandle {
  return memory.ensure(theory, value);
}

interface SnapshotRelation {
  readonly antecedent: LinkHandle;
  readonly outputs: readonly LinkHandle[];
}

function snapshotTheory(
  memory: ReadMemory,
  theory: LinkHandle,
): readonly SnapshotRelation[] {
  const result: SnapshotRelation[] = [];
  for (const admission of memory.outgoing(theory)) {
    if (admission === theory) continue;
    const ap = memory.poles(admission);
    if (ap.start !== theory || ap.end === admission) continue;

    const rp = memory.poles(ap.end);
    try {
      result.push(Object.freeze({
        antecedent: rp.start,
        outputs: readExactSequence(memory, rp.end).values,
      }));
    } catch (error) {
      if (error instanceof ExactSequenceError) continue;
      throw error;
    }
  }
  return Object.freeze(result);
}

interface PlannedLeaf {
  readonly context: LinkHandle;
  readonly truth: LinkHandle;
  readonly matches: number;
  readonly outputs: readonly LinkHandle[];
}

interface Reaction {
  readonly before: readonly LinkHandle[];
  readonly after: readonly LinkHandle[];
  readonly matches: number;
  readonly transitioned: number;
  readonly noMatch: number;
  readonly zero: number;
  readonly positive: number;
  readonly createdChildren: number;
  readonly createdClosures: number;
  readonly quiescent: boolean;
}

function planReaction(
  memory: ReadMemory,
): readonly PlannedLeaf[] {
  const current = frontier(memory);
  const snapshots = new Map<LinkHandle, readonly SnapshotRelation[]>();

  for (const context of current) {
    const theory = theoryOfContext(memory, context);
    if (!snapshots.has(theory)) snapshots.set(theory, snapshotTheory(memory, theory));
  }

  const plan: PlannedLeaf[] = [];
  for (const context of current) {
    const truth = readContext(memory, context).current;
    const tp = memory.poles(truth);
    const theory = theoryOfContext(memory, context);
    const relations = snapshots.get(theory);
    assert(relations !== undefined, "Theory snapshot available");

    const matched = relations.filter((item) => item.antecedent === tp.end);
    const outputs: LinkHandle[] = [];
    for (const item of matched) {
      for (const output of item.outputs) {
        if (!outputs.includes(output)) outputs.push(output);
      }
    }

    plan.push(Object.freeze({
      context,
      truth,
      matches: matched.length,
      outputs: Object.freeze(outputs),
    }));
  }

  return Object.freeze(plan);
}

function publishReaction(
  memory: Memory,
  plan: readonly PlannedLeaf[],
): Reaction {
  const before = Object.freeze(plan.map((item) => item.context));
  let matches = 0;
  let transitioned = 0;
  let noMatch = 0;
  let zero = 0;
  let positive = 0;
  let createdChildren = 0;
  let createdClosures = 0;

  for (const item of plan) {
    if (item.matches === 0) {
      noMatch += 1;
      continue;
    }

    transitioned += 1;
    matches += item.matches;

    if (item.outputs.length === 0) {
      memory.ensureEndSelfClosed(item.context);
      zero += 1;
      createdClosures += 1;
      continue;
    }

    positive += 1;
    const truth = memory.poles(item.truth);
    for (const output of item.outputs) {
      const nextTruth = memory.ensure(truth.start, output);
      defineContext(memory, item.context, nextTruth);
      createdChildren += 1;
    }
  }

  return Object.freeze({
    before,
    after: frontier(memory),
    matches,
    transitioned,
    noMatch,
    zero,
    positive,
    createdChildren,
    createdClosures,
    quiescent: matches === 0,
  });
}

function react(memory: Memory): Reaction {
  // Strict snapshot/publication boundary: planReaction is read-only.
  const before = memory.linkCount;
  const plan = planReaction(memory);
  same(memory.linkCount, before, "reaction planning is read-only");
  return publishReaction(memory, plan);
}

function currentTruths(
  memory: ReadMemory,
  contexts: readonly LinkHandle[],
): readonly LinkHandle[] {
  return Object.freeze(contexts.map((context) => readContext(memory, context).current));
}

function pointwiseReference(
  memory: ReadMemory,
  theory: LinkHandle,
  truths: readonly LinkHandle[],
): readonly LinkHandle[] {
  const snapshot = snapshotTheory(memory, theory);
  const next: LinkHandle[] = [];

  for (const truth of truths) {
    const tp = memory.poles(truth);
    const matched = snapshot.filter((item) => item.antecedent === tp.end);
    if (matched.length === 0) {
      if (!next.includes(truth)) next.push(truth);
      continue;
    }

    for (const item of matched) {
      for (const output of item.outputs) {
        const existing = memory.find(tp.start, output);
        assert(existing !== undefined, "published successor exists before reference projection");
        if (!next.includes(existing)) next.push(existing);
      }
    }
  }

  return Object.freeze(next);
}

interface FixtureOutcome {
  readonly topology: string;
  readonly beforeCount: number;
  readonly afterCount: number;
  readonly stats: readonly number[];
}

function run(reverseEntryCreation: boolean): FixtureOutcome {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 180; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const value = fresh[i];
    assert(value !== undefined, `fresh anchor ${i}`);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));
  const foreignTheory = memory.ensure(at(2), at(3));
  const environment = memory.ensure(b.C, theory);

  const ANo = memory.ensure(at(10), at(11));
  const AZero = memory.ensure(at(12), at(13));
  const AOne = memory.ensure(at(14), at(15));
  const AMany = memory.ensure(at(16), at(17));
  const AMulti = memory.ensure(at(18), at(19));

  const BOne = memory.ensure(at(20), at(21));
  const BMany1 = memory.ensure(at(22), at(23));
  const BMany2 = memory.ensure(at(24), at(25));
  const BMulti1 = memory.ensure(at(26), at(27));
  const BMulti2 = memory.ensure(at(28), at(29));
  const BMulti3 = memory.ensure(at(30), at(31));
  const foreignOutput = memory.ensure(at(32), at(33));

  admit(memory, theory, relation(memory, AZero, []));
  admit(memory, theory, relation(memory, AOne, [BOne]));
  admit(memory, theory, relation(memory, AMany, [BMany1, BMany2]));
  admit(memory, theory, relation(memory, AMulti, [BMulti1, BMulti2]));
  admit(memory, theory, relation(memory, AMulti, [BMulti2, BMulti3]));
  admit(memory, foreignTheory, relation(memory, ANo, [foreignOutput]));

  const callers = [
    memory.ensure(at(40), at(41)),
    memory.ensure(at(42), at(43)),
    memory.ensure(at(44), at(45)),
    memory.ensure(at(46), at(47)),
    memory.ensure(at(48), at(49)),
  ] as const;
  const antecedents = [ANo, AZero, AOne, AMany, AMulti] as const;
  const initialTruths = callers.map(
    (caller, i) => memory.ensure(caller, antecedents[i]!),
  );

  const orderedTruths = reverseEntryCreation
    ? [...initialTruths].reverse()
    : [...initialTruths];
  for (const truth of orderedTruths) defineContext(memory, environment, truth);

  const beforeFrontier = frontier(memory);
  setSame(currentTruths(memory, beforeFrontier), initialTruths,
    "initial Context frontier equals N current truths");

  const beforePlanning = memory.linkCount;
  const plan = planReaction(memory);
  same(memory.linkCount, beforePlanning, "explicit plan writes no Links");

  const reaction = publishReaction(memory, plan);
  same(reaction.before.length, 5, "N current members");
  same(reaction.matches, 5, "all five admitted relation matches counted");
  same(reaction.transitioned, 4, "ZERO/ONE/MANY/MULTI transition four leaves");
  same(reaction.noMatch, 1, "one NO_MATCH leaf");
  same(reaction.zero, 1, "one matched-empty leaf");
  same(reaction.positive, 3, "three positive-image leaves");
  same(reaction.createdClosures, 1, "ZERO produces one END closure");
  same(reaction.createdChildren, 6,
    "ONE + MANY + multi-relation deduplicated union creates six children");
  same(reaction.quiescent, false, "positive reaction not quiescent");

  const noMatchEntry = beforeFrontier.find(
    (context) => readContext(memory, context).current === initialTruths[0],
  );
  assert(noMatchEntry !== undefined, "NO_MATCH entry found");
  assert(reaction.after.includes(noMatchEntry),
    "NO_MATCH preserves the exact same active Context leaf");

  const zeroEntry = beforeFrontier.find(
    (context) => readContext(memory, context).current === initialTruths[1],
  );
  assert(zeroEntry !== undefined, "ZERO entry found");
  assert(closureOf(memory, zeroEntry) !== undefined,
    "matched-empty closes Context with END");
  assert(!reaction.after.includes(zeroEntry), "ZERO leaf leaves frontier");

  const expectedTruths = [
    initialTruths[0],
    memory.find(callers[2], BOne)!,
    memory.find(callers[3], BMany1)!,
    memory.find(callers[3], BMany2)!,
    memory.find(callers[4], BMulti1)!,
    memory.find(callers[4], BMulti2)!,
    memory.find(callers[4], BMulti3)!,
  ];
  for (const value of expectedTruths) assert(value !== undefined, "expected successor exists");

  const actualTruths = currentTruths(memory, reaction.after);
  setSame(actualTruths, expectedTruths,
    "Context-tree frontier implements NO_MATCH/ZERO/ONE/MANY/N-to-M successor");

  const reference = pointwiseReference(memory, theory, initialTruths);
  setSame(actualTruths, reference,
    "Context-tree successor equals pointwise generalized-reaction reference");

  const BMulti2Truth = memory.find(callers[4], BMulti2);
  assert(BMulti2Truth !== undefined, "duplicate-converged successor exists");
  same(
    actualTruths.filter((truth) => truth === BMulti2Truth).length,
    1,
    "duplicate relation outputs converge to one active truth",
  );

  const foreignTruth = memory.find(callers[0], foreignOutput);
  assert(
    foreignTruth === undefined || !actualTruths.includes(foreignTruth),
    "foreign Theory relation is inert",
  );

  // A second round has no admitted relations for the produced outputs.
  const stable = react(memory);
  same(stable.matches, 0, "second round has zero matches");
  same(stable.quiescent, true, "second round quiescent");
  setSame(currentTruths(memory, stable.after), actualTruths,
    "quiescent round preserves current frontier exactly");

  return Object.freeze({
    topology: JSON.stringify(exportCanonicalTopology(memory).topology),
    beforeCount: beforeFrontier.length,
    afterCount: reaction.after.length,
    stats: Object.freeze([
      reaction.matches,
      reaction.transitioned,
      reaction.noMatch,
      reaction.zero,
      reaction.positive,
      reaction.createdChildren,
      reaction.createdClosures,
    ]),
  });
}

function staticGuards(): void {
  const own = readFileSync(
    resolve(
      process.cwd(),
      "test/v015-context-tree-reaction-cardinality-a7.test.ts",
    ),
    "utf8",
  );

  const planStart = own.indexOf("function planReaction(");
  const planEnd = own.indexOf("\nfunction publishReaction(", planStart);
  assert(planStart >= 0 && planEnd > planStart, "planning source slice");
  const planner = own.slice(planStart, planEnd);

  for (const forbidden of [
    ".ensure(",
    "defineContext(",
    "ensureEndSelfClosed(",
    "currentScope",
    "selectedTheory",
    "programCounter",
  ]) {
    assert(!planner.includes(forbidden),
      `planner excludes publication/external authority: ${forbidden}`);
  }
  assert(planner.includes("frontier(memory)"),
    "planner derives current members from Context tree");
  assert(planner.includes("theoryOfContext(memory, context)"),
    "planner derives Theory from ancestry");
  assert(planner.includes("snapshotTheory(memory, theory)"),
    "planner captures Theory snapshot before publication");

  const publicationStart = own.indexOf("function publishReaction(");
  const publicationEnd = own.indexOf("\nfunction react(", publicationStart);
  assert(
    publicationStart >= 0 && publicationEnd > publicationStart,
    "publication source slice",
  );
  const publication = own.slice(publicationStart, publicationEnd);
  assert(publication.includes("memory.ensureEndSelfClosed(item.context)"),
    "matched empty maps to END closure");
  assert(publication.includes("defineContext(memory, item.context, nextTruth)"),
    "positive image maps to child Context");
  for (const forbidden of [
    "V013GroundedScopeCursor",
    "switchAtomically",
    "defineV013GroundedExecutionScope",
    "selectedScope",
  ]) {
    assert(!publication.includes(forbidden),
      `publication excludes old Scope mechanism: ${forbidden}`);
  }
}

function main(): void {
  const forward = run(false);
  const reverse = run(true);

  same(forward.beforeCount, 5, "forward N current count");
  same(forward.afterCount, 7, "forward M successor count");
  same(reverse.beforeCount, 5, "reverse N current count");
  same(reverse.afterCount, 7, "reverse M successor count");
  same(forward.stats.join(","), reverse.stats.join(","),
    "entry order does not change reaction cardinality statistics");
  same(forward.topology, reverse.topology,
    "entry order does not change canonical final topology");

  staticGuards();

  console.log([
    "MTS v0.15 A7: CONTEXT_TREE_GENERALIZED_REACTION=GREEN_RESEARCH",
    "EXTERNAL_CURRENT_SCOPE_POINTER=0",
    "CURRENT_STATE=ACTIVE_CONTEXT_FRONTIER",
    "THEORY=DERIVED_FROM_CONTEXT_ANCESTRY",
    "NO_MATCH=PRESERVE_SAME_ACTIVE_LEAF",
    "MATCHED_EMPTY=END_ACTIVE_LEAF",
    "ONE=ONE_CHILD_CONTEXT",
    "MANY=SIBLING_CHILD_CONTEXTS",
    "N_TO_M=POINTWISE_FRONTIER_REACTION",
    "MULTIPLE_MATCHES=EXHAUSTIVE",
    "DUPLICATE_OUTPUTS=CANONICAL_CHILD_CONVERGENCE",
    "FOREIGN_THEORY=INERT",
    "REACTION_START_THEORY_SNAPSHOT=TRUE",
    "COMPLETE_PLAN_BEFORE_PUBLICATION=TRUE",
    "CONTEXT_TREE_SUCCESSOR_EQUALS_POINTWISE_REFERENCE=TRUE",
    "FORWARD_REVERSE_ENTRY_ORDER=CANONICAL_SAME",
    "OLD_SCOPE_HANDOFF_REQUIRED=FALSE_FOR_TESTED_VECTOR",
    "HOST_FRONTIER_TRAVERSAL=RESIDUAL",
    "HOST_RELATION_SNAPSHOT_MATCH=RESIDUAL_READ_ONLY_ORACLE",
    "FULL_SELF_HOSTED_GENERALIZED_REACTION=NOT_YET_PROVEN",
    "ACCEPTED_V014_UNCHANGED",
  ].join(" "));
}

main();
