import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
  type WriteMemory,
} from "./memory.js";
import {
  StateError,
  defineContext,
  readContext,
} from "./state.js";

export type RelativePoleContextErrorCode =
  | "invalid-context"
  | "invalid-form"
  | "selected-mismatch"
  | "replay-wrote";

export class RelativePoleContextError extends Error {
  override readonly name = "RelativePoleContextError";

  constructor(readonly code: RelativePoleContextErrorCode) {
    super(code);
  }
}

export type RelativeUnarySide = "start" | "end";

export interface RelativeUnaryForm {
  readonly form: LinkHandle;
  readonly whole: LinkHandle;
  readonly side: RelativeUnarySide;
}

export interface RelativePolePosition extends RelativeUnaryForm {
  readonly parent: LinkHandle;
  readonly context: LinkHandle;
  readonly selected: LinkHandle;
}

export interface RelativePoleReturn {
  readonly parent: LinkHandle;
  readonly whole: LinkHandle;
}

/**
 * Read a proper relative unary form directly from its self-incidence.
 *
 *   P = P -> S  => START form over Whole S
 *   Q = S -> Q  => END form over Whole S
 *
 * ROOT/full self-closure and generic non-self-closed Links are not unary forms.
 */
export function readRelativeUnaryForm(
  memory: ReadMemory,
  form: LinkHandle,
): RelativeUnaryForm {
  try {
    const poles = memory.poles(form);
    const startSelfClosed = poles.start === form;
    const endSelfClosed = poles.end === form;

    if (startSelfClosed === endSelfClosed) {
      throw new RelativePoleContextError("invalid-form");
    }

    return Object.freeze({
      form,
      whole: startSelfClosed ? poles.end : poles.start,
      side: startSelfClosed ? "start" as const : "end" as const,
    });
  } catch (error) {
    if (error instanceof RelativePoleContextError) throw error;
    if (error instanceof MemoryError) {
      throw new RelativePoleContextError("invalid-form");
    }
    throw error;
  }
}

function resolveUnaryForm(
  memory: ReadMemory,
  unary: RelativeUnaryForm,
): LinkHandle {
  try {
    const poles = memory.poles(unary.whole);
    return unary.side === "start" ? poles.start : poles.end;
  } catch (error) {
    if (error instanceof MemoryError) {
      throw new RelativePoleContextError("invalid-form");
    }
    throw error;
  }
}

/**
 * Candidate v0.13 one-step position context.
 *
 * The exact entry form is itself the evidence:
 *
 *   P = P -> S  or  Q = S -> Q
 *
 *   K_evidence = START(ParentK -> Form)
 *   K_pos      = START(K_evidence -> Selected)
 *
 * The form already carries both Whole and START/END orientation, so no separate
 * O/C direction marker or path carrier is required.
 */
export function materializeRelativePoleContext(
  memory: WriteMemory,
  parent: LinkHandle,
  form: LinkHandle,
): RelativePolePosition {
  try {
    readContext(memory, parent);
    const unary = readRelativeUnaryForm(memory, form);
    const selected = resolveUnaryForm(memory, unary);
    const evidenceContext = defineContext(memory, parent, form);
    const context = defineContext(memory, evidenceContext, selected);

    return Object.freeze({
      parent,
      context,
      form,
      whole: unary.whole,
      side: unary.side,
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
 * Read an already materialized one-step position using only the stored form
 * Link and the context topology.
 */
export function readRelativePoleContext(
  memory: ReadMemory,
  context: LinkHandle,
): RelativePolePosition {
  try {
    const state = readContext(memory, context);
    const evidence = readContext(memory, state.parent);
    readContext(memory, evidence.parent);

    const unary = readRelativeUnaryForm(memory, evidence.current);
    const derivedSelected = resolveUnaryForm(memory, unary);
    if (derivedSelected !== state.current) {
      throw new RelativePoleContextError("selected-mismatch");
    }

    return Object.freeze({
      parent: evidence.parent,
      context,
      form: evidence.current,
      whole: unary.whole,
      side: unary.side,
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
 * This is intentionally not the opposite pole of Selected. It verifies the
 * exact stored entry form and restores the Whole carried by that form.
 */
export function replayRelativePoleReturn(
  memory: ReadMemory,
  context: LinkHandle,
  selected: LinkHandle,
): RelativePoleReturn {
  const before = memory.linkCount;
  try {
    const position = readRelativePoleContext(memory, context);
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
