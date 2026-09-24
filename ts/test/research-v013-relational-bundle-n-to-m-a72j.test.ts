import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A72j relational bundle N->M: " + m);
}

function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}

/**
 * Test-only current-working-state harness.
 *
 * The array is NOT an MTS "set" object and is not claimed as ontology.
 * The semantic objects under test are only the active Links K -> Ai.
 */
class WorkingBundle {
  private current: readonly LinkHandle[];

  constructor(initial: readonly LinkHandle[]) {
    this.current = Object.freeze([...initial]);
    this.assertCanonical();
  }

  get size(): number {
    return this.current.length;
  }

  snapshot(): readonly LinkHandle[] {
    return this.current;
  }

  has(link: LinkHandle): boolean {
    return this.current.includes(link);
  }

  replaceAtomically(
    consumed: readonly LinkHandle[],
    produced: readonly LinkHandle[],
  ): void {
    const before = this.current;

    for (const link of consumed) {
      assert(before.includes(link), "consumed active Link must be current");
    }

    const survivors = before.filter((link) => !consumed.includes(link));
    const next = [...survivors];

    for (const link of produced) {
      if (!next.includes(link)) next.push(link);
    }

    this.current = Object.freeze(next);
    this.assertCanonical();
  }

  private assertCanonical(): void {
    for (let i = 0; i < this.current.length; i += 1) {
      for (let j = i + 1; j < this.current.length; j += 1) {
        assert(this.current[i] !== this.current[j],
          "working bundle contains duplicate Link identity");
      }
    }
  }
}

/**
 * Continuation evidence is itself only Link topology:
 *
 *   relationScope -> (A -> B)
 *
 * There is no host relation table and no MTS Set object.
 */
function admitContinuation(
  memory: Memory,
  relationScope: LinkHandle,
  from: LinkHandle,
  to: LinkHandle,
): LinkHandle {
  const continuation = memory.ensure(from, to);
  return memory.ensure(relationScope, continuation);
}

function continuationTargets(
  memory: Memory,
  relationScope: LinkHandle,
  from: LinkHandle,
): readonly LinkHandle[] {
  const result: LinkHandle[] = [];

  for (const admission of memory.outgoing(relationScope)) {
    if (admission === relationScope) continue;
    const admitted = memory.poles(admission);
    if (admitted.start !== relationScope) continue;

    const continuation = memory.poles(admitted.end);
    if (continuation.start !== from) continue;

    if (!result.includes(continuation.end)) result.push(continuation.end);
  }

  return Object.freeze(result);
}

interface BundleReaction {
  readonly consumed: readonly LinkHandle[];
  readonly produced: readonly LinkHandle[];
  readonly rawDerivedPathCount: number;
}

/**
 * Candidate relational bundle reaction.
 *
 * Important atomicity property:
 * - read one immutable pre-state snapshot;
 * - derive the complete successor bundle from that snapshot;
 * - commit exactly once.
 *
 * No produced Link becomes current while successor derivation is still running.
 *
 * A72i exercises N -> 1 canonical convergence. Multiple independent causal
 * paths may derive the same successor identity, but canonical Link identity
 * collapses them to one current K -> B Link. This is NOT a synchronizing join.
 */
function reactBundleAtomically(
  memory: Memory,
  relationScope: LinkHandle,
  working: WorkingBundle,
): BundleReaction {
  const before = working.snapshot();
  assert(before.length > 0, "reaction requires a non-empty active bundle");

  const produced: LinkHandle[] = [];
  let rawDerivedPathCount = 0;

  for (const active of before) {
    const activePoles = memory.poles(active);
    assert(activePoles.start !== active && activePoles.end !== active,
      "active bundle member must be ordinary K -> A Link");

    const k = activePoles.start;
    const a = activePoles.end;

    for (const b of continuationTargets(memory, relationScope, a)) {
      const successor = memory.ensure(k, b);
      rawDerivedPathCount += 1;
      if (!produced.includes(successor)) produced.push(successor);

      // Carrier identity may now exist, but the working state must still be
      // exactly the immutable pre-reaction state until the one final commit.
      same(working.snapshot(), before,
        "working bundle snapshot is unchanged during successor derivation");
      assert(!working.has(successor),
        "derived successor must not become current before atomic commit");
    }
  }

  // One semantic mutation of current working membership.
  working.replaceAtomically(before, produced);

  return Object.freeze({
    consumed: before,
    produced: Object.freeze(produced),
    rawDerivedPathCount,
  });
}

function exercise(): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 24; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const value = fresh[i];
    assert(value !== undefined, "fresh anchor " + i);
    return value;
  };

  const K = memory.ensure(at(0), at(1));
  const A1 = memory.ensure(at(2), at(3));
  const A2 = memory.ensure(at(4), at(5));
  const B1 = memory.ensure(at(6), at(7));
  const B2 = memory.ensure(at(8), at(9));
  const B3 = memory.ensure(at(10), at(11));
  const relationScope = memory.ensure(at(12), at(13));

  const KA1 = memory.ensure(K, A1);
  const KA2 = memory.ensure(K, A2);

  // Exact author example:
  //
  // A1 -> B1
  // A1 -> B2
  // A2 -> B2
  // A2 -> B3
  admitContinuation(memory, relationScope, A1, B1);
  admitContinuation(memory, relationScope, A1, B2);
  admitContinuation(memory, relationScope, A2, B2);
  admitContinuation(memory, relationScope, A2, B3);

  same(continuationTargets(memory, relationScope, A1).length, 2,
    "A1 has two continuations");
  same(continuationTargets(memory, relationScope, A2).length, 2,
    "A2 has two continuations");

  const working = new WorkingBundle([KA1, KA2]);
  same(working.size, 2, "N -> M starts with two active Links");

  const reaction = reactBundleAtomically(memory, relationScope, working);

  same(reaction.consumed.length, 2, "two old active Links consumed");
  assert(reaction.consumed.includes(KA1), "K -> A1 consumed");
  assert(reaction.consumed.includes(KA2), "K -> A2 consumed");

  // Four relation edges produce four causal derivations, but the two B2 paths
  // canonicalize to the same K -> B2 Link.
  same(reaction.rawDerivedPathCount, 4, "four causal continuation paths");
  same(reaction.produced.length, 3, "three canonical output Links");

  const KB1 = memory.ensure(K, B1);
  const KB2 = memory.ensure(K, B2);
  const KB3 = memory.ensure(K, B3);

  assert(reaction.produced.includes(KB1), "K -> B1 produced");
  assert(reaction.produced.includes(KB2), "K -> B2 produced once");
  assert(reaction.produced.includes(KB3), "K -> B3 produced");

  same(
    reaction.produced.filter((link) => link === KB2).length,
    1,
    "shared B2 has one canonical active Link",
  );

  same(working.size, 3, "final current bundle has three Links");
  assert(!working.has(KA1), "K -> A1 no longer current");
  assert(!working.has(KA2), "K -> A2 no longer current");
  assert(working.has(KB1), "K -> B1 current");
  assert(working.has(KB2), "K -> B2 current");
  assert(working.has(KB3), "K -> B3 current");

  same(memory.ensure(K, B2), KB2,
    "duplicate causal paths converge through canonical Link identity");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-relational-bundle-n-to-m-a72j.test.ts"),
    "utf8",
  );

  const extractKernel = (source: string): string => {
    const start = source.indexOf("function reactBundleAtomically(");
    assert(start >= 0, "reaction kernel start");
    const end = source.indexOf("\nfunction ", start + 10);
    assert(end > start, "reaction kernel end");
    return source.slice(start, end);
  };

  const ownKernel = extractKernel(own);
  assert(ownKernel.includes("working.replaceAtomically(before, produced)"),
    "N -> M still commits complete image once");
  same(
    ownKernel.split("working.replaceAtomically(").length - 1,
    1,
    "N -> M kernel has exactly one semantic commit",
  );

  const a72i = readFileSync(
    join(root, "ts/test/research-v013-relational-bundle-n-to-1-a72i.test.ts"),
    "utf8",
  );
  same(
    ownKernel,
    extractKernel(a72i),
    "A72j reuses the exact A72i generic relational reaction kernel",
  );
  assert(a72i.includes("RELATIONAL_BUNDLE_N_TO_1=GREEN_SCOPED_RESEARCH"),
    "A72i N -> 1 remains retained");

  const a72h = readFileSync(
    join(root, "ts/test/research-v013-relational-bundle-1-to-n-a72h.test.ts"),
    "utf8",
  );
  assert(a72h.includes("RELATIONAL_BUNDLE_1_TO_N=GREEN_SCOPED_RESEARCH"),
    "A72h 1 -> N remains retained");

  const a72g = readFileSync(
    join(root, "ts/test/research-v013-relational-bundle-1-to-0-a72g.test.ts"),
    "utf8",
  );
  assert(a72g.includes("RELATIONAL_BUNDLE_1_TO_0=GREEN_SCOPED_RESEARCH"),
    "A72g 1 -> 0 remains retained");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72j: RELATIONAL_BUNDLE_N_TO_M=GREEN_SCOPED_RESEARCH",
    "ACTIVE_FORM=K_TO_A1_PLUS_K_TO_A2",
    "RELATION_FORM=A1_TO_B1_A1_TO_B2_A2_TO_B2_A2_TO_B3",
    "MTS_SET_OBJECT=ABSENT",
    "INPUT_ACTIVE_LINKS=2",
    "RAW_CAUSAL_DERIVATIONS=4",
    "CANONICAL_OUTPUT_LINKS=3",
    "OUTPUT=K_TO_B1_K_TO_B2_K_TO_B3",
    "SHARED_B2_DUPLICATED_IN_WORKING_STATE=FALSE",
    "CANONICAL_OVERLAP_COLLAPSE=GREEN",
    "WORKING_STATE_COMMITS_PER_REACTION=1",
    "INTERMEDIATE_WORKING_STATE_EXPOSURE=0",
    "GENERIC_KERNEL_SOURCE_IDENTICAL_TO_A72I=TRUE",
    "RELATIONAL_CARDINALITY_1_TO_0=GREEN_A72G",
    "RELATIONAL_CARDINALITY_1_TO_1=GREEN_A72A_TO_A72C",
    "RELATIONAL_CARDINALITY_1_TO_N=GREEN_A72H",
    "RELATIONAL_CARDINALITY_N_TO_1=GREEN_A72I",
    "RELATIONAL_CARDINALITY_N_TO_M=GREEN_A72J",
    "SYNCHRONIZING_JOIN=SEPARATE_NOT_CLAIMED",
    "HOST_RELATION_ENUMERATION=RESIDUAL",
    "HOST_WORKING_MEMBERSHIP=RESIDUAL",
    "LINKS_ONLY_RELATIONAL_DYNAMICS=NOT_PROVEN",
    "NEXT=DERIVE_RELATIONAL_BUNDLE_REACTION_FROM_LINKS_RULES_WITHOUT_HOST_ENUMERATION",
    "VARIABLE_ARITY_FUNCTIONS=DEFERRED",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
