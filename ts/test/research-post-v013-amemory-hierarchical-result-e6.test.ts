import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  V013GroundedScopeCursor,
  defineV013GroundedExecutionScope,
  reactV013GroundedScope,
} from "../src/v013-grounded-execution.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error("post-v0.13 #1558 E6 hierarchical Result: " + message);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}

function admit(
  memory: Memory,
  theory: LinkHandle,
  antecedent: LinkHandle,
  outputs: readonly LinkHandle[],
): void {
  const relation =
    memory.ensure(antecedent, materializeExactSequence(memory, outputs));
  memory.ensure(theory, relation);
}

interface NestedValue {
  readonly root: LinkHandle;
  readonly right: LinkHandle;
  readonly left: LinkHandle;
  readonly middle: LinkHandle;
  readonly deep: LinkHandle;
}

function nestedValue(
  memory: Memory,
  left: LinkHandle,
  middle: LinkHandle,
  deep: LinkHandle,
): NestedValue {
  const right = memory.ensure(middle, deep);
  const root = memory.ensure(left, right);
  return Object.freeze({ root, right, left, middle, deep });
}

function exerciseHierarchicalResultAsOrdinaryOutput(): void {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  let seed = memory.ensure(basis.U, basis.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 48; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? basis.O : basis.C);
    fresh.push(seed);
  }
  const at = (index: number): LinkHandle => {
    const value = fresh[index];
    assert(value !== undefined, "fresh anchor " + index);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));
  const K = memory.ensure(at(2), at(3));
  const A = memory.ensure(at(4), at(5));

  // H is a genuinely nested Result value. It is still one ordinary Link.
  const H = nestedValue(
    memory,
    memory.ensure(at(6), at(7)),
    memory.ensure(at(8), at(9)),
    memory.ensure(at(10), at(11)),
  );
  assert(H.right !== H.root, "hierarchical Result has internal depth");
  same(memory.poles(H.root).end, H.right, "root points to nested right subtree");
  same(memory.poles(H.right).start, H.middle, "nested middle value");
  same(memory.poles(H.right).end, H.deep, "nested deep value");

  admit(memory, theory, A, [H.root]);

  const KA = memory.ensure(K, A);
  const KH = memory.ensure(K, H.root);
  const initialScope = defineV013GroundedExecutionScope(
    memory,
    at(20),
    theory,
    [KA],
  );
  const cursor = new V013GroundedScopeCursor(memory, initialScope);

  const reaction = reactV013GroundedScope(memory, cursor, at(21));
  same(reaction.matchedRelations, 1, "hierarchical output relation fires");
  same(reaction.transitionedMembers, 1, "one current truth reacts");
  same(reaction.handoffCount, 1, "hierarchical output publishes normally");
  assert(!reaction.quiescent, "hierarchical output is an active transition");

  const members = cursor.members();
  same(members.length, 1, "one hierarchical Result truth is current");
  same(members[0], KH, "same grounded law publishes K -> H");

  // The executor never needs to understand H's internal interpretation in
  // order to carry it as a result.
  const currentValue = memory.poles(KH).end;
  same(currentValue, H.root, "current endpoint is exact hierarchical Link");
  same(memory.poles(currentValue).end, H.right,
    "nested Result topology remains traversable after publication");
}

function exerciseNaivePersistentVersionDivergence(): void {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  let seed = memory.ensure(basis.U, basis.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 32; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? basis.O : basis.C);
    fresh.push(seed);
  }
  const at = (index: number): LinkHandle => {
    const value = fresh[index];
    assert(value !== undefined, "version anchor " + index);
    return value;
  };

  const EMPTY_LEFT = memory.ensure(at(0), at(1));
  const EMPTY_MIDDLE = memory.ensure(at(2), at(3));
  const EMPTY_DEEP = memory.ensure(at(4), at(5));
  const TRUE = memory.ensure(at(6), at(7));

  const base = nestedValue(
    memory,
    EMPTY_LEFT,
    EMPTY_MIDDLE,
    EMPTY_DEEP,
  );

  // Two sibling path-copy updates start from the same immutable base.
  const leftVersion = nestedValue(
    memory,
    TRUE,
    base.middle,
    base.deep,
  );
  const deepVersion = nestedValue(
    memory,
    base.left,
    base.middle,
    TRUE,
  );

  assert(leftVersion.root !== base.root,
    "left path-copy creates a new immutable root");
  assert(deepVersion.root !== base.root,
    "deep path-copy creates a new immutable root");
  assert(leftVersion.root !== deepVersion.root,
    "independent sibling versions diverge");

  same(leftVersion.left, TRUE, "left version contains left update");
  same(leftVersion.deep, EMPTY_DEEP,
    "left version does not contain sibling deep update");
  same(deepVersion.left, EMPTY_LEFT,
    "deep version does not contain sibling left update");
  same(deepVersion.deep, TRUE, "deep version contains deep update");

  // The combined value is a third root. Canonical Link identity recognizes it
  // once supplied, but cannot infer that sibling updates should be merged.
  const merged = nestedValue(
    memory,
    TRUE,
    EMPTY_MIDDLE,
    TRUE,
  );
  assert(merged.root !== leftVersion.root,
    "combined Result is not the left sibling version");
  assert(merged.root !== deepVersion.root,
    "combined Result is not the deep sibling version");

  same(
    nestedValue(memory, TRUE, EMPTY_MIDDLE, TRUE).root,
    merged.root,
    "canonicality deduplicates an explicitly supplied merged structure",
  );
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");

  const production = readFileSync(
    join(root, "ts/src/v013-grounded-execution.ts"),
    "utf8",
  );
  assert(
    !production.includes('from "./state.js"'),
    "minimal grounded executor imports no Context lifecycle runtime",
  );
  assert(
    !production.includes("resultVersion"),
    "minimal grounded executor has no Result-version authority",
  );
  assert(
    !production.includes("mergeResult"),
    "minimal grounded executor has no hierarchical Result merge protocol",
  );

  const a72u = readFileSync(
    join(root, "ts/test/research-v013-dual-tree-result-slots-a72u.test.ts"),
    "utf8",
  );
  assert(
    a72u.includes("DUAL_TREE_SINGLE_ASSIGNMENT_RESULT_SLOTS=GREEN_SCOPED_RESEARCH"),
    "A72u GREEN evidence remains retained",
  );
  assert(
    a72u.includes("RESULT_ROOT_IDENTITY_STABLE=TRUE"),
    "A72u stable-root monotone construction result remains retained",
  );
  assert(
    a72u.includes("HOST_SLOT_READY_CHECK=RESIDUAL"),
    "A72u host residual is not silently promoted into minimal execution",
  );
  assert(
    a72u.includes("TARGET_ROLE=EXPERIMENTAL_REFERENCE_VOCABULARY"),
    "A72u reference vocabulary remains explicitly experimental",
  );

  const e5 = readFileSync(
    join(
      root,
      "ts/test/research-post-v013-amemory-recurrence-e5-w6.test.ts",
    ),
    "utf8",
  );
  assert(
    e5.includes("E5_CLASSIFICATION=V013_PLUS_EXECUTION_PROFILE"),
    "E6 follows the E5/E4 portable execution-profile boundary",
  );
}

function main(): void {
  exerciseHierarchicalResultAsOrdinaryOutput();
  exerciseNaivePersistentVersionDivergence();
  staticGuards();

  console.log([
    "POST_V013_1558_E6=GREEN_CLASSIFICATION",
    "HIERARCHICAL_RESULT_AS_NESTED_LINK=GREEN",
    "HIERARCHICAL_RESULT_CAN_BE_GROUNDED_OUTPUT=TRUE",
    "MINIMAL_EXECUTOR_REQUIRES_RESULT_TREE_LIFECYCLE=FALSE",
    "MINIMAL_EXECUTOR_REQUIRES_CHILD_CONTEXT=FALSE",
    "A72U_SINGLE_ASSIGNMENT_VARIANT=RETAINED_GREEN",
    "A72U_EXPERIMENTAL_REFERENCE_VOCABULARY=RETAINED",
    "A72U_HOST_SLOT_RESIDUALS=RETAINED",
    "NAIVE_PERSISTENT_PATH_COPY_SIBLING_DIVERGENCE=TRUE",
    "CANONICALITY_IMPLIES_SIBLING_MERGE=FALSE",
    "DYNAMIC_HIERARCHICAL_RESULT_CONSTRUCTION=NOT_MINIMAL_EXECUTION_LAW",
    "E6_CLASSIFICATION=INDEPENDENT_LATER_FEATURE",
    "REQUIRED_FOR_MINIMAL_EXECUTION=FALSE",
    "OPTIONAL_EXECUTION_PROFILE=FALSE",
    "A72U_A72V_RESEARCH_DISCARDED=FALSE",
    "GLOBAL_1558_CLASSIFICATION=V013_PLUS_EXECUTION_PROFILE_OR_STRONGER",
    "SEMANTIC_EXTENSION_REQUIRED=NOT_ESTABLISHED",
    "ISSUE_1558_REMAINING_E7=OPEN",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
