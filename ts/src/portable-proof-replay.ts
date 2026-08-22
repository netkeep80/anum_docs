import {
  PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_SCHEMA,
  replayPortableStructuralDerivation,
  replayPortableStructuralDerivationWithAssumptions,
  type PortableStructuralDerivationReplayResult,
  type PortableStructuralDerivationWithAssumptionsReplayResult,
} from "./portable-derivation.js";

export type PortableStructuralProofReplayResult =
  | PortableStructuralDerivationReplayResult
  | PortableStructuralDerivationWithAssumptionsReplayResult;

function schemaOf(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }
  return (input as Record<string, unknown>).schema;
}

/**
 * Single fail-closed portable proof replay boundary.
 *
 * The schema selects only an existing transport parser/reconstruction family.
 * Rule and theorem semantics remain downstream in the generic structural replay
 * kernel. In particular, there is no callback/opcode/rule-name dispatch here.
 */
export function replayPortableStructuralProof(
  input: unknown,
): PortableStructuralProofReplayResult {
  if (schemaOf(input) === PORTABLE_STRUCTURAL_DERIVATION_WITH_ASSUMPTIONS_SCHEMA) {
    return replayPortableStructuralDerivationWithAssumptions(input);
  }
  return replayPortableStructuralDerivation(input);
}
