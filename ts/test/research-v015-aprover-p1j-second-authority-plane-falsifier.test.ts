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
  if (!value) throw new Error("v0.15 aprover P1j second authority plane: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

const memory = new Memory();
const b = ensureRootBasis(memory);
let cursor = memory.ensure(b.U, b.L);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, b.C);
  return cursor;
};

const aproverTheory = fresh();
const objectTheory = fresh();
const referencedRule = fresh();
const objectAdmission = memory.ensure(objectTheory, referencedRule);

// Candidate carries exact structural data, including the physically existing
// admission Link. This is the strongest ordinary-J0 request shape: if existing
// Γ cannot distinguish selected-vs-unselected authority here, merely changing
// syntax cannot fix the missing second authority plane.
const VERIFY = fresh();
const ACCEPT = fresh();
const request = memory.ensure(VERIFY, objectAdmission);
const accepted = memory.ensure(ACCEPT, objectAdmission);

// AproverTheory has an ordinary grounded Rule that validates only the exact
// request topology presented above. No proof-specific opcode or host callback.
const dictionary = defineStructuralRoleDictionary(memory, []);
const body = memory.ensure(
  request,
  materializeExactSequence(memory, [accepted]),
);
const checkerRule = defineStructuralRule(memory, dictionary, body);
const checkerAdmission = admitStructuralRule(
  memory,
  aproverTheory,
  checkerRule,
);

// Existing Γ discovery needs its ordinary trigger index. This index refers to
// the checker admission in AproverTheory only; it carries no ObjectTheory
// selected-membership information.
const triggerKey = memory.poles(memory.poles(request).end).start;
memory.ensure(triggerKey, checkerAdmission);

const authorityDictionary = defineStructuralRoleDictionary(memory, []);
const grammar = fresh();
const aproverInterpreter = defineStructuralInterpreter(
  memory,
  authorityDictionary,
  grammar,
  aproverTheory,
);

function run(): readonly LinkHandle[] {
  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    aproverInterpreter,
    [request],
  );
  const current = new V013CurrentScopeCursor(memory, scope);
  const step = reactV013StructuralScope(memory, current, fresh());
  same(step.rawRuleMatches, 1, "ordinary AproverTheory checker matches once");
  same(step.handoffCount, 1, "ordinary checker publishes one successor Scope");
  return current.members();
}

// Two semantic ObjectTheory selections over the SAME physical Memory.
// They must have different membership truth, but current Γ has no parameter
// carrying this second-plane selection.
const objectTheorySelectedWith = new Set<LinkHandle>([objectAdmission]);
const objectTheorySelectedWithout = new Set<LinkHandle>();

assert(
  objectTheorySelectedWith.has(objectAdmission),
  "positive ObjectTheory selection admits referenced Rule",
);
assert(
  !objectTheorySelectedWithout.has(objectAdmission),
  "negative ObjectTheory selection omits referenced Rule",
);

// Existing Γ invocation is identical in both semantic cases because its only
// selected execution authority is aproverInterpreter/AproverTheory.
const positiveActual = run();
const negativeActual = run();

same(positiveActual.length, 1, "positive run one output");
same(negativeActual.length, 1, "negative run one output");
same(positiveActual[0], accepted, "positive selected membership accepts");
same(
  negativeActual[0],
  accepted,
  "negative second-plane selection is unobservable to existing Γ",
);

// This is the falsifier: the desired predicate differs while the ordinary Γ
// observation does not.
const positiveExpectedMembership = objectTheorySelectedWith.has(objectAdmission);
const negativeExpectedMembership = objectTheorySelectedWithout.has(objectAdmission);
assert(
  positiveExpectedMembership !== negativeExpectedMembership,
  "the two ObjectTheory semantic worlds require different membership verdicts",
);
same(
  positiveActual[0],
  negativeActual[0],
  "existing Γ cannot distinguish those worlds under one AproverTheory",
);

// Obvious escape hatch: externally switch the one engine authority to
// ObjectTheory. That does not compose the two authority planes: the aprover
// checker Rule is no longer admitted under the selected primary Theory and the
// request is quiescent.
const objectInterpreter = defineStructuralInterpreter(
  memory,
  authorityDictionary,
  grammar,
  objectTheory,
);
{
  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    objectInterpreter,
    [request],
  );
  const current = new V013CurrentScopeCursor(memory, scope);
  const step = reactV013StructuralScope(memory, current, fresh());
  same(step.rawRuleMatches, 0, "ObjectTheory alone has no aprover checker Rule");
  same(step.handoffCount, 0, "external interpreter switch cannot validate");
  same(current.members()[0], request, "request remains quiescent");
}

// If we admit the checker Rule into ObjectTheory, execution becomes possible,
// but that mutates/augments the exact ObjectTheory authority being checked.
// This is therefore a falsifier for the naive "merge both theories" escape.
const augmentedCheckerAdmission = admitStructuralRule(
  memory,
  objectTheory,
  checkerRule,
);
memory.ensure(triggerKey, augmentedCheckerAdmission);
{
  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    objectInterpreter,
    [request],
  );
  const current = new V013CurrentScopeCursor(memory, scope);
  const step = reactV013StructuralScope(memory, current, fresh());
  same(step.rawRuleMatches, 1, "augmented ObjectTheory can run checker");
  same(current.members()[0], accepted, "augmented Theory accepts request");
}
assert(
  augmentedCheckerAdmission !== checkerAdmission,
  "checker admission into ObjectTheory is a distinct authority Link",
);

console.log([
  "MTS_V015_APROVER_P1J_SECOND_AUTHORITY_PLANE_EXISTING_GAMMA=FALSIFIED",
  "PHYSICAL_MEMORY=SAME",
  "CURRENT_ENDPOINT=SAME",
  "APROVER_INTERPRETER=SAME",
  "APROVER_THEORY=SAME",
  "OBJECT_THEORY_SELECTED_MEMBERSHIP=DIFFERS",
  "EXISTING_GAMMA_RESULT=IDENTICAL",
  "PRESENT_PHYSICAL_ADMISSION_AS_WITNESS=INSUFFICIENT",
  "STRUCTURAL_J0_MATCH=INSUFFICIENT_FOR_SECOND_PLANE_AUTHORITY",
  "HOST_INTERPRETER_SWITCH_AS_COMPOSITION=FALSIFIED",
  "OBJECT_THEORY_PLUS_APROVER_RULES=MUTATED_AUTHORITY",
  "NEW_OPCODE_USED=FALSE",
  "SECOND_PLANE_SELECTION_INPUT_TO_GAMMA=ABSENT",
  "MINIMAL_GENERIC_CAPABILITY_GAP=SECOND_AUTHORITY_PLANE_READ",
].join(" "));
