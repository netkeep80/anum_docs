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
  if (!value) {
    throw new Error("v0.15 P1ab native membership request pipeline: " + message);
  }
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
}

const memory = new Memory();
const b = ensureRootBasis(memory);
let cursor = memory.ensure(b.O, b.U);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, b.C);
  return cursor;
};

// Externally pinned authorities / program tags.
const objectTheory = memory.ensure(b.L, b.C);
const executionTheory = memory.ensure(b.C, b.L);
const VERIFY = fresh();
const REQUEST = fresh();
const MEMBER = fresh();
const grammar = fresh();

const selectedRule = fresh();
const absentRule = fresh();
const selectedAdmission = memory.ensure(objectTheory, selectedRule);

// Exact closed source authority is frozen before any aprover request/candidate.
const pinnedObjectAdmissions = Object.freeze([selectedAdmission]);

// ---------------------------------------------------------------------------
// 1. Static aprover Rule: build the membership request INSIDE ordinary Gamma.
// ---------------------------------------------------------------------------
//
// Semantic shape:
//   REQUEST -> (VERIFY -> (T -> R))
//      =>
//   Member(T,R) -> U
//
// T and R are ordinary structural roles. No candidate-provided result bit is
// accepted. The constant VERIFY tag gives the frozen backend a generic trigger
// key independent of the concrete T/R pair.
const T_ROLE = fresh();
const R_ROLE = fresh();
const aproverDictionary = defineStructuralRoleDictionary(
  memory,
  [T_ROLE, R_ROLE],
);
const verifyTemplate = memory.ensure(
  REQUEST,
  memory.ensure(VERIFY, memory.ensure(T_ROLE, R_ROLE)),
);
const membershipApplicationTemplate = memory.ensure(
  memory.ensure(MEMBER, T_ROLE),
  R_ROLE,
);
const membershipRequestTemplate = memory.ensure(
  membershipApplicationTemplate,
  b.U,
);
const queryBuilderBody = memory.ensure(
  verifyTemplate,
  materializeExactSequence(memory, [membershipRequestTemplate]),
);
const queryBuilderRule = defineStructuralRule(
  memory,
  aproverDictionary,
  queryBuilderBody,
);
const queryBuilderAdmission = admitStructuralRule(
  memory,
  executionTheory,
  queryBuilderRule,
);
// Existing frozen-backend compatibility index. The semantic query-builder Rule
// itself is generic in T/R; VERIFY is only the stable current-shape trigger.
memory.ensure(VERIFY, queryBuilderAdmission);

// ---------------------------------------------------------------------------
// 2. Generic closed-bundle characteristic projection: selected member U -> L.
// ---------------------------------------------------------------------------
const emptyDictionary = defineStructuralRoleDictionary(memory, []);

const application = (theory: LinkHandle, rule: LinkHandle): LinkHandle =>
  memory.ensure(memory.ensure(MEMBER, theory), rule);
const state = (
  theory: LinkHandle,
  rule: LinkHandle,
  result: LinkHandle,
): LinkHandle =>
  memory.ensure(application(theory, rule), result);

for (const sourceAdmission of pinnedObjectAdmissions) {
  const poles = memory.poles(sourceAdmission);
  same(poles.start, objectTheory, "pinned ObjectTheory source");
  const rule = poles.end;
  const before = state(objectTheory, rule, b.U);
  const after = state(objectTheory, rule, b.L);
  const relation = defineStructuralRule(
    memory,
    emptyDictionary,
    memory.ensure(
      before,
      materializeExactSequence(memory, [after]),
    ),
  );
  const runtimeAdmission = admitStructuralRule(
    memory,
    executionTheory,
    relation,
  );
  const triggerKey = memory.poles(memory.poles(before).end).start;
  memory.ensure(triggerKey, runtimeAdmission);
}

const interpreter = defineStructuralInterpreter(
  memory,
  aproverDictionary,
  grammar,
  executionTheory,
);

function verifyRequest(
  theory: LinkHandle,
  rule: LinkHandle,
): Readonly<{
  readonly request: LinkHandle;
  readonly afterBuilder: LinkHandle;
  readonly afterMembership: LinkHandle;
  readonly builderMatches: number;
  readonly membershipMatches: number;
}> {
  // Input contains only the cited authority + Rule identity. It does NOT carry
  // L/U and therefore cannot claim its own membership verdict.
  const request = memory.ensure(
    REQUEST,
    memory.ensure(VERIFY, memory.ensure(theory, rule)),
  );

  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    interpreter,
    [request],
  );
  const current = new V013CurrentScopeCursor(memory, scope);

  const generation1 = reactV013StructuralScope(memory, current, fresh());
  same(current.members().length, 1, "builder generation stays single-valued");
  const afterBuilder = current.members()[0]!;
  same(
    afterBuilder,
    state(theory, rule, b.U),
    "ordinary aprover Rule constructs exact canonical U request",
  );

  const generation2 = reactV013StructuralScope(memory, current, fresh());
  same(current.members().length, 1, "membership generation stays single-valued");
  const afterMembership = current.members()[0]!;

  return Object.freeze({
    request,
    afterBuilder,
    afterMembership,
    builderMatches: generation1.rawRuleMatches,
    membershipMatches: generation2.rawRuleMatches,
  });
}

// Selected member: generic aprover builder -> U request -> characteristic L.
{
  const result = verifyRequest(objectTheory, selectedRule);
  same(result.builderMatches, 1, "selected: one generic query-builder match");
  same(result.membershipMatches, 1, "selected: one membership relation match");
  same(
    result.afterMembership,
    state(objectTheory, selectedRule, b.L),
    "selected closed membership reaches L in generation 2",
  );
}

// Closed nonmember: builder still constructs the same U request shape; then
// ordinary no-match preserves U. No negative opcode / host lookup is used.
{
  const result = verifyRequest(objectTheory, absentRule);
  same(result.builderMatches, 1, "absent: same generic query-builder match");
  same(result.membershipMatches, 0, "absent: no positive membership relation");
  same(
    result.afterMembership,
    state(objectTheory, absentRule, b.U),
    "closed absence remains U in generation 2",
  );
}

// Physical ambient admission created AFTER the pinned closed projection must not
// influence the result.
const ambientAdmission = memory.ensure(objectTheory, absentRule);
same(
  memory.find(objectTheory, absentRule),
  ambientAdmission,
  "ambient post-pin ObjectTheory admission physically exists",
);
{
  const result = verifyRequest(objectTheory, absentRule);
  same(result.membershipMatches, 0, "ambient admission has no projected relation");
  same(
    result.afterMembership,
    state(objectTheory, absentRule, b.U),
    "ambient physical admission still has zero selected authority",
  );
}

// Foreign Theory + selected Rule is a distinct question and remains U.
const foreignTheory = fresh();
{
  const result = verifyRequest(foreignTheory, selectedRule);
  same(result.builderMatches, 1, "foreign: query builder remains generic");
  same(result.membershipMatches, 0, "foreign: no selected membership relation");
  same(
    result.afterMembership,
    state(foreignTheory, selectedRule, b.U),
    "foreign Theory membership remains U",
  );
}

console.log([
  "MTS_V015_P1AB_NATIVE_MEMBERSHIP_REQUEST_PIPELINE=GREEN_RESEARCH",
  "GENERATION_1=APROVER_BUILDS_MEMBER_T_R_TO_U",
  "GENERATION_2=CHARACTERISTIC_MEMBERSHIP_L_OR_U",
  "CANDIDATE_SUPPLIED_RESULT_BIT=0",
  "QUERY_BUILDER=T_R_STRUCTURAL_GENERIC_RULE",
  "SELECTED_MEMBERSHIP=L",
  "CLOSED_ABSENCE=U",
  "POST_PIN_PHYSICAL_ADMISSION=U",
  "FOREIGN_THEORY=U",
  "ONE_EXECUTION_THEORY=TRUE",
  "ONE_INTERPRETER=TRUE",
  "CROSS_MEMBER_JOIN=0",
  "RUNTIME_EQUALITY=0",
  "HOST_MEMBERSHIP_LOOKUP=0",
  "NEW_AMEMORY_OPCODE=0",
  "CANONICAL_APROVER_FORMAL_JSON=NOT_YET_PROPOSED",
].join(" "));
