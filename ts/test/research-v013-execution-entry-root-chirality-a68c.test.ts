import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
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
  if (!c) throw new Error(`v0.13 A68c execution-entry root chirality: ${m}`);
}

function same<T>(actual: T, expected: T, m: string): void {
  assert(Object.is(actual, expected), `${m}: values differ`);
}

function distinct(a: LinkHandle, b: LinkHandle, m: string): void {
  assert(a !== b, m);
}

function contextOrUndefined(
  memory: Memory,
  value: LinkHandle,
): { readonly parent: LinkHandle; readonly current: LinkHandle } | undefined {
  try {
    return readContext(memory, value);
  } catch (error) {
    if (error instanceof StateError && error.code === "invalid-context") {
      return undefined;
    }
    throw error;
  }
}

function sequenceOrUndefined(
  memory: Memory,
  value: LinkHandle,
): readonly LinkHandle[] | undefined {
  try {
    return readExactSequence(memory, value).values;
  } catch (error) {
    if (error instanceof ExactSequenceError) return undefined;
    throw error;
  }
}

function ancestryUntilNonContext(
  memory: Memory,
  leaf: LinkHandle,
): {
  readonly contexts: readonly LinkHandle[];
  readonly boundary: LinkHandle;
} {
  const contexts: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();
  let current = leaf;

  while (true) {
    assert(!seen.has(current), "context ancestry cycle");
    seen.add(current);

    const state = contextOrUndefined(memory, current);
    if (state === undefined) {
      return Object.freeze({
        contexts: Object.freeze(contexts),
        boundary: current,
      });
    }

    contexts.push(current);
    current = state.parent;
  }
}

function exercise(noise: boolean): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  if (noise) {
    memory.ensure(memory.ensure(b.U, b.C), memory.ensure(b.O, b.L));
  }

  const R = b.R;
  const O = b.O; // ♂∞ = START(R)
  const C = b.C; // ∞♀ = END(R)

  // -----------------------------------------------------------------------
  // Compare R / O / C as possible roots for a START-growing Context stack.
  // -----------------------------------------------------------------------

  // R is not itself a Context, but it is the canonical empty ExactSequence.
  same(contextOrUndefined(memory, R), undefined, "R is not a Context");
  const rSeq = sequenceOrUndefined(memory, R);
  assert(rSeq !== undefined, "R is valid empty ExactSequence");
  same(rSeq.length, 0, "R is ExactSequence([])");

  // O is intrinsically ambiguous under the current generic readers:
  //
  //   O = START(R)
  //     = Context(R,R)
  //     = ExactSequence([R])
  //
  const oContext = contextOrUndefined(memory, O);
  assert(oContext !== undefined, "O is readable as Context");
  same(oContext.parent, R, "O Context parent is R");
  same(oContext.current, R, "O Context current is R");

  const oSeq = sequenceOrUndefined(memory, O);
  assert(oSeq !== undefined, "O is readable as ExactSequence");
  same(oSeq.length, 1, "O ExactSequence arity");
  same(oSeq[0], R, "O = ExactSequence([R])");

  // C is the chiral opposite: END-self-closed rather than START-self-closed.
  // It is therefore neither an ordinary Context nor an ExactSequence cell.
  same(contextOrUndefined(memory, C), undefined, "C is not a Context");
  same(sequenceOrUndefined(memory, C), undefined, "C is not an ExactSequence");

  // -----------------------------------------------------------------------
  // R-rooted Context history is literally the same Link as ExactSequence of
  // the same state values. This is exact identity, not an analogy.
  // -----------------------------------------------------------------------
  const s0 = memory.ensure(b.L, b.U);
  const s1 = memory.ensure(b.O, b.C);
  const s2 = memory.ensure(s0, s1);

  const rK0 = defineContext(memory, R, s0);
  const rK1 = defineContext(memory, rK0, s1);
  const rK2 = defineContext(memory, rK1, s2);

  same(rK0, materializeExactSequence(memory, [s0]),
    "R-rooted K0 equals ExactSequence([s0])");
  same(rK1, materializeExactSequence(memory, [s0, s1]),
    "R-rooted K1 equals ExactSequence([s0,s1])");
  same(rK2, materializeExactSequence(memory, [s0, s1, s2]),
    "R-rooted K2 equals ExactSequence([s0,s1,s2])");

  const rAncestry = ancestryUntilNonContext(memory, rK2);
  same(rAncestry.boundary, R, "R-rooted Context ancestry stops at R");
  same(rAncestry.contexts.length, 3, "R-rooted Context depth");

  // Zero state is additionally degenerate:
  // Context(R,R) = START(R->R) = START(R) = O.
  same(defineContext(memory, R, R), O,
    "R-rooted zero Context collapses to O");

  // -----------------------------------------------------------------------
  // O-rooted Context history remains an ExactSequence too: O already equals
  // ExactSequence([R]), so child contexts simply extend that data sequence.
  // Also, ancestry does not intrinsically stop at O because O is a Context.
  // -----------------------------------------------------------------------
  const oK0 = defineContext(memory, O, s0);
  const oK1 = defineContext(memory, oK0, s1);

  same(oK0, materializeExactSequence(memory, [R, s0]),
    "O-rooted K0 equals ExactSequence([R,s0])");
  same(oK1, materializeExactSequence(memory, [R, s0, s1]),
    "O-rooted K1 equals ExactSequence([R,s0,s1])");

  const oAncestry = ancestryUntilNonContext(memory, oK1);
  same(oAncestry.boundary, R,
    "generic Context ancestry passes through O and stops only at R");
  same(oAncestry.contexts.length, 3,
    "O-rooted K1 ancestry includes O itself as an extra Context");
  same(oAncestry.contexts[2], O,
    "O cannot be an intrinsic non-Context ancestry sentinel");

  // -----------------------------------------------------------------------
  // C-rooted Context history keeps the same recursive START constructor but
  // gains a structurally distinct END boundary.
  // -----------------------------------------------------------------------
  const cK0 = defineContext(memory, C, s0);
  const cK1 = defineContext(memory, cK0, s1);
  const cK2 = defineContext(memory, cK1, s2);

  const c0 = readContext(memory, cK0);
  same(c0.parent, C, "C-rooted K0 parent is END boundary C");
  same(c0.current, s0, "C-rooted K0 carries initial state");

  const c1 = readContext(memory, cK1);
  same(c1.parent, cK0, "C-rooted K1 parent");
  same(c1.current, s1, "C-rooted K1 state");

  const c2 = readContext(memory, cK2);
  same(c2.parent, cK1, "C-rooted K2 parent");
  same(c2.current, s2, "C-rooted K2 state");

  const cAncestry = ancestryUntilNonContext(memory, cK2);
  same(cAncestry.boundary, C,
    "C-rooted Context ancestry intrinsically stops at END boundary C");
  same(cAncestry.contexts.length, 3, "C-rooted Context depth");

  // The END-rooted chain cannot be re-read as ordinary ExactSequence data.
  same(sequenceOrUndefined(memory, cK0), undefined,
    "C-rooted K0 is not ExactSequence");
  same(sequenceOrUndefined(memory, cK1), undefined,
    "C-rooted K1 is not ExactSequence");
  same(sequenceOrUndefined(memory, cK2), undefined,
    "C-rooted K2 is not ExactSequence");

  distinct(cK0, materializeExactSequence(memory, [s0]),
    "C-rooted Context differs from one-value data sequence");
  distinct(cK1, materializeExactSequence(memory, [s0, s1]),
    "C-rooted Context differs from two-value data sequence");

  // Zero initial state no longer collapses to the root START aspect O.
  const cZero = defineContext(memory, C, R);
  distinct(cZero, R, "C-rooted zero entry differs from R");
  distinct(cZero, O, "C-rooted zero entry differs from O");
  distinct(cZero, C, "C-rooted zero entry differs from C");
  same(readContext(memory, cZero).parent, C,
    "C-rooted zero entry still terminates at C");

  // Multiple concrete entry contexts can share the same boundary while
  // remaining distinct. C is the context-tree sentinel; K0 is the actual
  // state-carrying entry candidate.
  const otherState = memory.ensure(b.C, b.L);
  const cEntryA = defineContext(memory, C, s0);
  const cEntryB = defineContext(memory, C, otherState);
  distinct(cEntryA, cEntryB, "two entry contexts under C remain distinct");
  same(readContext(memory, cEntryA).parent, C, "entry A rooted at C");
  same(readContext(memory, cEntryB).parent, C, "entry B rooted at C");

  // Root-boundary presence alone and concrete entry-context presence are
  // structurally distinct facts.
  const cPoles = memory.poles(C);
  same(cPoles.start, R, "C boundary START pole is R");
  same(cPoles.end, C, "C boundary is END-self-closed");
  assert(cPoles.start !== cEntryA && cPoles.end !== cEntryA,
    "C boundary does not contain concrete entry identity");

  // This experiment proves topology/role separation only. Discovery of K0 by
  // an asynchronous control-flow scheduler from ambient Memory is deliberately
  // deferred: that is a separate authority boundary.
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-execution-entry-root-chirality-a68c.test.ts"),
    "utf8",
  );
  const state = readFileSync(join(root, "ts/src/state.ts"), "utf8");
  const sequence = readFileSync(join(root, "ts/src/exact-sequence.ts"), "utf8");

  assert(
    state.includes("return memory.ensureStartSelfClosed(payload);"),
    "Context constructor remains generic START(parent->current)",
  );
  assert(
    sequence.includes("current = memory.ensureStartSelfClosed(payload);"),
    "ExactSequence constructor remains generic START(previous->value)",
  );

  const exercise = own.slice(
    own.indexOf("function exercise("),
    own.indexOf("\nfunction staticGuards("),
  );
  for (const forbidden of [
    ".delete(",
    ".remove(",
    "deleteLink",
    "removeLink",
    "jsonRVM",
  ]) {
    assert(!exercise.includes(forbidden),
      `A68c excludes unrelated mutation/semantics: ${forbidden}`);
  }
}

function main(): void {
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A68c: EXECUTION_ENTRY_ROOT_CHIRALITY=GREEN_SCOPED_RESEARCH",
    "R_CONTEXT=NO R_EXACT_SEQUENCE=EMPTY",
    "O_CONTEXT=R_TO_R O_EXACT_SEQUENCE=ONE_R ROLE_COLLISION=YES",
    "C_CONTEXT=NO C_EXACT_SEQUENCE=NO END_BOUNDARY_DISTINCT=YES",
    "R_ROOTED_CONTEXT_CHAIN=IDENTICAL_TO_EXACT_SEQUENCE_OF_STATES",
    "O_ROOTED_CONTEXT_CHAIN=IDENTICAL_TO_R_PREFIXED_EXACT_SEQUENCE",
    "C_ROOTED_CONTEXT_CHAIN=START_GROWING_BUT_NOT_EXACT_SEQUENCE",
    "C_ROOTED_ANCESTRY=INTRINSICALLY_STOPS_AT_C",
    "O_ROOTED_ANCESTRY=DOES_NOT_STOP_AT_O_WITH_GENERIC_CONTEXT_READER",
    "R_ROOTED_ZERO_CONTEXT=O_COLLAPSE",
    "C_ROOTED_ZERO_ENTRY=DISTINCT_FROM_R_O_C",
    "MULTIPLE_C_ROOTED_ENTRY_CONTEXTS=DISTINCT",
    "C_BOUNDARY_AND_CONCRETE_ENTRY_CONTEXT=DISTINCT",
    "C_AS_FINAL_CONTEXT_ROOT=CANDIDATE_STRONGLY_SUPPORTED_NOT_ACCEPTED",
    "ENTRY_DISCOVERY_FROM_AMBIENT_MEMORY=NOT_TESTED",
    "NEXT=A68D_ENTRY_ACTIVATION_DISCOVERY_AUTHORITY",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
