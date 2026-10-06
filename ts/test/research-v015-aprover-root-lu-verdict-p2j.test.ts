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
  if (!value) throw new Error("v0.15 P2j root L/U verdict: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
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
  const boundary = deriveEndBoundary(memory);
  const result: ActiveMembership[] = [];

  for (const edge of state.members) {
    const ep = memory.poles(edge);
    const context = ep.end;
    const cs = contextOrUndefined(memory, context);
    if (cs === undefined) continue;

    const environment = ep.start;
    if (rootEnvironmentOf(memory, context) !== environment) continue;
    if (!state.members.has(environment)) continue;
    if (!state.members.has(context)) continue;
    if (!state.members.has(cs.current)) continue;

    const env = memory.poles(environment);
    if (env.start !== boundary || env.end === environment) continue;

    result.push(Object.freeze({
      edge,
      environment,
      context,
      truth: cs.current,
      theory: env.end,
    }));
  }

  return Object.freeze(result);
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
  const out: RuleSnapshot[] = [];

  for (const admission of state.members) {
    const ap = memory.poles(admission);
    if (ap.start !== theory || ap.end === admission) continue;
    try {
      verifyStructuralRuleAdmission(memory, theory, ap.end, admission);
      const structural = readStructuralRule(memory, ap.end);
      const roles = readStructuralRoleDictionary(
        memory,
        structural.roleDictionary,
      ).roles;
      const body = memory.poles(structural.body);
      const outputs = readExactSequence(memory, body.end).values;
      out.push(Object.freeze({
        rule: ap.end,
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

  return Object.freeze(out);
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
    const rules = snapshots.get(item.theory) ?? [];
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
  readonly quiescent: boolean;
}

function gamma(memory: Memory, before: AsetState): Reaction {
  const beforePlan = memory.linkCount;
  const planned = plan(memory, before);
  same(memory.linkCount, beforePlan, "analysis phase read-only");

  const next = new Set(before.members);
  let rawRuleMatches = 0;

  for (const item of planned) {
    if (item.matches.length === 0) continue;
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
    quiescent: rawRuleMatches === 0,
  });
}

function defineRule(
  memory: Memory,
  roles: readonly LinkHandle[],
  antecedent: LinkHandle,
  outputs: readonly LinkHandle[],
): LinkHandle {
  return defineStructuralRule(
    memory,
    defineStructuralRoleDictionary(memory, roles),
    memory.ensure(
      antecedent,
      materializeExactSequence(memory, outputs),
    ),
  );
}

function addActive(
  memory: Memory,
  state: Set<LinkHandle>,
  environment: LinkHandle,
  theory: LinkHandle,
  endpoint: LinkHandle,
): void {
  const truth = memory.ensure(theory, endpoint);
  const context = defineContext(memory, environment, truth);
  const edge = memory.ensure(environment, context);
  state.add(truth);
  state.add(context);
  state.add(edge);
}

const memory = new Memory();
const b = ensureRootBasis(memory);
let cursor = memory.ensure(b.U, b.L);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, b.O);
  return cursor;
};

// Grounded occurrence identities before all program roles.
const leaf = fresh();
const root = fresh();
const cycleA = fresh();
const cycleB = fresh();

// Fixed program anchors/tags before roles.
const theory = memory.ensure(fresh(), fresh());
const environment = memory.ensure(b.C, theory);
const FOLD = fresh();
const WAIT = fresh();
const VALID = fresh();
const CERT = fresh();
const VERDICT = fresh();

// Empty dictionary is a grounded constant used by generated U->L rules.
const emptyDictionary = defineStructuralRoleDictionary(memory, []);

// Fold roles.
const PREV = fresh();
const DEP = fresh();
const CONT = fresh();

const cellTemplate = memory.ensureStartSelfClosed(
  memory.ensure(PREV, DEP),
);
const foldNonEmpty = defineRule(
  memory,
  [PREV, DEP, CONT],
  memory.ensure(
    FOLD,
    memory.ensure(cellTemplate, CONT),
  ),
  [
    memory.ensure(
      FOLD,
      memory.ensure(
        PREV,
        memory.ensure(
          WAIT,
          memory.ensure(DEP, CONT),
        ),
      ),
    ),
  ],
);

const EMPTY_CONT = fresh();
const foldEmpty = defineRule(
  memory,
  [EMPTY_CONT],
  memory.ensure(
    FOLD,
    memory.ensure(b.R, EMPTY_CONT),
  ),
  [EMPTY_CONT],
);

// VALID(occ) generates:
//  1. positive CERT(occ)
//  2. dependency gate WAIT(occ, k)->k
//  3. grounded verdict upgrade Verdict(occ)->U -> Verdict(occ)->L
//
// All generated Rule admissions are ordinary outputs wrapped by the active
// truth's Theory pole during publication.
const GATE_CONT = fresh();
const gateDictionary = defineStructuralRoleDictionary(
  memory,
  [GATE_CONT],
);
const OCC = fresh();

const gateAntecedent = memory.ensure(
  WAIT,
  memory.ensure(OCC, GATE_CONT),
);
const gateBody = memory.ensure(
  gateAntecedent,
  materializeExactSequence(memory, [GATE_CONT]),
);
const generatedGateRule = memory.ensure(
  gateDictionary,
  gateBody,
);

const verdictApp = memory.ensure(VERDICT, OCC);
const verdictU = memory.ensure(verdictApp, b.U);
const verdictL = memory.ensure(verdictApp, b.L);
const verdictUpgradeBody = memory.ensure(
  verdictU,
  materializeExactSequence(memory, [verdictL]),
);
const generatedVerdictRule = memory.ensure(
  emptyDictionary,
  verdictUpgradeBody,
);

const certifyRule = defineRule(
  memory,
  [OCC],
  memory.ensure(VALID, OCC),
  [
    memory.ensure(CERT, OCC),
    generatedGateRule,
    generatedVerdictRule,
  ],
);

const staticAdmissions = Object.freeze([
  memory.ensure(theory, foldNonEmpty),
  memory.ensure(theory, foldEmpty),
  memory.ensure(theory, certifyRule),
]);

// Dependency graph:
//   leaf = base
//   root -> leaf
//   cycleA -> cycleB
//   cycleB -> cycleA
const deps = Object.freeze({
  leaf: materializeExactSequence(memory, []),
  root: materializeExactSequence(memory, [leaf]),
  cycleA: materializeExactSequence(memory, [cycleB]),
  cycleB: materializeExactSequence(memory, [cycleA]),
});

const stateMembers = new Set<LinkHandle>([
  environment,
  ...staticAdmissions,
]);

const validEndpoint = (occ: LinkHandle): LinkHandle =>
  memory.ensure(VALID, occ);
const foldEndpoint = (
  seq: LinkHandle,
  occ: LinkHandle,
): LinkHandle =>
  memory.ensure(
    FOLD,
    memory.ensure(seq, validEndpoint(occ)),
  );
const verdictState = (
  occ: LinkHandle,
  value: LinkHandle,
): LinkHandle =>
  memory.ensure(memory.ensure(VERDICT, occ), value);

for (const [occ, seq] of [
  [leaf, deps.leaf],
  [root, deps.root],
  [cycleA, deps.cycleA],
  [cycleB, deps.cycleB],
] as const) {
  addActive(
    memory,
    stateMembers,
    environment,
    theory,
    foldEndpoint(seq, occ),
  );
}

// Total verdict requests begin at U. Only generated trusted runtime authority
// may rewrite them to L.
addActive(
  memory,
  stateMembers,
  environment,
  theory,
  verdictState(root, b.U),
);
addActive(
  memory,
  stateMembers,
  environment,
  theory,
  verdictState(cycleA, b.U),
);

// Physical existence of forged positive cycle verdict has zero currentness.
const forgedCycleL = verdictState(cycleA, b.L);
assert(
  memory.poles(forgedCycleL).end === b.L,
  "forged L-shaped cycle verdict physically exists",
);

let state = aset(stateMembers);
let generations = 0;
for (; generations < 64; generations += 1) {
  const reaction = gamma(memory, state);
  state = reaction.after;
  if (reaction.quiescent) break;
}
assert(generations < 64, "root verdict fixed point reaches quiescence");

function hasEndpoint(endpoint: LinkHandle): boolean {
  return activeMemberships(memory, state).some(
    (item) => memory.poles(item.truth).end === endpoint,
  );
}

same(
  hasEndpoint(memory.ensure(CERT, leaf)),
  true,
  "leaf receives positive certificate",
);
same(
  hasEndpoint(memory.ensure(CERT, root)),
  true,
  "root receives positive certificate",
);
same(
  hasEndpoint(memory.ensure(CERT, cycleA)),
  false,
  "baseless cycleA receives no positive certificate",
);
same(
  hasEndpoint(memory.ensure(CERT, cycleB)),
  false,
  "baseless cycleB receives no positive certificate",
);

same(
  hasEndpoint(verdictState(root, b.L)),
  true,
  "valid root total verdict rewrites U to L",
);
same(
  hasEndpoint(verdictState(root, b.U)),
  false,
  "valid root U request is no longer current",
);
same(
  hasEndpoint(verdictState(cycleA, b.U)),
  true,
  "baseless cycle preserves total verdict U",
);
same(
  hasEndpoint(verdictState(cycleA, b.L)),
  false,
  "physical forged L has zero verdict authority",
);

console.log([
  "MTS_V015_P2J_ROOT_LU_VERDICT=GREEN_RESEARCH",
  "VERDICT=VALID_PROOF_OCCURRENCE_TO_L_OR_U",
  "INITIAL_VERDICT=U",
  "VALID_ROOT=L",
  "BASELESS_CYCLE_ROOT=U",
  "U_ROLE=SUPPLIED_ROOT_NOT_ACCEPTED_BY_SELECTED_FINITE_FIXED_POINT",
  "U_NE_CLAIM_FALSE=TRUE",
  "VALID_OCCURRENCE_GENERATES_VERDICT_UPGRADE_RULE=TRUE",
  "VERDICT_UPGRADE=ORDINARY_GROUNDED_RULE",
  "SAME_GENERATION_GENERATED_RULE_EXECUTABLE=FALSE",
  "PHYSICAL_FORGED_L_AUTHORITY=0",
  "HOST_BOOLEAN_VERDICT=0",
  "HOST_DFS=0",
  "HOST_VISITED_SET=0",
  "J1=0",
  "NEW_AMEMORY_OPCODE=0",
  "CANONICAL_APROVER_FORMAL_JSON=NOT_YET_PROPOSED",
].join(" "));
