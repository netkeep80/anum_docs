import { ExactSequenceError, readExactSequence } from "./exact-sequence.js";
import { MemoryError, type LinkHandle, type ReadMemory } from "./memory.js";

export type RecursiveLinkIdentityProofReplayErrorCode =
  | "invalid-proof-occurrence"
  | "invalid-claim"
  | "invalid-child-sequence"
  | "closure-shape-mismatch"
  | "child-arity-mismatch"
  | "child-claim-mismatch"
  | "invalid-root-base"
  | "replay-wrote";

export class RecursiveLinkIdentityProofReplayError extends Error {
  override readonly name = "RecursiveLinkIdentityProofReplayError";

  constructor(readonly code: RecursiveLinkIdentityProofReplayErrorCode) {
    super(code);
  }
}

export interface RecursiveLinkIdentityProofReplayResult {
  readonly proofRoot: LinkHandle;
  readonly left: LinkHandle;
  readonly right: LinkHandle;
  readonly verifiedOccurrenceCount: number;
}

type ClosureShape = "full" | "start" | "end" | "ordinary";

interface ReadOccurrence {
  readonly left: LinkHandle;
  readonly right: LinkHandle;
  readonly children: readonly LinkHandle[];
}

function fail(code: RecursiveLinkIdentityProofReplayErrorCode): never {
  throw new RecursiveLinkIdentityProofReplayError(code);
}

function readOccurrence(memory: ReadMemory, occurrence: LinkHandle): ReadOccurrence {
  let claim: LinkHandle;
  let childSequence: LinkHandle;
  try {
    const occurrencePoles = memory.poles(occurrence);
    claim = occurrencePoles.start;
    childSequence = occurrencePoles.end;
  } catch (error) {
    if (error instanceof MemoryError) fail("invalid-proof-occurrence");
    throw error;
  }

  let left: LinkHandle;
  let right: LinkHandle;
  try {
    const claimPoles = memory.poles(claim);
    left = claimPoles.start;
    right = claimPoles.end;
  } catch (error) {
    if (error instanceof MemoryError) fail("invalid-claim");
    throw error;
  }

  try {
    return Object.freeze({
      left,
      right,
      children: readExactSequence(memory, childSequence).values,
    });
  } catch (error) {
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
      fail("invalid-child-sequence");
    }
    throw error;
  }
}

function classify(memory: ReadMemory, link: LinkHandle): {
  readonly shape: ClosureShape;
  readonly start: LinkHandle;
  readonly end: LinkHandle;
} {
  try {
    const { start, end } = memory.poles(link);
    const startClosed = start === link;
    const endClosed = end === link;
    const shape: ClosureShape = startClosed
      ? (endClosed ? "full" : "start")
      : (endClosed ? "end" : "ordinary");
    return Object.freeze({ shape, start, end });
  } catch (error) {
    if (error instanceof MemoryError) fail("invalid-claim");
    throw error;
  }
}

export function replayRecursiveLinkIdentityProofAset(
  memory: ReadMemory,
  proofRoot: LinkHandle,
): RecursiveLinkIdentityProofReplayResult {
  const before = memory.linkCount;
  const verified = new Set<LinkHandle>();

  try {
    const verify = (occurrence: LinkHandle): ReadOccurrence => {
      const data = readOccurrence(memory, occurrence);
      if (verified.has(occurrence)) return data;

      const left = classify(memory, data.left);
      const right = classify(memory, data.right);
      if (left.shape !== right.shape) fail("closure-shape-mismatch");

      let expected: readonly (readonly [LinkHandle, LinkHandle])[];
      switch (left.shape) {
        case "full":
          if (
            data.left !== memory.root
            || data.right !== memory.root
            || occurrence !== memory.root
          ) {
            fail("invalid-root-base");
          }
          expected = [];
          break;
        case "start":
          expected = [[left.end, right.end]];
          break;
        case "end":
          expected = [[left.start, right.start]];
          break;
        case "ordinary":
          expected = [
            [left.start, right.start],
            [left.end, right.end],
          ];
          break;
      }

      if (data.children.length !== expected.length) fail("child-arity-mismatch");

      data.children.forEach((child, index) => {
        const required = expected[index];
        if (required === undefined) fail("child-arity-mismatch");
        const childData = readOccurrence(memory, child);
        if (childData.left !== required[0] || childData.right !== required[1]) {
          fail("child-claim-mismatch");
        }
        verify(child);
      });

      verified.add(occurrence);
      return data;
    };

    const root = verify(proofRoot);
    return Object.freeze({
      proofRoot,
      left: root.left,
      right: root.right,
      verifiedOccurrenceCount: verified.size,
    });
  } finally {
    if (memory.linkCount !== before) fail("replay-wrote");
  }
}
