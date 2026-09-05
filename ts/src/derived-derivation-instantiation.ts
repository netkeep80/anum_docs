import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "./exact-sequence.js";
import {
  MemoryError,
  type LinkHandle,
  type WriteMemory,
} from "./memory.js";
import {
  defineStructuralAssumptionContext,
  defineStructuralProofOccurrence,
  readStructuralDerivationRule,
  type StructuralDerivationNodeEvidence,
  type StructuralDerivationWithAssumptionsEvidence,
} from "./derivation.js";
import {
  readStructuralInterpreter,
  readStructuralRoleDictionary,
  readStructuralRule,
  type StructuralRoleBinding,
} from "./structural-rule.js";
import { defineActField, defineActHeader } from "./structural-readers.js";
import type {
  StructuralDerivedDerivationEvidence,
  StructuralDerivedDerivationNodeEvidence,
} from "./derived-derivation-schema.js";

export type StructuralDerivedDerivationInstantiationErrorCode =
  | "invalid-generic-evidence"
  | "invalid-interpreter"
  | "interpreter-theory-mismatch"
  | "duplicate-role-binding"
  | "undeclared-role-binding"
  | "missing-role-binding"
  | "role-valued-binding"
  | "role-dictionary-mismatch"
  | "duplicate-assumption-claim"
  | "cyclic-template"
  | "missing-dependency"
  | "cyclic-dependency"
  | "unreachable-node";

export class StructuralDerivedDerivationInstantiationError extends Error {
  override readonly name = "StructuralDerivedDerivationInstantiationError";

  constructor(readonly code: StructuralDerivedDerivationInstantiationErrorCode) {
    super(code);
  }
}

export interface StructuralDerivedDerivationInstantiationResult {
  readonly evidence: StructuralDerivationWithAssumptionsEvidence;
  readonly targetClaim: LinkHandle;
  readonly assumptionClaims: readonly LinkHandle[];
}

function fail(code: StructuralDerivedDerivationInstantiationErrorCode): never {
  throw new StructuralDerivedDerivationInstantiationError(code);
}

/**
 * Construction-only expansion of a generic StructuralDerivationRule proof.
 *
 * This function is deliberately not an acceptance boundary. Callers first
 * replay the generic certificate independently and must replay the returned
 * ordinary derivation evidence with the existing trusted derivation replay.
 * Candidate Link writes here carry no theorem authority.
 */
export function instantiateStructuralDerivedDerivationSchema(
  memory: WriteMemory,
  genericEvidence: StructuralDerivedDerivationEvidence,
  interpreter: LinkHandle,
  afterContext: LinkHandle,
  bindings: readonly StructuralRoleBinding[],
): StructuralDerivedDerivationInstantiationResult {
  try {
    const identity = memory.poles(genericEvidence.identity);
    const targetDerivationRule = identity.start;
    const theory = identity.end;
    const targetSchema = readStructuralDerivationRule(memory, targetDerivationRule);
    const targetRule = readStructuralRule(memory, targetSchema.structuralRule);
    const roleDictionary = readStructuralRoleDictionary(memory, targetRule.roleDictionary);

    let interpreterStructure: ReturnType<typeof readStructuralInterpreter>;
    try {
      interpreterStructure = readStructuralInterpreter(memory, interpreter);
    } catch {
      fail("invalid-interpreter");
    }
    if (interpreterStructure.theory !== theory) fail("interpreter-theory-mismatch");

    const roleSet = new Set(roleDictionary.roles);
    const rho = new Map<LinkHandle, LinkHandle>();
    for (const binding of bindings) {
      if (!roleSet.has(binding.role)) fail("undeclared-role-binding");
      if (rho.has(binding.role)) fail("duplicate-role-binding");
      if (roleSet.has(binding.value)) fail("role-valued-binding");
      try {
        memory.poles(binding.value);
      } catch (error) {
        if (error instanceof MemoryError) fail("invalid-generic-evidence");
        throw error;
      }
      rho.set(binding.role, binding.value);
    }
    for (const role of roleDictionary.roles) {
      if (!rho.has(role)) fail("missing-role-binding");
    }

    const orderedBindings = Object.freeze(
      roleDictionary.roles.map((role): StructuralRoleBinding => {
        const value = rho.get(role);
        if (value === undefined) fail("missing-role-binding");
        return Object.freeze({ role, value });
      }),
    );

    const containsMemo = new Map<LinkHandle, boolean>();
    const containsActive = new Set<LinkHandle>();
    const containsRole = (node: LinkHandle): boolean => {
      if (rho.has(node)) return true;
      const cached = containsMemo.get(node);
      if (cached !== undefined) return cached;
      if (containsActive.has(node)) return false;
      containsActive.add(node);
      try {
        const poles = memory.poles(node);
        const result = containsRole(poles.start) || containsRole(poles.end);
        containsMemo.set(node, result);
        return result;
      } finally {
        containsActive.delete(node);
      }
    };

    const instantiatedMemo = new Map<LinkHandle, LinkHandle>();
    const instantiatedActive = new Set<LinkHandle>();
    const instantiateTemplate = (node: LinkHandle): LinkHandle => {
      const replacement = rho.get(node);
      if (replacement !== undefined) return replacement;
      if (!containsRole(node)) return node;
      const cached = instantiatedMemo.get(node);
      if (cached !== undefined) return cached;
      if (instantiatedActive.has(node)) fail("cyclic-template");
      instantiatedActive.add(node);
      try {
        const poles = memory.poles(node);
        const result = memory.ensure(
          instantiateTemplate(poles.start),
          instantiateTemplate(poles.end),
        );
        instantiatedMemo.set(node, result);
        return result;
      } finally {
        instantiatedActive.delete(node);
      }
    };

    if (genericEvidence.assumptions.length !== targetSchema.premiseTemplates.length) {
      fail("invalid-generic-evidence");
    }
    const assumptionClaims = Object.freeze(
      targetSchema.premiseTemplates.map((template, index) => {
        const genericAssumption = genericEvidence.assumptions[index];
        if (genericAssumption === undefined || genericAssumption.template !== template) {
          fail("invalid-generic-evidence");
        }
        return instantiateTemplate(template);
      }),
    );
    if (new Set(assumptionClaims).size !== assumptionClaims.length) {
      fail("duplicate-assumption-claim");
    }

    const assumptionContext = defineStructuralAssumptionContext(memory, theory, assumptionClaims);
    const concreteOccurrences = new Map<LinkHandle, LinkHandle>();
    genericEvidence.assumptions.forEach((assumption, index) => {
      const claim = assumptionClaims[index];
      if (claim === undefined) fail("invalid-generic-evidence");
      const occurrence = memory.find(assumptionContext, claim);
      if (occurrence === undefined) fail("invalid-generic-evidence");
      concreteOccurrences.set(assumption.occurrence, occurrence);
    });

    const genericNodes = new Map<LinkHandle, StructuralDerivedDerivationNodeEvidence>();
    for (const node of genericEvidence.nodes) {
      if (genericNodes.has(node.occurrence) || concreteOccurrences.has(node.occurrence)) {
        fail("invalid-generic-evidence");
      }
      genericNodes.set(node.occurrence, node);
    }

    const concreteNodes = new Map<LinkHandle, StructuralDerivationNodeEvidence>();
    const activeNodes = new Set<LinkHandle>();

    const buildNode = (genericOccurrence: LinkHandle): LinkHandle => {
      const existing = concreteOccurrences.get(genericOccurrence);
      if (existing !== undefined) return existing;
      if (activeNodes.has(genericOccurrence)) fail("cyclic-dependency");

      const node = genericNodes.get(genericOccurrence);
      if (node === undefined) fail("missing-dependency");
      activeNodes.add(genericOccurrence);
      try {
        const schema = readStructuralDerivationRule(memory, node.derivationRule);
        const rule = readStructuralRule(memory, schema.structuralRule);
        if (rule.roleDictionary !== targetRule.roleDictionary) {
          fail("role-dictionary-mismatch");
        }

        const genericDependencies = readExactSequence(
          memory,
          node.premiseOccurrenceSequence,
        ).values;
        const concreteDependencies = genericDependencies.map(buildNode);
        const premiseOccurrenceSequence = materializeExactSequence(
          memory,
          concreteDependencies,
        );

        const claim = instantiateTemplate(rule.body);
        const act = defineActHeader(
          memory,
          interpreter,
          targetRule.roleDictionary,
          afterContext,
        );
        for (const binding of orderedBindings) {
          defineActField(memory, act, binding.role, binding.value);
        }
        const occurrence = defineStructuralProofOccurrence(memory, act, claim);

        const evidence: StructuralDerivationNodeEvidence = Object.freeze({
          occurrence,
          judgment: Object.freeze({
            application: Object.freeze({
              act,
              rule: schema.structuralRule,
              ruleAdmission: node.ruleAdmission,
              claimedBody: claim,
              expectedInterpreter: interpreterStructure,
              expectedAfterContext: afterContext,
            }),
            judgment: Object.freeze({ theory, context: afterContext, claim }),
          }),
          derivationRule: node.derivationRule,
          derivationRuleAdmission: node.derivationRuleAdmission,
          premiseOccurrenceSequence,
        });
        concreteNodes.set(genericOccurrence, evidence);
        concreteOccurrences.set(genericOccurrence, occurrence);
        return occurrence;
      } finally {
        activeNodes.delete(genericOccurrence);
      }
    };

    const targetOccurrence = buildNode(genericEvidence.targetOccurrence);
    if (concreteNodes.size !== genericNodes.size) fail("unreachable-node");
    const targetNode = concreteNodes.get(genericEvidence.targetOccurrence);
    if (targetNode === undefined) fail("invalid-generic-evidence");

    const evidence: StructuralDerivationWithAssumptionsEvidence = Object.freeze({
      derivation: Object.freeze({
        theory,
        targetOccurrence,
        nodes: Object.freeze([...concreteNodes.values()]),
      }),
      assumptionContext,
    });

    return Object.freeze({
      evidence,
      targetClaim: targetNode.judgment.judgment.claim,
      assumptionClaims,
    });
  } catch (error) {
    if (error instanceof StructuralDerivedDerivationInstantiationError) throw error;
    if (error instanceof MemoryError || error instanceof ExactSequenceError) {
      throw new StructuralDerivedDerivationInstantiationError("invalid-generic-evidence");
    }
    throw error;
  }
}
