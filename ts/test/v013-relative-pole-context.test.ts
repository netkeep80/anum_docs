import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";
import { defineContext } from "../src/state.js";
import {
  RelativePoleContextError,
  materializeRelativePoleContext,
  readRelativePoleContext,
  replayRelativePoleReturn,
} from "../src/v013-relative-pole-context.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function reject(
  effect: () => unknown,
  expected: RelativePoleContextError["code"],
): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof RelativePoleContextError,
      `expected RelativePoleContextError, got ${String(error)}`,
    );
    same(error.code, expected, "relative-pole error code");
    return;
  }
  throw new Error("expected relative-pole rejection");
}

class PoleOnlyReplay implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined {
    throw new Error("relative-pole replay must not call find");
  }
  outgoing(): readonly LinkHandle[] {
    throw new Error("relative-pole replay must not scan outgoing");
  }
  incoming(): readonly LinkHandle[] {
    throw new Error("relative-pole replay must not scan incoming");
  }
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly parent: LinkHandle;
  readonly a: LinkHandle;
  readonly b: LinkHandle;
  readonly c: LinkHandle;
  readonly d: LinkHandle;
  readonly S: LinkHandle;
  readonly T: LinkHandle;
  readonly P: LinkHandle;
  readonly Q: LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const parent = defineContext(memory, basis.R, basis.L);

  const a = memory.ensureStartSelfClosed(basis.L);
  const b = memory.ensureEndSelfClosed(basis.L);
  const c = memory.ensureStartSelfClosed(basis.U);
  const d = memory.ensureEndSelfClosed(basis.U);

  assert(a !== b && a !== c && a !== d, "fixture poles must be distinct");
  assert(b !== c && b !== d && c !== d, "fixture poles must be pairwise distinct");

  const S = memory.ensure(a, b);
  const T = memory.ensure(a, c);
  const P = memory.ensure(b, d);
  const Q = memory.ensure(c, d);

  assert(S !== T, "branching fixture requires distinct wholes");
  assert(P !== Q, "shared-end fixture requires distinct wholes");

  return Object.freeze({ memory, basis, parent, a, b, c, d, S, T, P, Q });
}

// Branching: the same selected start Link keeps two distinct origins solely
// through ordinary Link contexts.
{
  const f = fixture();
  const fromS = materializeRelativePoleContext(
    f.memory, f.basis, f.parent, f.S, f.basis.O,
  );
  const fromT = materializeRelativePoleContext(
    f.memory, f.basis, f.parent, f.T, f.basis.O,
  );

  same(fromS.selected, f.a, "START(S) selects shared a");
  same(fromT.selected, f.a, "START(T) selects shared a");
  assert(fromS.context !== fromT.context, "different wholes require different position contexts");

  const before = f.memory.linkCount;
  const probe = new PoleOnlyReplay(f.memory);
  const backS = replayRelativePoleReturn(probe, f.basis, fromS.context, f.a);
  const backT = replayRelativePoleReturn(probe, f.basis, fromT.context, f.a);

  same(backS.whole, f.S, "K_S returns exactly S");
  same(backT.whole, f.T, "K_T returns exactly T");
  same(backS.parent, f.parent, "K_S returns to the explicit parent context");
  same(backT.parent, f.parent, "K_T returns to the explicit parent context");
  same(f.memory.linkCount, before, "contextual return replay is read-only");

  assert(backT.whole !== f.S, "substituted K_T must not justify S");

  reject(
    () => replayRelativePoleReturn(probe, f.basis, fromS.context, f.b),
    "selected-mismatch",
  );
}

// Symmetric shared end: same result Link, distinct origins.
{
  const f = fixture();
  const fromP = materializeRelativePoleContext(
    f.memory, f.basis, f.parent, f.P, f.basis.C,
  );
  const fromQ = materializeRelativePoleContext(
    f.memory, f.basis, f.parent, f.Q, f.basis.C,
  );

  same(fromP.selected, f.d, "END(P) selects shared d");
  same(fromQ.selected, f.d, "END(Q) selects shared d");
  assert(fromP.context !== fromQ.context, "shared END must preserve distinct origins");

  same(
    replayRelativePoleReturn(f.memory, f.basis, fromP.context, f.d).whole,
    f.P,
    "END context returns P",
  );
  same(
    replayRelativePoleReturn(f.memory, f.basis, fromQ.context, f.d).whole,
    f.Q,
    "END context returns Q",
  );
}

// ROOT: START and END select the same R, but the exact path remains distinct.
{
  const f = fixture();
  const startR = materializeRelativePoleContext(
    f.memory, f.basis, f.parent, f.basis.R, f.basis.O,
  );
  const endR = materializeRelativePoleContext(
    f.memory, f.basis, f.parent, f.basis.R, f.basis.C,
  );

  same(startR.selected, f.basis.R, "START(R)=R");
  same(endR.selected, f.basis.R, "END(R)=R");
  assert(startR.direction !== endR.direction, "ROOT START/END directions must differ");
  assert(startR.context !== endR.context, "ROOT START/END positions must remain distinguishable");

  same(
    replayRelativePoleReturn(f.memory, f.basis, startR.context, f.basis.R).whole,
    f.basis.R,
    "ROOT START context returns R",
  );
  same(
    replayRelativePoleReturn(f.memory, f.basis, endR.context, f.basis.R).whole,
    f.basis.R,
    "ROOT END context returns R",
  );
}

// Proper O: contextual RETURN is not ordinary end(start(O)).
{
  const f = fixture();
  const startO = materializeRelativePoleContext(
    f.memory, f.basis, f.parent, f.basis.O, f.basis.O,
  );
  const endO = materializeRelativePoleContext(
    f.memory, f.basis, f.parent, f.basis.O, f.basis.C,
  );

  same(startO.selected, f.basis.O, "START(O)=O");
  same(endO.selected, f.basis.R, "END(O)=R");
  same(f.memory.poles(startO.selected).end, f.basis.R, "ordinary end(START(O)) is R");
  same(
    replayRelativePoleReturn(f.memory, f.basis, startO.context, f.basis.O).whole,
    f.basis.O,
    "contextual return from START(O) restores O rather than reading end(O)",
  );
}

// Direction is structural evidence and must be exactly START(O) or END(C).
// Build the malformed witness in the same two-layer K_position topology.
{
  const f = fixture();
  const badFrame = f.memory.ensure(f.S, f.basis.L);
  const badEvidenceContext = defineContext(f.memory, f.parent, badFrame);
  const badContext = defineContext(f.memory, badEvidenceContext, f.a);
  reject(
    () => readRelativePoleContext(f.memory, f.basis, badContext),
    "invalid-direction",
  );
}

// The same structural recipe works in an independent Memory with unrelated
// handles. This is a context-topology portability witness, not yet the required
// v0.13 wire serializer.
{
  const left = fixture();
  const right = fixture();

  assert(left.basis.R !== right.basis.R, "independent Memories must not share handles");
  assert(left.S !== right.S, "corresponding wholes must have independent handles");

  const leftPos = materializeRelativePoleContext(
    left.memory, left.basis, left.parent, left.S, left.basis.O,
  );
  const rightPos = materializeRelativePoleContext(
    right.memory, right.basis, right.parent, right.S, right.basis.O,
  );

  same(leftPos.selected, left.a, "Memory A selects its own a");
  same(rightPos.selected, right.a, "Memory B selects its own a");
  same(
    replayRelativePoleReturn(left.memory, left.basis, leftPos.context, left.a).whole,
    left.S,
    "Memory A contextual return",
  );
  same(
    replayRelativePoleReturn(right.memory, right.basis, rightPos.context, right.a).whole,
    right.S,
    "Memory B contextual return",
  );
}

console.log("MTS v0.13 relative pole context experiment: GREEN.");
