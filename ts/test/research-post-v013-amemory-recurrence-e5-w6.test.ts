import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  materializeExactSequence,
} from "../src/exact-sequence.js";
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
    throw new Error("post-v0.13 #1558 E5 recurrence: " + message);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}

function admit(
  memory: Memory,
  theory: LinkHandle,
  antecedent: LinkHandle,
  outputs: readonly LinkHandle[],
): LinkHandle {
  const relation =
    memory.ensure(antecedent, materializeExactSequence(memory, outputs));
  memory.ensure(theory, relation);
  return relation;
}

function freshLinks(memory: Memory, count: number): readonly LinkHandle[] {
  const basis = ensureRootBasis(memory);
  let seed = memory.ensure(basis.U, basis.L);
  const out: LinkHandle[] = [];
  for (let i = 0; i < count; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? basis.O : basis.C);
    out.push(seed);
  }
  return Object.freeze(out);
}

function memberPair(
  memory: Memory,
  cursor: V013GroundedScopeCursor,
): readonly [LinkHandle, LinkHandle] {
  const members = cursor.members();
  same(members.length, 1, "fixture keeps exactly one current truth");
  const member = members[0];
  assert(member !== undefined, "current truth exists");
  const poles = memory.poles(member);
  return Object.freeze([poles.start, poles.end]) as readonly [
    LinkHandle,
    LinkHandle,
  ];
}

function exerciseTwoCycle(): void {
  const memory = new Memory();
  const f = freshLinks(memory, 24);
  const at = (i: number): LinkHandle => {
    const value = f[i];
    assert(value !== undefined, "fresh link " + i);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));
  const K = memory.ensure(at(2), at(3));
  const A = memory.ensure(at(4), at(5));
  const B = memory.ensure(at(6), at(7));

  admit(memory, theory, A, [B]);
  admit(memory, theory, B, [A]);

  const KA = memory.ensure(K, A);
  const KB = memory.ensure(K, B);
  const scope0 = defineV013GroundedExecutionScope(
    memory,
    at(8),
    theory,
    [KA],
  );
  const cursor = new V013GroundedScopeCursor(memory, scope0);

  const r1 = reactV013GroundedScope(memory, cursor, at(9));
  same(r1.matchedRelations, 1, "A -> B first transition has one match");
  same(r1.handoffCount, 1, "active first transition publishes successor");
  assert(!r1.quiescent, "A -> B is active, not quiescent");
  const s1 = memberPair(memory, cursor);
  same(s1[0], K, "context K preserved on A -> B");
  same(s1[1], B, "A -> B reaches B");
  same(cursor.members()[0], KB, "canonical K -> B is current");

  const scope1 = cursor.currentScope();
  const r2 = reactV013GroundedScope(memory, cursor, at(10));
  same(r2.matchedRelations, 1, "B -> A second transition has one match");
  same(r2.handoffCount, 1, "active second transition publishes successor");
  assert(!r2.quiescent, "B -> A is active, not quiescent");
  const s2 = memberPair(memory, cursor);
  same(s2[0], K, "context K preserved on B -> A");
  same(s2[1], A, "B -> A returns to A");
  same(cursor.members()[0], KA, "semantic state returns to canonical K -> A");

  const scope2 = cursor.currentScope();
  assert(scope2 !== scope0, "recurrent semantic state need not reuse Scope handle");
  assert(scope2 !== scope1, "each active reaction may publish a fresh Scope");
  same(cursor.members()[0], KA, "S2 is semantically equal to S0 by current truth");

  // Once the same semantic state recurs under unchanged Theory, the same
  // deterministic grounded transition law can repeat for arbitrarily many
  // finite prefixes. This is a constructive nontermination witness.
  for (let step = 0; step < 12; step += 1) {
    const reaction = reactV013GroundedScope(memory, cursor, at(11 + (step % 12)));
    same(reaction.matchedRelations, 1, "recurrent step remains enabled");
    same(reaction.handoffCount, 1, "recurrent step keeps publishing");
    assert(!reaction.quiescent, "recurrent step never reports quiescence");

    const current = memberPair(memory, cursor);
    const expected = step % 2 === 0 ? B : A;
    same(current[1], expected, "two-cycle alternates exact semantic state");
  }
}

function exerciseSchedulerPauseIsNotQuiescence(): void {
  const memory = new Memory();
  const f = freshLinks(memory, 12);
  const at = (i: number): LinkHandle => {
    const value = f[i];
    assert(value !== undefined, "scheduler fresh link " + i);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));
  const K = memory.ensure(at(2), at(3));
  const A = memory.ensure(at(4), at(5));
  const B = memory.ensure(at(6), at(7));
  admit(memory, theory, A, [B]);

  const KA = memory.ensure(K, A);
  const scope = defineV013GroundedExecutionScope(
    memory,
    at(8),
    theory,
    [KA],
  );
  const cursor = new V013GroundedScopeCursor(memory, scope);

  // No reaction is invoked here: the host/scheduler is simply idle.
  same(cursor.currentScope(), scope, "scheduler pause changes no Scope");
  const images = discoverV013GroundedTheoryImages(memory, theory, A);
  same(images.length, 1, "paused state still has an enabled semantic transition");

  const resumed = reactV013GroundedScope(memory, cursor, at(9));
  assert(!resumed.quiescent, "scheduler inactivity was not semantic quiescence");
  same(resumed.matchedRelations, 1, "resumed reaction finds semantic work");
}

function exerciseQuiescentControl(): void {
  const memory = new Memory();
  const f = freshLinks(memory, 12);
  const at = (i: number): LinkHandle => {
    const value = f[i];
    assert(value !== undefined, "quiescent fresh link " + i);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));
  const K = memory.ensure(at(2), at(3));
  const Q = memory.ensure(at(4), at(5));
  const KQ = memory.ensure(K, Q);
  const scope = defineV013GroundedExecutionScope(
    memory,
    at(6),
    theory,
    [KQ],
  );
  const cursor = new V013GroundedScopeCursor(memory, scope);

  const reaction = reactV013GroundedScope(memory, cursor, at(7));
  same(reaction.matchedRelations, 0, "quiescent control has no admitted relation");
  same(reaction.handoffCount, 0, "quiescence performs no publication handoff");
  assert(reaction.quiescent, "complete no-match reaction is quiescent");
  same(reaction.nextScope, scope, "quiescence preserves current Scope root");
  same(cursor.currentScope(), scope, "cursor remains on same Scope");
  same(cursor.members()[0], KQ, "current semantic truth is preserved");
}

function exerciseStructuralEndIsNotGlobalHalt(): void {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const f = freshLinks(memory, 16);
  const at = (i: number): LinkHandle => {
    const value = f[i];
    assert(value !== undefined, "END-control fresh link " + i);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));
  const K = memory.ensure(at(2), at(3));
  const A = memory.ensure(at(4), at(5));

  // C is the canonical END-class sign. Giving C an admitted continuation
  // proves that structural END class alone is not a universal halt command.
  admit(memory, theory, A, [basis.C]);
  admit(memory, theory, basis.C, [A]);

  const KA = memory.ensure(K, A);
  const KC = memory.ensure(K, basis.C);
  const scope0 = defineV013GroundedExecutionScope(
    memory,
    at(6),
    theory,
    [KA],
  );
  const cursor = new V013GroundedScopeCursor(memory, scope0);

  const intoEnd = reactV013GroundedScope(memory, cursor, at(7));
  same(intoEnd.matchedRelations, 1, "transition into END-class sign is active");
  assert(!intoEnd.quiescent, "reaching canonical C is not automatic halt");
  same(cursor.members()[0], KC, "current truth reaches canonical END sign C");

  const outOfEnd = reactV013GroundedScope(memory, cursor, at(8));
  same(outOfEnd.matchedRelations, 1, "END-class sign may have admitted continuation");
  assert(!outOfEnd.quiescent, "END-class continuation remains active");
  same(cursor.members()[0], KA, "END-class continuation returns to A");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");

  const e4 = readFileSync(
    join(root, "ts/test/research-post-v013-amemory-theory-visibility-e4.test.ts"),
    "utf8",
  );
  assert(
    e4.includes("E4_CLASSIFICATION=V013_PLUS_EXECUTION_PROFILE"),
    "E5 builds on the selected E4 execution-profile boundary",
  );
  assert(
    e4.includes("REACTION_START_THEORY_SNAPSHOT_SCHEDULE_INDEPENDENT=TRUE"),
    "E4 snapshot schedule-independence witness remains retained",
  );

  const production = readFileSync(
    join(root, "ts/src/v013-grounded-execution.ts"),
    "utf8",
  );
  assert(
    production.includes("if (matchedRelations === 0)"),
    "quiescence remains complete no-match reaction",
  );
  assert(
    production.includes("handoffCount: 0"),
    "quiescence remains no-handoff publication result",
  );
}

function main(): void {
  exerciseTwoCycle();
  exerciseSchedulerPauseIsNotQuiescence();
  exerciseQuiescentControl();
  exerciseStructuralEndIsNotGlobalHalt();
  staticGuards();

  console.log([
    "POST_V013_1558_E5_W6=GREEN",
    "QUIESCENCE=COMPLETE_REACTION_MATCHED_RELATIONS_ZERO",
    "QUIESCENCE_HANDOFF_COUNT=0",
    "RECURRENCE=REPEATED_SEMANTIC_STATE_WITH_ACTIVE_TRANSITIONS",
    "RECURRENT_SCOPE_HANDLE_REUSE_REQUIRED=FALSE",
    "RECURRENCE_IMPLIES_QUIESCENCE=FALSE",
    "SCHEDULER_INACTIVITY_EQUALS_QUIESCENCE=FALSE",
    "FINITE_RECURRENT_NETWORK_CAN_EXECUTE_WITHOUT_QUIESCENCE=TRUE",
    "GLOBAL_TERMINATION_REQUIRED=FALSE",
    "STRUCTURAL_END_ASPECT_IMPLIES_GLOBAL_HALT=FALSE",
    "E5_CLASSIFICATION=V013_PLUS_EXECUTION_PROFILE",
    "SEMANTIC_EXTENSION_REQUIRED=NOT_ESTABLISHED",
    "ISSUE_1558_REMAINING_E6_E7=OPEN",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
