import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  V013CurrentScopeCursor,
  defineV013WorkingScope,
  reactV013StructuralScope,
} from "../src/v013-structural-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error("v0.15 P2a DR self-verifier: " + message);
  }
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
}

interface CaseSpec {
  readonly label: string;
  readonly premiseTemplates: (
    memory: Memory,
    X: LinkHandle,
    Y: LinkHandle,
  ) => readonly LinkHandle[];
  readonly actualPremises: (
    memory: Memory,
    A: LinkHandle,
    B: LinkHandle,
  ) => readonly LinkHandle[];
}

function runCase(spec: CaseSpec): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  let cursor = memory.ensure(b.O, b.U);
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, b.C);
    return cursor;
  };

  const executionTheory = memory.ensure(b.C, b.L);
  const ADMISSIONS_OK = fresh();
  const MAKE_VERIFIER = fresh();
  const PACKET_ENTRY = fresh();
  const CHECK_APPLICATION = fresh();
  const SUBST_OK = fresh();
  const grammar = fresh();

  // Source proof Rule/DR roles and concrete values.
  const X = fresh();
  const Y = fresh();
  const sourceDictionary = defineStructuralRoleDictionary(memory, [X, Y]);
  const bodyTemplate = memory.ensure(X, Y);
  const premises = spec.premiseTemplates(memory, X, Y);
  const sourceRule = defineStructuralRule(
    memory,
    sourceDictionary,
    bodyTemplate,
  );
  const sourceDR = defineStructuralDerivationRule(
    memory,
    sourceRule,
    premises,
  );

  const A = fresh();
  const B = fresh();
  const actualClaim = memory.ensure(A, B);
  const actualPremises = spec.actualPremises(memory, A, B);
  same(
    actualPremises.length,
    premises.length,
    spec.label + " positive arity fixture",
  );
  const dependencyClaimSequence =
    materializeExactSequence(memory, actualPremises);
  const applicationPacket = memory.ensure(
    PACKET_ENTRY,
    memory.ensure(
      CHECK_APPLICATION,
      memory.ensure(actualClaim, dependencyClaimSequence),
    ),
  );

  // Meta-program roles. The DR itself is recursively decomposed:
  //
  //   DR = (Dictionary -> Body) -> PremiseTemplateSequence
  //
  // PACKET_ROLE is opaque transport data carried to the next generation.
  const D_ROLE = fresh();
  const BODY_ROLE = fresh();
  const PREMISES_ROLE = fresh();
  const PACKET_ROLE = fresh();
  const metaDictionary = defineStructuralRoleDictionary(
    memory,
    [D_ROLE, BODY_ROLE, PREMISES_ROLE, PACKET_ROLE],
  );

  const drTemplate = memory.ensure(
    memory.ensure(D_ROLE, BODY_ROLE),
    PREMISES_ROLE,
  );
  const metaAntecedent = memory.ensure(
    ADMISSIONS_OK,
    memory.ensure(
      MAKE_VERIFIER,
      memory.ensure(drTemplate, PACKET_ROLE),
    ),
  );

  // Arity-independent generated verifier:
  //
  //   source Rule body       = Body
  //   source DR premises     = PremiseTemplateSequence
  //
  //   verifier template      = Body -> PremiseTemplateSequence
  //   actual packet payload  = Claim -> DependencyClaimSequence
  //
  // Both exact sequences are already recursive Link topology. The ordinary
  // structural matcher therefore enforces one shared substitution over every
  // premise position without host iteration or an arity-specific Rule.
  const constraintTemplate = memory.ensure(BODY_ROLE, PREMISES_ROLE);
  const verifierAntecedentTemplate = memory.ensure(
    PACKET_ENTRY,
    memory.ensure(CHECK_APPLICATION, constraintTemplate),
  );
  const successImage = materializeExactSequence(memory, [SUBST_OK]);
  const verifierBodyTemplate = memory.ensure(
    verifierAntecedentTemplate,
    successImage,
  );
  const generatedVerifierTemplate = memory.ensure(
    D_ROLE,
    verifierBodyTemplate,
  );
  const generatedAdmissionTemplate = memory.ensure(
    executionTheory,
    generatedVerifierTemplate,
  );
  const generatedIndexTemplate = memory.ensure(
    CHECK_APPLICATION,
    generatedAdmissionTemplate,
  );

  const metaBody = memory.ensure(
    metaAntecedent,
    materializeExactSequence(memory, [
      generatedAdmissionTemplate,
      generatedIndexTemplate,
      PACKET_ROLE,
    ]),
  );
  const metaRule = defineStructuralRule(
    memory,
    metaDictionary,
    metaBody,
  );
  const metaAdmission = admitStructuralRule(
    memory,
    executionTheory,
    metaRule,
  );
  memory.ensure(MAKE_VERIFIER, metaAdmission);

  const interpreter = defineStructuralInterpreter(
    memory,
    metaDictionary,
    grammar,
    executionTheory,
  );

  const request = memory.ensure(
    ADMISSIONS_OK,
    memory.ensure(
      MAKE_VERIFIER,
      memory.ensure(sourceDR, applicationPacket),
    ),
  );
  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    interpreter,
    [request],
  );
  const current = new V013CurrentScopeCursor(memory, scope);

  // Generation 1 can only execute the already admitted meta-Rule. The newly
  // generated verifier/index are outputs and must not be readable this round.
  const generation1 = reactV013StructuralScope(memory, current, fresh());
  same(generation1.rawRuleMatches, 1, spec.label + " generation1 meta match");
  same(
    generation1.transitionedMembers,
    1,
    spec.label + " generation1 one transition",
  );
  same(
    generation1.handoffCount,
    1,
    spec.label + " generation1 atomic publication",
  );

  const expectedGeneratedRule = memory.ensure(
    sourceDictionary,
    memory.ensure(
      memory.ensure(
        PACKET_ENTRY,
        memory.ensure(
          CHECK_APPLICATION,
          memory.ensure(bodyTemplate, materializeExactSequence(memory, premises)),
        ),
      ),
      successImage,
    ),
  );
  const expectedGeneratedAdmission =
    memory.ensure(executionTheory, expectedGeneratedRule);
  const expectedGeneratedIndex =
    memory.ensure(CHECK_APPLICATION, expectedGeneratedAdmission);

  assert(
    current.members().includes(expectedGeneratedAdmission),
    spec.label + " generated admission published",
  );
  assert(
    current.members().includes(expectedGeneratedIndex),
    spec.label + " generated backend index published",
  );
  assert(
    current.members().includes(applicationPacket),
    spec.label + " application packet carried to next generation",
  );
  assert(
    !current.members().includes(SUBST_OK),
    spec.label + " generated verifier cannot fire in same generation",
  );

  // Generation 2 sees the generated verifier and validates arbitrary arity.
  const generation2 = reactV013StructuralScope(memory, current, fresh());
  same(
    generation2.rawRuleMatches,
    1,
    spec.label + " generation2 generated verifier match",
  );
  same(
    generation2.transitionedMembers,
    1,
    spec.label + " only packet transitions in generation2",
  );
  assert(
    current.members().includes(SUBST_OK),
    spec.label + " generated verifier emits SUBST_OK",
  );

  // One inconsistent actual dependency must fail closed under the same
  // generated verifier. Use a fresh Scope so the positive packet is not current.
  if (premises.length > 0) {
    const wrong = fresh();
    const mutated = [...actualPremises];
    mutated[mutated.length - 1] = wrong;
    const badPacket = memory.ensure(
      PACKET_ENTRY,
      memory.ensure(
        CHECK_APPLICATION,
        memory.ensure(
          actualClaim,
          materializeExactSequence(memory, mutated),
        ),
      ),
    );
    const badScope = defineV013WorkingScope(
      memory,
      fresh(),
      interpreter,
      [badPacket],
    );
    const badCurrent = new V013CurrentScopeCursor(memory, badScope);
    const badReaction =
      reactV013StructuralScope(memory, badCurrent, fresh());
    same(
      badReaction.rawRuleMatches,
      0,
      spec.label + " inconsistent dependency rejected",
    );
    same(
      badCurrent.members()[0],
      badPacket,
      spec.label + " inconsistent packet remains quiescent",
    );
  }
}

const specs: readonly CaseSpec[] = Object.freeze([
  {
    label: "arity0",
    premiseTemplates: () => [],
    actualPremises: () => [],
  },
  {
    label: "arity1",
    premiseTemplates: (memory, X, Y) => [
      memory.ensure(Y, X),
    ],
    actualPremises: (memory, A, B) => [
      memory.ensure(B, A),
    ],
  },
  {
    label: "arity2",
    premiseTemplates: (memory, X, Y) => [
      X,
      memory.ensure(Y, X),
    ],
    actualPremises: (memory, A, B) => [
      A,
      memory.ensure(B, A),
    ],
  },
  {
    label: "arity3",
    premiseTemplates: (memory, X, Y) => [
      X,
      Y,
      memory.ensure(X, Y),
    ],
    actualPremises: (memory, A, B) => [
      A,
      B,
      memory.ensure(A, B),
    ],
  },
]);

for (const spec of specs) runCase(spec);

console.log([
  "MTS_V015_P2A_DR_SELF_VERIFIER=GREEN_RESEARCH",
  "INPUT_STAGE=ADMISSIONS_ALREADY_VERIFIED",
  "SOURCE_DR_SHAPE=(DICTIONARY_TO_BODY)_TO_PREMISE_SEQUENCE",
  "GENERATED_TEMPLATE=BODY_TO_PREMISE_TEMPLATE_SEQUENCE",
  "ACTUAL_PACKET=CLAIM_TO_DEPENDENCY_CLAIM_SEQUENCE",
  "TESTED_ARITIES=0_1_2_3",
  "META_RULE_COUNT=1_PER_FIXTURE_SAME_SHAPE",
  "ARITY_SPECIFIC_VERIFIER_SOURCE_RULES=0",
  "GENERATED_RULE_USES_SOURCE_ROLE_DICTIONARY=TRUE",
  "GENERATED_ADMISSION=ORDINARY_LINK",
  "GENERATED_INDEX=FROZEN_BACKEND_COMPATIBILITY_LINK",
  "SAME_GENERATION_GENERATED_RULE_EXECUTABLE=FALSE",
  "NEXT_GENERATION_GENERATED_RULE_EXECUTABLE=TRUE",
  "HOST_PREMISE_ITERATION_IN_RUNTIME_VERIFIER=0",
  "HOST_SUBSTITUTION_IN_RUNTIME_VERIFIER=0",
  "CROSS_MEMBER_JOIN=0",
  "NEW_AMEMORY_OPCODE=0",
  "CANONICAL_APROVER_FORMAL_JSON=NOT_YET_PROPOSED",
].join(" "));
