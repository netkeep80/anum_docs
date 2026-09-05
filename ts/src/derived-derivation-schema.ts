import {
  ExactSequenceError,
  readExactSequence,
} from "./exact-sequence.js";
import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
} from "./memory.js";
import {
  readStructuralRoleDictionary,
  readStructuralRule,
} from "./structural-rule.js";
import { readStructuralDerivationRule } from "./derivation.js";

export interface StructuralDerivedDerivationAssumptionEvidence {
  readonly occurrence: LinkHandle;
  readonly template: LinkHandle;
}

export interface StructuralDerivedDerivationNodeEvidence {
  readonly occurrence: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly ruleAdmission: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
  readonly premiseOccurrenceSequence: LinkHandle;
}

export interface StructuralDerivedDerivationEvidence {
  readonly identity: LinkHandle;
  readonly targetOccurrence: LinkHandle;
  readonly assumptions: readonly StructuralDerivedDerivationAssumptionEvidence[];
  readonly nodes: readonly StructuralDerivedDerivationNodeEvidence[];
}

export interface StructuralDerivedDerivationReplayResult {
  readonly theory: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly conclusionTemplate: LinkHandle;
  readonly occurrenceCount: number;
}

export type StructuralDerivedDerivationReplayErrorCode =
  | "invalid-identity"
  | "invalid-target-schema"
  | "target-assumption-mismatch"
  | "invalid-assumption-occurrence"
  | "duplicate-occurrence"
  | "target-occurrence-not-found"
  | "invalid-node"
  | "occurrence-mismatch"
  | "rule-not-admitted"
  | "derivation-rule-not-admitted"
  | "role-dictionary-mismatch"
  | "premise-count-mismatch"
  | "missing-dependency"
  | "premise-template-mismatch"
  | "target-conclusion-mismatch"
  | "cyclic-dependency"
  | "unreachable-node"
  | "unused-assumption"
  | "replay-wrote";

export class StructuralDerivedDerivationReplayError extends Error {
  override readonly name = "StructuralDerivedDerivationReplayError";

  constructor(readonly code: StructuralDerivedDerivationReplayErrorCode) {
    super(code);
  }
}

function replayFail(code: StructuralDerivedDerivationReplayErrorCode): never {
  throw new StructuralDerivedDerivationReplayError(code);
}

function verifyAdmission(
  memory: ReadMemory,
  admission: LinkHandle,
  theory: LinkHandle,
  target: LinkHandle,
  errorCode: "rule-not-admitted" | "derivation-rule-not-admitted",
): void {
  try {
    const poles = memory.poles(admission);
    if (poles.start !== theory || poles.end !== target) replayFail(errorCode);
  } catch (error) {
    if (error instanceof StructuralDerivedDerivationReplayError) throw error;
    if (error instanceof MemoryError) replayFail(errorCode);
    throw error;
  }
}

/**
 * Replays a proof-carrying StructuralDerivationRule directly at the template
 * level. The first slice deliberately requires one exact shared RoleDictionary
 * and never materializes an Act, Context or concrete role binding.
 *
 * The derived identity is incoming proof metadata `DR -> Theory`; primitive
 * authority remains only the explicitly verified `Theory -> Rule/DR`
 * admissions of each proof node. This function is read-only and never promotes
 * the derived DR into Theory authority.
 */
export function replayStructuralDerivedDerivationSchema(
  memory: ReadMemory,
  evidence: StructuralDerivedDerivationEvidence,
): StructuralDerivedDerivationReplayResult {
  const before = memory.linkCount;

  try {
    let targetDerivationRule: LinkHandle;
    let theory: LinkHandle;
    try {
      const identity = memory.poles(evidence.identity);
      targetDerivationRule = identity.start;
      theory = identity.end;
    } catch (error) {
      if (error instanceof MemoryError) replayFail("invalid-identity");
      throw error;
    }

    let targetSchema: ReturnType<typeof readStructuralDerivationRule>;
    let targetRule: ReturnType<typeof readStructuralRule>;
    try {
      targetSchema = readStructuralDerivationRule(memory, targetDerivationRule);
      targetRule = readStructuralRule(memory, targetSchema.structuralRule);
      readStructuralRoleDictionary(memory, targetRule.roleDictionary);
    } catch {
      replayFail("invalid-target-schema");
    }

    if (evidence.assumptions.length !== targetSchema.premiseTemplates.length) {
      replayFail("target-assumption-mismatch");
    }

    const assumptions = new Map<LinkHandle, LinkHandle>();
    evidence.assumptions.forEach((assumption, index) => {
      const expected = targetSchema.premiseTemplates[index];
      if (expected === undefined || assumption.template !== expected) {
        replayFail("target-assumption-mismatch");
      }
      if (assumptions.has(assumption.occurrence)) replayFail("duplicate-occurrence");

      try {
        const poles = memory.poles(assumption.occurrence);
        if (poles.start !== assumption.template || poles.end !== evidence.identity) {
          replayFail("invalid-assumption-occurrence");
        }
      } catch (error) {
        if (error instanceof StructuralDerivedDerivationReplayError) throw error;
        if (error instanceof MemoryError) replayFail("invalid-assumption-occurrence");
        throw error;
      }

      assumptions.set(assumption.occurrence, assumption.template);
    });

    const nodes = new Map<LinkHandle, StructuralDerivedDerivationNodeEvidence>();
    for (const node of evidence.nodes) {
      if (assumptions.has(node.occurrence) || nodes.has(node.occurrence)) {
        replayFail("duplicate-occurrence");
      }
      nodes.set(node.occurrence, node);
    }
    if (!nodes.has(evidence.targetOccurrence)) replayFail("target-occurrence-not-found");

    const active = new Set<LinkHandle>();
    const verified = new Map<LinkHandle, LinkHandle>();
    const usedAssumptions = new Set<LinkHandle>();

    const verifyNode = (occurrence: LinkHandle): LinkHandle => {
      const cached = verified.get(occurrence);
      if (cached !== undefined) return cached;
      if (active.has(occurrence)) replayFail("cyclic-dependency");

      const node = nodes.get(occurrence);
      if (node === undefined) replayFail("missing-dependency");

      active.add(occurrence);
      try {
        let schema: ReturnType<typeof readStructuralDerivationRule>;
        let rule: ReturnType<typeof readStructuralRule>;
        try {
          schema = readStructuralDerivationRule(memory, node.derivationRule);
          rule = readStructuralRule(memory, schema.structuralRule);
          readStructuralRoleDictionary(memory, rule.roleDictionary);
        } catch {
          replayFail("invalid-node");
        }

        if (rule.roleDictionary !== targetRule.roleDictionary) {
          replayFail("role-dictionary-mismatch");
        }

        verifyAdmission(
          memory,
          node.ruleAdmission,
          theory,
          schema.structuralRule,
          "rule-not-admitted",
        );
        verifyAdmission(
          memory,
          node.derivationRuleAdmission,
          theory,
          node.derivationRule,
          "derivation-rule-not-admitted",
        );

        try {
          const occurrencePoles = memory.poles(node.occurrence);
          if (
            occurrencePoles.start !== node.derivationRule ||
            occurrencePoles.end !== node.premiseOccurrenceSequence
          ) {
            replayFail("occurrence-mismatch");
          }
        } catch (error) {
          if (error instanceof StructuralDerivedDerivationReplayError) throw error;
          if (error instanceof MemoryError) replayFail("occurrence-mismatch");
          throw error;
        }

        let dependencies: readonly LinkHandle[];
        try {
          dependencies = readExactSequence(memory, node.premiseOccurrenceSequence).values;
        } catch (error) {
          if (error instanceof ExactSequenceError || error instanceof MemoryError) {
            replayFail("invalid-node");
          }
          throw error;
        }

        if (dependencies.length !== schema.premiseTemplates.length) {
          replayFail("premise-count-mismatch");
        }

        dependencies.forEach((dependencyOccurrence, index) => {
          const expectedTemplate = schema.premiseTemplates[index];
          if (expectedTemplate === undefined) replayFail("premise-count-mismatch");

          const assumptionTemplate = assumptions.get(dependencyOccurrence);
          let actualTemplate: LinkHandle;
          if (assumptionTemplate !== undefined) {
            usedAssumptions.add(dependencyOccurrence);
            actualTemplate = assumptionTemplate;
          } else if (nodes.has(dependencyOccurrence)) {
            actualTemplate = verifyNode(dependencyOccurrence);
          } else {
            replayFail("missing-dependency");
          }

          if (actualTemplate !== expectedTemplate) {
            replayFail("premise-template-mismatch");
          }
        });

        verified.set(occurrence, rule.body);
        return rule.body;
      } finally {
        active.delete(occurrence);
      }
    };

    const conclusionTemplate = verifyNode(evidence.targetOccurrence);
    if (conclusionTemplate !== targetRule.body) replayFail("target-conclusion-mismatch");
    if (verified.size !== nodes.size) replayFail("unreachable-node");
    if (usedAssumptions.size !== assumptions.size) replayFail("unused-assumption");
    if (memory.linkCount !== before) replayFail("replay-wrote");

    return Object.freeze({
      theory,
      derivationRule: targetDerivationRule,
      conclusionTemplate,
      occurrenceCount: verified.size,
    });
  } catch (error) {
    if (error instanceof StructuralDerivedDerivationReplayError) throw error;
    if (error instanceof MemoryError || error instanceof ExactSequenceError) {
      throw new StructuralDerivedDerivationReplayError("invalid-node");
    }
    throw error;
  } finally {
    if (memory.linkCount !== before) {
      throw new StructuralDerivedDerivationReplayError("replay-wrote");
    }
  }
}
