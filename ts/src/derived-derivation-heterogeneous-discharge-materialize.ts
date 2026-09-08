import { ExactSequenceError, materializeExactSequence, readExactSequence } from "./exact-sequence.js";
import {
  StructuralDerivationReplayError,
  defineStructuralDerivationRule,
  readStructuralDerivationRule,
} from "./derivation.js";
import {
  StructuralHeterogeneousDerivedOpenRootedInstanceReplayError,
  replayStructuralHeterogeneousDerivedOpenRootedInstance,
  type StructuralHeterogeneousDerivedOpenRootedInstanceEvidence,
} from "./derived-derivation-heterogeneous-instance.js";
import { MemoryError, type LinkHandle, type WriteMemory } from "./memory.js";

export interface StructuralAssumptionProofCoordinate {
  readonly assumptionOccurrence: LinkHandle;
  readonly proofOccurrence: LinkHandle;
}

export type StructuralHeterogeneousDerivedClosedRootedDischargeMaterializeErrorCode =
  | "invalid-open-instance"
  | "duplicate-assumption-proof"
  | "unknown-assumption-occurrence"
  | "unused-assumption-proof"
  | "missing-assumption-proof"
  | "invalid-proof-occurrence"
  | "proof-claim-mismatch"
  | "invalid-open-occurrence"
  | "cyclic-dependency";

export class StructuralHeterogeneousDerivedClosedRootedDischargeMaterializeError extends Error {
  override readonly name = "StructuralHeterogeneousDerivedClosedRootedDischargeMaterializeError";

  constructor(
    readonly code: StructuralHeterogeneousDerivedClosedRootedDischargeMaterializeErrorCode,
  ) {
    super(code);
  }
}

function fail(
  code: StructuralHeterogeneousDerivedClosedRootedDischargeMaterializeErrorCode,
): never {
  throw new StructuralHeterogeneousDerivedClosedRootedDischargeMaterializeError(code);
}

function derivation(memory: WriteMemory, handle: LinkHandle) {
  try {
    return readStructuralDerivationRule(memory, handle);
  } catch (error) {
    if (error instanceof StructuralDerivationReplayError || error instanceof MemoryError) {
      fail("invalid-open-occurrence");
    }
    throw error;
  }
}

function dependencies(memory: WriteMemory, handle: LinkHandle): readonly LinkHandle[] {
  try {
    return readExactSequence(memory, handle).values;
  } catch (error) {
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
      fail("invalid-open-occurrence");
    }
    throw error;
  }
}

/**
 * Construction-only OPEN -> CLOSED assumption graft materializer.
 *
 * Host coordinates choose which already-existing proof occurrence is grafted
 * at each reachable OPEN assumption leaf. They grant no proof authority.
 */
export function materializeHeterogeneousDerivedClosedRootedDischarge(
  memory: WriteMemory,
  open: StructuralHeterogeneousDerivedOpenRootedInstanceEvidence,
  assumptionProofs: readonly StructuralAssumptionProofCoordinate[],
): Readonly<{ closedRoot: LinkHandle }> {
  let openReplay: ReturnType<typeof replayStructuralHeterogeneousDerivedOpenRootedInstance>;
  try {
    openReplay = replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, open);
  } catch (error) {
    if (error instanceof StructuralHeterogeneousDerivedOpenRootedInstanceReplayError) {
      fail("invalid-open-instance");
    }
    throw error;
  }

  let openIdentity: LinkHandle;
  let openTargetOccurrence: LinkHandle;
  let openTargetDR: LinkHandle;
  let theory: LinkHandle;
  try {
    ({ start: openIdentity, end: openTargetOccurrence } = memory.poles(open.concreteRoot));
    ({ start: openTargetDR, end: theory } = memory.poles(openIdentity));
  } catch (error) {
    if (error instanceof MemoryError) fail("invalid-open-instance");
    throw error;
  }
  if (
    openTargetOccurrence !== openReplay.concreteTargetOccurrence
    || theory !== openReplay.theory
  ) {
    fail("invalid-open-instance");
  }

  const openTargetSchema = derivation(memory, openTargetDR);
  const openTargetRule = openTargetSchema.structuralRule;
  const openPremises = new Set(openTargetSchema.premiseTemplates);
  const reachableAssumptions = new Map<LinkHandle, LinkHandle>();
  const visited = new Set<LinkHandle>();
  const active = new Set<LinkHandle>();

  const collect = (occurrence: LinkHandle): void => {
    if (visited.has(occurrence)) return;
    if (active.has(occurrence)) fail("cyclic-dependency");
    active.add(occurrence);
    try {
      let claim: LinkHandle;
      let support: LinkHandle;
      try {
        ({ start: claim, end: support } = memory.poles(occurrence));
      } catch (error) {
        if (error instanceof MemoryError) fail("invalid-open-occurrence");
        throw error;
      }

      if (support === openIdentity && openPremises.has(claim)) {
        reachableAssumptions.set(occurrence, claim);
        visited.add(occurrence);
        return;
      }

      let dependencySequence: LinkHandle;
      try {
        ({ end: dependencySequence } = memory.poles(support));
      } catch (error) {
        if (error instanceof MemoryError) fail("invalid-open-occurrence");
        throw error;
      }
      for (const dependency of dependencies(memory, dependencySequence)) collect(dependency);
      visited.add(occurrence);
    } finally {
      active.delete(occurrence);
    }
  };

  collect(openTargetOccurrence);

  const proofByAssumption = new Map<LinkHandle, LinkHandle>();
  for (const coordinate of assumptionProofs) {
    if (proofByAssumption.has(coordinate.assumptionOccurrence)) {
      fail("duplicate-assumption-proof");
    }

    const requiredClaim = reachableAssumptions.get(coordinate.assumptionOccurrence);
    if (requiredClaim === undefined) {
      try {
        const poles = memory.poles(coordinate.assumptionOccurrence);
        if (poles.end === openIdentity && openPremises.has(poles.start)) {
          fail("unused-assumption-proof");
        }
      } catch (error) {
        if (
          error instanceof StructuralHeterogeneousDerivedClosedRootedDischargeMaterializeError
        ) {
          throw error;
        }
        if (!(error instanceof MemoryError)) throw error;
      }
      fail("unknown-assumption-occurrence");
    }

    let proofClaim: LinkHandle;
    try {
      proofClaim = memory.poles(coordinate.proofOccurrence).start;
    } catch (error) {
      if (error instanceof MemoryError) fail("invalid-proof-occurrence");
      throw error;
    }
    if (proofClaim !== requiredClaim) fail("proof-claim-mismatch");
    proofByAssumption.set(coordinate.assumptionOccurrence, coordinate.proofOccurrence);
  }

  for (const assumptionOccurrence of reachableAssumptions.keys()) {
    if (!proofByAssumption.has(assumptionOccurrence)) fail("missing-assumption-proof");
  }

  const rebuilt = new Map<LinkHandle, LinkHandle>();
  const rebuildActive = new Set<LinkHandle>();

  const rebuild = (openOccurrence: LinkHandle): LinkHandle => {
    const supplied = proofByAssumption.get(openOccurrence);
    if (supplied !== undefined) return supplied;

    const cached = rebuilt.get(openOccurrence);
    if (cached !== undefined) return cached;
    if (rebuildActive.has(openOccurrence)) fail("cyclic-dependency");
    rebuildActive.add(openOccurrence);
    try {
      let claim: LinkHandle;
      let support: LinkHandle;
      try {
        ({ start: claim, end: support } = memory.poles(openOccurrence));
      } catch (error) {
        if (error instanceof MemoryError) fail("invalid-open-occurrence");
        throw error;
      }

      if (support === openIdentity && openPremises.has(claim)) {
        fail("missing-assumption-proof");
      }

      let localDR: LinkHandle;
      let dependencySequence: LinkHandle;
      try {
        ({ start: localDR, end: dependencySequence } = memory.poles(support));
      } catch (error) {
        if (error instanceof MemoryError) fail("invalid-open-occurrence");
        throw error;
      }

      const rebuiltDependencies = dependencies(memory, dependencySequence).map(rebuild);
      const occurrence = memory.ensure(
        claim,
        memory.ensure(localDR, materializeExactSequence(memory, rebuiltDependencies)),
      );
      rebuilt.set(openOccurrence, occurrence);
      return occurrence;
    } finally {
      rebuildActive.delete(openOccurrence);
    }
  };

  const closedTargetOccurrence = rebuild(openTargetOccurrence);
  const closedTargetDR = defineStructuralDerivationRule(memory, openTargetRule, []);
  const closedIdentity = memory.ensure(closedTargetDR, theory);
  return Object.freeze({
    closedRoot: memory.ensure(closedIdentity, closedTargetOccurrence),
  });
}
