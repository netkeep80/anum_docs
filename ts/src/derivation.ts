import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "./exact-sequence.js";
import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
  type WriteMemory,
} from "./memory.js";
import { StateError, readContext } from "./state.js";
import {
  StructuralRuleError,
  matchStructuralTemplate,
  replayStructuralRule,
  type StructuralRuleReplayEvidence,
  type StructuralRuleReplayResult,
} from "./structural-rule.js";

export interface StructuralJudgment {
  readonly theory: LinkHandle;
  readonly context: LinkHandle;
  readonly claim: LinkHandle;
}

export interface StructuralJudgmentEvidence {
  readonly application: StructuralRuleReplayEvidence;
  readonly judgment: StructuralJudgment;
}

export interface StructuralJudgmentReplayResult {
  readonly judgment: StructuralJudgment;
  readonly application: StructuralRuleReplayResult;
}

export type StructuralJudgmentReplayErrorCode =
  | "invalid-judgment-evidence"
  | "invalid-judgment-context"
  | "invalid-rule-application"
  | "judgment-theory-mismatch"
  | "judgment-context-mismatch"
  | "judgment-claim-mismatch";

export class StructuralJudgmentReplayError extends Error {
  override readonly name = "StructuralJudgmentReplayError";

  constructor(readonly code: StructuralJudgmentReplayErrorCode) {
    super(code);
  }
}

function fail(code: StructuralJudgmentReplayErrorCode): never {
  throw new StructuralJudgmentReplayError(code);
}

/**
 * Generic one-step mathematical judgment replay.
 *
 * The Rule semantics remain entirely in replayStructuralRule. This layer only
 * binds the verified application to an explicit (Theory, Context, Claim)
 * selection. Premise/dependency semantics intentionally belong to the later
 * derivation layer rather than being inferred from host ordering here.
 */
export function replayStructuralJudgment(
  memory: ReadMemory,
  evidence: StructuralJudgmentEvidence,
): StructuralJudgmentReplayResult {
  const beforeCount = memory.linkCount;
  try {
    try {
      memory.poles(evidence.judgment.theory);
      memory.poles(evidence.judgment.claim);
    } catch (error) {
      if (error instanceof MemoryError) {
        fail("invalid-judgment-evidence");
      }
      throw error;
    }

    try {
      readContext(memory, evidence.judgment.context);
    } catch (error) {
      if (error instanceof StateError || error instanceof MemoryError) {
        fail("invalid-judgment-context");
      }
      throw error;
    }

    let application: StructuralRuleReplayResult;
    try {
      application = replayStructuralRule(memory, evidence.application);
    } catch (error) {
      if (error instanceof StructuralRuleError || error instanceof MemoryError) {
        fail("invalid-rule-application");
      }
      throw error;
    }

    if (application.interpreterStructure.theory !== evidence.judgment.theory) {
      fail("judgment-theory-mismatch");
    }
    if (application.afterContext !== evidence.judgment.context) {
      fail("judgment-context-mismatch");
    }
    if (application.claimedBody !== evidence.judgment.claim) {
      fail("judgment-claim-mismatch");
    }
    if (memory.linkCount !== beforeCount) {
      fail("invalid-judgment-evidence");
    }

    return Object.freeze({
      judgment: Object.freeze({ ...evidence.judgment }),
      application,
    });
  } catch (error) {
    if (error instanceof StructuralJudgmentReplayError) throw error;
    if (error instanceof MemoryError) {
      throw new StructuralJudgmentReplayError("invalid-judgment-evidence");
    }
    throw error;
  } finally {
    if (memory.linkCount !== beforeCount) {
      throw new StructuralJudgmentReplayError("invalid-judgment-evidence");
    }
  }
}

export interface StructuralProofOccurrence {
  readonly act: LinkHandle;
  readonly claim: LinkHandle;
}

export interface StructuralDerivationRule {
  readonly structuralRule: LinkHandle;
  readonly premiseTemplateSequence: LinkHandle;
  readonly premiseTemplates: readonly LinkHandle[];
}

export interface StructuralDerivationNodeEvidence {
  readonly occurrence: LinkHandle;
  readonly judgment: StructuralJudgmentEvidence;
  readonly derivationRule: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
  readonly premiseOccurrenceSequence: LinkHandle;
}

export interface StructuralDerivationEvidence {
  readonly theory: LinkHandle;
  readonly targetOccurrence: LinkHandle;
  /** Transport only: proof identity/dependencies come from structural Links. */
  readonly nodes: readonly StructuralDerivationNodeEvidence[];
}

export interface StructuralDerivationReplayResult {
  readonly theory: LinkHandle;
  readonly targetOccurrence: LinkHandle;
  readonly target: StructuralJudgmentReplayResult;
  readonly occurrenceCount: number;
}

export type StructuralDerivationReplayErrorCode =
  | "invalid-derivation-evidence"
  | "duplicate-occurrence"
  | "target-occurrence-not-found"
  | "invalid-node-judgment"
  | "cross-theory-node"
  | "occurrence-mismatch"
  | "invalid-derivation-rule"
  | "derivation-rule-mismatch"
  | "derivation-rule-not-admitted"
  | "missing-premise"
  | "extra-premise"
  | "dependency-occurrence-not-found"
  | "premise-claim-mismatch"
  | "cyclic-dependency"
  | "unreachable-node"
  | "derivation-replay-wrote";

export class StructuralDerivationReplayError extends Error {
  override readonly name = "StructuralDerivationReplayError";

  constructor(readonly code: StructuralDerivationReplayErrorCode) {
    super(code);
  }
}

function derivationFail(code: StructuralDerivationReplayErrorCode): never {
  throw new StructuralDerivationReplayError(code);
}

/**
 * Proof-history occurrence = Pair(Claim, Act). Claim starts the relation so
 * occurrence metadata cannot enter the structural outgoing(Act) field namespace.
 */
export function defineStructuralProofOccurrence(
  memory: WriteMemory,
  act: LinkHandle,
  claim: LinkHandle,
): LinkHandle {
  return memory.ensure(claim, act);
}

export function readStructuralProofOccurrence(
  memory: ReadMemory,
  occurrence: LinkHandle,
): StructuralProofOccurrence {
  try {
    const poles = memory.poles(occurrence);
    return Object.freeze({ act: poles.end, claim: poles.start });
  } catch (error) {
    if (error instanceof MemoryError) {
      throw new StructuralDerivationReplayError("invalid-derivation-evidence");
    }
    throw error;
  }
}

/**
 * Extends an existing StructuralRule with explicit premise templates. The
 * conclusion matcher remains the existing StructuralRule/replay kernel.
 */
export function defineStructuralDerivationRule(
  memory: WriteMemory,
  structuralRule: LinkHandle,
  premiseTemplates: readonly LinkHandle[],
): LinkHandle {
  const premiseTemplateSequence = materializeExactSequence(memory, premiseTemplates);
  return memory.ensure(structuralRule, premiseTemplateSequence);
}

export function readStructuralDerivationRule(
  memory: ReadMemory,
  derivationRule: LinkHandle,
): StructuralDerivationRule {
  try {
    const poles = memory.poles(derivationRule);
    const sequence = readExactSequence(memory, poles.end);
    return Object.freeze({
      structuralRule: poles.start,
      premiseTemplateSequence: poles.end,
      premiseTemplates: Object.freeze([...sequence.values]),
    });
  } catch (error) {
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
      throw new StructuralDerivationReplayError("invalid-derivation-rule");
    }
    throw error;
  }
}

export function admitStructuralDerivationRule(
  memory: WriteMemory,
  theory: LinkHandle,
  derivationRule: LinkHandle,
): LinkHandle {
  return memory.ensure(theory, derivationRule);
}

function verifyStructuralDerivationRuleAdmission(
  memory: ReadMemory,
  theory: LinkHandle,
  derivationRule: LinkHandle,
  admission: LinkHandle,
): void {
  try {
    const poles = memory.poles(admission);
    if (poles.start !== theory || poles.end !== derivationRule) {
      derivationFail("derivation-rule-not-admitted");
    }
  } catch (error) {
    if (error instanceof StructuralDerivationReplayError) throw error;
    if (error instanceof MemoryError) {
      derivationFail("derivation-rule-not-admitted");
    }
    throw error;
  }
}

interface VerifiedDerivationNode {
  readonly evidence: StructuralDerivationNodeEvidence;
  readonly judgment: StructuralJudgmentReplayResult;
  readonly premiseOccurrences: readonly LinkHandle[];
  readonly premiseTemplates: readonly LinkHandle[];
}

interface StructuralDerivationReplayOptions {
  readonly assumptionClaimsByOccurrence?: ReadonlyMap<LinkHandle, LinkHandle>;
  readonly usedAssumptions?: Set<LinkHandle>;
}

/**
 * The single trusted dependency replay core. Ordinary P2 calls it without an
 * assumption resolver. P3b supplies a structural occurrence->Claim map that was
 * independently reconstructed from one explicit assumption context.
 */
function replayStructuralDerivationCore(
  memory: ReadMemory,
  evidence: StructuralDerivationEvidence,
  options?: StructuralDerivationReplayOptions,
): StructuralDerivationReplayResult {
  const beforeCount = memory.linkCount;
  try {
    try {
      memory.poles(evidence.theory);
      memory.poles(evidence.targetOccurrence);
    } catch (error) {
      if (error instanceof MemoryError) {
        derivationFail("invalid-derivation-evidence");
      }
      throw error;
    }

    const nodes = new Map<LinkHandle, StructuralDerivationNodeEvidence>();
    for (const node of evidence.nodes) {
      try {
        memory.poles(node.occurrence);
      } catch (error) {
        if (error instanceof MemoryError) {
          derivationFail("invalid-derivation-evidence");
        }
        throw error;
      }
      if (nodes.has(node.occurrence)) {
        derivationFail("duplicate-occurrence");
      }
      nodes.set(node.occurrence, node);
    }

    if (!nodes.has(evidence.targetOccurrence)) {
      derivationFail("target-occurrence-not-found");
    }

    const active = new Set<LinkHandle>();
    const verified = new Map<LinkHandle, VerifiedDerivationNode>();

    const verifyNode = (occurrence: LinkHandle): VerifiedDerivationNode => {
      const cached = verified.get(occurrence);
      if (cached !== undefined) return cached;
      if (active.has(occurrence)) {
        derivationFail("cyclic-dependency");
      }

      const node = nodes.get(occurrence);
      if (node === undefined) {
        try {
          memory.poles(occurrence);
        } catch (error) {
          if (error instanceof MemoryError) {
            derivationFail("invalid-derivation-evidence");
          }
          throw error;
        }
        derivationFail("dependency-occurrence-not-found");
      }

      active.add(occurrence);
      try {
        let judgment: StructuralJudgmentReplayResult;
        try {
          judgment = replayStructuralJudgment(memory, node.judgment);
        } catch (error) {
          if (error instanceof StructuralJudgmentReplayError || error instanceof MemoryError) {
            derivationFail("invalid-node-judgment");
          }
          throw error;
        }

        if (judgment.judgment.theory !== evidence.theory) {
          derivationFail("cross-theory-node");
        }

        const occurrenceStructure = readStructuralProofOccurrence(memory, occurrence);
        if (
          occurrenceStructure.act !== node.judgment.application.act ||
          occurrenceStructure.claim !== judgment.judgment.claim
        ) {
          derivationFail("occurrence-mismatch");
        }

        const derivationRule = readStructuralDerivationRule(memory, node.derivationRule);
        if (derivationRule.structuralRule !== node.judgment.application.rule) {
          derivationFail("derivation-rule-mismatch");
        }
        verifyStructuralDerivationRuleAdmission(
          memory,
          evidence.theory,
          node.derivationRule,
          node.derivationRuleAdmission,
        );

        let premiseOccurrences: readonly LinkHandle[];
        try {
          premiseOccurrences = Object.freeze([
            ...readExactSequence(memory, node.premiseOccurrenceSequence).values,
          ]);
        } catch (error) {
          if (error instanceof ExactSequenceError || error instanceof MemoryError) {
            derivationFail("invalid-derivation-evidence");
          }
          throw error;
        }

        if (premiseOccurrences.length < derivationRule.premiseTemplates.length) {
          derivationFail("missing-premise");
        }
        if (premiseOccurrences.length > derivationRule.premiseTemplates.length) {
          derivationFail("extra-premise");
        }

        premiseOccurrences.forEach((dependencyOccurrence, index) => {
          try {
            memory.poles(dependencyOccurrence);
          } catch (error) {
            if (error instanceof MemoryError) {
              derivationFail("invalid-derivation-evidence");
            }
            throw error;
          }

          const proofDependency = nodes.has(dependencyOccurrence);
          const assumptionClaim = options?.assumptionClaimsByOccurrence?.get(dependencyOccurrence);
          if (proofDependency && assumptionClaim !== undefined) {
            assumptionFail("ambiguous-dependency");
          }

          let dependencyClaim: LinkHandle;
          if (proofDependency) {
            dependencyClaim = verifyNode(dependencyOccurrence).judgment.judgment.claim;
          } else if (assumptionClaim !== undefined) {
            options?.usedAssumptions?.add(dependencyOccurrence);
            dependencyClaim = assumptionClaim;
          } else if (options?.assumptionClaimsByOccurrence !== undefined) {
            assumptionFail("dependency-not-resolved");
          } else {
            derivationFail("dependency-occurrence-not-found");
          }

          const template = derivationRule.premiseTemplates[index];
          if (template === undefined) {
            derivationFail("extra-premise");
          }
          try {
            matchStructuralTemplate(
              memory,
              template,
              dependencyClaim,
              judgment.application.bindings,
            );
          } catch (error) {
            if (error instanceof StructuralRuleError || error instanceof MemoryError) {
              derivationFail("premise-claim-mismatch");
            }
            throw error;
          }
        });

        const result: VerifiedDerivationNode = Object.freeze({
          evidence: node,
          judgment,
          premiseOccurrences,
          premiseTemplates: derivationRule.premiseTemplates,
        });
        verified.set(occurrence, result);
        return result;
      } finally {
        active.delete(occurrence);
      }
    };

    const target = verifyNode(evidence.targetOccurrence);
    if (verified.size !== nodes.size) {
      derivationFail("unreachable-node");
    }
    if (memory.linkCount !== beforeCount) {
      derivationFail("derivation-replay-wrote");
    }

    return Object.freeze({
      theory: evidence.theory,
      targetOccurrence: evidence.targetOccurrence,
      target: target.judgment,
      occurrenceCount: verified.size,
    });
  } catch (error) {
    if (
      error instanceof StructuralDerivationReplayError ||
      error instanceof StructuralAssumptionReplayError
    ) {
      throw error;
    }
    if (error instanceof MemoryError || error instanceof ExactSequenceError) {
      throw new StructuralDerivationReplayError("invalid-derivation-evidence");
    }
    throw error;
  } finally {
    if (memory.linkCount !== beforeCount) {
      throw new StructuralDerivationReplayError("derivation-replay-wrote");
    }
  }
}

/**
 * Read-only replay of the exact dependency closure selected by targetOccurrence.
 * `nodes[]` is transport only: it is indexed by structural ProofOccurrence Links,
 * while premise order comes from two structural ExactSequence values.
 */
export function replayStructuralDerivation(
  memory: ReadMemory,
  evidence: StructuralDerivationEvidence,
): StructuralDerivationReplayResult {
  return replayStructuralDerivationCore(memory, evidence);
}

export interface StructuralDerivationWithAssumptionsEvidence {
  readonly derivation: StructuralDerivationEvidence;
  readonly assumptionContext: LinkHandle;
}

export interface StructuralDerivationWithAssumptionsReplayResult {
  readonly derivation: StructuralDerivationReplayResult;
  readonly assumptionContext: LinkHandle;
  readonly declaredAssumptionClaims: readonly LinkHandle[];
  readonly declaredAssumptionOccurrences: readonly LinkHandle[];
  readonly usedAssumptionOccurrences: readonly LinkHandle[];
}

export type StructuralAssumptionReplayErrorCode =
  | "invalid-assumption-context"
  | "assumption-theory-mismatch"
  | "duplicate-assumption"
  | "missing-assumption-occurrence"
  | "ambiguous-dependency"
  | "dependency-not-resolved"
  | "invalid-assumption-derivation"
  | "assumption-replay-wrote";

export class StructuralAssumptionReplayError extends Error {
  override readonly name = "StructuralAssumptionReplayError";

  constructor(readonly code: StructuralAssumptionReplayErrorCode) {
    super(code);
  }
}

function assumptionFail(code: StructuralAssumptionReplayErrorCode): never {
  throw new StructuralAssumptionReplayError(code);
}

/**
 * Internal construction vocabulary for tests/importers inside the package.
 * The package root intentionally does not expose this helper: a consumer must
 * submit already-materialized structural evidence to the replay boundary.
 */
export function defineStructuralAssumptionContext(
  memory: WriteMemory,
  theory: LinkHandle,
  claims: readonly LinkHandle[],
): LinkHandle {
  const scope = materializeExactSequence(memory, [theory, ...claims]);
  for (const claim of claims) {
    memory.ensure(scope, claim);
  }
  return scope;
}

interface ReadStructuralAssumptionContextResult {
  readonly theory: LinkHandle;
  readonly claims: readonly LinkHandle[];
  readonly occurrences: readonly LinkHandle[];
  readonly claimsByOccurrence: ReadonlyMap<LinkHandle, LinkHandle>;
}

function readStructuralAssumptionContext(
  memory: ReadMemory,
  assumptionContext: LinkHandle,
): ReadStructuralAssumptionContextResult {
  let values: readonly LinkHandle[];
  try {
    values = readExactSequence(memory, assumptionContext).values;
  } catch (error) {
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
      assumptionFail("invalid-assumption-context");
    }
    throw error;
  }

  const theory = values[0];
  if (theory === undefined) {
    assumptionFail("invalid-assumption-context");
  }
  const claims = values.slice(1);
  const unique = new Set<LinkHandle>();
  const occurrences: LinkHandle[] = [];
  const claimsByOccurrence = new Map<LinkHandle, LinkHandle>();

  for (const claim of claims) {
    try {
      memory.poles(claim);
    } catch (error) {
      if (error instanceof MemoryError) {
        assumptionFail("invalid-assumption-context");
      }
      throw error;
    }
    if (unique.has(claim)) {
      assumptionFail("duplicate-assumption");
    }
    unique.add(claim);

    let occurrence: LinkHandle | undefined;
    try {
      occurrence = memory.find(assumptionContext, claim);
    } catch (error) {
      if (error instanceof MemoryError) {
        assumptionFail("invalid-assumption-context");
      }
      throw error;
    }
    if (occurrence === undefined) {
      assumptionFail("missing-assumption-occurrence");
    }
    occurrences.push(occurrence);
    claimsByOccurrence.set(occurrence, claim);
  }

  return Object.freeze({
    theory,
    claims: Object.freeze([...claims]),
    occurrences: Object.freeze([...occurrences]),
    claimsByOccurrence,
  });
}

/**
 * Read-only conditional derivation replay. Assumptions are scoped structural
 * roots, never fake Acts, zero-premise proofs, or Theory admissions. The same
 * P2 replay core verifies all actual rule applications and template matches.
 */
export function replayStructuralDerivationWithAssumptions(
  memory: ReadMemory,
  evidence: StructuralDerivationWithAssumptionsEvidence,
): StructuralDerivationWithAssumptionsReplayResult {
  const beforeCount = memory.linkCount;
  try {
    let context: ReadStructuralAssumptionContextResult;
    try {
      context = readStructuralAssumptionContext(memory, evidence.assumptionContext);
    } catch (error) {
      if (error instanceof StructuralAssumptionReplayError) throw error;
      if (error instanceof MemoryError || error instanceof ExactSequenceError) {
        assumptionFail("invalid-assumption-context");
      }
      throw error;
    }

    if (context.theory !== evidence.derivation.theory) {
      assumptionFail("assumption-theory-mismatch");
    }

    const used = new Set<LinkHandle>();
    let derivation: StructuralDerivationReplayResult;
    try {
      derivation = replayStructuralDerivationCore(memory, evidence.derivation, {
        assumptionClaimsByOccurrence: context.claimsByOccurrence,
        usedAssumptions: used,
      });
    } catch (error) {
      if (error instanceof StructuralAssumptionReplayError) throw error;
      if (error instanceof StructuralDerivationReplayError || error instanceof MemoryError) {
        assumptionFail("invalid-assumption-derivation");
      }
      throw error;
    }

    const usedAssumptionOccurrences = context.occurrences.filter((occurrence) => used.has(occurrence));
    if (memory.linkCount !== beforeCount) {
      assumptionFail("assumption-replay-wrote");
    }

    return Object.freeze({
      derivation,
      assumptionContext: evidence.assumptionContext,
      declaredAssumptionClaims: context.claims,
      declaredAssumptionOccurrences: context.occurrences,
      usedAssumptionOccurrences: Object.freeze([...usedAssumptionOccurrences]),
    });
  } catch (error) {
    if (error instanceof StructuralAssumptionReplayError) throw error;
    if (error instanceof MemoryError || error instanceof ExactSequenceError) {
      throw new StructuralAssumptionReplayError("invalid-assumption-context");
    }
    throw error;
  } finally {
    if (memory.linkCount !== beforeCount) {
      throw new StructuralAssumptionReplayError("assumption-replay-wrote");
    }
  }
}

export interface StructuralTheorem {
  readonly claim: LinkHandle;
  readonly theory: LinkHandle;
}

export interface StructuralTheoremEvidence {
  readonly theorem: LinkHandle;
  readonly proof: StructuralDerivationEvidence;
}

export interface StructuralTheoremReplayResult {
  readonly theorem: LinkHandle;
  readonly identity: StructuralTheorem;
  readonly proof: StructuralDerivationReplayResult;
}

export type StructuralTheoremReplayErrorCode =
  | "invalid-theorem-evidence"
  | "theorem-proof-theory-mismatch"
  | "invalid-theorem-proof"
  | "theorem-claim-mismatch"
  | "theorem-replay-wrote";

export class StructuralTheoremReplayError extends Error {
  override readonly name = "StructuralTheoremReplayError";

  constructor(readonly code: StructuralTheoremReplayErrorCode) {
    super(code);
  }
}

function theoremFail(code: StructuralTheoremReplayErrorCode): never {
  throw new StructuralTheoremReplayError(code);
}

/**
 * Derived theorem identity = Pair(Claim, Theory). The Claim-first orientation
 * keeps theorem metadata out of outgoing(Theory), which is reserved for
 * explicit theory admissions. The Link alone has no proof authority.
 */
export function defineStructuralTheorem(
  memory: WriteMemory,
  claim: LinkHandle,
  theory: LinkHandle,
): LinkHandle {
  return memory.ensure(claim, theory);
}

export function readStructuralTheorem(
  memory: ReadMemory,
  theorem: LinkHandle,
): StructuralTheorem {
  try {
    const poles = memory.poles(theorem);
    return Object.freeze({ claim: poles.start, theory: poles.end });
  } catch (error) {
    if (error instanceof MemoryError) {
      theoremFail("invalid-theorem-evidence");
    }
    throw error;
  }
}

/**
 * Read-only proof-carrying theorem replay. The theorem Link is only structural
 * identity; truth is established every time by replaying its complete P2 proof.
 */
export function replayStructuralTheorem(
  memory: ReadMemory,
  evidence: StructuralTheoremEvidence,
): StructuralTheoremReplayResult {
  const beforeCount = memory.linkCount;
  try {
    const identity = readStructuralTheorem(memory, evidence.theorem);
    if (evidence.proof.theory !== identity.theory) {
      theoremFail("theorem-proof-theory-mismatch");
    }

    let proof: StructuralDerivationReplayResult;
    try {
      proof = replayStructuralDerivation(memory, evidence.proof);
    } catch (error) {
      if (error instanceof StructuralDerivationReplayError || error instanceof MemoryError) {
        theoremFail("invalid-theorem-proof");
      }
      throw error;
    }

    if (proof.target.judgment.claim !== identity.claim) {
      theoremFail("theorem-claim-mismatch");
    }
    if (memory.linkCount !== beforeCount) {
      theoremFail("theorem-replay-wrote");
    }

    return Object.freeze({ theorem: evidence.theorem, identity, proof });
  } catch (error) {
    if (error instanceof StructuralTheoremReplayError) throw error;
    if (error instanceof MemoryError) {
      throw new StructuralTheoremReplayError("invalid-theorem-evidence");
    }
    throw error;
  } finally {
    if (memory.linkCount !== beforeCount) {
      throw new StructuralTheoremReplayError("theorem-replay-wrote");
    }
  }
}

export interface StructuralDerivationWithTheoremsEvidence {
  readonly derivation: StructuralDerivationEvidence;
  readonly theorems: readonly StructuralTheoremEvidence[];
}

export interface StructuralDerivationWithTheoremsReplayResult {
  readonly derivation: StructuralDerivationReplayResult;
  readonly theorems: readonly StructuralTheoremReplayResult[];
}

export type StructuralTheoremReuseReplayErrorCode =
  | "invalid-reused-theorem"
  | "theorem-reuse-theory-mismatch"
  | "theorem-reuse-replay-wrote";

export class StructuralTheoremReuseReplayError extends Error {
  override readonly name = "StructuralTheoremReuseReplayError";

  constructor(readonly code: StructuralTheoremReuseReplayErrorCode) {
    super(code);
  }
}

function theoremReuseFail(code: StructuralTheoremReuseReplayErrorCode): never {
  throw new StructuralTheoremReuseReplayError(code);
}

/**
 * Proof-carrying theorem reuse by expansion. Reusable theorem proofs are first
 * replayed independently, then their complete P2 nodes are grafted into the
 * consuming derivation and the final exact target closure is replayed again.
 * No theorem/cache/hash boolean can replace the proof nodes.
 */
export function replayStructuralDerivationWithTheorems(
  memory: ReadMemory,
  evidence: StructuralDerivationWithTheoremsEvidence,
): StructuralDerivationWithTheoremsReplayResult {
  const beforeCount = memory.linkCount;
  try {
    const theoremResults: StructuralTheoremReplayResult[] = [];
    const theoremNodes: StructuralDerivationNodeEvidence[] = [];

    for (const theoremEvidence of evidence.theorems) {
      let theorem: StructuralTheoremReplayResult;
      try {
        theorem = replayStructuralTheorem(memory, theoremEvidence);
      } catch (error) {
        if (error instanceof StructuralTheoremReplayError || error instanceof MemoryError) {
          theoremReuseFail("invalid-reused-theorem");
        }
        throw error;
      }
      if (theorem.identity.theory !== evidence.derivation.theory) {
        theoremReuseFail("theorem-reuse-theory-mismatch");
      }
      theoremResults.push(theorem);
      theoremNodes.push(...theoremEvidence.proof.nodes);
    }

    const derivation = replayStructuralDerivation(memory, {
      ...evidence.derivation,
      nodes: Object.freeze([...evidence.derivation.nodes, ...theoremNodes]),
    });

    if (memory.linkCount !== beforeCount) {
      theoremReuseFail("theorem-reuse-replay-wrote");
    }
    return Object.freeze({
      derivation,
      theorems: Object.freeze([...theoremResults]),
    });
  } catch (error) {
    if (
      error instanceof StructuralTheoremReuseReplayError ||
      error instanceof StructuralDerivationReplayError
    ) {
      throw error;
    }
    if (error instanceof MemoryError) {
      throw new StructuralTheoremReuseReplayError("invalid-reused-theorem");
    }
    throw error;
  } finally {
    if (memory.linkCount !== beforeCount) {
      throw new StructuralTheoremReuseReplayError("theorem-reuse-replay-wrote");
    }
  }
}
