import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
  type WriteMemory,
} from "./memory.js";

export type DictionaryErrorCode =
  | "invalid-scope"
  | "scope-parent-cycle"
  | "local-history-cycle"
  | "invalid-predecessor-snapshot"
  | "local-form-conflict"
  | "source-not-visible"
  | "visible-form-mismatch"
  | "occurrence-not-visible";

export interface DictionaryScope {
  readonly parentScope: LinkHandle;
  readonly localHistory: LinkHandle;
}

export interface DictionaryEffectRefs {
  readonly entry: LinkHandle;
  readonly occurrence: LinkHandle;
  readonly historyAfter: LinkHandle;
  readonly afterScope: LinkHandle;
}

export interface ScopedDictionaryResolution {
  readonly scope: LinkHandle;
  readonly form: LinkHandle;
  readonly occurrences: readonly LinkHandle[];
}

export class DictionaryError extends Error {
  override readonly name: string = "DictionaryError";

  constructor(readonly code: DictionaryErrorCode) {
    super(code);
  }
}

export function defineDictionaryScope(
  memory: WriteMemory,
  parentScope: LinkHandle,
  localHistory: LinkHandle,
): LinkHandle {
  const payload = memory.ensure(parentScope, localHistory);
  return memory.ensureStartSelfClosed(payload);
}

export function readDictionaryScope(
  memory: ReadMemory,
  dictionary: LinkHandle,
): DictionaryScope {
  if (dictionary === memory.root) {
    throw new DictionaryError("invalid-scope");
  }

  try {
    const scope = memory.poles(dictionary);
    if (scope.start !== dictionary) {
      throw new DictionaryError("invalid-scope");
    }
    const payload = memory.poles(scope.end);
    return Object.freeze({
      parentScope: payload.start,
      localHistory: payload.end,
    });
  } catch (error) {
    if (error instanceof DictionaryError) {
      throw error;
    }
    if (error instanceof MemoryError) {
      throw new DictionaryError("invalid-scope");
    }
    throw error;
  }
}

export function defineDictionaryEffect(
  memory: WriteMemory,
  beforeScope: LinkHandle,
  parentScope: LinkHandle,
  historyBefore: LinkHandle,
  sourceContent: LinkHandle,
  form: LinkHandle,
): DictionaryEffectRefs {
  const entry = memory.ensure(sourceContent, form);
  const occurrence = memory.ensure(beforeScope, entry);
  const historyAfter = memory.ensure(historyBefore, occurrence);
  const afterScope = defineDictionaryScope(memory, parentScope, historyAfter);
  return Object.freeze({ entry, occurrence, historyAfter, afterScope });
}

interface LocalMatch {
  readonly occurrence: LinkHandle;
  readonly form: LinkHandle;
}

function localDictionaryMatches(
  memory: ReadMemory,
  parentScope: LinkHandle,
  localHistory: LinkHandle,
  sourceContent: LinkHandle,
): readonly LocalMatch[] {
  const matches: LocalMatch[] = [];
  const visitedHistory = new Set<LinkHandle>();
  let history = localHistory;

  while (history !== memory.root) {
    if (visitedHistory.has(history)) {
      throw new DictionaryError("local-history-cycle");
    }
    visitedHistory.add(history);

    const cell = memory.poles(history);
    const previousHistory = cell.start;
    const occurrence = cell.end;
    const occurrenceLink = memory.poles(occurrence);
    const beforeScope = occurrenceLink.start;
    const entryRef = occurrenceLink.end;

    const before = readDictionaryScope(memory, beforeScope);
    if (
      before.parentScope !== parentScope ||
      before.localHistory !== previousHistory
    ) {
      throw new DictionaryError("invalid-predecessor-snapshot");
    }

    const entry = memory.poles(entryRef);
    if (entry.start === sourceContent) {
      matches.push(Object.freeze({ occurrence, form: entry.end }));
    }
    history = previousHistory;
  }

  return Object.freeze(matches);
}

export function lookupScopedDictionary(
  memory: ReadMemory,
  dictionary: LinkHandle,
  sourceContent: LinkHandle,
): ScopedDictionaryResolution | undefined {
  const visitedScopes = new Set<LinkHandle>();
  let currentScope = dictionary;

  while (currentScope !== memory.root) {
    if (visitedScopes.has(currentScope)) {
      throw new DictionaryError("scope-parent-cycle");
    }
    visitedScopes.add(currentScope);

    const scope = readDictionaryScope(memory, currentScope);
    const local = localDictionaryMatches(
      memory,
      scope.parentScope,
      scope.localHistory,
      sourceContent,
    );

    if (local.length > 0) {
      const forms = new Set(local.map((match) => match.form));
      if (forms.size !== 1) {
        throw new DictionaryError("local-form-conflict");
      }
      const form = local[0]?.form;
      if (form === undefined) {
        throw new Error("internal dictionary resolution invariant violated");
      }
      return Object.freeze({
        scope: currentScope,
        form,
        occurrences: Object.freeze(local.map((match) => match.occurrence)),
      });
    }

    currentScope = scope.parentScope;
  }

  return undefined;
}

export function verifyVisibleDictionaryOccurrence(
  memory: ReadMemory,
  dictionary: LinkHandle,
  occurrence: LinkHandle,
  sourceContent: LinkHandle,
  form: LinkHandle,
): void {
  const resolution = lookupScopedDictionary(memory, dictionary, sourceContent);
  if (resolution === undefined) {
    throw new DictionaryError("source-not-visible");
  }
  if (resolution.form !== form) {
    throw new DictionaryError("visible-form-mismatch");
  }
  if (!resolution.occurrences.includes(occurrence)) {
    throw new DictionaryError("occurrence-not-visible");
  }
}
