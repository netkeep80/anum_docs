import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  V013GroundedScopeCursor,
  defineV013GroundedExecutionScope,
  reactV013GroundedScope,
} from "../src/v013-grounded-execution.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("post-v0.13 #1558 E6: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}

function fresh(memory: Memory, count: number): readonly LinkHandle[] {
  const basis = ensureRootBasis(memory);
  let seed = memory.ensure(basis.U, basis.L);
  const out: LinkHandle[] = [];
  for (let i = 0; i < count; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? basis.O : basis.C);
    out.push(seed);
  }
  return Object.freeze(out);
}

function exerciseHierarchicalLinkAsOpaqueResult(): void {
  const memory = new Memory();
  const f = fresh(memory, 16);
  const at = (i: number): LinkHandle => {
    const value = f[i];
    assert(value !== undefined, "fresh link " + i);
    return value;
  };

  const theory = memory.ensure(at(0), at(1));
  const K = memory.ensure(at(2), at(3));
  const A = memory.ensure(at(4), at(5));

  // H is deliberately nested Link topology. The minimal grounded reaction
  // treats it as one semantic output Link; it needs no Result-tree lifecycle.
  const right = memory.ensure(at(7), at(8));
  const H = memory.ensure(at(6), right);
  const relation = memory.ensure(A, materializeExactSequence(memory, [H]));
  memory.ensure(theory, relation);

  const KA = memory.ensure(K, A);
  const KH = memory.ensure(K, H);
  const scope = defineV013GroundedExecutionScope(
    memory,
    at(9),
    theory,
    [KA],
  );
  const cursor = new V013GroundedScopeCursor(memory, scope);

  const reaction = reactV013GroundedScope(memory, cursor, at(10));
  same(reaction.matchedRelations, 1, "hierarchical Link output has one admitted relation");
  same(reaction.handoffCount, 1, "hierarchical Link output publishes normally");
  assert(!reaction.quiescent, "hierarchical Link output is an active transition");
  same(cursor.members().length, 1, "one result truth is current");
  same(cursor.members()[0], KH, "nested Result Link is carried without special lifecycle");

  const hp = memory.poles(H);
  same(hp.start, at(6), "hierarchical Result preserves nested start");
  same(hp.end, right, "hierarchical Result preserves nested subtree");
}

function retainedResearchAndIndependenceGuards(): void {
  const root = resolve(process.cwd(), "..");

  const a72u = readFileSync(
    join(root, "ts/test/research-v013-dual-tree-result-slots-a72u.test.ts"),
    "utf8",
  );
  assert(
    a72u.includes("DUAL_TREE_SINGLE_ASSIGNMENT_RESULT_SLOTS=GREEN_SCOPED_RESEARCH"),
    "A72u GREEN dual-tree evidence remains retained",
  );
  assert(
    a72u.includes("RESULT_ROOT_IDENTITY_STABLE=TRUE"),
    "A72u stable-root result remains retained",
  );
  assert(
    a72u.includes("GENERAL_MUTABLE_RESULT_CURRENTNESS=NOT_SOLVED"),
    "A72u limitation remains explicit",
  );

  const acceptance = readFileSync(
    join(root, "cutover/typescript-c1-acceptance-v0.6.json"),
    "utf8",
  );
  assert(
    acceptance.includes("A72u/A72v hierarchical Result / dual-tree Context / persistent Result versions"),
    "accepted v0.13 explicitly retained A72u/A72v as post-v0.13 research",
  );

  const grounded = readFileSync(
    join(root, "ts/src/v013-grounded-execution.ts"),
    "utf8",
  );
  for (const forbidden of [
    "TARGET_ROLE",
    "FILL_ROLE",
    "fillSlotOnce",
    "resultVersion",
    "resultSlot",
  ]) {
    assert(
      !grounded.includes(forbidden),
      "minimal grounded executor must not depend on hierarchical Result machinery: " + forbidden,
    );
  }
}

function main(): void {
  exerciseHierarchicalLinkAsOpaqueResult();
  retainedResearchAndIndependenceGuards();

  console.log([
    "POST_V013_1558_E6=GREEN",
    "HIERARCHICAL_LINK_AS_RESULT=SUPPORTED_BY_MINIMAL_REACTION",
    "DYNAMIC_HIERARCHICAL_RESULT_CONSTRUCTION_REQUIRED_FOR_MINIMAL_EXECUTION=FALSE",
    "NESTED_CONTEXT_LIFECYCLE_REQUIRED_FOR_MINIMAL_EXECUTION=FALSE",
    "A72U_EVIDENCE=RETAINED_GREEN_SCOPED_RESEARCH",
    "A72V_EVIDENCE=RETAINED_DEFERRED_RESEARCH",
    "E6_CLASSIFICATION=INDEPENDENT_LATER_FEATURE",
    "DEFERRED_DOES_NOT_MEAN_REJECTED=TRUE",
    "SEMANTIC_EXTENSION_REQUIRED=NOT_ESTABLISHED",
    "ISSUE_1558_REMAINING_E7=OPEN",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
