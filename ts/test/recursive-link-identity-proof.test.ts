import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  MemoryError,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  RecursiveLinkIdentityProofReplayError,
  replayRecursiveLinkIdentityProofAset,
} from "../src/recursive-link-identity-proof.js";

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

function expectReplayError(
  memory: ReadMemory,
  proofRoot: LinkHandle,
  expectedCode: string,
  label: string,
): void {
  const before = memory.linkCount;
  try {
    replayRecursiveLinkIdentityProofAset(memory, proofRoot);
  } catch (error) {
    assert(error instanceof RecursiveLinkIdentityProofReplayError, `${label}: stable replay error`);
    same(error.code, expectedCode, `${label}: error code`);
    same(memory.linkCount, before, `${label}: failure remains read-only`);
    return;
  }
  throw new Error(`${label}: expected replay rejection`);
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

// Generic finite grounded controls use the same four topology cases without
// knowing R/O/C/L as proof-step tags.
const start = memory.ensureStartSelfClosed(L);
const end = memory.ensureEndSelfClosed(L);
const startProof = identityProof(memory, start, start, [lProof]);
const endProof = identityProof(memory, end, end, [lProof]);
const pair = memory.ensure(start, end);
const pairProof = identityProof(memory, pair, pair, [startProof, endProof]);

replayRecursiveLinkIdentityProofAset(memory, rootProof);
replayRecursiveLinkIdentityProofAset(memory, oProof);
replayRecursiveLinkIdentityProofAset(memory, cProof);
replayRecursiveLinkIdentityProofAset(memory, startProof);
replayRecursiveLinkIdentityProofAset(memory, endProof);
replayRecursiveLinkIdentityProofAset(memory, pairProof);

// Exact child arity and order are part of the explicit proof Anet.
expectReplayError(
  memory,
  identityProof(memory, pair, pair, [endProof]),
  "child-arity-mismatch",
  "ordinary pair missing child",
);
expectReplayError(
  memory,
  identityProof(memory, pair, pair, [startProof, endProof, rootProof]),
  "child-arity-mismatch",
  "ordinary pair extra child",
);
expectReplayError(
  memory,
  identityProof(memory, pair, pair, [endProof, startProof]),
  "child-claim-mismatch",
  "ordinary pair reversed children",
);
expectReplayError(
  memory,
  identityProof(memory, pair, pair, [lProof, endProof]),
  "child-claim-mismatch",
  "ordinary pair wrong start claim",
);

expectReplayError(
  memory,
  identityProof(memory, start, start, []),
  "child-arity-mismatch",
  "start-selfclosed missing external-pole proof",
);
expectReplayError(
  memory,
  identityProof(memory, end, end, []),
  "child-arity-mismatch",
  "end-selfclosed missing external-pole proof",
);

// A fully selfclosed proof is accepted only as the already-derived canonical
// ROOT base; a non-root occurrence cannot manufacture another primitive base.
expectReplayError(
  memory,
  identityProof(memory, R, R, [rootProof]),
  "invalid-root-base",
  "root proof with child",
);

// Different selfclosure orientations are not an identity derivation.
expectReplayError(
  memory,
  identityProof(memory, start, end, [lProof]),
  "closure-shape-mismatch",
  "mixed closure orientation",
);

// A cached valid occurrence must still match the exact expected child pair in
// every slot before cache reuse is allowed.
expectReplayError(
  memory,
  identityProof(memory, pair, pair, [startProof, startProof]),
  "child-claim-mismatch",
  "cached occurrence reused in wrong slot",
);

// Child sequence is explicit MTS ExactSequence topology; arbitrary Links cannot
// be interpreted as a sequence by host convention.
const malformedClaim = memory.ensure(pair, pair);
const malformedSequenceProof = memory.ensure(malformedClaim, L);
expectReplayError(
  memory,
  malformedSequenceProof,
  "invalid-child-sequence",
  "malformed child sequence",
);

// Foreign runtime coordinates carry no authority.
const foreignMemory = new Memory();
expectReplayError(
  memory,
  foreignMemory.root,
  "invalid-proof-occurrence",
  "foreign proof handle",
);

// Rootless mutual grounding must reject by semantic obligation pair even when
// each traversal step uses a distinct proof-occurrence handle. This is the
// executable F2 boundary: a cycle with no finite path to ROOT is UNDERGROUNDED.
class SyntheticReadMemory implements ReadMemory {
  constructor(
    readonly root: LinkHandle,
    private readonly cells: ReadonlyMap<LinkHandle, LinkPoles>,
  ) {}

  get linkCount(): number { return this.cells.size; }

  poles(link: LinkHandle): LinkPoles {
    const value = this.cells.get(link);
    if (value === undefined) throw new MemoryError("synthetic unknown Link");
    return value;
  }

  find(): LinkHandle | undefined { return undefined; }
  outgoing(): readonly LinkHandle[] { return []; }
  incoming(): readonly LinkHandle[] { return []; }
}

const h = (): LinkHandle => Object.freeze({}) as unknown as LinkHandle;
const sr = h();
const a = h();
const b = h();
const claimAA = h();
const claimBB = h();
const p = h();
const q = h();
const seqQ = h();
const payloadQ = h();
const seqP = h();
const payloadP = h();

const cyclicMemory = new SyntheticReadMemory(sr, new Map<LinkHandle, LinkPoles>([
  [sr, Object.freeze({ start: sr, end: sr })],
  [a, Object.freeze({ start: a, end: b })],
  [b, Object.freeze({ start: b, end: a })],
  [claimAA, Object.freeze({ start: a, end: a })],
  [claimBB, Object.freeze({ start: b, end: b })],
  [payloadQ, Object.freeze({ start: sr, end: q })],
  [seqQ, Object.freeze({ start: seqQ, end: payloadQ })],
  [payloadP, Object.freeze({ start: sr, end: p })],
  [seqP, Object.freeze({ start: seqP, end: payloadP })],
  [p, Object.freeze({ start: claimAA, end: seqQ })],
  [q, Object.freeze({ start: claimBB, end: seqP })],
]));

expectReplayError(
  cyclicMemory,
  p,
  "cyclic-grounding",
  "rootless mutual grounding cycle with distinct proof occurrences",
);
