import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
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
  if (!value) throw new Error("v0.15 aprover P1q closed membership L/U: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": " + String(actual) + " !== " + String(expected));
}

const memory = new Memory();
const b = ensureRootBasis(memory);

let cursor = memory.ensure(b.O, b.U);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, b.C);
  return cursor;
};

// Keep authority anchors out of the fresh-name chain.
const objectTheory = memory.ensure(b.L, b.C);
const executionTheory = memory.ensure(b.C, b.L);
const MEMBER = fresh();
const grammar = fresh();

const ruleA = fresh();
const ruleB = fresh();
const ruleC = fresh();

const admissionA = memory.ensure(objectTheory, ruleA);
const admissionB = memory.ensure(objectTheory, ruleB);

// Exact selected ObjectTheory is frozen BEFORE candidate/ambient data.
const pinnedAdmissions = Object.freeze([admissionA, admissionB]);

const emptyDictionary = defineStructuralRoleDictionary(memory, []);

function application(
  theory: LinkHandle,
  rule: LinkHandle,
): LinkHandle {
  // FORMAL-shaped application identity:
  // Member(Theory)(Rule) == (MEMBER->Theory)->Rule.
  return memory.ensure(memory.ensure(MEMBER, theory), rule);
}

function resultState(
  theory: LinkHandle,
  rule: LinkHandle,
  value: LinkHandle,
): LinkHandle {
  return memory.ensure(application(theory, rule), value);
}

/**
 * Generic closed-world projection:
 *
 * Every selected ObjectTheory admission T->R becomes exactly one ordinary
 * grounded relation under the runtime execution Theory:
 *
 *   Member(T,R)->U  -> [ Member(T,R)->L ]
 *
 * This projection is complete, proof-independent and happens before any
 * candidate proof/query is loaded.
 */
function projectMembershipRelation(
  admission: LinkHandle,
): void {
  const poles = memory.poles(admission);
  same(poles.start, objectTheory, "projection source belongs to exact ObjectTheory");
  const rule = poles.end;

  const before = resultState(objectTheory, rule, b.U);
  const after = resultState(objectTheory, rule, b.L);
  const body = memory.ensure(
    before,
    materializeExactSequence(memory, [after]),
  );
  const relation = defineStructuralRule(memory, emptyDictionary, body);
  const runtimeAdmission = admitStructuralRule(
    memory,
    executionTheory,
    relation,
  );

  // Existing frozen-compatible discovery index for this exact current shape.
  const triggerKey = memory.poles(memory.poles(before).end).start;
  memory.ensure(triggerKey, runtimeAdmission);
}

for (const admission of pinnedAdmissions) {
  projectMembershipRelation(admission);
}

const interpreter = defineStructuralInterpreter(
  memory,
  emptyDictionary,
  grammar,
  executionTheory,
);

function evaluateMembership(
  theory: LinkHandle,
  rule: LinkHandle,
): Readonly<{
  readonly value: LinkHandle;
  readonly rawRuleMatches: number;
  readonly quiescent: boolean;
}> {
  const initial = resultState(theory, rule, b.U);
  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    interpreter,
    [initial],
  );
  const current = new V013CurrentScopeCursor(memory, scope);
  const reaction = reactV013StructuralScope(memory, current, fresh());

  same(current.members().length, 1, "membership predicate remains single-valued");
  const finalState = current.members()[0]!;
  const poles = memory.poles(finalState);
  same(
    poles.start,
    application(theory, rule),
    "membership result retains exact application identity",
  );
  assert(
    poles.end === b.L || poles.end === b.U,
    "membership result is exact L/U",
  );

  return Object.freeze({
    value: poles.end,
    rawRuleMatches: reaction.rawRuleMatches,
    quiescent: reaction.quiescent,
  });
}

// Positive exact selected membership -> L.
{
  const result = evaluateMembership(objectTheory, ruleA);
  same(result.value, b.L, "selected admission evaluates to L");
  same(result.rawRuleMatches, 1, "selected admission has one exact relation");
  same(result.quiescent, false, "positive membership transitions");
}

// Another selected member -> L. Projection is not proof-specific.
{
  const result = evaluateMembership(objectTheory, ruleB);
  same(result.value, b.L, "second selected admission evaluates to L");
  same(result.rawRuleMatches, 1, "second selected admission has one exact relation");
}

// Candidate/ambient admission added only AFTER the closed projection.
// It physically exists in Memory, but the closed membership relation-set has
// no relation for it. Existing Γ therefore preserves the initial U.
const ambientAdmissionC = memory.ensure(objectTheory, ruleC);
same(memory.find(objectTheory, ruleC), ambientAdmissionC, "ambient admission physically exists");
{
  const result = evaluateMembership(objectTheory, ruleC);
  same(result.value, b.U, "post-freeze ambient admission evaluates to U");
  same(result.rawRuleMatches, 0, "ambient admission has no selected membership relation");
  same(result.quiescent, true, "negative membership is preserved by no-match");
}

// Same Rule under a foreign Theory is a different membership question.
const foreignTheory = fresh();
const foreignAdmissionA = memory.ensure(foreignTheory, ruleA);
same(memory.find(foreignTheory, ruleA), foreignAdmissionA, "foreign admission physically exists");
{
  const result = evaluateMembership(foreignTheory, ruleA);
  same(result.value, b.U, "foreign Theory membership evaluates to U");
  same(result.rawRuleMatches, 0, "foreign Theory has no projected membership relation");
}

// Physical construction of the exact positive result does not grant authority.
// The query still begins from Member(T,R)->U and only an admitted runtime
// relation may rewrite it to L.
const forgedPositive = resultState(objectTheory, ruleC, b.L);
same(memory.poles(forgedPositive).end, b.L, "forged positive result physically exists");
{
  const result = evaluateMembership(objectTheory, ruleC);
  same(result.value, b.U, "physical L-shaped result has zero verdict authority");
}

// Closed-world dependency: if one rebuilt the membership projection from LIVE
// ObjectTheory after ambient candidate data, the ambient admission would become
// L. That would be authority injection and is therefore forbidden.
projectMembershipRelation(ambientAdmissionC);
{
  const result = evaluateMembership(objectTheory, ruleC);
  same(result.value, b.L, "unsafe post-candidate reprojection self-authorizes ambient admission");
}

console.log([
  "MTS_V015_APROVER_P1Q_CLOSED_MEMBERSHIP_LU=GREEN_RESEARCH",
  "SEMANTIC_QUERY=MEMBER_OBJECTTHEORY_RULE",
  "INITIAL_RESULT=U",
  "SELECTED_MEMBERSHIP=L",
  "CLOSED_ABSENCE=U",
  "OPEN_NOT_FOUND_EQUALS_U=FALSE",
  "POST_FREEZE_PHYSICAL_ADMISSION_AUTHORITY=0",
  "FOREIGN_THEORY_MEMBERSHIP=U",
  "PHYSICAL_FORGED_L_AUTHORITY=0",
  "NO_MATCH_PRESERVES_U=TRUE",
  "POSITIVE_MATCH_REWRITES_U_TO_L=TRUE",
  "RUNTIME_EQUALITY_REQUIRED=FALSE",
  "CARRIER_SCAN_REQUIRED=FALSE",
  "J1_REQUIRED=FALSE",
  "NEW_AMEMORY_OPCODE_REQUIRED=FALSE",
  "MEMBERSHIP_RELATION_PROJECTION=MUST_BE_PINNED_BEFORE_CANDIDATE",
  "POST_CANDIDATE_REPROJECTION=AUTHORITY_INJECTION",
].join(" "));
