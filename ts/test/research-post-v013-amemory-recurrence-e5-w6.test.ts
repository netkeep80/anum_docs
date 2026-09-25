import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  V013GroundedScopeCursor,
  defineV013GroundedExecutionScope,
  discoverV013GroundedTheoryImages,
  reactV013GroundedScope,
} from "../src/v013-grounded-execution.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error("post-v0.13 #1558 E5/W6 recurrence: " + message);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}

function sameMembers(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, message + ": cardinality");
  for (const member of expected) {
    assert(actual.includes(member), message + ": missing member");
  }
}

function admit(
  memory: Memory,
  theory: LinkHandle,
  antecedent: LinkHandle,
  outputs: readonly LinkHandle[],
): void {
  const relation =
    memory.ensure(antecedent, materializeExactSequence(memory, outputs));
  memory.ensure(theory, relation);
}

interface Fixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly K: LinkHandle;
  readonly Kdone: LinkHandle;
  readonly A: LinkHandle;
  readonly B: LinkHandle;
  readonly endValue: LinkHandle;
  readonly KA: LinkHandle;
  readonly KB: LinkHandle;
  readonly KdoneEnd: LinkHandle;
  readonly seeds: readonly LinkHandle[];
}

function buildFixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  let seed = memory.ensure(basis.U, basis.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 96; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? basis.O : basis.C);
    fresh.push(seed);
  }
  const at = (index: number): LinkHandle => {
    const value = fresh[index];
    assert(value !== undefined, "fresh anchor " + index);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));
  const K = memory.ensure(at(2), at(3));
  const Kdone = memory.ensure(at(4), at(5));
  const A = memory.ensure(at(6), at(7));
  const B = memory.ensure(at(8), at(9));

  // Finite recurrent relation family.
  admit(memory, theory, A, [B]);
  admit(memory, theory, B, [A]);

  // END-shaped endpoint is deliberately inert under this Theory.
  const endValue = memory.ensureEndSelfClosed(at(10));

  const KA = memory.ensure(K, A);
  const KB = memory.ensure(K, B);
  const KdoneEnd = memory.ensure(Kdone, endValue);

  const seeds = Object.freeze([
    at(20),
    at(21),
    at(22),
    at(23),
    at(24),
    at(25),
    at(26),
    at(27),
  ]);

  return Object.freeze({
    memory,
    theory,
    K,
    Kdone,
    A,
    B,
    endValue,
    KA,
    KB,
    KdoneEnd,
    seeds,
  });
}

type NormalizedState = "A+END" | "B+END" | "END_ONLY";

function normalizeState(
  f: Fixture,
  members: readonly LinkHandle[],
): NormalizedState {
  if (
    members.length === 2 &&
    members.includes(f.KA) &&
    members.includes(f.KdoneEnd)
  ) {
    return "A+END";
  }
  if (
    members.length === 2 &&
    members.includes(f.KB) &&
    members.includes(f.KdoneEnd)
  ) {
    return "B+END";
  }
  if (members.length === 1 && members[0] === f.KdoneEnd) {
    return "END_ONLY";
  }
  throw new Error("unexpected semantic state");
}

function hasEnabledTransition(
  f: Fixture,
  members: readonly LinkHandle[],
): boolean {
  for (const member of members) {
    const antecedent = f.memory.poles(member).end;
    if (
      discoverV013GroundedTheoryImages(
        f.memory,
        f.theory,
        antecedent,
      ).length > 0
    ) {
      return true;
    }
  }
  return false;
}

function exerciseRecurrentNetwork(): void {
  const f = buildFixture();
  const initialScope = defineV013GroundedExecutionScope(
    f.memory,
    f.seeds[0]!,
    f.theory,
    [f.KA, f.KdoneEnd],
  );
  const cursor = new V013GroundedScopeCursor(f.memory, initialScope);

  same(
    normalizeState(f, cursor.members()),
    "A+END",
    "initial normalized state",
  );
  assert(
    hasEnabledTransition(f, cursor.members()),
    "initial state has semantic work",
  );

  const normalized: NormalizedState[] = [
    normalizeState(f, cursor.members()),
  ];
  const scopeRoots: LinkHandle[] = [cursor.currentScope()];

  for (let step = 1; step <= 6; step += 1) {
    const beforeScope = cursor.currentScope();
    const result = reactV013GroundedScope(
      f.memory,
      cursor,
      f.seeds[step]!,
    );

    assert(!result.quiescent, "cycle step remains active");
    same(result.matchedRelations, 1, "one cycle relation fires");
    same(result.transitionedMembers, 1, "only cyclic truth reacts");
    same(result.handoffCount, 1, "active cycle publishes successor");
    assert(
      cursor.currentScope() !== beforeScope,
      "active step publishes a distinct Scope root",
    );

    // The inert END-shaped sibling survives every reaction.
    assert(
      cursor.members().includes(f.KdoneEnd),
      "inert END-shaped sibling remains current",
    );

    const expected: NormalizedState =
      step % 2 === 1 ? "B+END" : "A+END";
    same(
      normalizeState(f, cursor.members()),
      expected,
      "normalized cycle phase",
    );
    assert(
      hasEnabledTransition(f, cursor.members()),
      "recurrent state still has an enabled semantic transition",
    );

    normalized.push(normalizeState(f, cursor.members()));
    scopeRoots.push(cursor.currentScope());
  }

  // Exact Scope roots are publication/history identities, not recurrence identity.
  for (let i = 0; i < scopeRoots.length; i += 1) {
    for (let j = i + 1; j < scopeRoots.length; j += 1) {
      assert(
        scopeRoots[i] !== scopeRoots[j],
        "fresh publication roots remain physically distinct",
      );
    }
  }

  same(normalized[0], normalized[2], "period-2 return after two steps");
  same(normalized[1], normalized[3], "opposite phase also recurs");
  same(normalized[2], normalized[4], "recurrence continues");
  same(normalized[4], normalized[6], "finite witness closes induction pattern");

  // Because both recurrent phases have an enabled transition and map
  // deterministically into the other phase, the trajectory can continue
  // without reaching a quiescent state.
  assert(
    normalized.every((state) => state !== "END_ONLY"),
    "recurrent trajectory never collapses to inert-only state",
  );
}

function exerciseSchedulerPauseIsNotQuiescence(): void {
  const f = buildFixture();
  const scope = defineV013GroundedExecutionScope(
    f.memory,
    f.seeds[0]!,
    f.theory,
    [f.KA, f.KdoneEnd],
  );
  const cursor = new V013GroundedScopeCursor(f.memory, scope);

  // A host may choose not to call the reaction kernel right now. That is
  // scheduler inactivity, not semantic quiescence.
  same(cursor.currentScope(), scope, "scheduler pause changes no Scope");
  assert(
    hasEnabledTransition(f, cursor.members()),
    "paused state still has an admitted transition",
  );

  const resumed = reactV013GroundedScope(
    f.memory,
    cursor,
    f.seeds[1]!,
  );
  assert(!resumed.quiescent, "resuming finds semantic work");
  same(resumed.matchedRelations, 1, "resumed reaction fires cycle relation");
}

function exerciseTrueQuiescence(): void {
  const f = buildFixture();
  const scope = defineV013GroundedExecutionScope(
    f.memory,
    f.seeds[0]!,
    f.theory,
    [f.KdoneEnd],
  );
  const cursor = new V013GroundedScopeCursor(f.memory, scope);

  assert(
    !hasEnabledTransition(f, cursor.members()),
    "inert-only state has no admitted transition",
  );

  const result = reactV013GroundedScope(
    f.memory,
    cursor,
    f.seeds[1]!,
  );
  assert(result.quiescent, "inert-only state is quiescent");
  same(result.matchedRelations, 0, "quiescence means zero matches");
  same(result.handoffCount, 0, "quiescence publishes no successor");
  same(result.nextScope, scope, "quiescence preserves exact Scope root");
  same(cursor.currentScope(), scope, "current root is unchanged");
  sameMembers(cursor.members(), [f.KdoneEnd], "quiescent members unchanged");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");

  const production = readFileSync(
    join(root, "ts/src/v013-grounded-execution.ts"),
    "utf8",
  );
  assert(
    production.includes("if (matchedRelations === 0)"),
    "accepted executor keeps exact quiescence boundary",
  );
  assert(
    production.includes("quiescent: true"),
    "accepted executor reports quiescence explicitly",
  );

  const e4 = readFileSync(
    join(
      root,
      "ts/test/research-post-v013-amemory-theory-visibility-e4.test.ts",
    ),
    "utf8",
  );
  assert(
    e4.includes("E4_CLASSIFICATION=V013_PLUS_EXECUTION_PROFILE"),
    "E5 builds on the E4 profile classification",
  );

  const own = readFileSync(
    join(
      root,
      "ts/test/research-post-v013-amemory-recurrence-e5-w6.test.ts",
    ),
    "utf8",
  );
  for (const forbidden of [
    "setTimeout",
    "setInterval",
    "Date.now",
    "sleep(",
    "while (true)",
    "process.exit",
  ]) {
    assert(
      !own.includes(forbidden),
      "witness has no host-time or infinite-loop authority: " + forbidden,
    );
  }
}

function main(): void {
  exerciseRecurrentNetwork();
  exerciseSchedulerPauseIsNotQuiescence();
  exerciseTrueQuiescence();
  staticGuards();

  console.log([
    "POST_V013_1558_E5_W6=GREEN",
    "FINITE_RECURRENT_NETWORK=GREEN",
    "RECURRENCE_PERIOD=2",
    "RECURRENT_STATE_HAS_ENABLED_TRANSITION=TRUE",
    "RECURRENCE_EQUALS_QUIESCENCE=FALSE",
    "EXACT_SCOPE_ROOT_RECURRENCE_REQUIRED=FALSE",
    "SEMANTIC_STATE_RECURRENCE=EXTENSIONAL",
    "END_SHAPED_MEMBER_IMPLIES_GLOBAL_STOP=FALSE",
    "SCHEDULER_INACTIVITY_EQUALS_QUIESCENCE=FALSE",
    "QUIESCENCE_REQUIRES_EXHAUSTIVE_NO_ENABLED_TRANSITION=TRUE",
    "QUIESCENCE_HANDOFF_COUNT=0",
    "INFINITE_EVOLUTION_POSSIBLE=TRUE",
    "GLOBAL_TERMINATION_REQUIRED=FALSE",
    "RECURRENCE_DETECTOR_REQUIRED_FOR_EXECUTION=FALSE",
    "E5_LOCAL_CLASSIFICATION=V013_SUFFICIENT_GIVEN_EXECUTION_PROFILE",
    "GLOBAL_1558_CLASSIFICATION=V013_PLUS_EXECUTION_PROFILE_OR_STRONGER",
    "SEMANTIC_EXTENSION_REQUIRED=NOT_ESTABLISHED",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
