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
  StructuralRuleError,
} from "../src/structural-rule.js";
import { unifyStructuralRuleTemplate } from "../src/structural-unification.js";
import {
  defineV013GroundedExecutionScope,
  reactV013GroundedScope,
  V013GroundedScopeCursor,
} from "../src/v013-grounded-execution.js";
import {
  defineV013WorkingScope,
  instantiateV013StructuralTemplate,
  reactV013StructuralScope,
  V013CurrentScopeCursor,
} from "../src/v013-structural-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 M6 match-power falsifier: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function sameMembers(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, message + " cardinality");
  for (const value of expected) {
    assert(actual.includes(value), message + " missing expected member");
  }
}

function anchor(
  memory: Memory,
  seed: LinkHandle,
  salt: LinkHandle,
  count: number,
): readonly LinkHandle[] {
  const out: LinkHandle[] = [];
  let current = memory.ensure(seed, salt);
  for (let index = 0; index < count; index += 1) {
    current = memory.ensure(current, index % 2 === 0 ? salt : seed);
    out.push(current);
  }
  return Object.freeze(out);
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const a = anchor(memory, basis.U, basis.L, 40);
const at = (index: number): LinkHandle => {
  const value = a[index];
  assert(value !== undefined, "anchor " + index);
  return value;
};

// All reusable values are built before Theory roots so no later anchor chain
// accidentally creates an admission from a selected Theory.
const K = at(0);
const tag = at(1);
const grammar = at(2);
const xRole = at(3);
const yRole = at(4);
const kRole = at(5);
const A = at(6);
const B = at(7);
const theorySeedA = at(30);
const theorySeedB = at(31);
const structuralTheorySeedA = at(32);
const structuralTheorySeedB = at(33);

const groundedTheory = memory.ensure(theorySeedA, theorySeedB);
const structuralTheory = memory.ensure(
  structuralTheorySeedA,
  structuralTheorySeedB,
);

const templateArgs = memory.ensure(xRole, yRole);
const antecedentTemplate = memory.ensure(tag, templateArgs);
const outputTemplate = memory.ensure(yRole, xRole);

const actualArgs = memory.ensure(A, B);
const actualApplication = memory.ensure(tag, actualArgs);
const active = memory.ensure(K, actualApplication);
const expectedOutput = memory.ensure(B, A);
const expectedTruth = memory.ensure(K, expectedOutput);

// --- Candidate A: exact grounded MP has no power to infer a structural match.
//
// The parameteric source template exists, but no exact grounded relation for
// actualApplication is admitted yet. Exact MP must therefore preserve current
// truth and report NO_MATCH.
{
  const scope = defineV013GroundedExecutionScope(
    memory,
    at(34),
    groundedTheory,
    [active],
  );
  const cursor = new V013GroundedScopeCursor(memory, scope);
  const reaction = reactV013GroundedScope(memory, cursor, at(35));

  sameMembers(cursor.members(), [active], "exact grounded MP before grounding");
  same(reaction.matchedRelations, 0, "exact MP cannot infer template match");
  same(reaction.handoffCount, 0, "exact MP no grounded relation means no handoff");
  same(reaction.quiescent, true, "exact MP is quiescent before grounding");
}

// --- Generic META-A grounding.
//
// One read-only structural match against ONE explicit actual endpoint produces
// a concrete grounded relation. No current-member join participates.
let groundedRelation: LinkHandle;
{
  const beforeMatch = memory.linkCount;
  const bindings = unifyStructuralRuleTemplate(
    memory,
    antecedentTemplate,
    actualApplication,
    [xRole, yRole],
  );
  same(memory.linkCount, beforeMatch, "generic template match is read-only");

  const groundedOutput = instantiateV013StructuralTemplate(
    memory,
    outputTemplate,
    bindings,
  );
  same(groundedOutput, expectedOutput, "generic grounding output");

  const image = materializeExactSequence(memory, [groundedOutput]);
  groundedRelation = memory.ensure(actualApplication, image);
  memory.ensure(groundedTheory, groundedRelation);
}

// The very same exact-MP floor now succeeds because the missing exact relation
// has been produced by the generic grounder.
{
  const scope = defineV013GroundedExecutionScope(
    memory,
    at(36),
    groundedTheory,
    [active],
  );
  const cursor = new V013GroundedScopeCursor(memory, scope);
  const reaction = reactV013GroundedScope(memory, cursor, at(37));

  sameMembers(cursor.members(), [expectedTruth], "exact MP after grounding");
  same(reaction.matchedRelations, 1, "one newly grounded relation matched");
  same(reaction.transitionedMembers, 1, "one current member transitioned");
  same(reaction.handoffCount, 1, "grounded MP one atomic handoff");
}

// --- Candidate B: structural-unary generalized MP.
//
// The same parameteric semantics can be executed directly in one reaction when
// structural template matching is admitted as part of the reaction primitive.
// It still consumes ONE current member; this is not a cross-member join.
{
  const dictionary = defineStructuralRoleDictionary(
    memory,
    [kRole, xRole, yRole],
  );
  const before = memory.ensure(kRole, antecedentTemplate);
  const after = memory.ensure(kRole, outputTemplate);
  const image = materializeExactSequence(memory, [after]);
  const body = memory.ensure(before, image);
  const rule = defineStructuralRule(memory, dictionary, body);
  const admission = admitStructuralRule(memory, structuralTheory, rule);

  // Legacy structural engine uses a derived local trigger index. The trigger
  // is backend acceleration/compatibility topology, not source semantics.
  memory.ensure(tag, admission);

  const interpreter = defineStructuralInterpreter(
    memory,
    dictionary,
    grammar,
    structuralTheory,
  );
  const scope = defineV013WorkingScope(
    memory,
    at(38),
    interpreter,
    [active],
  );
  const cursor = new V013CurrentScopeCursor(memory, scope);
  const reaction = reactV013StructuralScope(memory, cursor, at(39));

  sameMembers(
    cursor.members(),
    [expectedTruth],
    "structural-unary direct reaction result",
  );
  same(reaction.rawRuleMatches, 1, "structural-unary one template match");
  same(reaction.transitionedMembers, 1, "structural-unary one current member");
  same(reaction.handoffCount, 1, "structural-unary one atomic handoff");
}

// A malformed actual with inconsistent repeated-role requirements is a
// grounding/matching problem, not evidence for multi-member join.
{
  const repeatedTemplate = memory.ensure(
    tag,
    memory.ensure(xRole, xRole),
  );
  const inconsistentActual = memory.ensure(
    tag,
    memory.ensure(A, B),
  );

  let rejected = false;
  const before = memory.linkCount;
  try {
    unifyStructuralRuleTemplate(
      memory,
      repeatedTemplate,
      inconsistentActual,
      [xRole],
    );
  } catch (error) {
    assert(error instanceof StructuralRuleError, "repeated-role mismatch type");
    same(error.code, "template-mismatch", "repeated-role mismatch code");
    rejected = true;
  }
  same(memory.linkCount, before, "failed structural match is read-only");
  assert(rejected, "repeated-role mismatch rejects");
}

console.log([
  "MTS_V015_META_M6=MATCH_POWER_FALSIFIER_GREEN",
  "CURRENT_MEMBER_COUNT=1",
  "GROUNDED_EXACT_BEFORE_META=NO_MATCH",
  "GENERIC_META_GROUNDING=CREATES_EXACT_RELATION",
  "GROUNDED_EXACT_AFTER_META=GREEN",
  "STRUCTURAL_UNARY_DIRECT=GREEN",
  "STRUCTURAL_UNARY_JOINT_MEMBER_ARITY=1",
  "CROSS_MEMBER_JOIN_USED=0",
  "MATCH_POWER_CHOICE=PROVEN_DISTINCT",
  "META_A_PLUS_EXACT_MP=BEHAVIORALLY_SUFFICIENT_FOR_VECTOR",
  "STRUCTURAL_UNARY_MP=BEHAVIORALLY_SUFFICIENT_FOR_VECTOR",
  "V015_SELECTION=OPEN_NECESSITY_DECISION",
].join(" "));
