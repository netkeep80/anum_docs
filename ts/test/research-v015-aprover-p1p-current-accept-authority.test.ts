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
  if (!value) throw new Error("v0.15 aprover P1p current ACCEPT authority: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

const memory = new Memory();
const b = ensureRootBasis(memory);
let cursor = memory.ensure(b.U, b.L);
const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, b.C));

const objectTheory = memory.ensure(b.L, b.U);
const aproverTheory = fresh();
const verifyTag = fresh();
const acceptTag = fresh();
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
const cell = (previous: LinkHandle, value: LinkHandle): LinkHandle =>
  memory.ensureStartSelfClosed(memory.ensure(previous, value));

// Witness-free SKIP.
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

// Exact ACCEPT.
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

const empty = defineStructuralRoleDictionary(memory, []);
const interpreter = defineStructuralInterpreter(
  memory,
  empty,
  grammar,
  aproverTheory,
);

function run(
  initialMembers: readonly LinkHandle[],
): readonly LinkHandle[] {
  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    interpreter,
    initialMembers,
  );
  const current = new V013CurrentScopeCursor(memory, scope);
  for (let i = 0; i < 64; i += 1) {
    const step = reactV013StructuralScope(memory, current, fresh());
    if (step.quiescent) return current.members();
  }
  throw new Error("v0.15 aprover P1p current ACCEPT authority: no quiescence");
}

const selectedRule = fresh();
const selectedAdmission = memory.ensure(objectTheory, selectedRule);
const selectedCarrier = materializeExactSequence(memory, [selectedAdmission]);

const absentRule = fresh();
const negativeCarrier = materializeExactSequence(memory, []);

// Candidate can physically construct the exact ACCEPT-shaped Link. Physical
// existence alone must not make it a verdict.
const forgedAcceptEndpoint = accepted(objectTheory, absentRule);
const forgedAcceptCurrent = memory.ensure(context, forgedAcceptEndpoint);
same(
  memory.find(context, forgedAcceptEndpoint),
  forgedAcceptCurrent,
  "forged ACCEPT-shaped current Link physically exists",
);

// Trusted orchestration selects exactly the VERIFY entry, not arbitrary
// candidate-chosen current members.
const negativeVerify = memory.ensure(
  context,
  state(objectTheory, negativeCarrier, absentRule),
);
{
  const result = run([negativeVerify]);
  assert(
    !result.includes(forgedAcceptCurrent),
    "physical forged ACCEPT is not current verdict when not selected as entry",
  );
}

// Positive carrier causes Γ itself to publish ACCEPT into current.
const positiveVerify = memory.ensure(
  context,
  state(objectTheory, selectedCarrier, selectedRule),
);
const positiveAccept = memory.ensure(
  context,
  accepted(objectTheory, selectedRule),
);
{
  const result = run([positiveVerify]);
  assert(
    result.includes(positiveAccept),
    "valid membership makes structural ACCEPT current",
  );
}

// If host let the candidate choose initial current membership, forged ACCEPT
// would persist by ordinary no-match semantics. Therefore entry/current
// selection is part of trusted generic orchestration, exactly as #2003 permits.
{
  const result = run([negativeVerify, forgedAcceptCurrent]);
  assert(
    result.includes(forgedAcceptCurrent),
    "candidate-seeded current ACCEPT would be unsafe",
  );
}

console.log([
  "MTS_V015_APROVER_P1P_CURRENT_ACCEPT_AUTHORITY=GREEN_RESEARCH",
  "PHYSICAL_ACCEPT_EXISTENCE_AUTHORITY=0",
  "FINAL_CURRENT_ACCEPT_MEMBERSHIP=POSITIVE_VERDICT_CANDIDATE",
  "VALID_SCAN_PUBLISHES_ACCEPT=TRUE",
  "INVALID_SCAN_WITH_PHYSICAL_FORGED_ACCEPT_PUBLISHES_ACCEPT=FALSE",
  "CANDIDATE_SELECTED_INITIAL_CURRENT=UNSAFE",
  "TRUSTED_ENTRY_SELECTION_REQUIRED=TRUE",
  "HOST_ENTRY_SELECTION_PROOF_SEMANTICS=FALSE",
  "EXPLICIT_REJECT_LINK=STILL_OPEN",
].join(" "));
