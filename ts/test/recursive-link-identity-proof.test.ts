import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { replayRecursiveLinkIdentityProofAset } from "../src/recursive-link-identity-proof.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function identityProof(
  memory: Memory,
  left: LinkHandle,
  right: LinkHandle,
  children: readonly LinkHandle[],
): LinkHandle {
  const claim = memory.ensure(left, right);
  const childSequence = materializeExactSequence(memory, children);
  return memory.ensure(claim, childSequence);
}

const memory = new Memory();
const { R, O, C, L } = ensureRootBasis(memory);

const rootProof = identityProof(memory, R, R, []);
const oProof = identityProof(memory, O, O, [rootProof]);
const cProof = identityProof(memory, C, C, [rootProof]);
const lProof = identityProof(memory, L, L, [oProof, cProof]);

same(rootProof, R, "root identity proof collapses to the canonical root");

const before = memory.linkCount;
const result = replayRecursiveLinkIdentityProofAset(memory, lProof);

same(result.left, L, "replay reports exact left claim");
same(result.right, L, "replay reports exact right claim");
same(result.proofRoot, lProof, "replay reports exact proof root");
same(result.verifiedOccurrenceCount, 4, "L/L proof reuses the one root proof occurrence");
same(memory.linkCount, before, "replay is read-only");
