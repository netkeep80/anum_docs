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
  readV013GroundedExecutionScopeAuthority,
  type V013GroundedRelationImage,
} from "../src/v013-grounded-execution.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error("post-v0.13 #1558 E4 Theory snapshot profile: " + message);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}

function sameSet(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, message + ": cardinality");
  for (const item of expected) {
    assert(actual.includes(item), message + ": missing member");
  }
}

interface SnapshotReaction {
  readonly oldScope: LinkHandle;
  readonly nextScope: LinkHandle;
  readonly before: readonly LinkHandle[];
  readonly after: readonly LinkHandle[];
  readonly matchedRelations: number;
  readonly transitionedMembers: number;
  readonly quiescent: boolean;
  readonly handoffCount: 0 | 1;
}

/**
 * Candidate post-v0.13 A-memory execution profile.
 *
 * The current Scope membership and the executable Theory frontier are observed
 * before any member of this logical reaction is allowed to write candidates.
 * Physical writes may happen during candidate generation, but they cannot
 * change relation visibility until the next logical reaction snapshot.
 */
function reactWithTheorySnapshot(
  memory: Memory,
  cursor: V013GroundedScopeCursor,
  nextScopeSeed: LinkHandle,
): SnapshotReaction {
  const oldScope = cursor.currentScope();
  const { theory } =
    readV013GroundedExecutionScopeAuthority(memory, oldScope);
  const before = cursor.members();

  const imagesByAntecedent =
    new Map<LinkHandle, readonly V013GroundedRelationImage[]>();
  for (const member of before) {
    const truth = memory.poles(member);
    if (!imagesByAntecedent.has(truth.end)) {
      imagesByAntecedent.set(
        truth.end,
        discoverV013GroundedTheoryImages(memory, theory, truth.end),
      );
    }
  }

  const after: LinkHandle[] = [];
  const add = (link: LinkHandle): void => {
    if (!after.includes(link)) after.push(link);
  };

  let matchedRelations = 0;
  let transitionedMembers = 0;

  for (const member of before) {
    const truth = memory.poles(member);
    const images = imagesByAntecedent.get(truth.end) ?? Object.freeze([]);

    if (images.length === 0) {
      add(member);
      continue;
    }

    transitionedMembers += 1;
    matchedRelations += images.length;
    for (const image of images) {
      for (const output of image.outputs) {
        add(memory.ensure(truth.start, output));
      }
    }
  }

  if (matchedRelations === 0) {
    return Object.freeze({
      oldScope,
      nextScope: oldScope,
      before,
      after: before,
      matchedRelations,
      transitionedMembers,
      quiescent: true,
      handoffCount: 0,
    });
  }

  const nextScope =
    defineV013GroundedExecutionScope(memory, nextScopeSeed, theory, after);
  cursor.switchAtomically(oldScope, nextScope);

  return Object.freeze({
    oldScope,
    nextScope,
    before,
    after: Object.freeze(after),
    matchedRelations,
    transitionedMembers,
    quiescent: false,
    handoffCount: 1,
  });
}

interface Outcome {
  readonly first: string;
  readonly second: string;
  readonly third: string;
  readonly firstMatches: number;
  readonly secondMatches: number;
  readonly thirdMatches: number;
  readonly admissionPhysicallyExistsAfterFirst: boolean;
}

function run(generatorFirst: boolean): Outcome {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  let seed = memory.ensure(basis.U, basis.L);
  const refs: LinkHandle[] = [];
  for (let i = 0; i < 96; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? basis.O : basis.C);
    refs.push(seed);
  }
  const at = (index: number): LinkHandle => {
    const value = refs[index];
    assert(value !== undefined, "fresh anchor " + index);
    return value;
  };

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
    "candidate admission absent from reaction-0 Theory frontier",
  );

  const signature = (): string => {
    const admission = memory.find(theory, candidate);
    const KA = memory.ensure(K, A);
    const KB = memory.ensure(K, B);
    const members = cursor.members();
    return JSON.stringify({
      count: members.length,
      admission: admission !== undefined && members.includes(admission),
      KA: members.includes(KA),
      KB: members.includes(KB),
    });
  };

  const r1 = reactWithTheorySnapshot(memory, cursor, at(21));
  const admission = memory.find(theory, candidate);
  assert(admission !== undefined,
    "reaction 1 physically materializes Theory -> candidate");
  const first = signature();

  // The admission physically exists now, but it was not in the frozen
  // reaction-0 Theory frontier. Therefore K->A is preserved in state 1.
  sameSet(
    cursor.members(),
    [admission, target],
    "reaction 1 publishes generated admission plus preserved target",
  );
  same(r1.matchedRelations, 1, "reaction 1 sees bootstrap only");
  same(r1.transitionedMembers, 1, "reaction 1 transitions generator only");
  same(r1.handoffCount, 1, "reaction 1 publishes exactly once");

  const r2 = reactWithTheorySnapshot(memory, cursor, at(22));
  const KB = memory.ensure(K, B);
  const second = signature();
  sameSet(
    cursor.members(),
    [admission, KB],
    "reaction 2 sees published candidate admission and advances target",
  );
  same(r2.matchedRelations, 1, "reaction 2 sees generated candidate relation");
  same(r2.transitionedMembers, 1, "reaction 2 transitions target only");
  same(r2.handoffCount, 1, "reaction 2 publishes exactly once");

  const currentBeforeQuiescence = cursor.currentScope();
  const r3 = reactWithTheorySnapshot(memory, cursor, at(23));
  const third = signature();
  same(r3.matchedRelations, 0, "reaction 3 has no admitted continuation");
  same(r3.handoffCount, 0, "quiescent reaction does not republish");
  same(cursor.currentScope(), currentBeforeQuiescence,
    "quiescence preserves current Scope root");

  return Object.freeze({
    first,
    second,
    third,
    firstMatches: r1.matchedRelations,
    secondMatches: r2.matchedRelations,
    thirdMatches: r3.matchedRelations,
    admissionPhysicallyExistsAfterFirst: admission !== undefined,
  });
}

function exercise(): void {
  const generatorFirst = run(true);
  const targetFirst = run(false);

  same(
    generatorFirst.first,
    targetFirst.first,
    "snapshot profile gives schedule-independent first successor",
  );
  same(
    generatorFirst.second,
    targetFirst.second,
    "snapshot profile gives schedule-independent second successor",
  );
  same(
    generatorFirst.third,
    targetFirst.third,
    "snapshot profile gives schedule-independent quiescent state",
  );

  same(generatorFirst.firstMatches, 1, "generator-first first matches");
  same(targetFirst.firstMatches, 1, "target-first first matches");
  same(generatorFirst.secondMatches, 1, "generator-first second matches");
  same(targetFirst.secondMatches, 1, "target-first second matches");
  same(generatorFirst.thirdMatches, 0, "generator-first quiescent matches");
  same(targetFirst.thirdMatches, 0, "target-first quiescent matches");

  assert(
    generatorFirst.admissionPhysicallyExistsAfterFirst &&
      targetFirst.admissionPhysicallyExistsAfterFirst,
    "physical materialization precedes semantic visibility in both schedules",
  );
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");

  const production = readFileSync(
    join(root, "ts/src/v013-grounded-execution.ts"),
    "utf8",
  );
  assert(
    production.includes(
      "generated Theory admissions are visible through live Memory",
    ),
    "accepted v0.13 live-Memory executor remains unchanged",
  );

  const e3 = readFileSync(
    join(
      root,
      "ts/test/research-post-v013-amemory-concurrency-e3-w4-w5.test.ts",
    ),
    "utf8",
  );
  assert(
    e3.includes("W5_LIVE_THEORY_ONE_STEP_SCHEDULE_INDEPENDENT=FALSE"),
    "E3 live-Theory schedule-dependence boundary remains retained",
  );
  assert(
    e3.includes("A73K_EVENTUAL_FIXED_POINT_SAME=RETAINED"),
    "eventual fixed-point evidence remains distinct from trajectory semantics",
  );

  const own = readFileSync(
    join(
      root,
      "ts/test/research-post-v013-amemory-theory-publication-e4.test.ts",
    ),
    "utf8",
  );
  const implementation = own.slice(
    0,
    own.indexOf("function staticGuards(): void {"),
  );
  for (const forbidden of [
    "Date.now",
    "timestamp",
    "generationNumber",
    "allocationOrder",
    "setTimeout",
  ]) {
    assert(
      !implementation.includes(forbidden),
      "profile has no hidden temporal/order authority: " + forbidden,
    );
  }
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "POST_V013_1558_E4=GREEN",
    "EXECUTION_PROFILE=SYNCHRONOUS_THEORY_SNAPSHOT_PUBLICATION",
    "CURRENT_SCOPE_SNAPSHOT=REACTION_START",
    "THEORY_FRONTIER_SNAPSHOT=REACTION_START",
    "GENERATED_THEORY_ADMISSION_PHYSICAL_VISIBILITY=IMMEDIATE_ALLOWED",
    "GENERATED_THEORY_ADMISSION_SEMANTIC_VISIBILITY=NEXT_LOGICAL_REACTION",
    "GENERATOR_FIRST_TRAJECTORY_EQUALS_TARGET_FIRST=TRUE",
    "SAME_REACTION_LIVE_VISIBILITY_FOR_GENERAL_PROFILE=REJECTED",
    "CAUSAL_CLOSURE_INSIDE_ONE_REACTION=NOT_REQUIRED",
    "THREAD_WORKGROUP_GPU_ORDER_AS_SEMANTIC_LAW=FALSE",
    "V013_SUFFICIENT_GLOBAL_CANDIDATE=ELIMINATED",
    "V013_PLUS_EXECUTION_PROFILE=LEADING_CANDIDATE",
    "SEMANTIC_EXTENSION_REQUIRED=NOT_DEMONSTRATED",
    "ISSUE_1558_FINAL_CLASSIFICATION=OPEN",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
