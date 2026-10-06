import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  V013CurrentScopeCursor,
  defineV013WorkingScope,
  reactV013StructuralScope,
} from "../src/v013-structural-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 P1x execution-Theory injection: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

const memory = new Memory();
const b = ensureRootBasis(memory);
let cursor = memory.ensure(b.O, b.U);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, b.C);
  return cursor;
};

const objectTheory = memory.ensure(b.L, b.C);
const executionTheory = memory.ensure(b.C, b.L);
const MEMBER = fresh();
const grammar = fresh();
const selectedRule = fresh();
const absentRule = fresh();

const selectedAdmission = memory.ensure(objectTheory, selectedRule);
const empty = defineStructuralRoleDictionary(memory, []);

const app = (rule: LinkHandle): LinkHandle =>
  memory.ensure(memory.ensure(MEMBER, objectTheory), rule);
const state = (rule: LinkHandle, result: LinkHandle): LinkHandle =>
  memory.ensure(app(rule), result);

function addPositiveMembershipRelation(rule: LinkHandle): LinkHandle {
  const before = state(rule, b.U);
  const after = state(rule, b.L);
  const relation = defineStructuralRule(
    memory,
    empty,
    memory.ensure(before, materializeExactSequence(memory, [after])),
  );
  const admission = admitStructuralRule(memory, executionTheory, relation);
  const triggerKey = memory.poles(memory.poles(before).end).start;
  memory.ensure(triggerKey, admission);
  return admission;
}

// Trusted projection from pinned ObjectTheory contains selectedRule only.
const selectedRuntimeAdmission = addPositiveMembershipRelation(selectedRule);
const interpreter = defineStructuralInterpreter(
  memory,
  empty,
  grammar,
  executionTheory,
);

function evaluate(rule: LinkHandle): LinkHandle {
  const initial = state(rule, b.U);
  const scope = defineV013WorkingScope(memory, fresh(), interpreter, [initial]);
  const current = new V013CurrentScopeCursor(memory, scope);
  reactV013StructuralScope(memory, current, fresh());
  return memory.poles(current.members()[0]!).end;
}

same(evaluate(selectedRule), b.L, "selected member -> L");
same(evaluate(absentRule), b.U, "closed absent member -> U before attack");

// Attack/falsifier: untrusted candidate physically appends an otherwise valid
// membership Rule admission to the already selected live ExecutionTheory.
const forgedRuntimeAdmission = addPositiveMembershipRelation(absentRule);
assert(
  forgedRuntimeAdmission !== selectedRuntimeAdmission,
  "forged runtime admission is distinct",
);

// Frozen/current executor discovers live outgoing ExecutionTheory admissions, so
// the exact same previously absent query now becomes L.
same(
  evaluate(absentRule),
  b.L,
  "candidate augmentation of live ExecutionTheory self-authorizes",
);

console.log([
  "MTS_V015_P1X_EXECUTION_THEORY_CANDIDATE_INJECTION=FALSIFIER_GREEN",
  "BASELINE_SELECTED_MEMBER=L",
  "BASELINE_CLOSED_NONMEMBER=U",
  "AFTER_FORGED_EXECUTION_THEORY_ADMISSION=L",
  "LIVE_PHYSICAL_THEORY_AUGMENTATION_IS_AUTHORITY_INJECTION=TRUE",
  "DERIVED_EXECUTION_THEORY_MUST_BE_PINNED_AND_PROTECTED=TRUE",
  "CANDIDATE_MAY_NOT_ADD_OUTGOING_FROM_AUTHORITY_ANCHORS=TRUE",
  "FROZEN_AMEMORY_CHANGE_REQUIRED=FALSE",
  "LOADER_OR_PACKAGE_AUTHORITY_BOUNDARY_REQUIRED=TRUE",
].join(" "));
