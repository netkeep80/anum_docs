import {
  StructuralDerivationReplayError,
  readStructuralDerivationRule,
} from "./derivation.js";
import { MemoryError, type LinkHandle, type ReadMemory } from "./memory.js";
import {
  StructuralRootedProofAsetReplayError,
  replayClosedProofOccurrence,
} from "./rooted-proof-aset.js";
import {
  StructuralRuleError,
  matchStructuralTemplate,
  readStructuralRoleDictionary,
  readStructuralRule,
} from "./structural-rule.js";
import {
  StructuralSubstitutionError,
  inferStructuralSubstitution,
  type StructuralSubstitutionBinding,
} from "./structural-substitution.js";

export interface ProofSubAnetProjectionEvidence {
  readonly theory: LinkHandle;
  readonly schemaDerivationRule: LinkHandle;
  readonly premiseProofOccurrence: LinkHandle;
}

export interface ProofSubAnetProjectionReplayResult {
  readonly theory: LinkHandle;
  readonly schemaDerivationRule: LinkHandle;
  readonly premiseProofOccurrence: LinkHandle;
  readonly premiseClaim: LinkHandle;
  readonly projectedOccurrence: LinkHandle;
  readonly projectedClaim: LinkHandle;
  readonly bindings: readonly StructuralSubstitutionBinding[];
}

export type ProofSubAnetProjectionReplayErrorCode =
  | "invalid-schema"
  | "unsupported-schema-arity"
  | "invalid-premise-proof"
  | "unbound-schema-role"
  | "invalid-premise-substitution"
  | "projection-not-found"
  | "ambiguous-projection"
  | "replay-wrote";

export class ProofSubAnetProjectionReplayError extends Error {
  override readonly name = "ProofSubAnetProjectionReplayError";

  constructor(readonly code: ProofSubAnetProjectionReplayErrorCode) {
    super(code);
  }
}

function fail(code: ProofSubAnetProjectionReplayErrorCode): never {
  throw new ProofSubAnetProjectionReplayError(code);
}

/**
 * Trusted read-only K1e replay for a one-premise structural projection schema.
 *
 * The schema is data only: it does not need Theory admission. All role values
 * are inferred from the exact premise Claim, and the conclusion may select only
 * an already-existing ProofOccurrence from the K1-validated parent closure.
 */
export function replayProofSubAnetProjection(
  memory: ReadMemory,
  evidence: ProofSubAnetProjectionEvidence,
): ProofSubAnetProjectionReplayResult {
  const before = memory.linkCount;
  try {
    let schema;
    let rule;
    let roles: readonly LinkHandle[];
    try {
      schema = readStructuralDerivationRule(memory, evidence.schemaDerivationRule);
      rule = readStructuralRule(memory, schema.structuralRule);
      roles = readStructuralRoleDictionary(memory, rule.roleDictionary).roles;
    } catch (error) {
      if (
        error instanceof StructuralDerivationReplayError
        || error instanceof StructuralRuleError
        || error instanceof MemoryError
      ) {
        fail("invalid-schema");
      }
      throw error;
    }

    if (schema.premiseTemplates.length !== 1) fail("unsupported-schema-arity");
    const premiseTemplate = schema.premiseTemplates[0];
    if (premiseTemplate === undefined) fail("unsupported-schema-arity");

    let parent;
    try {
      parent = replayClosedProofOccurrence(
        memory,
        evidence.theory,
        evidence.premiseProofOccurrence,
      );
    } catch (error) {
      if (error instanceof StructuralRootedProofAsetReplayError) {
        if (error.code === "replay-wrote") fail("replay-wrote");
        fail("invalid-premise-proof");
      }
      if (error instanceof MemoryError) fail("invalid-premise-proof");
      throw error;
    }

    let bindings: readonly StructuralSubstitutionBinding[];
    try {
      bindings = inferStructuralSubstitution(
        memory,
        roles,
        [Object.freeze({ template: premiseTemplate, actual: parent.claim })],
        { requireAll: true },
      );
    } catch (error) {
      if (error instanceof StructuralSubstitutionError) {
        if (error.code === "replay-wrote") fail("replay-wrote");
        if (error.code === "missing-role-binding") fail("unbound-schema-role");
        fail("invalid-premise-substitution");
      }
      throw error;
    }

    const matches: Array<{ readonly occurrence: LinkHandle; readonly claim: LinkHandle }> = [];
    for (const candidate of parent.validatedOccurrences) {
      try {
        matchStructuralTemplate(memory, rule.body, candidate.claim, bindings);
        matches.push(candidate);
      } catch (error) {
        if (error instanceof StructuralRuleError) {
          if (error.code === "template-mismatch") continue;
          if (error.code === "replay-wrote") fail("replay-wrote");
          fail("invalid-schema");
        }
        if (error instanceof MemoryError) fail("invalid-schema");
        throw error;
      }
    }

    if (matches.length === 0) fail("projection-not-found");
    if (matches.length !== 1) fail("ambiguous-projection");
    const selected = matches[0];
    if (selected === undefined) fail("projection-not-found");

    return Object.freeze({
      theory: evidence.theory,
      schemaDerivationRule: evidence.schemaDerivationRule,
      premiseProofOccurrence: evidence.premiseProofOccurrence,
      premiseClaim: parent.claim,
      projectedOccurrence: selected.occurrence,
      projectedClaim: selected.claim,
      bindings,
    });
  } finally {
    if (memory.linkCount !== before) fail("replay-wrote");
  }
}
