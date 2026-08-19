import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
  type WriteMemory,
} from "./memory.js";

export type QuaternaryStateErrorCode = "invalid-quaternary-state";

export type QuaternaryState =
  | { readonly started: false }
  | { readonly started: true; readonly current: LinkHandle };

export class QuaternaryStateError extends Error {
  override readonly name: string = "QuaternaryStateError";

  constructor(readonly code: QuaternaryStateErrorCode) {
    super(code);
  }
}

/**
 * `R` является единственным пустым состоянием. Непустое состояние выражается
 * канонической start-selfclosed Link над текущим Q-аккумулятором. Это делает
 * прежний host-флаг `started` производным чтением структуры, а не семантикой.
 */
export function readQuaternaryState(
  memory: ReadMemory,
  state: LinkHandle,
): QuaternaryState {
  if (state === memory.root) {
    return Object.freeze({ started: false });
  }

  try {
    const link = memory.poles(state);
    if (link.start !== state) {
      throw new QuaternaryStateError("invalid-quaternary-state");
    }
    return Object.freeze({ started: true, current: link.end });
  } catch (error) {
    if (error instanceof QuaternaryStateError) {
      throw error;
    }
    if (error instanceof MemoryError) {
      throw new QuaternaryStateError("invalid-quaternary-state");
    }
    throw error;
  }
}

export function appendQuaternaryValue(
  memory: WriteMemory,
  state: LinkHandle,
  value: LinkHandle,
): LinkHandle {
  const current = readQuaternaryState(memory, state);
  if (!current.started) {
    return memory.ensureStartSelfClosed(value);
  }
  return memory.ensureStartSelfClosed(memory.ensure(current.current, value));
}

/** Возвращает accepted top-level denotation, не создавая новых Links. */
export function finalizeQuaternaryState(
  memory: ReadMemory,
  state: LinkHandle,
): LinkHandle {
  const current = readQuaternaryState(memory, state);
  return current.started ? current.current : memory.root;
}

/** Явная материализация значения, возвращаемого закрытием одной Q-группы. */
export function closeQuaternaryState(
  memory: WriteMemory,
  state: LinkHandle,
): LinkHandle {
  const current = readQuaternaryState(memory, state);
  return current.started
    ? memory.ensure(memory.root, current.current)
    : memory.root;
}
