import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
  type WriteMemory,
} from "./memory.js";

export type StateErrorCode = "invalid-context" | "representative-conflict";

export interface ContextState {
  readonly parent: LinkHandle;
  readonly current: LinkHandle;
}

export interface LocalRepresentativeResolution {
  readonly member: LinkHandle;
  readonly representative: LinkHandle;
  readonly bindings: readonly LinkHandle[];
}

export class StateError extends Error {
  override readonly name: string = "StateError";

  constructor(readonly code: StateErrorCode) {
    super(code);
  }
}

export function defineContext(
  memory: WriteMemory,
  parent: LinkHandle,
  current: LinkHandle,
): LinkHandle {
  const payload = memory.ensure(parent, current);
  return memory.ensureStartSelfClosed(payload);
}

export function readContext(
  memory: ReadMemory,
  context: LinkHandle,
): ContextState {
  try {
    const contextLink = memory.poles(context);
    // Явный K имеет однополюсную форму START(payload). Полностью
    // самозамкнутый ROOT не является альтернативной кодировкой того же K.
    if (contextLink.start !== context || contextLink.end === context) {
      throw new StateError("invalid-context");
    }
    const payload = memory.poles(contextLink.end);
    return Object.freeze({ parent: payload.start, current: payload.end });
  } catch (error) {
    if (error instanceof StateError) {
      throw error;
    }
    if (error instanceof MemoryError) {
      throw new StateError("invalid-context");
    }
    throw error;
  }
}

export function parentOfContext(
  memory: ReadMemory,
  context: LinkHandle,
): LinkHandle {
  return readContext(memory, context).parent;
}

export function currentOfContext(
  memory: ReadMemory,
  context: LinkHandle,
): LinkHandle {
  return readContext(memory, context).current;
}

export function defineLocalRepresentativeBinding(
  memory: WriteMemory,
  context: LinkHandle,
  member: LinkHandle,
  representative: LinkHandle,
): LinkHandle {
  const pair = memory.ensure(member, representative);
  return memory.ensure(context, pair);
}

export function localRepresentativeResolution(
  memory: ReadMemory,
  context: LinkHandle,
  member: LinkHandle,
): LocalRepresentativeResolution {
  // Validation is explicit and also guarantees that `outgoing(context)` is a
  // query over an issued handle in this Memory.
  readContext(memory, context);

  const matches: Array<{
    readonly binding: LinkHandle;
    readonly representative: LinkHandle;
  }> = [];

  // Python scanned every Link. The indexed Memory already exposes precisely the
  // candidate attachments whose start pole is the selected context.
  for (const binding of memory.outgoing(context)) {
    if (binding === context) {
      continue;
    }
    const attachment = memory.poles(binding);
    if (attachment.start !== context) {
      continue;
    }
    const pair = memory.poles(attachment.end);
    if (pair.start === member) {
      matches.push({ binding, representative: pair.end });
    }
  }

  if (matches.length === 0) {
    return Object.freeze({
      member,
      representative: member,
      bindings: Object.freeze([]),
    });
  }

  const representatives = new Set(matches.map((match) => match.representative));
  if (representatives.size !== 1) {
    throw new StateError("representative-conflict");
  }

  const representative = matches[0]?.representative;
  if (representative === undefined) {
    throw new Error("internal representative resolution invariant violated");
  }

  return Object.freeze({
    member,
    representative,
    bindings: Object.freeze(matches.map((match) => match.binding)),
  });
}

export function localRepresentative(
  memory: ReadMemory,
  context: LinkHandle,
  member: LinkHandle,
): LinkHandle {
  return localRepresentativeResolution(memory, context, member).representative;
}
