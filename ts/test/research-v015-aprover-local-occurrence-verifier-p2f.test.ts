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
import { defineStructuralDerivationRule } from "../src/derivation.js";
import {
  V013CurrentScopeCursor,
  defineV013WorkingScope,
  reactV013StructuralScope,
} from "../src/v013-structural-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 P2f local occurrence verifier: " + message);
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

function runCase(
  spec: CaseSpec,
  mutate: "none" | "claim" | "premise" | "authority",
): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  let cursor = memory.ensure(b.U, b.L);
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, b.O);
    return cursor;
  };

  // Concrete values first: later program roles cannot occur recursively inside
  // the actual proof data.
  const A = fresh();
  const B = fresh();
  const alternate = fresh();
  const dependencyActs = Array.from({ length: 6 }, () => fresh());

  // Source DR under test.
  const X = fresh();
  const Y = fresh();
  const sourceDictionary = defineStructuralRoleDictionary(memory, [X, Y]);
  const bodyTemplate = memory.ensure(X, Y);
  const premiseTemplates = spec.premiseTemplates(memory, X, Y);
  const sourceRule = defineStructuralRule(
    memory,
    sourceDictionary,
    bodyTemplate,
  );
  const sourceDR = defineStructuralDerivationRule(
    memory,
    sourceRule,
    premiseTemplates,
  );

  const expectedClaim = memory.ensure(A, B);
  let actualClaim = expectedClaim;
  let actualPremiseClaims = [...spec.actualPremises(memory, A, B)];

  if (mutate === "claim") {
    actualClaim = memory.ensure(A, alternate);
  }
  if (mutate === "premise" && actualPremiseClaims.length > 0) {
    actualPremiseClaims[0] = alternate;
  }

  same(
    actualPremiseClaims.length,
    premiseTemplates.length,
    spec.label + " fixture arity",
  );

  const dependencyOccurrences = actualPremiseClaims.map(
    (claim, index) =>
      memory.ensure(claim, dependencyActs[index] ?? dependencyActs[0]!),
  );
  const dependencyOccurrenceSequence =
    materializeExactSequence(memory, dependencyOccurrences);
  const proofOccurrence = memory.ensure(
    actualClaim,
    memory.ensure(sourceDR, dependencyOccurrenceSequence),
  );

  // Program constants/tags.
  const executionTheory = memory.ensure(fresh(), fresh());
  const ENTRY = fresh();
  const DR_OK = fresh();
  const DR_BAD = fresh();
  const MAP = fresh();
  const UNWIND = fresh();
  const PUSH = fresh();
  const DONE = fresh();
  const AFTER_MAP = fresh();
  const META = fresh();
  const ADMISSIONS_OK = fresh();
  const MAKE_VERIFIER = fresh();
  const PACKET_ENTRY = fresh();
  const CHECK_APPLICATION = fresh();
  const LOCAL_OK = fresh();
  const grammar = fresh();

  // CTX is a role of the GENERATED verifier, but is grounded data from the
  // meta-program's point of view. Allocate it before meta roles.
  const CTX = fresh();

  // Entry decomposition roles.
  const CLAIM_R = fresh();
  const DR_R = fresh();
  const DEPS_R = fresh();

  // Dependency occurrence -> Claim mapper roles.
  const PREV = fresh();
  const DEP_CLAIM = fresh();
  const DEP_ACT = fresh();
  const CONT = fresh();
  const STACK_CLAIM = fresh();
  const REST = fresh();
  const ACC = fresh();
  const META_R = fresh();

  // Meta-verifier roles.
  const DICT_SEQ_R = fresh();
  const BODY_R = fresh();
  const PREMISES_R = fresh();
  const PACKET_R = fresh();
  const OCC_R = fresh();

  function indexedRule(
    roles: readonly LinkHandle[],
    before: LinkHandle,
    outputs: readonly LinkHandle[],
    trigger: LinkHandle,
  ): LinkHandle {
    const dictionary = defineStructuralRoleDictionary(memory, roles);
    const structural = defineStructuralRule(
      memory,
      dictionary,
      memory.ensure(
        before,
        materializeExactSequence(memory, outputs),
      ),
    );
    const admission = admitStructuralRule(
      memory,
      executionTheory,
      structural,
    );
    return memory.ensure(trigger, admission);
  }

  // ---------------------------------------------------------------
  // Stage 1: exact ProofOccurrence decomposition after external P1
  // authority has already produced DR_OK for this occurrence.
  //
  // Occurrence = Claim -> (DR -> DependencyOccurrenceSequence)
  // ---------------------------------------------------------------
  const occurrenceTemplate = memory.ensure(
    CLAIM_R,
    memory.ensure(DR_R, DEPS_R),
  );
  const metadataTemplate = memory.ensure(
    META,
    memory.ensure(
      occurrenceTemplate,
      memory.ensure(DR_R, CLAIM_R),
    ),
  );
  const doneTemplate = memory.ensure(DONE, metadataTemplate);
  const entryBefore = memory.ensure(
    ENTRY,
    memory.ensure(DR_OK, occurrenceTemplate),
  );
  const entryAfter = memory.ensure(
    ENTRY,
    memory.ensure(
      MAP,
      memory.ensure(DEPS_R, doneTemplate),
    ),
  );
  indexedRule(
    [CLAIM_R, DR_R, DEPS_R],
    entryBefore,
    [entryAfter],
    DR_OK,
  );

  // ---------------------------------------------------------------
  // Stage 2: P2e occurrence-sequence -> claim-sequence mapping.
  // ---------------------------------------------------------------
  const dependencyOccurrenceTemplate = memory.ensure(
    DEP_CLAIM,
    DEP_ACT,
  );
  const cellTemplate = memory.ensureStartSelfClosed(
    memory.ensure(PREV, dependencyOccurrenceTemplate),
  );
  const pushed = memory.ensure(
    PUSH,
    memory.ensure(DEP_CLAIM, CONT),
  );
  const mapBefore = memory.ensure(
    ENTRY,
    memory.ensure(
      MAP,
      memory.ensure(cellTemplate, CONT),
    ),
  );
  const mapAfter = memory.ensure(
    ENTRY,
    memory.ensure(
      MAP,
      memory.ensure(PREV, pushed),
    ),
  );
  indexedRule(
    [PREV, DEP_CLAIM, DEP_ACT, CONT],
    mapBefore,
    [mapAfter],
    MAP,
  );

  const EMPTY_CONT = fresh();
  const mapEmptyBefore = memory.ensure(
    ENTRY,
    memory.ensure(
      MAP,
      memory.ensure(b.R, EMPTY_CONT),
    ),
  );
  const mapEmptyAfter = memory.ensure(
    ENTRY,
    memory.ensure(
      UNWIND,
      memory.ensure(EMPTY_CONT, b.R),
    ),
  );
  indexedRule(
    [EMPTY_CONT],
    mapEmptyBefore,
    [mapEmptyAfter],
    MAP,
  );

  const stackTemplate = memory.ensure(
    PUSH,
    memory.ensure(STACK_CLAIM, REST),
  );
  const nextAcc = memory.ensureStartSelfClosed(
    memory.ensure(ACC, STACK_CLAIM),
  );
  const unwindBefore = memory.ensure(
    ENTRY,
    memory.ensure(
      UNWIND,
      memory.ensure(stackTemplate, ACC),
    ),
  );
  const unwindAfter = memory.ensure(
    ENTRY,
    memory.ensure(
      UNWIND,
      memory.ensure(REST, nextAcc),
    ),
  );
  indexedRule(
    [STACK_CLAIM, REST, ACC],
    unwindBefore,
    [unwindAfter],
    UNWIND,
  );

  // DONE(metadata) terminator transfers the completed Claim sequence to the
  // local-application stage.
  const doneMetaTemplate = memory.ensure(DONE, META_R);
  const unwindDoneBefore = memory.ensure(
    ENTRY,
    memory.ensure(
      UNWIND,
      memory.ensure(doneMetaTemplate, ACC),
    ),
  );
  const unwindDoneAfter = memory.ensure(
    ENTRY,
    memory.ensure(
      AFTER_MAP,
      memory.ensure(META_R, ACC),
    ),
  );
  indexedRule(
    [META_R, ACC],
    unwindDoneBefore,
    [unwindDoneAfter],
    UNWIND,
  );

  // ---------------------------------------------------------------
  // Stage 3: build the P2a packet from data extracted from the actual
  // ProofOccurrence. No host Claim extraction remains.
  // ---------------------------------------------------------------
  const AFTER_OCC = fresh();
  const AFTER_DR = fresh();
  const AFTER_CLAIM = fresh();
  const CLAIM_SEQ = fresh();

  const afterMetadataTemplate = memory.ensure(
    META,
    memory.ensure(
      AFTER_OCC,
      memory.ensure(AFTER_DR, AFTER_CLAIM),
    ),
  );
  const packetTemplate = memory.ensure(
    PACKET_ENTRY,
    memory.ensure(
      CHECK_APPLICATION,
      memory.ensure(AFTER_CLAIM, CLAIM_SEQ),
    ),
  );
  const requestTemplate = memory.ensure(
    ADMISSIONS_OK,
    memory.ensure(
      MAKE_VERIFIER,
      memory.ensure(
        AFTER_DR,
        memory.ensure(packetTemplate, AFTER_OCC),
      ),
    ),
  );
  const afterMapBefore = memory.ensure(
    ENTRY,
    memory.ensure(
      AFTER_MAP,
      memory.ensure(afterMetadataTemplate, CLAIM_SEQ),
    ),
  );
  indexedRule(
    [AFTER_OCC, AFTER_DR, AFTER_CLAIM, CLAIM_SEQ],
    afterMapBefore,
    [requestTemplate],
    AFTER_MAP,
  );

  // ---------------------------------------------------------------
  // Stage 4: P2a DR self-verifier, but extend the source RoleDictionary with
  // one generated CTX role so exact ProofOccurrence identity survives the
  // verifier as an atomic binding.
  //
  // source dictionary:
  //   D = START(RoleSequence)
  //
  // generated dictionary:
  //   D+ = START( START(RoleSequence -> CTX) )
  //
  // This is one ExactSequence append; no host role iteration.
  // ---------------------------------------------------------------
  const sourceDictionaryTemplate =
    memory.ensureStartSelfClosed(DICT_SEQ_R);
  const drTemplate = memory.ensure(
    memory.ensure(sourceDictionaryTemplate, BODY_R),
    PREMISES_R,
  );
  const metaBefore = memory.ensure(
    ADMISSIONS_OK,
    memory.ensure(
      MAKE_VERIFIER,
      memory.ensure(
        drTemplate,
        memory.ensure(PACKET_R, OCC_R),
      ),
    ),
  );

  const extendedRoleSequenceTemplate =
    memory.ensureStartSelfClosed(
      memory.ensure(DICT_SEQ_R, CTX),
    );
  const extendedDictionaryTemplate =
    memory.ensureStartSelfClosed(
      extendedRoleSequenceTemplate,
    );

  const verifierConstraint = memory.ensure(BODY_R, PREMISES_R);
  const verifierBefore = memory.ensure(
    CTX,
    memory.ensure(
      PACKET_ENTRY,
      memory.ensure(
        CHECK_APPLICATION,
        verifierConstraint,
      ),
    ),
  );
  const verifierAfter = memory.ensure(
    CTX,
    memory.ensure(LOCAL_OK, CTX),
  );
  const verifierBody = memory.ensure(
    verifierBefore,
    materializeExactSequence(memory, [verifierAfter]),
  );
  const generatedVerifierTemplate = memory.ensure(
    extendedDictionaryTemplate,
    verifierBody,
  );
  const generatedAdmissionTemplate = memory.ensure(
    executionTheory,
    generatedVerifierTemplate,
  );
  const generatedIndexTemplate = memory.ensure(
    PACKET_ENTRY,
    generatedAdmissionTemplate,
  );
  const contextualPacketTemplate = memory.ensure(OCC_R, PACKET_R);

  indexedRule(
    [DICT_SEQ_R, BODY_R, PREMISES_R, PACKET_R, OCC_R],
    metaBefore,
    [
      generatedAdmissionTemplate,
      generatedIndexTemplate,
      contextualPacketTemplate,
    ],
    MAKE_VERIFIER,
  );

  const interpreter = defineStructuralInterpreter(
    memory,
    defineStructuralRoleDictionary(memory, []),
    grammar,
    executionTheory,
  );

  const authorityMarker = mutate === "authority" ? DR_BAD : DR_OK;
  const initial = memory.ensure(
    ENTRY,
    memory.ensure(authorityMarker, proofOccurrence),
  );
  const expectedSuccess = memory.ensure(
    proofOccurrence,
    memory.ensure(LOCAL_OK, proofOccurrence),
  );

  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    interpreter,
    [initial],
  );
  const current = new V013CurrentScopeCursor(memory, scope);

  let generations = 0;
  for (; generations < 64; generations += 1) {
    const reaction = reactV013StructuralScope(
      memory,
      current,
      fresh(),
    );
    if (reaction.quiescent) break;
  }
  assert(generations < 64, spec.label + " reaches quiescence");

  const success = current.members().includes(expectedSuccess);

  if (mutate === "none") {
    assert(success, spec.label + " valid occurrence reaches LOCAL_OK");
  } else {
    assert(
      !success,
      spec.label + " invalid occurrence must not reach LOCAL_OK: " + mutate,
    );
  }

  // Exact occurrence identity is retained. A verifier is not allowed to return
  // merely the Claim because different proof occurrences may prove the same
  // Claim with different cited Rules/dependencies.
  if (success) {
    const p = memory.poles(expectedSuccess);
    same(p.start, proofOccurrence, spec.label + " exact occurrence context");
    same(
      memory.poles(p.end).end,
      proofOccurrence,
      spec.label + " LOCAL_OK repeats exact occurrence identity",
    );
  }
}

const specs = Object.freeze([
  {
    label: "arity0",
    premiseTemplates: () => [],
    actualPremises: () => [],
  },
  {
    label: "arity1",
    premiseTemplates: (m: Memory, X: LinkHandle, Y: LinkHandle) => [
      m.ensure(Y, X),
    ],
    actualPremises: (m: Memory, A: LinkHandle, B: LinkHandle) => [
      m.ensure(B, A),
    ],
  },
  {
    label: "arity2",
    premiseTemplates: (m: Memory, X: LinkHandle, Y: LinkHandle) => [
      X,
      m.ensure(Y, X),
    ],
    actualPremises: (m: Memory, A: LinkHandle, B: LinkHandle) => [
      A,
      m.ensure(B, A),
    ],
  },
  {
    label: "arity3",
    premiseTemplates: (m: Memory, X: LinkHandle, Y: LinkHandle) => [
      X,
      Y,
      m.ensure(X, Y),
    ],
    actualPremises: (m: Memory, A: LinkHandle, B: LinkHandle) => [
      A,
      B,
      m.ensure(A, B),
    ],
  },
] satisfies readonly CaseSpec[]);

for (const spec of specs) runCase(spec, "none");

// Falsifiers on one non-trivial arity.
runCase(specs[2]!, "claim");
runCase(specs[2]!, "premise");
runCase(specs[2]!, "authority");

console.log([
  "MTS_V015_P2F_LOCAL_PROOF_OCCURRENCE_VERIFIER=GREEN_RESEARCH",
  "INPUT=DR_OK_PLUS_EXACT_PROOF_OCCURRENCE",
  "PROOF_OCCURRENCE=CLAIM_TO_DR_TO_DEPENDENCY_OCCURRENCE_SEQUENCE",
  "DEPENDENCY_CLAIMS=P2E_NATIVE_MAP",
  "DR_VERIFIER=P2A_DYNAMIC_SELF_GENERATION",
  "SOURCE_ROLE_DICTIONARY_EXTENSION=ONE_EXACT_SEQUENCE_APPEND_CTX",
  "HOST_ROLE_ITERATION=0",
  "HOST_DEPENDENCY_ITERATION=0",
  "HOST_CLAIM_EXTRACTION=0",
  "HOST_SUBSTITUTION=0",
  "TESTED_ARITIES=0_1_2_3",
  "WRONG_CLAIM=NO_LOCAL_OK",
  "WRONG_PREMISE=NO_LOCAL_OK",
  "MISSING_DR_OK=NO_LOCAL_OK",
  "RESULT=EXACT_PROOF_OCCURRENCE_CONTEXT_TO_LOCAL_OK",
  "CLAIM_ONLY_VERDICT=FALSE",
  "J1=0",
  "NEW_AMEMORY_OPCODE=0",
  "P1_DR_AUTHORITY_CHECK=INPUT_BOUNDARY_STILL_OPEN_FOR_COMPOSITION",
  "CANONICAL_APROVER_FORMAL_JSON=NOT_YET_PROPOSED",
].join(" "));
