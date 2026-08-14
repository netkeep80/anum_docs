import {
  type LinkHandle,
  type ReadMemory,
  type WriteMemory,
} from "./memory.js";
import {
  RootedSequenceError,
  readRootedSequence,
} from "./rooted-sequence.js";

export type SourceErrorCode =
  | "invalid-byte-vocabulary"
  | "invalid-source-content"
  | "invalid-source";

export interface SourceContent {
  readonly bytes: Uint8Array;
  readonly prefixes: readonly LinkHandle[];
}

export class SourceError extends Error {
  override readonly name: string = "SourceError";

  constructor(readonly code: SourceErrorCode) {
    super(code);
  }
}

function byteVocabulary(
  memory: ReadMemory,
  byteRefs: readonly LinkHandle[],
): ReadonlyMap<LinkHandle, number> {
  if (byteRefs.length !== 256 || new Set(byteRefs).size !== 256) {
    throw new SourceError("invalid-byte-vocabulary");
  }

  const inverse = new Map<LinkHandle, number>();
  for (let value = 0; value < byteRefs.length; value += 1) {
    const ref = byteRefs[value];
    if (ref === undefined) {
      throw new SourceError("invalid-byte-vocabulary");
    }
    try {
      memory.poles(ref);
    } catch {
      throw new SourceError("invalid-byte-vocabulary");
    }
    inverse.set(ref, value);
  }
  return inverse;
}

export function materializeSourceContent(
  memory: WriteMemory,
  byteRefs: readonly LinkHandle[],
  bytes: Uint8Array,
): LinkHandle {
  byteVocabulary(memory, byteRefs);
  let current = memory.root;
  for (const value of bytes) {
    const byteRef = byteRefs[value];
    if (byteRef === undefined) {
      throw new SourceError("invalid-byte-vocabulary");
    }
    current = memory.ensure(current, byteRef);
  }
  return current;
}

export function readSourceContent(
  memory: ReadMemory,
  byteRefs: readonly LinkHandle[],
  content: LinkHandle,
): SourceContent {
  const inverse = byteVocabulary(memory, byteRefs);
  let sequence;
  try {
    sequence = readRootedSequence(memory, content);
  } catch (error) {
    if (error instanceof RootedSequenceError) {
      throw new SourceError("invalid-source-content");
    }
    throw error;
  }

  const bytes = new Uint8Array(sequence.values.length);
  for (let index = 0; index < sequence.values.length; index += 1) {
    const value = sequence.values[index];
    if (value === undefined) {
      throw new SourceError("invalid-source-content");
    }
    const byte = inverse.get(value);
    if (byte === undefined) {
      throw new SourceError("invalid-source-content");
    }
    bytes[index] = byte;
  }

  return Object.freeze({
    bytes,
    prefixes: Object.freeze([...sequence.prefixes]),
  });
}

export function defineSourceForm(
  memory: WriteMemory,
  content: LinkHandle,
): LinkHandle {
  try {
    return memory.ensureStartSelfClosed(content);
  } catch {
    throw new SourceError("invalid-source-content");
  }
}

export function readSourceForm(
  memory: ReadMemory,
  source: LinkHandle,
): LinkHandle {
  try {
    const link = memory.poles(source);
    if (link.start !== source) {
      throw new SourceError("invalid-source");
    }
    return link.end;
  } catch (error) {
    if (error instanceof SourceError) {
      throw error;
    }
    throw new SourceError("invalid-source");
  }
}
