import { MemoryError, type LinkHandle, type ReadMemory } from "./memory.js";
import {
  InterpreterReplayError,
  replayEqualityEvaluation,
  type EqualityReplayEvidence,
} from "./interpreter.js";
import {
  StructuralReadError,
  readRequiredSingle,
  verifyHeader,
} from "./structural-readers.js";

export interface DecomposeEqualityRoles {
  readonly premiseEqualityAct: LinkHandle;
  readonly theory: LinkHandle;
  readonly rule: LinkHandle;
  readonly ruleMembership: LinkHandle;
  readonly leftRelation: LinkHandle;
  readonly rightRelation: LinkHandle;
  readonly startClaim: LinkHandle;
  readonly endClaim: LinkHandle;
  readonly beforeContext: LinkHandle;
  readonly afterContext: LinkHandle;
}

export interface DecomposeEqualityEvidence {
  readonly premise: EqualityReplayEvidence;
  readonly act: LinkHandle;
  readonly roles: DecomposeEqualityRoles;
  readonly interpreter: LinkHandle;
  readonly roleDictionary: LinkHandle;
}

export type ProofRuleReplayErrorCode =
  | "invalid-proof-evidence"
  | "premise-act-mismatch"
  | "invalid-equality-premise"
  | "false-equality-premise"
  | "premise-relation-mismatch"
  | "premise-context-mismatch"
  | "rule-not-admitted"
  | "partial-relation"
  | "forged-start-claim"
  | "forged-end-claim"
  | "context-change"
  | "proof-header-mismatch";

export class ProofRuleReplayError extends Error {
  override readonly name = "ProofRuleReplayError";

  constructor(readonly code: ProofRuleReplayErrorCode) {
    super(code);
  }
}

function fail(code: ProofRuleReplayErrorCode): never {
  throw new ProofRuleReplayError(code);
}

export function replayDecomposeEqualRelations(
  memory: ReadMemory,
  evidence: DecomposeEqualityEvidence,
): readonly [LinkHandle, LinkHandle] {
  const beforeCount = memory.linkCount;
  try {
    const field = (role: LinkHandle): LinkHandle => {
      try {
        return readRequiredSingle(memory, evidence.act, role);
      } catch (error) {
        if (error instanceof StructuralReadError || error instanceof MemoryError) {
          fail("invalid-proof-evidence");
        }
        throw error;
      }
    };

    const premiseAct = field(evidence.roles.premiseEqualityAct);
    const theory = field(evidence.roles.theory);
    const rule = field(evidence.roles.rule);
    const ruleMembership = field(evidence.roles.ruleMembership);
    const leftRelation = field(evidence.roles.leftRelation);
    const rightRelation = field(evidence.roles.rightRelation);
    const startClaim = field(evidence.roles.startClaim);
    const endClaim = field(evidence.roles.endClaim);
    const beforeContext = field(evidence.roles.beforeContext);
    const afterContext = field(evidence.roles.afterContext);

    if (premiseAct !== evidence.premise.act) fail("premise-act-mismatch");

    let premiseTrue: boolean;
    try {
      premiseTrue = replayEqualityEvaluation(memory, evidence.premise);
    } catch (error) {
      if (error instanceof InterpreterReplayError) fail("invalid-equality-premise");
      throw error;
    }
    if (!premiseTrue) fail("false-equality-premise");

    const premiseField = (role: LinkHandle): LinkHandle => {
      try {
        return readRequiredSingle(memory, evidence.premise.act, role);
      } catch (error) {
        if (error instanceof StructuralReadError || error instanceof MemoryError) {
          fail("invalid-equality-premise");
        }
        throw error;
      }
    };
    const premiseContext = premiseField(evidence.premise.roles.context);
    const premiseLeft = premiseField(evidence.premise.roles.left);
    const premiseRight = premiseField(evidence.premise.roles.right);

    if (leftRelation !== premiseLeft || rightRelation !== premiseRight) {
      fail("premise-relation-mismatch");
    }
    if (beforeContext !== premiseContext) fail("premise-context-mismatch");

    const membership = memory.poles(ruleMembership);
    if (membership.start !== theory || membership.end !== rule) {
      fail("rule-not-admitted");
    }

    const left = memory.poles(leftRelation);
    const right = memory.poles(rightRelation);
    if (
      left.start === leftRelation || left.end === leftRelation ||
      right.start === rightRelation || right.end === rightRelation
    ) {
      fail("partial-relation");
    }

    const start = memory.poles(startClaim);
    if (start.start !== left.start || start.end !== right.start) {
      fail("forged-start-claim");
    }
    const end = memory.poles(endClaim);
    if (end.start !== left.end || end.end !== right.end) {
      fail("forged-end-claim");
    }

    if (beforeContext !== afterContext) fail("context-change");

    try {
      verifyHeader(memory, evidence.act, {
        interpreter: evidence.interpreter,
        roleDictionary: evidence.roleDictionary,
        afterContext,
      });
    } catch (error) {
      if (error instanceof StructuralReadError || error instanceof MemoryError) {
        fail("proof-header-mismatch");
      }
      throw error;
    }

    if (memory.linkCount !== beforeCount) fail("invalid-proof-evidence");
    return Object.freeze([startClaim, endClaim]) as readonly [LinkHandle, LinkHandle];
  } catch (error) {
    if (error instanceof ProofRuleReplayError) throw error;
    if (error instanceof MemoryError) {
      throw new ProofRuleReplayError("invalid-proof-evidence");
    }
    throw error;
  } finally {
    if (memory.linkCount !== beforeCount) {
      throw new ProofRuleReplayError("invalid-proof-evidence");
    }
  }
}
