import { ExactSequenceError, readExactSequence } from "./exact-sequence.js";
import {
  StructuralDerivationReplayError,
  readStructuralDerivationRule,
} from "./derivation.js";
import {
  StructuralHeterogeneousDerivedOpenRootedInstanceReplayError,
  replayStructuralHeterogeneousDerivedOpenRootedInstance,
  type StructuralHeterogeneousDerivedOpenRootedInstanceEvidence,
} from "./derived-derivation-heterogeneous-instance.js";
import { MemoryError, type LinkHandle, type ReadMemory } from "./memory.js";
import {
  StructuralRootedProofAsetReplayError,
  replayStructuralRootedProofAset,
} from "./rooted-proof-aset.js";
import {
  StructuralRuleError,
  readStructuralRoleDictionary,
  readStructuralRule,
} from "./structural-rule.js";
import type { StructuralSubstitutionBinding } from "./structural-substitution.js";

export interface StructuralHeterogeneousDerivedClosedRootedInstanceEvidence {
  readonly open: StructuralHeterogeneousDerivedOpenRootedInstanceEvidence;
  readonly closedRoot: LinkHandle;
}

export interface StructuralHeterogeneousDerivedClosedRootedInstanceReplayResult {
  readonly theory: LinkHandle;
  readonly genericIdentity: LinkHandle;
  readonly openRoot: LinkHandle;
  readonly closedRoot: LinkHandle;
  readonly conclusion: LinkHandle;
  readonly globalRoleDictionary: LinkHandle;
  readonly bindings: readonly StructuralSubstitutionBinding[];
  readonly dischargedAssumptionCount: number;
  readonly pairedStructuralOccurrenceCount: number;
}

export type StructuralHeterogeneousDerivedClosedRootedInstanceReplayErrorCode =
  | "invalid-open-instance"
  | "invalid-closed-rooted-proof"
  | "theory-mismatch"
  | "non-closed-target"
  | "target-rule-mismatch"
  | "conclusion-mismatch"
  | "invalid-occurrence-pair"
  | "claim-mismatch"
  | "derivation-rule-mismatch"
  | "dependency-arity-mismatch"
  | "inconsistent-correspondence"
  | "replay-wrote";

export class StructuralHeterogeneousDerivedClosedRootedInstanceReplayError extends Error {
  override readonly name = "StructuralHeterogeneousDerivedClosedRootedInstanceReplayError";

  constructor(readonly code: StructuralHeterogeneousDerivedClosedRootedInstanceReplayErrorCode) {
    super(code);
  }
}

function fail(code: StructuralHeterogeneousDerivedClosedRootedInstanceReplayErrorCode): never {
  throw new StructuralHeterogeneousDerivedClosedRootedInstanceReplayError(code);
}

function derivation(memory: ReadMemory, handle: LinkHandle) {
  try {
    return readStructuralDerivationRule(memory, handle);
  } catch (error) {
    if (error instanceof StructuralDerivationReplayError || error instanceof MemoryError) {
      fail("invalid-occurrence-pair");
    }
    throw error;
  }
}

function rule(memory: ReadMemory, handle: LinkHandle) {
  try {
    return readStructuralRule(memory, handle);
  } catch (error) {
    if (error instanceof StructuralRuleError || error instanceof MemoryError) {
      fail("invalid-occurrence-pair");
    }
    throw error;
  }
}

function roles(memory: ReadMemory, dictionary: LinkHandle): readonly LinkHandle[] {
  try {
    return readStructuralRoleDictionary(memory, dictionary).roles;
  } catch (error) {
    if (error instanceof StructuralRuleError || error instanceof MemoryError) {
      fail("invalid-occurrence-pair");
    }
    throw error;
  }
}

function sequence(memory: ReadMemory, handle: LinkHandle): readonly LinkHandle[] {
  try {
    return readExactSequence(memory, handle).values;
  } catch (error) {
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
      fail("invalid-occurrence-pair");
    }
    throw error;
  }
}

/**
 * Trusted read-only proof that one independently valid CLOSED rooted proof is
 * exactly an assumption-leaf graft of one accepted K1d3 OPEN instance.
 *
 * Replacement Support is never interpreted here. The independent CLOSED K1
 * replay is the sole proof-law selector and authority for every replacement.
 */
export function replayStructuralHeterogeneousDerivedClosedRootedInstance(
  memory: ReadMemory,
  evidence: StructuralHeterogeneousDerivedClosedRootedInstanceEvidence,
): StructuralHeterogeneousDerivedClosedRootedInstanceReplayResult {
  const before = memory.linkCount;
  try {
    let openReplay: ReturnType<typeof replayStructuralHeterogeneousDerivedOpenRootedInstance>;
    try {
      openReplay = replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, evidence.open);
    } catch (error) {
      if (error instanceof StructuralHeterogeneousDerivedOpenRootedInstanceReplayError) {
        if (error.code === "replay-wrote") fail("replay-wrote");
        fail("invalid-open-instance");
      }
      throw error;
    }

    let closedReplay: ReturnType<typeof replayStructuralRootedProofAset>;
    try {
      closedReplay = replayStructuralRootedProofAset(memory, evidence.closedRoot);
    } catch (error) {
      if (error instanceof StructuralRootedProofAsetReplayError) {
        if (error.code === "replay-wrote") fail("replay-wrote");
        fail("invalid-closed-rooted-proof");
      }
      throw error;
    }

    if (closedReplay.theory !== openReplay.theory) fail("theory-mismatch");
    const theory = openReplay.theory;

    let openIdentity: LinkHandle;
    let openTargetOccurrence: LinkHandle;
    let closedIdentity: LinkHandle;
    let closedTargetOccurrence: LinkHandle;
    try {
      ({ start: openIdentity, end: openTargetOccurrence } = memory.poles(evidence.open.concreteRoot));
      ({ start: closedIdentity, end: closedTargetOccurrence } = memory.poles(evidence.closedRoot));
    } catch (error) {
      if (error instanceof MemoryError) fail("invalid-occurrence-pair");
      throw error;
    }
    if (openTargetOccurrence !== openReplay.concreteTargetOccurrence) fail("invalid-open-instance");
    if (
      closedIdentity !== closedReplay.targetIdentity
      || closedTargetOccurrence !== closedReplay.targetOccurrence
    ) {
      fail("invalid-closed-rooted-proof");
    }

    let openTargetDR: LinkHandle;
    let openTheory: LinkHandle;
    let closedTargetDR: LinkHandle;
    let closedTheory: LinkHandle;
    try {
      ({ start: openTargetDR, end: openTheory } = memory.poles(openIdentity));
      ({ start: closedTargetDR, end: closedTheory } = memory.poles(closedIdentity));
    } catch (error) {
      if (error instanceof MemoryError) fail("invalid-occurrence-pair");
      throw error;
    }
    if (openTheory !== theory || closedTheory !== theory) fail("theory-mismatch");

    const openTargetSchema = derivation(memory, openTargetDR);
    const closedTargetSchema = derivation(memory, closedTargetDR);
    const openTargetRule = rule(memory, openTargetSchema.structuralRule);
    const closedTargetRule = rule(memory, closedTargetSchema.structuralRule);

    if (roles(memory, closedTargetRule.roleDictionary).length !== 0) fail("non-closed-target");
    if (closedTargetSchema.premiseTemplates.length !== 0) fail("non-closed-target");
    if (closedTargetSchema.structuralRule !== openTargetSchema.structuralRule) {
      fail("target-rule-mismatch");
    }
    if (
      closedTargetRule.body !== openTargetRule.body
      || closedReplay.conclusion !== openTargetRule.body
    ) {
      fail("conclusion-mismatch");
    }

    const openPremises = new Set(openTargetSchema.premiseTemplates);
    const openToClosed = new Map<LinkHandle, LinkHandle>();
    const discharged = new Set<LinkHandle>();
    const structural = new Set<LinkHandle>();

    const pairOccurrence = (openOccurrence: LinkHandle, closedOccurrence: LinkHandle): void => {
      const previous = openToClosed.get(openOccurrence);
      if (previous !== undefined) {
        if (previous !== closedOccurrence) fail("inconsistent-correspondence");
        return;
      }
      openToClosed.set(openOccurrence, closedOccurrence);

      let openClaim: LinkHandle;
      let openSupport: LinkHandle;
      let closedClaim: LinkHandle;
      let closedSupport: LinkHandle;
      try {
        ({ start: openClaim, end: openSupport } = memory.poles(openOccurrence));
        ({ start: closedClaim, end: closedSupport } = memory.poles(closedOccurrence));
      } catch (error) {
        if (error instanceof MemoryError) fail("invalid-occurrence-pair");
        throw error;
      }

      if (openClaim !== closedClaim) fail("claim-mismatch");

      if (openSupport === openIdentity && openPremises.has(openClaim)) {
        discharged.add(openOccurrence);
        // Deliberately do not inspect closedSupport. Its proof law has already
        // been accepted by replayStructuralRootedProofAset(closedRoot).
        void closedSupport;
        return;
      }

      structural.add(openOccurrence);
      let openDR: LinkHandle;
      let openDependencySequence: LinkHandle;
      let closedDR: LinkHandle;
      let closedDependencySequence: LinkHandle;
      try {
        ({ start: openDR, end: openDependencySequence } = memory.poles(openSupport));
        ({ start: closedDR, end: closedDependencySequence } = memory.poles(closedSupport));
      } catch (error) {
        if (error instanceof MemoryError) fail("invalid-occurrence-pair");
        throw error;
      }
      if (openDR !== closedDR) fail("derivation-rule-mismatch");

      const openDependencies = sequence(memory, openDependencySequence);
      const closedDependencies = sequence(memory, closedDependencySequence);
      if (openDependencies.length !== closedDependencies.length) fail("dependency-arity-mismatch");

      openDependencies.forEach((openDependency, index) => {
        const closedDependency = closedDependencies[index];
        if (closedDependency === undefined) fail("dependency-arity-mismatch");
        pairOccurrence(openDependency, closedDependency);
      });
    };

    pairOccurrence(openTargetOccurrence, closedTargetOccurrence);

    return Object.freeze({
      theory,
      genericIdentity: openReplay.genericIdentity,
      openRoot: evidence.open.concreteRoot,
      closedRoot: evidence.closedRoot,
      conclusion: closedReplay.conclusion,
      globalRoleDictionary: openReplay.globalRoleDictionary,
      bindings: openReplay.bindings,
      dischargedAssumptionCount: discharged.size,
      pairedStructuralOccurrenceCount: structural.size,
    });
  } finally {
    if (memory.linkCount !== before) fail("replay-wrote");
  }
}
