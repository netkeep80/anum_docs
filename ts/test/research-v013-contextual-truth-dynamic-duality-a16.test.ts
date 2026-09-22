import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  resolveFlatBundle,
  type BundleValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A16 contextual truth/dynamic duality: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function setSame(
  actual: ReadonlySet<LinkHandle>,
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.size, new Set(expected).size, `${message}: cardinality`);
  for (const x of expected) assert(actual.has(x), `${message}: missing Link`);
}

/**
 * Dynamic directed-duality kernel.
 *
 * The current contextual truth of A is carried literally by a selected Link K->A.
 * One semantic step composes that selected contextual Link with every selected
 * continuation A->B and materializes the propagated truth witness K->B.
 *
 * The kernel has no host predicate for "active", "true", implication, function,
 * or modus ponens. It only composes selected directed Links by pole identity.
 */
function propagateContextLinkage(
  memory: Memory,
  context: LinkHandle,
  selected: readonly LinkHandle[],
): BundleValue {
  const occurrences: ResolvedOccurrence[] = [];

  for (let i = 0; i < selected.length; i += 1) {
    const left = memory.poles(selected[i]!);
    if (left.start !== context) continue;

    for (let j = 0; j < selected.length; j += 1) {
      const right = memory.poles(selected[j]!);
      if (right.start !== left.end) continue;

      const propagatedTruth = memory.ensure(context, right.end);
      occurrences.push(Object.freeze({
        path: Object.freeze([i, j]),
        link: propagatedTruth,
      }));
    }
  }

  return resolveFlatBundle(memory, Object.freeze(occurrences));
}

function consequenceEnds(
  memory: Memory,
  context: LinkHandle,
  result: BundleValue,
): ReadonlySet<LinkHandle> {
  const ends = new Set<LinkHandle>();
  for (const truthLink of result.links) {
    const p = memory.poles(truthLink);
    same(p.start, context, "propagated truth keeps current context");
    ends.add(p.end);
  }
  return ends;
}

function freshFactory(memory: Memory, basis: RootBasis): () => LinkHandle {
  let seed = memory.ensure(basis.U, basis.L);
  return () => {
    seed = memory.ensure(seed, basis.C);
    return seed;
  };
}

function exercise(memory: Memory, withNoise: boolean): void {
  const basis = ensureRootBasis(memory);
  same(memory.ensure(basis.O, basis.C), basis.L, "root direct dual aspect is L");

  if (withNoise) {
    const n0 = memory.ensure(basis.L, basis.U);
    const n1 = memory.ensure(n0, basis.O);
    memory.ensure(basis.C, n1);
  }

  const fresh = freshFactory(memory, basis);

  // ZERO: K->A is true in context K, but A has no selected continuation.
  {
    const K = fresh();
    const A = fresh();
    const truthA = memory.ensure(K, A);
    const zero = propagateContextLinkage(memory, K, Object.freeze([truthA]));
    same(zero.links.size, 0, "ZERO contextual detachment");
    same(zero.occurrences.length, 0, "ZERO has no provenance occurrences");
  }

  // ONE: K->A and A->B propagate to K->B.
  {
    const K = fresh();
    const A = fresh();
    const B = fresh();
    const truthA = memory.ensure(K, A);
    const rule = memory.ensure(A, B);

    const one = propagateContextLinkage(
      memory,
      K,
      Object.freeze([truthA, rule]),
    );

    const truthB = memory.find(K, B);
    assert(truthB !== undefined, "ONE materializes contextual truth K->B");
    setSame(one.links, [truthB], "ONE propagated truth");
    setSame(consequenceEnds(memory, K, one), [B], "ONE consequent");
    same(one.occurrences.length, 1, "ONE provenance occurrence");
  }

  // MANY: unrestricted binary relation branches without right-uniqueness.
  // An ambient A->B3 exists physically but is not part of selected authority.
  {
    const K = fresh();
    const A = fresh();
    const B1 = fresh();
    const B2 = fresh();
    const B3 = fresh();
    const C = fresh();
    const D = fresh();

    const truthA = memory.ensure(K, A);
    const rule1 = memory.ensure(A, B1);
    const rule2 = memory.ensure(A, B2);
    memory.ensure(A, B3);
    const unreachableRule = memory.ensure(C, D);

    const many = propagateContextLinkage(
      memory,
      K,
      Object.freeze([truthA, rule1, rule2, unreachableRule]),
    );

    setSame(consequenceEnds(memory, K, many), [B1, B2], "MANY consequents");
    same(many.links.size, 2, "MANY propagated truth links");
    same(many.occurrences.length, 2, "MANY provenance occurrences");
    same(memory.find(K, B3), undefined, "ambient unselected rule is not truth authority");
    same(memory.find(K, D), undefined, "unlinked antecedent does not fire");
  }

  // Convergence: two true antecedents reach the same consequent.
  // Extensional truth is one K->B Link, provenance keeps both deductions.
  {
    const K = fresh();
    const A = fresh();
    const C = fresh();
    const B = fresh();

    const truthA = memory.ensure(K, A);
    const truthC = memory.ensure(K, C);
    const ruleA = memory.ensure(A, B);
    const ruleC = memory.ensure(C, B);

    const converged = propagateContextLinkage(
      memory,
      K,
      Object.freeze([truthA, truthC, ruleA, ruleC]),
    );

    const truthB = memory.find(K, B);
    assert(truthB !== undefined, "convergence materializes K->B");
    setSame(converged.links, [truthB], "convergence extensional truth");
    same(converged.occurrences.length, 2, "convergence preserves two proof paths");
  }

  // Recursive propagation: a newly derived K->B can participate in the next
  // selected step and carry contextual truth through B->C.
  {
    const K = fresh();
    const A = fresh();
    const B = fresh();
    const C = fresh();

    const truthA = memory.ensure(K, A);
    const ab = memory.ensure(A, B);
    const bc = memory.ensure(B, C);
    const frozen = Object.freeze([truthA, ab, bc]);

    const first = propagateContextLinkage(memory, K, frozen);
    const truthB = memory.find(K, B);
    assert(truthB !== undefined, "recursive step 1 produces K->B");
    assert(first.links.has(truthB), "recursive step 1 returns K->B");

    const second = propagateContextLinkage(
      memory,
      K,
      Object.freeze([...frozen, ...first.links]),
    );
    const truthC = memory.find(K, C);
    assert(truthC !== undefined, "recursive step 2 produces K->C");
    assert(second.links.has(truthC), "recursive step 2 returns K->C");
  }
}

function staticKernelGuard(): void {
  const repoRoot = resolve(process.cwd(), "..");
  const source = readFileSync(
    join(repoRoot, "ts/test/research-v013-contextual-truth-dynamic-duality-a16.test.ts"),
    "utf8",
  );
  const start = source.indexOf("function propagateContextLinkage(");
  const end = source.indexOf("function consequenceEnds(", start);
  assert(start >= 0 && end > start, "A16 kernel source slice");
  const kernel = source.slice(start, end);

  for (const forbidden of [
    "active(",
    "isTrue",
    "modusPonens",
    "basis.",
    "outgoing(",
    "incoming(",
    ".find(",
    "switch(",
  ]) {
    assert(!kernel.includes(forbidden), `A16 kernel excludes host semantic primitive ${forbidden}`);
  }
}

function main(): void {
  exercise(new Memory(), false);
  exercise(new Memory(), true);
  staticKernelGuard();

  console.log([
    "MTS v0.13 A16:",
    "CONTEXTUAL_TRUTH_DYNAMIC_DUALITY=GREEN_SCOPED_RESEARCH",
    "TRUE_CARRIER=K_TO_A",
    "ROOT_TRUE_ASPECT=L",
    "DETACHMENT=K_TO_A_PLUS_A_TO_B_GIVES_K_TO_B",
    "RESULT_CARDINALITY=ZERO_ONE_MANY",
    "AMBIENT_UNSELECTED_RULE=IGNORED",
    "UNLINKED_ANTECEDENT=IGNORED",
    "CONVERGENCE_DISTINCT_TRUTH_LINKS=1",
    "CONVERGENCE_PROVENANCE_OCCURRENCES=2",
    "RECURSIVE_PROPAGATION=GREEN",
    "HOST_ACTIVE_TRUE_MODUSPONENS_BRANCHES=0",
    "INDEPENDENT_MEMORIES=2",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
