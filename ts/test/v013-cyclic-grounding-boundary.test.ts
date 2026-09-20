import {
  MemoryError,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  RecursiveLinkIdentityProofReplayError,
  replayRecursiveLinkIdentityProofAset,
} from "../src/recursive-link-identity-proof.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 cyclic grounding boundary: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

class SyntheticReadMemory implements ReadMemory {
  constructor(
    readonly root: LinkHandle,
    private readonly cells: ReadonlyMap<LinkHandle, LinkPoles>,
  ) {}

  get linkCount(): number {
    return this.cells.size;
  }

  poles(link: LinkHandle): LinkPoles {
    const value = this.cells.get(link);
    if (value === undefined) throw new MemoryError("synthetic unknown Link");
    return value;
  }

  find(): LinkHandle | undefined {
    return undefined;
  }

  outgoing(): readonly LinkHandle[] {
    return [];
  }

  incoming(): readonly LinkHandle[] {
    return [];
  }
}

class FixtureBuilder {
  readonly cells = new Map<LinkHandle, LinkPoles>();
  readonly root: LinkHandle;

  constructor() {
    this.root = this.reserve();
    this.bind(this.root, this.root, this.root);
  }

  reserve(): LinkHandle {
    return Object.freeze({}) as LinkHandle;
  }

  bind(link: LinkHandle, start: LinkHandle, end: LinkHandle): LinkHandle {
    assert(!this.cells.has(link), "fixture Link bound once");
    this.cells.set(link, Object.freeze({ start, end }));
    return link;
  }

  link(start: LinkHandle, end: LinkHandle): LinkHandle {
    return this.bind(this.reserve(), start, end);
  }

  startClosed(end: LinkHandle): LinkHandle {
    const link = this.reserve();
    return this.bind(link, link, end);
  }

  endClosed(start: LinkHandle): LinkHandle {
    const link = this.reserve();
    return this.bind(link, start, link);
  }

  exactSequence(values: readonly LinkHandle[]): LinkHandle {
    let current = this.root;
    for (const value of values) {
      const payload = this.link(current, value);
      current = this.startClosed(payload);
    }
    return current;
  }

  identityClaim(left: LinkHandle, right: LinkHandle): LinkHandle {
    return this.link(left, right);
  }

  proof(
    left: LinkHandle,
    right: LinkHandle,
    children: readonly LinkHandle[],
  ): LinkHandle {
    const claim = this.identityClaim(left, right);
    return this.link(claim, this.exactSequence(children));
  }
}

function expectGroundingCycle(
  memory: ReadMemory,
  proof: LinkHandle,
  message: string,
): void {
  const before = memory.linkCount;
  try {
    replayRecursiveLinkIdentityProofAset(memory, proof);
  } catch (error) {
    assert(
      error instanceof RecursiveLinkIdentityProofReplayError,
      `${message}: stable replay error`,
    );
    same(error.code, "cyclic-grounding", `${message}: exact error code`);
    same(memory.linkCount, before, `${message}: replay remains read-only`);
    return;
  }
  throw new Error(
    `v0.13 cyclic grounding boundary: ${message}: expected cyclic-grounding`,
  );
}

// ---------------------------------------------------------------------------
// Build a rooted basis fragment plus a genuine non-self mutual cycle:
//
//   R = R -> R
//   O = O -> R
//   C = R -> C
//
//   A = O -> B
//   B = A -> C
//
// The cycle has explicit rooted side branches through O/C, but proving the
// identity of A still requires B, and proving B still requires A.
// ---------------------------------------------------------------------------

const fixture = new FixtureBuilder();
const R = fixture.root;
const O = fixture.startClosed(R);
const C = fixture.endClosed(R);

const A = fixture.reserve();
const B = fixture.reserve();
fixture.bind(A, O, B);
fixture.bind(B, A, C);

// ROOT is its own canonical proof occurrence:
// occurrence poles = (claim=R, childSequence=R), claim poles = (R,R).
const rootProof = R;

const oProof = fixture.proof(O, O, [rootProof]);
const cProof = fixture.proof(C, C, [rootProof]);

// A/B proof occurrences must be reserved first because their child proof
// sequences refer to one another.
const aProof = fixture.reserve();
const bProof = fixture.reserve();

const claimAA = fixture.identityClaim(A, A);
const claimBB = fixture.identityClaim(B, B);

const aChildren = fixture.exactSequence([oProof, bProof]);
const bChildren = fixture.exactSequence([aProof, cProof]);

fixture.bind(aProof, claimAA, aChildren);
fixture.bind(bProof, claimBB, bChildren);

const memory = new SyntheticReadMemory(
  R,
  new Map<LinkHandle, LinkPoles>(fixture.cells),
);

// Rooted side obligations are independently and finitely grounded.
{
  const before = memory.linkCount;
  const root = replayRecursiveLinkIdentityProofAset(memory, rootProof);
  same(root.left, R, "ROOT proof left");
  same(root.right, R, "ROOT proof right");

  const open = replayRecursiveLinkIdentityProofAset(memory, oProof);
  same(open.left, O, "O proof left");
  same(open.right, O, "O proof right");

  const close = replayRecursiveLinkIdentityProofAset(memory, cProof);
  same(close.left, C, "C proof left");
  same(close.right, C, "C proof right");
  same(memory.linkCount, before, "finite grounded side proofs are read-only");
}

// Yet the mutual A<->B dependency returns to the same identity obligation
// before the proof can finish at ROOT.
expectGroundingCycle(
  memory,
  aProof,
  "root-anchored A=O->B / B=A->C mutual cycle",
);

// The same rejection is symmetric when B is selected as the proof root.
expectGroundingCycle(
  memory,
  bProof,
  "root-anchored B=A->C / A=O->B mutual cycle",
);

// ---------------------------------------------------------------------------
// Direct one-pole self-incidence is different. For:
//
//   S = S -> O
//
// START-shape identity replay does not recurse through the self pole. It needs
// only the external O=O obligation, which is finitely grounded at R.
// ---------------------------------------------------------------------------

const S = fixture.startClosed(O);
const sProof = fixture.proof(S, S, [oProof]);
const memoryWithSelfIncidence = new SyntheticReadMemory(
  R,
  new Map<LinkHandle, LinkPoles>(fixture.cells),
);

{
  const before = memoryWithSelfIncidence.linkCount;
  const replay = replayRecursiveLinkIdentityProofAset(
    memoryWithSelfIncidence,
    sProof,
  );
  same(replay.left, S, "direct START self-incidence left");
  same(replay.right, S, "direct START self-incidence right");
  same(
    memoryWithSelfIncidence.linkCount,
    before,
    "direct self-incidence proof is read-only",
  );
}

// This exactly matches the accepted finite-grounding distinction:
//
//   - full self-closure is valid only as ROOT;
//   - START/END self-incidence recurses only through its grounded external pole;
//   - an ordinary dependency cycle among distinct Links repeats an identity
//     obligation and therefore has no finite grounding proof.
console.log(
  "MTS v0.13 AC2 cyclic grounding boundary: rooted O/C side branches are finite, direct self-incidence is grounded, but genuine distinct A<->B recursion is rejected as cyclic-grounding: GREEN.",
);
