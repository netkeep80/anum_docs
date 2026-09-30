import { materializeExactSequence } from "./exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";
import {
  replayStructuralRootedProofAset,
  type StructuralRootedProofAsetReplayResult,
} from "./rooted-proof-aset.js";
import { exportObservedReplaySupportTopology } from "./replay-support-topology.js";
import {
  materializeV013HierarchicalCarrier,
  materializeV013HierarchicalCarrierFromSemanticLink,
  materializeV013SemanticLinkFromHierarchicalCarrier,
  serializeV013HierarchicalCarrier,
} from "./v013-hierarchical-carrier.js";

export interface PortableClosedRootedProofReplayResult {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly envelope: LinkHandle;
  readonly proofRoot: LinkHandle;
  readonly replay: StructuralRootedProofAsetReplayResult;
}

/**
 * Construction-only package transport for one already-valid CLOSED rooted proof.
 *
 * Trusted rooted replay is executed first through the existing observed-support
 * tracer. The exported bytes then contain an ordinary Link-native envelope:
 *
 *   proofRoot -> ExactSequence(observed replay-support Links)
 *
 * The sequence is transport scaffolding only. It grants no proof authority.
 * Receiver-side proof truth is decided only by a fresh rooted K1 replay.
 */
export function exportPortableClosedRootedProof(
  memory: WriteMemory,
  basis: RootBasis,
  proofRoot: LinkHandle,
): Uint8Array {
  const observed = exportObservedReplaySupportTopology(
    memory,
    (observedMemory) => replayStructuralRootedProofAset(observedMemory, proofRoot),
    [proofRoot],
  );

  const supportSequence = materializeExactSequence(memory, observed.links);
  const envelope = memory.ensure(proofRoot, supportSequence);
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    envelope,
  );
  return serializeV013HierarchicalCarrier(memory, basis, carrier);
}

/**
 * Reconstruct one portable CLOSED rooted proof in a fresh Memory and rerun the
 * trusted rooted proof kernel.
 *
 * No sender-local handle, numeric coordinate, theorem id or approval metadata is
 * transported. The proof entry is recovered structurally as envelope.start; the
 * selected Theory is then recovered by replayStructuralRootedProofAset itself.
 * Successful semantic reconstruction alone never constitutes proof ACCEPT.
 */
export function replayPortableClosedRootedProof(
  bytes: Uint8Array,
): PortableClosedRootedProofReplayResult {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const carrier = materializeV013HierarchicalCarrier(memory, basis, bytes);
  const envelope = materializeV013SemanticLinkFromHierarchicalCarrier(
    memory,
    basis,
    carrier,
  );
  const proofRoot = memory.poles(envelope).start;
  const replay = replayStructuralRootedProofAset(memory, proofRoot);

  return Object.freeze({
    memory,
    basis,
    envelope,
    proofRoot,
    replay,
  });
}
