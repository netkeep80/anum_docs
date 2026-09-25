import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  V013GroundedScopeCursor,
  defineV013GroundedExecutionScope,
  readV013GroundedExecutionScopeAuthority,
  reactV013GroundedScope,
} from "../src/v013-grounded-execution.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error("post-v0.13 #1558 E4 Theory visibility: " + message);
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

interface Fixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly K: LinkHandle;
  readonly A: LinkHandle;
  readonly B: LinkHandle;
  readonly BOOT: LinkHandle;
  readonly candidate: LinkHandle;
  readonly generator: LinkHandle;
  readonly target: LinkHandle;
  readonly seed0: LinkHandle;
  readonly seed1: LinkHandle;
  readonly seed2: LinkHandle;
  readonly seed3: LinkHandle;
}

function buildFixture(generatorFirst: boolean): {
  readonly fixture: Fixture;
  readonly cursor: V013GroundedScopeCursor;
} {
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
  const BOOT = memory.ensure(at(2), at(3));
  const A = memory.ensure(at(4), at(5));
  const B = memory.ensure(at(6), at(7));
  const K = memory.ensure(at(8), at(9));

  // The candidate relation exists physically, but its Theory admission does not.
  const candidate =
    memory.ensure(A, materializeExactSequence(memory, [B]));

  // BOOT emits the candidate relation as a contextual output under K=Theory,
  // thereby materializing Theory -> candidate during execution.
  admit(memory, theory, BOOT, [candidate]);

  const generator = memory.ensure(theory, BOOT);
  const target = memory.ensure(K, A);
  const initial = generatorFirst
    ? [generator, target]
    : [target, generator];

  const seed0 = at(20);
  const seed1 = at(21);
  const seed2 = at(22);
  const seed3 = at(23);

  const cursor = new V013GroundedScopeCursor(
    memory,
    defineV013GroundedExecutionScope(memory, seed0, theory, initial),
  );

  same(
    memory.find(theory, candidate),
    undefined,
    "candidate admission is absent from logical pre-state",
  );

  return Object.freeze({
    fixture: Object.freeze({
      memory,
      theory,
      K,
      A,
      B,
      BOOT,
      candidate,
      generator,
      target,
      seed0,
      seed1,
      seed2,
      seed3,
    }),
    cursor,
  });
}

interface SnapshotImage {
  readonly relation: LinkHandle;
  readonly outputs: readonly LinkHandle[];
}

/**
 * Execution-profile candidate:
 *
 *   TheorySnapshot_t = admitted grounded relations visible at reaction start
 *
 * All current truths in one logical reaction use exactly this frozen frontier.
 * Writes may materialize during candidate generation, but newly created
 * admissions join only TheorySnapshot_(t+1).
 *
 * The readonly array is only this test implementation's snapshot carrier.
 * It is not an MTS Set/List primitive and its order has no authority.
 */
function snapshotTheoryFrontier(
  memory: Memory,
  theory: LinkHandle,
): readonly LinkHandle[] {
  return Object.freeze([...memory.outgoing(theory)]);
}

function discoverSnapshotImages(
  memory: Memory,
  theory: LinkHandle,
  snapshot: readonly LinkHandle[],
  antecedent: LinkHandle,
): readonly SnapshotImage[] {
  const found: SnapshotImage[] = [];

  for (const admission of snapshot) {
    if (admission === theory) continue;
    const ap = memory.poles(admission);
    if (ap.start !== theory || ap.end === admission) continue;

    const relation = ap.end;
    const rp = memory.poles(relation);
    if (rp.start !== antecedent) continue;

    try {
      found.push(Object.freeze({
        relation,
        outputs: readExactSequence(memory, rp.end).values,
      }));
    } catch (error) {
      if (error instanceof ExactSequenceError) continue;
      throw error;
    }
  }

  return Object.freeze(found);
}

interface SnapshotReaction {
  readonly matchedRelations: number;
  readonly transitionedMembers: number;
  readonly quiescent: boolean;
  readonly handoffCount: 0 | 1;
}

function reactSnapshotTheoryScope(
  memory: Memory,
  cursor: V013GroundedScopeCursor,
  nextScopeSeed: LinkHandle,
): SnapshotReaction {
  const oldScope = cursor.currentScope();
  const { theory } = readV013GroundedExecutionScopeAuthority(memory, oldScope);
  const before = cursor.members();

  // The profile boundary is taken once, before any member can materialize a
  // new Theory admission.
  const theorySnapshot = snapshotTheoryFrontier(memory, theory);

  const after: LinkHandle[] = [];
  const add = (link: LinkHandle): void => {
    if (!after.includes(link)) after.push(link);
  };

  let matchedRelations = 0;
  let transitionedMembers = 0;

  for (const member of before) {
    const truth = memory.poles(member);
    const images =
      discoverSnapshotImages(memory, theory, theorySnapshot, truth.end);

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
      matchedRelations,
      transitionedMembers,
      quiescent: true,
      handoffCount: 0,
    });
  }

  const nextScope = defineV013GroundedExecutionScope(
    memory,
    nextScopeSeed,
    theory,
    after,
  );
  cursor.switchAtomically(oldScope, nextScope);

  return Object.freeze({
    matchedRelations,
    transitionedMembers,
    quiescent: false,
    handoffCount: 1,
  });
}

interface StepSignature {
  readonly matches: number;
  readonly admissionCurrent: boolean;
  readonly KAcurrent: boolean;
  readonly KBcurrent: boolean;
  readonly quiescent: boolean;
}

function signature(
  f: Fixture,
  cursor: V013GroundedScopeCursor,
  matchedRelations: number,
  quiescent: boolean,
): StepSignature {
  const admission = f.memory.find(f.theory, f.candidate);
  const KA = f.memory.ensure(f.K, f.A);
  const KB = f.memory.ensure(f.K, f.B);
  const members = cursor.members();

  return Object.freeze({
    matches: matchedRelations,
    admissionCurrent:
      admission !== undefined && members.includes(admission),
    KAcurrent: members.includes(KA),
    KBcurrent: members.includes(KB),
    quiescent,
  });
}

function runSnapshotTrajectory(generatorFirst: boolean): readonly StepSignature[] {
  const { fixture: f, cursor } = buildFixture(generatorFirst);

  const r1 = reactSnapshotTheoryScope(f.memory, cursor, f.seed1);
  const s1 = signature(f, cursor, r1.matchedRelations, r1.quiescent);

  const admissionAfterFirst = f.memory.find(f.theory, f.candidate);
  assert(
    admissionAfterFirst !== undefined,
    "first reaction physically materializes candidate Theory admission",
  );
  assert(
    s1.admissionCurrent,
    "generated admission is a current successor truth",
  );
  assert(
    s1.KAcurrent && !s1.KBcurrent,
    "target cannot observe admission created after Theory snapshot",
  );

  const r2 = reactSnapshotTheoryScope(f.memory, cursor, f.seed2);
  const s2 = signature(f, cursor, r2.matchedRelations, r2.quiescent);
  assert(
    s2.KBcurrent && !s2.KAcurrent,
    "next logical reaction observes previously published Theory admission",
  );

  const r3 = reactSnapshotTheoryScope(f.memory, cursor, f.seed3);
  const s3 = signature(f, cursor, r3.matchedRelations, r3.quiescent);
  assert(s3.quiescent, "third call observes fixed point");

  return Object.freeze([s1, s2, s3]);
}

function runAcceptedLiveFirstStep(generatorFirst: boolean): StepSignature {
  const { fixture: f, cursor } = buildFixture(generatorFirst);
  const reaction = reactV013GroundedScope(f.memory, cursor, f.seed1);
  return signature(f, cursor, reaction.matchedRelations, reaction.quiescent);
}

function exercise(): void {
  // Control: accepted production implementation is intentionally live and E3
  // already proved that its immediate successor depends on member order.
  const liveGeneratorFirst = runAcceptedLiveFirstStep(true);
  const liveTargetFirst = runAcceptedLiveFirstStep(false);
  assert(
    JSON.stringify(liveGeneratorFirst) !== JSON.stringify(liveTargetFirst),
    "live same-reaction Theory visibility remains schedule-dependent control",
  );
  same(liveGeneratorFirst.matches, 2,
    "live generator-first sees new admission in same reaction");
  same(liveTargetFirst.matches, 1,
    "live target-first cannot see later admission");

  // Candidate profile: one logical reaction uses one Theory snapshot.
  const snapshotGeneratorFirst = runSnapshotTrajectory(true);
  const snapshotTargetFirst = runSnapshotTrajectory(false);

  same(
    JSON.stringify(snapshotGeneratorFirst),
    JSON.stringify(snapshotTargetFirst),
    "snapshot profile gives schedule-independent semantic trajectory",
  );

  same(snapshotGeneratorFirst[0]!.matches, 1,
    "first snapshot reaction executes only pre-state admission");
  assert(snapshotGeneratorFirst[0]!.KAcurrent,
    "target is preserved in first snapshot successor");
  assert(!snapshotGeneratorFirst[0]!.KBcurrent,
    "new admission is not visible within same logical reaction");

  same(snapshotGeneratorFirst[1]!.matches, 1,
    "second snapshot reaction executes newly visible target relation");
  assert(snapshotGeneratorFirst[1]!.KBcurrent,
    "target advances on next logical reaction");

  same(snapshotGeneratorFirst[2]!.matches, 0,
    "third snapshot reaction is quiescent");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");

  const e3 = readFileSync(
    join(
      root,
      "ts/test/research-post-v013-amemory-concurrency-e3-w4-w5.test.ts",
    ),
    "utf8",
  );
  assert(
    e3.includes("W5_LIVE_THEORY_ONE_STEP_SCHEDULE_INDEPENDENT=FALSE"),
    "E3 W5 schedule-dependence boundary remains retained",
  );
  assert(
    e3.includes("E4_THEORY_VISIBILITY_DECISION=BLOCKING_NEXT_STEP"),
    "E4 is exact next blocker from E3",
  );

  const production = readFileSync(
    join(root, "ts/src/v013-grounded-execution.ts"),
    "utf8",
  );
  assert(
    production.includes(
      "generated Theory admissions are visible through live Memory",
    ),
    "accepted production live-visibility behavior is unchanged",
  );

  const contract = readFileSync(
    join(root, "contracts/mts-contract-v0.13.json"),
    "utf8",
  );
  assert(
    !contract.includes("sameReactionTheoryVisibility"),
    "accepted v0.13 contract does not prescribe a same-reaction visibility law",
  );
  assert(
    !contract.includes("theorySnapshot"),
    "accepted v0.13 contract does not prescribe a Theory snapshot profile",
  );
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "POST_V013_1558_E4=GREEN_PROFILE_CLASSIFICATION",
    "ACCEPTED_LIVE_SAME_REACTION_VISIBILITY_SCHEDULE_INDEPENDENT=FALSE",
    "REACTION_START_THEORY_SNAPSHOT_SCHEDULE_INDEPENDENT=TRUE",
    "NEW_ADMISSION_PHYSICALLY_MATERIALIZED_IMMEDIATELY=TRUE",
    "NEW_ADMISSION_EXECUTABLE_SAME_LOGICAL_REACTION=FALSE",
    "NEW_ADMISSION_EXECUTABLE_NEXT_LOGICAL_REACTION=TRUE",
    "THREAD_WORKGROUP_GPU_ORDER_AS_AUTHORITY=FALSE",
    "NEW_MTS_ONTOLOGY_PRIMITIVE_REQUIRED=FALSE",
    "E4_CLASSIFICATION=V013_PLUS_EXECUTION_PROFILE",
    "V013_SUFFICIENT_GLOBAL_CANDIDATE=ELIMINATED",
    "SEMANTIC_EXTENSION_REQUIRED=NOT_ESTABLISHED",
    "ISSUE_1558_REMAINING_E5_E6_E7=OPEN",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
