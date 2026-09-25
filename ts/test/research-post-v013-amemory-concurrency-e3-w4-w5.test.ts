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
  reactV013GroundedScope,
} from "../src/v013-grounded-execution.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error("post-v0.13 #1558 E3/W4/W5: " + message);
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

interface Fresh {
  readonly memory: Memory;
  readonly at: (index: number) => LinkHandle;
}

function freshMemory(count = 96): Fresh {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let seed = memory.ensure(basis.U, basis.L);
  const refs: LinkHandle[] = [];
  for (let i = 0; i < count; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? basis.O : basis.C);
    refs.push(seed);
  }
  const at = (index: number): LinkHandle => {
    const value = refs[index];
    assert(value !== undefined, "fresh anchor " + index);
    return value;
  };
  return Object.freeze({ memory, at });
}

interface StaticOutcome {
  readonly signature: string;
  readonly matchedRelations: number;
  readonly transitionedMembers: number;
}

function runStaticIndependent(reverse: boolean): StaticOutcome {
  const { memory, at } = freshMemory();
  const theory = memory.ensure(at(0), at(1));

  const K1 = memory.ensure(at(2), at(3));
  const K2 = memory.ensure(at(4), at(5));
  const A = memory.ensure(at(6), at(7));
  const C = memory.ensure(at(8), at(9));
  const B = memory.ensure(at(10), at(11));
  const D = memory.ensure(at(12), at(13));

  admit(memory, theory, A, [B]);
  admit(memory, theory, C, [D]);

  const KA = memory.ensure(K1, A);
  const KC = memory.ensure(K2, C);
  const initial = reverse ? [KC, KA] : [KA, KC];

  const cursor = new V013GroundedScopeCursor(
    memory,
    defineV013GroundedExecutionScope(memory, at(20), theory, initial),
  );
  const reaction = reactV013GroundedScope(memory, cursor, at(21));

  const KB = memory.ensure(K1, B);
  const KD = memory.ensure(K2, D);
  const members = cursor.members();

  return Object.freeze({
    signature: JSON.stringify({
      count: members.length,
      KB: members.includes(KB),
      KD: members.includes(KD),
      KA: members.includes(KA),
      KC: members.includes(KC),
    }),
    matchedRelations: reaction.matchedRelations,
    transitionedMembers: reaction.transitionedMembers,
  });
}

interface InteractingOutcome {
  readonly signature: string;
  readonly matchedRelations: number;
  readonly admissionCurrent: boolean;
  readonly KAcurrent: boolean;
  readonly KBcurrent: boolean;
}

function runLiveTheoryInteraction(generatorFirst: boolean): InteractingOutcome {
  const { memory, at } = freshMemory(128);
  const theory = memory.ensure(at(0), at(1));

  const BOOT = memory.ensure(at(2), at(3));
  const A = memory.ensure(at(4), at(5));
  const B = memory.ensure(at(6), at(7));
  const K = memory.ensure(at(8), at(9));

  const candidate =
    memory.ensure(A, materializeExactSequence(memory, [B]));
  const bootstrap =
    memory.ensure(BOOT, materializeExactSequence(memory, [candidate]));
  memory.ensure(theory, bootstrap);

  const generator = memory.ensure(theory, BOOT);
  const target = memory.ensure(K, A);
  const initial = generatorFirst
    ? [generator, target]
    : [target, generator];

  const cursor = new V013GroundedScopeCursor(
    memory,
    defineV013GroundedExecutionScope(memory, at(20), theory, initial),
  );

  same(
    memory.find(theory, candidate),
    undefined,
    "candidate admission absent in logical pre-state",
  );

  const reaction = reactV013GroundedScope(memory, cursor, at(21));

  const admission = memory.find(theory, candidate);
  assert(admission !== undefined, "generator materializes candidate admission");

  const KA = memory.ensure(K, A);
  const KB = memory.ensure(K, B);
  const members = cursor.members();

  return Object.freeze({
    signature: JSON.stringify({
      admission: members.includes(admission),
      KA: members.includes(KA),
      KB: members.includes(KB),
    }),
    matchedRelations: reaction.matchedRelations,
    admissionCurrent: members.includes(admission),
    KAcurrent: members.includes(KA),
    KBcurrent: members.includes(KB),
  });
}

function exercise(): void {
  // W4: when Theory authority is fixed during the logical reaction and current
  // members do not alter one another's applicability, physical member order is
  // extensionally irrelevant to state(t+1).
  const staticForward = runStaticIndependent(false);
  const staticReverse = runStaticIndependent(true);

  same(
    staticForward.signature,
    staticReverse.signature,
    "static independent reactions have one schedule-independent successor",
  );
  same(staticForward.matchedRelations, 2, "forward two relation matches");
  same(staticReverse.matchedRelations, 2, "reverse two relation matches");
  same(staticForward.transitionedMembers, 2, "forward two transitions");
  same(staticReverse.transitionedMembers, 2, "reverse two transitions");

  // W5: current accepted production execution intentionally sees live Memory
  // during one reaction. If one member admits a new Theory relation, another
  // member can observe it in the same call only when processed later.
  const generatorFirst = runLiveTheoryInteraction(true);
  const targetFirst = runLiveTheoryInteraction(false);

  assert(
    generatorFirst.signature !== targetFirst.signature,
    "live-Theory interacting one-step successor depends on member schedule",
  );
  same(generatorFirst.matchedRelations, 2,
    "generator-first activates target in same reaction");
  same(targetFirst.matchedRelations, 1,
    "target-first cannot use later admission in same reaction");

  assert(generatorFirst.admissionCurrent,
    "generator-first publishes generated admission");
  assert(targetFirst.admissionCurrent,
    "target-first publishes generated admission");

  assert(generatorFirst.KBcurrent && !generatorFirst.KAcurrent,
    "generator-first target advances immediately");
  assert(!targetFirst.KBcurrent && targetFirst.KAcurrent,
    "target-first target is preserved until a later reaction");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");

  const a73k = readFileSync(
    join(
      root,
      "ts/test/research-v013-self-activation-schedule-invariance-a73k.test.ts",
    ),
    "utf8",
  );
  assert(
    a73k.includes("GENERATOR_FIRST_MATCHES=2_0"),
    "A73k generator-first temporal schedule retained",
  );
  assert(
    a73k.includes("TARGET_FIRST_MATCHES=1_1_0"),
    "A73k target-first temporal schedule retained",
  );
  assert(
    a73k.includes("FINAL_EXTENTIONAL_FIXED_POINT=SAME"),
    "A73k eventual fixed-point convergence retained",
  );

  const production = readFileSync(
    join(root, "ts/src/v013-grounded-execution.ts"),
    "utf8",
  );
  assert(
    production.includes("memory.outgoing(theory)"),
    "production relation discovery observes live Theory frontier",
  );
  assert(
    production.includes(
      "generated Theory admissions are visible through live Memory",
    ),
    "production documents same-reaction live-Memory visibility",
  );

  const e2 = readFileSync(
    join(
      root,
      "ts/test/research-post-v013-amemory-transition-e2-w2-w3.test.ts",
    ),
    "utf8",
  );
  assert(
    e2.includes("E2_LOCAL_CLASSIFICATION=V013_SUFFICIENT"),
    "E2 elementary-transition result remains retained",
  );
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "POST_V013_1558_E3_W4_W5=GREEN_WITH_BOUNDARY",
    "W4_STATIC_AUTHORITY_ONE_STEP_SCHEDULE_INDEPENDENT=TRUE",
    "W5_LIVE_THEORY_ONE_STEP_SCHEDULE_INDEPENDENT=FALSE",
    "GENERATOR_FIRST_SAME_REACTION_ACTIVATION=TRUE",
    "TARGET_FIRST_REQUIRES_LATER_REACTION=TRUE",
    "A73K_EVENTUAL_FIXED_POINT_SAME=RETAINED",
    "FIXED_POINT_EQUALITY_DOES_NOT_IMPLY_TRAJECTORY_EQUALITY=TRUE",
    "THREAD_WORKGROUP_GPU_ORDER_AS_SEMANTIC_LAW=REJECTED",
    "GENERAL_CONCURRENCY_PUBLICATION_BOUNDARY=REQUIRED",
    "E4_THEORY_VISIBILITY_DECISION=BLOCKING_NEXT_STEP",
    "E3_LOCAL_CLASSIFICATION=V013_INCOMPLETE_FOR_GENERAL_ONE_STEP_CONCURRENCY",
    "ISSUE_1558_GLOBAL_CLASSIFICATION=OPEN",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
