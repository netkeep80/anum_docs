import {
  ExactSequenceError,
  readExactSequence,
} from "./exact-sequence.js";
import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
  type WriteMemory,
} from "./memory.js";
import {
  appendQuaternaryValue,
  readQuaternaryState,
  QuaternaryStateError,
} from "./quaternary-state.js";
import {
  localRepresentativeResolution,
  readContext,
  StateError,
} from "./state.js";
import {
  readStructuralInterpreter,
  replayStructuralRule,
  StructuralRuleError,
  verifyStructuralInterpreter,
  type StructuralInterpreter,
  type StructuralRuleReplayEvidence,
  type StructuralRuleReplayResult,
} from "./structural-rule.js";

export type ContextIntegrationErrorCode =
  | "invalid-context-typing"
  | "context-interpreter-mismatch"
  | "lexical-parent-mismatch"
  | "invalid-formal-sequence"
  | "empty-formal-context"
  | "formal-close-projection-mismatch"
  | "invalid-quaternary-state"
  | "quaternary-result-mismatch"
  | "equality-evidence-mismatch"
  | "equality-distinguished"
  | "replay-wrote";

export class ContextIntegrationError extends Error {
  override readonly name = "ContextIntegrationError";

  constructor(readonly code: ContextIntegrationErrorCode) {
    super(code);
  }
}

/**
 * `I ⟼ K` is the explicit semantic typing/admission of one immutable context.
 * The host object only bundles the three already materialized structural Links.
 */
export interface TypedContext {
  readonly interpreter: LinkHandle;
  readonly context: LinkHandle;
  readonly typing: LinkHandle;
}

export interface FormalCloseEvidence {
  readonly child: TypedContext;
  readonly parentBefore: TypedContext;
  readonly expectedChildInterpreter: StructuralInterpreter;
  readonly expectedParentInterpreter: StructuralInterpreter;
  readonly result: LinkHandle;
  readonly ruleReplay: StructuralRuleReplayEvidence;
}

export interface FormalCloseResult {
  readonly parentBefore: TypedContext;
  readonly result: LinkHandle;
  readonly replay: StructuralRuleReplayResult;
}

export interface FormalEqualityEvidence extends FormalCloseEvidence {
  readonly resolutionContext: LinkHandle;
  readonly contextRole: LinkHandle;
  readonly leftRole: LinkHandle;
  readonly rightRole: LinkHandle;
  readonly leftRepresentativeRole: LinkHandle;
  readonly rightRepresentativeRole: LinkHandle;
}

export function defineTypedContext(
  memory: WriteMemory,
  interpreter: LinkHandle,
  parent: LinkHandle,
  current: LinkHandle,
): TypedContext {
  readStructuralInterpreter(memory, interpreter);
  const payload = memory.ensure(parent, current);
  const context = memory.ensureStartSelfClosed(payload);
  const typing = memory.ensure(interpreter, context);
  return Object.freeze({ interpreter, context, typing });
}

/** Read-only verification of both K shape and its explicit `I ⟼ K` evidence. */
export function verifyTypedContext(
  memory: ReadMemory,
  typed: TypedContext,
  expectedInterpreter: StructuralInterpreter,
): void {
  try {
    verifyStructuralInterpreter(memory, typed.interpreter, expectedInterpreter);
    const typing = memory.poles(typed.typing);
    if (typing.start !== typed.interpreter || typing.end !== typed.context) {
      throw new ContextIntegrationError("invalid-context-typing");
    }
    readContext(memory, typed.context);
  } catch (error) {
    if (error instanceof ContextIntegrationError) throw error;
    if (error instanceof StructuralRuleError) {
      throw new ContextIntegrationError("context-interpreter-mismatch");
    }
    if (error instanceof StateError || error instanceof MemoryError) {
      throw new ContextIntegrationError("invalid-context-typing");
    }
    throw error;
  }
}

/**
 * OPEN is an explicit context transition. No hidden parser stack is consulted:
 * the lexical parent is the concrete K supplied here and the target I is data.
 */
export function openChildContext(
  memory: WriteMemory,
  parentBefore: TypedContext,
  expectedParentInterpreter: StructuralInterpreter,
  targetInterpreter: LinkHandle,
  initialCurrent: LinkHandle,
): TypedContext {
  verifyTypedContext(memory, parentBefore, expectedParentInterpreter);
  return defineTypedContext(memory, targetInterpreter, parentBefore.context, initialCurrent);
}

/** FORMAL starts at the exact empty sequence `Seq([])=R`. */
export function openFormalContext(
  memory: WriteMemory,
  parentBefore: TypedContext,
  expectedParentInterpreter: StructuralInterpreter,
  formalInterpreter: LinkHandle,
): TypedContext {
  return openChildContext(
    memory,
    parentBefore,
    expectedParentInterpreter,
    formalInterpreter,
    memory.root,
  );
}

/** Q starts at structural QEmpty=R. */
export function openQuaternaryContext(
  memory: WriteMemory,
  parentBefore: TypedContext,
  expectedParentInterpreter: StructuralInterpreter,
  quaternaryInterpreter: LinkHandle,
): TypedContext {
  return openChildContext(
    memory,
    parentBefore,
    expectedParentInterpreter,
    quaternaryInterpreter,
    memory.root,
  );
}

/**
 * PARENT_CONTINUE for FORMAL. A returned `R` is appended as an explicit Cell,
 * so one root-valued child result can never collapse to the empty sequence.
 */
export function continueFormalContext(
  memory: WriteMemory,
  before: TypedContext,
  expectedInterpreter: StructuralInterpreter,
  value: LinkHandle,
): TypedContext {
  verifyTypedContext(memory, before, expectedInterpreter);
  let state;
  try {
    state = readContext(memory, before.context);
    readExactSequence(memory, state.current);
  } catch (error) {
    if (error instanceof ExactSequenceError || error instanceof StateError || error instanceof MemoryError) {
      throw new ContextIntegrationError("invalid-formal-sequence");
    }
    throw error;
  }

  const payload = memory.ensure(state.current, value);
  const current = memory.ensureStartSelfClosed(payload);
  return defineTypedContext(memory, before.interpreter, state.parent, current);
}

/** One immutable Q snapshot; lexical parent is preserved exactly. */
export function continueQuaternaryContext(
  memory: WriteMemory,
  before: TypedContext,
  expectedInterpreter: StructuralInterpreter,
  value: LinkHandle,
): TypedContext {
  verifyTypedContext(memory, before, expectedInterpreter);
  let state;
  try {
    state = readContext(memory, before.context);
    readQuaternaryState(memory, state.current);
  } catch (error) {
    if (error instanceof QuaternaryStateError || error instanceof StateError || error instanceof MemoryError) {
      throw new ContextIntegrationError("invalid-quaternary-state");
    }
    throw error;
  }
  const current = appendQuaternaryValue(memory, state.current, value);
  return defineTypedContext(memory, before.interpreter, state.parent, current);
}

/**
 * Read-only verification of `]`: CLOSE returns to the old lexical parent but
 * does not append there. Parent continuation is a separate explicit operation.
 */
export function replayQuaternaryClose(
  memory: ReadMemory,
  child: TypedContext,
  expectedChildInterpreter: StructuralInterpreter,
  parentBefore: TypedContext,
  expectedParentInterpreter: StructuralInterpreter,
  expectedResult: LinkHandle,
): LinkHandle {
  const before = memory.linkCount;
  try {
    verifyTypedContext(memory, child, expectedChildInterpreter);
    verifyTypedContext(memory, parentBefore, expectedParentInterpreter);
    const childState = readContext(memory, child.context);
    if (childState.parent !== parentBefore.context) {
      throw new ContextIntegrationError("lexical-parent-mismatch");
    }

    const q = readQuaternaryState(memory, childState.current);
    if (!q.started) {
      if (expectedResult !== memory.root) {
        throw new ContextIntegrationError("quaternary-result-mismatch");
      }
    } else {
      const result = memory.poles(expectedResult);
      if (result.start !== memory.root || result.end !== q.current) {
        throw new ContextIntegrationError("quaternary-result-mismatch");
      }
    }
    return expectedResult;
  } catch (error) {
    if (error instanceof ContextIntegrationError) throw error;
    if (error instanceof QuaternaryStateError || error instanceof StateError || error instanceof MemoryError) {
      throw new ContextIntegrationError("quaternary-result-mismatch");
    }
    throw error;
  } finally {
    if (memory.linkCount !== before) {
      throw new ContextIntegrationError("replay-wrote");
    }
  }
}

/**
 * Generic FORMAL `)` replay. Rule selection remains structural: the supplied
 * Act is checked against I/DR/Rule and explicit `T ⟼ Rule` admission by M4.
 * M5 only adds the immutable lexical lifecycle and the exact close projection
 * `[child-form-sequence, semantic-result]`.
 */
export function replayFormalClose(
  memory: ReadMemory,
  evidence: FormalCloseEvidence,
): FormalCloseResult {
  const before = memory.linkCount;
  try {
    verifyTypedContext(memory, evidence.child, evidence.expectedChildInterpreter);
    verifyTypedContext(memory, evidence.parentBefore, evidence.expectedParentInterpreter);

    const childState = readContext(memory, evidence.child.context);
    if (childState.parent !== evidence.parentBefore.context) {
      throw new ContextIntegrationError("lexical-parent-mismatch");
    }

    let form;
    try {
      form = readExactSequence(memory, childState.current);
    } catch (error) {
      if (error instanceof ExactSequenceError || error instanceof MemoryError) {
        throw new ContextIntegrationError("invalid-formal-sequence");
      }
      throw error;
    }
    if (form.values.length === 0) {
      throw new ContextIntegrationError("empty-formal-context");
    }

    if (evidence.ruleReplay.expectedAfterContext !== evidence.parentBefore.context) {
      throw new ContextIntegrationError("formal-close-projection-mismatch");
    }
    const replay = replayStructuralRule(memory, evidence.ruleReplay);
    if (replay.interpreter !== evidence.child.interpreter) {
      throw new ContextIntegrationError("context-interpreter-mismatch");
    }

    let projection;
    try {
      projection = readExactSequence(memory, evidence.ruleReplay.claimedBody);
    } catch (error) {
      if (error instanceof ExactSequenceError || error instanceof MemoryError) {
        throw new ContextIntegrationError("formal-close-projection-mismatch");
      }
      throw error;
    }
    if (
      projection.values.length !== 2 ||
      projection.values[0] !== childState.current ||
      projection.values[1] !== evidence.result
    ) {
      throw new ContextIntegrationError("formal-close-projection-mismatch");
    }

    return Object.freeze({
      parentBefore: evidence.parentBefore,
      result: evidence.result,
      replay,
    });
  } finally {
    if (memory.linkCount !== before) {
      throw new ContextIntegrationError("replay-wrote");
    }
  }
}

function replayBinding(
  replay: StructuralRuleReplayResult,
  role: LinkHandle,
): LinkHandle | undefined {
  return replay.bindings.find((binding) => binding.role === role)?.value;
}

/**
 * Specialized admitted FORMAL `=` judgment. The structural Rule is selected
 * first; this checker merely verifies the context-local representative evidence
 * that generic placeholder matching intentionally cannot derive.
 */
export function replayFormalEquality(
  memory: ReadMemory,
  evidence: FormalEqualityEvidence,
): FormalCloseResult {
  const before = memory.linkCount;
  try {
    const close = replayFormalClose(memory, evidence);
    const context = replayBinding(close.replay, evidence.contextRole);
    const left = replayBinding(close.replay, evidence.leftRole);
    const right = replayBinding(close.replay, evidence.rightRole);
    const leftRepresentative = replayBinding(close.replay, evidence.leftRepresentativeRole);
    const rightRepresentative = replayBinding(close.replay, evidence.rightRepresentativeRole);

    if (
      context === undefined ||
      left === undefined ||
      right === undefined ||
      leftRepresentative === undefined ||
      rightRepresentative === undefined ||
      context !== evidence.resolutionContext ||
      close.result !== memory.root
    ) {
      throw new ContextIntegrationError("equality-evidence-mismatch");
    }

    const actualLeft = localRepresentativeResolution(memory, context, left).representative;
    const actualRight = localRepresentativeResolution(memory, context, right).representative;
    if (actualLeft !== leftRepresentative || actualRight !== rightRepresentative) {
      throw new ContextIntegrationError("equality-evidence-mismatch");
    }
    if (actualLeft !== actualRight) {
      throw new ContextIntegrationError("equality-distinguished");
    }
    return close;
  } catch (error) {
    if (error instanceof ContextIntegrationError || error instanceof StructuralRuleError) throw error;
    if (error instanceof StateError || error instanceof MemoryError) {
      throw new ContextIntegrationError("equality-evidence-mismatch");
    }
    throw error;
  } finally {
    if (memory.linkCount !== before) {
      throw new ContextIntegrationError("replay-wrote");
    }
  }
}
