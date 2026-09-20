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
  replayRelativePoleReturn,
  RelativePoleContextError,
} from "./v013-relative-pole-context.js";

export type V013RelativePoleExecutionErrorCode =
  | "source-operation-mismatch"
  | "context-evidence-mismatch"
  | "current-value-mismatch"
  | "unsupported-operation-form"
  | "multi-step-return-undefined";

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
  readonly input: LinkHandle;
  readonly result: LinkHandle;
}

function fail(code: V013RelativePoleExecutionErrorCode): never {
  throw new V013RelativePoleExecutionError(code);
}

type UnaryOperationForm = "prefix-start-self-closed" | "postfix-end-self-closed";

function readUnaryOperationForm(
  memory: WriteMemory,
  operation: LinkHandle,
): UnaryOperationForm {
  try {
    const poles = memory.poles(operation);
    const startSelfClosed = poles.start === operation;
    const endSelfClosed = poles.end === operation;

    if (startSelfClosed && !endSelfClosed) {
      return "prefix-start-self-closed";
    }
    if (endSelfClosed && !startSelfClosed) {
      return "postfix-end-self-closed";
    }

    // ROOT/full self-closure is not silently treated as either unary direction,
    // and a generic non-self-closed Link is not a unary prefix/postfix form.
    return fail("unsupported-operation-form");
  } catch (error) {
    if (error instanceof V013RelativePoleExecutionError) throw error;
    if (error instanceof MemoryError) {
      return fail("unsupported-operation-form");
    }
    throw error;
  }
}

/**
 * Candidate v0.13 source/Rule/context authority boundary.
 *
 * The physical source does not choose an operation through a host glyph switch.
 * Existing source authority selects one Use and one fixed-Theory Rule. The
 * grounded Rule body has the exact shape:
 *
 *   selectedUse -> operation
 *
 * Unary direction is then read from the operation Link itself:
 *
 *   P = P -> x   => prefix / start-self-closed
 *   Q = x -> Q   => postfix / end-self-closed
 *
 * No separate operation vocabulary is semantic authority.
 */
export function executeAuthorizedRelativePoleSource(
  memory: WriteMemory,
  basis: RootBasis,
  currentContext: LinkHandle,
  input: LinkHandle,
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
  const form = readUnaryOperationForm(memory, operation);

  if (form === "prefix-start-self-closed") {
    let state;
    try {
      state = readContext(memory, currentContext);
    } catch (error) {
      if (error instanceof StateError || error instanceof MemoryError) {
        return fail("context-evidence-mismatch");
      }
      throw error;
    }
    if (state.current !== input) {
      return fail("current-value-mismatch");
    }

    const position = materializeRelativePoleContext(
      memory,
      basis,
      currentContext,
      input,
      [basis.O],
    );
    return Object.freeze({
      selectedUse: replay.selectedUse,
      operation,
      beforeContext: currentContext,
      afterContext: position.context,
      input,
      result: position.selected,
    });
  }

  let position;
  try {
    position = readRelativePoleContext(memory, basis, currentContext);
  } catch (error) {
    if (
      error instanceof RelativePoleContextError ||
      error instanceof StateError ||
      error instanceof MemoryError
    ) {
      return fail("context-evidence-mismatch");
    }
    throw error;
  }

  // The self-end form establishes postfix direction: it acts on an already
  // selected left value. The exact meaning of one postfix step from a deeper
  // path is still undecided, so the candidate refuses to guess.
  if (position.steps.length !== 1) {
    return fail("multi-step-return-undefined");
  }

  const returned = replayRelativePoleReturn(
    memory,
    basis,
    currentContext,
    input,
  );
  return Object.freeze({
    selectedUse: replay.selectedUse,
    operation,
    beforeContext: currentContext,
    afterContext: returned.parent,
    input,
    result: returned.whole,
  });
}
