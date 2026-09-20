import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "./exact-sequence.js";
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
  | "invalid-path"
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
  readonly path: LinkHandle;
  readonly steps: readonly LinkHandle[];
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

function requireSteps(
  basis: RootBasis,
  steps: readonly LinkHandle[],
): void {
  if (steps.length === 0) {
    throw new RelativePoleContextError("invalid-path");
  }
  for (const step of steps) {
    if (step !== basis.O && step !== basis.C) {
      throw new RelativePoleContextError("invalid-path");
    }
  }
}

function followPolePath(
  memory: ReadMemory,
  basis: RootBasis,
  whole: LinkHandle,
  steps: readonly LinkHandle[],
): LinkHandle {
  requireSteps(basis, steps);
  let current = whole;
  for (const step of steps) {
    const poles = memory.poles(current);
    current = step === basis.O ? poles.start : poles.end;
  }
  return current;
}

/**
 * Candidate v0.13 position context.
 *
 * The returned semantic Link is not wrapped. The context instead preserves
 * where that Link was selected from:
 *
 *   Path  = ExactSequence(O|C, ...)
 *   Frame = Whole -> Path
 *   K_pos = START(ParentK -> Frame)
 *
 * O/C are used here only as already-verified structural direction markers for
 * the experiment. This does not claim that they remain the v0.13 transport
 * abits.
 */
export function materializeRelativePoleContext(
  memory: WriteMemory,
  basis: RootBasis,
  parent: LinkHandle,
  whole: LinkHandle,
  steps: readonly LinkHandle[],
): RelativePolePosition {
  const verifiedBasis = requireBasis(memory, basis);

  try {
    readContext(memory, parent);
    requireSteps(verifiedBasis, steps);

    const path = materializeExactSequence(memory, steps);
    const frame = memory.ensure(whole, path);
    const context = defineContext(memory, parent, frame);
    const selected = followPolePath(memory, verifiedBasis, whole, steps);

    return Object.freeze({
      parent,
      context,
      frame,
      whole,
      path,
      steps: Object.freeze([...steps]),
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
 * Read an already materialized position using Links only.
 *
 * No source string, host path, occurrence id, incoming scan or ambient stack is
 * semantic authority. The exact path survives even when START and END resolve
 * to the same Link, as for R.
 */
export function readRelativePoleContext(
  memory: ReadMemory,
  basis: RootBasis,
  context: LinkHandle,
): RelativePolePosition {
  const verifiedBasis = requireBasis(memory, basis);

  try {
    const state = readContext(memory, context);
    readContext(memory, state.parent);

    const framePoles = memory.poles(state.current);
    const whole = framePoles.start;
    const path = framePoles.end;
    const exact = readExactSequence(memory, path);
    requireSteps(verifiedBasis, exact.values);

    const selected = followPolePath(
      memory,
      verifiedBasis,
      whole,
      exact.values,
    );

    return Object.freeze({
      parent: state.parent,
      context,
      frame: state.current,
      whole,
      path,
      steps: exact.values,
      selected,
    });
  } catch (error) {
    if (error instanceof RelativePoleContextError) throw error;
    if (error instanceof ExactSequenceError) {
      throw new RelativePoleContextError("invalid-path");
    }
    if (error instanceof StateError || error instanceof MemoryError) {
      throw new RelativePoleContextError("invalid-context");
    }
    throw error;
  }
}

/**
 * Read-only contextual return.
 *
 * This is intentionally not end(selected). It verifies that the supplied Link
 * is exactly the pole selected by K_pos and returns the selected Whole stored
 * by that structural position.
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
