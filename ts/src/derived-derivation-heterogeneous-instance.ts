import { ExactSequenceError, readExactSequence } from "./exact-sequence.js";
import {
  StructuralDerivationReplayError,
  readStructuralDerivationRule,
} from "./derivation.js";
import {
  StructuralHeterogeneousDerivedDerivationReplayError,
  replayStructuralHeterogeneousDerivedDerivationSchema,
  type StructuralHeterogeneousDerivedDerivationEvidence,
} from "./derived-derivation-heterogeneous.js";
import { MemoryError, type LinkHandle, type ReadMemory } from "./memory.js";
import {
  StructuralRootedProofAsetReplayError,
  replayStructuralRootedProofAset,
} from "./rooted-proof-aset.js";
import {
  StructuralRoleMorphismError,
  replayStructuralRoleMorphism,
} from "./structural-role-morphism.js";
import {
  StructuralRuleError,
  readStructuralRoleDictionary,
  readStructuralRule,
} from "./structural-rule.js";
import {
  StructuralSubstitutionError,
  inferStructuralSubstitution,
  type StructuralSubstitutionBinding,
  type StructuralSubstitutionConstraint,
} from "./structural-substitution.js";

export interface StructuralHeterogeneousDerivedOpenRootedInstanceEvidence {
  readonly generic: StructuralHeterogeneousDerivedDerivationEvidence;
  readonly concreteRoot: LinkHandle;
}

export interface StructuralHeterogeneousDerivedOpenRootedInstanceReplayResult {
  readonly theory: LinkHandle;
  readonly genericIdentity: LinkHandle;
  readonly concreteRoot: LinkHandle;
  readonly genericTargetOccurrence: LinkHandle;
  readonly concreteTargetOccurrence: LinkHandle;
  readonly globalRoleDictionary: LinkHandle;
  readonly bindings: readonly StructuralSubstitutionBinding[];
  readonly pairedOccurrenceCount: number;
}

export type StructuralHeterogeneousDerivedOpenRootedInstanceReplayErrorCode =
  | "invalid-generic-certificate"
  | "invalid-concrete-rooted-proof"
  | "theory-mismatch"
  | "non-concrete-target"
  | "target-interface-mismatch"
  | "invalid-occurrence-pair"
  | "derivation-rule-mismatch"
  | "dependency-arity-mismatch"
  | "inconsistent-instance"
  | "global-role-not-observable"
  | "replay-wrote";

export class StructuralHeterogeneousDerivedOpenRootedInstanceReplayError extends Error {
  override readonly name = "StructuralHeterogeneousDerivedOpenRootedInstanceReplayError";

  constructor(readonly code: StructuralHeterogeneousDerivedOpenRootedInstanceReplayErrorCode) {
    super(code);
  }
}

function fail(code: StructuralHeterogeneousDerivedOpenRootedInstanceReplayErrorCode): never {
  throw new StructuralHeterogeneousDerivedOpenRootedInstanceReplayError(code);
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

function dictionary(memory: ReadMemory, handle: LinkHandle): readonly LinkHandle[] {
  try {
    return readStructuralRoleDictionary(memory, handle).roles;
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
 * Trusted read-only binding between one accepted heterogeneous generic proof
 * certificate and one independently accepted concrete OPEN rooted proof.
 *
 * The returned bindings are reconstructed projection only. No host rho is an
 * input to this acceptance boundary.
 */
export function replayStructuralHeterogeneousDerivedOpenRootedInstance(
  memory: ReadMemory,
  evidence: StructuralHeterogeneousDerivedOpenRootedInstanceEvidence,
): StructuralHeterogeneousDerivedOpenRootedInstanceReplayResult {
  const before = memory.linkCount;
  try {
    let genericReplay: ReturnType<typeof replayStructuralHeterogeneousDerivedDerivationSchema>;
    try {
      genericReplay = replayStructuralHeterogeneousDerivedDerivationSchema(memory, evidence.generic);
    } catch (error) {
      if (error instanceof StructuralHeterogeneousDerivedDerivationReplayError) {
        if (error.code === "replay-wrote") fail("replay-wrote");
        fail("invalid-generic-certificate");
      }
      throw error;
    }

    let concreteReplay: ReturnType<typeof replayStructuralRootedProofAset>;
    try {
      concreteReplay = replayStructuralRootedProofAset(memory, evidence.concreteRoot);
    } catch (error) {
      if (error instanceof StructuralRootedProofAsetReplayError) {
        if (error.code === "replay-wrote") fail("replay-wrote");
        fail("invalid-concrete-rooted-proof");
      }
      throw error;
    }

    if (genericReplay.theory !== concreteReplay.theory) fail("theory-mismatch");
    const theory = genericReplay.theory;

    let genericTargetDR: LinkHandle;
    let genericTheory: LinkHandle;
    try {
      ({ start: genericTargetDR, end: genericTheory } = memory.poles(evidence.generic.identity));
    } catch (error) {
      if (error instanceof MemoryError) fail("invalid-generic-certificate");
      throw error;
    }
    if (genericTheory !== theory || genericTargetDR !== genericReplay.targetDerivationRule) {
      fail("invalid-generic-certificate");
    }

    const genericTargetSchema = derivation(memory, genericTargetDR);
    const genericTargetRule = rule(memory, genericTargetSchema.structuralRule);
    const globalRoleDictionary = genericTargetRule.roleDictionary;
    const globalRoles = dictionary(memory, globalRoleDictionary);

    let concreteIdentity: LinkHandle;
    let concreteTargetOccurrence: LinkHandle;
    try {
      ({ start: concreteIdentity, end: concreteTargetOccurrence } = memory.poles(evidence.concreteRoot));
    } catch (error) {
      if (error instanceof MemoryError) fail("invalid-concrete-rooted-proof");
      throw error;
    }
    if (
      concreteIdentity !== concreteReplay.targetIdentity
      || concreteTargetOccurrence !== concreteReplay.targetOccurrence
    ) {
      fail("invalid-concrete-rooted-proof");
    }

    let concreteTargetDR: LinkHandle;
    let concreteTheory: LinkHandle;
    try {
      ({ start: concreteTargetDR, end: concreteTheory } = memory.poles(concreteIdentity));
    } catch (error) {
      if (error instanceof MemoryError) fail("invalid-concrete-rooted-proof");
      throw error;
    }
    if (concreteTheory !== theory || concreteTargetDR !== concreteReplay.targetDerivationRule) {
      fail("theory-mismatch");
    }

    const concreteTargetSchema = derivation(memory, concreteTargetDR);
    const concreteTargetRule = rule(memory, concreteTargetSchema.structuralRule);
    const concreteTargetRoles = dictionary(memory, concreteTargetRule.roleDictionary);
    if (concreteTargetRoles.length !== 0) fail("non-concrete-target");

    if (genericTargetSchema.premiseTemplates.length !== concreteTargetSchema.premiseTemplates.length) {
      fail("target-interface-mismatch");
    }

    const globalConstraints: StructuralSubstitutionConstraint[] = [
      Object.freeze({ template: genericTargetRule.body, actual: concreteTargetRule.body }),
    ];
    genericTargetSchema.premiseTemplates.forEach((template, index) => {
      const actual = concreteTargetSchema.premiseTemplates[index];
      if (actual === undefined) fail("target-interface-mismatch");
      globalConstraints.push(Object.freeze({ template, actual }));
    });

    const genericPremiseIndex = new Map<LinkHandle, number>();
    genericTargetSchema.premiseTemplates.forEach((template, index) => {
      if (genericPremiseIndex.has(template)) fail("invalid-generic-certificate");
      genericPremiseIndex.set(template, index);
    });

    const genericToConcrete = new Map<LinkHandle, LinkHandle>();
    const liftedGlobal = new Map<LinkHandle, LinkHandle>();

    const mergeGlobal = (roleHandle: LinkHandle, value: LinkHandle): void => {
      const previous = liftedGlobal.get(roleHandle);
      if (previous !== undefined && previous !== value) fail("inconsistent-instance");
      liftedGlobal.set(roleHandle, value);
    };

    const pairOccurrence = (genericOccurrence: LinkHandle, concreteOccurrence: LinkHandle): void => {
      const previous = genericToConcrete.get(genericOccurrence);
      if (previous !== undefined) {
        if (previous !== concreteOccurrence) fail("inconsistent-instance");
        return;
      }
      genericToConcrete.set(genericOccurrence, concreteOccurrence);

      let genericTemplate: LinkHandle;
      let genericSupport: LinkHandle;
      let concreteClaim: LinkHandle;
      let concreteSupport: LinkHandle;
      try {
        ({ start: genericTemplate, end: genericSupport } = memory.poles(genericOccurrence));
        ({ start: concreteClaim, end: concreteSupport } = memory.poles(concreteOccurrence));
      } catch (error) {
        if (error instanceof MemoryError) fail("invalid-occurrence-pair");
        throw error;
      }

      globalConstraints.push(Object.freeze({ template: genericTemplate, actual: concreteClaim }));

      const premiseIndex = genericSupport === evidence.generic.identity
        ? genericPremiseIndex.get(genericTemplate)
        : undefined;
      if (premiseIndex !== undefined) {
        const expectedClaim = concreteTargetSchema.premiseTemplates[premiseIndex];
        if (expectedClaim === undefined || concreteClaim !== expectedClaim) {
          fail("target-interface-mismatch");
        }
        if (concreteSupport !== concreteIdentity) fail("invalid-occurrence-pair");
        return;
      }

      let localDR: LinkHandle;
      let scopedApplication: LinkHandle;
      try {
        ({ start: localDR, end: scopedApplication } = memory.poles(genericSupport));
      } catch (error) {
        if (error instanceof MemoryError) fail("invalid-occurrence-pair");
        throw error;
      }

      let morphism: LinkHandle;
      let genericDependencySequence: LinkHandle;
      try {
        ({ start: morphism, end: genericDependencySequence } = memory.poles(scopedApplication));
      } catch (error) {
        if (error instanceof MemoryError) fail("invalid-occurrence-pair");
        throw error;
      }

      let concreteDR: LinkHandle;
      let concreteDependencySequence: LinkHandle;
      try {
        ({ start: concreteDR, end: concreteDependencySequence } = memory.poles(concreteSupport));
      } catch (error) {
        if (error instanceof MemoryError) fail("invalid-occurrence-pair");
        throw error;
      }
      if (concreteDR !== localDR) fail("derivation-rule-mismatch");

      const localSchema = derivation(memory, localDR);
      const localRule = rule(memory, localSchema.structuralRule);
      const localRoles = dictionary(memory, localRule.roleDictionary);
      const genericDependencies = sequence(memory, genericDependencySequence);
      const concreteDependencies = sequence(memory, concreteDependencySequence);
      if (
        genericDependencies.length !== localSchema.premiseTemplates.length
        || concreteDependencies.length !== genericDependencies.length
      ) {
        fail("dependency-arity-mismatch");
      }

      const concreteDependencyClaims = concreteDependencies.map((dependency) => {
        try {
          return memory.poles(dependency).start;
        } catch (error) {
          if (error instanceof MemoryError) fail("invalid-occurrence-pair");
          throw error;
        }
      });

      let localBindings: readonly StructuralSubstitutionBinding[];
      try {
        localBindings = inferStructuralSubstitution(
          memory,
          localRoles,
          [
            Object.freeze({ template: localRule.body, actual: concreteClaim }),
            ...localSchema.premiseTemplates.map((template, index) => {
              const actual = concreteDependencyClaims[index];
              if (actual === undefined) fail("dependency-arity-mismatch");
              return Object.freeze({ template, actual });
            }),
          ],
          { requireAll: true },
        );
      } catch (error) {
        if (error instanceof StructuralSubstitutionError) {
          if (error.code === "replay-wrote") fail("replay-wrote");
          fail("inconsistent-instance");
        }
        throw error;
      }

      let mu: ReturnType<typeof replayStructuralRoleMorphism>;
      try {
        mu = replayStructuralRoleMorphism(memory, morphism, {
          theory,
          sourceDictionary: localRule.roleDictionary,
          targetDictionary: globalRoleDictionary,
          sourceRoles: localRoles,
          targetRoles: globalRoles,
        });
      } catch (error) {
        if (error instanceof StructuralRoleMorphismError) {
          if (error.code === "replay-wrote") fail("replay-wrote");
          fail("invalid-occurrence-pair");
        }
        throw error;
      }

      const localValues = new Map(localBindings.map(({ role: roleHandle, value }) => [roleHandle, value]));
      for (const binding of mu.bindings) {
        const value = localValues.get(binding.sourceRole);
        if (value === undefined) fail("inconsistent-instance");
        mergeGlobal(binding.targetRole, value);
      }

      genericDependencies.forEach((genericDependency, index) => {
        const concreteDependency = concreteDependencies[index];
        if (concreteDependency === undefined) fail("dependency-arity-mismatch");
        pairOccurrence(genericDependency, concreteDependency);
      });
    };

    pairOccurrence(evidence.generic.targetOccurrence, concreteTargetOccurrence);

    let interfaceBindings: readonly StructuralSubstitutionBinding[];
    try {
      interfaceBindings = inferStructuralSubstitution(
        memory,
        globalRoles,
        globalConstraints,
        { requireAll: false },
      );
    } catch (error) {
      if (error instanceof StructuralSubstitutionError) {
        if (error.code === "replay-wrote") fail("replay-wrote");
        fail("inconsistent-instance");
      }
      throw error;
    }
    for (const binding of interfaceBindings) mergeGlobal(binding.role, binding.value);

    const bindings = Object.freeze(globalRoles.map((roleHandle): StructuralSubstitutionBinding => {
      const value = liftedGlobal.get(roleHandle);
      if (value === undefined) fail("global-role-not-observable");
      return Object.freeze({ role: roleHandle, value });
    }));

    return Object.freeze({
      theory,
      genericIdentity: evidence.generic.identity,
      concreteRoot: evidence.concreteRoot,
      genericTargetOccurrence: evidence.generic.targetOccurrence,
      concreteTargetOccurrence,
      globalRoleDictionary,
      bindings,
      pairedOccurrenceCount: genericToConcrete.size,
    });
  } finally {
    if (memory.linkCount !== before) fail("replay-wrote");
  }
}
