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
    throw new Error("v0.15 P2i local-to-dependency bridge: " + message);
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
let cursor = memory.ensure(b.U, b.L);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, b.O);
  return cursor;
};

// Grounded candidate data and fixed program tags before structural roles.
const claim = fresh();
const sourceRule = fresh();
const sourceDR = fresh();
const depA = fresh();
const depB = fresh();
const dependencySequence =
  materializeExactSequence(memory, [depA, depB]);
const proofOccurrence = memory.ensure(
  claim,
  memory.ensure(sourceDR, dependencySequence),
);

const executionTheory = memory.ensure(fresh(), fresh());
const LOCAL_OK = fresh();
const ENTRY = fresh();
const FOLD = fresh();
const VALID = fresh();
const grammar = fresh();

// Reconstruct the exact occurrence from ordinary roles while extracting its
// dependency carrier. Canonical Link identity guarantees the reconstructed
// value is the same ProofOccurrence, not merely an equal-looking Claim.
const CLAIM_R = fresh();
const DR_R = fresh();
const DEPS_R = fresh();

const occurrenceTemplate = memory.ensure(
  CLAIM_R,
  memory.ensure(DR_R, DEPS_R),
);
const localOkTemplate = memory.ensure(
  occurrenceTemplate,
  memory.ensure(LOCAL_OK, occurrenceTemplate),
);
const validTemplate = memory.ensure(VALID, occurrenceTemplate);
const foldEndpointTemplate = memory.ensure(
  FOLD,
  memory.ensure(DEPS_R, validTemplate),
);
const p2cEntryTemplate = memory.ensure(
  ENTRY,
  foldEndpointTemplate,
);

const dictionary = defineStructuralRoleDictionary(
  memory,
  [CLAIM_R, DR_R, DEPS_R],
);
const bridgeRule = defineStructuralRule(
  memory,
  dictionary,
  memory.ensure(
    localOkTemplate,
    materializeExactSequence(memory, [p2cEntryTemplate]),
  ),
);
const admission = admitStructuralRule(
  memory,
  executionTheory,
  bridgeRule,
);

// For active = Occurrence -> (LOCAL_OK -> Occurrence):
//   START(END(active)) = LOCAL_OK.
memory.ensure(LOCAL_OK, admission);

const interpreter = defineStructuralInterpreter(
  memory,
  dictionary,
  grammar,
  executionTheory,
);

const localSuccess = memory.ensure(
  proofOccurrence,
  memory.ensure(LOCAL_OK, proofOccurrence),
);
const expected = memory.ensure(
  ENTRY,
  memory.ensure(
    FOLD,
    memory.ensure(
      dependencySequence,
      memory.ensure(VALID, proofOccurrence),
    ),
  ),
);

const scope = defineV013WorkingScope(
  memory,
  fresh(),
  interpreter,
  [localSuccess],
);
const current = new V013CurrentScopeCursor(memory, scope);
const reaction = reactV013StructuralScope(memory, current, fresh());

same(reaction.rawRuleMatches, 1, "one local-to-dependency bridge match");
same(reaction.transitionedMembers, 1, "LOCAL_OK transitions exactly once");
same(current.members().length, 1, "bridge stays single-valued");
same(
  current.members()[0],
  expected,
  "bridge emits exact P2c fold endpoint",
);

// Exact identity checks: no Claim-only collapse and no host-selected dependency
// carrier may replace the ProofOccurrence/DependencyOccurrenceSequence.
const out = memory.poles(current.members()[0]!);
same(out.start, ENTRY, "P2c entry wrapper");
const fold = memory.poles(out.end);
same(fold.start, FOLD, "P2c FOLD phase");
const payload = memory.poles(fold.end);
same(
  payload.start,
  dependencySequence,
  "exact dependency sequence is extracted from occurrence",
);
const validity = memory.poles(payload.end);
same(validity.start, VALID, "P2c continuation is VALID");
same(
  validity.end,
  proofOccurrence,
  "P2c continuation retains exact ProofOccurrence identity",
);
assert(
  validity.end !== claim,
  "local-to-dependency bridge never collapses occurrence to Claim",
);

console.log([
  "MTS_V015_P2I_LOCAL_TO_DEPENDENCY_BRIDGE=GREEN_RESEARCH",
  "INPUT=EXACT_PROOF_OCCURRENCE_CONTEXT_TO_LOCAL_OK",
  "DEPENDENCY_EXTRACTION=STRUCTURAL_ONLY",
  "OUTPUT=ENTRY_TO_FOLD_DEPENDENCIES_VALID_EXACT_OCCURRENCE",
  "P2C_FOLD_ENDPOINT=EXACT",
  "EXACT_OCCURRENCE_IDENTITY_RETAINED=TRUE",
  "CLAIM_ONLY_IDENTITY=FALSE",
  "HOST_DEPENDENCY_EXTRACTION=0",
  "HOST_OCCURRENCE_TO_CLAIM_COLLAPSE=0",
  "HOST_DFS=0",
  "J1=0",
  "NEW_AMEMORY_OPCODE=0",
  "P2F_TO_P2C_INTERFACE=CLOSED",
  "CANONICAL_APROVER_FORMAL_JSON=NOT_YET_PROPOSED",
].join(" "));
