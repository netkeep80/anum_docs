import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  defineContext,
  readContext,
  StateError,
} from "../src/state.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A72u dual-tree result slots: " + m);
}

function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}

function sameMembers(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, message + " cardinality");
  for (const member of expected) {
    assert(actual.includes(member), message + " missing member");
  }
}

function defineWorkingScope(
  memory: Memory,
  seed: LinkHandle,
  members: readonly LinkHandle[],
): LinkHandle {
  const scope = memory.ensureStartSelfClosed(seed);
  for (const member of members) memory.ensure(scope, member);
  return scope;
}

function readWorkingScope(
  memory: Memory,
  scope: LinkHandle,
): readonly LinkHandle[] {
  const members: LinkHandle[] = [];
  for (const attachment of memory.outgoing(scope)) {
    if (attachment === scope) continue;
    const p = memory.poles(attachment);
    if (p.start !== scope) continue;
    if (!members.includes(p.end)) members.push(p.end);
  }
  return Object.freeze(members);
}

class CurrentScopeCursor {
  constructor(
    private readonly memory: Memory,
    private scope: LinkHandle,
  ) {}

  currentScope(): LinkHandle {
    return this.scope;
  }

  members(): readonly LinkHandle[] {
    return readWorkingScope(this.memory, this.scope);
  }

  switchAtomically(expectedOld: LinkHandle, next: LinkHandle): void {
    same(this.scope, expectedOld, "scope handoff old scope");
    this.scope = next;
  }
}

function isContext(memory: Memory, link: LinkHandle): boolean {
  try {
    readContext(memory, link);
    return true;
  } catch (error) {
    if (error instanceof StateError && error.code === "invalid-context") {
      return false;
    }
    throw error;
  }
}

/**
 * Experimental structural reference layer:
 *
 *   Context -> (TARGET_ROLE -> ResultPart)
 *
 * TARGET_ROLE is test vocabulary, not a new foundation entity.
 */
function bindResultTarget(
  memory: Memory,
  context: LinkHandle,
  targetRole: LinkHandle,
  resultPart: LinkHandle,
): LinkHandle {
  readContext(memory, context);
  const reference = memory.ensure(targetRole, resultPart);
  return memory.ensure(context, reference);
}

function readResultTarget(
  memory: Memory,
  context: LinkHandle,
  targetRole: LinkHandle,
): LinkHandle {
  readContext(memory, context);

  const targets: LinkHandle[] = [];

  for (const attachment of memory.outgoing(context)) {
    if (attachment === context) continue;

    const a = memory.poles(attachment);
    if (a.start !== context) continue;

    const reference = memory.poles(a.end);
    if (reference.start !== targetRole) continue;

    if (!targets.includes(reference.end)) targets.push(reference.end);
  }

  same(targets.length, 1, "Context has exactly one Result target");
  return targets[0]!;
}

/**
 * Result root is also the scope of single-assignment fill records:
 *
 *   ResultRoot -> (FILL_ROLE -> (slot -> value))
 *
 * This lets the root identity stay stable while different slots are filled
 * monotonically.
 */
function readSlotValues(
  memory: Memory,
  resultRoot: LinkHandle,
  fillRole: LinkHandle,
  slot: LinkHandle,
): readonly LinkHandle[] {
  const values: LinkHandle[] = [];

  for (const attachment of memory.outgoing(resultRoot)) {
    const a = memory.poles(attachment);
    if (a.start !== resultRoot) continue;

    const record = memory.poles(a.end);
    if (record.start !== fillRole) continue;

    const binding = memory.poles(record.end);
    if (binding.start !== slot) continue;

    if (!values.includes(binding.end)) values.push(binding.end);
  }

  return Object.freeze(values);
}

function fillSlotOnce(
  memory: Memory,
  resultRoot: LinkHandle,
  fillRole: LinkHandle,
  slot: LinkHandle,
  value: LinkHandle,
): LinkHandle {
  same(
    readSlotValues(memory, resultRoot, fillRole, slot).length,
    0,
    "Result slot must be empty before single assignment",
  );

  const binding = memory.ensure(slot, value);
  const record = memory.ensure(fillRole, binding);
  return memory.ensure(resultRoot, record);
}

function slotValue(
  memory: Memory,
  resultRoot: LinkHandle,
  fillRole: LinkHandle,
  slot: LinkHandle,
): LinkHandle | undefined {
  const values = readSlotValues(memory, resultRoot, fillRole, slot);
  assert(values.length <= 1, "single-assignment slot cannot have multiple values");
  return values[0];
}

interface ResultTree {
  readonly root: LinkHandle;
  readonly right: LinkHandle;
  readonly leftSlot: LinkHandle;
  readonly middleSlot: LinkHandle;
  readonly deepSlot: LinkHandle;
}

function buildResultTree(
  memory: Memory,
  leftSlot: LinkHandle,
  middleSlot: LinkHandle,
  deepSlot: LinkHandle,
): ResultTree {
  const right = memory.ensure(middleSlot, deepSlot);
  const root = memory.ensure(leftSlot, right);

  return Object.freeze({
    root,
    right,
    leftSlot,
    middleSlot,
    deepSlot,
  });
}

function resultTreeReady(
  memory: Memory,
  tree: ResultTree,
  fillRole: LinkHandle,
): boolean {
  return (
    slotValue(memory, tree.root, fillRole, tree.leftSlot) !== undefined &&
    slotValue(memory, tree.root, fillRole, tree.middleSlot) !== undefined &&
    slotValue(memory, tree.root, fillRole, tree.deepSlot) !== undefined
  );
}

interface ResolvedTree {
  readonly left: LinkHandle;
  readonly middle: LinkHandle;
  readonly deep: LinkHandle;
}

function resolveTree(
  memory: Memory,
  tree: ResultTree,
  fillRole: LinkHandle,
): ResolvedTree {
  const left = slotValue(memory, tree.root, fillRole, tree.leftSlot);
  const middle = slotValue(memory, tree.root, fillRole, tree.middleSlot);
  const deep = slotValue(memory, tree.root, fillRole, tree.deepSlot);

  assert(left !== undefined, "left result slot ready");
  assert(middle !== undefined, "middle result slot ready");
  assert(deep !== undefined, "deep result slot ready");

  return Object.freeze({ left, middle, deep });
}

function completeLeafIntoTarget(
  memory: Memory,
  cursor: CurrentScopeCursor,
  resultRoot: LinkHandle,
  targetRole: LinkHandle,
  fillRole: LinkHandle,
  leafContext: LinkHandle,
  nextScopeSeed: LinkHandle,
): LinkHandle {
  const oldScope = cursor.currentScope();
  const before = cursor.members();
  assert(before.includes(leafContext), "leaf Context must be current");

  const leaf = readContext(memory, leafContext);
  const target = readResultTarget(memory, leafContext, targetRole);

  fillSlotOnce(memory, resultRoot, fillRole, target, leaf.current);

  const nextMembers = before.filter((member) => member !== leafContext);
  const nextScope = defineWorkingScope(memory, nextScopeSeed, nextMembers);
  cursor.switchAtomically(oldScope, nextScope);

  return target;
}

function exercise(): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 80; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }

  const at = (i: number): LinkHandle => {
    const value = fresh[i];
    assert(value !== undefined, "fresh anchor " + i);
    return value;
  };

  const ROOT_PARENT = memory.ensure(at(0), at(1));
  const BUILD_ROOT = memory.ensure(at(2), at(3));
  const BUILD_RIGHT = memory.ensure(at(4), at(5));

  const TRUE = memory.ensure(at(6), at(7));
  const FALSE = memory.ensure(at(8), at(9));

  const TARGET_ROLE = memory.ensure(at(10), at(11));
  const FILL_ROLE = memory.ensure(at(12), at(13));

  const leftSlot = memory.ensure(at(14), at(15));
  const middleSlot = memory.ensure(at(16), at(17));
  const deepSlot = memory.ensure(at(18), at(19));

  const result = buildResultTree(
    memory,
    leftSlot,
    middleSlot,
    deepSlot,
  );

  const resultRootIdentity = result.root;
  const resultRootPolesBefore = memory.poles(result.root);

  const rootContext =
    defineContext(memory, ROOT_PARENT, BUILD_ROOT);
  const leftContext =
    defineContext(memory, rootContext, TRUE);
  const rightContext =
    defineContext(memory, rootContext, BUILD_RIGHT);
  const middleContext =
    defineContext(memory, rightContext, FALSE);
  const deepContext =
    defineContext(memory, rightContext, TRUE);

  bindResultTarget(memory, rootContext, TARGET_ROLE, result.root);
  bindResultTarget(memory, leftContext, TARGET_ROLE, result.leftSlot);
  bindResultTarget(memory, rightContext, TARGET_ROLE, result.right);
  bindResultTarget(memory, middleContext, TARGET_ROLE, result.middleSlot);
  bindResultTarget(memory, deepContext, TARGET_ROLE, result.deepSlot);

  same(readResultTarget(memory, rootContext, TARGET_ROLE), result.root,
    "root Context points to Result root");
  same(readResultTarget(memory, rightContext, TARGET_ROLE), result.right,
    "nested Context points to Result subtree");
  same(readResultTarget(memory, leftContext, TARGET_ROLE), result.leftSlot,
    "left leaf Context points to left slot");
  same(readResultTarget(memory, middleContext, TARGET_ROLE), result.middleSlot,
    "middle leaf Context points to middle slot");
  same(readResultTarget(memory, deepContext, TARGET_ROLE), result.deepSlot,
    "deep leaf Context points to deep slot");

  same(readContext(memory, leftContext).parent, rootContext,
    "left Context ancestry");
  same(readContext(memory, rightContext).parent, rootContext,
    "right Context ancestry");
  same(readContext(memory, middleContext).parent, rightContext,
    "middle Context ancestry");
  same(readContext(memory, deepContext).parent, rightContext,
    "deep Context ancestry");

  assert(!resultTreeReady(memory, result, FILL_ROLE),
    "Result starts structurally present but incomplete");

  const initialScope = defineWorkingScope(
    memory,
    at(30),
    [leftContext, middleContext, deepContext],
  );
  const cursor = new CurrentScopeCursor(memory, initialScope);

  completeLeafIntoTarget(
    memory,
    cursor,
    result.root,
    TARGET_ROLE,
    FILL_ROLE,
    leftContext,
    at(31),
  );

  same(slotValue(memory, result.root, FILL_ROLE, leftSlot), TRUE,
    "left slot filled");
  assert(!cursor.members().includes(leftContext),
    "left Context scaffold disappears after slot completion");
  assert(cursor.members().includes(middleContext),
    "middle sibling keeps working");
  assert(cursor.members().includes(deepContext),
    "deep sibling keeps working");
  assert(!resultTreeReady(memory, result, FILL_ROLE),
    "Result remains incomplete after first leaf");

  // Finish a deeper sibling before its middle sibling.
  completeLeafIntoTarget(
    memory,
    cursor,
    result.root,
    TARGET_ROLE,
    FILL_ROLE,
    deepContext,
    at(32),
  );

  same(slotValue(memory, result.root, FILL_ROLE, deepSlot), TRUE,
    "deep slot can finish out of order");
  assert(cursor.members().includes(middleContext),
    "middle sibling remains current after deep completion");
  assert(!resultTreeReady(memory, result, FILL_ROLE),
    "one missing slot keeps Result incomplete");

  completeLeafIntoTarget(
    memory,
    cursor,
    result.root,
    TARGET_ROLE,
    FILL_ROLE,
    middleContext,
    at(33),
  );

  same(cursor.members().length, 0,
    "all leaf Context workers have collapsed");
  assert(resultTreeReady(memory, result, FILL_ROLE),
    "Result tree is complete when all single-assignment slots are filled");

  const resolved = resolveTree(memory, result, FILL_ROLE);
  same(resolved.left, TRUE, "resolved left value");
  same(resolved.middle, FALSE, "resolved middle value");
  same(resolved.deep, TRUE, "resolved deep value");

  // Suspended parent Contexts were construction scaffold only.
  const finalScope = defineWorkingScope(memory, at(34), [result.root]);
  cursor.switchAtomically(cursor.currentScope(), finalScope);

  sameMembers(cursor.members(), [result.root],
    "final current working state contains Result root only");
  assert(!isContext(memory, result.root),
    "Result root is not Context scaffold");

  for (const context of [
    rootContext,
    leftContext,
    rightContext,
    middleContext,
    deepContext,
  ]) {
    assert(!cursor.members().includes(context),
      "temporary Context tree is absent from final current state");
    assert(isContext(memory, context),
      "canonical Context identity remains readable in carrier");
  }

  same(result.root, resultRootIdentity,
    "Result root identity never changes during construction");
  const resultRootPolesAfter = memory.poles(result.root);
  same(resultRootPolesAfter.start, resultRootPolesBefore.start,
    "Result root start pole is immutable");
  same(resultRootPolesAfter.end, resultRootPolesBefore.end,
    "Result root end pole is immutable");

  // Result depth and Context depth are intentionally not coupled.
  same(memory.poles(result.root).end, result.right,
    "Result has nested right subtree");
  same(readContext(memory, deepContext).parent, rightContext,
    "deep Context ancestry is independent structural tree");

  // Single-assignment is essential to this candidate.
  let duplicateRejected = false;
  try {
    fillSlotOnce(
      memory,
      result.root,
      FILL_ROLE,
      leftSlot,
      FALSE,
    );
  } catch {
    duplicateRejected = true;
  }
  assert(duplicateRejected,
    "filled Result slot cannot be rebound in candidate A");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-dual-tree-result-slots-a72u.test.ts"),
    "utf8",
  );

  const executable = own.slice(0, own.indexOf("function staticGuards(): void {"));
  for (const forbidden of [
    "Map<LinkHandle,",
    "Set<LinkHandle>",
    "resultRoot =",
    "currentResult",
    "resultVersion",
    "delete(",
  ]) {
    assert(!executable.includes(forbidden),
      "A72u excludes host Result-map/version mutation: " + forbidden);
  }

  const completeStart = own.indexOf("function completeLeafIntoTarget(");
  const completeEnd = own.indexOf("\nfunction exercise()", completeStart);
  assert(completeStart >= 0 && completeEnd > completeStart,
    "completion source slice");
  const completion = own.slice(completeStart, completeEnd);

  assert(completion.includes("readResultTarget"),
    "leaf completion follows structural Context->Result reference");
  assert(completion.includes("fillSlotOnce"),
    "leaf completion fills referenced Result slot");
  assert(completion.includes("before.filter"),
    "completed Context leaves current work");
  assert(!completion.includes("result.root ="),
    "Result root is never reassigned");

  const a72t = readFileSync(
    join(root, "ts/test/research-v013-mixed-scope-early-collapse-a72t.test.ts"),
    "utf8",
  );
  assert(
    a72t.includes("MIXED_WORKING_SCOPE_EARLY_RESULT_COLLAPSE=GREEN_SCOPED_RESEARCH"),
    "A72t early-collapse witness remains retained",
  );
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72u: DUAL_TREE_SINGLE_ASSIGNMENT_RESULT_SLOTS=GREEN_SCOPED_RESEARCH",
    "CONTEXT_TREE=TEMPORARY_SCAFFOLD",
    "RESULT_TREE=SEPARATE_PERSISTENT_STRUCTURE",
    "CONTEXT_TO_RESULT_REFERENCE=STRUCTURAL_LINK",
    "ROOT_CONTEXT_TARGETS_RESULT_ROOT=TRUE",
    "NESTED_CONTEXT_TARGETS_RESULT_SUBTREE=TRUE",
    "LEAF_CONTEXTS_TARGET_DISTINCT_RESULT_SLOTS=TRUE",
    "LEAF_COMPLETION_ORDER=OUT_OF_ORDER_SUPPORTED",
    "SINGLE_ASSIGNMENT_RESULT_SLOTS=GREEN",
    "RESULT_ROOT_IDENTITY_STABLE=TRUE",
    "RESULT_ROOT_VERSION_SWITCHES=0",
    "RESULT_CURRENT_POINTER_REPLACEMENT=0",
    "FINAL_CURRENT_CONTEXT_COUNT=0",
    "FINAL_CURRENT_RESULT_ROOT_COUNT=1",
    "CANONICAL_OLD_CONTEXT_IDENTITIES_REMAIN=TRUE",
    "CONTEXT_DEPTH_EQUALS_RESULT_DEPTH=NOT_REQUIRED",
    "TARGET_ROLE=EXPERIMENTAL_REFERENCE_VOCABULARY",
    "FILL_ROLE=EXPERIMENTAL_RESULT_BINDING_VOCABULARY",
    "HOST_CURRENT_SCOPE_CURSOR=RESIDUAL_PER_A72N",
    "HOST_SLOT_READY_CHECK=RESIDUAL",
    "HOST_SINGLE_ASSIGNMENT_ENFORCEMENT=RESIDUAL",
    "GENERAL_MUTABLE_RESULT_CURRENTNESS=NOT_SOLVED",
    "NEXT=COMPARE_PERSISTENT_RESULT_VERSIONS_AND_FRAGMENT_RETURN_VARIANTS",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
