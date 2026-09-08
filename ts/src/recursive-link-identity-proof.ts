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
  | "cyclic-grounding"
  | "replay-wrote";

export class RecursiveLinkIdentityProofReplayError extends Error {
  override readonly name = "RecursiveLinkIdentityProofReplayError";

  constructor(readonly code: RecursiveLinkIdentityProofReplayErrorCode) {
    super(code);
  }
}

export interface ValidatedProofOccurrenceClaim {
  readonly occurrence: LinkHandle;
  readonly claim: LinkHandle;
}

export interface RecursiveLinkIdentityProofClosureReplayResult {
  readonly proofRoot: LinkHandle;
  readonly left: LinkHandle;
  readonly right: LinkHandle;
  readonly validatedOccurrences: readonly ValidatedProofOccurrenceClaim[];
}

export interface RecursiveLinkIdentityProofReplayResult {
  readonly proofRoot: LinkHandle;
  readonly left: LinkHandle;
  readonly right: LinkHandle;
  readonly verifiedOccurrenceCount: number;
}

type ClosureShape = "full" | "start" | "end" | "ordinary";

interface ReadOccurrence {
  readonly claim: LinkHandle;
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
      claim,
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

export function replayRecursiveLinkIdentityProofClosure(
  memory: ReadMemory,
  proofRoot: LinkHandle,
): RecursiveLinkIdentityProofClosureReplayResult {
  const before = memory.linkCount;
  const verified = new Map<LinkHandle, LinkHandle>();
  const activePairs = new Map<LinkHandle, Set<LinkHandle>>();

  const enterPair = (left: LinkHandle, right: LinkHandle): void => {
    let rights = activePairs.get(left);
    if (rights === undefined) {
      rights = new Set<LinkHandle>();
      activePairs.set(left, rights);
    }
    if (rights.has(right)) fail("cyclic-grounding");
    rights.add(right);
  };

  const leavePair = (left: LinkHandle, right: LinkHandle): void => {
    const rights = activePairs.get(left);
    rights?.delete(right);
    if (rights?.size === 0) activePairs.delete(left);
  };

  try {
    const verify = (occurrence: LinkHandle): ReadOccurrence => {
      const data = readOccurrence(memory, occurrence);
      if (verified.has(occurrence)) return data;

      enterPair(data.left, data.right);
      try {
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

        verified.set(occurrence, data.claim);
        return data;
      } finally {
        leavePair(data.left, data.right);
      }
    };

    const root = verify(proofRoot);
    return Object.freeze({
      proofRoot,
      left: root.left,
      right: root.right,
      validatedOccurrences: Object.freeze(
        [...verified].map(([occurrence, claim]) => Object.freeze({ occurrence, claim })),
      ),
    });
  } finally {
    if (memory.linkCount !== before) fail("replay-wrote");
  }
}

export function replayRecursiveLinkIdentityProofAset(
  memory: ReadMemory,
  proofRoot: LinkHandle,
): RecursiveLinkIdentityProofReplayResult {
  const replay = replayRecursiveLinkIdentityProofClosure(memory, proofRoot);
  return Object.freeze({
    proofRoot: replay.proofRoot,
    left: replay.left,
    right: replay.right,
    verifiedOccurrenceCount: replay.validatedOccurrences.length,
  });
}
