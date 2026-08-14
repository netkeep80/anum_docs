import {
  type LinkHandle,
  type ReadMemory,
  type WriteMemory,
} from "./memory.js";
import {
  DictionaryError,
  verifyVisibleDictionaryOccurrence,
} from "./dictionary.js";
import {
  RootedSequenceError,
  readRootedSequence,
} from "./rooted-sequence.js";

export type SourceErrorCode =
  | "invalid-byte-vocabulary"
  | "invalid-source-content"
  | "invalid-source"
  | "invalid-selected-partition"
  | "invalid-source-evidence"
  | "invalid-dictionary-evidence"
  | "invalid-admission-evidence";

export interface SourceContent {
  readonly bytes: Uint8Array;
  readonly prefixes: readonly LinkHandle[];
}

export interface SelectedSegmentSpec {
  readonly start: number;
  readonly end: number;
  readonly form: LinkHandle;
  readonly dictionaryOccurrence: LinkHandle;
}

export interface SelectedSegmentEvidence extends SelectedSegmentSpec {
  readonly sliceContent: LinkHandle;
  readonly span: LinkHandle;
  readonly sliceEvidence: LinkHandle;
  readonly lexeme: LinkHandle;
  readonly resolution: LinkHandle;
  readonly selection: LinkHandle;
}

export interface SourceFrontEndEvidence {
  readonly content: LinkHandle;
  readonly source: LinkHandle;
  readonly dictionary: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly segments: readonly SelectedSegmentEvidence[];
  readonly selectionSequence: LinkHandle;
  readonly formSequence: LinkHandle;
  readonly grammarMembership: LinkHandle;
  readonly theoryMembership: LinkHandle;
}

export class SourceError extends Error {
  override readonly name: string = "SourceError";

  constructor(readonly code: SourceErrorCode) {
    super(code);
  }
}

function byteVocabulary(
  memory: ReadMemory,
  byteRefs: readonly LinkHandle[],
): ReadonlyMap<LinkHandle, number> {
  if (byteRefs.length !== 256 || new Set(byteRefs).size !== 256) {
    throw new SourceError("invalid-byte-vocabulary");
  }

  const inverse = new Map<LinkHandle, number>();
  for (let value = 0; value < byteRefs.length; value += 1) {
    const ref = byteRefs[value];
    if (ref === undefined) {
      throw new SourceError("invalid-byte-vocabulary");
    }
    try {
      memory.poles(ref);
    } catch {
      throw new SourceError("invalid-byte-vocabulary");
    }
    inverse.set(ref, value);
  }
  return inverse;
}

export function materializeSourceContent(
  memory: WriteMemory,
  byteRefs: readonly LinkHandle[],
  bytes: Uint8Array,
): LinkHandle {
  byteVocabulary(memory, byteRefs);
  let current = memory.root;
  for (const value of bytes) {
    const byteRef = byteRefs[value];
    if (byteRef === undefined) {
      throw new SourceError("invalid-byte-vocabulary");
    }
    current = memory.ensure(current, byteRef);
  }
  return current;
}

export function readSourceContent(
  memory: ReadMemory,
  byteRefs: readonly LinkHandle[],
  content: LinkHandle,
): SourceContent {
  const inverse = byteVocabulary(memory, byteRefs);
  let sequence;
  try {
    sequence = readRootedSequence(memory, content);
  } catch (error) {
    if (error instanceof RootedSequenceError) {
      throw new SourceError("invalid-source-content");
    }
    throw error;
  }

  const bytes = new Uint8Array(sequence.values.length);
  for (let index = 0; index < sequence.values.length; index += 1) {
    const value = sequence.values[index];
    if (value === undefined) {
      throw new SourceError("invalid-source-content");
    }
    const byte = inverse.get(value);
    if (byte === undefined) {
      throw new SourceError("invalid-source-content");
    }
    bytes[index] = byte;
  }

  return Object.freeze({
    bytes,
    prefixes: Object.freeze([...sequence.prefixes]),
  });
}

export function defineSourceForm(
  memory: WriteMemory,
  content: LinkHandle,
): LinkHandle {
  try {
    return memory.ensureStartSelfClosed(content);
  } catch {
    throw new SourceError("invalid-source-content");
  }
}

export function readSourceForm(
  memory: ReadMemory,
  source: LinkHandle,
): LinkHandle {
  try {
    const link = memory.poles(source);
    if (link.start !== source) {
      throw new SourceError("invalid-source");
    }
    return link.end;
  } catch (error) {
    if (error instanceof SourceError) {
      throw error;
    }
    throw new SourceError("invalid-source");
  }
}

function validatePartition(
  byteLength: number,
  segments: readonly Pick<SelectedSegmentSpec, "start" | "end">[],
): void {
  if (segments.length === 0) {
    if (byteLength !== 0) {
      throw new SourceError("invalid-selected-partition");
    }
    return;
  }

  let expectedStart = 0;
  for (const segment of segments) {
    if (
      !Number.isInteger(segment.start) ||
      !Number.isInteger(segment.end) ||
      segment.start !== expectedStart ||
      segment.end <= segment.start ||
      segment.end > byteLength
    ) {
      throw new SourceError("invalid-selected-partition");
    }
    expectedStart = segment.end;
  }
  if (expectedStart !== byteLength) {
    throw new SourceError("invalid-selected-partition");
  }
}

function fold(memory: WriteMemory, values: readonly LinkHandle[]): LinkHandle {
  let current = memory.root;
  for (const value of values) {
    current = memory.ensure(current, value);
  }
  return current;
}

export function buildSelectedSourceEvidence(
  memory: WriteMemory,
  byteRefs: readonly LinkHandle[],
  source: LinkHandle,
  specs: readonly SelectedSegmentSpec[],
  options: {
    readonly dictionary: LinkHandle;
    readonly grammar: LinkHandle;
    readonly theory: LinkHandle;
  },
): SourceFrontEndEvidence {
  const content = readSourceForm(memory, source);
  const sourceContent = readSourceContent(memory, byteRefs, content);
  validatePartition(sourceContent.bytes.length, specs);

  const segments: SelectedSegmentEvidence[] = [];
  for (const spec of specs) {
    const startPrefix = sourceContent.prefixes[spec.start];
    const endPrefix = sourceContent.prefixes[spec.end];
    if (startPrefix === undefined || endPrefix === undefined) {
      throw new SourceError("invalid-selected-partition");
    }
    const sliceContent = materializeSourceContent(
      memory,
      byteRefs,
      sourceContent.bytes.slice(spec.start, spec.end),
    );
    const span = memory.ensure(startPrefix, endPrefix);
    const sliceEvidence = memory.ensure(span, sliceContent);
    const lexeme = memory.ensure(source, sliceEvidence);
    const resolution = memory.ensure(lexeme, spec.form);
    const selection = memory.ensure(spec.dictionaryOccurrence, resolution);
    segments.push(Object.freeze({
      ...spec,
      sliceContent,
      span,
      sliceEvidence,
      lexeme,
      resolution,
      selection,
    }));
  }

  const selectionSequence = fold(memory, segments.map((segment) => segment.selection));
  const formSequence = fold(memory, segments.map((segment) => segment.form));
  const grammarMembership = memory.ensure(options.grammar, formSequence);
  const theoryMembership = memory.ensure(options.theory, formSequence);

  return Object.freeze({
    content,
    source,
    dictionary: options.dictionary,
    grammar: options.grammar,
    theory: options.theory,
    segments: Object.freeze(segments),
    selectionSequence,
    formSequence,
    grammarMembership,
    theoryMembership,
  });
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function verifyFold(
  memory: ReadMemory,
  final: LinkHandle,
  values: readonly LinkHandle[],
): void {
  try {
    const sequence = readRootedSequence(memory, final);
    if (
      sequence.values.length !== values.length ||
      sequence.values.some((value, index) => value !== values[index])
    ) {
      throw new SourceError("invalid-source-evidence");
    }
  } catch (error) {
    if (error instanceof SourceError) {
      throw error;
    }
    if (error instanceof RootedSequenceError) {
      throw new SourceError("invalid-source-evidence");
    }
    throw error;
  }
}

function verifyMembership(
  memory: ReadMemory,
  membership: LinkHandle,
  container: LinkHandle,
  value: LinkHandle,
): void {
  try {
    const link = memory.poles(membership);
    if (link.start !== container || link.end !== value) {
      throw new SourceError("invalid-admission-evidence");
    }
  } catch (error) {
    if (error instanceof SourceError) {
      throw error;
    }
    throw new SourceError("invalid-admission-evidence");
  }
}

export function replaySelectedSourceEvidence(
  memory: ReadMemory,
  byteRefs: readonly LinkHandle[],
  evidence: SourceFrontEndEvidence,
): readonly LinkHandle[] {
  const before = memory.linkCount;
  const content = readSourceForm(memory, evidence.source);
  if (content !== evidence.content) {
    throw new SourceError("invalid-source-evidence");
  }
  const sourceContent = readSourceContent(memory, byteRefs, evidence.content);
  validatePartition(sourceContent.bytes.length, evidence.segments);

  const forms: LinkHandle[] = [];
  const selections: LinkHandle[] = [];
  for (const segment of evidence.segments) {
    const startPrefix = sourceContent.prefixes[segment.start];
    const endPrefix = sourceContent.prefixes[segment.end];
    if (startPrefix === undefined || endPrefix === undefined) {
      throw new SourceError("invalid-source-evidence");
    }

    const slice = readSourceContent(memory, byteRefs, segment.sliceContent);
    if (!sameBytes(slice.bytes, sourceContent.bytes.slice(segment.start, segment.end))) {
      throw new SourceError("invalid-source-evidence");
    }

    try {
      const span = memory.poles(segment.span);
      const sliceEvidence = memory.poles(segment.sliceEvidence);
      const lexeme = memory.poles(segment.lexeme);
      const resolution = memory.poles(segment.resolution);
      if (span.start !== startPrefix || span.end !== endPrefix) {
        throw new SourceError("invalid-source-evidence");
      }
      if (sliceEvidence.start !== segment.span || sliceEvidence.end !== segment.sliceContent) {
        throw new SourceError("invalid-source-evidence");
      }
      if (lexeme.start !== evidence.source || lexeme.end !== segment.sliceEvidence) {
        throw new SourceError("invalid-source-evidence");
      }
      if (resolution.start !== segment.lexeme || resolution.end !== segment.form) {
        throw new SourceError("invalid-source-evidence");
      }
    } catch (error) {
      if (error instanceof SourceError) {
        throw error;
      }
      throw new SourceError("invalid-source-evidence");
    }

    try {
      verifyVisibleDictionaryOccurrence(
        memory,
        evidence.dictionary,
        segment.dictionaryOccurrence,
        segment.sliceContent,
        segment.form,
      );
    } catch (error) {
      if (error instanceof DictionaryError) {
        throw new SourceError("invalid-dictionary-evidence");
      }
      throw error;
    }

    try {
      const selection = memory.poles(segment.selection);
      if (
        selection.start !== segment.dictionaryOccurrence ||
        selection.end !== segment.resolution
      ) {
        throw new SourceError("invalid-source-evidence");
      }
    } catch (error) {
      if (error instanceof SourceError) {
        throw error;
      }
      throw new SourceError("invalid-source-evidence");
    }

    forms.push(segment.form);
    selections.push(segment.selection);
  }

  verifyFold(memory, evidence.selectionSequence, selections);
  verifyFold(memory, evidence.formSequence, forms);
  verifyMembership(memory, evidence.grammarMembership, evidence.grammar, evidence.formSequence);
  verifyMembership(memory, evidence.theoryMembership, evidence.theory, evidence.formSequence);

  if (memory.linkCount !== before) {
    throw new SourceError("invalid-source-evidence");
  }
  return Object.freeze(forms);
}
