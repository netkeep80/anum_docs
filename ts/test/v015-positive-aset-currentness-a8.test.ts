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
import {
  exportCanonicalTopology,
  type CanonicalTopologyExport,
} from "../src/canonical-topology.js";
import {
  restoreTopology,
  type StorageTopologyImage,
} from "../src/persistence-topology.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`v0.15 A8 positive Aset currentness: ${message}`);
  }
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function setSame<T>(
  actual: Iterable<T>,
  expected: Iterable<T>,
  message: string,
): void {
  const a = [...new Set(actual)];
  const e = [...new Set(expected)];
  same(a.length, e.length, `${message}: cardinality`);
  for (const value of e) assert(a.includes(value), `${message}: missing value`);
}

interface AsetState {
  readonly members: ReadonlySet<LinkHandle>;
}

/**
 * Test representation of semantic Aset membership.
 *
 * The Set is only an oracle representation of "which Links belong to M_t".
 * It is NOT a second MTS ontology entity and it is NOT an external current
 * pointer. The entire membership set is part of the A-memory state transformed
 * atomically by the generalized reaction.
 */
function aset(members: Iterable<LinkHandle>): AsetState {
  return Object.freeze({ members: new Set(members) });
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
    const p = memory.poles(candidate);
    if (p.start === R && p.end === candidate) found.push(candidate);
  }
  same(found.length, 1, "unique direct-gauge END boundary");
  return found[0]!;
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
    if (state === undefined) return cursor;
    cursor = state.parent;
  }
}

function readEnvironment(
  memory: ReadMemory,
  environment: LinkHandle,
): { readonly boundary: LinkHandle; readonly theory: LinkHandle } {
  const boundary = deriveEndBoundary(memory);
  const p = memory.poles(environment);
  assert(
    p.start === boundary && p.end !== environment,
    "environment must be ordinary C->Theory",
  );
  return Object.freeze({ boundary, theory: p.end });
}

interface ActiveMembership {
  readonly edge: LinkHandle;
  readonly environment: LinkHandle;
  readonly context: LinkHandle;
  readonly truth: LinkHandle;
  readonly theory: LinkHandle;
}

/**
 * Positive currentness only:
 *
 *   environment E = C -> Theory       is a member of M_t
 *   Context K                         is a member of M_t
 *   contextual truth X -> A           is a member of M_t
 *   active membership E -> K          is a member of M_t
 *
 * No "latest", no no-child/no-END test, no current pointer.
 */
function activeMemberships(
  memory: ReadMemory,
  state: AsetState,
): readonly ActiveMembership[] {
  const active: ActiveMembership[] = [];

  for (const edge of state.members) {
    const p = memory.poles(edge);
    const context = p.end;
    const contextState = contextOrUndefined(memory, context);
    if (contextState === undefined) continue;

    const environment = p.start;
    if (rootEnvironmentOf(memory, context) !== environment) continue;

    let theory: LinkHandle;
    try {
      theory = readEnvironment(memory, environment).theory;
    } catch {
      continue;
    }

    // Currentness is witnessed entirely by positive membership.
    if (!state.members.has(environment)) continue;
    if (!state.members.has(context)) continue;
    if (!state.members.has(contextState.current)) continue;

    active.push(Object.freeze({
      edge,
      environment,
      context,
      truth: contextState.current,
      theory,
    }));
  }

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
function admission(
  memory: Memory,
  theory: LinkHandle,
  relationValue: LinkHandle,
): LinkHandle {
  return memory.ensure(theory, relationValue);
}

interface SnapshotRelation {
  readonly antecedent: LinkHandle;
  readonly outputs: readonly LinkHandle[];
}

/**
 * Theory authority is also Aset membership, not physical presence.
 */
function theorySnapshot(
  memory: ReadMemory,
  state: AsetState,
  theory: LinkHandle,
): readonly SnapshotRelation[] {
  const result: SnapshotRelation[] = [];

  for (const member of state.members) {
    const ap = memory.poles(member);
    if (ap.start !== theory || ap.end === member) continue;
    const relationValue = ap.end;
    const rp = memory.poles(relationValue);

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

interface PlannedActive {
  readonly active: ActiveMembership;
  readonly matches: number;
  readonly outputs: readonly LinkHandle[];
}

function plan(
  memory: ReadMemory,
  state: AsetState,
): readonly PlannedActive[] {
  const current = activeMemberships(memory, state);
  const snapshots = new Map<LinkHandle, readonly SnapshotRelation[]>();

  for (const item of current) {
    if (!snapshots.has(item.theory)) {
      snapshots.set(item.theory, theorySnapshot(memory, state, item.theory));
    }
  }

  const result: PlannedActive[] = [];
  for (const item of current) {
    const truth = memory.poles(item.truth);
    const relations = snapshots.get(item.theory);
    assert(relations !== undefined, "Theory snapshot available");

    const matched = relations.filter((r) => r.antecedent === truth.end);
    const outputs: LinkHandle[] = [];
    for (const r of matched) {
      for (const output of r.outputs) {
        if (!outputs.includes(output)) outputs.push(output);
      }
    }

    result.push(Object.freeze({
      active: item,
      matches: matched.length,
      outputs: Object.freeze(outputs),
    }));
  }

  return Object.freeze(result);
}

interface Reaction {
  readonly before: AsetState;
  readonly after: AsetState;
  readonly matchedRelations: number;
  readonly transitioned: number;
  readonly noMatch: number;
  readonly zero: number;
  readonly positive: number;
}

/**
 * Atomic semantic Aset rewrite.
 *
 * Matched current Context membership is removed from M_t and replaced by the
 * complete successor membership in M_(t+1). Physical canonical Links may stay
 * allocated in Memory; physical existence does not make them members of M_(t+1).
 */
function react(
  memory: Memory,
  before: AsetState,
): Reaction {
  const beforeCount = memory.linkCount;
  const planned = plan(memory, before);
  same(memory.linkCount, beforeCount, "planning is read-only");

  const next = new Set(before.members);
  let matchedRelations = 0;
  let transitioned = 0;
  let noMatch = 0;
  let zero = 0;
  let positive = 0;

  for (const item of planned) {
    if (item.matches === 0) {
      noMatch += 1;
      continue;
    }

    transitioned += 1;
    matchedRelations += item.matches;

    // Only the positive currentness witness leaves semantic membership.
    // Context/truth Links may simultaneously carry unrelated semantic roles
    // (One-Link ontology), so deactivation must not delete those memberships.
    next.delete(item.active.edge);

    if (item.outputs.length === 0) {
      const closure = memory.ensureEndSelfClosed(item.active.context);
      next.add(closure);
      zero += 1;
      continue;
    }

    positive += 1;
    const truth = memory.poles(item.active.truth);
    for (const output of item.outputs) {
      const nextTruth = memory.ensure(truth.start, output);
      const child = defineContext(memory, item.active.context, nextTruth);
      const activeEdge = memory.ensure(item.active.environment, child);

      // Complete successor membership is staged before the returned Aset state
      // becomes observable to the next reaction.
      next.add(nextTruth);
      next.add(child);
      next.add(activeEdge);
    }
  }

  return Object.freeze({
    before,
    after: aset(next),
    matchedRelations,
    transitioned,
    noMatch,
    zero,
    positive,
  });
}

function currentTruths(
  memory: ReadMemory,
  state: AsetState,
): readonly LinkHandle[] {
  return Object.freeze(activeMemberships(memory, state).map((x) => x.truth));
}

interface FrozenAsetImage {
  readonly topology: StorageTopologyImage;
  readonly memberCoordinates: readonly number[];
}

function freeze(
  memory: Memory,
  state: AsetState,
): FrozenAsetImage {
  const canonical = exportCanonicalTopology(memory);
  const memberCoordinates = [...state.members].map((member) => {
    const coordinate = canonical.coordinates.get(member);
    assert(coordinate !== undefined, "Aset member has canonical coordinate");
    return coordinate;
  }).sort((a, b) => a - b);

  return Object.freeze({
    topology: canonical.topology,
    memberCoordinates: Object.freeze(memberCoordinates),
  });
}

function transfer(image: FrozenAsetImage): FrozenAsetImage {
  return JSON.parse(JSON.stringify(image)) as FrozenAsetImage;
}

function restore(
  image: FrozenAsetImage,
): { readonly memory: Memory; readonly state: AsetState } {
  const memory = restoreTopology(image.topology);
  const canonical = exportCanonicalTopology(memory);
  const byCoordinate = new Map<number, LinkHandle>();
  for (const [handle, coordinate] of canonical.coordinates) {
    byCoordinate.set(coordinate, handle);
  }

  const members = image.memberCoordinates.map((coordinate) => {
    const handle = byCoordinate.get(coordinate);
    assert(handle !== undefined, "frozen Aset member coordinate restores");
    return handle;
  });

  return Object.freeze({ memory, state: aset(members) });
}

function run(reverseEntryCreation: boolean): {
  readonly finalTopology: string;
  readonly finalMemberCoordinates: string;
  readonly stats: string;
} {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 140; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const value = fresh[i];
    assert(value !== undefined, `fresh anchor ${i}`);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));
  const environment = memory.ensure(b.C, theory);

  const ANo = memory.ensure(at(10), at(11));
  const AZero = memory.ensure(at(12), at(13));
  const AOne = memory.ensure(at(14), at(15));
  const AMany = memory.ensure(at(16), at(17));
  const BOne = memory.ensure(at(20), at(21));
  const BMany1 = memory.ensure(at(22), at(23));
  const BMany2 = memory.ensure(at(24), at(25));
  const BOverlap = memory.ensure(at(26), at(27));

  const relZero = relation(memory, AZero, []);
  const relOne = relation(memory, AOne, [BOne]);
  const relMany = relation(memory, AMany, [BMany1, BMany2]);
  // This relation consumes relOne itself. Its active current truth below is
  // exactly the already-admitted Link Theory->relOne, exercising One-Link
  // role overlap: current truth and Theory admission are the same Link.
  const relOverlap = relation(memory, relOne, [BOverlap]);
  const admissions = [
    admission(memory, theory, relZero),
    admission(memory, theory, relOne),
    admission(memory, theory, relMany),
    admission(memory, theory, relOverlap),
  ] as const;

  const callers = [
    memory.ensure(at(30), at(31)),
    memory.ensure(at(32), at(33)),
    memory.ensure(at(34), at(35)),
    memory.ensure(at(36), at(37)),
  ] as const;
  const truths = [
    memory.ensure(callers[0], ANo),
    memory.ensure(callers[1], AZero),
    memory.ensure(callers[2], AOne),
    memory.ensure(callers[3], AMany),
    // One Link, two simultaneous roles:
    // - Theory admission for relOne;
    // - active contextual truth whose K happens to be Theory.
    admissions[1],
  ] as const;

  const createdSlots: Array<{
    readonly truth: LinkHandle;
    readonly context: LinkHandle;
    readonly activeEdge: LinkHandle;
  } | undefined> = new Array(truths.length);
  const creationOrder = reverseEntryCreation
    ? [4, 3, 2, 1, 0] as const
    : [0, 1, 2, 3, 4] as const;
  for (const index of creationOrder) {
    const truth = truths[index]!;
    const context = defineContext(memory, environment, truth);
    const activeEdge = memory.ensure(environment, context);
    createdSlots[index] = Object.freeze({ truth, context, activeEdge });
  }
  const created = createdSlots.map((item, index) => {
    assert(item !== undefined, `created semantic slot ${index}`);
    return item;
  });

  const members = new Set<LinkHandle>([
    environment,
    ...admissions,
  ]);
  for (const index of creationOrder) {
    const item = created[index]!;
    members.add(item.truth);
    members.add(item.context);
    members.add(item.activeEdge);
  }
  const initial = aset(members);

  same(activeMemberships(memory, initial).length, 5,
    "five positive active memberships");
  setSame(currentTruths(memory, initial), truths, "initial current truths");

  // Physical stale topology must not override positive Aset membership.
  const staleChildTruth = memory.ensure(callers[0], BOne);
  const staleChild = defineContext(memory, created[0]!.context, staleChildTruth);
  assert(
    !initial.members.has(staleChild),
    "physically existing child is not current without Aset membership",
  );
  assert(
    activeMemberships(memory, initial).some(
      (x) => x.context === created[0]!.context,
    ),
    "NO_MATCH parent remains positively current despite physical stale child",
  );

  const first = react(memory, initial);
  same(first.matchedRelations, 4, "ZERO/ONE/MANY/role-overlap relations all match");
  same(first.transitioned, 4, "four of five active Contexts transition");
  same(first.noMatch, 1, "one NO_MATCH Context");
  same(first.zero, 1, "one ZERO Context");
  same(first.positive, 3, "ONE/MANY/role-overlap are positive");

  const expected = [
    truths[0],
    memory.find(callers[2], BOne)!,
    memory.find(callers[3], BMany1)!,
    memory.find(callers[3], BMany2)!,
    memory.find(theory, BOverlap)!,
  ];
  for (const truth of expected) assert(truth !== undefined, "expected truth exists");
  setSame(currentTruths(memory, first.after), expected,
    "positive Aset currentness yields exact generalized successor");

  // Old physical active edges still exist in the canonical carrier, but three
  // transitioned edges are no longer semantic members.
  same(
    created.filter((x) => memory.find(environment, x.context) !== undefined).length,
    5,
    "all original active-edge Links remain physically allocated",
  );
  same(
    created.filter((x) => first.after.members.has(x.activeEdge)).length,
    1,
    "only NO_MATCH old active edge remains in semantic Aset membership",
  );
  assert(first.after.members.has(created[0]!.activeEdge),
    "NO_MATCH preserves positive current membership");
  assert(!first.after.members.has(created[1]!.activeEdge),
    "ZERO removes old current membership");
  assert(!first.after.members.has(created[2]!.activeEdge),
    "ONE replaces old current membership");
  assert(!first.after.members.has(created[3]!.activeEdge),
    "MANY replaces old current membership");
  assert(!first.after.members.has(created[4]!.activeEdge),
    "role-overlap currentness witness is removed");
  assert(first.after.members.has(admissions[1]),
    "deactivation preserves the same Link in its independent Theory-admission role");
  assert(
    theorySnapshot(memory, first.after, theory).some(
      (item) => item.antecedent === AOne && item.outputs.includes(BOne),
    ),
    "role-overlap Theory admission remains authoritative after currentness moves",
  );

  // Freeze/transfer/restore includes the whole Aset membership, not a pointer.
  const frozen = transfer(freeze(memory, first.after));
  const restored = restore(frozen);
  setSame(
    freeze(restored.memory, restored.state).memberCoordinates,
    frozen.memberCoordinates,
    "whole Aset membership survives transfer",
  );
  setSame(
    currentTruths(restored.memory, restored.state).map((truth) => {
      const c = exportCanonicalTopology(restored.memory).coordinates.get(truth);
      assert(c !== undefined, "restored current truth coordinate");
      return c;
    }),
    currentTruths(memory, first.after).map((truth) => {
      const c = exportCanonicalTopology(memory).coordinates.get(truth);
      assert(c !== undefined, "sender current truth coordinate");
      return c;
    }),
    "current truths reconstruct after transfer without current pointer",
  );

  const second = react(restored.memory, restored.state);
  same(second.matchedRelations, 0, "restored successor reaches quiescence");
  setSame(
    currentTruths(restored.memory, second.after),
    currentTruths(restored.memory, restored.state),
    "quiescence preserves positive current membership",
  );

  const final = exportCanonicalTopology(restored.memory);
  const memberCoordinates = [...second.after.members].map((member) => {
    const coordinate = final.coordinates.get(member);
    assert(coordinate !== undefined, "final member coordinate");
    return coordinate;
  }).sort((a, b) => a - b);

  return Object.freeze({
    finalTopology: JSON.stringify(final.topology),
    finalMemberCoordinates: JSON.stringify(memberCoordinates),
    stats: [
      first.matchedRelations,
      first.transitioned,
      first.noMatch,
      first.zero,
      first.positive,
    ].join(","),
  });
}

function staticGuards(): void {
  const own = readFileSync(
    resolve(process.cwd(), "test/v015-positive-aset-currentness-a8.test.ts"),
    "utf8",
  );

  const activeStart = own.indexOf("function activeMemberships(");
  const activeEnd = own.indexOf("\nfunction relation(", activeStart);
  assert(activeStart >= 0 && activeEnd > activeStart, "active-membership source slice");
  const active = own.slice(activeStart, activeEnd);

  for (const forbidden of [
    ".outgoing(",
    ".incoming(",
    "closureOf(",
    "childContexts(",
    "currentScope",
    "selectedEntry",
    "programCounter",
    "Date",
    "timestamp",
  ]) {
    assert(!active.includes(forbidden),
      `positive currentness excludes absence/order/external authority: ${forbidden}`);
  }
  assert(active.includes("state.members.has(environment)"),
    "environment must be in semantic Aset membership");
  assert(active.includes("state.members.has(context)"),
    "Context must be in semantic Aset membership");
  assert(active.includes("state.members.has(contextState.current)"),
    "contextual truth must be in semantic Aset membership");

  const reactionStart = own.indexOf("function react(");
  const reactionEnd = own.indexOf("\nfunction currentTruths(", reactionStart);
  const reaction = own.slice(reactionStart, reactionEnd);
  assert(reaction.includes("next.delete(item.active.edge)"),
    "reaction removes transitioned currentness witness");
  assert(!reaction.includes("next.delete(item.active.context)"),
    "reaction does not delete Context membership merely to deactivate it");
  assert(!reaction.includes("next.delete(item.active.truth)"),
    "reaction does not delete overlapping truth/authority membership");
  assert(reaction.includes("next.add(activeEdge)"),
    "reaction adds successor current membership");
  assert(reaction.includes("const planned = plan(memory, before)"),
    "complete plan captured before publication");
  for (const forbidden of [
    "switchAtomically",
    "CurrentScopeCursor",
    "activeFrontier",
    "no child",
    "no END",
  ]) {
    assert(!reaction.includes(forbidden),
      `reaction excludes old pointer/negative frontier semantics: ${forbidden}`);
  }
}

function main(): void {
  const forward = run(false);
  const reverse = run(true);

  same(forward.stats, "4,4,1,1,3", "forward reaction statistics");
  same(reverse.stats, "4,4,1,1,3", "reverse reaction statistics");
  same(forward.finalTopology, reverse.finalTopology,
    "entry construction order does not change final canonical carrier");
  same(forward.finalMemberCoordinates, reverse.finalMemberCoordinates,
    "entry construction order does not change final semantic Aset membership");

  staticGuards();

  console.log([
    "MTS v0.15 A8: POSITIVE_ASET_CURRENTNESS=GREEN_RESEARCH",
    "CURRENTNESS=POSITIVE_ASET_MEMBERSHIP",
    "ACTIVE_WITNESS=ENVIRONMENT_TO_CONTEXT_MEMBER",
    "CONTEXT=TEMPORARY_EXECUTION_SCAFFOLD_NOT_HISTORY",
    "NO_NEGATIVE_LEAF_TEST_REQUIRED=TRUE",
    "EXTERNAL_CURRENT_POINTER=0",
    "EXTERNAL_SCOPE_POINTER=0",
    "APPEND_ONLY_PHYSICAL_LINK_PRESENCE_IS_CURRENTNESS_AUTHORITY=FALSE",
    "REACTION_ATOMICALLY_REPLACES_SEMANTIC_MEMBERSHIP=TRUE",
    "CURRENTNESS_WITNESS_REMOVAL_PRESERVES_OVERLAPPING_LINK_ROLES=TRUE",
    "NO_MATCH=PRESERVE_ACTIVE_MEMBERSHIP",
    "ZERO=REMOVE_ACTIVE_MEMBERSHIP_PLUS_END_CLOSURE",
    "ONE_MANY=REPLACE_WITH_SUCCESSOR_ACTIVE_MEMBERSHIPS",
    "THEORY_AUTHORITY=ASET_MEMBERSHIP",
    "FREEZE_TRANSFER_RESTORE_INCLUDES_ASET_MEMBERSHIP=GREEN",
    "CURRENT_TRUTHS_RECONSTRUCT_WITHOUT_POINTER=TRUE",
    "HOST_SET=TEST_ORACLE_REPRESENTATION_NOT_ONTOLOGY",
    "PHYSICAL_MEMBERSHIP_STORAGE_LAYOUT=IMPLEMENTATION_BOUNDARY",
    "FULL_SELF_HOSTED_META_GROUNDING=NOT_YET_PROVEN",
    "ACCEPTED_V014_UNCHANGED",
  ].join(" "));
}

main();
