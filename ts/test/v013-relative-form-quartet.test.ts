import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 relative form quartet: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

interface Quartet {
  readonly basis: RootBasis;
  readonly whole: LinkHandle;
  readonly startForm: LinkHandle;
  readonly endForm: LinkHandle;
  readonly directForm: LinkHandle;
  readonly inverseForm: LinkHandle;
  readonly valueInverse: LinkHandle;
}

function buildQuartet(memory: Memory, whole: LinkHandle): Quartet {
  const basis = ensureRootBasis(memory);
  const startForm = memory.ensureStartSelfClosed(whole);
  const endForm = memory.ensureEndSelfClosed(whole);
  const directForm = memory.ensure(startForm, endForm);
  const inverseForm = memory.ensure(endForm, startForm);
  const poles = memory.poles(whole);
  const valueInverse = memory.ensure(poles.end, poles.start);

  return Object.freeze({
    basis,
    whole,
    startForm,
    endForm,
    directForm,
    inverseForm,
    valueInverse,
  });
}

// Root projection recovers the familiar O/C/L/U topology.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const root = buildQuartet(memory, basis.R);

  same(root.startForm, basis.O, "START_FORM(R)=O");
  same(root.endForm, basis.C, "END_FORM(R)=C");
  same(root.directForm, basis.L, "DIRECT_FORM(R)=L");
  same(root.inverseForm, basis.U, "INVERSE_FORM(R)=U");
  same(root.valueInverse, basis.R, "value-level -R=R");
  assert(
    root.inverseForm !== root.valueInverse,
    "form-level U must remain distinct from value-level -R",
  );
}

// Apply exactly the same four-form recipe to L. Relative forms must be new
// Links around L rather than collapsing back to the root basis.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const q = buildQuartet(memory, basis.L);

  const pPoles = memory.poles(q.startForm);
  const qPoles = memory.poles(q.endForm);
  const dPoles = memory.poles(q.directForm);
  const iPoles = memory.poles(q.inverseForm);

  same(pPoles.start, q.startForm, "P starts from itself");
  same(pPoles.end, basis.L, "P ends at L");

  same(qPoles.start, basis.L, "Q starts at L");
  same(qPoles.end, q.endForm, "Q ends at itself");

  same(dPoles.start, q.startForm, "D starts at START_FORM(L)");
  same(dPoles.end, q.endForm, "D ends at END_FORM(L)");

  same(iPoles.start, q.endForm, "I starts at END_FORM(L)");
  same(iPoles.end, q.startForm, "I ends at START_FORM(L)");

  assert(q.startForm !== basis.O, "START_FORM(L) is not root O");
  assert(q.endForm !== basis.C, "END_FORM(L) is not root C");
  assert(q.directForm !== basis.L, "DIRECT_FORM(L) is not root L");
  assert(q.inverseForm !== basis.U, "INVERSE_FORM(L) is not root U");

  // Value-level inversion of L still swaps L's own poles O/C.
  same(q.valueInverse, basis.U, "value-level -L = U");

  // Form-level inversion is instead the new Q->P relation around L.
  assert(
    q.inverseForm !== q.valueInverse,
    "INVERSE_FORM(L) must differ from value-level -L",
  );

  same(
    memory.ensure(
      memory.poles(q.directForm).end,
      memory.poles(q.directForm).start,
    ),
    q.inverseForm,
    "form inversion swaps D poles",
  );
  same(
    memory.ensure(
      memory.poles(q.inverseForm).end,
      memory.poles(q.inverseForm).start,
    ),
    q.directForm,
    "form inversion is involutive",
  );
}

// The recipe is structural and reproduces in an independent Memory without
// shared handles or occurrence ids.
{
  const leftMemory = new Memory();
  const rightMemory = new Memory();
  const leftBasis = ensureRootBasis(leftMemory);
  const rightBasis = ensureRootBasis(rightMemory);

  const left = buildQuartet(leftMemory, leftBasis.L);
  const right = buildQuartet(rightMemory, rightBasis.L);

  const leftStart = leftMemory.poles(left.startForm);
  const rightStart = rightMemory.poles(right.startForm);
  same(leftStart.start, left.startForm, "left START self-incidence");
  same(rightStart.start, right.startForm, "right START self-incidence");
  same(leftStart.end, leftBasis.L, "left START operand");
  same(rightStart.end, rightBasis.L, "right START operand");

  const leftEnd = leftMemory.poles(left.endForm);
  const rightEnd = rightMemory.poles(right.endForm);
  same(leftEnd.start, leftBasis.L, "left END operand");
  same(rightEnd.start, rightBasis.L, "right END operand");
  same(leftEnd.end, left.endForm, "left END self-incidence");
  same(rightEnd.end, right.endForm, "right END self-incidence");

  same(
    leftMemory.poles(left.directForm).start,
    left.startForm,
    "left direct orientation start",
  );
  same(
    rightMemory.poles(right.directForm).start,
    right.startForm,
    "right direct orientation start",
  );
  same(
    leftMemory.poles(left.inverseForm).start,
    left.endForm,
    "left inverse orientation start",
  );
  same(
    rightMemory.poles(right.inverseForm).start,
    right.endForm,
    "right inverse orientation start",
  );

  same(left.valueInverse, leftBasis.U, "left -L=U");
  same(right.valueInverse, rightBasis.U, "right -L=U");
}

console.log("MTS v0.13 relative four-form quartet beyond root: GREEN.");
