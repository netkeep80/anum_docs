
import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
} from "../src/memory.js";
import {
  defineContext,
  readContext,
  StateError,
} from "../src/state.js";
import {
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRoleDictionary,
  readStructuralRule,
  StructuralRuleError,
  verifyStructuralRuleAdmission,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { unifyStructuralRuleTemplate } from "../src/structural-unification.js";
import { instantiateV013StructuralTemplate } from "../src/v013-structural-execution.js";
import { exportCanonicalTopology } from "../src/canonical-topology.js";
import {
  restoreTopology,
  type StorageTopologyImage,
} from "../src/persistence-topology.js";

// Integration split provenance: core Γ/currentness/publication subset of GREEN #1989 A9; native role-bundle and anti-drift guards are separate clean-main gates.

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`v0.15 A9 structural Aset one-command: ${message}`);
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
  for (const value of e) {
    assert(a.includes(value), `${message}: missing expected value`);
  }
}

interface AsetState {
  readonly members: ReadonlySet<LinkHandle>;
}

/**
 * Test-side carrier for semantic Aset membership.
 *
 * The Set is not a second ontology object and not an external current pointer.
 * Conceptually the input to the one command is the complete semantic state M_t.
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
    "execution environment must be ordinary C->Theory",
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
 * Positive currentness:
 *
 *   E = C->Theory       belongs to M_t
 *   E->K                belongs to M_t  [currentness witness]
 *   K                   belongs to M_t
 *   K.current           belongs to M_t
 *
 * No latest-link ordering and no negative no-child/no-END test is used.
 */
function activeMemberships(
  memory: ReadMemory,
  state: AsetState,
): readonly ActiveMembership[] {
  const active: ActiveMembership[] = [];

  for (const edge of state.members) {
    const ep = memory.poles(edge);
    const context = ep.end;
    const contextState = contextOrUndefined(memory, context);
    if (contextState === undefined) continue;

    const environment = ep.start;
    if (rootEnvironmentOf(memory, context) !== environment) continue;

    let theory: LinkHandle;
    try {
      theory = readEnvironment(memory, environment).theory;
    } catch {
      continue;
    }

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

interface StructuralRuleSnapshot {
  readonly admission: LinkHandle;
  readonly rule: LinkHandle;
  readonly antecedentTemplate: LinkHandle;
  readonly outputTemplates: readonly LinkHandle[];
  readonly roles: readonly LinkHandle[];
}

/**
 * Selected Theory authority comes only from membership of Theory->Rule Links in
 * the reaction-start Aset state. Ambient physical outgoing Links have no
 * authority merely because they exist in the carrier.
 */
function structuralTheorySnapshot(
  memory: ReadMemory,
  state: AsetState,
  theory: LinkHandle,
): readonly StructuralRuleSnapshot[] {
  const rules: StructuralRuleSnapshot[] = [];

  for (const admission of state.members) {
    const ap = memory.poles(admission);
    if (ap.start !== theory || ap.end === admission) continue;

    try {
      const rule = ap.end;
      verifyStructuralRuleAdmission(memory, theory, rule, admission);
      const structural = readStructuralRule(memory, rule);
      const roles = readStructuralRoleDictionary(
        memory,
        structural.roleDictionary,
      ).roles;
      const body = memory.poles(structural.body);
      const outputTemplates = readExactSequence(memory, body.end).values;

      rules.push(Object.freeze({
        admission,
        rule,
        antecedentTemplate: body.start,
        outputTemplates,
        roles,
      }));
    } catch (error) {
      if (
        error instanceof StructuralRuleError ||
        error instanceof ExactSequenceError
      ) {
        continue;
      }
      throw error;
    }
  }

  return Object.freeze(rules);
}

interface PlannedMatch {
  readonly rule: LinkHandle;
  readonly outputTemplates: readonly LinkHandle[];
  readonly bindings: readonly StructuralRoleBinding[];
}

interface PlannedActive {
  readonly active: ActiveMembership;
  readonly matches: readonly PlannedMatch[];
}

/**
 * S1 phase: complete read-only match/bind planning over one immutable M_t.
 *
 * S2 instantiation is deliberately NOT performed here. This prevents fresh
 * constructed outputs from becoming even physically available as a side effect
 * of planning before every current member has been matched against the same
 * reaction-start authority snapshot.
 */
function planStructuralAset(
  memory: ReadMemory,
  state: AsetState,
): readonly PlannedActive[] {
  const current = activeMemberships(memory, state);
  const snapshots = new Map<LinkHandle, readonly StructuralRuleSnapshot[]>();

  for (const item of current) {
    if (!snapshots.has(item.theory)) {
      snapshots.set(
        item.theory,
        structuralTheorySnapshot(memory, state, item.theory),
      );
    }
  }

  const plan: PlannedActive[] = [];
  for (const item of current) {
    const endpoint = memory.poles(item.truth).end;
    const rules = snapshots.get(item.theory);
    assert(rules !== undefined, "Theory snapshot available");

    const matches: PlannedMatch[] = [];
    for (const rule of rules) {
      try {
        const bindings = unifyStructuralRuleTemplate(
          memory,
          rule.antecedentTemplate,
          endpoint,
          rule.roles,
        );
        matches.push(Object.freeze({
          rule: rule.rule,
          outputTemplates: rule.outputTemplates,
          bindings,
        }));
      } catch (error) {
        if (error instanceof StructuralRuleError) continue;
        throw error;
      }
    }

    plan.push(Object.freeze({
      active: item,
      matches: Object.freeze(matches),
    }));
  }

  return Object.freeze(plan);
}

interface StructuralAsetReaction {
  readonly before: AsetState;
  readonly after: AsetState;
  readonly rawRuleMatches: number;
  readonly transitioned: number;
  readonly noMatch: number;
  readonly zero: number;
  readonly positive: number;
  readonly createdChildren: number;
  readonly createdClosures: number;
  readonly quiescent: boolean;
}

/**
 * Candidate single semantic command:
 *
 *   Gamma_structural(M_t) -> M_(t+1)
 *
 * S1 matching is fully planned first. Only after the complete plan exists does
 * S2 instantiate outputs and publication replace positive currentness witnesses.
 *
 * K is not a program role. The reaction preserves truth.start generically.
 */
function gammaStructuralAset(
  memory: Memory,
  before: AsetState,
): StructuralAsetReaction {
  const beforePlanning = memory.linkCount;
  const planned = planStructuralAset(memory, before);
  same(memory.linkCount, beforePlanning, "S1 planning writes zero Links");

  const next = new Set(before.members);
  let rawRuleMatches = 0;
  let transitioned = 0;
  let noMatch = 0;
  let zero = 0;
  let positive = 0;
  let createdChildren = 0;
  let createdClosures = 0;

  for (const item of planned) {
    if (item.matches.length === 0) {
      noMatch += 1;
      continue;
    }

    transitioned += 1;
    rawRuleMatches += item.matches.length;

    // Only currentness is removed. The same Context/truth Link may carry
    // another semantic role and therefore remains a member of the Aset.
    next.delete(item.active.edge);

    const outputs: LinkHandle[] = [];
    for (const match of item.matches) {
      for (const template of match.outputTemplates) {
        const output = instantiateV013StructuralTemplate(
          memory,
          template,
          match.bindings,
        );
        if (!outputs.includes(output)) outputs.push(output);
      }
    }

    if (outputs.length === 0) {
      const closure = memory.ensureEndSelfClosed(item.active.context);
      next.add(closure);
      zero += 1;
      createdClosures += 1;
      continue;
    }

    positive += 1;
    const truth = memory.poles(item.active.truth);

    for (const output of outputs) {
      const nextTruth = memory.ensure(truth.start, output);
      const child = defineContext(memory, item.active.context, nextTruth);
      const activeEdge = memory.ensure(item.active.environment, child);

      next.add(nextTruth);
      next.add(child);
      next.add(activeEdge);
      createdChildren += 1;
    }
  }

  return Object.freeze({
    before,
    after: aset(next),
    rawRuleMatches,
    transitioned,
    noMatch,
    zero,
    positive,
    createdChildren,
    createdClosures,
    quiescent: rawRuleMatches === 0,
  });
}

function currentTruths(
  memory: ReadMemory,
  state: AsetState,
): readonly LinkHandle[] {
  return Object.freeze(activeMemberships(memory, state).map((x) => x.truth));
}

function defineRule(
  memory: Memory,
  roles: readonly LinkHandle[],
  antecedentTemplate: LinkHandle,
  outputTemplates: readonly LinkHandle[],
): LinkHandle {
  const dictionary = defineStructuralRoleDictionary(memory, roles);
  const image = materializeExactSequence(memory, outputTemplates);
  const body = memory.ensure(antecedentTemplate, image);
  return defineStructuralRule(memory, dictionary, body);
}

interface FrozenAset {
  readonly topology: StorageTopologyImage;
  readonly memberCoordinates: readonly number[];
}

function freeze(memory: Memory, state: AsetState): FrozenAset {
  const canonical = exportCanonicalTopology(memory);
  const memberCoordinates = [...state.members].map((member) => {
    const coordinate = canonical.coordinates.get(member);
    assert(coordinate !== undefined, "member canonical coordinate exists");
    return coordinate;
  }).sort((a, b) => a - b);

  return Object.freeze({
    topology: canonical.topology,
    memberCoordinates: Object.freeze(memberCoordinates),
  });
}

function transfer(image: FrozenAset): FrozenAset {
  return JSON.parse(JSON.stringify(image)) as FrozenAset;
}

function restore(
  image: FrozenAset,
): { readonly memory: Memory; readonly state: AsetState } {
  const memory = restoreTopology(image.topology);
  const canonical = exportCanonicalTopology(memory);
  const byCoordinate = new Map<number, LinkHandle>();

  for (const [handle, coordinate] of canonical.coordinates) {
    byCoordinate.set(coordinate, handle);
  }

  const members = image.memberCoordinates.map((coordinate) => {
    const handle = byCoordinate.get(coordinate);
    assert(handle !== undefined, "member coordinate restored");
    return handle;
  });

  return Object.freeze({ memory, state: aset(members) });
}

function stateSignature(
  memory: Memory,
  state: AsetState,
): { readonly topology: string; readonly members: string } {
  const canonical = exportCanonicalTopology(memory);
  const members = [...state.members].map((member) => {
    const coordinate = canonical.coordinates.get(member);
    assert(coordinate !== undefined, "signature member coordinate exists");
    return coordinate;
  }).sort((a, b) => a - b);

  return Object.freeze({
    topology: JSON.stringify(canonical.topology),
    members: JSON.stringify(members),
  });
}

interface RunResult {
  readonly finalTopology: string;
  readonly finalMembers: string;
  readonly round1Stats: string;
  readonly round2Stats: string;
  readonly round3Stats: string;
}

function run(
  reverseEntryCreation: boolean,
  freezeAfterRound1: boolean,
): RunResult {
  let memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 220; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (index: number): LinkHandle => {
    const value = fresh[index];
    assert(value !== undefined, `fresh anchor ${index}`);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));
  const environment = memory.ensure(b.C, theory);

  const tag = at(10);
  const xRole = at(11);
  const yRole = at(12);

  const A = at(20);
  const B = at(21);
  const AZero = at(22);
  const AMany = at(23);
  const BMany1 = at(24);
  const BMany2 = at(25);
  const BOOT = at(26);

  // Fresh parameteric candidate:
  //   tag -> (X->Y)  ==>  (Y->X)
  // It exists physically but is NOT admitted in M0.
  const pairTemplate = memory.ensure(xRole, yRole);
  const candidateAntecedent = memory.ensure(tag, pairTemplate);
  const candidateOutput = memory.ensure(yRole, xRole);
  const candidateRule = defineRule(
    memory,
    [xRole, yRole],
    candidateAntecedent,
    [candidateOutput],
  );

  // Grounded zero/many rules are represented as zero-role StructuralRules,
  // proving one matcher family covers exact and parameteric cases.
  const zeroRule = defineRule(memory, [], AZero, []);
  const manyRule = defineRule(memory, [], AMany, [BMany1, BMany2]);

  // Bootstrap rule emits the candidate Rule Link itself. Because its active
  // contextual K is Theory, generic K-preservation materializes exactly:
  //
  //   Theory -> candidateRule
  //
  // as nextTruth, so the output becomes a Theory admission by ordinary
  // One-Link role overlap; no special "install rule" command exists.
  const bootstrapRule = defineRule(memory, [], BOOT, [candidateRule]);

  const bootstrapAdmission = memory.ensure(theory, bootstrapRule);
  const zeroAdmission = memory.ensure(theory, zeroRule);
  const manyAdmission = memory.ensure(theory, manyRule);
  same(
    memory.find(theory, candidateRule),
    undefined,
    "candidate Rule is physically present but not admitted before M0",
  );

  const KTarget = at(40);
  const KZero = at(41);
  const KMany = at(42);

  const actual = memory.ensure(tag, memory.ensure(A, B));
  const generatorTruth = memory.ensure(theory, BOOT);
  const targetTruth = memory.ensure(KTarget, actual);
  const zeroTruth = memory.ensure(KZero, AZero);
  const manyTruth = memory.ensure(KMany, AMany);

  const truths = [
    generatorTruth,
    targetTruth,
    zeroTruth,
    manyTruth,
  ] as const;

  const slots: Array<{
    readonly truth: LinkHandle;
    readonly context: LinkHandle;
    readonly edge: LinkHandle;
  } | undefined> = new Array(truths.length);

  const creationOrder = reverseEntryCreation
    ? [3, 2, 1, 0] as const
    : [0, 1, 2, 3] as const;

  for (const index of creationOrder) {
    const truth = truths[index]!;
    const context = defineContext(memory, environment, truth);
    const edge = memory.ensure(environment, context);
    slots[index] = Object.freeze({ truth, context, edge });
  }

  const created = slots.map((item, index) => {
    assert(item !== undefined, `entry semantic slot ${index}`);
    return item;
  });

  const members = new Set<LinkHandle>([
    environment,
    bootstrapAdmission,
    zeroAdmission,
    manyAdmission,
  ]);
  for (const item of created) {
    members.add(item.truth);
    members.add(item.context);
    members.add(item.edge);
  }

  let state = aset(members);
  same(activeMemberships(memory, state).length, 4, "M0 has four active Contexts");

  const round1 = gammaStructuralAset(memory, state);
  same(round1.rawRuleMatches, 3, "M0 bootstrap/zero/many all match");
  same(round1.transitioned, 3, "three M0 Contexts transition");
  same(round1.noMatch, 1, "fresh structural target is NO_MATCH in M0");
  same(round1.zero, 1, "matched-empty closes one Context");
  same(round1.positive, 2, "bootstrap and many are positive");
  same(round1.createdChildren, 3, "bootstrap one + many two children");
  same(round1.createdClosures, 1, "one ZERO closure");

  const candidateAdmission = memory.find(theory, candidateRule);
  assert(candidateAdmission !== undefined, "bootstrap published Theory->candidateRule");
  assert(
    round1.after.members.has(candidateAdmission),
    "new Theory admission belongs to M1",
  );
  assert(
    structuralTheorySnapshot(memory, round1.after, theory).some(
      (rule) => rule.rule === candidateRule,
    ),
    "M1 Theory snapshot recognizes generated candidate admission",
  );
  assert(
    currentTruths(memory, round1.after).includes(targetTruth),
    "candidate admission is not visible to target in the same reaction",
  );
  assert(
    round1.after.members.has(targetTruth),
    "same-reaction target truth remains a member",
  );

  // The generated admission is simultaneously the generator's next current
  // truth and Theory authority. One Link carries both roles.
  assert(
    currentTruths(memory, round1.after).includes(candidateAdmission),
    "generated admission is also the generator continuation truth",
  );

  state = round1.after;

  if (freezeAfterRound1) {
    const restored = restore(transfer(freeze(memory, state)));
    memory = restored.memory;
    state = restored.state;
    same(
      activeMemberships(memory, state).length,
      4,
      "M1 active Contexts reconstruct after freeze/transfer/restore",
    );
  }

  const round2 = gammaStructuralAset(memory, state);
  same(round2.rawRuleMatches, 1, "M1 generated parameteric Rule matches target");
  same(round2.transitioned, 1, "only fresh structural target transitions in M1");
  same(round2.noMatch, 3, "three other M1 Contexts remain unchanged");
  same(round2.zero, 0, "M1 has no matched-empty transition");
  same(round2.positive, 1, "M1 structural target produces one successor");
  same(round2.createdChildren, 1, "M1 creates one structural successor Context");

  state = round2.after;

  // Candidate output (B->A) is intentionally outside the tagged antecedent
  // shape, so the next generation is quiescent.
  const round3 = gammaStructuralAset(memory, state);
  same(round3.rawRuleMatches, 0, "M2 has no remaining matches");
  same(round3.quiescent, true, "M2 is quiescent");
  same(round3.noMatch, 4, "all four active Contexts persist at quiescence");
  setSame(
    currentTruths(memory, round3.after),
    currentTruths(memory, state),
    "quiescent reaction preserves current truths",
  );

  const signature = stateSignature(memory, round3.after);

  return Object.freeze({
    finalTopology: signature.topology,
    finalMembers: signature.members,
    round1Stats: [
      round1.rawRuleMatches,
      round1.transitioned,
      round1.noMatch,
      round1.zero,
      round1.positive,
    ].join(","),
    round2Stats: [
      round2.rawRuleMatches,
      round2.transitioned,
      round2.noMatch,
      round2.zero,
      round2.positive,
    ].join(","),
    round3Stats: [
      round3.rawRuleMatches,
      round3.transitioned,
      round3.noMatch,
      round3.zero,
      round3.positive,
    ].join(","),
  });
}



function main(): void {
  const forward = run(false, false);
  const reverse = run(true, false);
  const transferred = run(false, true);

  same(forward.round1Stats, "3,3,1,1,2", "M0 reaction statistics");
  same(forward.round2Stats, "1,1,3,0,1", "M1 reaction statistics");
  same(forward.round3Stats, "0,0,4,0,0", "M2 reaction statistics");
  same(reverse.round1Stats, forward.round1Stats, "entry creation order does not change M0 reaction");
  same(reverse.round2Stats, forward.round2Stats, "entry creation order does not change M1 reaction");
  same(reverse.finalTopology, forward.finalTopology, "entry creation order does not change final canonical carrier");
  same(reverse.finalMembers, forward.finalMembers, "entry creation order does not change final Aset membership");
  same(transferred.round1Stats, forward.round1Stats, "freeze path preserves M0 reaction");
  same(transferred.round2Stats, forward.round2Stats, "freeze path preserves M1 reaction");
  same(transferred.round3Stats, forward.round3Stats, "freeze path preserves quiescence");
  same(transferred.finalTopology, forward.finalTopology, "freeze between causal generations preserves final canonical carrier");
  same(transferred.finalMembers, forward.finalMembers, "freeze between causal generations preserves final Aset membership");

  console.log([
    "MTS_V015_A9_CORE=GREEN",
    "COMMAND=GAMMA_STRUCTURAL_ASET_OF_M",
    "EXTERNAL_CURRENT_POINTER=0",
    "EXTERNAL_SCOPE_POINTER=0",
    "EXTERNAL_SELECTED_THEORY_POINTER=0",
    "PRE_GROUNDER_COMMAND=0_FOR_TESTED_VECTOR",
    "MATCH_POWER=STRUCTURAL_TEMPLATE_WITH_ROLES",
    "JOINT_ANTECEDENT_ARITY=ONE_CURRENT_ENDPOINT",
    "IMAGE_ARITY=ZERO_ONE_MANY",
    "CURRENTNESS=POSITIVE_ASET_MEMBERSHIP_WITNESS",
    "THEORY_AUTHORITY=REACTION_START_ASET_MEMBERSHIP_SNAPSHOT",
    "S1_MATCH_BIND=READ_ONLY_COMPLETE_PLAN",
    "S2_INSTANTIATION=AFTER_COMPLETE_PLAN",
    "PUBLICATION=ATOMIC_SEMANTIC_MEMBERSHIP_REWRITE",
    "K_PRESERVATION=GENERIC_REACTION_LAW",
    "DYNAMIC_SELF_ADMISSION=ORDINARY_K_PRESERVING_OUTPUT",
    "SAME_REACTION_NEW_ADMISSION_EXECUTABLE=FALSE",
    "NEXT_REACTION_NEW_ADMISSION_EXECUTABLE=TRUE",
    "ONE_LINK_ADMISSION_AND_CURRENT_TRUTH_OVERLAP=GREEN",
    "FREEZE_RESUME_BETWEEN_GENERATIONS=CANONICAL_SAME",
    "ENTRY_CREATION_ORDER=CANONICAL_SAME",
    "CROSS_MEMBER_JOIN=0",
  ].join(" "));
}

main();