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
  if (!value) {
    throw new Error("v0.15 P2g candidate bulk seeding: " + message);
  }
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
}
function setSame<T>(
  actual: Iterable<T>,
  expected: Iterable<T>,
  message: string,
): void {
  const a = [...new Set(actual)];
  const e = [...new Set(expected)];
  same(a.length, e.length, message + " / cardinality");
  for (const value of e) {
    assert(a.includes(value), message + " / missing expected member");
  }
}

interface RunResult {
  readonly attemptedLabels: ReadonlySet<string>;
  readonly generations: number;
  readonly finalMatches: number;
  readonly ambientAttempted: boolean;
}

function run(reverse: boolean): RunResult {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  let cursor = memory.ensure(b.U, b.L);
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, b.O);
    return cursor;
  };

  // Candidate semantic data comes first. Later program roles therefore cannot
  // accidentally occur recursively inside candidate identities.
  const candidateBundle = fresh();
  const rootOccurrence = fresh();
  const dependencyOccurrence = fresh();
  const disconnectedOccurrence = fresh();
  const junk = fresh();
  const ambient = fresh();

  const selected = Object.freeze([
    Object.freeze({ label: "root", member: rootOccurrence }),
    Object.freeze({ label: "dependency", member: dependencyOccurrence }),
    Object.freeze({ label: "disconnected", member: disconnectedOccurrence }),
    Object.freeze({ label: "junk", member: junk }),
  ]);

  // Exact closed candidate authority is pinned before ambient data. The host
  // projection below is intentionally semantics-blind: it copies all-and-only
  // selected candidate Aset members without classifying proof occurrences.
  const pinnedMemberships = Object.freeze(
    selected.map((item) => memory.ensure(candidateBundle, item.member)),
  );

  const projectedMembers = (
    reverse ? [...pinnedMemberships].reverse() : [...pinnedMemberships]
  ).map((membership) => {
    const p = memory.poles(membership);
    same(p.start, candidateBundle, "projection source candidate bundle");
    return p.end;
  });
  const carrier = materializeExactSequence(memory, projectedMembers);

  // Post-pin candidate-bundle mutation is physically present but must not be
  // retroactively projected into the runtime seed carrier.
  const ambientMembership = memory.ensure(candidateBundle, ambient);
  same(
    memory.find(candidateBundle, ambient),
    ambientMembership,
    "ambient post-pin candidate member physically exists",
  );

  // Fixed program tags before roles: avoid structural-name role contamination.
  const executionTheory = memory.ensure(fresh(), fresh());
  const ENTRY = fresh();
  const FOLD = fresh();
  const ATTEMPT = fresh();
  const DONE = fresh();
  const grammar = fresh();

  const PREV = fresh();
  const ITEM = fresh();
  const CONT = fresh();

  function indexedRule(
    roles: readonly LinkHandle[],
    before: LinkHandle,
    outputs: readonly LinkHandle[],
  ): void {
    const dictionary = defineStructuralRoleDictionary(memory, roles);
    const rule = defineStructuralRule(
      memory,
      dictionary,
      memory.ensure(
        before,
        materializeExactSequence(memory, outputs),
      ),
    );
    const admission = admitStructuralRule(memory, executionTheory, rule);
    memory.ensure(FOLD, admission);
  }

  // Generic reverse fold over canonical ExactSequence cells:
  //
  //   ENTRY -> FOLD(Cell(prev,item), cont)
  //     ->
  //   ENTRY -> FOLD(prev, cont)
  //   ENTRY -> (ATTEMPT -> item)
  //
  // ATTEMPT carries no proof classification. Every selected candidate member is
  // offered to the same downstream aprover entry; malformed/unreachable data is
  // allowed to fail closed there.
  const cellTemplate = memory.ensureStartSelfClosed(
    memory.ensure(PREV, ITEM),
  );
  const foldBefore = memory.ensure(
    ENTRY,
    memory.ensure(
      FOLD,
      memory.ensure(cellTemplate, CONT),
    ),
  );
  const foldNext = memory.ensure(
    ENTRY,
    memory.ensure(
      FOLD,
      memory.ensure(PREV, CONT),
    ),
  );
  const attempt = memory.ensure(
    ENTRY,
    memory.ensure(ATTEMPT, ITEM),
  );
  indexedRule(
    [PREV, ITEM, CONT],
    foldBefore,
    [foldNext, attempt],
  );

  // Empty ExactSequence = R.
  const emptyBefore = memory.ensure(
    ENTRY,
    memory.ensure(
      FOLD,
      memory.ensure(b.R, CONT),
    ),
  );
  indexedRule(
    [CONT],
    emptyBefore,
    [CONT],
  );

  const interpreter = defineStructuralInterpreter(
    memory,
    defineStructuralRoleDictionary(memory, []),
    grammar,
    executionTheory,
  );
  const initial = memory.ensure(
    ENTRY,
    memory.ensure(
      FOLD,
      memory.ensure(carrier, DONE),
    ),
  );
  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    interpreter,
    [initial],
  );
  const current = new V013CurrentScopeCursor(memory, scope);

  let generations = 0;
  let finalMatches = -1;
  for (; generations < 64; generations += 1) {
    const reaction = reactV013StructuralScope(memory, current, fresh());
    finalMatches = reaction.rawRuleMatches;
    if (reaction.quiescent) break;
  }
  assert(generations < 64, "finite candidate carrier reaches quiescence");
  same(finalMatches, 0, "final seed set is quiescent");

  const attemptedLabels = new Set<string>();
  for (const item of selected) {
    const expected = memory.ensure(
      ENTRY,
      memory.ensure(ATTEMPT, item.member),
    );
    if (current.members().includes(expected)) attemptedLabels.add(item.label);
  }
  setSame(
    attemptedLabels,
    selected.map((item) => item.label),
    "all-and-only pinned candidate members are seeded",
  );

  const ambientAttempt = memory.ensure(
    ENTRY,
    memory.ensure(ATTEMPT, ambient),
  );
  const ambientAttempted = current.members().includes(ambientAttempt);
  same(
    ambientAttempted,
    false,
    "post-pin ambient candidate member is not seeded",
  );
  assert(current.members().includes(DONE), "fold publishes exact completion marker");

  return Object.freeze({
    attemptedLabels,
    generations,
    finalMatches,
    ambientAttempted,
  });
}

const forward = run(false);
const reverse = run(true);

setSame(
  forward.attemptedLabels,
  reverse.attemptedLabels,
  "candidate transport order does not change seeded member set",
);
same(
  forward.ambientAttempted,
  reverse.ambientAttempted,
  "ambient exclusion is transport-order invariant",
);
same(
  forward.finalMatches,
  reverse.finalMatches,
  "transport order preserves quiescent fixed point",
);

console.log([
  "MTS_V015_P2G_CANDIDATE_BULK_SEEDING=GREEN_RESEARCH",
  "INPUT=CLOSED_PINNED_CANDIDATE_ASET",
  "PROJECTION=ALL_AND_ONLY_SELECTED_TOP_LEVEL_MEMBERS",
  "PROJECTION_PROOF_SEMANTICS=0",
  "TRANSPORT=EXACT_SEQUENCE_ONLY",
  "TRANSPORT_ORDER_SEMANTIC=FALSE",
  "RUNTIME_SEEDING=ONE_GENERIC_STRUCTURAL_FOLD",
  "DOWNSTREAM_ENTRY=ENTRY_TO_ATTEMPT_MEMBER",
  "DOWNSTREAM_STATIC_TRIGGER=ATTEMPT",
  "HOST_OCCURRENCE_CLASSIFICATION=0",
  "HOST_DFS=0",
  "HOST_VISITED_SET=0",
  "HOST_REACHABILITY_WALK=0",
  "UNREACHABLE_OR_JUNK_MEMBERS=MAY_BE_SEEDED_FAIL_CLOSED_DOWNSTREAM",
  "POST_PIN_CANDIDATE_MUTATION_DEPENDENCY=0",
  "CYCLE_TRAVERSAL_REQUIRED=FALSE",
  "FINITE_CANDIDATE_ASET_IS_THE_SEED_BOUNDARY=TRUE",
  "P2F_LOCAL_VERIFIER=DOWNSTREAM_COMPATIBLE_BOUNDARY",
  "P2C_DEPENDENCY_FIXED_POINT=DOWNSTREAM_COMPATIBLE_BOUNDARY",
  "NEW_AMEMORY_OPCODE=0",
  "CANONICAL_APROVER_FORMAL_JSON=NOT_YET_PROPOSED",
].join(" "));
