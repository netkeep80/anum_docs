import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error(`v0.13 A65b context-native cardinality: ${m}`);
}
function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), `${m}: values differ`);
}
function expectThrows(fn: () => void, m: string): void {
  let threw = false;
  try { fn(); } catch { threw = true; }
  assert(threw, m);
}

function chain(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  let body = memory.root;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    body = memory.ensure(values[i]!, body);
  }
  return memory.ensureStartSelfClosed(body);
}

function readChain(memory: Memory, envelope: LinkHandle): readonly LinkHandle[] {
  const e = memory.poles(envelope);
  assert(e.start === envelope && e.end !== envelope, "proper selected-result envelope");
  const out: LinkHandle[] = [];
  let cursor = e.end;
  const seen = new Set<LinkHandle>();
  while (cursor !== memory.root) {
    assert(!seen.has(cursor), "selected-result cycle");
    seen.add(cursor);
    const p = memory.poles(cursor);
    out.push(p.start);
    cursor = p.end;
  }
  return Object.freeze(out);
}

function frame(memory: Memory, parent: LinkHandle, f: LinkHandle, q: LinkHandle): LinkHandle {
  return defineContext(memory, parent, memory.ensure(f, q));
}

function advanceSelected(
  memory: Memory,
  context: LinkHandle,
  selectedResults: LinkHandle,
): readonly LinkHandle[] {
  const k = readContext(memory, context);
  const state = memory.poles(k.current);
  const f = state.start;
  const q = state.end;
  assert(q !== memory.root, "cursor is not exhausted");
  const cursor = memory.poles(q);
  const argument = cursor.start;
  const nextQ = cursor.end;
  const expectedApplication = memory.ensure(f, argument);

  return Object.freeze(readChain(memory, selectedResults).map((selected) => {
    const fact = memory.poles(selected);
    same(fact.start, expectedApplication, "selected fact belongs to current application");
    return frame(memory, context, fact.end, nextQ);
  }));
}

function exercise(noise: boolean): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  if (noise) memory.ensure(memory.ensure(b.U, b.C), b.O);

  const f = memory.ensure(b.L, b.U);
  const arg = memory.ensure(b.O, b.C);
  const nextQ = memory.ensure(b.C, b.L);
  const q = memory.ensure(arg, nextQ);
  const k = frame(memory, memory.root, f, q);
  const application = memory.ensure(f, arg);

  const y1 = memory.ensure(b.C, b.O);
  const y2 = memory.ensure(b.O, b.L);
  const fact1 = memory.ensure(application, y1);
  const fact2 = memory.ensure(application, y2);

  const zero = advanceSelected(memory, k, chain(memory, []));
  same(zero.length, 0, "ZERO selected results produce no child");

  const one = advanceSelected(memory, k, chain(memory, [fact1]));
  same(one.length, 1, "ONE selected result produces one child");
  const oneState = memory.poles(readContext(memory, one[0]!).current);
  same(oneState.start, y1, "ONE child F");
  same(oneState.end, nextQ, "ONE child next Q");

  const many = advanceSelected(memory, k, chain(memory, [fact1, fact2]));
  same(many.length, 2, "MANY selected results produce two children");
  assert(many[0] !== many[1], "MANY children are distinct");
  const m0 = readContext(memory, many[0]!);
  const m1 = readContext(memory, many[1]!);
  same(m0.parent, k, "MANY child 0 parent");
  same(m1.parent, k, "MANY child 1 parent");
  same(memory.poles(m0.current).end, nextQ, "MANY child 0 next Q");
  same(memory.poles(m1.current).end, nextQ, "MANY child 1 next Q");

  const ambientY = memory.ensure(b.U, b.L);
  memory.ensure(application, ambientY);
  const stillOne = advanceSelected(memory, k, chain(memory, [fact1]));
  same(stillOne.length, 1, "ambient unselected result is inert");
  same(stillOne[0], one[0], "ambient result does not change selected child");

  const wrongArg = memory.ensure(b.U, b.C);
  const wrongFact = memory.ensure(memory.ensure(f, wrongArg), ambientY);
  expectThrows(
    () => advanceSelected(memory, k, chain(memory, [wrongFact])),
    "selected mismatched result rejects",
  );
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-context-native-cardinality-a65b.test.ts"),
    "utf8",
  );
  const start = own.indexOf("function advanceSelected(");
  const end = own.indexOf("\nfunction exercise(", start);
  assert(start >= 0 && end > start, "advanceSelected slice");
  const step = own.slice(start, end);
  for (const forbidden of [
    "while (true)",
    "recursive",
    "frontier",
    "schedule",
    "occurrence",
    "publication",
    "admission",
  ]) {
    assert(!step.includes(forbidden), `one-step cardinality excludes ${forbidden}`);
  }
}

function main(): void {
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A65b: CONTEXT_NATIVE_ONE_STEP_CARDINALITY=GREEN_SCOPED_RESEARCH",
    "ZERO=0_CHILD ONE=1_CHILD MANY=2_CHILD",
    "MANY_CHILDREN=SIBLING_CONTEXTS",
    "SIBLINGS_SHARE_PARENT_AND_NEXT_Q=YES",
    "AMBIENT_UNSELECTED_RESULT=INERT",
    "SELECTED_MISMATCH=REJECTED",
    "RESULT_SELECTION_SOURCE=EXTERNAL_SCOPED_BOUNDARY",
    "RECURSION=NOT_TESTED TERMINATION=NOT_TESTED CONVERGENCE=NOT_TESTED",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
