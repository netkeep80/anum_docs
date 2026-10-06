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
  if (!value) throw new Error("v0.15 P1v membership query initialization: " + message);
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

const CHI = fresh();
const executionTheory = memory.ensure(b.C, b.L);
const grammar = fresh();
const member = fresh();
const nonmember = fresh();

const app = (x: LinkHandle): LinkHandle => memory.ensure(CHI, x);
const state = (x: LinkHandle, result: LinkHandle): LinkHandle =>
  memory.ensure(app(x), result);

const empty = defineStructuralRoleDictionary(memory, []);

// Closed bundle is {member}; sparse positive grounding U -> L.
{
  const before = state(member, b.U);
  const after = state(member, b.L);
  const relation = defineStructuralRule(
    memory,
    empty,
    memory.ensure(before, materializeExactSequence(memory, [after])),
  );
  const admission = admitStructuralRule(memory, executionTheory, relation);
  const triggerKey = memory.poles(memory.poles(before).end).start;
  memory.ensure(triggerKey, admission);
}

const interpreter = defineStructuralInterpreter(
  memory,
  empty,
  grammar,
  executionTheory,
);

function run(initial: LinkHandle): LinkHandle {
  const scope = defineV013WorkingScope(memory, fresh(), interpreter, [initial]);
  const current = new V013CurrentScopeCursor(memory, scope);
  reactV013StructuralScope(memory, current, fresh());
  same(current.members().length, 1, "one result");
  return current.members()[0]!;
}

// Canonical query protocol starts from U.
same(
  memory.poles(run(state(member, b.U))).end,
  b.L,
  "canonical member query U -> L",
);
same(
  memory.poles(run(state(nonmember, b.U))).end,
  b.U,
  "canonical nonmember query U remains U",
);

// Falsifier: candidate-controlled initial L would survive for a nonmember,
// because no admitted relation matches. Therefore initial L/U is not untrusted
// proof data and cannot be treated as the characteristic result supplied by the
// candidate.
const forged = state(nonmember, b.L);
same(
  memory.poles(run(forged)).end,
  b.L,
  "candidate-seeded forged L persists under no-match",
);

console.log([
  "MTS_V015_P1V_MEMBERSHIP_QUERY_INITIALIZATION=FALSIFIER_GREEN",
  "CANONICAL_REQUEST_STATE=CHI_X_TO_U",
  "APROVER_MUST_CONSTRUCT_REQUEST_STATE=TRUE",
  "PROOF_MAY_SUPPLY_REFERENCED_MEMBER_ONLY=TRUE",
  "CANDIDATE_SUPPLIED_RESULT_BIT=FORBIDDEN",
  "FORGED_INITIAL_L_PERSISTS_IF_TRUSTED=TRUE",
  "NO_MATCH_PRESERVATION_REMAINS_CORRECT",
  "HOST_MAY_SELECT_ENTRY_BUT_MUST_NOT_ACCEPT_CANDIDATE_CURRENT=TRUE",
].join(" "));
