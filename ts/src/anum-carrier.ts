import {
  executeAbits,
  type Abit,
  type StackAlgebra,
  type StreamDenotation,
} from "./anum.js";
import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
} from "./memory.js";
import {
  RootedSequenceError,
  readRootedSequence,
} from "./rooted-sequence.js";

export type CarrierInputErrorCode =
  | "invalid-vocabulary"
  | "not-rooted-sequence"
  | "non-abit";

export interface AnumCarrierVocabulary {
  readonly opening: LinkHandle;
  readonly closing: LinkHandle;
  readonly linked: LinkHandle;
  readonly unlinked: LinkHandle;
}

export class CarrierInputError extends Error {
  override readonly name: string = "CarrierInputError";

  constructor(readonly code: CarrierInputErrorCode) {
    super(code);
  }
}

function invalidVocabulary(): never {
  throw new CarrierInputError("invalid-vocabulary");
}

export function validateCarrierVocabulary(
  memory: ReadMemory,
  vocabulary: AnumCarrierVocabulary,
): void {
  const { root } = memory;
  const handles = [
    root,
    vocabulary.opening,
    vocabulary.closing,
    vocabulary.linked,
    vocabulary.unlinked,
  ];
  if (new Set(handles).size !== 5) {
    invalidVocabulary();
  }

  try {
    const opening = memory.poles(vocabulary.opening);
    const closing = memory.poles(vocabulary.closing);
    const linked = memory.poles(vocabulary.linked);
    const unlinked = memory.poles(vocabulary.unlinked);

    if (opening.start !== vocabulary.opening || opening.end !== root) {
      invalidVocabulary();
    }
    if (closing.start !== root || closing.end !== vocabulary.closing) {
      invalidVocabulary();
    }
    if (linked.start !== vocabulary.opening || linked.end !== vocabulary.closing) {
      invalidVocabulary();
    }
    if (unlinked.start !== vocabulary.closing || unlinked.end !== vocabulary.opening) {
      invalidVocabulary();
    }
  } catch (error) {
    if (error instanceof CarrierInputError) {
      throw error;
    }
    if (error instanceof MemoryError) {
      invalidVocabulary();
    }
    throw error;
  }
}

function decodeCarrierAbits(
  memory: ReadMemory,
  carrier: LinkHandle,
  vocabulary: AnumCarrierVocabulary,
): readonly Abit[] {
  validateCarrierVocabulary(memory, vocabulary);

  let sequence;
  try {
    sequence = readRootedSequence(memory, carrier);
  } catch (error) {
    if (error instanceof RootedSequenceError) {
      throw new CarrierInputError("not-rooted-sequence");
    }
    throw error;
  }

  const inverse = new Map<LinkHandle, Abit>([
    [vocabulary.opening, "["],
    [vocabulary.closing, "]"],
    [vocabulary.linked, "1"],
    [vocabulary.unlinked, "0"],
  ]);

  const result: Abit[] = [];
  for (const value of sequence.values) {
    const abit = inverse.get(value);
    if (abit === undefined) {
      throw new CarrierInputError("non-abit");
    }
    result.push(abit);
  }
  return Object.freeze(result);
}

export function decodeCarrierStream(
  memory: ReadMemory,
  carrier: LinkHandle,
  vocabulary: AnumCarrierVocabulary,
): string {
  return decodeCarrierAbits(memory, carrier, vocabulary).join("");
}

export function deserializeCarrier<T>(
  memory: ReadMemory,
  carrier: LinkHandle,
  vocabulary: AnumCarrierVocabulary,
  algebra: StackAlgebra<T>,
): StreamDenotation<T> {
  return executeAbits(decodeCarrierAbits(memory, carrier, vocabulary), algebra);
}
