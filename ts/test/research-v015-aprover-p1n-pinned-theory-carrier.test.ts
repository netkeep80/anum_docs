import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  exportPortableStructuralTheory,
  replayPortableStructuralTheory,
} from "../src/portable-theory.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  defineV013WorkingScope,
  reactV013StructuralScope,
  V013CurrentScopeCursor,
} from "../src/v013-structural-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 aprover P1n pinned Theory carrier: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}
function sameSet(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(new Set(actual).size, actual.length, message + " actual unique");
  same(new Set(expected).size, expected.length, message + " expected unique");
  same(actual.length, expected.length, message + " cardinality");
  for (const value of expected) assert(actual.includes(value), message + " member");
}

interface Checker {
  readonly verifyTag: LinkHandle;
  readonly acceptTag: LinkHandle;
  readonly context: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly fresh: () => LinkHandle;
}

function installChecker(
  memory: Memory,
  aproverTheory: LinkHandle,
  grammar: LinkHandle,
  fresh: () => LinkHandle,
): Checker {
  const basis = ensureRootBasis(memory);
  const verifyTag = fresh();
  const acceptTag = fresh();
  const context = fresh();

  const state = (
    theory: LinkHandle,
    snapshot: LinkHandle,
    referencedRule: LinkHandle,
  ): LinkHandle =>
    memory.ensure(
      verifyTag,
      memory.ensure(theory, memory.ensure(snapshot, referencedRule)),
    );

  const accepted = (
    theory: LinkHandle,
    referencedRule: LinkHandle,
  ): LinkHandle =>
    memory.ensure(acceptTag, memory.ensure(theory, referencedRule));

  const cell = (
    previous: LinkHandle,
    value: LinkHandle,
  ): LinkHandle =>
    memory.ensureStartSelfClosed(memory.ensure(previous, value));

  // SKIP one transport cell.
  {
    const k = fresh();
    const theory = fresh();
    const prev = fresh();
    const value = fresh();
    const referencedRule = fresh();
    const dict = defineStructuralRoleDictionary(
      memory,
      [k, theory, prev, value, referencedRule],
    );
    const before = memory.ensure(
      k,
      state(theory, cell(prev, value), referencedRule),
    );
    const after = memory.ensure(
      k,
      state(theory, prev, referencedRule),
    );
    const body = memory.ensure(
      before,
      materializeExactSequence(memory, [after]),
    );
    const rule = defineStructuralRule(memory, dict, body);
    const admission = admitStructuralRule(memory, aproverTheory, rule);
    memory.ensure(verifyTag, admission);
  }

  // ACCEPT an exact ObjectTheory -> ReferencedRule cell.
  {
    const k = fresh();
    const theory = fresh();
    const prev = fresh();
    const referencedRule = fresh();
    const dict = defineStructuralRoleDictionary(
      memory,
      [k, theory, prev, referencedRule],
    );
    const exactAdmission = memory.ensure(theory, referencedRule);
    const before = memory.ensure(
      k,
      state(theory, cell(prev, exactAdmission), referencedRule),
    );
    const after = memory.ensure(k, accepted(theory, referencedRule));
    const body = memory.ensure(
      before,
      materializeExactSequence(memory, [after]),
    );
    const rule = defineStructuralRule(memory, dict, body);
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

  return Object.freeze({
    verifyTag,
    acceptTag,
    context,
    interpreter,
    fresh,
  });
}

function executeMembership(
  memory: Memory,
  checker: Checker,
  objectTheory: LinkHandle,
  carrier: LinkHandle,
  referencedRule: LinkHandle,
): boolean {
  const endpoint = memory.ensure(
    checker.verifyTag,
    memory.ensure(
      objectTheory,
      memory.ensure(carrier, referencedRule),
    ),
  );
  const initial = memory.ensure(checker.context, endpoint);
  const scope = defineV013WorkingScope(
    memory,
    checker.fresh(),
    checker.interpreter,
    [initial],
  );
  const cursor = new V013CurrentScopeCursor(memory, scope);

  for (let step = 0; step < 64; step += 1) {
    const reaction = reactV013StructuralScope(
      memory,
      cursor,
      checker.fresh(),
    );
    if (reaction.quiescent) {
      const accept = memory.ensure(
        checker.context,
        memory.ensure(
          checker.acceptTag,
          memory.ensure(objectTheory, referencedRule),
        ),
      );
      return cursor.members().includes(accept);
    }
  }
  throw new Error("v0.15 aprover P1n pinned Theory carrier: no quiescence");
}

// ---------------------------------------------------------------------------
// A. Producer side: exact ObjectTheory is frozen independently.
// ---------------------------------------------------------------------------

const source = new Memory();
const sb = ensureRootBasis(source);
let sourceCursor = source.ensure(sb.U, sb.L);
const sourceFresh = (): LinkHandle => {
  sourceCursor = source.ensure(sourceCursor, sb.C);
  return sourceCursor;
};

const sourceTheory = sourceFresh();
const sourceRuleA = sourceFresh();
const sourceRuleB = sourceFresh();
const sourceRuleC = sourceFresh();
source.ensure(sourceTheory, sourceRuleA);
source.ensure(sourceTheory, sourceRuleB);
source.ensure(sourceTheory, sourceRuleC);

const pinnedArtifact = exportPortableStructuralTheory(
  source,
  sourceTheory,
);

// ---------------------------------------------------------------------------
// B. Generic loader side: replay the independently pinned artifact first.
//    The executable carrier is built from ALL exact admissions, before any
//    candidate/proof data exists and without knowing a future referenced Rule.
// ---------------------------------------------------------------------------

const replayed = replayPortableStructuralTheory(
  JSON.parse(JSON.stringify(pinnedArtifact)),
);
const memory = replayed.memory;
const objectTheory = replayed.theory;

const exactAdmissions = Object.freeze([
  ...memory.outgoing(objectTheory),
]);
same(exactAdmissions.length, 3, "pinned ObjectTheory has three admissions");

const carrier = materializeExactSequence(
  memory,
  exactAdmissions,
);
sameSet(
  readExactSequence(memory, carrier).values,
  exactAdmissions,
  "carrier is all-and-only pinned admissions",
);

// Transport carrier construction itself must not mutate ObjectTheory authority.
same(
  JSON.stringify(exportPortableStructuralTheory(memory, objectTheory)),
  JSON.stringify(pinnedArtifact),
  "generic carrier projection leaves exact ObjectTheory artifact unchanged",
);

// Only after exact authority + carrier are pinned do aprover/candidate Links enter
// this Memory.
const b = ensureRootBasis(memory);
let cursor = memory.ensure(b.L, b.U);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, b.C);
  return cursor;
};
const aproverTheory = fresh();
const grammar = fresh();
const checker = installChecker(memory, aproverTheory, grammar, fresh);

// Pick one already-pinned admission only now, after carrier construction.
// The loader did not know which Rule would later be referenced.
const selectedAdmission = exactAdmissions[1]!;
const selectedRule = memory.poles(selectedAdmission).end;

assert(
  executeMembership(
    memory,
    checker,
    objectTheory,
    carrier,
    selectedRule,
  ),
  "selected pinned admission is accepted",
);

// Representation order is not semantic. Reversing the exact same frozen set
// preserves the membership result.
const reverseCarrier = materializeExactSequence(
  memory,
  [...exactAdmissions].reverse(),
);
assert(
  executeMembership(
    memory,
    checker,
    objectTheory,
    reverseCarrier,
    selectedRule,
  ),
  "reordered pinned carrier gives same membership verdict",
);

// ---------------------------------------------------------------------------
// C. Ambient/candidate self-admission after freeze has zero authority.
// ---------------------------------------------------------------------------

const ambientRule = fresh();
const ambientAdmission = memory.ensure(objectTheory, ambientRule);
same(
  memory.find(objectTheory, ambientRule),
  ambientAdmission,
  "ambient post-freeze admission physically exists",
);

assert(
  !executeMembership(
    memory,
    checker,
    objectTheory,
    carrier,
    ambientRule,
  ),
  "ambient post-freeze admission absent from pinned carrier is rejected",
);

// The frozen carrier itself remains unchanged after ambient mutation.
sameSet(
  readExactSequence(memory, carrier).values,
  exactAdmissions,
  "pinned carrier remains stable after ambient addition",
);

// Deliberately rebuilding from LIVE outgoing(ObjectTheory) after candidate data
// demonstrates the forbidden authority injection: the ambient admission would
// become accepted. Therefore loader timing/source is semantically critical.
const unsafeLiveCarrier = materializeExactSequence(
  memory,
  memory.outgoing(objectTheory),
);
assert(
  executeMembership(
    memory,
    checker,
    objectTheory,
    unsafeLiveCarrier,
    ambientRule,
  ),
  "live post-candidate carrier would wrongly authorize ambient admission",
);

console.log([
  "MTS_V015_APROVER_P1N_PINNED_THEORY_TO_CARRIER=GREEN_RESEARCH",
  "SOURCE_AUTHORITY=INDEPENDENT_PINNED_OBJECT_THEORY_ARTIFACT",
  "CARRIER_PROJECTION=ALL_EXACT_OUTGOING_ADMISSIONS_BEFORE_CANDIDATE",
  "PER_PROOF_MEMBER_LOOKUP_DURING_PROJECTION=0",
  "REFERENCED_RULE_KNOWN_TO_LOADER_AT_PROJECTION=FALSE",
  "CARRIER=EXACT_SEQUENCE_TRANSPORT_ONLY",
  "THEORY_IS_EXACT_SEQUENCE=FALSE",
  "CARRIER_PROJECTION_MUTATES_OBJECT_THEORY=FALSE",
  "REORDERED_CARRIER_SAME_MEMBERSHIP=TRUE",
  "POST_FREEZE_AMBIENT_ADMISSION=NO_ACCEPT",
  "LIVE_POST_CANDIDATE_REPROJECTION=AUTHORITY_INJECTION",
  "CARRIER_MUST_BE_PINNED_BEFORE_CANDIDATE=TRUE",
  "HOST_MEMBERSHIP_BOOLEAN=0",
  "NEW_GAMMA_CAPABILITY=0",
  "FORMAL_APROVER_SOURCE=OPEN",
  "FROZEN_AMEMORY_REPLAY=OPEN",
].join(" "));
