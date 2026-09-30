import {
  materializeV013SemanticLinkFromHierarchicalCarrier,
} from "../src/public.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  V013HierarchicalCarrierError,
  materializeV013HierarchicalCarrier,
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function sameBytes(
  actual: readonly number[] | Uint8Array,
  expected: readonly number[] | Uint8Array,
  message: string,
): void {
  assert(actual.length === expected.length, `${message}: byte length differs`);
  for (let index = 0; index < actual.length; index += 1) {
    same(actual[index], expected[index], `${message}: byte ${index}`);
  }
}

function expectCarrierError(
  code: V013HierarchicalCarrierError["code"],
  effect: () => unknown,
  message: string,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof V013HierarchicalCarrierError, `${message}: wrong error type`);
    same(error.code, code, `${message}: wrong error code`);
    return;
  }
  throw new Error(`${message}: expected ${code}`);
}

function wireForSemantic(
  memory: Memory,
  basis: RootBasis,
  semantic: LinkHandle,
): Uint8Array {
  return serializeV013HierarchicalCarrier(
    memory,
    basis,
    materializeV013HierarchicalCarrierFromSemanticLink(memory, basis, semantic),
  );
}

function main(): void {
  const sender = new Memory();
  const basisA = ensureRootBasis(sender);

  const nestedStart = sender.ensureStartSelfClosed(sender.ensure(basisA.C, basisA.L));
  const nestedEnd = sender.ensureEndSelfClosed(sender.ensure(basisA.O, basisA.U));
  const nestedPair = sender.ensure(nestedStart, nestedEnd);
  const shared = sender.ensure(basisA.L, basisA.U);
  const sharedDag = sender.ensure(shared, shared);

  const sourceCases = [
    basisA.R,
    basisA.O,
    basisA.C,
    basisA.L,
    basisA.U,
    nestedStart,
    nestedEnd,
    nestedPair,
    sharedDag,
  ] as const;

  const receiver = new Memory();
  const basisB = ensureRootBasis(receiver);

  // Fresh allocation history must not enter semantic identity.
  let noise = receiver.ensure(basisB.U, basisB.L);
  noise = receiver.ensureStartSelfClosed(noise);
  receiver.ensure(noise, basisB.C);

  for (const source of sourceCases) {
    const wire = wireForSemantic(sender, basisA, source);
    const carrierB = materializeV013HierarchicalCarrier(receiver, basisB, wire);

    const rebuilt = materializeV013SemanticLinkFromHierarchicalCarrier(
      receiver,
      basisB,
      carrierB,
    );
    const rebuiltAgain = materializeV013SemanticLinkFromHierarchicalCarrier(
      receiver,
      basisB,
      carrierB,
    );

    same(rebuiltAgain, rebuilt, "semantic inverse is locally idempotent");
    sameBytes(
      wireForSemantic(receiver, basisB, rebuilt),
      wire,
      "semantic inverse preserves exact recursive wire",
    );

    if (source !== basisA.R) {
      assert(source !== rebuilt, "semantic handles remain Memory-local");
    }
  }

  const sharedWire = wireForSemantic(sender, basisA, sharedDag);
  const sharedCarrierB = materializeV013HierarchicalCarrier(receiver, basisB, sharedWire);
  const rebuiltShared = materializeV013SemanticLinkFromHierarchicalCarrier(
    receiver,
    basisB,
    sharedCarrierB,
  );
  const sharedPoles = receiver.poles(rebuiltShared);
  same(sharedPoles.start, sharedPoles.end, "shared DAG converges to one local child identity");

  // Build a malformed quoted tree whose left branch is valid and whose right
  // branch is invalid. Reconstruction must validate the complete carrier before
  // creating any semantic Links.
  const namespace = receiver.ensure(basisB.L, basisB.L);
  const quote = (value: LinkHandle): LinkHandle => receiver.ensure(namespace, value);
  const validChild = materializeV013HierarchicalCarrier(
    receiver,
    basisB,
    Uint8Array.from([0x39, 0x38]), // START(ROOT)
  );
  const malformedChild = materializeExactSequence(
    receiver,
    [quote(basisB.U)],
  );
  const malformedParent = materializeExactSequence(
    receiver,
    [quote(basisB.L), quote(validChild), quote(malformedChild)],
  );

  const beforeMalformed = receiver.linkCount;
  expectCarrierError(
    "invalid-carrier",
    () => materializeV013SemanticLinkFromHierarchicalCarrier(
      receiver,
      basisB,
      malformedParent,
    ),
    "malformed carrier semantic inverse",
  );
  same(
    receiver.linkCount,
    beforeMalformed,
    "malformed carrier rejects before semantic writes",
  );

  const forgedBasis = Object.freeze({ ...basisB, L: basisB.U });
  const validCarrier = materializeV013HierarchicalCarrier(
    receiver,
    basisB,
    Uint8Array.from([0x31, 0x39, 0x38, 0x36, 0x38]), // PAIR(START(R), END(R))
  );
  const beforeBadBasis = receiver.linkCount;
  expectCarrierError(
    "invalid-basis",
    () => materializeV013SemanticLinkFromHierarchicalCarrier(
      receiver,
      forgedBasis,
      validCarrier,
    ),
    "forged RootBasis semantic inverse",
  );
  same(receiver.linkCount, beforeBadBasis, "invalid basis writes nothing");

  console.log("RECURSIVE_CARRIER_SEMANTIC_INVERSE = SUPPORTED");
  console.log("SEMANTIC_INVERSE_TWO_PHASE_VALIDATION = SUPPORTED");
  console.log("SEMANTIC_INVERSE_TWO_MEMORY_ROUNDTRIP = SUPPORTED");
  console.log("SEMANTIC_INVERSE_SHARED_DAG = SUPPORTED");
  console.log("SEMANTIC_INVERSE_PACKAGE_ROOT = SUPPORTED");
  console.log("GENERAL_DISTINCT_NODE_CYCLES = OUT_OF_SCOPE");
  console.log("accepted semantic delta = NONE");
}

main();
