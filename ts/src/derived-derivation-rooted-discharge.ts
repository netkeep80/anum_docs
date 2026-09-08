import {
  materializeExactSequence,
  readExactSequence,
} from "./exact-sequence.js";
import {
  defineStructuralDerivationRule,
  replayStructuralDerivationWithAssumptions,
  type StructuralDerivationNodeEvidence,
  type StructuralDerivationWithAssumptionsEvidence,
} from "./derivation.js";
import {
  MemoryError,
  type LinkHandle,
  type WriteMemory,
} from "./memory.js";
import {
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "./structural-rule.js";

export interface StructuralAssumptionProofBinding {
  readonly assumptionOccurrence: LinkHandle;
  readonly proofOccurrence: LinkHandle;
}

export interface StructuralDerivedDerivationRootedDischargeResult {
  readonly root: LinkHandle;
  readonly targetIdentity: LinkHandle;
  readonly targetOccurrence: LinkHandle;
  readonly targetRule: LinkHandle;
  readonly targetDerivationRule: LinkHandle;
  readonly dischargedAssumptionOccurrences: readonly LinkHandle[];
}

export type StructuralDerivedDerivationRootedDischargeErrorCode =
  | "invalid-concrete-evidence"
  | "duplicate-assumption-proof"
  | "unknown-assumption-occurrence"
  | "unused-assumption-proof"
  | "missing-assumption-proof"
  | "invalid-proof-occurrence"
  | "proof-claim-mismatch"
  | "missing-dependency"
  | "cyclic-dependency"
  | "unreachable-node";

export class StructuralDerivedDerivationRootedDischargeError extends Error {
  override readonly name = "StructuralDerivedDerivationRootedDischargeError";

  constructor(readonly code: StructuralDerivedDerivationRootedDischargeErrorCode) {
    super(code);
  }
}

function fail(code: StructuralDerivedDerivationRootedDischargeErrorCode): never {
  throw new StructuralDerivedDerivationRootedDischargeError(code);
}

/**
 * Construction-only lowering of an already replay-valid concrete conditional
 * derivation into one closed rooted proof-Anet candidate.
 *
 * Supplied ProofOccurrences are treated only as topology coordinates. This
 * constructor checks their exact Claim pole but never interprets Support and
 * never selects a proof law. The resulting root receives authority only from
 * replayStructuralRootedProofAset at a later, independent acceptance boundary.
 */
export function materializeStructuralDerivedDerivationRootedDischarge(
  memory: WriteMemory,
  evidence: StructuralDerivationWithAssumptionsEvidence,
  assumptionProofs: readonly StructuralAssumptionProofBinding[],
): StructuralDerivedDerivationRootedDischargeResult {
  let replay: ReturnType<typeof replayStructuralDerivationWithAssumptions>;
  try {
    replay = replayStructuralDerivationWithAssumptions(memory, evidence);
  } catch {
    fail("invalid-concrete-evidence");
  }

  const declaredClaims = replay.declaredAssumptionClaims;
  const declaredOccurrences = replay.declaredAssumptionOccurrences;
  if (declaredClaims.length !== declaredOccurrences.length) {
    fail("invalid-concrete-evidence");
  }

  const claimByAssumption = new Map<LinkHandle, LinkHandle>();
  declaredOccurrences.forEach((occurrence, index) => {
    const claim = declaredClaims[index];
    if (claim === undefined || claimByAssumption.has(occurrence)) {
      fail("invalid-concrete-evidence");
    }
    claimByAssumption.set(occurrence, claim);
  });

  const used = new Set(replay.usedAssumptionOccurrences);
  const proofByAssumption = new Map<LinkHandle, LinkHandle>();
  for (const binding of assumptionProofs) {
    if (proofByAssumption.has(binding.assumptionOccurrence)) {
      fail("duplicate-assumption-proof");
    }
    const requiredClaim = claimByAssumption.get(binding.assumptionOccurrence);
    if (requiredClaim === undefined) fail("unknown-assumption-occurrence");
    if (!used.has(binding.assumptionOccurrence)) fail("unused-assumption-proof");

    let proofClaim: LinkHandle;
    try {
      proofClaim = memory.poles(binding.proofOccurrence).start;
    } catch (error) {
      if (error instanceof MemoryError) fail("invalid-proof-occurrence");
      throw error;
    }
    if (proofClaim !== requiredClaim) fail("proof-claim-mismatch");
    proofByAssumption.set(binding.assumptionOccurrence, binding.proofOccurrence);
  }

  for (const occurrence of used) {
    if (!proofByAssumption.has(occurrence)) fail("missing-assumption-proof");
  }

  const nodes = new Map<LinkHandle, StructuralDerivationNodeEvidence>();
  for (const node of evidence.derivation.nodes) {
    if (nodes.has(node.occurrence)) fail("invalid-concrete-evidence");
    nodes.set(node.occurrence, node);
  }

  const lowered = new Map<LinkHandle, LinkHandle>();
  const active = new Set<LinkHandle>();

  const lowerNode = (occurrence: LinkHandle): LinkHandle => {
    const suppliedProof = proofByAssumption.get(occurrence);
    if (suppliedProof !== undefined) return suppliedProof;

    const cached = lowered.get(occurrence);
    if (cached !== undefined) return cached;
    if (active.has(occurrence)) fail("cyclic-dependency");

    const node = nodes.get(occurrence);
    if (node === undefined) fail("missing-dependency");
    active.add(occurrence);
    try {
      let dependencies: readonly LinkHandle[];
      try {
        dependencies = readExactSequence(memory, node.premiseOccurrenceSequence).values;
      } catch {
        fail("invalid-concrete-evidence");
      }

      const loweredDependencies = dependencies.map(lowerNode);
      const application = memory.ensure(
        node.derivationRule,
        materializeExactSequence(memory, loweredDependencies),
      );
      const rootedOccurrence = memory.ensure(
        node.judgment.judgment.claim,
        application,
      );
      lowered.set(occurrence, rootedOccurrence);
      return rootedOccurrence;
    } finally {
      active.delete(occurrence);
    }
  };

  const targetOccurrence = lowerNode(evidence.derivation.targetOccurrence);
  if (lowered.size !== nodes.size) fail("unreachable-node");

  const targetClaim = replay.derivation.target.judgment.claim;
  const targetDictionary = defineStructuralRoleDictionary(memory, []);
  const targetRule = defineStructuralRule(memory, targetDictionary, targetClaim);
  const targetDerivationRule = defineStructuralDerivationRule(memory, targetRule, []);
  const targetIdentity = memory.ensure(
    targetDerivationRule,
    replay.derivation.theory,
  );
  const root = memory.ensure(targetIdentity, targetOccurrence);

  return Object.freeze({
    root,
    targetIdentity,
    targetOccurrence,
    targetRule,
    targetDerivationRule,
    dischargedAssumptionOccurrences: Object.freeze([...used]),
  });
}
