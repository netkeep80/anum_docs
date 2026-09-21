// mts-version-evidence: required-from=0.12

import {
  Memory,
  MemoryError,
  ensureRootBasis,
  verifyRootBasis,
  type RootBasis,
} from "../src/memory.js";
import * as publicApi from "../src/public.js";
import {
  V012StringAnumError,
  readV012StringAnum,
} from "../src/v012-string-anum.js";
import {
  SourceError,
} from "../src/source.js";
import {
  readV012SourceContent,
} from "../src/v012-source.js";
import {
  QuaternaryAnumError,
  materializeQuaternaryAnum,
  materializeQuaternaryAnumTarget,
  resolveQuaternaryAnum,
  serializeMaterializedQuaternaryAnum,
} from "../src/quaternary-anum.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 Q root-basis boundary: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function expectInvalidBasis(effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof QuaternaryAnumError, `expected QuaternaryAnumError, got ${String(error)}`);
    same(error.code, "invalid-root-basis", "invalid root basis error code");
    return;
  }
  throw new Error("v0.12 Q root-basis boundary: expected invalid-root-basis");
}

function collapsedBasis(basis: RootBasis): RootBasis {
  return Object.freeze({
    R: basis.R,
    O: basis.R,
    C: basis.R,
    L: basis.R,
    U: basis.R,
  });
}

function forgedBasis(basis: RootBasis): RootBasis {
  // Same-memory handles, but the semantic equation L=O->C is replaced by U.
  // This is especially important because ordinary ownership checks cannot
  // distinguish this from a legitimate caller-supplied RootBasis object.
  return Object.freeze({
    ...basis,
    L: basis.U,
  });
}


// A fully collapsed basis satisfies the old pole equations mechanically because
// R=R->R. RootBasis verification must instead require the proper ostensive
// START/END forms themselves, not just their equations after collapse.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const collapsed = collapsedBasis(basis);

  let verifyRejected = false;
  try {
    verifyRootBasis(memory, collapsed);
  } catch (error) {
    assert(error instanceof MemoryError, `expected MemoryError, got ${String(error)}`);
    verifyRejected = true;
  }
  assert(verifyRejected, "collapsed RootBasis must fail direct verification");

  const before = memory.linkCount;
  expectInvalidBasis(() => publicApi.materializeQuaternaryAnum(memory, collapsed, "0"));
  expectInvalidBasis(() => publicApi.materializeQuaternaryAnum(memory, collapsed, "1"));
  same(memory.linkCount, before, "collapsed-basis public Q materialization writes nothing");
}

// Read-only v0.12 STRING/source consumers also receive RootBasis explicitly.
// Even the empty carrier R must not let an invalid basis bypass validation.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const collapsed = collapsedBasis(basis);

  let stringRejected = false;
  try {
    readV012StringAnum(memory, collapsed, basis.R);
  } catch (error) {
    assert(error instanceof V012StringAnumError, `expected V012StringAnumError, got ${String(error)}`);
    stringRejected = true;
  }
  assert(stringRejected, "STRING reader rejects collapsed RootBasis");

  let sourceRejected = false;
  try {
    readV012SourceContent(memory, collapsed, basis.R);
  } catch (error) {
    assert(error instanceof SourceError, `expected SourceError, got ${String(error)}`);
    sourceRejected = true;
  }
  assert(sourceRejected, "source reader rejects collapsed RootBasis");
}

// Happy path remains unchanged with the canonical declared basis.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const exact = materializeQuaternaryAnum(memory, basis, "01");
  same(serializeMaterializedQuaternaryAnum(memory, basis, exact), "01", "canonical basis wire");
}

// F08: materialization must validate the declared rooted basis BEFORE the first
// exact-Anum write. A same-memory forged basis must not silently reinterpret 1.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const forged = forgedBasis(basis);
  const before = memory.linkCount;

  expectInvalidBasis(() => materializeQuaternaryAnum(memory, forged, "1"));
  same(memory.linkCount, before, "forged-basis materialization writes nothing");
}

// Existing exact hierarchy must not become readable under a different same-memory
// basis merely because all handles are technically valid in this Memory.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const exact = materializeQuaternaryAnum(memory, basis, "01");
  const forged = forgedBasis(basis);

  const beforeSerialize = memory.linkCount;
  expectInvalidBasis(() => serializeMaterializedQuaternaryAnum(memory, forged, exact));
  same(memory.linkCount, beforeSerialize, "forged-basis serialization is read-only");

  const beforeResolve = memory.linkCount;
  expectInvalidBasis(() => resolveQuaternaryAnum(memory, forged, exact));
  same(memory.linkCount, beforeResolve, "forged-basis Resolve is read-only");

  const beforeTarget = memory.linkCount;
  expectInvalidBasis(() => materializeQuaternaryAnumTarget(memory, forged, exact));
  same(memory.linkCount, beforeTarget, "forged-basis target materialization writes nothing");
}

// A basis from another Memory is not portable authority. It must be normalized
// to the receiving Memory's own rooted basis rather than reused by handle.
{
  const memory = new Memory();
  const localBasis = ensureRootBasis(memory);
  const exact = materializeQuaternaryAnum(memory, localBasis, "[01]");

  const foreignMemory = new Memory();
  const foreignBasis = ensureRootBasis(foreignMemory);

  const before = memory.linkCount;
  expectInvalidBasis(() => serializeMaterializedQuaternaryAnum(memory, foreignBasis, exact));
  expectInvalidBasis(() => resolveQuaternaryAnum(memory, foreignBasis, exact));
  expectInvalidBasis(() => materializeQuaternaryAnumTarget(memory, foreignBasis, exact));
  expectInvalidBasis(() => materializeQuaternaryAnum(memory, foreignBasis, "01"));
  same(memory.linkCount, before, "foreign basis causes no local writes");
}

console.log("MTS v0.12 Q root-basis verification boundary: GREEN.");
