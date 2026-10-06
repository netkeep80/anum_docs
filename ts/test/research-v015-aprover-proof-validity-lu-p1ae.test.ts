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
  if (!value) {
    throw new Error("v0.15 P1ae proof-validity L/U verdict: " + message);
  }
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
const executionTheory = memory.ensure(b.C, b.L);

const VALID_PROOF = fresh();
const MEMBER = fresh();
const VERIFY_TWO = fresh();
const MEMBER_CHECK = fresh();
const CHECKED = fresh();
const CONTINUE = fresh();
const DONE = fresh();
const grammar = fresh();

const structuralRule = fresh();
const derivationRule = fresh();
const absentRule = fresh();

const selectedStructuralAdmission =
  memory.ensure(objectTheory, structuralRule);
const selectedDerivationAdmission =
  memory.ensure(objectTheory, derivationRule);
const pinnedObjectAdmissions = Object.freeze([
  selectedStructuralAdmission,
  selectedDerivationAdmission,
]);

const proof = (
  theory: LinkHandle,
  first: LinkHandle,
  second: LinkHandle,
): LinkHandle =>
  memory.ensure(theory, memory.ensure(first, second));
const verdict = (
  proofCertificate: LinkHandle,
  result: LinkHandle,
): LinkHandle =>
  memory.ensure(
    memory.ensure(VALID_PROOF, proofCertificate),
    result,
  );
const application = (
  theory: LinkHandle,
  rule: LinkHandle,
): LinkHandle =>
  memory.ensure(memory.ensure(MEMBER, theory), rule);
const membershipState = (
  theory: LinkHandle,
  rule: LinkHandle,
  result: LinkHandle,
): LinkHandle =>
  memory.ensure(application(theory, rule), result);

const checking = (
  verdictState: LinkHandle,
  memberState: LinkHandle,
  continuation: LinkHandle,
): LinkHandle =>
  memory.ensure(
    verdictState,
    memory.ensure(
      MEMBER_CHECK,
      memory.ensure(memberState, continuation),
    ),
  );
const checked = (
  verdictState: LinkHandle,
  memberState: LinkHandle,
  continuation: LinkHandle,
): LinkHandle =>
  memory.ensure(
    verdictState,
    memory.ensure(
      CHECKED,
      memory.ensure(memberState, continuation),
    ),
  );

// ---------------------------------------------------------------------------
// Closed-membership characteristic projection, context-preserving.
// ---------------------------------------------------------------------------
const VERDICT_ROLE = fresh();
const CONT_ROLE = fresh();
const characteristicDictionary = defineStructuralRoleDictionary(
  memory,
  [VERDICT_ROLE, CONT_ROLE],
);

for (const sourceAdmission of pinnedObjectAdmissions) {
  const poles = memory.poles(sourceAdmission);
  same(poles.start, objectTheory, "pinned ObjectTheory source");
  const rule = poles.end;
  const before = checking(
    VERDICT_ROLE,
    membershipState(objectTheory, rule, b.U),
    CONT_ROLE,
  );
  const after = checked(
    VERDICT_ROLE,
    membershipState(objectTheory, rule, b.L),
    CONT_ROLE,
  );
  const relation = defineStructuralRule(
    memory,
    characteristicDictionary,
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
  memory.ensure(MEMBER_CHECK, admission);
}

// ---------------------------------------------------------------------------
// Generic verifier program.
// ---------------------------------------------------------------------------
//
// The whole verifier is a characteristic function of ONE supplied certificate:
//
//   ValidProof(P) -> U
//       ...
//   only complete successful replay
//       ...
//   ValidProof(P) -> L
//
// Here U/L have exactly this selected role. U does NOT mean the theorem/Claim
// is false, and L does NOT assert uniqueness of this derivation.
const T_ROLE = fresh();
const R1_ROLE = fresh();
const R2_ROLE = fresh();
const verifierDictionary = defineStructuralRoleDictionary(
  memory,
  [T_ROLE, R1_ROLE, R2_ROLE],
);

const proofTemplate = proof(T_ROLE, R1_ROLE, R2_ROLE);
const verdictUTemplate = verdict(proofTemplate, b.U);
const verdictLTemplate = verdict(proofTemplate, b.L);
const continuation1Template = memory.ensure(
  CONTINUE,
  memory.ensure(T_ROLE, R2_ROLE),
);

// Entry contains only the supplied proof certificate. The first ordinary
// aprover reaction constructs the canonical ValidProof(P)->U state itself.
// Neither candidate nor host supplies an L/U result field.
const requestTemplate = memory.ensure(
  REQUEST,
  memory.ensure(VERIFY_TWO, proofTemplate),
);
const firstCheckTemplate = checking(
  verdictUTemplate,
  membershipState(T_ROLE, R1_ROLE, b.U),
  continuation1Template,
);
const builderRule = defineStructuralRule(
  memory,
  verifierDictionary,
  memory.ensure(
    requestTemplate,
    materializeExactSequence(memory, [firstCheckTemplate]),
  ),
);
const builderAdmission = admitStructuralRule(
  memory,
  executionTheory,
  builderRule,
);
memory.ensure(VERIFY_TWO, builderAdmission);

const firstCheckedTemplate = checked(
  verdictUTemplate,
  membershipState(T_ROLE, R1_ROLE, b.L),
  continuation1Template,
);
const secondCheckTemplate = checking(
  verdictUTemplate,
  membershipState(T_ROLE, R2_ROLE, b.U),
  DONE,
);
const continuationRule = defineStructuralRule(
  memory,
  verifierDictionary,
  memory.ensure(
    firstCheckedTemplate,
    materializeExactSequence(memory, [secondCheckTemplate]),
  ),
);
const continuationAdmission = admitStructuralRule(
  memory,
  executionTheory,
  continuationRule,
);
memory.ensure(CHECKED, continuationAdmission);

const finalCheckedTemplate = checked(
  verdictUTemplate,
  membershipState(T_ROLE, R2_ROLE, b.L),
  DONE,
);
const finalRule = defineStructuralRule(
  memory,
  verifierDictionary,
  memory.ensure(
    finalCheckedTemplate,
    materializeExactSequence(memory, [verdictLTemplate]),
  ),
);
const finalAdmission = admitStructuralRule(
  memory,
  executionTheory,
  finalRule,
);
memory.ensure(CHECKED, finalAdmission);

const interpreter = defineStructuralInterpreter(
  memory,
  verifierDictionary,
  grammar,
  executionTheory,
);

interface RunResult {
  readonly certificate: LinkHandle;
  readonly initialVerdict: LinkHandle;
  readonly final: LinkHandle;
  readonly matches: readonly number[];
}

function run(
  theory: LinkHandle,
  first: LinkHandle,
  second: LinkHandle,
): RunResult {
  const certificate = proof(theory, first, second);
  const initialVerdict = verdict(certificate, b.U);
  const request = memory.ensure(
    REQUEST,
    memory.ensure(VERIFY_TWO, certificate),
  );
  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    interpreter,
    [request],
  );
  const current = new V013CurrentScopeCursor(memory, scope);
  const matches: number[] = [];

  for (let generation = 0; generation < 5; generation += 1) {
    const reaction = reactV013StructuralScope(memory, current, fresh());
    same(current.members().length, 1, "verifier remains single-valued");
    matches.push(reaction.rawRuleMatches);
  }

  return Object.freeze({
    certificate,
    initialVerdict,
    final: current.members()[0]!,
    matches: Object.freeze(matches),
  });
}

function assertFailedCertificate(
  result: RunResult,
  expectedMatches: readonly number[],
  message: string,
): void {
  same(
    JSON.stringify(result.matches),
    JSON.stringify(expectedMatches),
    message + " / path",
  );
  assert(
    result.final !== verdict(result.certificate, b.L),
    message + " / must not produce L",
  );

  // A failed path remains current under the same exact U verdict carrier.
  same(
    memory.poles(result.final).start,
    result.initialVerdict,
    message + " / current carries ValidProof(P)->U",
  );
  same(
    memory.poles(result.initialVerdict).end,
    b.U,
    message + " / U role is structurally explicit",
  );
}

// Complete certificate -> L.
{
  const result = run(objectTheory, structuralRule, derivationRule);
  same(
    result.final,
    verdict(result.certificate, b.L),
    "complete supplied certificate -> ValidProof(P)->L",
  );
  same(
    JSON.stringify(result.matches),
    JSON.stringify([1, 1, 1, 1, 1]),
    "complete certificate path",
  );
}

// Invalid supplied certificate -> U remains its current verdict carrier.
{
  const result = run(objectTheory, absentRule, derivationRule);
  assertFailedCertificate(
    result,
    [1, 0, 0, 0, 0],
    "missing first cited admission",
  );
}
{
  const result = run(objectTheory, structuralRule, absentRule);
  assertFailedCertificate(
    result,
    [1, 1, 1, 0, 0],
    "missing second cited admission",
  );
}

// Post-pin physical admission cannot repair the already closed authority view.
const ambientAdmission = memory.ensure(objectTheory, absentRule);
same(
  memory.find(objectTheory, absentRule),
  ambientAdmission,
  "ambient physical admission exists",
);
{
  const result = run(objectTheory, structuralRule, absentRule);
  assertFailedCertificate(
    result,
    [1, 1, 1, 0, 0],
    "post-pin ambient admission has zero proof authority",
  );
}

console.log([
  "MTS_V015_P1AE_PROOF_VALIDITY_LU_VERDICT=GREEN_RESEARCH",
  "VERDICT=VALID_PROOF_P_TO_L_OR_U",
  "L_ROLE=SUPPLIED_CERTIFICATE_ACCEPTED_BY_SELECTED_VERIFIER",
  "U_ROLE=SUPPLIED_CERTIFICATE_NOT_ACCEPTED_BY_SELECTED_VERIFIER",
  "U_NE_THEOREM_FALSE=TRUE",
  "CERTIFICATE_VALIDITY_NE_CLAIM_DERIVABILITY=TRUE",
  "INITIAL_REQUEST_RESULT_BIT=0",
  "GENERATION_1_CONSTRUCTS_VALID_PROOF_P_TO_U",
  "ONLY_COMPLETE_REPLAY_REWRITES_VERDICT_TO_L",
  "MISSING_FIRST=U",
  "MISSING_SECOND=U",
  "POST_PIN_AMBIENT_SECOND=U",
  "FINAL_VERDICT_IS_STRUCTURAL_LINK=TRUE",
  "CANDIDATE_RESULT_BIT=0",
  "CROSS_MEMBER_JOIN=0",
  "HOST_PROOF_RULE_DISPATCH=0",
  "NEW_AMEMORY_OPCODE=0",
  "CANONICAL_APROVER_FORMAL_JSON=NOT_YET_PROPOSED",
].join(" "));
