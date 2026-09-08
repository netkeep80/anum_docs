import { ExactSequenceError, readExactSequence } from "./exact-sequence.js";
import {
  StructuralDerivationReplayError,
  readStructuralDerivationRule,
} from "./derivation.js";
import { MemoryError, type LinkHandle, type ReadMemory } from "./memory.js";
import {
  StructuralRuleError,
  readStructuralRoleDictionary,
  readStructuralRule,
} from "./structural-rule.js";
import {
  StructuralRoleMorphismError,
  replayStructuralRoleMorphism,
  verifyStructuralRoleMorphismMapping,
} from "./structural-role-morphism.js";

export interface StructuralHeterogeneousDerivedDerivationEvidence {
  readonly identity: LinkHandle;
  readonly targetOccurrence: LinkHandle;
}

export interface StructuralHeterogeneousDerivedDerivationReplayResult {
  readonly theory: LinkHandle;
  readonly targetDerivationRule: LinkHandle;
  readonly globalRoleDictionary: LinkHandle;
  readonly conclusionTemplate: LinkHandle;
  readonly occurrenceCount: number;
  readonly declaredAssumptionCount: number;
  readonly usedAssumptionCount: number;
}

export type StructuralHeterogeneousDerivedDerivationReplayErrorCode =
  | "invalid-identity"
  | "invalid-target-schema"
  | "invalid-generic-occurrence"
  | "ambiguous-generic-support"
  | "unused-assumption"
  | "replay-wrote";

export class StructuralHeterogeneousDerivedDerivationReplayError extends Error {
  override readonly name = "StructuralHeterogeneousDerivedDerivationReplayError";

  constructor(readonly code: StructuralHeterogeneousDerivedDerivationReplayErrorCode) {
    super(code);
  }
}

function fail(code: StructuralHeterogeneousDerivedDerivationReplayErrorCode): never {
  throw new StructuralHeterogeneousDerivedDerivationReplayError(code);
}

function targetSchema(memory: ReadMemory, derivationRule: LinkHandle) {
  try {
    const schema = readStructuralDerivationRule(memory, derivationRule);
    const rule = readStructuralRule(memory, schema.structuralRule);
    const roles = readStructuralRoleDictionary(memory, rule.roleDictionary).roles;
    return Object.freeze({ schema, rule, roles });
  } catch (error) {
    if (
      error instanceof StructuralDerivationReplayError
      || error instanceof StructuralRuleError
      || error instanceof MemoryError
    ) {
      fail("invalid-target-schema");
    }
    throw error;
  }
}

function nodeSchema(memory: ReadMemory, derivationRule: LinkHandle) {
  try {
    const schema = readStructuralDerivationRule(memory, derivationRule);
    const rule = readStructuralRule(memory, schema.structuralRule);
    const roles = readStructuralRoleDictionary(memory, rule.roleDictionary).roles;
    return Object.freeze({ schema, rule, roles });
  } catch (error) {
    if (
      error instanceof StructuralDerivationReplayError
      || error instanceof StructuralRuleError
      || error instanceof MemoryError
    ) {
      fail("invalid-generic-occurrence");
    }
    throw error;
  }
}

function dependencies(memory: ReadMemory, sequence: LinkHandle): readonly LinkHandle[] {
  try {
    return readExactSequence(memory, sequence).values;
  } catch (error) {
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
      fail("invalid-generic-occurrence");
    }
    throw error;
  }
}

function roleOccursInTemplate(
  memory: ReadMemory,
  template: LinkHandle,
  role: LinkHandle,
): boolean {
  const memo = new Map<LinkHandle, boolean>();
  const active = new Set<LinkHandle>();

  const walk = (link: LinkHandle): boolean => {
    if (link === role) return true;
    const cached = memo.get(link);
    if (cached !== undefined) return cached;
    if (active.has(link)) return false;
    active.add(link);
    try {
      let poles: ReturnType<ReadMemory["poles"]>;
      try {
        poles = memory.poles(link);
      } catch (error) {
        if (error instanceof MemoryError) return false;
        throw error;
      }
      const found = walk(poles.start) || walk(poles.end);
      memo.set(link, found);
      return found;
    } finally {
      active.delete(link);
    }
  };

  return walk(template);
}

function localRolesObservable(
  memory: ReadMemory,
  roles: readonly LinkHandle[],
  premiseTemplates: readonly LinkHandle[],
  conclusionTemplate: LinkHandle,
): boolean {
  return roles.every((role) =>
    roleOccursInTemplate(memory, conclusionTemplate, role)
    || premiseTemplates.some((template) => roleOccursInTemplate(memory, template, role)),
  );
}

export function replayStructuralHeterogeneousDerivedDerivationSchema(
  memory: ReadMemory,
  evidence: StructuralHeterogeneousDerivedDerivationEvidence,
): StructuralHeterogeneousDerivedDerivationReplayResult {
  const before = memory.linkCount;
  try {
    let targetDerivationRule: LinkHandle;
    let theory: LinkHandle;
    try {
      ({ start: targetDerivationRule, end: theory } = memory.poles(evidence.identity));
    } catch (error) {
      if (error instanceof MemoryError) fail("invalid-identity");
      throw error;
    }

    const target = targetSchema(memory, targetDerivationRule);
    const globalDictionary = target.rule.roleDictionary;
    const globalRoles = target.roles;
    const targetPremises = target.schema.premiseTemplates;
    if (new Set(targetPremises).size !== targetPremises.length) fail("invalid-target-schema");
    const targetPremiseSet = new Set(targetPremises);

    const verified = new Map<LinkHandle, LinkHandle>();
    const usedPremises = new Set<LinkHandle>();
    const active = new Set<LinkHandle>();

    const restoreVerified = (snapshot: ReadonlyMap<LinkHandle, LinkHandle>): void => {
      verified.clear();
      for (const [occurrence, template] of snapshot) verified.set(occurrence, template);
    };

    const restoreUsedPremises = (snapshot: ReadonlySet<LinkHandle>): void => {
      usedPremises.clear();
      for (const premise of snapshot) usedPremises.add(premise);
    };

    const attemptAssumption = (occurrence: LinkHandle): LinkHandle | undefined => {
      try {
        const poles = memory.poles(occurrence);
        if (poles.end !== evidence.identity || !targetPremiseSet.has(poles.start)) return undefined;
        return poles.start;
      } catch (error) {
        if (error instanceof MemoryError) return undefined;
        throw error;
      }
    };

    const verifyNode = (occurrence: LinkHandle): LinkHandle => {
      const cached = verified.get(occurrence);
      if (cached !== undefined) return cached;
      if (active.has(occurrence)) fail("invalid-generic-occurrence");
      active.add(occurrence);
      try {
        let globalConclusionTemplate: LinkHandle;
        let application: LinkHandle;
        try {
          ({ start: globalConclusionTemplate, end: application } = memory.poles(occurrence));
        } catch (error) {
          if (error instanceof MemoryError) fail("invalid-generic-occurrence");
          throw error;
        }

        let localDerivationRule: LinkHandle;
        let scopedApplication: LinkHandle;
        try {
          ({ start: localDerivationRule, end: scopedApplication } = memory.poles(application));
        } catch (error) {
          if (error instanceof MemoryError) fail("invalid-generic-occurrence");
          throw error;
        }

        let morphism: LinkHandle;
        let dependencySequence: LinkHandle;
        try {
          ({ start: morphism, end: dependencySequence } = memory.poles(scopedApplication));
        } catch (error) {
          if (error instanceof MemoryError) fail("invalid-generic-occurrence");
          throw error;
        }

        const local = nodeSchema(memory, localDerivationRule);
        if (memory.find(theory, local.schema.structuralRule) === undefined) {
          fail("invalid-generic-occurrence");
        }
        if (memory.find(theory, localDerivationRule) === undefined) {
          fail("invalid-generic-occurrence");
        }
        if (!localRolesObservable(
          memory,
          local.roles,
          local.schema.premiseTemplates,
          local.rule.body,
        )) {
          fail("invalid-generic-occurrence");
        }

        let mu: ReturnType<typeof replayStructuralRoleMorphism>;
        try {
          mu = replayStructuralRoleMorphism(memory, morphism, {
            theory,
            sourceDictionary: local.rule.roleDictionary,
            targetDictionary: globalDictionary,
            sourceRoles: local.roles,
            targetRoles: globalRoles,
          });
        } catch (error) {
          if (error instanceof StructuralRoleMorphismError) {
            if (error.code === "replay-wrote") fail("replay-wrote");
            fail("invalid-generic-occurrence");
          }
          throw error;
        }

        const dependencyOccurrences = dependencies(memory, dependencySequence);
        if (dependencyOccurrences.length !== local.schema.premiseTemplates.length) {
          fail("invalid-generic-occurrence");
        }

        dependencyOccurrences.forEach((dependencyOccurrence, index) => {
          const localPremise = local.schema.premiseTemplates[index];
          if (localPremise === undefined) fail("invalid-generic-occurrence");
          const globalPremise = verifyOccurrence(dependencyOccurrence);
          try {
            verifyStructuralRoleMorphismMapping(
              memory,
              localPremise,
              globalPremise,
              mu.bindings,
              globalRoles,
            );
          } catch (error) {
            if (error instanceof StructuralRoleMorphismError) {
              if (error.code === "replay-wrote") fail("replay-wrote");
              fail("invalid-generic-occurrence");
            }
            throw error;
          }
        });

        try {
          verifyStructuralRoleMorphismMapping(
            memory,
            local.rule.body,
            globalConclusionTemplate,
            mu.bindings,
            globalRoles,
          );
        } catch (error) {
          if (error instanceof StructuralRoleMorphismError) {
            if (error.code === "replay-wrote") fail("replay-wrote");
            fail("invalid-generic-occurrence");
          }
          throw error;
        }

        verified.set(occurrence, globalConclusionTemplate);
        return globalConclusionTemplate;
      } finally {
        active.delete(occurrence);
      }
    };

    const attemptNode = (occurrence: LinkHandle): LinkHandle | undefined => {
      const verifiedBefore = new Map(verified);
      const usedBefore = new Set(usedPremises);
      try {
        return verifyNode(occurrence);
      } catch (error) {
        if (
          error instanceof StructuralHeterogeneousDerivedDerivationReplayError
          && error.code !== "replay-wrote"
        ) {
          restoreVerified(verifiedBefore);
          restoreUsedPremises(usedBefore);
          return undefined;
        }
        throw error;
      }
    };

    function verifyOccurrence(occurrence: LinkHandle): LinkHandle {
      const assumptionTemplate = attemptAssumption(occurrence);
      const verifiedBeforeNode = new Map(verified);
      const usedBeforeNode = new Set(usedPremises);
      const nodeTemplate = attemptNode(occurrence);

      const validTemplates: LinkHandle[] = [];
      if (assumptionTemplate !== undefined) validTemplates.push(assumptionTemplate);
      if (nodeTemplate !== undefined) validTemplates.push(nodeTemplate);

      if (validTemplates.length === 0) fail("invalid-generic-occurrence");
      if (validTemplates.length > 1) {
        restoreVerified(verifiedBeforeNode);
        restoreUsedPremises(usedBeforeNode);
        fail("ambiguous-generic-support");
      }

      if (assumptionTemplate !== undefined) {
        restoreVerified(verifiedBeforeNode);
        restoreUsedPremises(usedBeforeNode);
        usedPremises.add(assumptionTemplate);
        return assumptionTemplate;
      }

      const template = validTemplates[0];
      if (template === undefined) fail("invalid-generic-occurrence");
      return template;
    }

    const conclusionTemplate = verifyOccurrence(evidence.targetOccurrence);
    if (conclusionTemplate !== target.rule.body) fail("invalid-generic-occurrence");
    if (usedPremises.size !== targetPremises.length) fail("unused-assumption");

    return Object.freeze({
      theory,
      targetDerivationRule,
      globalRoleDictionary: globalDictionary,
      conclusionTemplate,
      occurrenceCount: verified.size,
      declaredAssumptionCount: targetPremises.length,
      usedAssumptionCount: usedPremises.size,
    });
  } finally {
    if (memory.linkCount !== before) fail("replay-wrote");
  }
}
