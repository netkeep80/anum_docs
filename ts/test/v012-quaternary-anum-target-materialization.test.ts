import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  materializeQuaternaryAnum,
  materializeQuaternaryAnumTarget,
  resolveQuaternaryAnum,
  type QuaternaryAnumHierarchy,
} from "../src/quaternary-anum.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 Q target materialization: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function firstChild(value: QuaternaryAnumHierarchy): QuaternaryAnumHierarchy {
  const first = value.items[0];
  assert(first?.kind === "child", "expected first hierarchy item to be a child");
  return first.anum;
}
function setup(source: string) {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const address = materializeQuaternaryAnum(memory, basis, source);
  return { memory, basis, address };
}
function proveIdempotent(memory: Memory, run: () => LinkHandle, expected: LinkHandle): void {
  const before = memory.linkCount;
  same(run(), expected, "repeated target result");
  same(memory.linkCount, before, "repeated target write adds no Links");
}

for (const source of ["", "[]"]) {
  const { memory, basis, address } = setup(source);
  const before = memory.linkCount;
  same(materializeQuaternaryAnumTarget(memory, basis, address), basis.R, `${source || "empty"} target is R`);
  same(memory.linkCount, before, `${source || "empty"} target writes nothing`);
}

{
  const { memory, basis, address } = setup("01");
  same(memory.find(basis.U, basis.L), undefined, "B01 absent before target write");
  const target = materializeQuaternaryAnumTarget(memory, basis, address);
  same(memory.find(basis.U, basis.L), target, "01 root-cut creates B01");
  same(resolveQuaternaryAnum(memory, basis, address), target, "Resolve finds B01");
  proveIdempotent(memory, () => materializeQuaternaryAnumTarget(memory, basis, address), target);
}

{
  const { memory, basis, address } = setup("[01]");
  const A01 = firstChild(address).anumLink;
  const before = memory.linkCount;
  same(materializeQuaternaryAnumTarget(memory, basis, address), A01, "[01] cuts one R");
  same(memory.linkCount, before, "[01] needs no new Link");
  same(memory.find(basis.U, basis.L), undefined, "[01] must not create B01");
}

{
  const { memory, basis, address } = setup("[[01]]");
  const bracket01 = firstChild(address).anumLink;
  same(materializeQuaternaryAnumTarget(memory, basis, address), bracket01, "[[01]] cuts one R");
  same(memory.find(basis.U, basis.L), undefined, "[[01]] must not create B01");
}

{
  const { memory, basis, address } = setup("01[10]");
  same(memory.find(basis.U, basis.L), undefined, "B01 initially absent");
  same(memory.find(basis.L, basis.U), undefined, "B10 initially absent");
  const target = materializeQuaternaryAnumTarget(memory, basis, address);
  const B01 = memory.find(basis.U, basis.L);
  const B10 = memory.find(basis.L, basis.U);
  assert(B01 !== undefined, "01[10] creates B01");
  assert(B10 !== undefined, "01[10] creates B10");
  same(memory.find(B01, B10), target, "01[10] creates B01 -> B10");
  const beforeResolve = memory.linkCount;
  same(resolveQuaternaryAnum(memory, basis, address), target, "Resolve sees target");
  same(memory.linkCount, beforeResolve, "Resolve stays read-only");
  proveIdempotent(memory, () => materializeQuaternaryAnumTarget(memory, basis, address), target);
}

{
  const { memory, basis, address } = setup("01[[10]]");
  const indirect = address.items[2];
  assert(indirect?.kind === "child", "01[[10]] right operand is child hierarchy");
  const A10 = firstChild(indirect.anum).anumLink;
  same(memory.find(basis.U, basis.L), undefined, "B01 initially absent");
  same(memory.find(basis.L, basis.U), undefined, "B10 initially absent");
  const target = materializeQuaternaryAnumTarget(memory, basis, address);
  const B01 = memory.find(basis.U, basis.L);
  assert(B01 !== undefined, "01[[10]] creates B01");
  same(memory.find(B01, A10), target, "01[[10]] creates B01 -> Anum(10)");
  same(memory.find(basis.L, basis.U), undefined, "01[[10]] must not create B10");
}

console.log("MTS v0.12 Quaternary target one-root-cut materialization: GREEN.");
