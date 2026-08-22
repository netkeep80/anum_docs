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
  StructuralAssumptionReplayError,
  StructuralDerivationReplayError,
  StructuralJudgmentReplayError,
  readStructuralDerivationRule,
  replayStructuralDerivationWithAssumptions,
  replayStructuralJudgment,
  type StructuralDerivationWithAssumptionsEvidence,
  type StructuralDerivationWithAssumptionsReplayResult,
  type StructuralJudgmentEvidence,
  type StructuralJudgmentReplayResult,
} from "./derivation.js";
import {
  StructuralRuleError,
  matchStructuralTemplate,
} from "./structural-rule.js";

export interface StructuralScopedDerivationEvidence {
  /** Inner proof replayed under the larger explicit assumption scope Γ,Δ. */
  readonly inner: StructuralDerivationWithAssumptionsEvidence;
  /** Explicit outer scope Γ retained after the local suffix Δ is discharged. */
  readonly outerAssumptionContext: LinkHandle;
  /** Ordinary admitted StructuralRule judgment producing the outer claim C. */
  readonly conclusion: StructuralJudgmentEvidence;
  /** Existing StructuralDerivationRule with premises [Δ..., innerTarget]. */
  readonly derivationRule: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
}

export interface StructuralScopedDerivationReplayResult {
  readonly theory: LinkHandle;
  readonly outerAssumptionContext: LinkHandle;
  readonly outerAssumptionClaims: readonly LinkHandle[];
  readonly outerAssumptionOccurrences: readonly LinkHandle[];
  readonly localAssumptionClaims: readonly LinkHandle[];
  readonly localAssumptionOccurrences: readonly LinkHandle[];
  readonly dischargedLocalAssumptionOccurrences: readonly LinkHandle[];
  readonly usedOuterAssumptionOccurrences: readonly LinkHandle[];
  readonly inner: StructuralDerivationWithAssumptionsReplayResult;
  readonly conclusion: StructuralJudgmentReplayResult;
}

export type StructuralScopedDerivationReplayErrorCode =
  | "invalid-scoped-evidence"
  | "invalid-outer-assumption-context"
  | "scope-theory-mismatch"
  | "outer-scope-not-prefix"
  | "invalid-inner-derivation"
  | "invalid-conclusion"
  | "scoped-rule-mismatch"
  | "scoped-rule-not-admitted"
  | "scoped-premise-count-mismatch"
  | "scoped-premise-mismatch"
  | "scoped-replay-wrote";

export class StructuralScopedDerivationReplayError extends Error {
  override readonly name = "StructuralScopedDerivationReplayError";

  constructor(readonly code: StructuralScopedDerivationReplayErrorCode) {
    super(code);
  }
}

function fail(code: StructuralScopedDerivationReplayErrorCode): never {
  throw new StructuralScopedDerivationReplayError(code);
}

interface AssumptionScope {
  readonly theory: LinkHandle;
  readonly claims: readonly LinkHandle[];
  readonly occurrences: readonly LinkHandle[];
}

/**
 * Read one P3b assumption context without widening the existing derivation
 * kernel. ExactSequence order is semantic evidence; every listed claim must
 * also have its explicit context->claim occurrence, exactly as P3b requires.
 */
function readAssumptionScope(
  memory: ReadMemory,
  context: LinkHandle,
): AssumptionScope {
  let values: readonly LinkHandle[];
  try {
    values = readExactSequence(memory, context).values;
  } catch (error) {
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
      fail("invalid-outer-assumption-context");
    }
    throw error;
  }

  const theory = values[0];
  if (theory === undefined) fail("invalid-outer-assumption-context");

  const claims = values.slice(1);
  const unique = new Set<LinkHandle>();
  const occurrences: LinkHandle[] = [];
  for (const claim of claims) {
    if (unique.has(claim)) fail("invalid-outer-assumption-context");
    unique.add(claim);

    try {
      memory.poles(claim);
      const occurrence = memory.find(context, claim);
      if (occurrence === undefined) fail("invalid-outer-assumption-context");
      occurrences.push(occurrence);
    } catch (error) {
      if (error instanceof StructuralScopedDerivationReplayError) throw error;
      if (error instanceof MemoryError) fail("invalid-outer-assumption-context");
      throw error;
    }
  }

  return Object.freeze({
    theory,
    claims: Object.freeze([...claims]),
    occurrences: Object.freeze([...occurrences]),
  });
}

function verifyDerivationRuleAdmission(
  memory: ReadMemory,
  theory: LinkHandle,
  derivationRule: LinkHandle,
  admission: LinkHandle,
): void {
  try {
    const poles = memory.poles(admission);
    if (poles.start !== theory || poles.end !== derivationRule) {
      fail("scoped-rule-not-admitted");
    }
  } catch (error) {
    if (error instanceof StructuralScopedDerivationReplayError) throw error;
    if (error instanceof MemoryError) fail("scoped-rule-not-admitted");
    throw error;
  }
}

/**
 * Generic scoped-premise discharge.
 *
 * The trusted code knows only structural scopes, an existing admitted
 * StructuralDerivationRule, and ordinary template matching. It has no logical
 * connective/opcode semantics. Locality is proven by the exact prefix law:
 *
 *   innerClaims = outerClaims ++ localClaims
 *
 * and only that exact local suffix may disappear at this boundary.
 */
export function replayStructuralScopedDerivation(
  memory: ReadMemory,
  evidence: StructuralScopedDerivationEvidence,
): StructuralScopedDerivationReplayResult {
  const beforeCount = memory.linkCount;
  try {
    let inner: StructuralDerivationWithAssumptionsReplayResult;
    try {
      inner = replayStructuralDerivationWithAssumptions(memory, evidence.inner);
    } catch (error) {
      if (
        error instanceof StructuralAssumptionReplayError ||
        error instanceof StructuralDerivationReplayError ||
        error instanceof MemoryError
      ) {
        fail("invalid-inner-derivation");
      }
      throw error;
    }

    const outer = readAssumptionScope(memory, evidence.outerAssumptionContext);
    const theory = inner.derivation.theory;
    if (
      outer.theory !== theory ||
      evidence.conclusion.judgment.theory !== theory
    ) {
      fail("scope-theory-mismatch");
    }

    const innerClaims = inner.declaredAssumptionClaims;
    const innerOccurrences = inner.declaredAssumptionOccurrences;
    if (outer.claims.length > innerClaims.length) {
      fail("outer-scope-not-prefix");
    }
    for (let index = 0; index < outer.claims.length; index += 1) {
      if (outer.claims[index] !== innerClaims[index]) {
        fail("outer-scope-not-prefix");
      }
    }

    const localClaims = Object.freeze(innerClaims.slice(outer.claims.length));
    const localOccurrences = Object.freeze(innerOccurrences.slice(outer.claims.length));

    let conclusion: StructuralJudgmentReplayResult;
    try {
      conclusion = replayStructuralJudgment(memory, evidence.conclusion);
    } catch (error) {
      if (
        error instanceof StructuralJudgmentReplayError ||
        error instanceof StructuralRuleError ||
        error instanceof MemoryError
      ) {
        fail("invalid-conclusion");
      }
      throw error;
    }

    let derivationRule: ReturnType<typeof readStructuralDerivationRule>;
    try {
      derivationRule = readStructuralDerivationRule(memory, evidence.derivationRule);
    } catch (error) {
      if (
        error instanceof StructuralDerivationReplayError ||
        error instanceof ExactSequenceError ||
        error instanceof MemoryError
      ) {
        fail("invalid-scoped-evidence");
      }
      throw error;
    }

    if (derivationRule.structuralRule !== evidence.conclusion.application.rule) {
      fail("scoped-rule-mismatch");
    }
    verifyDerivationRuleAdmission(
      memory,
      theory,
      evidence.derivationRule,
      evidence.derivationRuleAdmission,
    );

    const premiseClaims = Object.freeze([
      ...localClaims,
      inner.derivation.target.judgment.claim,
    ]);
    if (derivationRule.premiseTemplates.length !== premiseClaims.length) {
      fail("scoped-premise-count-mismatch");
    }

    for (let index = 0; index < premiseClaims.length; index += 1) {
      const template = derivationRule.premiseTemplates[index];
      const claim = premiseClaims[index];
      if (template === undefined || claim === undefined) {
        fail("scoped-premise-count-mismatch");
      }
      try {
        matchStructuralTemplate(
          memory,
          template,
          claim,
          conclusion.application.bindings,
        );
      } catch (error) {
        if (error instanceof StructuralRuleError || error instanceof MemoryError) {
          fail("scoped-premise-mismatch");
        }
        throw error;
      }
    }

    const usedInner = new Set(inner.usedAssumptionOccurrences);
    const usedOuterAssumptionOccurrences: LinkHandle[] = [];
    for (let index = 0; index < outer.occurrences.length; index += 1) {
      const innerOccurrence = innerOccurrences[index];
      const outerOccurrence = outer.occurrences[index];
      if (innerOccurrence === undefined || outerOccurrence === undefined) {
        fail("invalid-scoped-evidence");
      }
      if (usedInner.has(innerOccurrence)) {
        usedOuterAssumptionOccurrences.push(outerOccurrence);
      }
    }

    const dischargedLocalAssumptionOccurrences = localOccurrences.filter(
      (occurrence) => usedInner.has(occurrence),
    );

    if (memory.linkCount !== beforeCount) fail("scoped-replay-wrote");
    return Object.freeze({
      theory,
      outerAssumptionContext: evidence.outerAssumptionContext,
      outerAssumptionClaims: outer.claims,
      outerAssumptionOccurrences: outer.occurrences,
      localAssumptionClaims: localClaims,
      localAssumptionOccurrences: localOccurrences,
      dischargedLocalAssumptionOccurrences: Object.freeze([
        ...dischargedLocalAssumptionOccurrences,
      ]),
      usedOuterAssumptionOccurrences: Object.freeze([
        ...usedOuterAssumptionOccurrences,
      ]),
      inner,
      conclusion,
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
