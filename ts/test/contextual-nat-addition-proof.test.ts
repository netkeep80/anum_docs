import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/public.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

const memory = new Memory();
const { R, L, U } = ensureRootBasis(memory);
let cursor = U;
const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));

// Historical #884 arithmetic claims use an ExactSequence carrier.
const addTag = fresh();
const oldAddClaim = materializeExactSequence(memory, [addTag, L, U, L]);

// #1010-D requires the arithmetic relation itself to be ordinary contextual Links.
const relationKind = fresh();
const binaryKind = fresh();
const plusName = fresh();
const binaryRelationContext = memory.ensure(relationKind, binaryKind);
const plusContext = memory.ensure(binaryRelationContext, plusName);
const contextualAddClaim = memory.ensure(memory.ensure(memory.ensure(plusContext, L), U), L);

// RED control: the historical sequence carrier cannot simply be reused as if it
// were already the new relation-native claim. This assertion must fail before
// the fixture is rewritten to define/replay rules over contextualAddClaim.
same(
  oldAddClaim,
  contextualAddClaim,
  "RED: historical ExactSequence Add claim is not the contextual Link relation claim",
);
