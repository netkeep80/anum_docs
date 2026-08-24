import type { WriteMemory } from "./memory.js";

/**
 * Construction-only facade for untrusted proof producers.
 *
 * This object deliberately carries no replay/acceptance operation. Successful
 * construction is transport preparation only; existing replay APIs remain the
 * sole proof-authority boundary.
 */
export interface StructuralProofProducer {}

export function createStructuralProofProducer(
  _memory: WriteMemory,
): StructuralProofProducer {
  return Object.freeze({});
}
