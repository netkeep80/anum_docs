import {
  MemoryError,
  verifyRootBasis,
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";
import {
  StateError,
  defineContext,
  readContext,
} from "./state.js";

export type RelativePoleContextErrorCode =
  | "invalid-basis"
  | "invalid-context"
  | "invalid-direction"
  | "selected-mismatch"
  | "replay-wrote";

export class RelativePoleContextError extends Error {
  override readonly name = "RelativePoleContextError";

  constructor(readonly code: RelativePoleContextErrorCode) {
    super(code);
  }
}

export interface RelativePolePosition {
  readonly parent: LinkHandle;
  readonly context: LinkHandle;
  readonly frame: LinkHandle;
  readonly whole: LinkHandle;
  readonly direction: LinkHandle;
  readonly selected: LinkHandle;
}

export interface RelativePoleReturn {
  readonly parent: LinkHandle;
  readonly whole: LinkHandle;
}

function requireBasis(memory: ReadMemory, basis: RootBasis): RootBasis {
  try {
    return verifyRootBasis(memory, basis);
  } catch (error) {
    if (error instanceof MemoryError) {
      throw new RelativePoleContextError("invalid-basis");
    }
    throw error;
  }
}

function requireDirection(
  basis: RootBasis,
  direction: LinkHandle,
): void {
  if (direction !== basis.O && direction !== basis.C) {
    throw new RelativePoleContextError("invalid-direction");
  }
}

function followPole(
  memory: ReadMemory,
  basis: RootBasis,
  whole: LinkHandle,
  direction: LinkHandle,
): LinkHandle {
  requireDirection(basis, direction);
  const poles = memory.poles(whole);
  return direction === basis.O ? poles.start : poles.end;
}

/**
 * Candidate v0.13 one-step position context.
 *
 * Sequential unary navigation is represented by nested position contexts.
 * Therefore one position needs only the direction used to enter it:
 *
 *   Direction  = O | C
 *   Frame      = Whole -> Direction
 *   K_evidence = START(ParentK -> Frame)
 *   K_pos      = START(K_evidence -> Selected)
 *
 * K_pos.current remains the exact semantic Selected Link. Whole + Direction
 * stay explicit in the parent evidence context so contextual return is
 * reconstructible without an ambient stack or incoming scan.
 *
 * O/C are used only as already-verified direction markers for this candidate;
 * this does not claim they remain v0.13 transport abits.
 */
export function materializeRelativePoleContext(
  memory: WriteMemory,
  basis: RootBasis,
  parent: LinkHandle,
  whole: LinkHandle,
  direction: LinkHandle,
): RelativePolePosition {
  const verifiedBasis = requireBasis(memory, basis);

  try {
    readContext(memory, parent);
    requireDirection(verifiedBasis, direction);

    const frame = memory.ensure(whole, direction);
    const selected = followPole(
      memory,
      verifiedBasis,
      whole,
      direction,
    );
    const evidenceContext = defineContext(memory, parent, frame);
    const context = defineContext(memory, evidenceContext, selected);

    return Object.freeze({
      parent,
      context,
      frame,
      whole,
      direction,
      selected,
    });
  } catch (error) {
    if (error instanceof RelativePoleContextError) throw error;
    if (error instanceof StateError || error instanceof MemoryError) {
      throw new RelativePoleContextError("invalid-context");
    }
    throw error;
  }
}

/**
 * Read an already materialized one-step position using Links only.
 */
export function readRelativePoleContext(
  memory: ReadMemory,
  basis: RootBasis,
  context: LinkHandle,
): RelativePolePosition {
  const verifiedBasis = requireBasis(memory, basis);

  try {
    const state = readContext(memory, context);
    const evidence = readContext(memory, state.parent);
    readContext(memory, evidence.parent);

    const framePoles = memory.poles(evidence.current);
    const whole = framePoles.start;
    const direction = framePoles.end;
    requireDirection(verifiedBasis, direction);

    const derivedSelected = followPole(
      memory,
      verifiedBasis,
      whole,
      direction,
    );
    if (derivedSelected !== state.current) {
      throw new RelativePoleContextError("selected-mismatch");
    }

    return Object.freeze({
      parent: evidence.parent,
      context,
      frame: evidence.current,
      whole,
      direction,
      selected: state.current,
    });
  } catch (error) {
    if (error instanceof RelativePoleContextError) throw error;
    if (error instanceof StateError || error instanceof MemoryError) {
      throw new RelativePoleContextError("invalid-context");
    }
    throw error;
  }
}

/**
 * Read-only contextual return.
 *
 * This is intentionally not the opposite pole of Selected. It verifies that
 * the supplied Link is exactly the result stored by K_pos and returns the Whole
 * recorded by that one-step position.
 */
export function replayRelativePoleReturn(
  memory: ReadMemory,
  basis: RootBasis,
  context: LinkHandle,
  selected: LinkHandle,
): RelativePoleReturn {
  const before = memory.linkCount;
  try {
    const position = readRelativePoleContext(memory, basis, context);
    if (position.selected !== selected) {
      throw new RelativePoleContextError("selected-mismatch");
    }
    return Object.freeze({
      parent: position.parent,
      whole: position.whole,
    });
  } finally {
    if (memory.linkCount !== before) {
      throw new RelativePoleContextError("replay-wrote");
    }
  }
}
