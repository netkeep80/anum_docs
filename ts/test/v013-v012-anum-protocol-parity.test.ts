import {
  Memory,
  ensureRootBasis,
  type RootBasis,
} from "../src/memory.js";
import {
  materializeQuaternaryAnum,
  materializeQuaternaryAnumTarget,
  QuaternaryAnumError,
  resolveQuaternaryAnum,
  type QuaternaryAnumHierarchy,
} from "../src/quaternary-anum.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13/v0.12 Anum protocol parity: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function firstChild(value: QuaternaryAnumHierarchy): QuaternaryAnumHierarchy {
  const first = value.items[0];
  assert(first?.kind === "child", "expected first item to be nested Anum");
  return first.anum;
}

function invalidBasis(basis: RootBasis): RootBasis {
  return Object.freeze({
    ...basis,
    O: basis.C,
  });
}

// ---------------------------------------------------------------------------
// P1. UNINTERPRETABLE is distinct from NOT_FOUND.
// Invalid structural authority is rejected, while a valid understood address
// can simply have no currently materialized target.
// ---------------------------------------------------------------------------

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const exact = materializeQuaternaryAnum(memory, basis, "01");

  const beforeInvalid = memory.linkCount;
  let uninterpretable = false;
  try {
    resolveQuaternaryAnum(memory, invalidBasis(basis), exact);
  } catch (error) {
    assert(error instanceof QuaternaryAnumError, "invalid basis uses protocol error");
    same(error.code, "invalid-root-basis", "UNINTERPRETABLE structural basis error");
    uninterpretable = true;
  }
  assert(uninterpretable, "invalid structural basis is UNINTERPRETABLE");
  same(memory.linkCount, beforeInvalid, "UNINTERPRETABLE read writes nothing");

  const beforeNotFound = memory.linkCount;
  same(
    resolveQuaternaryAnum(memory, basis, exact),
    undefined,
    "valid understood address reports NOT_FOUND while target is absent",
  );
  same(memory.linkCount, beforeNotFound, "NOT_FOUND Resolve is read-only");

  const target = materializeQuaternaryAnumTarget(memory, basis, exact);
  const beforeFound = memory.linkCount;
  same(
    resolveQuaternaryAnum(memory, basis, exact),
    target,
    "same understood address reports FOUND after authorized target materialization",
  );
  same(memory.linkCount, beforeFound, "FOUND Resolve is read-only");
}

// ---------------------------------------------------------------------------
// P2. Exact address materialization and target materialization are different.
// Exact materialization must not accidentally create the addressed semantic
// target.
// ---------------------------------------------------------------------------

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  same(memory.find(basis.U, basis.L), undefined, "B01 absent initially");
  const exact = materializeQuaternaryAnum(memory, basis, "01");
  same(
    memory.find(basis.U, basis.L),
    undefined,
    "materializing exact rooted address does not materialize B01 target",
  );

  const beforeResolve = memory.linkCount;
  same(resolveQuaternaryAnum(memory, basis, exact), undefined, "Resolve sees NOT_FOUND");
  same(memory.linkCount, beforeResolve, "Resolve does not materialize target");

  const target = materializeQuaternaryAnumTarget(memory, basis, exact);
  same(memory.find(basis.U, basis.L), target, "MATERIALIZE_TARGET creates B01");
}

// ---------------------------------------------------------------------------
// P3. Resolve and MATERIALIZE_TARGET both perform exactly one hierarchy-wide
// leading-R cut. Remaining Anum indirection must survive.
// ---------------------------------------------------------------------------

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  const direct = materializeQuaternaryAnum(memory, basis, "01");
  const directTarget = materializeQuaternaryAnumTarget(memory, basis, direct);
  same(memory.find(basis.U, basis.L), directTarget, "01 cuts to semantic B01");

  const isolated = new Memory();
  const isolatedBasis = ensureRootBasis(isolated);
  const nested = materializeQuaternaryAnum(isolated, isolatedBasis, "[01]");
  const inner01 = firstChild(nested).anumLink;
  const beforeNested = isolated.linkCount;
  same(
    materializeQuaternaryAnumTarget(isolated, isolatedBasis, nested),
    inner01,
    "[01] cuts one leading R and returns Anum(01)",
  );
  same(
    isolated.find(isolatedBasis.U, isolatedBasis.L),
    undefined,
    "[01] does not recursively dereference to B01",
  );
  same(isolated.linkCount, beforeNested, "[01] requires no deeper target write");

  const deeperMemory = new Memory();
  const deeperBasis = ensureRootBasis(deeperMemory);
  const doubleNested = materializeQuaternaryAnum(
    deeperMemory,
    deeperBasis,
    "[[01]]",
  );
  const innerBracket01 = firstChild(doubleNested).anumLink;
  same(
    materializeQuaternaryAnumTarget(deeperMemory, deeperBasis, doubleNested),
    innerBracket01,
    "[[01]] preserves the remaining Anum indirection after one cut",
  );
  same(
    deeperMemory.find(deeperBasis.U, deeperBasis.L),
    undefined,
    "[[01]] still does not recursively materialize B01",
  );
}

// ---------------------------------------------------------------------------
// P4. Invalid exact evidence fails closed before target writes.
// ---------------------------------------------------------------------------

{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const exact = materializeQuaternaryAnum(memory, basis, "01[10]");
  const forged: QuaternaryAnumHierarchy = Object.freeze({
    anumLink: basis.R,
    items: exact.items,
  });

  same(memory.find(basis.U, basis.L), undefined, "forged case starts without B01");
  same(memory.find(basis.L, basis.U), undefined, "forged case starts without B10");

  const before = memory.linkCount;
  let rejected = false;
  try {
    materializeQuaternaryAnumTarget(memory, basis, forged);
  } catch (error) {
    assert(error instanceof QuaternaryAnumError, "forged exact evidence uses protocol error");
    same(error.code, "invalid-anum-representation", "forged exact evidence rejected");
    rejected = true;
  }
  assert(rejected, "forged exact evidence must fail closed");
  same(memory.linkCount, before, "failed authorization leaves zero target writes");
  same(memory.find(basis.U, basis.L), undefined, "failed write leaves B01 absent");
  same(memory.find(basis.L, basis.U), undefined, "failed write leaves B10 absent");
}

console.log(
  "MTS v0.13/v0.12 Anum protocol parity: UNINTERPRETABLE/NOT_FOUND/FOUND, read-only Resolve, exact-vs-target materialization, one-root-cut and fail-closed target writes: GREEN.",
);
