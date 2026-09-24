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

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A73r grounded bundle extensionality: " + m);
}
function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}
function setSame(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(new Set(actual).size, new Set(expected).size, message + " cardinality");
  for (const item of expected) assert(actual.includes(item), message + " missing item");
}

function relation(
  memory: Memory,
  theory: LinkHandle,
  antecedent: LinkHandle,
  outputs: readonly LinkHandle[],
): LinkHandle {
  const bundle = materializeExactSequence(memory, outputs);
  const r = memory.ensure(antecedent, bundle);
  memory.ensure(theory, r);
  return r;
}

interface Run {
  readonly firstMembers: readonly LinkHandle[];
  readonly finalMembers: readonly LinkHandle[];
  readonly firstMatches: number;
  readonly firstTransitions: number;
  readonly reactionCalls: number;
}

function run(
  memory: Memory,
  theory: LinkHandle,
  K: LinkHandle,
  A: LinkHandle,
  seed0: LinkHandle,
  seed1: LinkHandle,
  seed2: LinkHandle,
): Run {
  const initialTruth = memory.ensure(K, A);
  const cursor = new V013GroundedScopeCursor(
    memory,
    defineV013GroundedExecutionScope(memory, seed0, theory, [initialTruth]),
  );

  const first = reactV013GroundedScope(memory, cursor, seed1);
  assert(!first.quiescent, "first reaction fires grounded relations");

  const second = reactV013GroundedScope(memory, cursor, seed2);
  assert(second.quiescent, "second reaction is fixed point");

  return Object.freeze({
    firstMembers: first.nextMembers,
    finalMembers: cursor.members(),
    firstMatches: first.matchedRelations,
    firstTransitions: first.transitionedMembers,
    reactionCalls: 2,
  });
}

function exercise(): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 100; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const x = fresh[i];
    assert(x !== undefined, "fresh anchor " + i);
    return x;
  };

  const K = memory.ensure(at(0), at(1));
  const A = memory.ensure(at(2), at(3));
  const B = memory.ensure(at(4), at(5));
  const C = memory.ensure(at(6), at(7));
  const D = memory.ensure(at(8), at(9));

  const theoryForward = memory.ensure(at(10), at(11));
  const theoryReverse = memory.ensure(at(12), at(13));

  // Same extensional relation family, deliberately different physical
  // ExactSequence order, duplicate occurrences and admission order.
  const forward1 = relation(memory, theoryForward, A, [B, C, B]);
  const forward2 = relation(memory, theoryForward, A, [D]);

  const reverse2 = relation(memory, theoryReverse, A, [D]);
  const reverse1 = relation(memory, theoryReverse, A, [C, B]);

  assert(forward1 !== reverse1,
    "different physical ExactSequence order/duplication yields distinct relation Link");
  assert(forward2 === reverse2,
    "identical singleton relation is canonical across Theories");

  const forward = run(
    memory, theoryForward, K, A, at(20), at(21), at(22),
  );
  const reverse = run(
    memory, theoryReverse, K, A, at(30), at(31), at(32),
  );

  const expected = [
    memory.ensure(K, B),
    memory.ensure(K, C),
    memory.ensure(K, D),
  ] as const;

  setSame(forward.firstMembers, expected,
    "forward physical bundle projects extensional successor set");
  setSame(reverse.firstMembers, expected,
    "reverse physical bundle projects extensional successor set");
  setSame(forward.finalMembers, reverse.finalMembers,
    "carrier permutation/duplication converges to same fixed point");

  same(forward.firstMatches, 2, "forward two admitted relations fire");
  same(reverse.firstMatches, 2, "reverse two admitted relations fire");
  same(forward.firstTransitions, 1, "forward one current truth transitions");
  same(reverse.firstTransitions, 1, "reverse one current truth transitions");
  same(forward.reactionCalls, reverse.reactionCalls,
    "carrier permutation does not change reaction depth in static relation family");

  same(
    forward.firstMembers.filter((x) => x === memory.ensure(K, B)).length,
    1,
    "duplicate B occurrences collapse to one canonical current truth",
  );
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const runtime = readFileSync(
    join(root, "ts/src/v013-grounded-execution.ts"),
    "utf8",
  );
  const begin = runtime.indexOf("export function reactV013GroundedScope(");
  assert(begin >= 0, "grounded reaction source slice");
  const kernel = runtime.slice(begin);

  assert(kernel.includes("for (const image of images)"),
    "all admitted relation images are traversed generically");
  assert(kernel.includes("for (const output of image.outputs)"),
    "all physical bundle outputs are traversed generically");

  for (const forbidden of [
    ".sort(",
    "outputs[0]",
    "outputs[1]",
    "outputs.length === 1",
    "outputs.length > 1",
    "selectedOutput",
    "firstOutput",
    "lastOutput",
  ]) {
    assert(!kernel.includes(forbidden),
      "grounded reaction gives no semantic authority to carrier order/cardinality branch: " + forbidden);
  }
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A73r: GROUNDED_OUTPUT_BUNDLE_EXTENSIONALITY=GREEN_SCOPED_RESEARCH",
    "EXACT_SEQUENCE_OUTPUT_ORDER=PHYSICAL_CARRIER_ONLY_SCOPED",
    "OUTPUT_DUPLICATE_OCCURRENCES=SEMANTICALLY_IDEMPOTENT_BY_CANONICAL_LINK_IDENTITY",
    "RELATION_ADMISSION_ORDER=EXTENSIONALLY_INERT_IN_TESTED_STATIC_FAMILY",
    "RELATIONAL_OUTPUT_SEMANTICS=EXTENSIONAL_LINK_BUNDLE",
    "OUTPUT_POSITION_SPECIFIC_HOST_BRANCHES=0",
    "OUTPUT_CARDINALITY_SPECIFIC_HOST_BRANCHES=0",
    "TWO_RELATIONS_SAME_ANTECEDENT=ALL_FIRE",
    "FIXED_POINT_AFTER_PERMUTATION=SAME",
    "MTS_SET_OBJECT=ABSENT",
    "EXACT_SEQUENCE=ORDERED_PHYSICAL_CARRIER_FOR_UNORDERED_SEMANTIC_BUNDLE",
    "V013_NOT_ACCEPTED",
  ].join(" "));
}

main();
