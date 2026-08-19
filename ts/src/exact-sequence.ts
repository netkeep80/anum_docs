import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
  type WriteMemory,
} from "./memory.js";

export type ExactSequenceErrorCode = "not-exact-sequence";

export interface ExactSequence {
  readonly values: readonly LinkHandle[];
  readonly cells: readonly LinkHandle[];
}

export class ExactSequenceError extends Error {
  override readonly name: string = "ExactSequenceError";

  constructor(readonly code: ExactSequenceErrorCode) {
    super(code);
  }
}

/**
 * Канонический носитель точной последовательности, в которой `R` допустим как
 * обычное значение позиции. Позиция выражается рекурсивной self-closed Cell,
 * а не копией значения, длиной host-массива или техническим ID.
 */
export function materializeExactSequence(
  memory: WriteMemory,
  values: readonly LinkHandle[],
): LinkHandle {
  let current = memory.root;
  for (const value of values) {
    const payload = memory.ensure(current, value);
    current = memory.ensureStartSelfClosed(payload);
  }
  return current;
}

/**
 * Читает только каноническую роль `Cell(prev,value)=self⟼(prev⟼value)`.
 * Никакие отсутствующие Links при проверке не материализуются.
 */
export function readExactSequence(
  memory: ReadMemory,
  final: LinkHandle,
): ExactSequence {
  if (final === memory.root) {
    return Object.freeze({
      values: Object.freeze([]),
      cells: Object.freeze([]),
    });
  }

  const reversedValues: LinkHandle[] = [];
  const reversedCells: LinkHandle[] = [];
  const visited = new Set<LinkHandle>();
  let current = final;

  try {
    while (current !== memory.root) {
      if (visited.has(current)) {
        throw new ExactSequenceError("not-exact-sequence");
      }
      visited.add(current);

      const cell = memory.poles(current);
      if (cell.start !== current) {
        throw new ExactSequenceError("not-exact-sequence");
      }

      const payload = memory.poles(cell.end);
      reversedCells.push(current);
      reversedValues.push(payload.end);
      current = payload.start;
    }
  } catch (error) {
    if (error instanceof ExactSequenceError) {
      throw error;
    }
    if (error instanceof MemoryError) {
      throw new ExactSequenceError("not-exact-sequence");
    }
    throw error;
  }

  return Object.freeze({
    values: Object.freeze([...reversedValues].reverse()),
    cells: Object.freeze([...reversedCells].reverse()),
  });
}
