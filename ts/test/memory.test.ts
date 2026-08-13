import {
  Memory,
  MemoryError,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSame<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

function assertIncludes(
  values: readonly LinkHandle[],
  expected: LinkHandle,
  message: string,
): void {
  assert(values.includes(expected), message);
}

function assertMemoryError(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof MemoryError, `${message}: wrong error type`);
    return;
  }
  throw new Error(`${message}: expected MemoryError`);
}

function observeOnly(
  memory: ReadMemory,
  start: LinkHandle,
  end: LinkHandle,
): number {
  memory.poles(start);
  memory.find(start, end);
  memory.outgoing(start);
  memory.incoming(end);
  return memory.linkCount;
}

const memory = new Memory();
const { R, O, C, L, U } = ensureRootBasis(memory);

assertSame(memory.linkCount, 5, "root basis must contain exactly five Links");
assertSame(memory.ensureRoot(), R, "ensureRoot must reuse R");
assertSame(memory.ensure(R, R), R, "R -> R must resolve to R");

const rootPoles = memory.poles(R);
assertSame(rootPoles.start, R, "R start must be R");
assertSame(rootPoles.end, R, "R end must be R");

const openingPoles = memory.poles(O);
assertSame(openingPoles.start, O, "O must be start-self-closed");
assertSame(openingPoles.end, R, "O must end at R");
assertSame(memory.ensureStartSelfClosed(R), O, "start self-closure must be canonical");

const closingPoles = memory.poles(C);
assertSame(closingPoles.start, R, "C must start at R");
assertSame(closingPoles.end, C, "C must be end-self-closed");
assertSame(memory.ensureEndSelfClosed(R), C, "end self-closure must be canonical");

const linkedPoles = memory.poles(L);
assertSame(linkedPoles.start, O, "L must start at O");
assertSame(linkedPoles.end, C, "L must end at C");
assertSame(memory.ensure(O, C), L, "same ordered pair must reuse L");

const unlinkedPoles = memory.poles(U);
assertSame(unlinkedPoles.start, C, "U must start at C");
assertSame(unlinkedPoles.end, O, "U must end at O");
assertSame(memory.ensure(C, O), U, "same ordered pair must reuse U");

assert(O !== R, "O must be structurally distinct from R");
assert(C !== R, "C must be structurally distinct from R");
assert(L !== U, "ordered pole orientation must remain observable");

assertSame(memory.find(R, R), R, "pair index must find R");
assertSame(memory.find(O, C), L, "pair index must find L");
assertSame(memory.find(C, O), U, "pair index must find U");
assertIncludes(memory.outgoing(O), O, "outgoing index must include O self-closure");
assertIncludes(memory.outgoing(O), L, "outgoing index must include L");
assertIncludes(memory.incoming(C), C, "incoming index must include C self-closure");
assertIncludes(memory.incoming(C), L, "incoming index must include L");

const beforeReads = memory.linkCount;
assertSame(observeOnly(memory, O, C), beforeReads, "read view must not materialize");
assertSame(memory.linkCount, beforeReads, "read operations must preserve link count");

const loop = memory.ensure(L, L);
assert(loop !== L, "ordinary Loop(L) must not make L fully self-closed");
const loopPoles = memory.poles(loop);
assertSame(loopPoles.start, L, "Loop(L) start must be L");
assertSame(loopPoles.end, L, "Loop(L) end must be L");
assertSame(memory.ensure(L, L), loop, "ordinary loop pair must be canonical");

const foreignRoot = new Memory().root;
assertMemoryError(
  () => memory.poles(foreignRoot),
  "foreign technical handle must be rejected",
);

const forged = Object.freeze({}) as LinkHandle;
assertMemoryError(
  () => memory.poles(forged),
  "forged technical handle must be rejected",
);
