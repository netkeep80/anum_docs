import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "./exact-sequence.js";
import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
  type WriteMemory,
} from "./memory.js";
import { StateError, readContext } from "./state.js";
import {
  StructuralRuleError,
  matchStructuralTemplate,
  replayStructuralRule,
  type StructuralRuleReplayEvidence,
  type StructuralRuleReplayResult,
} from "./structural-rule.js";

export interface StructuralJudgment {
  readonly theory: LinkHandle;
  readonly context: LinkHandle;
  readonly claim: LinkHandle;
}

export interface StructuralJudgmentEvidence {
  readonly application: StructuralRuleReplayEvidence;
  readonly judgment: StructuralJudgment;
}

export interface StructuralJudgmentReplayResult {
  readonly judgment: StructuralJudgment;
  readonly application: StructuralRuleReplayResult;
}

export type StructuralJudgmentReplayErrorCode =
  | "invalid-judgment-evidence"
  | "invalid-judgment-context"
  | "invalid-rule-application"
  | "judgment-theory-mismatch"
  | "judgment-context-mismatch"
  | "judgment-claim-mismatch";

export class StructuralJudgmentReplayError extends Error {
  override readonly name = "StructuralJudgmentReplayError";

  constructor(readonly code: StructuralJudgmentReplayErrorCode) {
    super(code);
  }
}

function fail(code: StructuralJudgmentReplayErrorCode): never {
  throw new StructuralJudgmentReplayError(code);
}

/**
 * Generic one-step mathematical judgment replay.
 *
 * The Rule semantics remain entirely in replayStructuralRule. This layer only
 * binds the verified application to an explicit (Theory, Context, Claim)
 * selection. Premise/dependency semantics intentionally belong to the later
 * derivation layer rather than being inferred from host ordering here.
 */
export function replayStructuralJudgment(
  memory: ReadMemory,
  evidence: StructuralJudgmentEvidence,
): StructuralJudgmentReplayResult {
  const beforeCount = memory.linkCount;
  try {
    try {
      memory.poles(evidence.judgment.theory);
      memory.poles(evidence.judgment.claim);
    } catch (error) {
      if (error instanceof MemoryError) {
        fail("invalid-judgment-evidence");
      }
      throw error;
    }

    try {
      readContext(memory, evidence.judgment.context);
    } catch (error) {
      if (error instanceof StateError || error instanceof MemoryError) {
        fail("invalid-judgment-context");
      }
      throw error;
    }

    let application: StructuralRuleReplayResult;
    try {
      application = replayStructuralRule(memory, evidence.application);
    } catch (error) {
      if (error instanceof StructuralRuleError || error instanceof MemoryError) {
        fail("invalid-rule-application");
      }
      throw error;
    }

    if (application.interpreterStructure.theory !== evidence.judgment.theory) {
      fail("judgment-theory-mismatch");
    }
    if (application.afterContext !== evidence.judgment.context) {
      fail("judgment-context-mismatch");
    }
    if (application.claimedBody !== evidence.judgment.claim) {
      fail("judgment-claim-mismatch");
    }
    if (memory.linkCount !== beforeCount) {
      fail("invalid-judgment-evidence");
    }

    return Object.freeze({
      judgment: Object.freeze({ ...evidence.judgment }),
      application,
    });
  } catch (error) {
    if (error instanceof StructuralJudgmentReplayError) throw error;
    if (error instanceof MemoryError) {
      throw new StructuralJudgmentReplayError("invalid-judgment-evidence");
    }
    throw error;
  } finally {
    if (memory.linkCount !== beforeCount) {
      throw new StructuralJudgmentReplayError("invalid-judgment-evidence");
    }
  }
}

export interface StructuralProofOccurrence {
  readonly act: LinkHandle;
  readonly claim: LinkHandle;
}

export interface StructuralDerivationRule {
  readonly structuralRule: LinkHandle;
  readonly premiseTemplateSequence: LinkHandle;
  readonly premiseTemplates: readonly LinkHandle[];
}

export interface StructuralDerivationNodeEvidence {
  readonly occurrence: LinkHandle;
  readonly judgment: StructuralJudgmentEvidence;
  readonly derivationRule: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
  readonly premiseOccurrenceSequence: LinkHandle;
}

export interface StructuralDerivationEvidence {
  readonly theory: LinkHandle;
  readonly targetOccurrence: LinkHandle;
  /** Transport only: proof identity/dependencies come from structural Links. */
  readonly nodes: readonly StructuralDerivationNodeEvidence[];
}

export interface StructuralDerivationReplayResult {
  readonly theory: LinkHandle;
  readonly targetOccurrence: LinkHandle;
  readonly target: StructuralJudgmentReplayResult;
  readonly occurrenceCount: number;
}

export type StructuralDerivationReplayErrorCode =
  | "invalid-derivation-evidence"
  | "duplicate-occurrence"
  | "target-occurrence-not-found"
  | "invalid-node-judgment"
  | "cross-theory-node"
  | "occurrence-mismatch"
  | "invalid-derivation-rule"
  | "derivation-rule-mismatch"
  | "derivation-rule-not-admitted"
  | "missing-premise"
  | "extra-premise"
  | "dependency-occurrence-not-found"
  | "premise-claim-mismatch"
  | "cyclic-dependency"
  | "unreachable-node"
  | "derivation-replay-wrote";

export class StructuralDerivationReplayError extends Error {
  override readonly name = "StructuralDerivationReplayError";

  constructor(readonly code: StructuralDerivationReplayErrorCode) {
    super(code);
  }
}

function derivationFail(code: StructuralDerivationReplayErrorCode): never {
  throw new StructuralDerivationReplayError(code);
}

/** Proof-history occurrence. Claim identity remains independent of proof history. */
export function defineStructuralProofOccurrence(
  memory: WriteMemory,
  act: LinkHandle,
  claim: LinkHandle,
): LinkHandle {
  return memory.ensure(act, claim);
}

export function readStructuralProofOccurrence(
  memory: ReadMemory,
  occurrence: LinkHandle,
): StructuralProofOccurrence {
  try {
    const poles = memory.poles(occurrence);
    return Object.freeze({ act: poles.start, claim: poles.end });
  } catch (error) {
    if (error instanceof MemoryError) {
      throw new StructuralDerivationReplayError("invalid-derivation-evidence");
    }
    throw error;
  }
}

/**
 * Extends an existing StructuralRule with explicit premise templates. The
 * conclusion matcher remains the existing StructuralRule/replay kernel.
 */
export function defineStructuralDerivationRule(
  memory: WriteMemory,
  structuralRule: LinkHandle,
  premiseTemplates: readonly LinkHandle[],
): LinkHandle {
  const premiseTemplateSequence = materializeExactSequence(memory, premiseTemplates);
  return memory.ensure(structuralRule, premiseTemplateSequence);
}

export function readStructuralDerivationRule(
  memory: ReadMemory,
  derivationRule: LinkHandle,
): StructuralDerivationRule {
  try {
    const poles = memory.poles(derivationRule);
    const sequence = readExactSequence(memory, poles.end);
    return Object.freeze({
      structuralRule: poles.start,
      premiseTemplateSequence: poles.end,
      premiseTemplates: Object.freeze([...sequence.values]),
    });
  } catch (error) {
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
      throw new StructuralDerivationReplayError("invalid-derivation-rule");
    }
    throw error;
  }
}

export function admitStructuralDerivationRule(
  memory: WriteMemory,
  theory: LinkHandle,
  derivationRule: LinkHandle,
): LinkHandle {
  return memory.ensure(theory, derivationRule);
}

function verifyStructuralDerivationRuleAdmission(
  memory: ReadMemory,
  theory: LinkHandle,
  derivationRule: LinkHandle,
  admission: LinkHandle,
): void {
  try {
    const poles = memory.poles(admission);
    if (poles.start !== theory || poles.end !== derivationRule) {
      derivationFail("derivation-rule-not-admitted");
    }
  } catch (error) {
    if (error instanceof StructuralDerivationReplayError) throw error;
    if (error instanceof MemoryError) {
      derivationFail("derivation-rule-not-admitted");
    }
    throw error;
  }
}

interface VerifiedDerivationNode {
  readonly evidence: StructuralDerivationNodeEvidence;
  readonly judgment: StructuralJudgmentReplayResult;
  readonly premiseOccurrences: readonly LinkHandle[];
  readonly premiseTemplates: readonly LinkHandle[];
}

/**
 * Read-only replay of the exact dependency closure selected by targetOccurrence.
 * `nodes[]` is transport only: it is indexed by structural ProofOccurrence Links,
 * while premise order comes from two structural ExactSequence values.
 */
export function replayStructuralDerivation(
  memory: ReadMemory,
  evidence: StructuralDerivationEvidence,
): StructuralDerivationReplayResult {
  const beforeCount = memory.linkCount;
  try {
    try {
      memory.poles(evidence.theory);
      memory.poles(evidence.targetOccurrence);
    } catch (error) {
      if (error instanceof MemoryError) {
        derivationFail("invalid-derivation-evidence");
      }
      throw error;
    }

    const nodes = new Map<LinkHandle, StructuralDerivationNodeEvidence>();
    for (const node of evidence.nodes) {
      try {
        memory.poles(node.occurrence);
      } catch (error) {
        if (error instanceof MemoryError) {
          derivationFail("invalid-derivation-evidence");
        }
        throw error;
      }
      if (nodes.has(node.occurrence)) {
        derivationFail("duplicate-occurrence");
      }
      nodes.set(node.occurrence, node);
    }

    if (!nodes.has(evidence.targetOccurrence)) {
      derivationFail("target-occurrence-not-found");
    }

    const active = new Set<LinkHandle>();
    const verified = new Map<LinkHandle, VerifiedDerivationNode>();

    const verifyNode = (occurrence: LinkHandle): VerifiedDerivationNode => {
      const cached = verified.get(occurrence);
      if (cached !== undefined) return cached;
      if (active.has(occurrence)) {
        derivationFail("cyclic-dependency");
      }

      const node = nodes.get(occurrence);
      if (node === undefined) {
        try {
          memory.poles(occurrence);
        } catch (error) {
          if (error instanceof MemoryError) {
            derivationFail("invalid-derivation-evidence");
          }
          throw error;
        }
        derivationFail("dependency-occurrence-not-found");
      }

      active.add(occurrence);
      try {
        let judgment: StructuralJudgmentReplayResult;
        try {
          judgment = replayStructuralJudgment(memory, node.judgment);
        } catch (error) {
          if (error instanceof StructuralJudgmentReplayError || error instanceof MemoryError) {
            derivationFail("invalid-node-judgment");
          }
          throw error;
        }

        if (judgment.judgment.theory !== evidence.theory) {
          derivationFail("cross-theory-node");
        }

        const occurrenceStructure = readStructuralProofOccurrence(memory, occurrence);
        if (
          occurrenceStructure.act !== node.judgment.application.act ||
          occurrenceStructure.claim !== judgment.judgment.claim
        ) {
          derivationFail("occurrence-mismatch");
        }

        const derivationRule = readStructuralDerivationRule(memory, node.derivationRule);
        if (derivationRule.structuralRule !== node.judgment.application.rule) {
          derivationFail("derivation-rule-mismatch");
        }
        verifyStructuralDerivationRuleAdmission(
          memory,
          evidence.theory,
          node.derivationRule,
          node.derivationRuleAdmission,
        );

        let premiseOccurrences: readonly LinkHandle[];
        try {
          premiseOccurrences = Object.freeze([
            ...readExactSequence(memory, node.premiseOccurrenceSequence).values,
          ]);
        } catch (error) {
          if (error instanceof ExactSequenceError || error instanceof MemoryError) {
            derivationFail("invalid-derivation-evidence");
          }
          throw error;
        }

        if (premiseOccurrences.length < derivationRule.premiseTemplates.length) {
          derivationFail("missing-premise");
        }
        if (premiseOccurrences.length > derivationRule.premiseTemplates.length) {
          derivationFail("extra-premise");
        }

        premiseOccurrences.forEach((dependencyOccurrence, index) => {
          try {
            memory.poles(dependencyOccurrence);
          } catch (error) {
            if (error instanceof MemoryError) {
              derivationFail("invalid-derivation-evidence");
            }
            throw error;
          }

          const dependency = verifyNode(dependencyOccurrence);
          const template = derivationRule.premiseTemplates[index];
          if (template === undefined) {
            derivationFail("extra-premise");
          }
          try {
            matchStructuralTemplate(
              memory,
              template,
              dependency.judgment.judgment.claim,
              judgment.application.bindings,
            );
          } catch (error) {
            if (error instanceof StructuralRuleError || error instanceof MemoryError) {
              derivationFail("premise-claim-mismatch");
            }
            throw error;
          }
        });

        const result: VerifiedDerivationNode = Object.freeze({
          evidence: node,
          judgment,
          premiseOccurrences,
          premiseTemplates: derivationRule.premiseTemplates,
        });
        verified.set(occurrence, result);
        return result;
      } finally {
        active.delete(occurrence);
      }
    };

    const target = verifyNode(evidence.targetOccurrence);
    if (verified.size !== nodes.size) {
      derivationFail("unreachable-node");
    }
    if (memory.linkCount !== beforeCount) {
      derivationFail("derivation-replay-wrote");
    }

    return Object.freeze({
      theory: evidence.theory,
      targetOccurrence: evidence.targetOccurrence,
      target: target.judgment,
      occurrenceCount: verified.size,
    });
  } catch (error) {
    if (error instanceof StructuralDerivationReplayError) throw error;
    if (error instanceof MemoryError || error instanceof ExactSequenceError) {
      throw new StructuralDerivationReplayError("invalid-derivation-evidence");
    }
    throw error;
  } finally {
    if (memory.linkCount !== beforeCount) {
      throw new StructuralDerivationReplayError("derivation-replay-wrote");
    }
  }
}
