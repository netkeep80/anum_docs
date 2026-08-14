import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
} from "./memory.js";

export interface RootedSequence {
  readonly values: readonly LinkHandle[];
  readonly prefixes: readonly LinkHandle[];
}

export class RootedSequenceError extends Error {
  override readonly name: string = "RootedSequenceError";

  constructor(readonly code: "not-rooted-sequence") {
    super(code);
  }
}

export function readRootedSequence(
  memory: ReadMemory,
  final: LinkHandle,
): RootedSequence {
  const { root } = memory;
  if (final === root) {
    return Object.freeze({
      values: Object.freeze([]),
      prefixes: Object.freeze([root]),
    });
  }

  const reversedValues: LinkHandle[] = [];
  const reversedPrefixes: LinkHandle[] = [final];
  const visited = new Set<LinkHandle>();
  let current = final;

  try {
    while (current !== root) {
      if (visited.has(current)) {
        throw new RootedSequenceError("not-rooted-sequence");
      }
      visited.add(current);
      const link = memory.poles(current);
      reversedValues.push(link.end);
      current = link.start;
      reversedPrefixes.push(current);
    }
  } catch (error) {
    if (error instanceof RootedSequenceError) {
      throw error;
    }
    if (error instanceof MemoryError) {
      throw new RootedSequenceError("not-rooted-sequence");
    }
    throw error;
  }

  return Object.freeze({
    values: Object.freeze([...reversedValues].reverse()),
    prefixes: Object.freeze([...reversedPrefixes].reverse()),
  });
}
