import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  PortableStructuralTheoryError,
  exportPortableStructuralTheory,
  verifySelectedTheoryAdmissionAuthority,
} from "../src/portable-theory.js";
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
  if (!value) throw new Error("v0.15 aprover P1k exact-Theory differential: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}
function expectTheoryReject(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof PortableStructuralTheoryError
      && error.code === "proof-theory-mismatch",
      message + ": wrong error",
    );
    return;
  }
  throw new Error("v0.15 aprover P1k exact-Theory differential: " + message + ": expected reject");
}

const memory = new Memory();
const b = ensureRootBasis(memory);
let cursor = memory.ensure(b.U, b.L);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, b.C);
  return cursor;
};

// ---------------------------------------------------------------------------
// 1. Independently freeze exact ObjectTheory authority.
// ---------------------------------------------------------------------------

const objectTheory = fresh();
const admittedRule = fresh();
const admitted = memory.ensure(objectTheory, admittedRule);

const frozenObjectTheory = exportPortableStructuralTheory(
  memory,
  objectTheory,
);

// Candidate/ambient data arrives only AFTER the exact ObjectTheory snapshot.
const ambientRule = fresh();
const ambient = memory.ensure(objectTheory, ambientRule);

verifySelectedTheoryAdmissionAuthority(
  memory,
  objectTheory,
  admitted,
  frozenObjectTheory,
);
expectTheoryReject(
  () => verifySelectedTheoryAdmissionAuthority(
    memory,
    objectTheory,
    ambient,
    frozenObjectTheory,
  ),
  "ambient post-freeze admission has zero selected ObjectTheory authority",
);

// The physical shapes are equally ordinary outgoing links of the live anchor.
same(memory.find(objectTheory, admittedRule), admitted, "admitted physical pair exists");
same(memory.find(objectTheory, ambientRule), ambient, "ambient physical pair exists");

// ---------------------------------------------------------------------------
// 2. Build one ordinary generic AproverTheory checker under existing Γ.
//    It receives a supplied admission-shaped Link as data and emits ACCEPT.
// ---------------------------------------------------------------------------

const aproverTheory = fresh();
const VERIFY = fresh();
const ACCEPT = fresh();
const callerRole = fresh();
const admissionRole = fresh();

const before = memory.ensure(
  callerRole,
  memory.ensure(VERIFY, admissionRole),
);
const after = memory.ensure(
  callerRole,
  memory.ensure(ACCEPT, admissionRole),
);
const checkerDictionary = defineStructuralRoleDictionary(
  memory,
  [callerRole, admissionRole],
);
const checkerBody = memory.ensure(
  before,
  materializeExactSequence(memory, [after]),
);
const checkerRule = defineStructuralRule(
  memory,
  checkerDictionary,
  checkerBody,
);
const checkerAdmission = admitStructuralRule(
  memory,
  aproverTheory,
  checkerRule,
);

// Trigger key for K -> (VERIFY -> admission) is VERIFY.
memory.ensure(VERIFY, checkerAdmission);

const interpreterDictionary = defineStructuralRoleDictionary(memory, []);
const grammar = fresh();
const aproverInterpreter = defineStructuralInterpreter(
  memory,
  interpreterDictionary,
  grammar,
  aproverTheory,
);
const caller = fresh();

function run(candidateAdmission: LinkHandle): LinkHandle {
  const request = memory.ensure(
    caller,
    memory.ensure(VERIFY, candidateAdmission),
  );
  const expected = memory.ensure(
    caller,
    memory.ensure(ACCEPT, candidateAdmission),
  );
  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    aproverInterpreter,
    [request],
  );
  const current = new V013CurrentScopeCursor(memory, scope);
  const reaction = reactV013StructuralScope(memory, current, fresh());
  same(reaction.rawRuleMatches, 1, "generic checker gets one structural match");
  same(reaction.handoffCount, 1, "generic checker publishes one successor");
  same(current.members().length, 1, "one checker result");
  same(current.members()[0], expected, "checker returns structural ACCEPT");
  return expected;
}

// Existing ordinary Γ cannot distinguish exact selected admission from a later
// ambient same-shaped admission when both are supplied as physical Link data.
const acceptedSelected = run(admitted);
const acceptedAmbient = run(ambient);
assert(acceptedSelected !== acceptedAmbient, "outputs preserve exact supplied witness identity");

// The key differential:
//
// trusted exact-Theory authority:
//   admitted -> ACCEPT
//   ambient  -> REJECT
//
// existing Γ under AproverTheory:
//   admitted -> ACCEPT
//   ambient  -> ACCEPT
//
// Therefore structural presentation of the physical admission is insufficient
// to refine the currently required exact-Theory semantics.
console.log([
  "MTS_V015_APROVER_P1K_EXACT_THEORY_DIFFERENTIAL=GAP_CONFIRMED",
  "FROZEN_OBJECT_THEORY=INDEPENDENT",
  "SELECTED_ADMISSION_TRUSTED_ORACLE=ACCEPT",
  "AMBIENT_POST_FREEZE_ADMISSION_TRUSTED_ORACLE=REJECT",
  "ORDINARY_GAMMA_SELECTED_PHYSICAL_WITNESS=ACCEPT",
  "ORDINARY_GAMMA_AMBIENT_PHYSICAL_WITNESS=ACCEPT",
  "PHYSICAL_ADMISSION_SHAPE_EQUALS_SELECTED_AUTHORITY=FALSE",
  "CANDIDATE_SELF_ADMISSION_AUTHORITY=0",
  "EXISTING_GAMMA_REFINES_EXACT_THEORY_BOUNDARY=FALSE",
  "ADDRESS_PROTOCOL_RELEVANCE=NONE",
  "PROOF_SEARCH_RELEVANCE=NONE",
  "MISSING_INFORMATION=SELECTED_OBJECT_THEORY_AUTHORITY",
].join(" "));
