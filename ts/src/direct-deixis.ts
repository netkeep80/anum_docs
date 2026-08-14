import type { LinkHandle, ReadMemory } from "./memory.js";
import { readRootedSequence } from "./rooted-sequence.js";

export type DeicticPole = "start" | "end";

export interface DeicticOccurrence {
  readonly path: readonly number[];
  readonly up: number;
  readonly pole: DeicticPole;
}

export interface DirectDeixisVocabulary {
  readonly nodeTag: LinkHandle;
  readonly opaqueTag: LinkHandle;
  readonly pronounTag: LinkHandle;
  readonly upStep: LinkHandle;
  readonly startPole: LinkHandle;
  readonly endPole: LinkHandle;
}

export class DirectDeixisReplayError extends Error {
  override readonly name = "DirectDeixisReplayError";
  constructor(readonly code: "invalid-direct-deixis-evidence") { super(code); }
}

function invalid(): never {
  throw new DirectDeixisReplayError("invalid-direct-deixis-evidence");
}

function expectPoles(
  memory: ReadMemory,
  ref: LinkHandle,
  start: LinkHandle,
  end: LinkHandle,
): void {
  const poles = memory.poles(ref);
  if (poles.start !== start || poles.end !== end) invalid();
}

function validateVocabulary(memory: ReadMemory, vocabulary: DirectDeixisVocabulary): void {
  const refs = [
    vocabulary.nodeTag,
    vocabulary.opaqueTag,
    vocabulary.pronounTag,
    vocabulary.upStep,
    vocabulary.startPole,
    vocabulary.endPole,
  ];
  if (new Set(refs).size !== refs.length) invalid();
  try {
    expectPoles(memory, vocabulary.startPole, vocabulary.startPole, memory.root);
    expectPoles(memory, vocabulary.endPole, memory.root, vocabulary.endPole);
    expectPoles(memory, vocabulary.nodeTag, vocabulary.startPole, vocabulary.endPole);
    expectPoles(memory, vocabulary.opaqueTag, vocabulary.endPole, vocabulary.startPole);
    expectPoles(memory, vocabulary.pronounTag, vocabulary.nodeTag, vocabulary.opaqueTag);
    expectPoles(memory, vocabulary.upStep, vocabulary.opaqueTag, vocabulary.nodeTag);
  } catch (error) {
    if (error instanceof DirectDeixisReplayError) throw error;
    invalid();
  }
}

function decodePronoun(
  memory: ReadMemory,
  metadata: LinkHandle,
  vocabulary: DirectDeixisVocabulary,
): { readonly up: number; readonly pole: DeicticPole } {
  const values = readRootedSequence(memory, metadata).values;
  if (values.length === 0) invalid();
  const marker = values[values.length - 1];
  const pole: DeicticPole = marker === vocabulary.startPole
    ? "start"
    : marker === vocabulary.endPole
      ? "end"
      : invalid();
  for (let index = 0; index < values.length - 1; index += 1) {
    if (values[index] !== vocabulary.upStep) invalid();
  }
  return Object.freeze({ up: values.length - 1, pole });
}

export function analyzeDirectDeixisCarrier(
  memory: ReadMemory,
  carrier: LinkHandle,
  vocabulary: DirectDeixisVocabulary,
): readonly DeicticOccurrence[] {
  const before = memory.linkCount;
  try {
    validateVocabulary(memory, vocabulary);
    const occurrences: DeicticOccurrence[] = [];
    const active = new Set<LinkHandle>();

    const visit = (current: LinkHandle, path: readonly number[]): void => {
      if (active.has(current)) invalid();
      active.add(current);
      try {
        const poles = memory.poles(current);
        if (poles.start === vocabulary.opaqueTag) {
          if (poles.end !== memory.root) invalid();
          return;
        }
        if (poles.start === vocabulary.pronounTag) {
          const metadata = decodePronoun(memory, poles.end, vocabulary);
          occurrences.push(Object.freeze({ path: Object.freeze([...path]), ...metadata }));
          return;
        }
        if (poles.start === vocabulary.nodeTag) {
          const children = readRootedSequence(memory, poles.end).values;
          children.forEach((child, index) => visit(child, [...path, index]));
          return;
        }
        invalid();
      } finally {
        active.delete(current);
      }
    };

    visit(carrier, []);
    if (memory.linkCount !== before) invalid();
    return Object.freeze(occurrences);
  } catch (error) {
    if (error instanceof DirectDeixisReplayError) throw error;
    throw new DirectDeixisReplayError("invalid-direct-deixis-evidence");
  }
}
