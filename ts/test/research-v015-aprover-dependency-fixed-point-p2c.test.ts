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

function assert(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error("v0.15 P2c dependency fixed point: " + message);
  }
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
}
function setSame<T>(
  actual: Iterable<T>,
  expected: Iterable<T>,
  message: string,
): void {
  const a = [...new Set(actual)];
  const e = [...new Set(expected)];
  same(a.length, e.length, message + " / cardinality");
  for (const value of e) {
    assert(a.includes(value), message + " / missing expected value");
  }
}

interface AsetState {
  readonly members: ReadonlySet<LinkHandle>;
}

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
  same(found.length, 1, "unique END boundary");
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
): { readonly theory: LinkHandle } {
  const boundary = deriveEndBoundary(memory);
  const p = memory.poles(environment);
  assert(
    p.start === boundary && p.end !== environment,
    "execution environment is C->Theory",
  );
  return Object.freeze({ theory: p.end });
}

interface ActiveMembership {
  readonly edge: LinkHandle;
  readonly environment: LinkHandle;
  readonly context: LinkHandle;
  readonly truth: LinkHandle;
  readonly theory: LinkHandle;
}

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

interface RuleSnapshot {
  readonly rule: LinkHandle;
  readonly antecedent: LinkHandle;
  readonly outputs: readonly LinkHandle[];
  readonly roles: readonly LinkHandle[];
}

function theorySnapshot(
  memory: ReadMemory,
  state: AsetState,
  theory: LinkHandle,
): readonly RuleSnapshot[] {
  const result: RuleSnapshot[] = [];
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
      const outputs = readExactSequence(memory, body.end).values;
      result.push(Object.freeze({
        rule,
        antecedent: body.start,
        outputs,
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
  return Object.freeze(result);
}

interface PlannedMatch {
  readonly outputs: readonly LinkHandle[];
  readonly bindings: readonly StructuralRoleBinding[];
}
interface PlannedActive {
  readonly active: ActiveMembership;
  readonly matches: readonly PlannedMatch[];
}

function plan(
  memory: ReadMemory,
  state: AsetState,
): readonly PlannedActive[] {
  const active = activeMemberships(memory, state);
  const snapshots = new Map<LinkHandle, readonly RuleSnapshot[]>();

  for (const item of active) {
    if (!snapshots.has(item.theory)) {
      snapshots.set(item.theory, theorySnapshot(memory, state, item.theory));
    }
  }

  const planned: PlannedActive[] = [];
  for (const item of active) {
    const endpoint = memory.poles(item.truth).end;
    const rules = snapshots.get(item.theory);
    assert(rules !== undefined, "reaction-start Theory snapshot");

    const matches: PlannedMatch[] = [];
    for (const rule of rules) {
      try {
        const bindings = unifyStructuralRuleTemplate(
          memory,
          rule.antecedent,
          endpoint,
          rule.roles,
        );
        matches.push(Object.freeze({
          outputs: rule.outputs,
          bindings,
        }));
      } catch (error) {
        if (error instanceof StructuralRuleError) continue;
        throw error;
      }
    }
    planned.push(Object.freeze({
      active: item,
      matches: Object.freeze(matches),
    }));
  }
  return Object.freeze(planned);
}

interface Reaction {
  readonly after: AsetState;
  readonly rawRuleMatches: number;
  readonly transitioned: number;
  readonly quiescent: boolean;
}

function gamma(
  memory: Memory,
  before: AsetState,
): Reaction {
  const beforePlan = memory.linkCount;
  const planned = plan(memory, before);
  same(memory.linkCount, beforePlan, "analysis phase is read-only");

  const next = new Set(before.members);
  let rawRuleMatches = 0;
  let transitioned = 0;

  for (const item of planned) {
    if (item.matches.length === 0) continue;

    transitioned += 1;
    rawRuleMatches += item.matches.length;
    next.delete(item.active.edge);

    const outputs: LinkHandle[] = [];
    for (const match of item.matches) {
      for (const template of match.outputs) {
        const output = instantiateV013StructuralTemplate(
          memory,
          template,
          match.bindings,
        );
        if (!outputs.includes(output)) outputs.push(output);
      }
    }

    if (outputs.length === 0) {
      next.add(memory.ensureEndSelfClosed(item.active.context));
      continue;
    }

    const truthPoles = memory.poles(item.active.truth);
    for (const output of outputs) {
      const nextTruth = memory.ensure(truthPoles.start, output);
      const child = defineContext(memory, item.active.context, nextTruth);
      const edge = memory.ensure(item.active.environment, child);
      next.add(nextTruth);
      next.add(child);
      next.add(edge);
    }
  }

  return Object.freeze({
    after: aset(next),
    rawRuleMatches,
    transitioned,
    quiescent: rawRuleMatches === 0,
  });
}

function defineRule(
  memory: Memory,
  roles: readonly LinkHandle[],
  antecedent: LinkHandle,
  outputs: readonly LinkHandle[],
): LinkHandle {
  const dictionary = defineStructuralRoleDictionary(memory, roles);
  const body = memory.ensure(
    antecedent,
    materializeExactSequence(memory, outputs),
  );
  return defineStructuralRule(memory, dictionary, body);
}

interface Program {
  readonly theory: LinkHandle;
  readonly environment: LinkHandle;
  readonly FOLD: LinkHandle;
  readonly WAIT: LinkHandle;
  readonly VALID: LinkHandle;
  readonly CERT: LinkHandle;
  readonly staticAdmissions: readonly LinkHandle[];
}

function installProgram(
  memory: Memory,
  fresh: () => LinkHandle,
): Program {
  const b = ensureRootBasis(memory);
  const theory = memory.ensure(fresh(), fresh());
  const environment = memory.ensure(b.C, theory);

  const FOLD = fresh();
  const WAIT = fresh();
  const VALID = fresh();
  const CERT = fresh();

  // ExactSequence fold roles.
  const PREV = fresh();
  const DEP = fresh();
  const CONT = fresh();

  // A non-empty ExactSequence cell has exact topology:
  //   Cell = START(Prev -> Value)
  const cellTemplate = memory.ensureStartSelfClosed(
    memory.ensure(PREV, DEP),
  );
  const foldNonEmptyAntecedent = memory.ensure(
    FOLD,
    memory.ensure(cellTemplate, CONT),
  );
  const waitContinuation = memory.ensure(
    WAIT,
    memory.ensure(DEP, CONT),
  );
  const foldNonEmptyOutput = memory.ensure(
    FOLD,
    memory.ensure(PREV, waitContinuation),
  );
  const foldNonEmptyRule = defineRule(
    memory,
    [PREV, DEP, CONT],
    foldNonEmptyAntecedent,
    [foldNonEmptyOutput],
  );

  // Empty ExactSequence is exactly R.
  const EMPTY_CONT = fresh();
  const foldEmptyAntecedent = memory.ensure(
    FOLD,
    memory.ensure(b.R, EMPTY_CONT),
  );
  const foldEmptyRule = defineRule(
    memory,
    [EMPTY_CONT],
    foldEmptyAntecedent,
    [EMPTY_CONT],
  );

  // Positive validity is a current endpoint VALID->Occurrence. It does not
  // directly act as a global boolean. One ordinary meta-Rule turns that local
  // positive fact into:
  //   CERT->Occurrence
  //   Theory->Gate(Occurrence)
  //
  // The second output is simultaneously a current truth and a Rule admission
  // because K=Theory for this experiment (One-Link role overlap).
  // GATE_CONT is allocated before OCC so this grounded generated-rule role
  // cannot structurally contain the meta-role that will later be substituted.
  const GATE_CONT = fresh();
  const OCC = fresh();
  const gateDictionary = defineStructuralRoleDictionary(memory, [GATE_CONT]);
  const gateAntecedentTemplate = memory.ensure(
    WAIT,
    memory.ensure(OCC, GATE_CONT),
  );
  const gateBodyTemplate = memory.ensure(
    gateAntecedentTemplate,
    materializeExactSequence(memory, [GATE_CONT]),
  );
  const generatedGateRuleTemplate = memory.ensure(
    gateDictionary,
    gateBodyTemplate,
  );
  const certifyAntecedent = memory.ensure(VALID, OCC);
  const certifyRule = defineRule(
    memory,
    [OCC],
    certifyAntecedent,
    [
      memory.ensure(CERT, OCC),
      generatedGateRuleTemplate,
    ],
  );

  const staticAdmissions = Object.freeze([
    memory.ensure(theory, foldNonEmptyRule),
    memory.ensure(theory, foldEmptyRule),
    memory.ensure(theory, certifyRule),
  ]);

  return Object.freeze({
    theory,
    environment,
    FOLD,
    WAIT,
    VALID,
    CERT,
    staticAdmissions,
  });
}

interface Fixture {
  readonly memory: Memory;
  readonly state: AsetState;
  readonly program: Program;
  readonly occurrence: Readonly<Record<string, LinkHandle>>;
}

function buildFixture(reverse: boolean): Fixture {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  let cursor = memory.ensure(b.U, b.L);
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, b.O);
    return cursor;
  };

  const program = installProgram(memory, fresh);

  // Structural-only dependency graph after local P2a application validation.
  //
  // leaf                         valid base
  // left  -> leaf
  // right -> leaf                shared dependency
  // pair  -> [left,right]        all dependencies required
  // repeat-> [leaf,leaf]         repeated dependency
  // root  -> [pair,repeat]
  //
  // cycleA -> cycleB
  // cycleB -> cycleA             no valid base
  const occurrence = Object.freeze({
    leaf: fresh(),
    left: fresh(),
    right: fresh(),
    pair: fresh(),
    repeat: fresh(),
    root: fresh(),
    cycleA: fresh(),
    cycleB: fresh(),
  });

  const deps = Object.freeze({
    leaf: materializeExactSequence(memory, []),
    left: materializeExactSequence(memory, [occurrence.leaf]),
    right: materializeExactSequence(memory, [occurrence.leaf]),
    pair: materializeExactSequence(memory, [
      occurrence.left,
      occurrence.right,
    ]),
    repeat: materializeExactSequence(memory, [
      occurrence.leaf,
      occurrence.leaf,
    ]),
    root: materializeExactSequence(memory, [
      occurrence.pair,
      occurrence.repeat,
    ]),
    cycleA: materializeExactSequence(memory, [occurrence.cycleB]),
    cycleB: materializeExactSequence(memory, [occurrence.cycleA]),
  });

  const validEndpoint = (occ: LinkHandle): LinkHandle =>
    memory.ensure(program.VALID, occ);
  const foldEndpoint = (
    sequence: LinkHandle,
    occ: LinkHandle,
  ): LinkHandle =>
    memory.ensure(
      program.FOLD,
      memory.ensure(sequence, validEndpoint(occ)),
    );

  const entries = [
    ["leaf", deps.leaf],
    ["left", deps.left],
    ["right", deps.right],
    ["pair", deps.pair],
    ["repeat", deps.repeat],
    ["root", deps.root],
    ["cycleA", deps.cycleA],
    ["cycleB", deps.cycleB],
  ] as const;
  const ordered = reverse ? [...entries].reverse() : entries;

  const members = new Set<LinkHandle>([
    program.environment,
    ...program.staticAdmissions,
  ]);

  for (const [name, sequence] of ordered) {
    const truth = memory.ensure(
      program.theory,
      foldEndpoint(sequence, occurrence[name]),
    );
    const context = defineContext(memory, program.environment, truth);
    const edge = memory.ensure(program.environment, context);
    members.add(truth);
    members.add(context);
    members.add(edge);
  }

  return Object.freeze({
    memory,
    state: aset(members),
    program,
    occurrence,
  });
}

function certEndpoint(
  memory: Memory,
  program: Program,
  occurrence: LinkHandle,
): LinkHandle {
  return memory.ensure(program.CERT, occurrence);
}

function hasCurrentEndpoint(
  memory: ReadMemory,
  state: AsetState,
  endpoint: LinkHandle,
): boolean {
  return activeMemberships(memory, state).some(
    (item) => memory.poles(item.truth).end === endpoint,
  );
}

interface RunResult {
  readonly generations: number;
  readonly certs: ReadonlySet<string>;
  readonly gateAdmissionCount: number;
  readonly finalMatches: number;
}

function run(reverse: boolean): RunResult {
  const fixture = buildFixture(reverse);
  const { memory, program, occurrence } = fixture;
  let state = fixture.state;

  const names = Object.keys(occurrence) as Array<keyof typeof occurrence>;
  const successful = new Set([
    "leaf",
    "left",
    "right",
    "pair",
    "repeat",
    "root",
  ]);

  let generations = 0;
  let finalMatches = -1;
  for (; generations < 64; generations += 1) {
    const reaction = gamma(memory, state);
    state = reaction.after;
    finalMatches = reaction.rawRuleMatches;
    if (reaction.quiescent) break;
  }
  assert(generations < 64, "dependency closure reaches finite quiescence");
  same(finalMatches, 0, "final fixed point is quiescent");

  const certs = new Set<string>();
  for (const name of names) {
    const selected = occurrence[name];
    assert(selected !== undefined, "named occurrence exists: " + String(name));
    const endpoint = certEndpoint(memory, program, selected);
    if (hasCurrentEndpoint(memory, state, endpoint)) certs.add(name);
  }

  setSame(
    certs,
    successful,
    "exact positive dependency closure",
  );

  // Every successful occurrence has exactly one dynamically generated gate Rule
  // admitted in the final Theory. Count through the same validated Theory
  // snapshot used by Gamma; arbitrary Theory->data current Links are not Rules.
  const staticRules = new Set(
    program.staticAdmissions.map((admission) => memory.poles(admission).end),
  );
  const dynamicRules = theorySnapshot(memory, state, program.theory)
    .filter((snapshot) => !staticRules.has(snapshot.rule));
  same(
    dynamicRules.length,
    successful.size,
    "one canonical generated validity gate per successful occurrence",
  );

  // Cycles without a valid base publish no positive certificate.
  assert(
    !certs.has("cycleA") && !certs.has("cycleB"),
    "base-less cycle has no positive validity",
  );

  return Object.freeze({
    generations,
    certs,
    gateAdmissionCount: dynamicRules.length,
    finalMatches,
  });
}

const forward = run(false);
const reverse = run(true);

setSame(
  forward.certs,
  reverse.certs,
  "entry creation order does not change fixed-point validity",
);
same(
  forward.gateAdmissionCount,
  reverse.gateAdmissionCount,
  "entry creation order preserves canonical gate cardinality",
);
same(
  forward.finalMatches,
  reverse.finalMatches,
  "entry creation order preserves final quiescence",
);

console.log([
  "MTS_V015_P2C_DEPENDENCY_FIXED_POINT=GREEN_RESEARCH",
  "INPUT_STAGE=P2A_LOCAL_APPLICATION_ALREADY_VALIDATED",
  "DEPENDENCY_CARRIER=EXACT_SEQUENCE",
  "SEQUENCE_TRAVERSAL=ORDINARY_STRUCTURAL_FOLD",
  "HOST_DEPENDENCY_ITERATION_DURING_EXECUTION=0",
  "HOST_DFS=0",
  "HOST_VISITED_SET=0",
  "J1=0",
  "VALID_LEAF_PUBLISHES_POSITIVE_GATE=TRUE",
  "PARENT_REQUIRES_ALL_DEPENDENCIES=SEQUENTIAL_WAIT_CHAIN",
  "SHARED_DEPENDENCY=ONE_GATE_MANY_WAITERS",
  "REPEATED_DEPENDENCY=CONVERGES",
  "BASELESS_CYCLE=QUIESCENT_NO_POSITIVE_VALIDITY",
  "VALIDITY_GATE=ORDINARY_DYNAMIC_RULE_ADMISSION",
  "SAME_GENERATION_NEW_GATE_EXECUTABLE=FALSE",
  "REACTION_LAW=SNAPSHOT_ANALYSIS_SYNTHESIS_ATOMIC_PUBLICATION",
  "CANONICAL_LINK_ASET_IDENTITY_COLLAPSES_DUPLICATES=TRUE",
  "ENTRY_CREATION_ORDER_SEMANTIC=FALSE",
  "NEW_AMEMORY_OPCODE=0",
  "CANONICAL_APROVER_FORMAL_JSON=NOT_YET_PROPOSED",
].join(" "));
