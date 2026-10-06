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
  if (!value) throw new Error("v0.15 P1s closed-bundle characteristic function: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

const memory = new Memory();
const b = ensureRootBasis(memory);
let cursor = memory.ensure(b.O, b.U);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, b.C);
  return cursor;
};

const executionTheory = memory.ensure(b.C, b.L);
const CHI = fresh();
const grammar = fresh();
const x = fresh();
const y = fresh();
const z = fresh();

// Closed extensional bundle B = {x,y}; z exists physically but is outside B.
const closedBundle = Object.freeze([x, y]);

const emptyDictionary = defineStructuralRoleDictionary(memory, []);

const application = (value: LinkHandle): LinkHandle =>
  memory.ensure(CHI, value);
const state = (value: LinkHandle, result: LinkHandle): LinkHandle =>
  memory.ensure(application(value), result);

// Generic proof-independent characteristic-function grounding:
// one positive U->L rewrite for each member of the closed bundle.
for (const member of closedBundle) {
  const before = state(member, b.U);
  const after = state(member, b.L);
  const relation = defineStructuralRule(
    memory,
    emptyDictionary,
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
  const triggerKey = memory.poles(memory.poles(before).end).start;
  memory.ensure(triggerKey, admission);
}

const interpreter = defineStructuralInterpreter(
  memory,
  emptyDictionary,
  grammar,
  executionTheory,
);

function evaluate(value: LinkHandle): LinkHandle {
  const initial = state(value, b.U);
  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    interpreter,
    [initial],
  );
  const current = new V013CurrentScopeCursor(memory, scope);
  reactV013StructuralScope(memory, current, fresh());
  same(current.members().length, 1, "characteristic function is single-valued");
  const final = current.members()[0]!;
  same(memory.poles(final).start, application(value), "application identity retained");
  return memory.poles(final).end;
}

same(evaluate(x), b.L, "x in B -> L");
same(evaluate(y), b.L, "y in B -> L");
same(evaluate(z), b.U, "z not in B -> U");

// Physical existence of z is irrelevant: every queried element is a Link.
// What matters is closed-bundle membership, not existence in ambient Memory.
assert(memory.poles(z) !== undefined, "z physically exists");
same(evaluate(z), b.U, "ambient physical existence does not imply bundle membership");

// Empty closed bundle has the canonical characteristic function constantly U.
const emptyExecutionTheory = fresh();
const emptyInterpreter = defineStructuralInterpreter(
  memory,
  emptyDictionary,
  fresh(),
  emptyExecutionTheory,
);
{
  const value = fresh();
  const initial = state(value, b.U);
  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    emptyInterpreter,
    [initial],
  );
  const current = new V013CurrentScopeCursor(memory, scope);
  const reaction = reactV013StructuralScope(memory, current, fresh());
  same(reaction.rawRuleMatches, 0, "empty bundle has zero positive membership relations");
  same(current.members()[0], initial, "empty bundle preserves U");
}

console.log([
  "MTS_V015_P1S_CLOSED_BUNDLE_CHARACTERISTIC_FUNCTION=GREEN_RESEARCH",
  "GENERAL_DOMAIN=CLOSED_FINITE_BUNDLE",
  "CHI_B_MEMBER=L",
  "CHI_B_NONMEMBER=U",
  "EMPTY_BUNDLE_CHARACTERISTIC=CONSTANT_U",
  "AMBIENT_PHYSICAL_EXISTENCE_AUTHORITY=0",
  "IMPLEMENTATION=SPARSE_POSITIVE_RELATIONS_PLUS_NO_MATCH_PRESERVATION",
  "PROOF_SPECIFIC_SEMANTICS=0",
  "THEORY_SPECIFIC_SEMANTICS=0",
  "NEW_OPCODE=0",
  "J1=0",
].join(" "));
