import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error(`v0.13 A65a context-native step: ${m}`);
}
function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), `${m}: values differ`);
}
function expectThrows(fn: () => void, m: string): void {
  let threw = false;
  try { fn(); } catch { threw = true; }
  assert(threw, m);
}

function defineFrame(
  memory: Memory,
  parent: LinkHandle,
  f: LinkHandle,
  q: LinkHandle,
): LinkHandle {
  return defineContext(memory, parent, memory.ensure(f, q));
}

function advanceOne(
  memory: Memory,
  context: LinkHandle,
  selectedResultFact: LinkHandle,
): LinkHandle {
  const k = readContext(memory, context);
  const state = memory.poles(k.current);
  const f = state.start;
  const q = state.end;

  assert(q !== memory.root, "argument cursor is not exhausted");
  const cursor = memory.poles(q);
  const argument = cursor.start;
  const nextQ = cursor.end;

  const fact = memory.poles(selectedResultFact);
  const application = memory.poles(fact.start);
  same(application.start, f, "selected result uses current F");
  same(application.end, argument, "selected result uses current argument");

  return defineFrame(memory, context, fact.end, nextQ);
}

function exercise(noise: boolean): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  if (noise) memory.ensure(memory.ensure(b.U, b.C), b.O);

  const f = memory.ensure(b.L, b.U);
  const argument = memory.ensure(b.O, b.C);
  const nextQ = memory.ensure(b.C, b.L);
  const q = memory.ensure(argument, nextQ);
  const y = memory.ensure(b.C, b.O);

  const k = defineFrame(memory, memory.root, f, q);
  const application = memory.ensure(f, argument);
  const resultFact = memory.ensure(application, y);

  const child = advanceOne(memory, k, resultFact);
  const childState = readContext(memory, child);
  same(childState.parent, k, "child parent is exact previous context");

  const state = memory.poles(childState.current);
  same(state.start, y, "result becomes next F");
  same(state.end, nextQ, "cursor advances independently to next Q");

  const oldState = memory.poles(readContext(memory, k).current);
  same(oldState.start, f, "parent keeps original F");
  same(oldState.end, q, "parent keeps original Q");

  const wrongF = memory.ensure(b.O, b.U);
  const wrongFResult = memory.ensure(memory.ensure(wrongF, argument), y);
  expectThrows(
    () => advanceOne(memory, k, wrongFResult),
    "wrong F result is rejected",
  );

  const wrongArgument = memory.ensure(b.U, b.L);
  const wrongArgResult = memory.ensure(memory.ensure(f, wrongArgument), y);
  expectThrows(
    () => advanceOne(memory, k, wrongArgResult),
    "wrong argument result is rejected",
  );
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-context-native-step-a65a.test.ts"),
    "utf8",
  );
  const start = own.indexOf("function advanceOne(");
  const end = own.indexOf("\nfunction exercise(", start);
  assert(start >= 0 && end > start, "advanceOne slice");
  const step = own.slice(start, end);

  for (const forbidden of [
    "MetaState",
    "materializeExactSequence",
    "currentFn:",
    "tos:",
    "occurrence",
    "frontier",
    "schedule",
    "publication",
    "admission",
  ]) {
    assert(!step.includes(forbidden), `atomic step excludes ${forbidden}`);
  }
  assert(
    step.includes("readContext(memory, context)"),
    "F and Q are recovered from selected context",
  );
}

function main(): void {
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A65a: CONTEXT_NATIVE_SINGLE_STEP=GREEN_SCOPED_RESEARCH",
    "INPUTS=CONTEXT_PLUS_SELECTED_RESULT_FACT",
    "SEPARATE_CURRENT_FN=0 SEPARATE_TOS=0 METASTATE_TUPLE=0",
    "CURRENT_STATE=K_CURRENT_EQ_F_TO_Q",
    "CURRENT_ARGUMENT=START_Q NEXT_Q=END_Q",
    "RESULT_FACT=(F_TO_ARG)_TO_Y",
    "CHILD_STATE=Y_TO_NEXT_Q",
    "PARENT_CONTEXT_IMMUTABLE=YES",
    "WRONG_F=REJECTED WRONG_ARGUMENT=REJECTED",
    "MANY=NOT_TESTED RECURSION=NOT_TESTED CONVERGENCE=NOT_TESTED",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
