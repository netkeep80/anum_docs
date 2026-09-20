import {
  MemoryError,
  type LinkHandle,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";
import {
  readContext,
  StateError,
} from "./state.js";
import {
  replayV012SourceResultEvidence,
  type V012SourceAuthority,
  type V012SourceResultEvidence,
} from "./v012-source.js";
import {
  materializeRelativePoleContext,
  readRelativePoleContext,
  readRelativeUnaryForm,
  RelativePoleContextError,
  type RelativePolePosition,
  type RelativeUnaryForm,
} from "./v013-relative-pole-context.js";

export type V013RelativePoleExecutionErrorCode =
  | "source-operation-mismatch"
  | "operation-operand-mismatch"
  | "context-evidence-mismatch"
  | "unsupported-operation-form";

export class V013RelativePoleExecutionError extends Error {
  override readonly name = "V013RelativePoleExecutionError";

  constructor(readonly code: V013RelativePoleExecutionErrorCode) {
    super(code);
  }
}

export interface V013RelativePoleExecutionResult {
  readonly selectedUse: LinkHandle;
  readonly operation: LinkHandle;
  readonly beforeContext: LinkHandle;
  readonly afterContext: LinkHandle;
  readonly result: LinkHandle;
}

function fail(code: V013RelativePoleExecutionErrorCode): never {
  throw new V013RelativePoleExecutionError(code);
}

function requireUnaryOperation(
  memory: WriteMemory,
  operation: LinkHandle,
): RelativeUnaryForm {
  try {
    return readRelativeUnaryForm(memory, operation);
  } catch (error) {
    if (
      error instanceof RelativePoleContextError &&
      error.code === "invalid-form"
    ) {
      return fail("unsupported-operation-form");
    }
    throw error;
  }
}

function readCurrentPosition(
  memory: WriteMemory,
  currentContext: LinkHandle,
): readonly [LinkHandle, RelativePolePosition | undefined] {
  try {
    const position = readRelativePoleContext(memory, currentContext);
    return Object.freeze([position.selected, position]);
  } catch (error) {
    if (
      error instanceof RelativePoleContextError &&
      error.code !== "invalid-context"
    ) {
      return fail("context-evidence-mismatch");
    }
    if (
      !(error instanceof RelativePoleContextError) &&
      !(error instanceof StateError) &&
      !(error instanceof MemoryError)
    ) {
      throw error;
    }
  }

  try {
    const state = readContext(memory, currentContext);
    return Object.freeze([state.current, undefined]);
  } catch (error) {
    if (error instanceof V013RelativePoleExecutionError) throw error;
    if (error instanceof StateError || error instanceof MemoryError) {
      return fail("context-evidence-mismatch");
    }
    throw error;
  }
}

function executePoleForm(
  memory: WriteMemory,
  currentContext: LinkHandle,
  operation: LinkHandle,
  unary: RelativeUnaryForm,
  position: RelativePolePosition | undefined,
): {
  readonly afterContext: LinkHandle;
  readonly result: LinkHandle;
} {
  if (
    position !== undefined &&
    position.side !== unary.side
  ) {
    return Object.freeze({
      afterContext: position.parent,
      result: position.whole,
    });
  }

  const selected = materializeRelativePoleContext(
    memory,
    currentContext,
    operation,
  );
  return Object.freeze({
    afterContext: selected.context,
    result: selected.selected,
  });
}

/**
 * Candidate v0.13 source/Rule/context authority boundary.
 *
 * The concrete unary Link is both the operation and the position evidence:
 *
 *   P = P -> current
 *   Q = current -> Q
 *
 * Current is derived only from currentContext; it is not a second host
 * argument. No O/C direction marker is stored in the generic position. Whole
 * and orientation are recovered from the exact self-incidence form itself.
 */
export function executeAuthorizedRelativePoleSource(
  memory: WriteMemory,
  basis: RootBasis,
  currentContext: LinkHandle,
  sourceResultEvidence: V012SourceResultEvidence,
  expectedSourceAuthority: V012SourceAuthority,
  expectedTheoryArtifact: unknown,
): V013RelativePoleExecutionResult {
  const replay = replayV012SourceResultEvidence(
    memory,
    basis,
    sourceResultEvidence,
    expectedSourceAuthority,
    expectedTheoryArtifact,
  );

  if (replay.structural.afterContext !== currentContext) {
    return fail("context-evidence-mismatch");
  }

  let grounded;
  try {
    grounded = memory.poles(replay.structural.claimedBody);
  } catch (error) {
    if (error instanceof MemoryError) {
      return fail("source-operation-mismatch");
    }
    throw error;
  }
  if (grounded.start !== replay.selectedUse) {
    return fail("source-operation-mismatch");
  }

  const operation = grounded.end;
  const unary = requireUnaryOperation(memory, operation);
  const [current, position] = readCurrentPosition(memory, currentContext);
  if (unary.whole !== current) {
    return fail("operation-operand-mismatch");
  }

  const transition = executePoleForm(
    memory,
    currentContext,
    operation,
    unary,
    position,
  );

  return Object.freeze({
    selectedUse: replay.selectedUse,
    operation,
    beforeContext: currentContext,
    afterContext: transition.afterContext,
    result: transition.result,
  });
}
