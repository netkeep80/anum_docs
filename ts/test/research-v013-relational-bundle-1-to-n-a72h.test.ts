import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A72h relational bundle 1->N: " + m);
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
 * A72h exercises 1 -> N and proves semantic atomicity: successor Links may be
 * canonicalized in the carrier during derivation, but none becomes current
 * until the complete image is ready for one working-state commit.
 */
function reactBundleAtomically(
  memory: Memory,
  relationScope: LinkHandle,
  working: WorkingBundle,
): BundleReaction {
  const before = working.snapshot();
  assert(before.length > 0, "reaction requires a non-empty active bundle");

  const produced: LinkHandle[] = [];

  for (const active of before) {
    const activePoles = memory.poles(active);
    assert(activePoles.start !== active && activePoles.end !== active,
      "active bundle member must be ordinary K -> A Link");

    const k = activePoles.start;
    const a = activePoles.end;

    for (const b of continuationTargets(memory, relationScope, a)) {
      const successor = memory.ensure(k, b);
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
  });
}

function exercise(): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 20; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const value = fresh[i];
    assert(value !== undefined, "fresh anchor " + i);
    return value;
  };

  const K = memory.ensure(at(0), at(1));
  const A = memory.ensure(at(2), at(3));
  const B1 = memory.ensure(at(4), at(5));
  const B2 = memory.ensure(at(6), at(7));
  const B3 = memory.ensure(at(8), at(9));
  const relationScope = memory.ensure(at(10), at(11));

  const active = memory.ensure(K, A);

  admitContinuation(memory, relationScope, A, B1);
  admitContinuation(memory, relationScope, A, B2);
  admitContinuation(memory, relationScope, A, B3);

  const targets = continuationTargets(memory, relationScope, A);
  same(targets.length, 3, "A has three admissible continuations");
  assert(targets.includes(B1), "B1 continuation admitted");
  assert(targets.includes(B2), "B2 continuation admitted");
  assert(targets.includes(B3), "B3 continuation admitted");

  const working = new WorkingBundle([active]);
  same(working.size, 1, "working bundle starts with one active Link");

  const reaction = reactBundleAtomically(memory, relationScope, working);

  same(reaction.consumed.length, 1, "1 -> N consumes one old active Link");
  same(reaction.consumed[0]!, active, "exact K -> A consumed");
  same(reaction.produced.length, 3, "1 -> N produces three successors");

  const KB1 = memory.ensure(K, B1);
  const KB2 = memory.ensure(K, B2);
  const KB3 = memory.ensure(K, B3);

  assert(reaction.produced.includes(KB1), "reaction contains K -> B1");
  assert(reaction.produced.includes(KB2), "reaction contains K -> B2");
  assert(reaction.produced.includes(KB3), "reaction contains K -> B3");

  same(working.size, 3, "all three successors become current together");
  assert(!working.has(active), "old K -> A is not current after split");
  assert(working.has(KB1), "K -> B1 current after commit");
  assert(working.has(KB2), "K -> B2 current after commit");
  assert(working.has(KB3), "K -> B3 current after commit");

  // Canonical active Links are stable carrier identities; the semantic split
  // is the one membership transition from [K->A] to [K->B1,K->B2,K->B3].
  same(memory.ensure(K, B1), KB1, "K -> B1 canonical");
  same(memory.ensure(K, B2), KB2, "K -> B2 canonical");
  same(memory.ensure(K, B3), KB3, "K -> B3 canonical");
}
function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-relational-bundle-1-to-n-a72h.test.ts"),
    "utf8",
  );

  const kernelStart = own.indexOf("function reactBundleAtomically(");
  const kernelEnd = own.indexOf("\nfunction exercise()", kernelStart);
  assert(kernelStart >= 0 && kernelEnd > kernelStart, "reaction source slice");
  const kernel = own.slice(kernelStart, kernelEnd);

  assert(kernel.includes("const before = working.snapshot()"),
    "reaction reads one immutable pre-state snapshot");
  assert(kernel.includes("working.replaceAtomically(before, produced)"),
    "reaction commits current-state replacement once");
  assert(kernel.includes("derived successor must not become current before atomic commit"),
    "reaction checks successor invisibility before commit");

  same(
    kernel.split("working.replaceAtomically(").length - 1,
    1,
    "reaction performs exactly one working-state commit",
  );

  for (const forbidden of [
    "RuleKind",
    "opcode",
    "selectedRule",
    "history.push",
    "tombstone",
    "working.replaceAtomically([active]",
  ]) {
    assert(!kernel.includes(forbidden),
      "kernel excludes sequential semantic mutation/special opcode: " + forbidden);
  }

  const a72g = readFileSync(
    join(root, "ts/test/research-v013-relational-bundle-1-to-0-a72g.test.ts"),
    "utf8",
  );
  assert(a72g.includes("RELATIONAL_BUNDLE_1_TO_0=GREEN_SCOPED_RESEARCH"),
    "A72g 1 -> 0 remains retained");

  const a72a = readFileSync(
    join(root, "ts/test/research-v013-working-amemory-single-rewrite-a72a.test.ts"),
    "utf8",
  );
  assert(a72a.includes("UNARY_LOGIC_NOT_WORKING_DYNAMICS=GREEN_SCOPED_RESEARCH"),
    "existing 1 -> 1 witness remains retained");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72h: RELATIONAL_BUNDLE_1_TO_N=GREEN_SCOPED_RESEARCH",
    "ACTIVE_FORM=K_TO_A",
    "RELATION_FORM=SCOPED_LINK_BUNDLE",
    "MTS_SET_OBJECT=ABSENT",
    "INPUT_ACTIVE_LINKS=1",
    "OUTPUT_ACTIVE_LINKS=3",
    "SPLIT=K_TO_B1_K_TO_B2_K_TO_B3",
    "WORKING_STATE_COMMITS_PER_REACTION=1",
    "SUCCESSORS_CURRENT_DURING_DERIVATION=FALSE",
    "SUCCESSORS_CURRENT_AFTER_COMMIT=TRUE",
    "CARRIER_ALLOCATION_ATOMICITY=NOT_CLAIMED",
    "SEMANTIC_WORKING_SPLIT_ATOMICITY=GREEN",
    "HOST_RELATION_ENUMERATION=RESIDUAL",
    "HOST_WORKING_MEMBERSHIP=RESIDUAL",
    "LINKS_ONLY_RELATIONAL_DYNAMICS=NOT_PROVEN",
    "ONE_TO_ZERO=GREEN_A72G",
    "ONE_TO_ONE=ALREADY_GREEN_A72A_TO_A72C",
    "NEXT=A72I_RELATIONAL_BUNDLE_N_TO_1_CANONICAL_CONVERGENCE",
    "N_TO_M=OPEN",
    "VARIABLE_ARITY_FUNCTIONS=DEFERRED",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
