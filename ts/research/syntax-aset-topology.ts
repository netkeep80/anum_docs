import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
  type WriteMemory,
} from "../src/memory.js";
import type {
  SyntaxAsetField,
  SyntaxAsetOccurrence,
  SyntaxAsetRead,
} from "../src/syntax-aset-contract.js";
import type {
  SyntaxAsetKindName,
  SyntaxAsetRoleName,
  SyntaxAsetToolingVocabulary,
} from "../src/tooling/syntax-aset.js";

export type ResearchSyntaxAsetErrorCode =
  | "invalid-aset"
  | "invalid-occurrence-chain"
  | "invalid-field-chain"
  | "invalid-child-occurrence"
  | "unknown-kind"
  | "unknown-role"
  | "root-not-final";

export class ResearchSyntaxAsetError extends Error {
  override readonly name = "ResearchSyntaxAsetError";

  constructor(readonly code: ResearchSyntaxAsetErrorCode) {
    super(code);
  }
}

export interface ResearchBuilder {
  readonly memory: WriteMemory;
  readonly vocabulary: SyntaxAsetToolingVocabulary;
  readonly carrierA: LinkHandle;
  readonly carrierB: LinkHandle;
  addOccurrence(kind: LinkHandle, fields: readonly SyntaxAsetField[]): LinkHandle;
  finish(root: LinkHandle): LinkHandle;
}

interface TriadRead {
  readonly relation: LinkHandle;
  readonly subject: LinkHandle;
  readonly object: LinkHandle;
}

function fail(code: ResearchSyntaxAsetErrorCode): never {
  throw new ResearchSyntaxAsetError(code);
}

function includesHandle(values: readonly LinkHandle[], candidate: LinkHandle): boolean {
  return values.some((value) => value === candidate);
}

function kindLinks(vocabulary: SyntaxAsetToolingVocabulary): readonly LinkHandle[] {
  return Object.freeze(Object.values(vocabulary.kinds));
}

function roleLinks(vocabulary: SyntaxAsetToolingVocabulary): readonly LinkHandle[] {
  return Object.freeze(Object.values(vocabulary.roles));
}

function isChildRole(vocabulary: SyntaxAsetToolingVocabulary, role: LinkHandle): boolean {
  return includesHandle(vocabulary.childRoles, role);
}

/**
 * Historical S0 control retained only for the #970 research comparison after
 * production SyntaxAset itself moves to the selected chained-triad topology.
 * This is not a compatibility reader and is not exported from @mts/core.
 */
export class LegacyS0SyntaxAsetBuilder implements ResearchBuilder {
  private occurrenceOrder: LinkHandle;
  private readonly occurrences = new Set<LinkHandle>();
  private finished = false;

  constructor(
    readonly memory: WriteMemory,
    readonly vocabulary: SyntaxAsetToolingVocabulary,
    readonly carrierA: LinkHandle,
    readonly carrierB: LinkHandle,
  ) {
    this.occurrenceOrder = memory.root;
  }

  addOccurrence(kind: LinkHandle, fields: readonly SyntaxAsetField[]): LinkHandle {
    if (this.finished) return fail("invalid-aset");

    const fieldLinks = fields.map(({ role, value }) => {
      if (isChildRole(this.vocabulary, role) && !this.occurrences.has(value)) {
        return fail("invalid-child-occurrence");
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
      return fail("root-not-final");
    }
    this.finished = true;
    const header = this.memory.ensure(this.occurrenceOrder, root);
    return this.memory.ensure(this.vocabulary.tag, header);
  }
}

export function readLegacyS0SyntaxAset(
  memory: ReadMemory,
  aset: LinkHandle,
  vocabulary: SyntaxAsetToolingVocabulary,
): SyntaxAsetRead {
  let occurrenceOrder: LinkHandle;
  let declaredRoot: LinkHandle;
  try {
    const wrapper = memory.poles(aset);
    if (wrapper.start !== vocabulary.tag) return fail("invalid-aset");
    const header = memory.poles(wrapper.end);
    occurrenceOrder = header.start;
    declaredRoot = header.end;
  } catch (error) {
    if (error instanceof MemoryError) return fail("invalid-aset");
    throw error;
  }

  let sequence: ReturnType<typeof readExactSequence>;
  try {
    sequence = readExactSequence(memory, occurrenceOrder);
  } catch {
    return fail("invalid-occurrence-chain");
  }

  const finalOccurrence = sequence.cells.at(-1);
  if (finalOccurrence === undefined || declaredRoot !== finalOccurrence) {
    return fail("root-not-final");
  }

  const priorOccurrences = new Set<LinkHandle>();
  const occurrences: SyntaxAsetOccurrence[] = [];
  for (let index = 0; index < sequence.values.length; index += 1) {
    const descriptor = sequence.values[index];
    const occurrence = sequence.cells[index];
    if (descriptor === undefined || occurrence === undefined) {
      return fail("invalid-occurrence-chain");
    }

    let kind: LinkHandle;
    let fieldSequence: LinkHandle;
    try {
      const descriptorPoles = memory.poles(descriptor);
      kind = descriptorPoles.start;
      fieldSequence = descriptorPoles.end;
    } catch (error) {
      if (error instanceof MemoryError) return fail("invalid-field-chain");
      throw error;
    }

    let fieldLinks: readonly LinkHandle[];
    try {
      fieldLinks = readExactSequence(memory, fieldSequence).values;
    } catch {
      return fail("invalid-field-chain");
    }

    const fields: SyntaxAsetField[] = [];
    for (const fieldLink of fieldLinks) {
      let role: LinkHandle;
      let value: LinkHandle;
      try {
        const poles = memory.poles(fieldLink);
        role = poles.start;
        value = poles.end;
      } catch (error) {
        if (error instanceof MemoryError) return fail("invalid-field-chain");
        throw error;
      }
      if (isChildRole(vocabulary, role) && !priorOccurrences.has(value)) {
        return fail("invalid-child-occurrence");
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

/**
 * RM-inspired nested-pair witness:
 *
 *   T(relation, subject, object) = relation ⟼ (subject ⟼ object)
 *
 * This helper is research-only. It assigns no accepted MTS semantics to the
 * explanatory words relation/subject/object.
 */
export function triad(
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
  code: "invalid-occurrence-chain" | "invalid-field-chain",
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
    if (error instanceof MemoryError) return fail(code);
    throw error;
  }
}

/**
 * Chained-triad candidate for #970: both field order and occurrence order are
 * expressed by the same nested-pair triad form rather than by generic
 * descriptor objects plus ExactSequence Cells.
 *
 *   F0 = R
 *   Fi = T(role_i, F(i-1), value_i)
 *
 *   O0 = R
 *   Oi = T(kind_i, O(i-1), Fi)
 *
 *   SyntaxAset = SyntaxTag ⟼ O_last
 */
export class ChainedTriadSyntaxAsetBuilder implements ResearchBuilder {
  private occurrenceHead: LinkHandle;
  private readonly occurrences = new Set<LinkHandle>();
  private finished = false;

  constructor(
    readonly memory: WriteMemory,
    readonly vocabulary: SyntaxAsetToolingVocabulary,
    readonly carrierA: LinkHandle,
    readonly carrierB: LinkHandle,
  ) {
    this.occurrenceHead = memory.root;
  }

  addOccurrence(kind: LinkHandle, fields: readonly SyntaxAsetField[]): LinkHandle {
    if (this.finished) return fail("invalid-aset");
    if (!includesHandle(kindLinks(this.vocabulary), kind)) return fail("unknown-kind");

    let fieldHead = this.memory.root;
    for (const field of fields) {
      if (!includesHandle(roleLinks(this.vocabulary), field.role)) return fail("unknown-role");
      if (isChildRole(this.vocabulary, field.role) && !this.occurrences.has(field.value)) {
        return fail("invalid-child-occurrence");
      }
      fieldHead = triad(this.memory, field.role, fieldHead, field.value);
    }

    const occurrence = triad(this.memory, kind, this.occurrenceHead, fieldHead);
    this.occurrenceHead = occurrence;
    this.occurrences.add(occurrence);
    return occurrence;
  }

  finish(root: LinkHandle): LinkHandle {
    if (
      this.finished ||
      this.occurrenceHead === this.memory.root ||
      root !== this.occurrenceHead
    ) {
      return fail("root-not-final");
    }
    this.finished = true;
    return this.memory.ensure(this.vocabulary.tag, this.occurrenceHead);
  }
}

function readFields(
  memory: ReadMemory,
  final: LinkHandle,
  vocabulary: SyntaxAsetToolingVocabulary,
): readonly SyntaxAsetField[] {
  const reversed: SyntaxAsetField[] = [];
  const visited = new Set<LinkHandle>();
  let current = final;

  while (current !== memory.root) {
    if (visited.has(current)) return fail("invalid-field-chain");
    visited.add(current);
    const fact = readTriad(memory, current, "invalid-field-chain");
    if (!includesHandle(roleLinks(vocabulary), fact.relation)) return fail("unknown-role");
    reversed.push(Object.freeze({ role: fact.relation, value: fact.object }));
    current = fact.subject;
  }

  return Object.freeze(reversed.reverse());
}

export function readChainedTriadSyntaxAset(
  memory: ReadMemory,
  aset: LinkHandle,
  vocabulary: SyntaxAsetToolingVocabulary,
): SyntaxAsetRead {
  let root: LinkHandle;
  try {
    const wrapper = memory.poles(aset);
    if (wrapper.start !== vocabulary.tag) return fail("invalid-aset");
    root = wrapper.end;
  } catch (error) {
    if (error instanceof MemoryError) return fail("invalid-aset");
    throw error;
  }

  if (root === memory.root) return fail("invalid-occurrence-chain");

  const reversed: SyntaxAsetOccurrence[] = [];
  const visited = new Set<LinkHandle>();
  let current = root;

  while (current !== memory.root) {
    if (visited.has(current)) return fail("invalid-occurrence-chain");
    visited.add(current);
    const occurrence = readTriad(memory, current, "invalid-occurrence-chain");
    if (!includesHandle(kindLinks(vocabulary), occurrence.relation)) return fail("unknown-kind");
    reversed.push(Object.freeze({
      occurrence: current,
      kind: occurrence.relation,
      fields: readFields(memory, occurrence.object, vocabulary),
    }));
    current = occurrence.subject;
  }

  const occurrences = [...reversed].reverse();
  const prior = new Set<LinkHandle>();
  for (const occurrence of occurrences) {
    for (const field of occurrence.fields) {
      if (isChildRole(vocabulary, field.role) && !prior.has(field.value)) {
        return fail("invalid-child-occurrence");
      }
    }
    prior.add(occurrence.occurrence);
  }

  return Object.freeze({
    root,
    occurrences: Object.freeze(occurrences),
  });
}

/** Build the same relation-rich syntax corpus through any candidate builder. */
export function buildResearchCorpus(builder: ResearchBuilder): LinkHandle {
  const { kinds, roles } = builder.vocabulary;

  const literalA = builder.addOccurrence(kinds.Literal, [
    { role: roles.value, value: builder.carrierA },
  ]);
  const literalA2 = builder.addOccurrence(kinds.Literal, [
    { role: roles.value, value: builder.carrierA },
  ]);
  const context = builder.addOccurrence(kinds.ContextPronoun, [
    { role: roles.value, value: builder.carrierB },
  ]);
  const link = builder.addOccurrence(kinds.Link, [
    { role: roles.start, value: literalA },
    { role: roles.end, value: literalA2 },
  ]);
  const not = builder.addOccurrence(kinds.Not, [
    { role: roles.operand, value: link },
  ]);
  const equality = builder.addOccurrence(kinds.Equality, [
    { role: roles.left, value: literalA },
    { role: roles.right, value: context },
  ]);
  const inequality = builder.addOccurrence(kinds.Inequality, [
    { role: roles.left, value: literalA2 },
    { role: roles.right, value: context },
  ]);
  const name = builder.addOccurrence(kinds.Literal, [
    { role: roles.value, value: builder.carrierB },
  ]);
  const definition = builder.addOccurrence(kinds.Definition, [
    { role: roles.name, value: name },
    { role: roles.body, value: equality },
  ]);
  const sequence = builder.addOccurrence(kinds.Sequence, [
    { role: roles.item, value: literalA },
    { role: roles.item, value: literalA },
    { role: roles.item, value: literalA2 },
  ]);
  const set = builder.addOccurrence(kinds.Set, [
    { role: roles.item, value: context },
    { role: roles.item, value: literalA },
  ]);
  const round = builder.addOccurrence(kinds.Round, [
    { role: roles.expression, value: sequence },
  ]);
  const square = builder.addOccurrence(kinds.Square, [
    { role: roles.expression, value: set },
  ]);
  const female = builder.addOccurrence(kinds.Female, [
    { role: roles.operand, value: round },
  ]);
  const male = builder.addOccurrence(kinds.Male, [
    { role: roles.operand, value: square },
  ]);

  const statementDefinition = builder.addOccurrence(kinds.Statement, [
    { role: roles.expression, value: definition },
  ]);
  const statementNot = builder.addOccurrence(kinds.Statement, [
    { role: roles.expression, value: not },
  ]);
  const statementInequality = builder.addOccurrence(kinds.Statement, [
    { role: roles.expression, value: inequality },
  ]);
  const statementFemale = builder.addOccurrence(kinds.Statement, [
    { role: roles.expression, value: female },
  ]);
  const statementMale = builder.addOccurrence(kinds.Statement, [
    { role: roles.expression, value: male },
  ]);

  return builder.addOccurrence(kinds.File, [
    { role: roles.item, value: statementDefinition },
    { role: roles.item, value: statementNot },
    { role: roles.item, value: statementInequality },
    { role: roles.item, value: statementFemale },
    { role: roles.item, value: statementMale },
  ]);
}

interface NormalizedField {
  readonly role: SyntaxAsetRoleName;
  readonly value: string;
}

interface NormalizedOccurrence {
  readonly kind: SyntaxAsetKindName;
  readonly fields: readonly NormalizedField[];
}

function nameForHandle<Name extends string>(
  entries: readonly (readonly [Name, LinkHandle])[],
  handle: LinkHandle,
  label: string,
): Name {
  const match = entries.find((entry) => entry[1] === handle);
  if (match === undefined) throw new Error(`unknown ${label} handle in normalized research read`);
  return match[0];
}

/** Normalize host handles away so independent Memories can be compared. */
export function normalizeResearchRead(
  read: SyntaxAsetRead,
  vocabulary: SyntaxAsetToolingVocabulary,
  carrierA: LinkHandle,
  carrierB: LinkHandle,
): readonly NormalizedOccurrence[] {
  const kinds = Object.entries(vocabulary.kinds) as Array<readonly [SyntaxAsetKindName, LinkHandle]>;
  const roles = Object.entries(vocabulary.roles) as Array<readonly [SyntaxAsetRoleName, LinkHandle]>;
  const occurrenceIndexes = new Map<LinkHandle, number>();
  read.occurrences.forEach((occurrence, index) => occurrenceIndexes.set(occurrence.occurrence, index));

  return Object.freeze(read.occurrences.map((occurrence) => Object.freeze({
    kind: nameForHandle(kinds, occurrence.kind, "kind"),
    fields: Object.freeze(occurrence.fields.map((field) => {
      const occurrenceIndex = occurrenceIndexes.get(field.value);
      const value = occurrenceIndex !== undefined
        ? `@${occurrenceIndex}`
        : field.value === carrierA
          ? "$A"
          : field.value === carrierB
            ? "$B"
            : "$external";
      return Object.freeze({
        role: nameForHandle(roles, field.role, "role"),
        value,
      });
    })),
  })));
}
