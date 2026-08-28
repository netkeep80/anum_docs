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

interface TriadRead {
  readonly relation: LinkHandle;
  readonly subject: LinkHandle;
  readonly object: LinkHandle;
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

function materializeTriad(
  memory: WriteMemory,
  relation: LinkHandle,
  subject: LinkHandle,
  object: LinkHandle,
): LinkHandle {
  return memory.ensure(relation, memory.ensure(subject, object));
}

function readTriad(
  memory: ReadMemory,
  entity: LinkHandle,
  code: "invalid-field-sequence" | "invalid-occurrence-sequence",
): TriadRead {
  try {
    const vertical = memory.poles(entity);
    const horizontal = memory.poles(vertical.end);
    return Object.freeze({
      relation: vertical.start,
      subject: horizontal.start,
      object: horizontal.end,
    });
  } catch (error) {
    if (error instanceof MemoryError) return contractError(code);
    throw error;
  }
}

function readFieldChain(
  memory: ReadMemory,
  final: LinkHandle,
): readonly SyntaxAsetField[] {
  const reversed: SyntaxAsetField[] = [];
  const visited = new Set<LinkHandle>();
  let current = final;

  while (current !== memory.root) {
    if (visited.has(current)) return contractError("invalid-field-sequence");
    visited.add(current);
    const fact = readTriad(memory, current, "invalid-field-sequence");
    reversed.push(Object.freeze({ role: fact.relation, value: fact.object }));
    current = fact.subject;
  }

  return Object.freeze(reversed.reverse());
}

/**
 * Canonical syntax-only chained-triad topology selected by #970:
 *
 *   T(r, s, o) = r ⟼ (s ⟼ o)
 *   F0 = R
 *   Fi = T(role_i, F(i-1), value_i)
 *   O0 = R
 *   Oi = T(kind_i, O(i-1), Fi)
 *   SyntaxAset = SyntaxTag ⟼ O_last
 *
 * The previous field/occurrence entity is part of the next entity's poles, so
 * equal-looking repeated fields and occurrences stay structurally distinct
 * without UUIDs, source offsets, host indexes or visual keys.
 */
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

    let fieldOrder = this.memory.root;
    for (const { role, value } of fields) {
      if (isChildRole(this.vocabulary, role) && !this.occurrences.has(value)) {
        return contractError("invalid-child-occurrence");
      }
      fieldOrder = materializeTriad(this.memory, role, fieldOrder, value);
    }

    const occurrence = materializeTriad(
      this.memory,
      kind,
      this.occurrenceOrder,
      fieldOrder,
    );
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
    return this.memory.ensure(this.vocabulary.tag, this.occurrenceOrder);
  }
}

export function readSyntaxAset(
  memory: ReadMemory,
  aset: LinkHandle,
  vocabulary: SyntaxAsetVocabulary,
): SyntaxAsetRead {
  let declaredRoot: LinkHandle;

  try {
    const wrapper = memory.poles(aset);
    if (wrapper.start !== vocabulary.tag) {
      return contractError("invalid-aset");
    }
    declaredRoot = wrapper.end;
  } catch (error) {
    if (error instanceof MemoryError) {
      return contractError("invalid-aset");
    }
    throw error;
  }

  if (declaredRoot === memory.root) {
    return contractError("invalid-occurrence-sequence");
  }

  const reversed: SyntaxAsetOccurrence[] = [];
  const visited = new Set<LinkHandle>();
  let current = declaredRoot;

  while (current !== memory.root) {
    if (visited.has(current)) return contractError("invalid-occurrence-sequence");
    visited.add(current);
    const occurrence = readTriad(memory, current, "invalid-occurrence-sequence");
    reversed.push(Object.freeze({
      occurrence: current,
      kind: occurrence.relation,
      fields: readFieldChain(memory, occurrence.object),
    }));
    current = occurrence.subject;
  }

  const occurrences = [...reversed].reverse();
  const priorOccurrences = new Set<LinkHandle>();
  for (const occurrence of occurrences) {
    for (const field of occurrence.fields) {
      if (isChildRole(vocabulary, field.role) && !priorOccurrences.has(field.value)) {
        return contractError("invalid-child-occurrence");
      }
    }
    priorOccurrences.add(occurrence.occurrence);
  }

  return Object.freeze({
    root: declaredRoot,
    occurrences: Object.freeze(occurrences),
  });
}
