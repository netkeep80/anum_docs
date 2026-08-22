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
  StructuralRuleError,
  matchStructuralTemplate,
} from "./structural-rule.js";
import {
  StructuralAssumptionReplayError,
  StructuralDerivationReplayError,
  StructuralJudgmentReplayError,
  readStructuralDerivationRule,
  readStructuralProofOccurrence,
  replayStructuralDerivationWithAssumptions,
  replayStructuralJudgment,
  type StructuralDerivationWithAssumptionsEvidence,
  type StructuralDerivationWithAssumptionsReplayResult,
  type StructuralJudgmentEvidence,
  type StructuralJudgmentReplayResult,
} from "./derivation.js";

export interface StructuralScopedDerivationEvidence {
  readonly theory: LinkHandle;
  readonly outerAssumptionContext: LinkHandle;
  readonly inner: StructuralDerivationWithAssumptionsEvidence;
  readonly conclusionOccurrence: LinkHandle;
  readonly conclusion: StructuralJudgmentEvidence;
  readonly derivationRule: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
}

export interface StructuralScopedDerivationReplayResult {
  readonly theory: LinkHandle;
  readonly outerAssumptionContext: LinkHandle;
  readonly conclusionOccurrence: LinkHandle;
  readonly conclusion: StructuralJudgmentReplayResult;
  readonly inner: StructuralDerivationWithAssumptionsReplayResult;
  readonly localAssumptionClaims: readonly LinkHandle[];
  readonly localAssumptionOccurrences: readonly LinkHandle[];
  readonly usedOuterAssumptionOccurrences: readonly LinkHandle[];
}

export type StructuralScopedDerivationReplayErrorCode =
  | "invalid-scoped-evidence"
  | "theory-mismatch"
  | "inner-scope-not-exact-extension"
  | "invalid-inner-derivation"
  | "invalid-conclusion"
  | "conclusion-occurrence-mismatch"
  | "invalid-derivation-rule"
  | "derivation-rule-mismatch"
  | "derivation-rule-not-admitted"
  | "scoped-premise-count-mismatch"
  | "scoped-premise-claim-mismatch"
  | "scoped-replay-wrote";

export class StructuralScopedDerivationReplayError extends Error {
  override readonly name = "StructuralScopedDerivationReplayError";

  constructor(readonly code: StructuralScopedDerivationReplayErrorCode) {
    super(code);
  }
}

interface AssumptionContextView {
  readonly theory: LinkHandle;
  readonly claims: readonly LinkHandle[];
  readonly occurrences: readonly LinkHandle[];
}

function scopedFail(code: StructuralScopedDerivationReplayErrorCode): never {
  throw new StructuralScopedDerivationReplayError(code);
}

function readAssumptionContext(
  memory: ReadMemory,
  context: LinkHandle,
): AssumptionContextView {
  try {
    const sequence = readExactSequence(memory, context);
    if (sequence.values.length < 1) scopedFail("invalid-scoped-evidence");

    const theory = sequence.values[0];
    if (theory === undefined) scopedFail("invalid-scoped-evidence");
    const claims = Object.freeze(sequence.values.slice(1));
    const seen = new Set<LinkHandle>();
    const occurrences: LinkHandle[] = [];

    for (const claim of claims) {
      if (seen.has(claim)) scopedFail("invalid-scoped-evidence");
      seen.add(claim);
      const occurrence = memory.find(context, claim);
      if (occurrence === undefined) scopedFail("invalid-scoped-evidence");
      occurrences.push(occurrence);
    }

    return Object.freeze({
      theory,
      claims,
      occurrences: Object.freeze(occurrences),
    });
  } catch (error) {
    if (error instanceof StructuralScopedDerivationReplayError) throw error;
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
      scopedFail("invalid-scoped-evidence");
    }
    throw error;
  }
}

/**
 * Replays a generic scoped proof boundary.
 *
 * The inner AssumptionContext must be an exact sequence extension of the outer
 * context. The exact suffix is therefore the only set of assumptions that may
 * disappear at this boundary. The conclusion remains ordinary StructuralRule
 * data: an already-admitted StructuralDerivationRule matches
 * [...localAssumptionClaims, innerTargetClaim] through the conclusion Act's
 * structural role bindings.
 *
 * No logical connective, host rule name, callback, or host array position has
 * semantic authority here.
 */
export function replayStructuralScopedDerivation(
  memory: ReadMemory,
  evidence: StructuralScopedDerivationEvidence,
): StructuralScopedDerivationReplayResult {
  const beforeCount = memory.linkCount;
  try {
    try {
      memory.poles(evidence.theory);
      memory.poles(evidence.outerAssumptionContext);
      memory.poles(evidence.conclusionOccurrence);
      memory.poles(evidence.derivationRule);
      memory.poles(evidence.derivationRuleAdmission);
    } catch (error) {
      if (error instanceof MemoryError) scopedFail("invalid-scoped-evidence");
      throw error;
    }

    const outer = readAssumptionContext(memory, evidence.outerAssumptionContext);
    if (outer.theory !== evidence.theory) scopedFail("theory-mismatch");
    if (evidence.inner.derivation.theory !== evidence.theory) scopedFail("theory-mismatch");

    let inner: StructuralDerivationWithAssumptionsReplayResult;
    try {
      inner = replayStructuralDerivationWithAssumptions(memory, evidence.inner);
    } catch (error) {
      if (
        error instanceof StructuralAssumptionReplayError ||
        error instanceof StructuralDerivationReplayError ||
        error instanceof MemoryError
      ) {
        scopedFail("invalid-inner-derivation");
      }
      throw error;
    }

    if (inner.derivation.theory !== evidence.theory) scopedFail("theory-mismatch");
    const innerClaims = inner.declaredAssumptionClaims;
    const innerOccurrences = inner.declaredAssumptionOccurrences;
    if (innerClaims.length < outer.claims.length) {
      scopedFail("inner-scope-not-exact-extension");
    }
    for (let index = 0; index < outer.claims.length; index += 1) {
      if (innerClaims[index] !== outer.claims[index]) {
        scopedFail("inner-scope-not-exact-extension");
      }
    }

    const localAssumptionClaims = Object.freeze(innerClaims.slice(outer.claims.length));
    const localAssumptionOccurrences = Object.freeze(
      innerOccurrences.slice(outer.claims.length),
    );

    const innerOccurrenceIndex = new Map<LinkHandle, number>();
    innerOccurrences.forEach((occurrence, index) => {
      innerOccurrenceIndex.set(occurrence, index);
    });
    const usedOuterAssumptionOccurrences: LinkHandle[] = [];
    for (const occurrence of inner.usedAssumptionOccurrences) {
      const index = innerOccurrenceIndex.get(occurrence);
      if (index === undefined) scopedFail("invalid-inner-derivation");
      if (index < outer.claims.length) {
        const outerOccurrence = outer.occurrences[index];
        if (outerOccurrence === undefined) scopedFail("invalid-scoped-evidence");
        usedOuterAssumptionOccurrences.push(outerOccurrence);
      }
    }

    let conclusion: StructuralJudgmentReplayResult;
    try {
      conclusion = replayStructuralJudgment(memory, evidence.conclusion);
    } catch (error) {
      if (error instanceof StructuralJudgmentReplayError || error instanceof MemoryError) {
        scopedFail("invalid-conclusion");
      }
      throw error;
    }
    if (conclusion.judgment.theory !== evidence.theory) scopedFail("theory-mismatch");

    const occurrence = readStructuralProofOccurrence(memory, evidence.conclusionOccurrence);
    if (
      occurrence.act !== evidence.conclusion.application.act ||
      occurrence.claim !== conclusion.judgment.claim
    ) {
      scopedFail("conclusion-occurrence-mismatch");
    }

    let derivationRule;
    try {
      derivationRule = readStructuralDerivationRule(memory, evidence.derivationRule);
    } catch (error) {
      if (error instanceof StructuralDerivationReplayError || error instanceof MemoryError) {
        scopedFail("invalid-derivation-rule");
      }
      throw error;
    }
    if (derivationRule.structuralRule !== evidence.conclusion.application.rule) {
      scopedFail("derivation-rule-mismatch");
    }

    try {
      const admission = memory.poles(evidence.derivationRuleAdmission);
      if (admission.start !== evidence.theory || admission.end !== evidence.derivationRule) {
        scopedFail("derivation-rule-not-admitted");
      }
    } catch (error) {
      if (error instanceof StructuralScopedDerivationReplayError) throw error;
      if (error instanceof MemoryError) scopedFail("derivation-rule-not-admitted");
      throw error;
    }

    const scopedPremiseClaims = Object.freeze([
      ...localAssumptionClaims,
      inner.derivation.target.judgment.claim,
    ]);
    if (derivationRule.premiseTemplates.length !== scopedPremiseClaims.length) {
      scopedFail("scoped-premise-count-mismatch");
    }

    derivationRule.premiseTemplates.forEach((template, index) => {
      const claim = scopedPremiseClaims[index];
      if (claim === undefined) scopedFail("scoped-premise-count-mismatch");
      try {
        matchStructuralTemplate(
          memory,
          template,
          claim,
          conclusion.application.bindings,
        );
      } catch (error) {
        if (error instanceof StructuralRuleError || error instanceof MemoryError) {
          scopedFail("scoped-premise-claim-mismatch");
        }
        throw error;
      }
    });

    if (memory.linkCount !== beforeCount) scopedFail("scoped-replay-wrote");

    return Object.freeze({
      theory: evidence.theory,
      outerAssumptionContext: evidence.outerAssumptionContext,
      conclusionOccurrence: evidence.conclusionOccurrence,
      conclusion,
      inner,
      localAssumptionClaims,
      localAssumptionOccurrences,
      usedOuterAssumptionOccurrences: Object.freeze(usedOuterAssumptionOccurrences),
    });
  } catch (error) {
    if (error instanceof StructuralScopedDerivationReplayError) throw error;
    if (error instanceof MemoryError || error instanceof ExactSequenceError) {
      throw new StructuralScopedDerivationReplayError("invalid-scoped-evidence");
    }
    throw error;
  } finally {
    if (memory.linkCount !== beforeCount) {
      throw new StructuralScopedDerivationReplayError("scoped-replay-wrote");
    }
  }
}
