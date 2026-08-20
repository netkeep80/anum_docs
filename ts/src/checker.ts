import { MemoryError, type LinkHandle, type ReadMemory } from "./memory.js";
import {
  SourceError,
  replaySelectedSourceEvidence,
  type SourceFrontEndEvidence,
} from "./source.js";
import {
  InterpreterReplayError,
  replayEqualityEvaluation,
} from "./interpreter.js";
import {
  ProofRuleReplayError,
  replayDecomposeEqualRelations,
  type DecomposeEqualityEvidence,
} from "./proof.js";
import {
  RunReplayError,
  replayRun,
  type RunEvidence,
} from "./run.js";
import {
  StructuralReadError,
  readRequiredSingle,
} from "./structural-readers.js";

export interface ProofGoalSelection {
  readonly startClaim: LinkHandle;
  readonly endClaim: LinkHandle;
}

export interface ProofJudgmentSelection {
  readonly theory: LinkHandle;
  readonly context: LinkHandle;
  readonly goal: ProofGoalSelection;
}

export interface IntegratedProofEvidence {
  readonly source: SourceFrontEndEvidence;
  readonly ruleApplication: DecomposeEqualityEvidence;
  readonly run: RunEvidence;
  readonly judgment: ProofJudgmentSelection;
}

export type IntegratedCheckerErrorCode =
  | "invalid-integrated-evidence"
  | "judgment-theory-mismatch"
  | "judgment-context-mismatch"
  | "invalid-source-evidence"
  | "source-rule-mismatch"
  | "source-theory-mismatch"
  | "invalid-equality-premise"
  | "false-equality-premise"
  | "proof-context-mismatch"
  | "invalid-rule-application"
  | "goal-mismatch"
  | "run-context-mismatch"
  | "invalid-run"
  | "run-acts-mismatch";

export class IntegratedCheckerError extends Error {
  override readonly name = "IntegratedCheckerError";

  constructor(readonly code: IntegratedCheckerErrorCode) {
    super(code);
  }
}

function fail(code: IntegratedCheckerErrorCode): never {
  throw new IntegratedCheckerError(code);
}

function field(
  memory: ReadMemory,
  act: LinkHandle,
  role: LinkHandle,
): LinkHandle {
  try {
    return readRequiredSingle(memory, act, role);
  } catch (error) {
    if (error instanceof StructuralReadError || error instanceof MemoryError) {
      fail("invalid-integrated-evidence");
    }
    throw error;
  }
}

export function replayIntegratedProof(
  memory: ReadMemory,
  evidence: IntegratedProofEvidence,
): readonly [LinkHandle, LinkHandle] {
  const beforeCount = memory.linkCount;
  try {
    const proof = evidence.ruleApplication;
    const proofTheory = field(memory, proof.act, proof.roles.theory);
    const proofRule = field(memory, proof.act, proof.roles.rule);
    const proofBefore = field(memory, proof.act, proof.roles.beforeContext);
    const proofAfter = field(memory, proof.act, proof.roles.afterContext);
    const proofStartClaim = field(memory, proof.act, proof.roles.startClaim);
    const proofEndClaim = field(memory, proof.act, proof.roles.endClaim);
    const premiseContext = field(
      memory,
      proof.premise.act,
      proof.premise.roles.context,
    );

    if (proofTheory !== evidence.judgment.theory) {
      fail("judgment-theory-mismatch");
    }
    if (premiseContext !== evidence.judgment.context) {
      fail("judgment-context-mismatch");
    }

    let selectedForms: readonly LinkHandle[];
    try {
      selectedForms = replaySelectedSourceEvidence(memory, evidence.source);
    } catch (error) {
      if (error instanceof SourceError || error instanceof MemoryError) {
        fail("invalid-source-evidence");
      }
      throw error;
    }
    if (selectedForms.length !== 1 || selectedForms[0] !== proofRule) {
      fail("source-rule-mismatch");
    }
    if (evidence.source.theory !== evidence.judgment.theory) {
      fail("source-theory-mismatch");
    }

    let premiseTrue: boolean;
    try {
      premiseTrue = replayEqualityEvaluation(memory, proof.premise);
    } catch (error) {
      if (error instanceof InterpreterReplayError || error instanceof MemoryError) {
        fail("invalid-equality-premise");
      }
      throw error;
    }
    if (!premiseTrue) fail("false-equality-premise");

    if (
      proofBefore !== evidence.judgment.context ||
      proofAfter !== evidence.judgment.context
    ) {
      fail("proof-context-mismatch");
    }

    let claims: readonly [LinkHandle, LinkHandle];
    try {
      claims = replayDecomposeEqualRelations(memory, proof);
    } catch (error) {
      if (error instanceof ProofRuleReplayError || error instanceof MemoryError) {
        fail("invalid-rule-application");
      }
      throw error;
    }
    if (
      claims[0] !== proofStartClaim ||
      claims[1] !== proofEndClaim ||
      claims[0] !== evidence.judgment.goal.startClaim ||
      claims[1] !== evidence.judgment.goal.endClaim
    ) {
      fail("goal-mismatch");
    }

    if (
      evidence.run.initialContext !== evidence.judgment.context ||
      evidence.run.terminalContext !== evidence.judgment.context
    ) {
      fail("run-context-mismatch");
    }

    let acts: readonly LinkHandle[];
    try {
      acts = replayRun(memory, evidence.run);
    } catch (error) {
      if (error instanceof RunReplayError || error instanceof MemoryError) {
        fail("invalid-run");
      }
      throw error;
    }
    if (
      acts.length !== 2 ||
      acts[0] !== proof.premise.act ||
      acts[1] !== proof.act
    ) {
      fail("run-acts-mismatch");
    }

    if (memory.linkCount !== beforeCount) fail("invalid-integrated-evidence");
    return Object.freeze([claims[0], claims[1]]) as readonly [LinkHandle, LinkHandle];
  } catch (error) {
    if (error instanceof IntegratedCheckerError) throw error;
    if (error instanceof MemoryError) {
      throw new IntegratedCheckerError("invalid-integrated-evidence");
    }
    throw error;
  } finally {
    if (memory.linkCount !== beforeCount) {
      throw new IntegratedCheckerError("invalid-integrated-evidence");
    }
  }
}
