import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
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

function proveIdempotent(
  memory: Memory,
  materialize: () => LinkHandle,
  expected: LinkHandle,
  message: string,
): void {
  const before = memory.linkCount;
  same(materialize(), expected, `${message}: repeated result`);
  same(memory.linkCount, before, `${message}: repeated call adds no Links`);
}

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const empty = materializeQuaternaryAnum(memory, basis, "");
  const before = memory.linkCount;
  same(
    materializeQuaternaryAnumTarget(memory, basis, empty),
    basis.R,
    "empty target is R",
  );
  same(memory.linkCount, before, "empty target materialization writes nothing");
}

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const emptyGroup = materializeQuaternaryAnum(memory, basis, "[]");
  const before = memory.linkCount;
  same(
    materializeQuaternaryAnumTarget(memory, basis, emptyGroup),
    basis.R,
    "[] target is R",
  );
  same(memory.linkCount, before, "[] target materialization writes nothing");
}

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const address = materializeQuaternaryAnum(memory, basis, "01");

  same(memory.find(basis.U, basis.L), undefined, "B01 absent before target write");
  const target = materializeQuaternaryAnumTarget(memory, basis, address);
  same(memory.find(basis.U, basis.L), target, "01 root-cut creates B01");
  same(resolveQuaternaryAnum(memory, basis, address), target, "Resolve finds materialized B01");
  proveIdempotent(
    memory,
    () => materializeQuaternaryAnumTarget(memory, basis, address),
    target,
    "01 target materialization is idempotent",
  );
}

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const address = materializeQuaternaryAnum(memory, basis, "[01]");
  const A01 = firstChild(address).anumLink;

  same(memory.find(basis.U, basis.L), undefined, "B01 absent before [01] target write");
  const before = memory.linkCount;
  same(
    materializeQuaternaryAnumTarget(memory, basis, address),
    A01,
    "[01] cuts only the outer leading R",
  );
  same(memory.linkCount, before, "[01] needs no new Link after address exists");
  same(
    memory.find(basis.U, basis.L),
    undefined,
    "[01] target write must not descend another level to B01",
  );
}

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const address = materializeQuaternaryAnum(memory, basis, "[[01]]");
  const bracket01 = firstChild(address).anumLink;

  same(
    materializeQuaternaryAnumTarget(memory, basis, address),
    bracket01,
    "[[01]] cuts only one outer R level",
  );
  same(
    memory.find(basis.U, basis.L),
    undefined,
    "[[01]] target write must not descend to B01",
  );
}

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const address = materializeQuaternaryAnum(memory, basis, "01[10]");

  same(memory.find(basis.U, basis.L), undefined, "B01 absent before relative target write");
  same(memory.find(basis.L, basis.U), undefined, "B10 absent before relative target write");

  const target = materializeQuaternaryAnumTarget(memory, basis, address);
  const B01 = memory.find(basis.U, basis.L);
  const B10 = memory.find(basis.L, basis.U);
  assert(B01 !== undefined, "01[10] materializes left one-root-cut B01");
  assert(B10 !== undefined, "01[10] materializes right one-root-cut B10");
  same(memory.find(B01, B10), target, "01[10] materializes B01 -> B10");

  const beforeResolve = memory.linkCount;
  same(resolveQuaternaryAnum(memory, basis, address), target, "Resolve sees written relative target");
  same(memory.linkCount, beforeResolve, "Resolve remains read-only after target write");
  proveIdempotent(
    memory,
    () => materializeQuaternaryAnumTarget(memory, basis, address),
    target,
    "01[10] target materialization is idempotent",
  );
}

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const address = materializeQuaternaryAnum(memory, basis, "01[[10]]");

  const outerItems = address.items;
  const indirect = outerItems[2];
  assert(indirect?.kind === "child", "01[[10]] right operand is child hierarchy");
  const inner = firstChild(indirect.anum);
  const A10 = inner.anumLink;

  same(memory.find(basis.U, basis.L), undefined, "B01 absent before indirect target write");
  same(memory.find(basis.L, basis.U), undefined, "B10 absent before indirect target write");

  const target = materializeQuaternaryAnumTarget(memory, basis, address);
  const B01 = memory.find(basis.U, basis.L);
  assert(B01 !== undefined, "01[[10]] materializes B01");
  same(memory.find(B01, A10), target, "01[[10]] materializes B01 -> Anum(10)");
  same(
    memory.find(basis.L, basis.U),
    undefined,
    "01[[10]] must not strip the remaining R from Anum(10)",
  );
}

console.log("MTS v0.12 Quaternary target one-root-cut materialization: GREEN.");
