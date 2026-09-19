import {
  openFormalSquareBracketContext,
  verifyTypedContext,
  type TypedContext,
} from "./context-integration.js";
import {
  type LinkHandle,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";
import {
  type StructuralInterpreter,
} from "./structural-rule.js";
import {
  replayV012SourceResultEvidence,
  type V012SourceAuthority,
  type V012SourceResultEvidence,
} from "./v012-source.js";

export type V012FormalExecutionErrorCode =
  | "formal-context-interpreter-mismatch"
  | "formal-context-evidence-mismatch"
  | "square-bracket-result-shape"
  | "square-bracket-target-mismatch"
  | "authority-replay-wrote";

export class V012FormalExecutionError extends Error {
  override readonly name = "V012FormalExecutionError";

  constructor(readonly code: V012FormalExecutionErrorCode) {
    super(code);
  }
}

function failFormalExecution(code: V012FormalExecutionErrorCode): never {
  throw new V012FormalExecutionError(code);
}

/**
 * Authority-bound v0.12 FORMAL `[` execution.
 *
 * The low-level context transition does not choose its target interpreter.
 * This bridge first replays exact source -> selected Use -> fixed-Theory Rule
 * evidence read-only. The admitted Rule body must ground the exact operation
 * shape:
 *
 *   selectedUse ⟼ expectedStringInterpreter
 *
 * and the selected Act must be anchored to the exact FORMAL context supplied
 * here. Only after those checks succeed may the I_STRING child be materialized.
 *
 * No callback name, host parser mode, RuleKind/opcode or glyph spelling is
 * semantic authority for the target selection.
 */
export function openAuthorizedV012FormalSquareBracketContext(
  memory: WriteMemory,
  basis: RootBasis,
  formalBefore: TypedContext,
  expectedFormalInterpreter: StructuralInterpreter,
  expectedStringInterpreter: LinkHandle,
  sourceResultEvidence: V012SourceResultEvidence,
  expectedSourceAuthority: V012SourceAuthority,
  expectedTheoryArtifact: unknown,
): TypedContext {
  const before = memory.linkCount;

  verifyTypedContext(memory, formalBefore, expectedFormalInterpreter);

  const replay = replayV012SourceResultEvidence(
    memory,
    basis,
    sourceResultEvidence,
    expectedSourceAuthority,
    expectedTheoryArtifact,
  );

  if (replay.structural.interpreter !== formalBefore.interpreter) {
    return failFormalExecution("formal-context-interpreter-mismatch");
  }
  if (replay.structural.afterContext !== formalBefore.context) {
    return failFormalExecution("formal-context-evidence-mismatch");
  }

  const groundedOperation = memory.poles(replay.structural.claimedBody);
  if (groundedOperation.start !== replay.selectedUse) {
    return failFormalExecution("square-bracket-result-shape");
  }
  if (groundedOperation.end !== expectedStringInterpreter) {
    return failFormalExecution("square-bracket-target-mismatch");
  }

  if (memory.linkCount !== before) {
    return failFormalExecution("authority-replay-wrote");
  }

  return openFormalSquareBracketContext(
    memory,
    formalBefore,
    expectedFormalInterpreter,
    groundedOperation.end,
  );
}
