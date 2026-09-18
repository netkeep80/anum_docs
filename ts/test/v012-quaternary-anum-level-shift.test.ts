import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  materializeQuaternaryAnum,
  resolveQuaternaryAnum,
  QuaternaryAnumError,
} from "../src/quaternary-anum.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 Q level shift: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function bitValue(basis: RootBasis, bit: "0" | "1"): LinkHandle {
  return bit === "0" ? basis.U : basis.L;
}

function exactFlat(
  memory: Memory,
  basis: RootBasis,
  bits: readonly ("0" | "1")[],
): LinkHandle {
  let current = basis.R;
  for (const bit of bits) {
    current = memory.ensure(current, bitValue(basis, bit));
  }
  return current;
}

function expectProtocolError(
  fn: () => unknown,
  code: QuaternaryAnumError["code"],
  message: string,
): void {
  try {
    fn();
    throw new Error(`expected ${code}`);
  } catch (error) {
    assert(error instanceof QuaternaryAnumError, `${message}: wrong error ${String(error)}`);
    same(error.code, code, message);
  }
}

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const anum = materializeQuaternaryAnum(memory, basis, "");
  same(anum.anumLink, basis.R, "empty exact Anum is R");
  same(anum.rootClosed, false, "empty source does not explicitly close root");
  const before = memory.linkCount;
  same(resolveQuaternaryAnum(memory, basis, anum), basis.R, "empty resolves to R");
  same(memory.linkCount, before, "empty Resolve is read-only");
}

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const anum = materializeQuaternaryAnum(memory, basis, "[]");
  same(anum.anumLink, basis.R, "[] exact Anum collapses to R");
  const before = memory.linkCount;
  same(resolveQuaternaryAnum(memory, basis, anum), basis.R, "[] resolves to R");
  same(memory.linkCount, before, "[] Resolve is read-only");
}

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const anum = materializeQuaternaryAnum(memory, basis, "01");
  const expectedAnum = exactFlat(memory, basis, ["0", "1"]);
  same(anum.anumLink, expectedAnum, "01 exact Anum topology");

  const B01 = memory.ensure(basis.U, basis.L);
  const before = memory.linkCount;
  same(resolveQuaternaryAnum(memory, basis, anum), B01, "des(01) = B01");
  same(memory.linkCount, before, "01 Resolve is read-only");
}

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const anum = materializeQuaternaryAnum(memory, basis, "[01]");
  const A01 = exactFlat(memory, basis, ["0", "1"]);
  const expected = memory.ensure(basis.R, A01);
  const B01 = memory.ensure(basis.U, basis.L);
  same(anum.anumLink, expected, "[01] exact Anum topology");

  const before = memory.linkCount;
  const resolved = resolveQuaternaryAnum(memory, basis, anum);
  same(resolved, A01, "des([01]) = Anum(01)");
  assert(resolved !== B01, "one Resolve must not recursively dereference Anum(01)");
  same(memory.linkCount, before, "[01] Resolve is read-only");
}

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const anum = materializeQuaternaryAnum(memory, basis, "[[01]]");
  const A01 = exactFlat(memory, basis, ["0", "1"]);
  const bracket01 = memory.ensure(basis.R, A01);
  const expected = memory.ensure(basis.R, bracket01);
  same(anum.anumLink, expected, "[[01]] exact Anum topology");

  const before = memory.linkCount;
  same(resolveQuaternaryAnum(memory, basis, anum), bracket01, "des([[01]]) = Anum([01])");
  same(memory.linkCount, before, "[[01]] Resolve is read-only");
}

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const anum = materializeQuaternaryAnum(memory, basis, "01[10]");
  const A01 = exactFlat(memory, basis, ["0", "1"]);
  const A10 = exactFlat(memory, basis, ["1", "0"]);
  same(anum.anumLink, memory.ensure(A01, A10), "01[10] exact hierarchy");

  const B01 = memory.ensure(basis.U, basis.L);
  const B10 = memory.ensure(basis.L, basis.U);
  const expected = memory.ensure(B01, B10);
  const before = memory.linkCount;
  same(resolveQuaternaryAnum(memory, basis, anum), expected, "des(01[10]) = B01 -> B10");
  same(memory.linkCount, before, "01[10] Resolve is read-only");
}

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const anum = materializeQuaternaryAnum(memory, basis, "01[[10]]");
  const A01 = exactFlat(memory, basis, ["0", "1"]);
  const A10 = exactFlat(memory, basis, ["1", "0"]);
  const bracket10 = memory.ensure(basis.R, A10);
  same(anum.anumLink, memory.ensure(A01, bracket10), "01[[10]] exact hierarchy");

  const B01 = memory.ensure(basis.U, basis.L);
  const expected = memory.ensure(B01, A10);
  const before = memory.linkCount;
  const resolved = resolveQuaternaryAnum(memory, basis, anum);
  same(resolved, expected, "des(01[[10]]) = B01 -> Anum(10)");
  same(memory.linkCount, before, "01[[10]] Resolve is read-only");
}

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const closed = materializeQuaternaryAnum(memory, basis, "]");
  same(closed.anumLink, basis.R, "leading ] leaves root value R");
  same(closed.rootClosed, true, "leading ] records explicit root close");
  assert(closed.anumLink !== basis.C, "] is protocol close, not ordinary C append");

  expectProtocolError(
    () => materializeQuaternaryAnum(memory, basis, "]["),
    "trailing-after-root-close",
    "structural source after root close is rejected",
  );
  expectProtocolError(
    () => materializeQuaternaryAnum(memory, basis, "]01"),
    "trailing-after-root-close",
    "data source after root close is rejected",
  );
}

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  expectProtocolError(
    () => materializeQuaternaryAnum(memory, basis, "["),
    "unclosed-open",
    "unclosed child",
  );
}

console.log("MTS v0.12 Quaternary Anum hierarchy-wide one-level shift: GREEN.");
