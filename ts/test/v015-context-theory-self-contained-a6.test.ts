import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
} from "../src/memory.js";
import {
  exportCanonicalTopology,
} from "../src/canonical-topology.js";
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

// Integration provenance: self-contained Context/Theory authority witness copied from GREEN #1989 checkpoint; no production semantics are changed.

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`v0.15 A6 self-contained Context/Theory: ${message}`);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
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

function deriveDirectGaugeEndBoundary(memory: ReadMemory): LinkHandle {
  const R = memory.root;
  const found: LinkHandle[] = [];
  for (const candidate of memory.outgoing(R)) {
    if (candidate === R) continue;
    const poles = memory.poles(candidate);
    if (poles.start === R && poles.end === candidate) {
      found.push(candidate);
    }
  }
  same(found.length, 1, "unique direct-gauge END boundary");
  return found[0]!;
}

/**
 * Candidate execution environment:
 *
 *   environment = C -> Theory
 *
 * It is an ordinary non-Context Link rooted at the END boundary. A Context
 * below this environment therefore carries its Theory selection in ancestry
 * rather than receiving an external Theory-selection pointer from the host.
 */
function readExecutionEnvironment(
  memory: ReadMemory,
  environment: LinkHandle,
): { readonly boundary: LinkHandle; readonly theory: LinkHandle } {
  const boundary = deriveDirectGaugeEndBoundary(memory);
  const poles = memory.poles(environment);
  assert(
    poles.start === boundary && poles.end !== environment,
    "execution environment must be ordinary C->Theory",
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
      readExecutionEnvironment(memory, cursor);
      return cursor;
    }
    cursor = state.parent;
  }
}

function theoryOfContext(
  memory: ReadMemory,
  context: LinkHandle,
): LinkHandle {
  return readExecutionEnvironment(
    memory,
    rootEnvironmentOf(memory, context),
  ).theory;
}

function discoverEnvironmentEntries(
  memory: ReadMemory,
): readonly LinkHandle[] {
  const boundary = deriveDirectGaugeEndBoundary(memory);
  const entries: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();

  for (const environment of memory.outgoing(boundary)) {
    const environmentPoles = memory.poles(environment);
    if (
      environmentPoles.start !== boundary ||
      environmentPoles.end === environment
    ) {
      continue;
    }

    for (const payload of memory.outgoing(environment)) {
      const payloadPoles = memory.poles(payload);
      if (
        payloadPoles.start !== environment ||
        payloadPoles.end === payload
      ) {
        continue;
      }

      for (const candidate of memory.incoming(payload)) {
        if (seen.has(candidate)) continue;
        const candidatePoles = memory.poles(candidate);
        if (
          candidatePoles.start !== candidate ||
          candidatePoles.end !== payload
        ) {
          continue;
        }

        const state = contextOrUndefined(memory, candidate);
        if (
          state === undefined ||
          state.parent !== environment ||
          state.current !== payloadPoles.end
        ) {
          continue;
        }

        // The non-Context parent is itself sufficient to recover Theory.
        readExecutionEnvironment(memory, environment);
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
    const payloadPoles = memory.poles(payload);
    if (
      payloadPoles.start !== parent ||
      payloadPoles.end === payload
    ) {
      continue;
    }

    for (const candidate of memory.incoming(payload)) {
      if (seen.has(candidate)) continue;
      const candidatePoles = memory.poles(candidate);
      if (
        candidatePoles.start !== candidate ||
        candidatePoles.end !== payload
      ) {
        continue;
      }
      const state = contextOrUndefined(memory, candidate);
      if (
        state === undefined ||
        state.parent !== parent ||
        state.current !== payloadPoles.end
      ) {
        continue;
      }
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
    const poles = memory.poles(candidate);
    if (
      poles.start !== context ||
      poles.end !== candidate ||
      poles.start === candidate
    ) {
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

function deriveActiveFrontier(
  memory: ReadMemory,
): readonly LinkHandle[] {
  const active: LinkHandle[] = [];
  const visited = new Set<LinkHandle>();
  const visiting = new Set<LinkHandle>();

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

  for (const entry of discoverEnvironmentEntries(memory)) {
    walk(entry);
  }

  return Object.freeze(active);
}

function relationData(
  memory: Memory,
  antecedent: LinkHandle,
  outputs: readonly LinkHandle[],
): LinkHandle {
  return memory.ensure(
    antecedent,
    materializeExactSequence(memory, outputs),
  );
}

function admitRelation(
  memory: Memory,
  theory: LinkHandle,
  relation: LinkHandle,
): LinkHandle {
  return memory.ensure(theory, relation);
}

interface SnapshotRelation {
  readonly relation: LinkHandle;
  readonly antecedent: LinkHandle;
  readonly outputs: readonly LinkHandle[];
}

function captureTheorySnapshot(
  memory: ReadMemory,
  theory: LinkHandle,
): readonly SnapshotRelation[] {
  const result: SnapshotRelation[] = [];

  for (const admission of memory.outgoing(theory)) {
    if (admission === theory) continue;
    const admissionPoles = memory.poles(admission);
    if (
      admissionPoles.start !== theory ||
      admissionPoles.end === admission
    ) {
      continue;
    }

    const relation = admissionPoles.end;
    const relationPoles = memory.poles(relation);
    try {
      result.push(Object.freeze({
        relation,
        antecedent: relationPoles.start,
        outputs: readExactSequence(memory, relationPoles.end).values,
      }));
    } catch (error) {
      if (error instanceof ExactSequenceError) continue;
      throw error;
    }
  }

  return Object.freeze(result);
}

interface PlannedContextReaction {
  readonly context: LinkHandle;
  readonly truth: LinkHandle;
  readonly matchedRelations: number;
  readonly outputs: readonly LinkHandle[];
}

interface TreeReactionResult {
  readonly frontierBefore: readonly LinkHandle[];
  readonly frontierAfter: readonly LinkHandle[];
  readonly matchedRelations: number;
  readonly transitionedContexts: number;
  readonly createdChildren: number;
  readonly createdClosures: number;
  readonly quiescent: boolean;
}

/**
 * Candidate Context-tree generalized grounded reaction.
 *
 * Phase 1:
 * - derive the complete active frontier from Link topology;
 * - derive each leaf Theory through its root environment C->Theory;
 * - snapshot every participating Theory before any semantic publication;
 * - compute all local consequences without writes.
 *
 * Phase 2:
 * - matched empty image => END(K);
 * - positive image => child Context START(K -> (X->B));
 * - NO MATCH => no topology change, so the same leaf remains current.
 *
 * This is a test oracle, not yet the normative implementation. Its purpose is
 * to falsify the need for external current-Scope and selected-Theory pointers.
 */
function reactContextTree(
  memory: Memory,
): TreeReactionResult {
  const frontierBefore = deriveActiveFrontier(memory);

  const snapshots = new Map<LinkHandle, readonly SnapshotRelation[]>();
  for (const context of frontierBefore) {
    const theory = theoryOfContext(memory, context);
    if (!snapshots.has(theory)) {
      snapshots.set(theory, captureTheorySnapshot(memory, theory));
    }
  }

  const plans: PlannedContextReaction[] = [];
  let matchedRelations = 0;
  let transitionedContexts = 0;

  // Strictly read-only planning over one reaction-start Theory snapshot.
  for (const context of frontierBefore) {
    const state = readContext(memory, context);
    const truth = memory.poles(state.current);
    const theory = theoryOfContext(memory, context);
    const relations = snapshots.get(theory);
    assert(relations !== undefined, "Theory snapshot exists");

    const matches = relations.filter(
      (relation) => relation.antecedent === truth.end,
    );

    if (matches.length === 0) {
      plans.push(Object.freeze({
        context,
        truth: state.current,
        matchedRelations: 0,
        outputs: Object.freeze([]),
      }));
      continue;
    }

    transitionedContexts += 1;
    matchedRelations += matches.length;
    const outputs: LinkHandle[] = [];
    for (const match of matches) {
      for (const output of match.outputs) {
        if (!outputs.includes(output)) outputs.push(output);
      }
    }

    plans.push(Object.freeze({
      context,
      truth: state.current,
      matchedRelations: matches.length,
      outputs: Object.freeze(outputs),
    }));
  }

  // Publication starts only after the complete reaction has been planned.
  let createdChildren = 0;
  let createdClosures = 0;

  for (const plan of plans) {
    if (plan.matchedRelations === 0) continue;

    if (plan.outputs.length === 0) {
      memory.ensureEndSelfClosed(plan.context);
      createdClosures += 1;
      continue;
    }

    const truth = memory.poles(plan.truth);
    for (const output of plan.outputs) {
      const nextTruth = memory.ensure(truth.start, output);
      defineContext(memory, plan.context, nextTruth);
      createdChildren += 1;
    }
  }

  const frontierAfter = deriveActiveFrontier(memory);
  return Object.freeze({
    frontierBefore,
    frontierAfter,
    matchedRelations,
    transitionedContexts,
    createdChildren,
    createdClosures,
    quiescent: matchedRelations === 0,
  });
}

interface ScheduleOutcome {
  readonly matchSchedule: readonly number[];
  readonly finalTopology: string;
  readonly candidateAdmittedAfterRound1: boolean;
  readonly targetReducedAfterRound1: boolean;
  readonly targetReducedAfterRound2: boolean;
}

function run(reverseEntryCreation: boolean): ScheduleOutcome {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 100; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (index: number): LinkHandle => {
    const value = fresh[index];
    assert(value !== undefined, `fresh anchor ${index}`);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));
  const foreignTheory = memory.ensure(at(2), at(3));
  const BOOT = memory.ensure(at(4), at(5));
  const A = memory.ensure(at(6), at(7));
  const B = memory.ensure(at(8), at(9));
  const foreignB = memory.ensure(at(10), at(11));
  const K = memory.ensure(at(12), at(13));

  const candidate = relationData(memory, A, [B]);
  same(
    memory.find(theory, candidate),
    undefined,
    "candidate admission absent before execution",
  );

  const foreignCandidate = relationData(memory, A, [foreignB]);
  admitRelation(memory, foreignTheory, foreignCandidate);

  const bootstrap = relationData(memory, BOOT, [candidate]);
  admitRelation(memory, theory, bootstrap);

  // The environment itself carries selected Theory:
  //
  //   environment = C -> Theory
  const environment = memory.ensure(b.C, theory);
  const generatorTruth = memory.ensure(theory, BOOT);
  const targetTruth = memory.ensure(K, A);

  let generatorEntry: LinkHandle;
  let targetEntry: LinkHandle;
  if (reverseEntryCreation) {
    targetEntry = defineContext(memory, environment, targetTruth);
    generatorEntry = defineContext(memory, environment, generatorTruth);
  } else {
    generatorEntry = defineContext(memory, environment, generatorTruth);
    targetEntry = defineContext(memory, environment, targetTruth);
  }

  same(theoryOfContext(memory, generatorEntry), theory,
    "generator derives Theory from ancestry");
  same(theoryOfContext(memory, targetEntry), theory,
    "target derives Theory from ancestry");

  const round1 = reactContextTree(memory);
  same(round1.matchedRelations, 1,
    "round1 sees bootstrap only from reaction-start snapshot");
  same(round1.transitionedContexts, 1,
    "round1 transitions generator only");

  const candidateAdmission = memory.find(theory, candidate);
  assert(candidateAdmission !== undefined,
    "round1 publication creates Theory->candidate");
  const KB = memory.find(K, B);
  const targetReducedAfterRound1 =
    KB !== undefined &&
    round1.frontierAfter.some((context) => readContext(memory, context).current === KB);
  assert(!targetReducedAfterRound1,
    "same-reaction new admission is not visible to target sibling");

  const generatorChild = round1.frontierAfter.find(
    (context) => readContext(memory, context).current === candidateAdmission,
  );
  assert(generatorChild !== undefined,
    "generator continuation carries the generated admission truth");

  const round2 = reactContextTree(memory);
  same(round2.matchedRelations, 1,
    "round2 sees newly admitted candidate");
  same(round2.transitionedContexts, 1,
    "round2 transitions target only");

  const KB2 = memory.find(K, B);
  assert(KB2 !== undefined, "round2 materializes K->B");
  const targetReducedAfterRound2 = round2.frontierAfter.some(
    (context) => readContext(memory, context).current === KB2,
  );
  assert(targetReducedAfterRound2,
    "next reaction executes generated admission");

  const KForeign = memory.find(K, foreignB);
  assert(
    KForeign === undefined ||
    !round2.frontierAfter.some(
      (context) => readContext(memory, context).current === KForeign,
    ),
    "foreign Theory relation remains inert",
  );

  const round3 = reactContextTree(memory);
  same(round3.matchedRelations, 0, "round3 fixed point");
  same(round3.quiescent, true, "round3 quiescent");

  // All active leaves still recover their Theory from Link ancestry only.
  for (const context of round3.frontierAfter) {
    same(theoryOfContext(memory, context), theory,
      "final active Context inherits environment Theory");
  }

  return Object.freeze({
    matchSchedule: Object.freeze([
      round1.matchedRelations,
      round2.matchedRelations,
      round3.matchedRelations,
    ]),
    finalTopology: JSON.stringify(exportCanonicalTopology(memory).topology),
    candidateAdmittedAfterRound1: candidateAdmission !== undefined,
    targetReducedAfterRound1,
    targetReducedAfterRound2,
  });
}

function staticGuards(): void {
  const own = readFileSync(
    resolve(
      process.cwd(),
      "test/v015-context-theory-self-contained-a6.test.ts",
    ),
    "utf8",
  );

  const derivationStart = own.indexOf("function deriveDirectGaugeEndBoundary(");
  const derivationEnd = own.indexOf("\nfunction relationData(", derivationStart);
  assert(
    derivationStart >= 0 && derivationEnd > derivationStart,
    "Context/Theory derivation source slice",
  );
  const derivation = own.slice(derivationStart, derivationEnd);

  for (const forbidden of [
    ".allLinks(",
    "ensureRootBasis(",
    "currentScope",
    "selectedTheory",
    "theoryPointer",
    "programCounter",
    "currentContextId",
  ]) {
    assert(
      !derivation.includes(forbidden),
      `derivation excludes external semantic authority: ${forbidden}`,
    );
  }

  assert(
    derivation.includes("environmentPoles.start !== boundary"),
    "Theory environment is structurally rooted at C",
  );
  assert(
    derivation.includes("rootEnvironmentOf(memory, context)"),
    "Theory selection derives from Context ancestry",
  );

  const reactionStart = own.indexOf("function reactContextTree(");
  const reactionEnd = own.indexOf("\ninterface ScheduleOutcome", reactionStart);
  assert(reactionStart >= 0 && reactionEnd > reactionStart, "reaction source slice");
  const reaction = own.slice(reactionStart, reactionEnd);

  assert(
    reaction.indexOf("captureTheorySnapshot") <
      reaction.indexOf("// Strictly read-only planning"),
    "Theory snapshots captured before planning",
  );
  assert(
    reaction.indexOf("// Strictly read-only planning") <
      reaction.indexOf("// Publication starts only after"),
    "planning precedes publication",
  );

  for (const forbidden of [
    "V013GroundedScopeCursor",
    "defineV013GroundedExecutionScope",
    "switchAtomically",
    "selectedTheory",
    "currentScope",
    "RuleKind",
    "opcode",
  ]) {
    assert(
      !reaction.includes(forbidden),
      `Context-tree reaction excludes old runtime authority: ${forbidden}`,
    );
  }
}

function main(): void {
  const forward = run(false);
  const reverse = run(true);

  same(
    forward.matchSchedule.join(","),
    "1,1,0",
    "forward entry creation reaction schedule",
  );
  same(
    reverse.matchSchedule.join(","),
    "1,1,0",
    "reverse entry creation reaction schedule",
  );
  same(
    forward.finalTopology,
    reverse.finalTopology,
    "allocation/entry creation order does not change canonical final topology",
  );

  assert(forward.candidateAdmittedAfterRound1,
    "generated Theory admission is physically published after round1");
  assert(!forward.targetReducedAfterRound1,
    "generated admission is generation-isolated");
  assert(forward.targetReducedAfterRound2,
    "generated admission is executable next generation");

  staticGuards();

  console.log([
    "MTS v0.15 A6: SELF_CONTAINED_CONTEXT_THEORY=GREEN_RESEARCH",
    "EXECUTION_ENVIRONMENT=C_TO_THEORY",
    "ENTRY=START_ENVIRONMENT_TO_CONTEXTUAL_TRUTH",
    "EXTERNAL_SELECTED_THEORY_POINTER=0",
    "EXTERNAL_CURRENT_SCOPE_POINTER=0",
    "THEORY_DERIVED_FROM_CONTEXT_ANCESTRY=TRUE",
    "REACTION_START_THEORY_SNAPSHOT=TRUE",
    "SAME_REACTION_NEW_ADMISSION_EXECUTABLE=FALSE",
    "NEXT_REACTION_NEW_ADMISSION_EXECUTABLE=TRUE",
    "FORWARD_ENTRY_ORDER_MATCHES=1_1_0",
    "REVERSE_ENTRY_ORDER_MATCHES=1_1_0",
    "FINAL_CANONICAL_TOPOLOGY_SAME=TRUE",
    "FOREIGN_THEORY_ISOLATION=TRUE",
    "CONTEXT_TREE_AS_CURRENTNESS_CARRIER=SUFFICIENT_FOR_TESTED_VECTOR",
    "HOST_CONTEXT_FRONTIER_TRAVERSAL=RESIDUAL",
    "HOST_GROUNDED_RELATION_DISCOVERY=RESIDUAL_ORACLE",
    "FULL_SELF_HOSTED_META_INTERPRETER=NOT_YET_PROVEN",
    "ACCEPTED_V014_UNCHANGED",
  ].join(" "));
}

main();
