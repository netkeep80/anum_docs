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
  if (!value) throw new Error("v0.15 P2h authority-to-local bridge: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
}

type Mode = "valid" | "missing-rule" | "missing-dr" | "ambient-dr" | "malformed";

function run(mode: Mode): Readonly<{
  final: LinkHandle;
  expectedBridge: LinkHandle | undefined;
  matches: readonly number[];
}> {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  let cursor = memory.ensure(b.U, b.L);
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, b.O);
    return cursor;
  };

  // Concrete data and every fixed program tag come before structural roles.
  const A = fresh();
  const B = fresh();
  const dependencyAct = fresh();

  const objectTheory = memory.ensure(fresh(), fresh());
  const executionTheory = memory.ensure(fresh(), fresh());

  const MEMBER = fresh();
  const ENTRY = fresh();
  const ATTEMPT = fresh();
  const MEMBER_CHECK = fresh();
  const CHECKED = fresh();
  const CONTINUE = fresh();
  const DONE = fresh();
  const DR_OK = fresh();
  const grammar = fresh();

  // Source Rule/DR roles are candidate/theory data, not aprover control roles.
  const X = fresh();
  const Y = fresh();
  const sourceDictionary = defineStructuralRoleDictionary(memory, [X, Y]);
  const bodyTemplate = memory.ensure(X, Y);
  const premiseTemplate = memory.ensure(Y, X);
  const sourceRule = defineStructuralRule(
    memory,
    sourceDictionary,
    bodyTemplate,
  );
  const sourceDR = memory.ensure(
    sourceRule,
    materializeExactSequence(memory, [premiseTemplate]),
  );

  const actualClaim = memory.ensure(A, B);
  const dependencyClaim = memory.ensure(B, A);
  const dependencyOccurrence =
    memory.ensure(dependencyClaim, dependencyAct);
  const dependencySequence =
    materializeExactSequence(memory, [dependencyOccurrence]);
  const proofOccurrence = memory.ensure(
    actualClaim,
    memory.ensure(sourceDR, dependencySequence),
  );

  // Pin selected closed ObjectTheory before any ambient mutation.
  const pinnedAdmissions: LinkHandle[] = [];
  if (mode !== "missing-rule") {
    pinnedAdmissions.push(memory.ensure(objectTheory, sourceRule));
  }
  if (mode !== "missing-dr" && mode !== "ambient-dr") {
    pinnedAdmissions.push(memory.ensure(objectTheory, sourceDR));
  }
  const pinned = Object.freeze([...pinnedAdmissions]);

  // Characteristic membership projection with continuation K, exactly the P1
  // architecture: selected closed membership rewrites U to L; closed absence
  // remains U by ordinary no-match.
  const K = fresh();
  const characteristicDictionary =
    defineStructuralRoleDictionary(memory, [K]);

  const application = (
    theory: LinkHandle,
    rule: LinkHandle,
  ): LinkHandle =>
    memory.ensure(memory.ensure(MEMBER, theory), rule);
  const memberState = (
    theory: LinkHandle,
    rule: LinkHandle,
    result: LinkHandle,
  ): LinkHandle =>
    memory.ensure(application(theory, rule), result);
  const checking = (
    continuation: LinkHandle,
    state: LinkHandle,
  ): LinkHandle =>
    memory.ensure(
      continuation,
      memory.ensure(MEMBER_CHECK, state),
    );
  const checked = (
    continuation: LinkHandle,
    state: LinkHandle,
  ): LinkHandle =>
    memory.ensure(
      continuation,
      memory.ensure(CHECKED, state),
    );

  for (const sourceAdmission of pinned) {
    const p = memory.poles(sourceAdmission);
    same(p.start, objectTheory, "pinned ObjectTheory source");
    const selected = p.end;
    const before = checking(
      K,
      memberState(objectTheory, selected, b.U),
    );
    const after = checked(
      K,
      memberState(objectTheory, selected, b.L),
    );
    const rule = defineStructuralRule(
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
      rule,
    );
    memory.ensure(MEMBER_CHECK, admission);
  }

  // Ambient post-pin authority exists physically but is excluded from the
  // closed characteristic projection.
  if (mode === "ambient-dr") {
    memory.ensure(objectTheory, sourceDR);
  }

  // Generic ProofOccurrence decomposition:
  //
  // Occ = Claim -> (DR -> DependencyOccurrenceSequence)
  // DR  = Rule -> PremiseTemplateSequence
  // Rule= Dictionary -> Body
  //
  // No host extracts Rule or DR. Ordinary structural roles reconstruct their
  // exact canonical identities for the two P1 membership requests.
  const CLAIM_R = fresh();
  const DICT_R = fresh();
  const BODY_R = fresh();
  const PREMISES_R = fresh();
  const DEPS_R = fresh();

  const ruleTemplate = memory.ensure(DICT_R, BODY_R);
  const drTemplate = memory.ensure(ruleTemplate, PREMISES_R);
  const occurrenceTemplate = memory.ensure(
    CLAIM_R,
    memory.ensure(drTemplate, DEPS_R),
  );

  const continuation1 = memory.ensure(
    CONTINUE,
    memory.ensure(drTemplate, occurrenceTemplate),
  );
  const attemptTemplate = memory.ensure(
    ENTRY,
    memory.ensure(ATTEMPT, occurrenceTemplate),
  );
  const firstCheck = checking(
    continuation1,
    memberState(objectTheory, ruleTemplate, b.U),
  );

  const decompositionDictionary = defineStructuralRoleDictionary(
    memory,
    [CLAIM_R, DICT_R, BODY_R, PREMISES_R, DEPS_R],
  );
  const decompositionRule = defineStructuralRule(
    memory,
    decompositionDictionary,
    memory.ensure(
      attemptTemplate,
      materializeExactSequence(memory, [firstCheck]),
    ),
  );
  const decompositionAdmission = admitStructuralRule(
    memory,
    executionTheory,
    decompositionRule,
  );
  memory.ensure(ATTEMPT, decompositionAdmission);

  // First selected Rule membership -> issue exact DR membership request.
  const firstChecked = checked(
    continuation1,
    memberState(objectTheory, ruleTemplate, b.L),
  );
  const continuation2 = memory.ensure(DONE, occurrenceTemplate);
  const secondCheck = checking(
    continuation2,
    memberState(objectTheory, drTemplate, b.U),
  );
  const continueRule = defineStructuralRule(
    memory,
    decompositionDictionary,
    memory.ensure(
      firstChecked,
      materializeExactSequence(memory, [secondCheck]),
    ),
  );
  const continueAdmission = admitStructuralRule(
    memory,
    executionTheory,
    continueRule,
  );
  memory.ensure(CHECKED, continueAdmission);

  // Only exact positive DR membership publishes the P2f entry shape.
  const secondChecked = checked(
    continuation2,
    memberState(objectTheory, drTemplate, b.L),
  );
  const bridge = memory.ensure(
    ENTRY,
    memory.ensure(DR_OK, occurrenceTemplate),
  );
  const finalRule = defineStructuralRule(
    memory,
    decompositionDictionary,
    memory.ensure(
      secondChecked,
      materializeExactSequence(memory, [bridge]),
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
    decompositionDictionary,
    grammar,
    executionTheory,
  );

  const candidate =
    mode === "malformed"
      ? b.R
      : proofOccurrence;
  const initial = memory.ensure(
    ENTRY,
    memory.ensure(ATTEMPT, candidate),
  );

  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    interpreter,
    [initial],
  );
  const current = new V013CurrentScopeCursor(memory, scope);
  const matches: number[] = [];

  for (let generation = 0; generation < 6; generation += 1) {
    const reaction = reactV013StructuralScope(memory, current, fresh());
    matches.push(reaction.rawRuleMatches);
    if (reaction.quiescent) break;
  }

  const expectedBridge =
    mode === "malformed"
      ? undefined
      : memory.ensure(
          ENTRY,
          memory.ensure(DR_OK, proofOccurrence),
        );

  return Object.freeze({
    final: current.members()[0]!,
    expectedBridge,
    matches: Object.freeze(matches),
  });
}

{
  const result = run("valid");
  assert(result.expectedBridge !== undefined, "valid bridge identity");
  same(
    result.final,
    result.expectedBridge,
    "selected Rule+DR publish exact P2f DR_OK occurrence entry",
  );
  same(
    JSON.stringify(result.matches),
    JSON.stringify([1, 1, 1, 1, 1, 0]),
    "valid bridge uses five ordinary transitions then quiesces",
  );
}

for (const mode of ["missing-rule", "missing-dr", "ambient-dr"] as const) {
  const result = run(mode);
  assert(
    result.expectedBridge !== undefined,
    mode + " bridge identity exists structurally",
  );
  assert(
    result.final !== result.expectedBridge,
    mode + " must not publish DR_OK bridge",
  );
}

{
  const result = run("malformed");
  same(
    JSON.stringify(result.matches),
    JSON.stringify([0]),
    "malformed candidate member fails closed at generic ATTEMPT entry",
  );
}

console.log([
  "MTS_V015_P2H_AUTHORITY_TO_LOCAL_BRIDGE=GREEN_RESEARCH",
  "INPUT=ENTRY_TO_ATTEMPT_CANDIDATE_MEMBER",
  "OCCURRENCE_DECOMPOSITION=STRUCTURAL_ONLY",
  "SOURCE_RULE_EXTRACTION=STRUCTURAL_ONLY",
  "SOURCE_DR_EXTRACTION=STRUCTURAL_ONLY",
  "P1_CHECK_1=EXACT_STRUCTURAL_RULE_MEMBERSHIP",
  "P1_CHECK_2=EXACT_DR_MEMBERSHIP",
  "OUTPUT=ENTRY_TO_DR_OK_EXACT_PROOF_OCCURRENCE",
  "EXACT_OCCURRENCE_IDENTITY_RECONSTRUCTED_CANONICALLY=TRUE",
  "MISSING_RULE=FAIL_CLOSED",
  "MISSING_DR=FAIL_CLOSED",
  "POST_PIN_AMBIENT_DR=FAIL_CLOSED",
  "MALFORMED_CANDIDATE_MEMBER=FAIL_CLOSED",
  "HOST_OCCURRENCE_CLASSIFICATION=0",
  "HOST_RULE_EXTRACTION=0",
  "HOST_DR_EXTRACTION=0",
  "HOST_MEMBERSHIP_LOOKUP=0",
  "HOST_PROOF_DISPATCH=0",
  "J1=0",
  "NEW_AMEMORY_OPCODE=0",
  "P2F_INPUT_BOUNDARY=CLOSED",
  "CANONICAL_APROVER_FORMAL_JSON=NOT_YET_PROPOSED",
].join(" "));
