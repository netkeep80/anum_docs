import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
} from "./memory.js";
import { StateError, readContext } from "./state.js";
import {
  StructuralRuleError,
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
