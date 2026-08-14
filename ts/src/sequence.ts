import type { LinkHandle, ReadMemory, WriteMemory } from "./memory.js";

export type SequenceItem =
  | { readonly kind: "atom"; readonly value: LinkHandle }
  | { readonly kind: "group"; readonly items: readonly SequenceItem[] };

export interface SequenceDescription {
  readonly root: LinkHandle;
  readonly items: readonly SequenceItem[];
}

export interface MaterializedEdge {
  readonly ref: LinkHandle;
  readonly start: LinkHandle;
  readonly end: LinkHandle;
}

export interface SequenceMaterializationEffect {
  readonly description: SequenceDescription;
  readonly result: LinkHandle;
  readonly created: readonly MaterializedEdge[];
  readonly linkCountBefore: number;
  readonly linkCountAfter: number;
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

function validateDescription(memory: ReadMemory, description: SequenceDescription): void {
  if (description.root !== memory.root) invalid();
  const visit = (items: readonly SequenceItem[]): void => {
    for (const item of items) {
      if (item.kind === "atom") validateHandle(memory, item.value);
      else visit(item.items);
    }
  };
  visit(description.items);
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

function materializeItems(
  memory: WriteMemory,
  items: readonly SequenceItem[],
  created: MaterializedEdge[],
): LinkHandle {
  const values = items.map((item) => item.kind === "atom"
    ? item.value
    : materializeItems(memory, item.items, created));
  if (values.length === 0) return memory.root;
  let result = values[0]!;
  for (let index = 1; index < values.length; index += 1) {
    const end = values[index]!;
    const existing = memory.find(result, end);
    const ref = memory.ensure(result, end);
    if (existing !== undefined) {
      if (ref !== existing) invalid();
    } else {
      created.push(Object.freeze({ ref, start: result, end }));
    }
    result = ref;
  }
  return result;
}

export function materializeSequence(
  memory: WriteMemory,
  description: SequenceDescription,
): SequenceMaterializationEffect {
  validateDescription(memory, description);
  const linkCountBefore = memory.linkCount;
  const created: MaterializedEdge[] = [];
  const result = materializeItems(memory, description.items, created);
  const linkCountAfter = memory.linkCount;
  if (linkCountAfter !== linkCountBefore + created.length) invalid();
  return Object.freeze({
    description,
    result,
    created: Object.freeze(created),
    linkCountBefore,
    linkCountAfter,
  });
}

function replayItems(memory: ReadMemory, items: readonly SequenceItem[]): LinkHandle {
  const values = items.map((item) => item.kind === "atom"
    ? item.value
    : replayItems(memory, item.items));
  if (values.length === 0) return memory.root;
  let result = values[0]!;
  for (let index = 1; index < values.length; index += 1) {
    const ref = memory.find(result, values[index]!);
    if (ref === undefined) invalid();
    result = ref;
  }
  return result;
}

export function replaySequenceMaterialization(
  memory: ReadMemory,
  effect: SequenceMaterializationEffect,
): LinkHandle {
  const before = memory.linkCount;
  validateDescription(memory, effect.description);
  const required = new Set<LinkHandle>();
  const collect = (items: readonly SequenceItem[]): LinkHandle => {
    const values = items.map((item) => item.kind === "atom" ? item.value : collect(item.items));
    if (values.length === 0) return memory.root;
    let result = values[0]!;
    for (let index = 1; index < values.length; index += 1) {
      const ref = memory.find(result, values[index]!);
      if (ref === undefined) invalid();
      required.add(ref);
      result = ref;
    }
    return result;
  };
  const result = collect(effect.description.items);
  if (result !== effect.result) invalid();

  const seen = new Set<LinkHandle>();
  for (const edge of effect.created) {
    validateHandle(memory, edge.ref);
    if (seen.has(edge.ref) || !required.has(edge.ref)) invalid();
    seen.add(edge.ref);
    const poles = memory.poles(edge.ref);
    if (poles.start !== edge.start || poles.end !== edge.end) invalid();
    if (memory.find(edge.start, edge.end) !== edge.ref) invalid();
  }
  if (effect.linkCountAfter !== effect.linkCountBefore + effect.created.length) invalid();
  if (memory.linkCount !== before) invalid();
  return result;
}
