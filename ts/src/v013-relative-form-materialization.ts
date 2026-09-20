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

export type V013RelativeFormMaterializationErrorCode =
  | "context-evidence-mismatch"
  | "constructor-request-mismatch";

export class V013RelativeFormMaterializationError extends Error {
  override readonly name = "V013RelativeFormMaterializationError";

  constructor(readonly code: V013RelativeFormMaterializationErrorCode) {
    super(code);
  }
}

function fail(code: V013RelativeFormMaterializationErrorCode): never {
  throw new V013RelativeFormMaterializationError(code);
}

/**
 * Candidate v0.13 write boundary for a missing proper unary form.
 *
 * Source + fixed-Theory Rule evidence is replayed read-only first. Its concrete
 * claimed body is a construction request over the semantic current stored in K:
 *
 *   Use -> Current  => materialize START_FORM(Current)
 *   Current -> Use  => materialize END_FORM(Current)
 *
 * Only after that exact request is proved may one proper self-incidence Link be
 * ensured. The glyph name and host callback do not select START/END.
 */
export function materializeAuthorizedRelativeUnaryFormSource(
  memory: WriteMemory,
  basis: RootBasis,
  currentContext: LinkHandle,
  sourceResultEvidence: V012SourceResultEvidence,
  expectedSourceAuthority: V012SourceAuthority,
  expectedTheoryArtifact: unknown,
): LinkHandle {
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

  let current: LinkHandle;
  try {
    current = readContext(memory, currentContext).current;
  } catch (error) {
    if (error instanceof StateError || error instanceof MemoryError) {
      return fail("context-evidence-mismatch");
    }
    throw error;
  }

  let request;
  try {
    request = memory.poles(replay.structural.claimedBody);
  } catch (error) {
    if (error instanceof MemoryError) {
      return fail("constructor-request-mismatch");
    }
    throw error;
  }

  const startRequest =
    request.start === replay.selectedUse &&
    request.end === current;
  const endRequest =
    request.start === current &&
    request.end === replay.selectedUse;

  // Ambiguous Use===Current and every unrelated pair fail closed.
  if (startRequest === endRequest) {
    return fail("constructor-request-mismatch");
  }

  return startRequest
    ? memory.ensureStartSelfClosed(current)
    : memory.ensureEndSelfClosed(current);
}
