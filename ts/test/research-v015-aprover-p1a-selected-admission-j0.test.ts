import {
  materializeExactSequence,
} from "../src/exact-sequence.js";
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
  defineV013WorkingScope,
  reactV013StructuralScope,
  V013CurrentScopeCursor,
} from "../src/v013-structural-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 aprover P1a J0: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": " + String(actual) + " !== " + String(expected));
}

function sameMembers(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, message + " cardinality");
  for (const member of expected) assert(actual.includes(member), message + " member");
}

interface Fixture {
  readonly memory: Memory;
  readonly aproverTheory: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly verifyTag: LinkHandle;
  readonly acceptTag: LinkHandle;
  readonly context: LinkHandle;
  readonly objectTheory: LinkHandle;
  readonly foreignTheory: LinkHandle;
  readonly ruleA: LinkHandle;
  readonly ruleB: LinkHandle;
  readonly fresh: () => LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, basis.C);
    return cursor;
  };

  const aproverTheory = fresh();
  const grammar = fresh();
  const emptyAuthority = defineStructuralRoleDictionary(memory, []);
  const interpreter = defineStructuralInterpreter(
    memory,
    emptyAuthority,
    grammar,
    aproverTheory,
  );

  return Object.freeze({
    memory,
    aproverTheory,
    interpreter,
    verifyTag: fresh(),
    acceptTag: fresh(),
    context: fresh(),
    objectTheory: fresh(),
    foreignTheory: fresh(),
    ruleA: fresh(),
    ruleB: fresh(),
    fresh,
  });
}

/**
 * Research-only P1a aprover slice.
 *
 * Current endpoint:
 *
 *   VERIFY -> (
 *     ExpectedObjectTheory
 *       -> (
 *         ExactSequence([ExpectedObjectTheory -> ReferencedRule])
 *           -> ReferencedRule
 *       )
 *   )
 *
 * The repeated role identities force one selected admission to agree with:
 * - the trusted launch-selected ObjectTheory;
 * - the proof candidate's referenced Rule.
 *
 * This is a single J0 structural endpoint. It does not search the whole Theory,
 * does not add aprover Rules to ObjectTheory, and does not use host admission
 * lookup as proof authority.
 */
function installP1a(f: Fixture): LinkHandle {
  const kRole = f.fresh();
  const theoryRole = f.fresh();
  const ruleRole = f.fresh();

  const dictionary = defineStructuralRoleDictionary(
    f.memory,
    [kRole, theoryRole, ruleRole],
  );

  const selectedAdmissionTemplate = f.memory.ensure(theoryRole, ruleRole);
  const snapshotTemplate = materializeExactSequence(
    f.memory,
    [selectedAdmissionTemplate],
  );
  const verificationPayloadTemplate = f.memory.ensure(
    theoryRole,
    f.memory.ensure(snapshotTemplate, ruleRole),
  );
  const antecedentTemplate = f.memory.ensure(
    f.verifyTag,
    verificationPayloadTemplate,
  );

  const before = f.memory.ensure(kRole, antecedentTemplate);

  const acceptedAdmissionTemplate = f.memory.ensure(theoryRole, ruleRole);
  const acceptedEndpointTemplate = f.memory.ensure(
    f.acceptTag,
    acceptedAdmissionTemplate,
  );
  const image = materializeExactSequence(
    f.memory,
    [f.memory.ensure(kRole, acceptedEndpointTemplate)],
  );

  const rule = defineStructuralRule(
    f.memory,
    dictionary,
    f.memory.ensure(before, image),
  );
  const admission = admitStructuralRule(
    f.memory,
    f.aproverTheory,
    rule,
  );

  // Existing v0.13/v0.15 structural backend uses a trigger-key projection for
  // relation discovery. This is backend compatibility/index topology only.
  f.memory.ensure(f.verifyTag, admission);
  return rule;
}

function request(
  f: Fixture,
  trustedTheory: LinkHandle,
  snapshotAdmission: LinkHandle,
  proofRule: LinkHandle,
): LinkHandle {
  const snapshot = materializeExactSequence(f.memory, [snapshotAdmission]);
  const payload = f.memory.ensure(
    trustedTheory,
    f.memory.ensure(snapshot, proofRule),
  );
  return f.memory.ensure(
    f.context,
    f.memory.ensure(f.verifyTag, payload),
  );
}

function accepted(
  f: Fixture,
  theory: LinkHandle,
  rule: LinkHandle,
): LinkHandle {
  return f.memory.ensure(
    f.context,
    f.memory.ensure(
      f.acceptTag,
      f.memory.ensure(theory, rule),
    ),
  );
}

function run(f: Fixture, current: LinkHandle) {
  const scope = defineV013WorkingScope(
    f.memory,
    f.fresh(),
    f.interpreter,
    [current],
  );
  const cursor = new V013CurrentScopeCursor(f.memory, scope);
  const reaction = reactV013StructuralScope(
    f.memory,
    cursor,
    f.fresh(),
  );
  return Object.freeze({ cursor, reaction });
}

// Positive: the pinned launch Theory, selected admission and proof Rule agree.
{
  const f = fixture();
  installP1a(f);

  const objectAdmission = f.memory.ensure(f.objectTheory, f.ruleA);
  const current = request(
    f,
    f.objectTheory,
    objectAdmission,
    f.ruleA,
  );
  const result = run(f, current);

  sameMembers(
    result.cursor.members(),
    [accepted(f, f.objectTheory, f.ruleA)],
    "valid selected admission",
  );
  same(result.reaction.rawRuleMatches, 1, "valid selected admission match");
  same(result.reaction.quiescent, false, "valid selected admission reacts");
}

// Foreign Theory: proof Rule agrees, but selected admission belongs to another
// Theory than the trusted launch-selected ObjectTheory.
{
  const f = fixture();
  installP1a(f);

  const foreignAdmission = f.memory.ensure(f.foreignTheory, f.ruleA);
  const current = request(
    f,
    f.objectTheory,
    foreignAdmission,
    f.ruleA,
  );
  const result = run(f, current);

  sameMembers(result.cursor.members(), [current], "foreign Theory remains unresolved");
  same(result.reaction.rawRuleMatches, 0, "foreign Theory rejected structurally");
  same(result.reaction.quiescent, true, "foreign Theory is inert");
}

// Wrong witness: snapshot points to RuleB while proof references RuleA.
{
  const f = fixture();
  installP1a(f);

  const wrongAdmission = f.memory.ensure(f.objectTheory, f.ruleB);
  const current = request(
    f,
    f.objectTheory,
    wrongAdmission,
    f.ruleA,
  );
  const result = run(f, current);

  sameMembers(result.cursor.members(), [current], "wrong witness remains unresolved");
  same(result.reaction.rawRuleMatches, 0, "wrong witness rejected structurally");
}

// Ambient physical existence is not enough. The correct T->RuleA Link exists,
// but the trusted snapshot contains only T->RuleB.
{
  const f = fixture();
  installP1a(f);

  f.memory.ensure(f.objectTheory, f.ruleA); // ambient physical Link only
  const selectedOther = f.memory.ensure(f.objectTheory, f.ruleB);
  const current = request(
    f,
    f.objectTheory,
    selectedOther,
    f.ruleA,
  );
  const result = run(f, current);

  sameMembers(
    result.cursor.members(),
    [current],
    "ambient unselected admission has zero authority",
  );
  same(result.reaction.rawRuleMatches, 0, "ambient unselected admission does not match");
}

// AproverTheory remains distinct from ObjectTheory. The verifier Rule is
// admitted only to AproverTheory; no aprover admission is added to ObjectTheory.
{
  const f = fixture();
  const verifier = installP1a(f);
  assert(
    f.memory.find(f.aproverTheory, verifier) !== undefined,
    "verifier admitted to AproverTheory",
  );
  same(
    f.memory.find(f.objectTheory, verifier),
    undefined,
    "ObjectTheory is not augmented with aprover Rule",
  );
}

console.log([
  "MTS_V015_APROVER_P1A_SELECTED_ADMISSION=GREEN_RESEARCH",
  "EXECUTION=ORDINARY_GAMMA_J0",
  "APROVER_THEORY_NE_OBJECT_THEORY=YES",
  "OBJECT_THEORY_AUGMENTED=NO",
  "HOST_ADMISSION_BOOLEAN=0",
  "SELECTED_ADMISSION_WITNESS=STRUCTURALLY_VALIDATED",
  "FOREIGN_THEORY=INERT",
  "WRONG_WITNESS=INERT",
  "AMBIENT_UNSELECTED_LINK_AUTHORITY=0",
  "NEGATIVE_VERDICT=QUIESCENT_UNRESOLVED_RESEARCH_ONLY",
  "MULTI_ADMISSION_TRAVERSAL=OPEN",
  "FORMAL_APROVER_SOURCE=OPEN",
  "FROZEN_AMEMORY_REPLAY=OPEN",
].join(" "));
