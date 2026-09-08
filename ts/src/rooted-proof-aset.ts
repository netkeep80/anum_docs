import { ExactSequenceError, readExactSequence } from "./exact-sequence.js";
import {
  StructuralDerivationReplayError,
  readStructuralDerivationRule,
} from "./derivation.js";
import { MemoryError, type LinkHandle, type ReadMemory } from "./memory.js";
import {
  RecursiveLinkIdentityProofReplayError,
  replayRecursiveLinkIdentityProofAset,
  replayRecursiveLinkIdentityProofClosure,
  type ValidatedProofOccurrenceClaim,
} from "./recursive-link-identity-proof.js";
import {
  StructuralRuleError,
  readStructuralRoleDictionary,
  readStructuralRule,
} from "./structural-rule.js";
import {
  StructuralSubstitutionError,
  inferStructuralSubstitution,
} from "./structural-substitution.js";

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

export interface ClosedProofOccurrenceReplayResult {
  readonly theory: LinkHandle;
  readonly occurrence: LinkHandle;
  readonly claim: LinkHandle;
  readonly validatedOccurrences: readonly ValidatedProofOccurrenceClaim[];
}

interface StructuralOccurrenceApplication {
  readonly occurrence: LinkHandle;
  readonly claim: LinkHandle;
  readonly primitiveDerivationRule: LinkHandle;
  readonly premiseTemplates: readonly LinkHandle[];
  readonly dependencyOccurrences: readonly LinkHandle[];
}

interface ProofCandidateReplayResult {
  readonly claim: LinkHandle;
  readonly validatedOccurrences: readonly ValidatedProofOccurrenceClaim[];
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

function selectUniqueCandidate<T>(
  first: T | undefined,
  second: T | undefined,
): T {
  const valid: T[] = [];
  if (first !== undefined) valid.push(first);
  if (second !== undefined) valid.push(second);
  if (valid.length === 0) fail("invalid-proof-occurrence");
  if (valid.length !== 1) fail("ambiguous-proof-support");
  const selected = valid[0];
  if (selected === undefined) fail("invalid-proof-occurrence");
  return selected;
}

function readStructuralOccurrenceApplication(
  memory: ReadMemory,
  theory: LinkHandle,
  occurrence: LinkHandle,
): StructuralOccurrenceApplication {
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
    memory,
    primitiveDerivationRule,
    "invalid-application",
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

  return Object.freeze({
    occurrence,
    claim,
    primitiveDerivationRule,
    premiseTemplates: primitiveSchema.premiseTemplates,
    dependencyOccurrences,
  });
}

/**
 * Preserves the accepted rooted-K1 whole-derivation substitution law while
 * delegating the actual multi-constraint inference to one shared helper.
 */
function verifyWholeDerivationSubstitution(
  memory: ReadMemory,
  derivationRule: LinkHandle,
  actualPremises: readonly LinkHandle[],
  actualConclusion: LinkHandle,
): void {
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

  try {
    inferStructuralSubstitution(
      memory,
      roles,
      [
        Object.freeze({ template: rule.body, actual: actualConclusion }),
        ...schema.premiseTemplates.map((template, index) => {
          const actual = actualPremises[index];
          if (actual === undefined) fail("premise-arity-mismatch");
          return Object.freeze({ template, actual });
        }),
      ],
      { requireAll: true },
    );
  } catch (error) {
    if (error instanceof StructuralSubstitutionError) {
      if (error.code === "replay-wrote") fail("replay-wrote");
      if (error.code === "duplicate-role") fail("invalid-application");
      fail("template-mismatch");
    }
    throw error;
  }
}

function mergeValidatedClosures(
  parts: readonly (readonly ValidatedProofOccurrenceClaim[])[],
  current: ValidatedProofOccurrenceClaim,
): readonly ValidatedProofOccurrenceClaim[] {
  const merged = new Map<LinkHandle, LinkHandle>();
  const add = ({ occurrence, claim }: ValidatedProofOccurrenceClaim): void => {
    const previous = merged.get(occurrence);
    if (previous !== undefined && previous !== claim) fail("invalid-proof-occurrence");
    merged.set(occurrence, claim);
  };
  for (const part of parts) for (const entry of part) add(entry);
  add(current);
  return Object.freeze(
    [...merged].map(([occurrence, claim]) => Object.freeze({ occurrence, claim })),
  );
}

/**
 * Trusted callback-free K1 replay for one CLOSED ProofOccurrence.
 *
 * It uses the same accepted identity/structural 0/1/>1 law selection as the
 * rooted wrapper, but has no target-assumption topology. The returned closure
 * contains only exact ProofOccurrences validated by the uniquely selected law.
 */
export function replayClosedProofOccurrence(
  memory: ReadMemory,
  theory: LinkHandle,
  occurrence: LinkHandle,
): ClosedProofOccurrenceReplayResult {
  const before = memory.linkCount;
  const structuralMemo = new Map<LinkHandle, ProofCandidateReplayResult>();
  const activeStructural = new Set<LinkHandle>();

  try {
    const attemptIdentity = (candidate: LinkHandle): ProofCandidateReplayResult | undefined => {
      try {
        const replay = replayRecursiveLinkIdentityProofClosure(memory, candidate);
        let claim: LinkHandle;
        try {
          claim = memory.poles(candidate).start;
        } catch (error) {
          if (error instanceof MemoryError) fail("invalid-proof-occurrence");
          throw error;
        }
        return Object.freeze({
          claim,
          validatedOccurrences: replay.validatedOccurrences,
        });
      } catch (error) {
        if (
          error instanceof RecursiveLinkIdentityProofReplayError
          && error.code !== "replay-wrote"
        ) {
          return undefined;
        }
        throw error;
      }
    };

    const verifyStructural = (candidate: LinkHandle): ProofCandidateReplayResult => {
      const cached = structuralMemo.get(candidate);
      if (cached !== undefined) return cached;
      if (activeStructural.has(candidate)) fail("cyclic-dependency");
      activeStructural.add(candidate);
      try {
        const application = readStructuralOccurrenceApplication(memory, theory, candidate);
        const dependencies = application.dependencyOccurrences.map((dependency) => verifyClosed(dependency));
        verifyWholeDerivationSubstitution(
          memory,
          application.primitiveDerivationRule,
          dependencies.map((dependency) => dependency.claim),
          application.claim,
        );
        const replay = Object.freeze({
          claim: application.claim,
          validatedOccurrences: mergeValidatedClosures(
            dependencies.map((dependency) => dependency.validatedOccurrences),
            Object.freeze({ occurrence: candidate, claim: application.claim }),
          ),
        });
        structuralMemo.set(candidate, replay);
        return replay;
      } finally {
        activeStructural.delete(candidate);
      }
    };

    const attemptStructural = (candidate: LinkHandle): ProofCandidateReplayResult | undefined => {
      try {
        return verifyStructural(candidate);
      } catch (error) {
        if (
          error instanceof StructuralRootedProofAsetReplayError
          && error.code !== "replay-wrote"
        ) {
          return undefined;
        }
        throw error;
      }
    };

    function verifyClosed(candidate: LinkHandle): ProofCandidateReplayResult {
      const identity = attemptIdentity(candidate);
      const structural = attemptStructural(candidate);
      return selectUniqueCandidate(identity, structural);
    }

    const selected = verifyClosed(occurrence);
    return Object.freeze({
      theory,
      occurrence,
      claim: selected.claim,
      validatedOccurrences: selected.validatedOccurrences,
    });
  } catch (error) {
    if (error instanceof StructuralRootedProofAsetReplayError) throw error;
    if (
      error instanceof MemoryError
      || error instanceof ExactSequenceError
      || error instanceof StructuralRuleError
      || error instanceof StructuralDerivationReplayError
    ) {
      fail("invalid-proof-occurrence");
    }
    throw error;
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
      for (const [candidate, claim] of snapshot) verified.set(candidate, claim);
    };

    const restoreUsedPremises = (snapshot: ReadonlySet<LinkHandle>): void => {
      usedPremises.clear();
      for (const premise of snapshot) usedPremises.add(premise);
    };

    function attemptIdentityClaim(candidate: LinkHandle): LinkHandle | undefined {
      try {
        replayRecursiveLinkIdentityProofAset(memory, candidate);
        return memory.poles(candidate).start;
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

    function attemptStructuralClaim(candidate: LinkHandle): LinkHandle | undefined {
      const verifiedBefore = new Map(verified);
      const usedPremisesBefore = new Set(usedPremises);
      try {
        return verifyStructuralOccurrence(candidate);
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

    function verifyDependencyClaim(candidate: LinkHandle): LinkHandle {
      return selectUniqueCandidate(
        attemptIdentityClaim(candidate),
        attemptStructuralClaim(candidate),
      );
    }

    function verifyStructuralOccurrence(candidate: LinkHandle): LinkHandle {
      const cached = verified.get(candidate);
      if (cached !== undefined) return cached;
      if (active.has(candidate)) fail("cyclic-dependency");
      active.add(candidate);
      try {
        const application = readStructuralOccurrenceApplication(memory, theory, candidate);
        const dependencyClaims = application.dependencyOccurrences.map((dependency) => {
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
          application.primitiveDerivationRule,
          dependencyClaims,
          application.claim,
        );
        verified.set(candidate, application.claim);
        return application.claim;
      } finally {
        active.delete(candidate);
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
