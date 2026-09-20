import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  QuaternarySerializationError,
  serializeQuaternaryLink,
} from "../src/quaternary-serialization.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 relative form transport gap: ${message}`);
}

function expectNotSerializable(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof QuaternarySerializationError,
      `${message}: expected QuaternarySerializationError, got ${String(error)}`,
    );
    assert(
      error.code === "not-serializable",
      `${message}: expected not-serializable, got ${error.code}`,
    );
    return;
  }
  throw new Error(
    `v0.13 relative form transport gap: ${message}: unexpectedly serializable`,
  );
}

interface RelativeQuartet {
  readonly startForm: LinkHandle;
  readonly endForm: LinkHandle;
  readonly directForm: LinkHandle;
  readonly inverseForm: LinkHandle;
}

function quartet(memory: Memory, whole: LinkHandle): RelativeQuartet {
  const startForm = memory.ensureStartSelfClosed(whole);
  const endForm = memory.ensureEndSelfClosed(whole);
  return Object.freeze({
    startForm,
    endForm,
    directForm: memory.ensure(startForm, endForm),
    inverseForm: memory.ensure(endForm, startForm),
  });
}

const memory = new Memory();
const basis = ensureRootBasis(memory);

// Sanity: the accepted flat-Q serializer still transports its proven value
// domain. This test is about the new relative forms, not a regression in Q.
assert(
  serializeQuaternaryLink(memory, basis, basis.L) === "1",
  "baseline L serializes as 1",
);
assert(
  serializeQuaternaryLink(memory, basis, basis.U) === "0",
  "baseline U serializes as 0",
);

// Build the relative four-form topology around L rather than R.
const q = quartet(memory, basis.L);

assert(q.startForm !== basis.O, "START_FORM(L) is not root O");
assert(q.endForm !== basis.C, "END_FORM(L) is not root C");
assert(q.directForm !== basis.L, "DIRECT_FORM(L) is not root L");
assert(q.inverseForm !== basis.U, "INVERSE_FORM(L) is not root U");

// Existing v0.12 flat-Q transport cannot serialize any of these exact forms.
// START_FORM(L) demonstrates the key obstruction: P=P->L recurs on itself;
// the other forms contain non-L/U values where flat-Q requires a value bit.
expectNotSerializable(
  () => serializeQuaternaryLink(memory, basis, q.startForm),
  "START_FORM(L)",
);
expectNotSerializable(
  () => serializeQuaternaryLink(memory, basis, q.endForm),
  "END_FORM(L)",
);
expectNotSerializable(
  () => serializeQuaternaryLink(memory, basis, q.directForm),
  "DIRECT_FORM(L)",
);
expectNotSerializable(
  () => serializeQuaternaryLink(memory, basis, q.inverseForm),
  "INVERSE_FORM(L)",
);

// The semantic/value inverse of L is still U and remains serializable. This
// distinguishes the transport gap for form-level relative topology from
// ordinary value-level inversion.
const valueInverseL = memory.ensure(
  memory.poles(basis.L).end,
  memory.poles(basis.L).start,
);
assert(valueInverseL === basis.U, "value-level -L is U");
assert(
  serializeQuaternaryLink(memory, basis, valueInverseL) === "0",
  "value-level -L remains serializable as 0",
);

console.log(
  "MTS v0.13 relative form transport gap: accepted flat-Q rejects P/Q/D/I.",
);
