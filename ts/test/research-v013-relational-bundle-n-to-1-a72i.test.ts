import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A72i relational bundle N->1: " + m);
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

function runSingleSourceControl(
  memory: Memory,
  relationScope: LinkHandle,
  active: LinkHandle,
  expected: LinkHandle,
  label: string,
): void {
  const working = new WorkingBundle([active]);
  const reaction = reactBundleAtomically(memory, relationScope, working);

  same(reaction.rawDerivedPathCount, 1, label + " has one independent causal path");
  same(reaction.produced.length, 1, label + " produces one canonical successor");
  same(reaction.produced[0]!, expected, label + " produces exact K -> B");
  same(working.size, 1, label + " does not require the sibling input");
  assert(working.has(expected), label + " B is current from this source alone");
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
  const A1 = memory.ensure(at(2), at(3));
  const A2 = memory.ensure(at(4), at(5));
  const B = memory.ensure(at(6), at(7));
  const relationScope = memory.ensure(at(8), at(9));

  const KA1 = memory.ensure(K, A1);
  const KA2 = memory.ensure(K, A2);
  const KB = memory.ensure(K, B);

  admitContinuation(memory, relationScope, A1, B);
  admitContinuation(memory, relationScope, A2, B);

  same(continuationTargets(memory, relationScope, A1).length, 1,
    "A1 independently continues to B");
  same(continuationTargets(memory, relationScope, A2).length, 1,
    "A2 independently continues to B");

  // Negative discriminator against conjunctive/synchronizing join semantics:
  // either source alone already entails the same successor.
  runSingleSourceControl(memory, relationScope, KA1, KB, "A1-only");
  runSingleSourceControl(memory, relationScope, KA2, KB, "A2-only");

  const working = new WorkingBundle([KA1, KA2]);
  same(working.size, 2, "working bundle starts with two active Links");

  const reaction = reactBundleAtomically(memory, relationScope, working);

  same(reaction.consumed.length, 2, "N -> 1 consumes both old active Links");
  assert(reaction.consumed.includes(KA1), "K -> A1 consumed");
  assert(reaction.consumed.includes(KA2), "K -> A2 consumed");

  same(reaction.rawDerivedPathCount, 2,
    "two independent causal paths derive successor B");
  same(reaction.produced.length, 1,
    "canonical Link identity collapses both paths to one output");
  same(reaction.produced[0]!, KB, "single output is exact canonical K -> B");

  same(working.size, 1, "final current bundle contains one Link");
  assert(!working.has(KA1), "K -> A1 no longer current");
  assert(!working.has(KA2), "K -> A2 no longer current");
  assert(working.has(KB), "one canonical K -> B is current");

  same(memory.ensure(K, B), KB, "K -> B remains canonical");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-relational-bundle-n-to-1-a72i.test.ts"),
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
    "MTS v0.13 A72i: RELATIONAL_BUNDLE_N_TO_1=GREEN_SCOPED_RESEARCH",
    "ACTIVE_FORM=K_TO_A1_PLUS_K_TO_A2",
    "RELATION_FORM=A1_TO_B_PLUS_A2_TO_B",
    "MTS_SET_OBJECT=ABSENT",
    "INPUT_ACTIVE_LINKS=2",
    "RAW_CAUSAL_DERIVATIONS=2",
    "CANONICAL_OUTPUT_LINKS=1",
    "OUTPUT=K_TO_B",
    "EITHER_SOURCE_ALONE_PRODUCES_B=TRUE",
    "SYNCHRONIZING_JOIN=FALSE",
    "CANONICAL_CONVERGENCE=GREEN",
    "WORKING_STATE_COMMITS_PER_REACTION=1",
    "INTERMEDIATE_WORKING_STATE_EXPOSURE=0",
    "HOST_RELATION_ENUMERATION=RESIDUAL",
    "HOST_WORKING_MEMBERSHIP=RESIDUAL",
    "LINKS_ONLY_RELATIONAL_DYNAMICS=NOT_PROVEN",
    "ONE_TO_ZERO=GREEN_A72G",
    "ONE_TO_ONE=GREEN_A72A_TO_A72C",
    "ONE_TO_N=GREEN_A72H",
    "NEXT=A72J_RELATIONAL_BUNDLE_N_TO_M",
    "VARIABLE_ARITY_FUNCTIONS=DEFERRED",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
