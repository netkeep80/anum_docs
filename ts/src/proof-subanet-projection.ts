import type { LinkHandle, ReadMemory } from "./memory.js";
import type { StructuralSubstitutionBinding } from "./structural-substitution.js";

export interface ProofSubAnetProjectionEvidence {
  readonly theory: LinkHandle;
  readonly schemaDerivationRule: LinkHandle;
  readonly premiseProofOccurrence: LinkHandle;
}

export interface ProofSubAnetProjectionReplayResult {
  readonly theory: LinkHandle;
  readonly schemaDerivationRule: LinkHandle;
  readonly premiseProofOccurrence: LinkHandle;
  readonly premiseClaim: LinkHandle;
  readonly projectedOccurrence: LinkHandle;
  readonly projectedClaim: LinkHandle;
  readonly bindings: readonly StructuralSubstitutionBinding[];
}

export type ProofSubAnetProjectionReplayErrorCode =
  | "invalid-schema"
  | "unsupported-schema-arity"
  | "invalid-premise-proof"
  | "unbound-schema-role"
  | "invalid-premise-substitution"
  | "projection-not-found"
  | "ambiguous-projection"
  | "replay-wrote";

export class ProofSubAnetProjectionReplayError extends Error {
  override readonly name = "ProofSubAnetProjectionReplayError";

  constructor(readonly code: ProofSubAnetProjectionReplayErrorCode) {
    super(code);
  }
}

function fail(code: ProofSubAnetProjectionReplayErrorCode): never {
  throw new ProofSubAnetProjectionReplayError(code);
}

/**
 * K1e trusted surface. The first TDD implementation is deliberately only an
 * API boundary so the accepted test can move from module-missing RED to a
 * behavioral projection RED before any proof-selection logic is introduced.
 */
export function replayProofSubAnetProjection(
  memory: ReadMemory,
  evidence: ProofSubAnetProjectionEvidence,
): ProofSubAnetProjectionReplayResult {
  void memory;
  void evidence;
  fail("projection-not-found");
}
