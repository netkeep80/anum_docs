import { MemoryError, type LinkHandle, type ReadMemory } from "./memory.js";
import { StateError, readContext } from "./state.js";
import {
  StructuralReadError,
  readActHeader,
  readRequiredSingle,
} from "./structural-readers.js";

export interface RunStepSelection {
  readonly act: LinkHandle;
  readonly beforeRole: LinkHandle;
  readonly afterRole: LinkHandle;
}

export interface RunEvidence {
  readonly runRoot: LinkHandle;
  readonly initialContext: LinkHandle;
  readonly terminalContext: LinkHandle;
  readonly steps: readonly RunStepSelection[];
}

export type RunReplayErrorCode =
  | "invalid-run-evidence"
  | "run-chain-ended-early"
  | "run-chain-act-mismatch"
  | "run-chain-extra-prefix"
  | "invalid-step-before-field"
  | "invalid-step-after-field"
  | "invalid-step-before-context"
  | "invalid-step-after-context"
  | "step-header-after-context-mismatch"
  | "initial-context-mismatch"
  | "context-discontinuity"
  | "terminal-context-mismatch"
  | "empty-run-root-mismatch"
  | "empty-run-context-change"
  | "invalid-empty-run-context";

export class RunReplayError extends Error {
  override readonly name = "RunReplayError";

  constructor(readonly code: RunReplayErrorCode) {
    super(code);
  }
}

function fail(code: RunReplayErrorCode): never {
  throw new RunReplayError(code);
}

function verifyRunChain(memory: ReadMemory, evidence: RunEvidence): void {
  let current = evidence.runRoot;
  for (let index = evidence.steps.length - 1; index >= 0; index -= 1) {
    const step = evidence.steps[index];
    if (step === undefined) {
      fail("invalid-run-evidence");
    }
    if (current === memory.root) {
      fail("run-chain-ended-early");
    }
    const cell = memory.poles(current);
    if (cell.end !== step.act) {
      fail("run-chain-act-mismatch");
    }
    current = cell.start;
  }
  if (current !== memory.root) {
    fail("run-chain-extra-prefix");
  }
}

function readStepContext(
  memory: ReadMemory,
  step: RunStepSelection,
  role: LinkHandle,
  fieldError: RunReplayErrorCode,
  contextError: RunReplayErrorCode,
): LinkHandle {
  let context: LinkHandle;
  try {
    context = readRequiredSingle(memory, step.act, role);
  } catch (error) {
    if (error instanceof StructuralReadError || error instanceof MemoryError) {
      fail(fieldError);
    }
    throw error;
  }
  try {
    readContext(memory, context);
  } catch (error) {
    if (error instanceof StateError || error instanceof MemoryError) {
      fail(contextError);
    }
    throw error;
  }
  return context;
}

export function replayRun(
  memory: ReadMemory,
  evidence: RunEvidence,
): readonly LinkHandle[] {
  const before = memory.linkCount;
  try {
    if (evidence.steps.length === 0) {
      if (evidence.runRoot !== memory.root) {
        // Validate ownership before reporting the semantic root mismatch so a
        // foreign/forged technical handle still fails at the Memory boundary.
        memory.poles(evidence.runRoot);
        fail("empty-run-root-mismatch");
      }
      if (evidence.initialContext !== evidence.terminalContext) {
        fail("empty-run-context-change");
      }
      try {
        readContext(memory, evidence.initialContext);
      } catch (error) {
        if (error instanceof StateError || error instanceof MemoryError) {
          fail("invalid-empty-run-context");
        }
        throw error;
      }
      return Object.freeze([]);
    }

    verifyRunChain(memory, evidence);

    const acts: LinkHandle[] = [];
    let previousAfter: LinkHandle | undefined;

    evidence.steps.forEach((step, index) => {
      const beforeContext = readStepContext(
        memory,
        step,
        step.beforeRole,
        "invalid-step-before-field",
        "invalid-step-before-context",
      );
      const afterContext = readStepContext(
        memory,
        step,
        step.afterRole,
        "invalid-step-after-field",
        "invalid-step-after-context",
      );

      let headerAfter: LinkHandle;
      try {
        headerAfter = readActHeader(memory, step.act).afterContext;
      } catch (error) {
        if (error instanceof StructuralReadError || error instanceof MemoryError) {
          fail("invalid-run-evidence");
        }
        throw error;
      }
      if (headerAfter !== afterContext) {
        fail("step-header-after-context-mismatch");
      }

      if (index === 0 && beforeContext !== evidence.initialContext) {
        fail("initial-context-mismatch");
      }
      if (previousAfter !== undefined && beforeContext !== previousAfter) {
        fail("context-discontinuity");
      }
      previousAfter = afterContext;
      acts.push(step.act);
    });

    if (previousAfter !== evidence.terminalContext) {
      fail("terminal-context-mismatch");
    }
    return Object.freeze(acts);
  } catch (error) {
    if (error instanceof RunReplayError) {
      throw error;
    }
    if (error instanceof MemoryError) {
      throw new RunReplayError("invalid-run-evidence");
    }
    throw error;
  } finally {
    if (memory.linkCount !== before) {
      throw new RunReplayError("invalid-run-evidence");
    }
  }
}
