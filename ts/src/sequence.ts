import type { LinkHandle, ReadMemory } from "./memory.js";

export type SequenceItem =
  | { readonly kind: "atom"; readonly value: LinkHandle }
  | { readonly kind: "group"; readonly items: readonly SequenceItem[] };

export interface SequenceDescription {
  readonly root: LinkHandle;
  readonly items: readonly SequenceItem[];
}

export class SequenceReplayError extends Error {
  override readonly name = "SequenceReplayError";
  constructor(readonly code: "invalid-sequence-evidence") { super(code); }
}

function invalid(): never {
  throw new SequenceReplayError("invalid-sequence-evidence");
}

function validateHandle(memory: ReadMemory, link: LinkHandle): void {
  try { memory.poles(link); }
  catch { invalid(); }
}

function validateInputs(
  memory: ReadMemory,
  forms: readonly LinkHandle[],
  openForm: LinkHandle,
  closeForm: LinkHandle,
): void {
  validateHandle(memory, openForm);
  validateHandle(memory, closeForm);
  if (openForm === closeForm) invalid();
  for (const form of forms) validateHandle(memory, form);
}

export function replayRootOpeningRestoration(
  memory: ReadMemory,
  forms: readonly LinkHandle[],
  openForm: LinkHandle,
  closeForm: LinkHandle,
): readonly LinkHandle[] {
  const before = memory.linkCount;
  validateInputs(memory, forms, openForm, closeForm);
  if (forms.length === 0 || forms[0] !== openForm) return forms;

  let balance = 0;
  let minimum = 0;
  for (const form of forms) {
    if (form === openForm) balance += 1;
    else if (form === closeForm) balance -= 1;
    minimum = Math.min(minimum, balance);
  }
  const result = minimum < 0
    ? Object.freeze([...Array<LinkHandle>(-minimum).fill(openForm), ...forms])
    : forms;
  if (memory.linkCount !== before) invalid();
  return result;
}

export function replayResolvedSequenceGrouping(
  memory: ReadMemory,
  forms: readonly LinkHandle[],
  openForm: LinkHandle,
  closeForm: LinkHandle,
): SequenceDescription {
  const before = memory.linkCount;
  validateInputs(memory, forms, openForm, closeForm);

  const rootItems: SequenceItem[] = [];
  const stack: SequenceItem[][] = [rootItems];
  for (const form of forms) {
    if (form === openForm) {
      stack.push([]);
      continue;
    }
    if (form === closeForm) {
      if (stack.length === 1) invalid();
      const items = stack.pop();
      if (items === undefined) invalid();
      stack[stack.length - 1]!.push(Object.freeze({
        kind: "group" as const,
        items: Object.freeze(items),
      }));
      continue;
    }
    stack[stack.length - 1]!.push(Object.freeze({ kind: "atom" as const, value: form }));
  }
  if (stack.length !== 1) invalid();
  if (memory.linkCount !== before) invalid();
  return Object.freeze({ root: memory.root, items: Object.freeze(rootItems) });
}
