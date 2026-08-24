import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "./exact-sequence.js";
import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
  type WriteMemory,
} from "./memory.js";

export type SyntaxAsetContractErrorCode =
  | "invalid-aset"
  | "invalid-field-sequence"
  | "invalid-occurrence-sequence"
  | "invalid-child-occurrence"
  | "root-not-final";

export class SyntaxAsetContractError extends Error {
  override readonly name = "SyntaxAsetContractError";

  constructor(readonly code: SyntaxAsetContractErrorCode) {
    super(code);
  }
}

export interface SyntaxAsetVocabulary {
  readonly tag: LinkHandle;
  readonly childRoles: readonly LinkHandle[];
}

export interface SyntaxAsetField {
  readonly role: LinkHandle;
  readonly value: LinkHandle;
}

export interface SyntaxAsetOccurrence {
  readonly occurrence: LinkHandle;
  readonly kind: LinkHandle;
  readonly fields: readonly SyntaxAsetField[];
}

export interface SyntaxAsetRead {
  readonly root: LinkHandle;
  readonly occurrences: readonly SyntaxAsetOccurrence[];
}

function contractError(code: SyntaxAsetContractErrorCode): never {
  throw new SyntaxAsetContractError(code);
}

function isChildRole(
  vocabulary: SyntaxAsetVocabulary,
  role: LinkHandle,
): boolean {
  return vocabulary.childRoles.some((candidate) => candidate === role);
}

function readSequenceOrReject(
  memory: ReadMemory,
  final: LinkHandle,
  code: "invalid-field-sequence" | "invalid-occurrence-sequence",
) {
  try {
    return readExactSequence(memory, final);
  } catch (error) {
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
      return contractError(code);
    }
    throw error;
  }
}

export class SyntaxAsetBuilder {
  private occurrenceOrder: LinkHandle;
  private readonly occurrences = new Set<LinkHandle>();
  private finished = false;

  constructor(
    private readonly memory: WriteMemory,
    private readonly vocabulary: SyntaxAsetVocabulary,
  ) {
    this.occurrenceOrder = memory.root;
  }

  addOccurrence(
    kind: LinkHandle,
    fields: readonly SyntaxAsetField[],
  ): LinkHandle {
    if (this.finished) {
      return contractError("invalid-aset");
    }

    const fieldLinks = fields.map(({ role, value }) => {
      if (isChildRole(this.vocabulary, role) && !this.occurrences.has(value)) {
        return contractError("invalid-child-occurrence");
      }
      return this.memory.ensure(role, value);
    });

    const fieldSequence = materializeExactSequence(this.memory, fieldLinks);
    const descriptor = this.memory.ensure(kind, fieldSequence);
    const payload = this.memory.ensure(this.occurrenceOrder, descriptor);
    const occurrence = this.memory.ensureStartSelfClosed(payload);

    this.occurrenceOrder = occurrence;
    this.occurrences.add(occurrence);
    return occurrence;
  }

  finish(root: LinkHandle): LinkHandle {
    if (
      this.finished ||
      this.occurrenceOrder === this.memory.root ||
      root !== this.occurrenceOrder
    ) {
      return contractError("root-not-final");
    }

    this.finished = true;
    const header = this.memory.ensure(this.occurrenceOrder, root);
    return this.memory.ensure(this.vocabulary.tag, header);
  }
}

export function readSyntaxAset(
  memory: ReadMemory,
  aset: LinkHandle,
  vocabulary: SyntaxAsetVocabulary,
): SyntaxAsetRead {
  let occurrenceOrder: LinkHandle;
  let declaredRoot: LinkHandle;

  try {
    const wrapper = memory.poles(aset);
    if (wrapper.start !== vocabulary.tag) {
      return contractError("invalid-aset");
    }
    const header = memory.poles(wrapper.end);
    occurrenceOrder = header.start;
    declaredRoot = header.end;
  } catch (error) {
    if (error instanceof MemoryError) {
      return contractError("invalid-aset");
    }
    throw error;
  }

  const sequence = readSequenceOrReject(
    memory,
    occurrenceOrder,
    "invalid-occurrence-sequence",
  );

  const finalOccurrence = sequence.cells.at(-1);
  if (finalOccurrence === undefined || declaredRoot !== finalOccurrence) {
    return contractError("root-not-final");
  }

  const priorOccurrences = new Set<LinkHandle>();
  const occurrences: SyntaxAsetOccurrence[] = [];

  for (let index = 0; index < sequence.values.length; index += 1) {
    const descriptor = sequence.values[index];
    const occurrence = sequence.cells[index];
    if (descriptor === undefined || occurrence === undefined) {
      return contractError("invalid-occurrence-sequence");
    }

    let kind: LinkHandle;
    let fieldSequence: LinkHandle;
    try {
      const descriptorPoles = memory.poles(descriptor);
      kind = descriptorPoles.start;
      fieldSequence = descriptorPoles.end;
    } catch (error) {
      if (error instanceof MemoryError) {
        return contractError("invalid-field-sequence");
      }
      throw error;
    }

    const fieldLinks = readSequenceOrReject(
      memory,
      fieldSequence,
      "invalid-field-sequence",
    ).values;

    const fields: SyntaxAsetField[] = [];
    for (const fieldLink of fieldLinks) {
      let role: LinkHandle;
      let value: LinkHandle;
      try {
        const poles = memory.poles(fieldLink);
        role = poles.start;
        value = poles.end;
      } catch (error) {
        if (error instanceof MemoryError) {
          return contractError("invalid-field-sequence");
        }
        throw error;
      }

      if (isChildRole(vocabulary, role) && !priorOccurrences.has(value)) {
        return contractError("invalid-child-occurrence");
      }
      fields.push(Object.freeze({ role, value }));
    }

    occurrences.push(Object.freeze({
      occurrence,
      kind,
      fields: Object.freeze(fields),
    }));
    priorOccurrences.add(occurrence);
  }

  return Object.freeze({
    root: declaredRoot,
    occurrences: Object.freeze(occurrences),
  });
}
