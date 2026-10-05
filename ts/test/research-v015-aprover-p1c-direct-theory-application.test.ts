import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 aprover P1c direct Theory application: " + message);
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

/**
 * Test-side carrier for the complete semantic ANet state M_t.
 *
 * This is the same research boundary used by the A9 one-command candidate:
 * membership in this set models semantic ANet membership; physical Link
 * existence in Memory alone carries no authority.
 */
function aset(members: Iterable<LinkHandle>): AsetState {
  return Object.freeze({ members: new Set(members) });
}

/**
 * FORMAL application candidate:
 *
 *   F(x) == F -> x
 *
 * For ObjectTheory used as an extensional bundle/function anchor, the exact
 * application Link ObjectTheory(Rule) is therefore the same Link as the
 * admission ObjectTheory -> Rule.
 *
 * This helper does NOT search a sequence or construct a witness. It only
 * exposes the already-defined Link identity. Whether that Link has authority is
 * determined independently by semantic membership in M_t.
 */
function application(
  memory: Memory,
  fn: LinkHandle,
  arg: LinkHandle,
): LinkHandle {
  return memory.ensure(fn, arg);
}

const memory = new Memory();
const basis = ensureRootBasis(memory);

let cursor = memory.ensure(basis.U, basis.L);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, basis.C);
  return cursor;
};

const objectTheory = fresh();
const foreignTheory = fresh();
const ruleA = fresh();
const ruleB = fresh();
const ruleC = fresh();

const admissionA = memory.ensure(objectTheory, ruleA);
const admissionB = memory.ensure(objectTheory, ruleB);
const admissionC = memory.ensure(objectTheory, ruleC);
const foreignAdmissionB = memory.ensure(foreignTheory, ruleB);

// The direct FORMAL/application hypothesis has no intermediate carrier:
same(
  application(memory, objectTheory, ruleB),
  admissionB,
  "ObjectTheory(RuleB) is exactly ObjectTheory->RuleB",
);

// Selected semantic ObjectTheory authority is extensional membership, not order.
const selected = aset([
  admissionC,
  admissionA,
  admissionB,
]);
assert(
  selected.members.has(application(memory, objectTheory, ruleB)),
  "direct Theory(RuleB) is selected semantic membership",
);

// Presentation/member insertion order does not change the result.
const reordered = aset([
  admissionB,
  admissionC,
  admissionA,
]);
assert(
  reordered.members.has(application(memory, objectTheory, ruleB)),
  "reordered extensional Theory has the same direct application authority",
);

// Physical existence alone is powerless. The exact Link already exists in
// Memory, but it is deliberately absent from this selected semantic M_t.
const withoutB = aset([
  admissionA,
  admissionC,
]);
assert(
  memory.find(objectTheory, ruleB) === admissionB,
  "ObjectTheory->RuleB physically exists",
);
assert(
  !withoutB.members.has(application(memory, objectTheory, ruleB)),
  "physical ObjectTheory->RuleB outside selected M_t has zero authority",
);

// Same Rule under another Theory is a different application/admission Link and
// cannot satisfy ObjectTheory(RuleB).
const foreignOnly = aset([
  admissionA,
  admissionC,
  foreignAdmissionB,
]);
assert(
  foreignOnly.members.has(application(memory, foreignTheory, ruleB)),
  "ForeignTheory(RuleB) may be selected under the foreign anchor",
);
assert(
  !foreignOnly.members.has(application(memory, objectTheory, ruleB)),
  "ForeignTheory(RuleB) cannot authorize ObjectTheory(RuleB)",
);

// No ExactSequence, path, index, suffix or selected-admission witness appears in
// the semantic statement under test.
console.log([
  "MTS_V015_APROVER_P1C_DIRECT_THEORY_APPLICATION=GREEN_RESEARCH",
  "APPLICATION_LINK=THEORY_TO_RULE",
  "AUTHORITY=SELECTED_M_T_MEMBERSHIP",
  "THEORY_MEMBER_ORDER_SEMANTIC=FALSE",
  "PHYSICAL_EXISTENCE_AUTHORITY=0",
  "FOREIGN_THEORY_AUTHORITY=0",
  "EXACT_SEQUENCE_THEORY_CARRIER=0",
  "MEMBERSHIP_WITNESS=0",
  "SUFFIX_PATH=0",
  "INDEX_AUTHORITY=0",
  "HOST_SEQUENCE_SEARCH=0",
  "GAMMA_EXECUTION=DIRECT_NEXT_GATE",
].join(" "));
