import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
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
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function fail(message: string): never {
  throw new Error("research v0.15 P1aa composed package: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  if (!Object.is(actual, expected)) {
    fail(message + ": " + String(actual) + " !== " + String(expected));
  }
}

function wire(
  memory: Memory,
  basis: RootBasis,
  link: LinkHandle,
): string {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    link,
  );
  return new TextDecoder().decode(
    serializeV013HierarchicalCarrier(memory, basis, carrier),
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
const staticAproverTheory = memory.ensure(b.O, b.L);
const executionTheory = memory.ensure(b.C, b.L);
const MEMBER = fresh();
const grammar = fresh();
const empty = defineStructuralRoleDictionary(memory, []);

// Static aprover program: PING -> PONG.
const PING = fresh();
const PONG = fresh();
const staticRule = defineStructuralRule(
  memory,
  empty,
  memory.ensure(PING, materializeExactSequence(memory, [PONG])),
);
const staticSourceAdmission = admitStructuralRule(
  memory,
  staticAproverTheory,
  staticRule,
);
const staticRuntimeAdmission = admitStructuralRule(
  memory,
  executionTheory,
  staticRule,
);
const staticTrigger =
  memory.poles(memory.poles(PING).end).start;
const staticIndex = memory.ensure(staticTrigger, staticRuntimeAdmission);

// Closed ObjectTheory authority is pinned before ambient/candidate data.
const selectedRule = fresh();
const ambientRule = fresh();
const selectedObjectAdmission = memory.ensure(objectTheory, selectedRule);

const app = (rule: LinkHandle): LinkHandle =>
  memory.ensure(memory.ensure(MEMBER, objectTheory), rule);
const state = (rule: LinkHandle, result: LinkHandle): LinkHandle =>
  memory.ensure(app(rule), result);

// Sparse characteristic relation for the selected ObjectTheory member.
const memberBefore = state(selectedRule, b.U);
const memberAfter = state(selectedRule, b.L);
const membershipRule = defineStructuralRule(
  memory,
  empty,
  memory.ensure(
    memberBefore,
    materializeExactSequence(memory, [memberAfter]),
  ),
);
const membershipRuntimeAdmission = admitStructuralRule(
  memory,
  executionTheory,
  membershipRule,
);
const membershipTrigger =
  memory.poles(memory.poles(memberBefore).end).start;
const membershipIndex = memory.ensure(
  membershipTrigger,
  membershipRuntimeAdmission,
);

// Ambient ObjectTheory admission is introduced after the projection. It is
// physically present but has no characteristic relation in ExecutionTheory.
const ambientObjectAdmission = memory.ensure(objectTheory, ambientRule);
const ambientBefore = state(ambientRule, b.U);

const interpreter = defineStructuralInterpreter(
  memory,
  empty,
  grammar,
  executionTheory,
);

// Local differential: same interpreter executes both kinds of Rule.
{
  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    interpreter,
    [PING, memberBefore],
  );
  const current = new V013CurrentScopeCursor(memory, scope);
  const reaction = reactV013StructuralScope(memory, current, fresh());
  same(reaction.rawRuleMatches, 2, "composed local reaction match count");
  same(reaction.transitionedMembers, 2, "composed local reaction transition count");
  same(reaction.handoffCount, 1, "composed local reaction atomic handoff");
  const result = current.members();
  if (!result.includes(PONG)) fail("static aprover result missing");
  if (!result.includes(memberAfter)) fail("membership L result missing");
}

// Local closed-absence control.
{
  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    interpreter,
    [ambientBefore],
  );
  const current = new V013CurrentScopeCursor(memory, scope);
  const reaction = reactV013StructuralScope(memory, current, fresh());
  same(reaction.rawRuleMatches, 0, "ambient nonmember has no relation");
  same(current.members()[0], ambientBefore, "ambient nonmember remains U-state");
}

// The existing frozen replay utility supports one current member per launch.
// Two launches below use the SAME interpreter/ExecutionTheory. P1w separately
// proves simultaneous multi-current execution in one local Gamma reaction.
const staticLaunch = materializeExactSequence(
  memory,
  [interpreter, PING, PONG],
);
const membershipLaunch = materializeExactSequence(
  memory,
  [interpreter, memberBefore, memberAfter],
);
const entry = materializeExactSequence(
  memory,
  [staticLaunch, membershipLaunch],
);
const negativeLaunch = materializeExactSequence(
  memory,
  [interpreter, ambientBefore, ambientBefore],
);

const packageValue = Object.freeze({
  schema: "mts-v015-recursive-execution-package/v0.1",
  links: Object.freeze([
    wire(memory, b, staticSourceAdmission),
    wire(memory, b, selectedObjectAdmission),
    wire(memory, b, ambientObjectAdmission),
    wire(memory, b, staticIndex),
    wire(memory, b, membershipIndex),
  ]),
  entry: wire(memory, b, entry),
  negativeEntry: wire(memory, b, negativeLaunch),
});

process.stdout.write(JSON.stringify(packageValue));
