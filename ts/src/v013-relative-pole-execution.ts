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
  | "invalid-operation-vocabulary"
  | "source-operation-mismatch"
  | "context-evidence-mismatch"
  | "current-value-mismatch"
  | "unsupported-operation"
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

function readOperationVocabulary(
  memory: WriteMemory,
  vocabulary: LinkHandle,
): {
  readonly selectStart: LinkHandle;
  readonly contextualReturn: LinkHandle;
} {
  try {
    const poles = memory.poles(vocabulary);
    if (poles.start === poles.end) {
      return fail("invalid-operation-vocabulary");
    }
    return Object.freeze({
      selectStart: poles.start,
      contextualReturn: poles.end,
    });
  } catch (error) {
    if (error instanceof V013RelativePoleExecutionError) throw error;
    if (error instanceof MemoryError) {
      return fail("invalid-operation-vocabulary");
    }
    throw error;
  }
}

/**
 * Candidate v0.13 source/Rule/context authority boundary.
 *
 * The physical source does not choose an operation by host glyph switch.
 * Existing v0.12 source authority selects one Use and one fixed-Theory Rule.
 * The grounded Rule body has the exact shape:
 *
 *   selectedUse -> operation
 *
 * The operation vocabulary is itself one Link:
 *
 *   selectStartOperation -> contextualReturnOperation
 *
 * Only after read-only source/Rule replay and exact current-context anchoring
 * may the selected operation affect context state.
 */
export function executeAuthorizedRelativePoleSource(
  memory: WriteMemory,
  basis: RootBasis,
  currentContext: LinkHandle,
  input: LinkHandle,
  operationVocabulary: LinkHandle,
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
  const operations = readOperationVocabulary(memory, operationVocabulary);

  if (operation === operations.selectStart) {
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

  if (operation === operations.contextualReturn) {
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

    // The meaning of one visible ascent after a deeper path has not been
    // decided. Refuse rather than silently choosing Whole-return.
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

  return fail("unsupported-operation");
}
