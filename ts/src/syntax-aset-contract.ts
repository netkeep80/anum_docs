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
  | "invalid-carrier-target"
  | "unknown-kind"
  | "unknown-role"
  | "invalid-grammar"
  | "unreachable-occurrence"
  | "root-not-final";

export class SyntaxAsetContractError extends Error {
  override readonly name = "SyntaxAsetContractError";

  constructor(readonly code: SyntaxAsetContractErrorCode) {
    super(code);
  }
}

export type SyntaxAsetTargetClass = "child" | "carrier";

export interface SyntaxAsetFieldRule {
  readonly role: LinkHandle;
  readonly target: SyntaxAsetTargetClass;
  readonly min: number;
  readonly max: number | null;
}

export interface SyntaxAsetKindRule {
  readonly kind: LinkHandle;
  readonly fields: readonly SyntaxAsetFieldRule[];
}

export interface SyntaxAsetVocabulary {
  readonly tag: LinkHandle;
  readonly knownRoles: readonly LinkHandle[];
  readonly rules: readonly SyntaxAsetKindRule[];
  /**
   * Derived convenience for research/inspection only. Production validation
   * is per-kind through `rules`; this global list is not grammar authority.
   */
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

function includesHandle(values: readonly LinkHandle[], candidate: LinkHandle): boolean {
  return values.some((value) => value === candidate);
}

function kindRule(
  vocabulary: SyntaxAsetVocabulary,
  kind: LinkHandle,
): SyntaxAsetKindRule {
  const rule = vocabulary.rules.find((candidate) => candidate.kind === kind);
  return rule ?? contractError("unknown-kind");
}

function kindRuleOrUndefined(
  vocabulary: SyntaxAsetVocabulary,
  kind: LinkHandle,
): SyntaxAsetKindRule | undefined {
  return vocabulary.rules.find((candidate) => candidate.kind === kind);
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
 * Test explicit SyntaxAset membership without treating mere pole resemblance as
 * syntax identity. Every complete SyntaxAset is structurally rooted by
 * `tag ⟼ O_last`; membership is recovered by walking that O-chain only.
 */
function occurrenceChainContains(
  memory: ReadMemory,
  head: LinkHandle,
  target: LinkHandle,
  vocabulary: SyntaxAsetVocabulary,
): boolean {
  const visited = new Set<LinkHandle>();
  let current = head;

  while (current !== memory.root) {
    if (current === target) return true;
    if (visited.has(current)) return false;
    visited.add(current);

    try {
      const vertical = memory.poles(current);
      if (kindRuleOrUndefined(vocabulary, vertical.start) === undefined) return false;
      const horizontal = memory.poles(vertical.end);
      current = horizontal.start;
    } catch (error) {
      if (error instanceof MemoryError) return false;
      throw error;
    }
  }

  return false;
}

function isOwnedSyntaxOccurrence(
  memory: ReadMemory,
  value: LinkHandle,
  vocabulary: SyntaxAsetVocabulary,
): boolean {
  let wrappers: readonly LinkHandle[];
  try {
    wrappers = memory.outgoing(vocabulary.tag);
  } catch (error) {
    if (error instanceof MemoryError) return false;
    throw error;
  }

  for (const wrapper of wrappers) {
    try {
      const poles = memory.poles(wrapper);
      if (
        poles.start === vocabulary.tag &&
        occurrenceChainContains(memory, poles.end, value, vocabulary)
      ) {
        return true;
      }
    } catch (error) {
      if (!(error instanceof MemoryError)) throw error;
    }
  }

  return false;
}

function validateTarget(
  memory: ReadMemory,
  vocabulary: SyntaxAsetVocabulary,
  targetClass: SyntaxAsetTargetClass,
  value: LinkHandle,
  priorOccurrences: ReadonlySet<LinkHandle>,
): void {
  if (targetClass === "child") {
    if (!priorOccurrences.has(value)) contractError("invalid-child-occurrence");
    return;
  }

  if (priorOccurrences.has(value) || isOwnedSyntaxOccurrence(memory, value, vocabulary)) {
    contractError("invalid-carrier-target");
  }
}

function validateGrammar(
  memory: ReadMemory,
  vocabulary: SyntaxAsetVocabulary,
  kind: LinkHandle,
  fields: readonly SyntaxAsetField[],
  priorOccurrences: ReadonlySet<LinkHandle>,
): void {
  const rule = kindRule(vocabulary, kind);

  for (const field of fields) {
    if (!includesHandle(vocabulary.knownRoles, field.role)) {
      contractError("unknown-role");
    }
  }

  let fieldIndex = 0;
  for (const fieldRule of rule.fields) {
    let count = 0;
    while (
      fieldIndex < fields.length &&
      fields[fieldIndex]?.role === fieldRule.role &&
      (fieldRule.max === null || count < fieldRule.max)
    ) {
      const field = fields[fieldIndex];
      if (field === undefined) contractError("invalid-grammar");
      validateTarget(memory, vocabulary, fieldRule.target, field.value, priorOccurrences);
      count += 1;
      fieldIndex += 1;
    }
    if (count < fieldRule.min) contractError("invalid-grammar");
  }

  if (fieldIndex !== fields.length) contractError("invalid-grammar");
}

function validateReachability(
  root: LinkHandle,
  occurrences: readonly SyntaxAsetOccurrence[],
  vocabulary: SyntaxAsetVocabulary,
): void {
  const byHandle = new Map<LinkHandle, SyntaxAsetOccurrence>(
    occurrences.map((occurrence) => [occurrence.occurrence, occurrence]),
  );
  const reachable = new Set<LinkHandle>();
  const pending: LinkHandle[] = [root];

  while (pending.length > 0) {
    const handle = pending.pop();
    if (handle === undefined || reachable.has(handle)) continue;
    const occurrence = byHandle.get(handle);
    if (occurrence === undefined) contractError("invalid-child-occurrence");
    reachable.add(handle);
    const rule = kindRule(vocabulary, occurrence.kind);
    for (const field of occurrence.fields) {
      const fieldRule = rule.fields.find((candidate) => candidate.role === field.role);
      if (fieldRule?.target === "child") pending.push(field.value);
    }
  }

  if (reachable.size !== occurrences.length) contractError("unreachable-occurrence");
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
  private readonly occurrenceReads: SyntaxAsetOccurrence[] = [];
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

    validateGrammar(this.memory, this.vocabulary, kind, fields, this.occurrences);

    let fieldOrder = this.memory.root;
    for (const { role, value } of fields) {
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
    this.occurrenceReads.push(Object.freeze({
      occurrence,
      kind,
      fields: Object.freeze([...fields]),
    }));
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

    validateReachability(root, this.occurrenceReads, this.vocabulary);
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
    kindRule(vocabulary, occurrence.relation);
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
    validateGrammar(
      memory,
      vocabulary,
      occurrence.kind,
      occurrence.fields,
      priorOccurrences,
    );
    priorOccurrences.add(occurrence.occurrence);
  }
  validateReachability(declaredRoot, occurrences, vocabulary);

  return Object.freeze({
    root: declaredRoot,
    occurrences: Object.freeze(occurrences),
  });
}
