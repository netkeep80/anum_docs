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
    throw new Error("v0.15 P1ac two-admission verifier: " + message);
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

const objectTheory = memory.ensure(b.L, b.C);
const executionTheory = memory.ensure(b.C, b.L);
const MEMBER = fresh();
const REQUEST = fresh();
const VERIFY_TWO = fresh();
const MEMBER_CHECK = fresh();
const CHECKED = fresh();
const CONTINUE = fresh();
const DONE = fresh();
const ACCEPT = fresh();
const grammar = fresh();

// The two cited authorities model the exact pair required by one structural
// proof occurrence in rooted-proof-aset:
//   Theory -> StructuralRule
//   Theory -> PrimitiveDerivationRule
const structuralRule = fresh();
const derivationRule = fresh();
const absentRule = fresh();
const selectedStructuralAdmission =
  memory.ensure(objectTheory, structuralRule);
const selectedDerivationAdmission =
  memory.ensure(objectTheory, derivationRule);

const pinnedObjectAdmissions = Object.freeze([
  selectedStructuralAdmission,
  selectedDerivationAdmission,
]);

const application = (theory: LinkHandle, rule: LinkHandle): LinkHandle =>
  memory.ensure(memory.ensure(MEMBER, theory), rule);
const state = (
  theory: LinkHandle,
  rule: LinkHandle,
  result: LinkHandle,
): LinkHandle =>
  memory.ensure(application(theory, rule), result);
const checking = (
  continuation: LinkHandle,
  memberState: LinkHandle,
): LinkHandle =>
  memory.ensure(
    continuation,
    memory.ensure(MEMBER_CHECK, memberState),
  );
const checked = (
  continuation: LinkHandle,
  memberState: LinkHandle,
): LinkHandle =>
  memory.ensure(
    continuation,
    memory.ensure(CHECKED, memberState),
  );

// ---------------------------------------------------------------------------
// Characteristic membership projection with one generic continuation role.
// ---------------------------------------------------------------------------
//
// This is the P1q sparse L/U characteristic relation lifted under an ordinary
// current continuation K:
//
//   K -> (MEMBER_CHECK -> Member(T,R)->U)
//       =>
//   K -> (CHECKED      -> Member(T,R)->L)
//
// One projected Rule exists per exact selected closed member. K is structural
// control data, not ObjectTheory semantics.
const K_ROLE = fresh();
const characteristicDictionary = defineStructuralRoleDictionary(
  memory,
  [K_ROLE],
);

for (const sourceAdmission of pinnedObjectAdmissions) {
  const poles = memory.poles(sourceAdmission);
  same(poles.start, objectTheory, "pinned characteristic source Theory");
  const rule = poles.end;
  const before = checking(
    K_ROLE,
    state(objectTheory, rule, b.U),
  );
  const after = checked(
    K_ROLE,
    state(objectTheory, rule, b.L),
  );
  const relation = defineStructuralRule(
    memory,
    characteristicDictionary,
    memory.ensure(
      before,
      materializeExactSequence(memory, [after]),
    ),
  );
  const admission = admitStructuralRule(
    memory,
    executionTheory,
    relation,
  );
  // Stable phase trigger, independent of T/R/K.
  memory.ensure(MEMBER_CHECK, admission);
}

// ---------------------------------------------------------------------------
// Static aprover program: two exact admission checks, then ACCEPT.
// ---------------------------------------------------------------------------
const T_ROLE = fresh();
const R1_ROLE = fresh();
const R2_ROLE = fresh();

const queryDictionary = defineStructuralRoleDictionary(
  memory,
  [T_ROLE, R1_ROLE, R2_ROLE],
);

const continuation1 = memory.ensure(
  CONTINUE,
  memory.ensure(T_ROLE, R2_ROLE),
);
const requestTemplate = memory.ensure(
  REQUEST,
  memory.ensure(
    VERIFY_TWO,
    memory.ensure(T_ROLE, memory.ensure(R1_ROLE, R2_ROLE)),
  ),
);
const firstCheckTemplate = checking(
  continuation1,
  state(T_ROLE, R1_ROLE, b.U),
);
const builderRule = defineStructuralRule(
  memory,
  queryDictionary,
  memory.ensure(
    requestTemplate,
    materializeExactSequence(memory, [firstCheckTemplate]),
  ),
);
const builderAdmission = admitStructuralRule(
  memory,
  executionTheory,
  builderRule,
);
memory.ensure(VERIFY_TWO, builderAdmission);

// After the first positive membership, recover T/R2 from continuation and issue
// the second U request. R1 is still matched in the checked state so the whole
// transition remains structurally tied to the supplied certificate tuple.
const firstCheckedTemplate = checked(
  continuation1,
  state(T_ROLE, R1_ROLE, b.L),
);
const secondCheckTemplate = checking(
  DONE,
  state(T_ROLE, R2_ROLE, b.U),
);
const continuationRule = defineStructuralRule(
  memory,
  queryDictionary,
  memory.ensure(
    firstCheckedTemplate,
    materializeExactSequence(memory, [secondCheckTemplate]),
  ),
);
const continuationAdmission = admitStructuralRule(
  memory,
  executionTheory,
  continuationRule,
);
memory.ensure(CHECKED, continuationAdmission);

// Only a positive second check reaches ACCEPT.
const finalDictionary = defineStructuralRoleDictionary(
  memory,
  [T_ROLE, R2_ROLE],
);
const finalCheckedTemplate = checked(
  DONE,
  state(T_ROLE, R2_ROLE, b.L),
);
const finalRule = defineStructuralRule(
  memory,
  finalDictionary,
  memory.ensure(
    finalCheckedTemplate,
    materializeExactSequence(memory, [ACCEPT]),
  ),
);
const finalAdmission = admitStructuralRule(
  memory,
  executionTheory,
  finalRule,
);
memory.ensure(CHECKED, finalAdmission);

const interpreter = defineStructuralInterpreter(
  memory,
  queryDictionary,
  grammar,
  executionTheory,
);

interface RunResult {
  readonly final: LinkHandle;
  readonly matches: readonly number[];
  readonly states: readonly LinkHandle[];
}

function run(
  theory: LinkHandle,
  first: LinkHandle,
  second: LinkHandle,
): RunResult {
  const request = memory.ensure(
    REQUEST,
    memory.ensure(
      VERIFY_TWO,
      memory.ensure(theory, memory.ensure(first, second)),
    ),
  );
  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    interpreter,
    [request],
  );
  const current = new V013CurrentScopeCursor(memory, scope);
  const matches: number[] = [];
  const states: LinkHandle[] = [request];

  for (let generation = 0; generation < 5; generation += 1) {
    const reaction = reactV013StructuralScope(memory, current, fresh());
    same(current.members().length, 1, "two-admission pipeline stays single-valued");
    matches.push(reaction.rawRuleMatches);
    states.push(current.members()[0]!);
  }

  return Object.freeze({
    final: current.members()[0]!,
    matches: Object.freeze(matches),
    states: Object.freeze(states),
  });
}

// Both exact cited authorities are selected -> deterministic ACCEPT.
{
  const result = run(objectTheory, structuralRule, derivationRule);
  same(result.final, ACCEPT, "two selected admissions reach ACCEPT");
  same(
    JSON.stringify(result.matches),
    JSON.stringify([1, 1, 1, 1, 1]),
    "positive path uses exactly one ordinary Rule per generation",
  );
}

// First cited authority absent -> first membership U becomes quiescent and the
// verifier never reaches ACCEPT.
{
  const result = run(objectTheory, absentRule, derivationRule);
  assert(result.final !== ACCEPT, "missing first admission must not ACCEPT");
  same(
    result.states[2],
    checking(
      memory.ensure(CONTINUE, memory.ensure(objectTheory, derivationRule)),
      state(objectTheory, absentRule, b.U),
    ),
    "first missing admission halts at explicit U membership state",
  );
  same(
    JSON.stringify(result.matches),
    JSON.stringify([1, 0, 0, 0, 0]),
    "first missing admission is fail-closed quiescence",
  );
}

// Second cited authority absent -> first check succeeds, continuation issues the
// second U query, and the verifier halts without ACCEPT.
{
  const result = run(objectTheory, structuralRule, absentRule);
  assert(result.final !== ACCEPT, "missing second admission must not ACCEPT");
  same(
    result.states[4],
    checking(
      DONE,
      state(objectTheory, absentRule, b.U),
    ),
    "second missing admission halts at explicit U membership state",
  );
  same(
    JSON.stringify(result.matches),
    JSON.stringify([1, 1, 1, 0, 0]),
    "second missing admission is fail-closed quiescence",
  );
}

// Ambient post-pin admission does not alter the closed projection.
const ambientAdmission = memory.ensure(objectTheory, absentRule);
same(
  memory.find(objectTheory, absentRule),
  ambientAdmission,
  "ambient absentRule admission physically exists after pin",
);
{
  const result = run(objectTheory, structuralRule, absentRule);
  assert(
    result.final !== ACCEPT,
    "post-pin ambient second admission still must not ACCEPT",
  );
  same(
    JSON.stringify(result.matches),
    JSON.stringify([1, 1, 1, 0, 0]),
    "ambient post-pin admission has zero characteristic authority",
  );
}

console.log([
  "MTS_V015_P1AC_TWO_ADMISSION_NATIVE_VERIFIER=GREEN_RESEARCH",
  "PROOF_OCCURRENCE_PRESSURE=STRUCTURAL_RULE_PLUS_DERIVATION_RULE_MEMBERSHIP",
  "PIPELINE=REQUEST_CHECK1_CHECKED_CONTINUE_CHECK2_CHECKED_ACCEPT",
  "SELECTED_SELECTED=ACCEPT",
  "MISSING_FIRST=QUIESCENT_U_NO_ACCEPT",
  "MISSING_SECOND=QUIESCENT_U_NO_ACCEPT",
  "POST_PIN_AMBIENT_SECOND=QUIESCENT_U_NO_ACCEPT",
  "CONTINUATION=CARRIED_IN_CURRENT_LINK",
  "MEMBERSHIP_RESULT=L_OR_U_ROLE",
  "EXPLICIT_FINAL_REJECT=OPEN",
  "FAIL_CLOSED_NO_ACCEPT=TRUE",
  "ONE_EXECUTION_THEORY=TRUE",
  "ONE_INTERPRETER=TRUE",
  "ONE_RULE_PER_GENERATION=TRUE",
  "CROSS_MEMBER_JOIN=0",
  "HOST_MEMBERSHIP_LOOKUP=0",
  "HOST_PROOF_RULE_DISPATCH=0",
  "NEW_AMEMORY_OPCODE=0",
  "CANONICAL_APROVER_FORMAL_JSON=NOT_YET_PROPOSED",
].join(" "));
