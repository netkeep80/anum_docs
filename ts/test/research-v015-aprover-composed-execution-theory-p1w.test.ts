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
  discoverV013TriggeredRuleImages,
  reactV013StructuralScope,
} from "../src/v013-structural-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 P1w composed aprover execution Theory: " + message);
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
const staticAproverTheory = memory.ensure(b.C, b.L);
const executionTheory = fresh();
const MEMBER = fresh();
const grammar = fresh();

const selectedRule = fresh();
const selectedAdmission = memory.ensure(objectTheory, selectedRule);

// Static aprover program witness, independent of ObjectTheory.
const PING = fresh();
const PONG = fresh();
const staticDictionary = defineStructuralRoleDictionary(memory, []);
const staticBody = memory.ensure(
  PING,
  materializeExactSequence(memory, [PONG]),
);
const staticRule = defineStructuralRule(
  memory,
  staticDictionary,
  staticBody,
);
const staticAdmission = admitStructuralRule(
  memory,
  staticAproverTheory,
  staticRule,
);

// Derived ExecutionTheory receives a generic compatibility copy of the static
// aprover Rule. This is package composition, not ObjectTheory mutation.
const staticRuntimeAdmission = admitStructuralRule(
  memory,
  executionTheory,
  staticRule,
);
const staticTriggerKey =
  memory.poles(memory.poles(PING).end).start;
memory.ensure(staticTriggerKey, staticRuntimeAdmission);

// Independently pinned ObjectTheory membership is projected into a sparse
// characteristic relation in the same derived ExecutionTheory.
const application = (
  theory: LinkHandle,
  rule: LinkHandle,
): LinkHandle =>
  memory.ensure(memory.ensure(MEMBER, theory), rule);
const state = (
  theory: LinkHandle,
  rule: LinkHandle,
  result: LinkHandle,
): LinkHandle =>
  memory.ensure(application(theory, rule), result);

const memberBefore = state(objectTheory, selectedRule, b.U);
const memberAfter = state(objectTheory, selectedRule, b.L);
const membershipBody = memory.ensure(
  memberBefore,
  materializeExactSequence(memory, [memberAfter]),
);
const membershipRule = defineStructuralRule(
  memory,
  staticDictionary,
  membershipBody,
);
const membershipRuntimeAdmission = admitStructuralRule(
  memory,
  executionTheory,
  membershipRule,
);
memory.ensure(
  memory.poles(memberBefore).start,
  membershipRuntimeAdmission,
);

// ObjectTheory itself remains exactly its original selected admission.
const exactObjectAdmissions = memory
  .outgoing(objectTheory)
  .filter((link) => {
    const p = memory.poles(link);
    return p.start === objectTheory && p.end === selectedRule;
  });
same(exactObjectAdmissions.length, 1, "ObjectTheory remains unchanged");
same(exactObjectAdmissions[0], selectedAdmission, "same ObjectTheory admission");

// Static AproverTheory also remains a distinct source program authority.
same(
  memory.find(staticAproverTheory, staticRule),
  staticAdmission,
  "static AproverTheory remains independently identifiable",
);

const interpreter = defineStructuralInterpreter(
  memory,
  staticDictionary,
  grammar,
  executionTheory,
);

same(
  discoverV013TriggeredRuleImages(memory, executionTheory, PING).length,
  1,
  "static aprover current discovers exactly one Rule before composition",
);
same(
  discoverV013TriggeredRuleImages(memory, executionTheory, memberBefore).length,
  1,
  "membership current discovers exactly one Rule before composition",
);

// One ordinary reaction processes both a static aprover current and a
// characteristic-membership current under the same derived execution Theory.
const scope = defineV013WorkingScope(
  memory,
  fresh(),
  interpreter,
  [PING, memberBefore],
);
const current = new V013CurrentScopeCursor(memory, scope);
const reaction = reactV013StructuralScope(memory, current, fresh());

same(reaction.rawRuleMatches, 2, "two independent ordinary relations match");
same(reaction.transitionedMembers, 2, "both current members transition");
same(reaction.handoffCount, 1, "one atomic successor publication");

const result = current.members();
same(result.length, 2, "two successor members");
assert(result.includes(PONG), "static aprover result survives composition");
assert(result.includes(memberAfter), "membership L result survives composition");

// Ambient physical ObjectTheory addition after the projection has no derived
// runtime membership relation and therefore remains U, while the static aprover
// part continues to execute unchanged.
const ambientRule = fresh();
const ambientAdmission = memory.ensure(objectTheory, ambientRule);
const ambientBefore = state(objectTheory, ambientRule, b.U);

const scope2 = defineV013WorkingScope(
  memory,
  fresh(),
  interpreter,
  [PING, ambientBefore],
);
const current2 = new V013CurrentScopeCursor(memory, scope2);
const reaction2 = reactV013StructuralScope(memory, current2, fresh());
same(reaction2.rawRuleMatches, 1, "only static aprover relation matches ambient case");
const result2 = current2.members();
assert(result2.includes(PONG), "static aprover still runs");
assert(result2.includes(ambientBefore), "ambient closed nonmember remains U-state");
same(memory.find(objectTheory, ambientRule), ambientAdmission, "ambient admission physically exists");

console.log([
  "MTS_V015_P1W_COMPOSED_APROVER_EXECUTION_THEORY=GREEN_RESEARCH",
  "STATIC_APROVER_THEORY=INDEPENDENT",
  "OBJECT_THEORY=INDEPENDENT",
  "EXECUTION_THEORY=DERIVED_COMPOSITION",
  "STATIC_APROVER_RULES_PLUS_CHARACTERISTIC_RELATIONS=ONE_GAMMA",
  "OBJECT_THEORY_MUTATION=0",
  "STATIC_APROVER_THEORY_MUTATION=0",
  "SELECTED_MEMBERSHIP=L",
  "POST_FREEZE_AMBIENT_MEMBERSHIP=U",
  "ENGINE_INTERPRETER_COUNT=1",
  "SECOND_RUNTIME_AUTHORITY_PLANE_REQUIRED=FALSE",
  "PROOF_SPECIFIC_OPCODE=0",
].join(" "));
