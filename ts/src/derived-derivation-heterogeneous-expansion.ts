import { ExactSequenceError, materializeExactSequence, readExactSequence } from "./exact-sequence.js";
import {
  StructuralDerivationReplayError,
  defineStructuralDerivationRule,
  readStructuralDerivationRule,
} from "./derivation.js";
import {
  StructuralHeterogeneousDerivedDerivationReplayError,
  replayStructuralHeterogeneousDerivedDerivationSchema,
  type StructuralHeterogeneousDerivedDerivationEvidence,
} from "./derived-derivation-heterogeneous.js";
import { MemoryError, type LinkHandle, type WriteMemory } from "./memory.js";
import {
  StructuralRoleMorphismError,
  replayStructuralRoleMorphism,
} from "./structural-role-morphism.js";
import {
  StructuralRuleError,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRoleDictionary,
  readStructuralRule,
  type StructuralRoleBinding,
} from "./structural-rule.js";

export type StructuralHeterogeneousDerivedOpenRootedExpansionErrorCode =
  | "invalid-generic-certificate"
  | "duplicate-role-binding"
  | "undeclared-role-binding"
  | "missing-role-binding"
  | "invalid-role-binding"
  | "invalid-generic-occurrence"
  | "inconsistent-expansion";

export class StructuralHeterogeneousDerivedOpenRootedExpansionError extends Error {
  override readonly name = "StructuralHeterogeneousDerivedOpenRootedExpansionError";

  constructor(readonly code: StructuralHeterogeneousDerivedOpenRootedExpansionErrorCode) {
    super(code);
  }
}

function fail(code: StructuralHeterogeneousDerivedOpenRootedExpansionErrorCode): never {
  throw new StructuralHeterogeneousDerivedOpenRootedExpansionError(code);
}

function derivation(memory: WriteMemory, handle: LinkHandle) {
  try {
    return readStructuralDerivationRule(memory, handle);
  } catch (error) {
    if (error instanceof StructuralDerivationReplayError || error instanceof MemoryError) {
      fail("invalid-generic-occurrence");
    }
    throw error;
  }
}

function rule(memory: WriteMemory, handle: LinkHandle) {
  try {
    return readStructuralRule(memory, handle);
  } catch (error) {
    if (error instanceof StructuralRuleError || error instanceof MemoryError) {
      fail("invalid-generic-occurrence");
    }
    throw error;
  }
}

function dictionary(memory: WriteMemory, handle: LinkHandle): readonly LinkHandle[] {
  try {
    return readStructuralRoleDictionary(memory, handle).roles;
  } catch (error) {
    if (error instanceof StructuralRuleError || error instanceof MemoryError) {
      fail("invalid-generic-occurrence");
    }
    throw error;
  }
}

function sequence(memory: WriteMemory, handle: LinkHandle): readonly LinkHandle[] {
  try {
    return readExactSequence(memory, handle).values;
  } catch (error) {
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
      fail("invalid-generic-occurrence");
    }
    throw error;
  }
}

function instantiateTemplate(
  memory: WriteMemory,
  template: LinkHandle,
  rho: ReadonlyMap<LinkHandle, LinkHandle>,
): LinkHandle {
  const containsMemo = new Map<LinkHandle, boolean>();
  const containsActive = new Set<LinkHandle>();
  const active = new Set<LinkHandle>();
  const memo = new Map<LinkHandle, LinkHandle>();

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
    } catch (error) {
      if (error instanceof MemoryError) fail("invalid-generic-occurrence");
      throw error;
    } finally {
      containsActive.delete(node);
    }
  };

  const build = (node: LinkHandle): LinkHandle => {
    const replacement = rho.get(node);
    if (replacement !== undefined) return replacement;
    if (!containsRole(node)) return node;
    const cached = memo.get(node);
    if (cached !== undefined) return cached;
    if (active.has(node)) fail("invalid-generic-occurrence");
    active.add(node);
    try {
      const poles = memory.poles(node);
      const result = memory.ensure(build(poles.start), build(poles.end));
      memo.set(node, result);
      return result;
    } catch (error) {
      if (error instanceof StructuralHeterogeneousDerivedOpenRootedExpansionError) throw error;
      if (error instanceof MemoryError) fail("invalid-generic-occurrence");
      throw error;
    } finally {
      active.delete(node);
    }
  };

  return build(template);
}

/**
 * Construction-only materialization of an OPEN rooted V1 expansion.
 * Host bindings choose candidate concrete values but grant no proof authority.
 */
export function materializeHeterogeneousDerivedOpenRootedExpansion(
  memory: WriteMemory,
  generic: StructuralHeterogeneousDerivedDerivationEvidence,
  bindings: readonly StructuralRoleBinding[],
): Readonly<{ concreteRoot: LinkHandle }> {
  let genericReplay: ReturnType<typeof replayStructuralHeterogeneousDerivedDerivationSchema>;
  try {
    genericReplay = replayStructuralHeterogeneousDerivedDerivationSchema(memory, generic);
  } catch (error) {
    if (error instanceof StructuralHeterogeneousDerivedDerivationReplayError) {
      fail("invalid-generic-certificate");
    }
    throw error;
  }

  const theory = genericReplay.theory;
  const targetSchema = derivation(memory, genericReplay.targetDerivationRule);
  const targetRule = rule(memory, targetSchema.structuralRule);
  const globalDictionary = targetRule.roleDictionary;
  const globalRoles = dictionary(memory, globalDictionary);
  const globalSet = new Set(globalRoles);
  const globalRho = new Map<LinkHandle, LinkHandle>();

  for (const binding of bindings) {
    if (!globalSet.has(binding.role)) fail("undeclared-role-binding");
    if (globalRho.has(binding.role)) fail("duplicate-role-binding");
    try {
      memory.poles(binding.value);
    } catch (error) {
      if (error instanceof MemoryError) fail("invalid-role-binding");
      throw error;
    }
    globalRho.set(binding.role, binding.value);
  }
  for (const roleHandle of globalRoles) {
    if (!globalRho.has(roleHandle)) fail("missing-role-binding");
  }

  const concretePremises = targetSchema.premiseTemplates.map((template) =>
    instantiateTemplate(memory, template, globalRho),
  );
  const concreteConclusion = instantiateTemplate(memory, targetRule.body, globalRho);
  const concreteDictionary = defineStructuralRoleDictionary(memory, []);
  const concreteTargetRule = defineStructuralRule(memory, concreteDictionary, concreteConclusion);
  const concreteTargetDR = defineStructuralDerivationRule(memory, concreteTargetRule, concretePremises);
  const concreteIdentity = memory.ensure(concreteTargetDR, theory);

  const premiseIndex = new Map<LinkHandle, number>();
  targetSchema.premiseTemplates.forEach((template, index) => {
    if (premiseIndex.has(template)) fail("invalid-generic-certificate");
    premiseIndex.set(template, index);
  });

  const concreteByGeneric = new Map<LinkHandle, LinkHandle>();
  const active = new Set<LinkHandle>();

  const buildOccurrence = (genericOccurrence: LinkHandle): LinkHandle => {
    const existing = concreteByGeneric.get(genericOccurrence);
    if (existing !== undefined) return existing;
    if (active.has(genericOccurrence)) fail("invalid-generic-occurrence");
    active.add(genericOccurrence);
    try {
      let globalTemplate: LinkHandle;
      let support: LinkHandle;
      try {
        ({ start: globalTemplate, end: support } = memory.poles(genericOccurrence));
      } catch (error) {
        if (error instanceof MemoryError) fail("invalid-generic-occurrence");
        throw error;
      }

      if (support === generic.identity) {
        const index = premiseIndex.get(globalTemplate);
        if (index === undefined) fail("invalid-generic-occurrence");
        const claim = concretePremises[index];
        if (claim === undefined) fail("inconsistent-expansion");
        const occurrence = memory.ensure(claim, concreteIdentity);
        concreteByGeneric.set(genericOccurrence, occurrence);
        return occurrence;
      }

      let localDR: LinkHandle;
      let scoped: LinkHandle;
      try {
        ({ start: localDR, end: scoped } = memory.poles(support));
      } catch (error) {
        if (error instanceof MemoryError) fail("invalid-generic-occurrence");
        throw error;
      }
      let morphism: LinkHandle;
      let dependencySequence: LinkHandle;
      try {
        ({ start: morphism, end: dependencySequence } = memory.poles(scoped));
      } catch (error) {
        if (error instanceof MemoryError) fail("invalid-generic-occurrence");
        throw error;
      }

      const localSchema = derivation(memory, localDR);
      const localRule = rule(memory, localSchema.structuralRule);
      const localRoles = dictionary(memory, localRule.roleDictionary);
      let mu: ReturnType<typeof replayStructuralRoleMorphism>;
      try {
        mu = replayStructuralRoleMorphism(memory, morphism, {
          theory,
          sourceDictionary: localRule.roleDictionary,
          targetDictionary: globalDictionary,
          sourceRoles: localRoles,
          targetRoles: globalRoles,
        });
      } catch (error) {
        if (error instanceof StructuralRoleMorphismError) fail("invalid-generic-occurrence");
        throw error;
      }

      const localRho = new Map<LinkHandle, LinkHandle>();
      for (const binding of mu.bindings) {
        const value = globalRho.get(binding.targetRole);
        if (value === undefined) fail("missing-role-binding");
        localRho.set(binding.sourceRole, value);
      }

      const genericDependencies = sequence(memory, dependencySequence);
      if (genericDependencies.length !== localSchema.premiseTemplates.length) {
        fail("invalid-generic-occurrence");
      }
      const concreteDependencies = genericDependencies.map(buildOccurrence);
      const concreteDependencyClaims = concreteDependencies.map((dependency) => {
        try {
          return memory.poles(dependency).start;
        } catch (error) {
          if (error instanceof MemoryError) fail("inconsistent-expansion");
          throw error;
        }
      });

      localSchema.premiseTemplates.forEach((template, index) => {
        const actual = concreteDependencyClaims[index];
        if (actual === undefined) fail("inconsistent-expansion");
        if (instantiateTemplate(memory, template, localRho) !== actual) {
          fail("inconsistent-expansion");
        }
      });

      const concreteClaim = instantiateTemplate(memory, localRule.body, localRho);
      const expectedGlobalClaim = instantiateTemplate(memory, globalTemplate, globalRho);
      if (concreteClaim !== expectedGlobalClaim) fail("inconsistent-expansion");

      const occurrence = memory.ensure(
        concreteClaim,
        memory.ensure(localDR, materializeExactSequence(memory, concreteDependencies)),
      );
      concreteByGeneric.set(genericOccurrence, occurrence);
      return occurrence;
    } finally {
      active.delete(genericOccurrence);
    }
  };

  const concreteTargetOccurrence = buildOccurrence(generic.targetOccurrence);
  return Object.freeze({
    concreteRoot: memory.ensure(concreteIdentity, concreteTargetOccurrence),
  });
}
