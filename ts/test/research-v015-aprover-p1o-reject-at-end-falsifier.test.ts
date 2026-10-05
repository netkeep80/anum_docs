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
  if (!value) throw new Error("v0.15 aprover P1o reject-at-end falsifier: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

const memory = new Memory();
const b = ensureRootBasis(memory);
let cursor = memory.ensure(b.U, b.L);
const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, b.C));

const aproverTheory = fresh();
const objectTheory = memory.ensure(b.L, b.U);
const verifyTag = fresh();
const acceptTag = fresh();
const rejectTag = fresh();
const context = fresh();
const grammar = fresh();

const state = (
  theory: LinkHandle,
  snapshot: LinkHandle,
  referencedRule: LinkHandle,
): LinkHandle =>
  memory.ensure(
    verifyTag,
    memory.ensure(theory, memory.ensure(snapshot, referencedRule)),
  );

const accepted = (theory: LinkHandle, rule: LinkHandle): LinkHandle =>
  memory.ensure(acceptTag, memory.ensure(theory, rule));

const rejected = (theory: LinkHandle, rule: LinkHandle): LinkHandle =>
  memory.ensure(rejectTag, memory.ensure(theory, rule));

const cell = (previous: LinkHandle, value: LinkHandle): LinkHandle =>
  memory.ensureStartSelfClosed(memory.ensure(previous, value));

// Generic SKIP.
{
  const k = fresh(), theory = fresh(), prev = fresh(), value = fresh(), ref = fresh();
  const dict = defineStructuralRoleDictionary(memory, [k, theory, prev, value, ref]);
  const before = memory.ensure(k, state(theory, cell(prev, value), ref));
  const after = memory.ensure(k, state(theory, prev, ref));
  const rule = defineStructuralRule(
    memory,
    dict,
    memory.ensure(before, materializeExactSequence(memory, [after])),
  );
  const admission = admitStructuralRule(memory, aproverTheory, rule);
  memory.ensure(verifyTag, admission);
}

// Exact ACCEPT at a matching cell.
{
  const k = fresh(), theory = fresh(), prev = fresh(), ref = fresh();
  const dict = defineStructuralRoleDictionary(memory, [k, theory, prev, ref]);
  const exactAdmission = memory.ensure(theory, ref);
  const before = memory.ensure(k, state(theory, cell(prev, exactAdmission), ref));
  const after = memory.ensure(k, accepted(theory, ref));
  const rule = defineStructuralRule(
    memory,
    dict,
    memory.ensure(before, materializeExactSequence(memory, [after])),
  );
  const admission = admitStructuralRule(memory, aproverTheory, rule);
  memory.ensure(verifyTag, admission);
}

// Naive explicit REJECT: exhausting the carrier at ROOT appears to mean
// "not found". This test demonstrates why that is not sound under all-match
// generalized branching: a successful scan still has a parallel SKIP branch
// that reaches ROOT.
{
  const k = fresh(), theory = fresh(), ref = fresh();
  const dict = defineStructuralRoleDictionary(memory, [k, theory, ref]);
  const before = memory.ensure(k, state(theory, b.R, ref));
  const after = memory.ensure(k, rejected(theory, ref));
  const rule = defineStructuralRule(
    memory,
    dict,
    memory.ensure(before, materializeExactSequence(memory, [after])),
  );
  const admission = admitStructuralRule(memory, aproverTheory, rule);
  memory.ensure(verifyTag, admission);
}

const empty = defineStructuralRoleDictionary(memory, []);
const interpreter = defineStructuralInterpreter(
  memory,
  empty,
  grammar,
  aproverTheory,
);

function execute(
  carrier: LinkHandle,
  referencedRule: LinkHandle,
): readonly LinkHandle[] {
  const initial = memory.ensure(
    context,
    state(objectTheory, carrier, referencedRule),
  );
  const scope = defineV013WorkingScope(memory, fresh(), interpreter, [initial]);
  const current = new V013CurrentScopeCursor(memory, scope);
  for (let i = 0; i < 64; i += 1) {
    const step = reactV013StructuralScope(memory, current, fresh());
    if (step.quiescent) return current.members();
  }
  throw new Error("v0.15 aprover P1o reject-at-end falsifier: no quiescence");
}

const ruleA = fresh();
const ruleB = fresh();
const ruleC = fresh();
const admissionA = memory.ensure(objectTheory, ruleA);
const admissionB = memory.ensure(objectTheory, ruleB);
const admissionC = memory.ensure(objectTheory, ruleC);
const carrier = materializeExactSequence(
  memory,
  [admissionA, admissionB, admissionC],
);

// Positive membership: exact ACCEPT fires at B, but generic SKIP also continues
// from the same cell and eventually triggers root REJECT.
{
  const result = execute(carrier, ruleB);
  const accept = memory.ensure(context, accepted(objectTheory, ruleB));
  const reject = memory.ensure(context, rejected(objectTheory, ruleB));
  assert(result.includes(accept), "positive scan contains ACCEPT");
  assert(result.includes(reject), "positive scan ALSO contains naive REJECT");
}

// Negative membership: only root REJECT remains.
{
  const absentRule = fresh();
  // Physical ObjectTheory->absentRule deliberately does not exist.
  const result = execute(carrier, absentRule);
  const accept = memory.ensure(context, accepted(objectTheory, absentRule));
  const reject = memory.ensure(context, rejected(objectTheory, absentRule));
  assert(!result.includes(accept), "negative scan has no ACCEPT");
  assert(result.includes(reject), "negative scan contains REJECT");
}

console.log([
  "MTS_V015_APROVER_P1O_REJECT_AT_END=FALSIFIED",
  "POSITIVE_SCAN_ACCEPT=TRUE",
  "POSITIVE_SCAN_NAIVE_REJECT=TRUE",
  "NEGATIVE_SCAN_ACCEPT=FALSE",
  "NEGATIVE_SCAN_REJECT=TRUE",
  "CAUSE=ALL_MATCH_BRANCHING_SKIP_AND_ACCEPT",
  "ROOT_EXHAUSTION_ALONE_PROVES_NONMEMBERSHIP=FALSE",
  "EXPLICIT_EXCLUSIVE_L_U_FROM_LINEAR_POSITIVE_SCAN=OPEN",
  "QUIESCENT_NO_ACCEPT_AS_REJECTION=SEPARATE_DESIGN_OPTION",
  "NEW_GAMMA_CAPABILITY_JUSTIFIED=FALSE",
].join(" "));
