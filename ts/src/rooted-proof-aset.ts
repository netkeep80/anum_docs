import { ExactSequenceError, readExactSequence } from "./exact-sequence.js";
import {
  StructuralDerivationReplayError,
  readStructuralDerivationRule,
} from "./derivation.js";
import { MemoryError, type LinkHandle, type ReadMemory } from "./memory.js";
import {
  RecursiveLinkIdentityProofReplayError,
  replayRecursiveLinkIdentityProofAset,
} from "./recursive-link-identity-proof.js";
import {
  StructuralRuleError,
  readStructuralRoleDictionary,
  readStructuralRule,
} from "./structural-rule.js";

export type StructuralRootedProofAsetReplayErrorCode =
  | "invalid-root"
  | "invalid-target-identity"
  | "invalid-target-schema"
  | "invalid-occurrence"
  | "invalid-application"
  | "invalid-dependency-sequence"
  | "invalid-proof-occurrence"
  | "ambiguous-proof-support"
  | "primitive-rule-not-admitted"
  | "primitive-derivation-rule-not-admitted"
  | "premise-arity-mismatch"
  | "template-mismatch"
  | "cyclic-dependency"
  | "replay-wrote";

export class StructuralRootedProofAsetReplayError extends Error {
  override readonly name = "StructuralRootedProofAsetReplayError";

  constructor(readonly code: StructuralRootedProofAsetReplayErrorCode) {
    super(code);
  }
}

export interface StructuralRootedProofAsetReplayResult {
  readonly theory: LinkHandle;
  readonly targetIdentity: LinkHandle;
  readonly targetDerivationRule: LinkHandle;
  readonly targetOccurrence: LinkHandle;
  readonly conclusion: LinkHandle;
  readonly occurrenceCount: number;
  readonly declaredAssumptionCount: number;
  readonly usedAssumptionCount: number;
}

function fail(code: StructuralRootedProofAsetReplayErrorCode): never {
  throw new StructuralRootedProofAsetReplayError(code);
}

function readDerivationRule(
  memory: ReadMemory,
  derivationRule: LinkHandle,
  code: StructuralRootedProofAsetReplayErrorCode,
) {
  try {
    return readStructuralDerivationRule(memory, derivationRule);
  } catch (error) {
    if (error instanceof StructuralDerivationReplayError || error instanceof MemoryError) {
      fail(code);
    }
    throw error;
  }
}

function readRule(
  memory: ReadMemory,
  rule: LinkHandle,
  code: StructuralRootedProofAsetReplayErrorCode,
) {
  try {
    return readStructuralRule(memory, rule);
  } catch (error) {
    if (error instanceof StructuralRuleError || error instanceof MemoryError) {
      fail(code);
    }
    throw error;
  }
}

function readDependencies(memory: ReadMemory, sequence: LinkHandle): readonly LinkHandle[] {
  try {
    return readExactSequence(memory, sequence).values;
  } catch (error) {
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
      fail("invalid-dependency-sequence");
    }
    throw error;
  }
}

/**
 * Infers one substitution over the complete primitive StructuralDerivationRule.
 * The Map is an operational projection only; every constraint comes from MTS
 * RoleDictionary, premise, conclusion and actual Claim topology.
 */
function verifyWholeDerivationSubstitution(
  memory: ReadMemory,
  derivationRule: LinkHandle,
  actualPremises: readonly LinkHandle[],
  actualConclusion: LinkHandle,
): void {
  const before = memory.linkCount;
  try {
    const schema = readDerivationRule(memory, derivationRule, "invalid-application");
    const rule = readRule(memory, schema.structuralRule, "invalid-application");
    let roles: readonly LinkHandle[];
    try {
      roles = readStructuralRoleDictionary(memory, rule.roleDictionary).roles;
    } catch (error) {
      if (error instanceof StructuralRuleError || error instanceof MemoryError) {
        fail("invalid-application");
      }
      throw error;
    }

    if (actualPremises.length !== schema.premiseTemplates.length) {
      fail("premise-arity-mismatch");
    }

    const roleSet = new Set(roles);
    if (roleSet.size !== roles.length) fail("invalid-application");
    const rho = new Map<LinkHandle, LinkHandle>();
    const containsMemo = new Map<LinkHandle, boolean>();
    const containsActive = new Set<LinkHandle>();

    const containsRole = (link: LinkHandle): boolean => {
      if (roleSet.has(link)) return true;
      const cached = containsMemo.get(link);
      if (cached !== undefined) return cached;
      if (containsActive.has(link)) return false;
      containsActive.add(link);
      try {
        const poles = memory.poles(link);
        const result = containsRole(poles.start) || containsRole(poles.end);
        containsMemo.set(link, result);
        return result;
      } catch (error) {
        if (error instanceof MemoryError) fail("template-mismatch");
        throw error;
      } finally {
        containsActive.delete(link);
      }
    };

    const visited = new Map<LinkHandle, Set<LinkHandle>>();
    const alreadyVisited = (template: LinkHandle, actual: LinkHandle): boolean => {
      let actuals = visited.get(template);
      if (actuals === undefined) {
        actuals = new Set<LinkHandle>();
        visited.set(template, actuals);
      }
      if (actuals.has(actual)) return true;
      actuals.add(actual);
      return false;
    };

    const unify = (template: LinkHandle, actual: LinkHandle): void => {
      if (roleSet.has(template)) {
        const existing = rho.get(template);
        if (existing !== undefined && existing !== actual) fail("template-mismatch");
        rho.set(template, actual);
        return;
      }

      if (!containsRole(template)) {
        if (template !== actual) fail("template-mismatch");
        return;
      }

      if (alreadyVisited(template, actual)) return;
      try {
        const source = memory.poles(template);
        const target = memory.poles(actual);
        unify(source.start, target.start);
        unify(source.end, target.end);
      } catch (error) {
        if (error instanceof StructuralRootedProofAsetReplayError) throw error;
        if (error instanceof MemoryError) fail("template-mismatch");
        throw error;
      }
    };

    unify(rule.body, actualConclusion);
    schema.premiseTemplates.forEach((template, index) => {
      const actual = actualPremises[index];
      if (actual === undefined) fail("premise-arity-mismatch");
      unify(template, actual);
    });

    for (const role of roles) {
      if (!rho.has(role)) fail("template-mismatch");
    }
  } finally {
    if (memory.linkCount !== before) fail("replay-wrote");
  }
}

/**
 * Trusted read-only replay for the rooted proof-Aset normal form.
 *
 * Proof membership is reconstructed only from the dependency closure reachable
 * from root P. Host Maps/Sets cache traversal and never grant proof authority.
 */
export function replayStructuralRootedProofAset(
  memory: ReadMemory,
  root: LinkHandle,
): StructuralRootedProofAsetReplayResult {
  const before = memory.linkCount;
  try {
    let targetIdentity: LinkHandle;
    let targetOccurrence: LinkHandle;
    try {
      const rootPoles = memory.poles(root);
      targetIdentity = rootPoles.start;
      targetOccurrence = rootPoles.end;
    } catch (error) {
      if (error instanceof MemoryError) fail("invalid-root");
      throw error;
    }

    let targetDerivationRule: LinkHandle;
    let theory: LinkHandle;
    try {
      const identity = memory.poles(targetIdentity);
      targetDerivationRule = identity.start;
      theory = identity.end;
    } catch (error) {
      if (error instanceof MemoryError) fail("invalid-target-identity");
      throw error;
    }

    const targetSchema = readDerivationRule(memory, targetDerivationRule, "invalid-target-schema");
    const targetRule = readRule(memory, targetSchema.structuralRule, "invalid-target-schema");
    try {
      readStructuralRoleDictionary(memory, targetRule.roleDictionary);
    } catch (error) {
      if (error instanceof StructuralRuleError || error instanceof MemoryError) {
        fail("invalid-target-schema");
      }
      throw error;
    }

    const targetPremises = new Set(targetSchema.premiseTemplates);
    const usedPremises = new Set<LinkHandle>();
    const verified = new Map<LinkHandle, LinkHandle>();
    const active = new Set<LinkHandle>();

    const restoreVerified = (snapshot: ReadonlyMap<LinkHandle, LinkHandle>): void => {
      verified.clear();
      for (const [occurrence, claim] of snapshot) verified.set(occurrence, claim);
    };

    const restoreUsedPremises = (snapshot: ReadonlySet<LinkHandle>): void => {
      usedPremises.clear();
      for (const premise of snapshot) usedPremises.add(premise);
    };

    function attemptIdentityClaim(occurrence: LinkHandle): LinkHandle | undefined {
      try {
        replayRecursiveLinkIdentityProofAset(memory, occurrence);
        return memory.poles(occurrence).start;
      } catch (error) {
        if (
          error instanceof RecursiveLinkIdentityProofReplayError
          && error.code !== "replay-wrote"
        ) {
          return undefined;
        }
        throw error;
      }
    }

    function attemptStructuralClaim(occurrence: LinkHandle): LinkHandle | undefined {
      const verifiedBefore = new Map(verified);
      const usedPremisesBefore = new Set(usedPremises);
      try {
        return verifyStructuralOccurrence(occurrence);
      } catch (error) {
        if (
          error instanceof StructuralRootedProofAsetReplayError
          && error.code !== "replay-wrote"
        ) {
          restoreVerified(verifiedBefore);
          restoreUsedPremises(usedPremisesBefore);
          return undefined;
        }
        throw error;
      }
    }

    function verifyDependencyClaim(occurrence: LinkHandle): LinkHandle {
      const identityClaim = attemptIdentityClaim(occurrence);
      const structuralClaim = attemptStructuralClaim(occurrence);
      const validClaims: LinkHandle[] = [];
      if (identityClaim !== undefined) validClaims.push(identityClaim);
      if (structuralClaim !== undefined) validClaims.push(structuralClaim);

      if (validClaims.length === 0) fail("invalid-proof-occurrence");
      if (validClaims.length !== 1) fail("ambiguous-proof-support");
      const claim = validClaims[0];
      if (claim === undefined) fail("invalid-proof-occurrence");
      return claim;
    }

    function verifyStructuralOccurrence(occurrence: LinkHandle): LinkHandle {
      const cached = verified.get(occurrence);
      if (cached !== undefined) return cached;
      if (active.has(occurrence)) fail("cyclic-dependency");
      active.add(occurrence);
      try {
        let claim: LinkHandle;
        let application: LinkHandle;
        try {
          const occurrencePoles = memory.poles(occurrence);
          claim = occurrencePoles.start;
          application = occurrencePoles.end;
        } catch (error) {
          if (error instanceof MemoryError) fail("invalid-occurrence");
          throw error;
        }

        let primitiveDerivationRule: LinkHandle;
        let dependencySequence: LinkHandle;
        try {
          const applicationPoles = memory.poles(application);
          primitiveDerivationRule = applicationPoles.start;
          dependencySequence = applicationPoles.end;
        } catch (error) {
          if (error instanceof MemoryError) fail("invalid-application");
          throw error;
        }

        const primitiveSchema = readDerivationRule(
          memory, primitiveDerivationRule, "invalid-application",
        );
        readRule(memory, primitiveSchema.structuralRule, "invalid-application");
        if (memory.find(theory, primitiveSchema.structuralRule) === undefined) {
          fail("primitive-rule-not-admitted");
        }
        if (memory.find(theory, primitiveDerivationRule) === undefined) {
          fail("primitive-derivation-rule-not-admitted");
        }

        const dependencyOccurrences = readDependencies(memory, dependencySequence);
        if (dependencyOccurrences.length !== primitiveSchema.premiseTemplates.length) {
          fail("premise-arity-mismatch");
        }

        const dependencyClaims = dependencyOccurrences.map((dependency) => {
          try {
            const poles = memory.poles(dependency);
            if (poles.end === targetIdentity && targetPremises.has(poles.start)) {
              usedPremises.add(poles.start);
              return poles.start;
            }
          } catch (error) {
            if (error instanceof MemoryError) fail("invalid-occurrence");
            throw error;
          }
          return verifyDependencyClaim(dependency);
        });

        verifyWholeDerivationSubstitution(
          memory,
          primitiveDerivationRule,
          dependencyClaims,
          claim,
        );
        verified.set(occurrence, claim);
        return claim;
      } finally {
        active.delete(occurrence);
      }
    }

    const conclusion = verifyStructuralOccurrence(targetOccurrence);
    if (conclusion !== targetRule.body) fail("template-mismatch");

    return Object.freeze({
      theory,
      targetIdentity,
      targetDerivationRule,
      targetOccurrence,
      conclusion,
      occurrenceCount: verified.size,
      declaredAssumptionCount: targetPremises.size,
      usedAssumptionCount: usedPremises.size,
    });
  } catch (error) {
    if (error instanceof StructuralRootedProofAsetReplayError) throw error;
    if (
      error instanceof MemoryError
      || error instanceof ExactSequenceError
      || error instanceof StructuralRuleError
      || error instanceof StructuralDerivationReplayError
    ) {
      fail("invalid-root");
    }
    throw error;
  } finally {
    if (memory.linkCount !== before) fail("replay-wrote");
  }
}
