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
  if (!value) throw new Error("v0.15 P2e dependency occurrence->claim map: " + message);
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

// Grounded fixture identities are allocated before structural role placeholders
// so they cannot recursively contain those roles.
const claims = Array.from({ length: 6 }, () => fresh());
const acts = Array.from({ length: 6 }, () => fresh());
const caller = fresh();

const theory = memory.ensure(fresh(), fresh());
const grammar = fresh();
const MAP = fresh();
const UNWIND = fresh();
const PUSH = fresh();
const NIL = fresh();
const MAPPED = fresh();

// Map-stage roles.
const K_MAP = fresh();
const PREV = fresh();
const CLAIM = fresh();
const ACT = fresh();
const CONT = fresh();

// Unwind-stage roles.
const K_UNWIND = fresh();
const STACK_CLAIM = fresh();
const REST = fresh();
const ACC = fresh();

function rule(
  roles: readonly LinkHandle[],
  before: LinkHandle,
  after: LinkHandle,
  trigger: LinkHandle,
): LinkHandle {
  const dictionary = defineStructuralRoleDictionary(memory, roles);
  const structural = defineStructuralRule(
    memory,
    dictionary,
    memory.ensure(
      before,
      materializeExactSequence(memory, [after]),
    ),
  );
  const admission = admitStructuralRule(memory, theory, structural);
  return memory.ensure(trigger, admission);
}

// ExactSequence non-empty cell:
//   Cell = START(Prev -> Occurrence)
//   Occurrence = Claim -> Act
//
// Traverse from tail toward R while constructing a continuation stack. Because
// each newly discovered claim is prepended, the resulting stack is in original
// ExactSequence order.
const occurrenceTemplate = memory.ensure(CLAIM, ACT);
const cellTemplate = memory.ensureStartSelfClosed(
  memory.ensure(PREV, occurrenceTemplate),
);
const pushedTemplate = memory.ensure(
  PUSH,
  memory.ensure(CLAIM, CONT),
);
const mapNonEmptyBefore = memory.ensure(
  K_MAP,
  memory.ensure(
    MAP,
    memory.ensure(cellTemplate, CONT),
  ),
);
const mapNonEmptyAfter = memory.ensure(
  K_MAP,
  memory.ensure(
    MAP,
    memory.ensure(PREV, pushedTemplate),
  ),
);
const mapNonEmptyIndex = rule(
  [K_MAP, PREV, CLAIM, ACT, CONT],
  mapNonEmptyBefore,
  mapNonEmptyAfter,
  MAP,
);

// At R, switch from structural traversal to stack unwinding with an empty
// output ExactSequence accumulator R.
const K_EMPTY = fresh();
const EMPTY_CONT = fresh();
const mapEmptyBefore = memory.ensure(
  K_EMPTY,
  memory.ensure(
    MAP,
    memory.ensure(b.R, EMPTY_CONT),
  ),
);
const mapEmptyAfter = memory.ensure(
  K_EMPTY,
  memory.ensure(
    UNWIND,
    memory.ensure(EMPTY_CONT, b.R),
  ),
);
const mapEmptyIndex = rule(
  [K_EMPTY, EMPTY_CONT],
  mapEmptyBefore,
  mapEmptyAfter,
  MAP,
);

// Unwind one continuation frame and append its Claim to the output
// ExactSequence accumulator:
//
//   nextAcc = START(ACC -> Claim)
const stackTemplate = memory.ensure(
  PUSH,
  memory.ensure(STACK_CLAIM, REST),
);
const nextAccumulator = memory.ensureStartSelfClosed(
  memory.ensure(ACC, STACK_CLAIM),
);
const unwindBefore = memory.ensure(
  K_UNWIND,
  memory.ensure(
    UNWIND,
    memory.ensure(stackTemplate, ACC),
  ),
);
const unwindAfter = memory.ensure(
  K_UNWIND,
  memory.ensure(
    UNWIND,
    memory.ensure(REST, nextAccumulator),
  ),
);
const unwindIndex = rule(
  [K_UNWIND, STACK_CLAIM, REST, ACC],
  unwindBefore,
  unwindAfter,
  UNWIND,
);

// End of continuation stack returns the completed Claim ExactSequence.
const K_DONE = fresh();
const DONE_ACC = fresh();
const unwindDoneBefore = memory.ensure(
  K_DONE,
  memory.ensure(
    UNWIND,
    memory.ensure(NIL, DONE_ACC),
  ),
);
const unwindDoneAfter = memory.ensure(
  K_DONE,
  memory.ensure(MAPPED, DONE_ACC),
);
const unwindDoneIndex = rule(
  [K_DONE, DONE_ACC],
  unwindDoneBefore,
  unwindDoneAfter,
  UNWIND,
);

const interpreter = defineStructuralInterpreter(
  memory,
  defineStructuralRoleDictionary(memory, []),
  grammar,
  theory,
);

for (const index of [
  mapNonEmptyIndex,
  mapEmptyIndex,
  unwindIndex,
  unwindDoneIndex,
]) {
  assert(memory.poles(index) !== undefined, "runtime index materialized");
}

function occurrence(claim: LinkHandle, act: LinkHandle): LinkHandle {
  return memory.ensure(claim, act);
}

function run(
  dependencies: readonly LinkHandle[],
): Readonly<{
  final: LinkHandle;
  generations: number;
}> {
  const sequence = materializeExactSequence(memory, dependencies);
  const initial = memory.ensure(
    caller,
    memory.ensure(
      MAP,
      memory.ensure(sequence, NIL),
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
  for (; generations < 64; generations += 1) {
    const reaction = reactV013StructuralScope(memory, current, fresh());
    same(current.members().length, 1, "mapper remains single-current");
    if (reaction.quiescent) break;
  }
  assert(generations < 64, "mapper reaches quiescence");
  return Object.freeze({
    final: current.members()[0]!,
    generations,
  });
}

function expected(claimSequence: readonly LinkHandle[]): LinkHandle {
  return memory.ensure(
    caller,
    memory.ensure(
      MAPPED,
      materializeExactSequence(memory, claimSequence),
    ),
  );
}

const o0: readonly LinkHandle[] = [];
const o1 = [occurrence(claims[0]!, acts[0]!)] as const;
const o2 = [
  occurrence(claims[0]!, acts[0]!),
  occurrence(claims[1]!, acts[1]!),
] as const;
const o3 = [
  occurrence(claims[0]!, acts[0]!),
  occurrence(claims[1]!, acts[1]!),
  occurrence(claims[2]!, acts[2]!),
] as const;
const duplicate = [
  occurrence(claims[3]!, acts[3]!),
  occurrence(claims[3]!, acts[3]!),
] as const;

same(run(o0).final, expected([]), "arity0 maps to empty Claim sequence");
same(run(o1).final, expected([claims[0]!]), "arity1");
same(
  run(o2).final,
  expected([claims[0]!, claims[1]!]),
  "arity2 preserves order",
);
same(
  run(o3).final,
  expected([claims[0]!, claims[1]!, claims[2]!]),
  "arity3 preserves order",
);
same(
  run(duplicate).final,
  expected([claims[3]!, claims[3]!]),
  "duplicate dependency occurrence preserves multiplicity",
);

// Reversed input is semantically different and must produce reversed Claim
// sequence rather than being normalized as a set.
same(
  run([o2[1], o2[0]]).final,
  expected([claims[1]!, claims[0]!]),
  "dependency order remains semantic",
);

// Malformed dependency element: START-self-closed Link is not the ordinary
// Claim->Act ProofOccurrence shape. The mapper must fail closed at MAP state;
// it may not synthesize a Claim by host pole access.
const malformed = memory.ensureStartSelfClosed(claims[4]!);
{
  const sequence = materializeExactSequence(memory, [malformed]);
  const initial = memory.ensure(
    caller,
    memory.ensure(MAP, memory.ensure(sequence, NIL)),
  );
  const scope = defineV013WorkingScope(
    memory,
    fresh(),
    interpreter,
    [initial],
  );
  const current = new V013CurrentScopeCursor(memory, scope);
  const reaction = reactV013StructuralScope(memory, current, fresh());
  same(reaction.rawRuleMatches, 0, "malformed occurrence has no mapper Rule");
  same(current.members()[0], initial, "malformed dependency stays quiescent");
}

console.log([
  "MTS_V015_P2E_DEPENDENCY_OCCURRENCE_CLAIM_MAP=GREEN_RESEARCH",
  "INPUT=EXACT_SEQUENCE_OF_PROOF_OCCURRENCES",
  "OUTPUT=EXACT_SEQUENCE_OF_CLAIMS",
  "OCCURRENCE_SHAPE=CLAIM_TO_ACT",
  "TESTED_ARITIES=0_1_2_3",
  "ARITY_SPECIFIC_RULES=0",
  "SEQUENCE_ORDER_PRESERVED=TRUE",
  "DUPLICATE_OCCURRENCE_MULTIPLICITY_PRESERVED=TRUE",
  "MALFORMED_OCCURRENCE=QUIESCENT_REJECT",
  "HOST_DEPENDENCY_ITERATION=0",
  "HOST_CLAIM_EXTRACTION=0",
  "J1=0",
  "NEW_AMEMORY_OPCODE=0",
  "P2A_PACKET_BRIDGE=STRUCTURAL",
  "CANONICAL_APROVER_FORMAL_JSON=NOT_YET_PROPOSED",
].join(" "));
