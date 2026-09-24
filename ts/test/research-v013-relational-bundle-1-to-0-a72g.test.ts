import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A72g relational bundle 1->0: " + m);
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
 * A72g exercises only 1 -> 0. Later witnesses reuse this shape for 1 -> N,
 * N -> 1 and N -> M.
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
  for (let i = 0; i < 16; i += 1) {
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
  const unrelatedFrom = memory.ensure(at(4), at(5));
  const unrelatedTo = memory.ensure(at(6), at(7));
  const relationScope = memory.ensure(at(8), at(9));

  const active = memory.ensure(K, A);

  // Make the relation non-empty while keeping the image of A empty.
  // This proves 1 -> 0 is scoped to the selected source A, not to an empty
  // relation container special case.
  admitContinuation(memory, relationScope, unrelatedFrom, unrelatedTo);

  same(continuationTargets(memory, relationScope, A).length, 0,
    "selected A has an explicitly empty image in the applied relation");

  const working = new WorkingBundle([active]);
  same(working.size, 1, "working bundle starts with one active Link");
  assert(working.has(active), "K -> A is current before reaction");

  const carrierBefore = memory.linkCount;
  const reaction = reactBundleAtomically(memory, relationScope, working);

  same(reaction.consumed.length, 1, "1 -> 0 consumes one active Link");
  same(reaction.consumed[0]!, active, "exact K -> A consumed");
  same(reaction.produced.length, 0, "1 -> 0 produces no successor Links");

  same(working.size, 0, "working bundle is empty after relation image");
  assert(!working.has(active), "old K -> A is no longer current");

  // The old canonical Link remains addressable in the carrier. This is
  // semantic disappearance from current working state, not physical deletion.
  const oldPoles = memory.poles(active);
  same(oldPoles.start, K, "old active Link identity retains K");
  same(oldPoles.end, A, "old active Link identity retains A");

  // No tombstone/END/history Link is required for the 1 -> 0 current-state
  // transition itself.
  same(memory.linkCount, carrierBefore,
    "1 -> 0 reaction creates no append-only lifecycle record");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-relational-bundle-1-to-0-a72g.test.ts"),
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

  const a72a = readFileSync(
    join(root, "ts/test/research-v013-working-amemory-single-rewrite-a72a.test.ts"),
    "utf8",
  );
  assert(a72a.includes("UNARY_LOGIC_NOT_WORKING_DYNAMICS=GREEN_SCOPED_RESEARCH"),
    "existing 1 -> 1 witness remains retained");

  const a72e = readFileSync(
    join(root, "ts/test/research-v013-context-scaffold-cascade-a72e.test.ts"),
    "utf8",
  );
  assert(a72e.includes("CONTEXT_SCAFFOLD_CASCADE=GREEN_SCOPED_RESEARCH"),
    "Context scaffold witness remains retained");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72g: RELATIONAL_BUNDLE_1_TO_0=GREEN_SCOPED_RESEARCH",
    "ACTIVE_FORM=K_TO_A",
    "RELATION_FORM=SCOPED_LINK_BUNDLE",
    "MTS_SET_OBJECT=ABSENT",
    "INPUT_ACTIVE_LINKS=1",
    "OUTPUT_ACTIVE_LINKS=0",
    "OLD_ACTIVE_LINK_CURRENT_AFTER=FALSE",
    "OLD_ACTIVE_LINK_CANONICAL_IDENTITY_REMAINS=TRUE",
    "PHYSICAL_DELETION=NOT_CLAIMED",
    "NO_RULE_MEANS_DELETE=FALSE",
    "EMPTY_IMAGE_UNDER_APPLIED_RELATION_MEANS_BRANCH_DISAPPEARS=TRUE",
    "WORKING_STATE_COMMITS_PER_REACTION=1",
    "INTERMEDIATE_WORKING_STATE_EXPOSURE=0",
    "HOST_RELATION_ENUMERATION=RESIDUAL",
    "HOST_WORKING_MEMBERSHIP=RESIDUAL",
    "LINKS_ONLY_RELATIONAL_DYNAMICS=NOT_PROVEN",
    "ONE_TO_ONE=ALREADY_GREEN_A72A_TO_A72C",
    "NEXT=A72H_RELATIONAL_BUNDLE_1_TO_N_ATOMIC_SPLIT",
    "N_TO_1=OPEN",
    "N_TO_M=OPEN",
    "VARIABLE_ARITY_FUNCTIONS=DEFERRED",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
