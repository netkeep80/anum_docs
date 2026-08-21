import {
  ByteCarrierError,
  materializeCanonicalByteSequence,
  readCanonicalByteSequence,
} from "./byte-carrier.js";
import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "./exact-sequence.js";
import {
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
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
  | "invalid-source-content"
  | "invalid-source"
  | "invalid-selected-partition"
  | "invalid-source-evidence"
  | "invalid-dictionary-evidence"
  | "invalid-admission-evidence"
  | "invalid-subselection";

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
  /** Canonical root basis carried as evidence and verified from defining poles. */
  readonly basis: RootBasis;
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

export interface SourceSubselectionEvidence {
  readonly startSegment: number;
  readonly endSegment: number;
  readonly selectionSequence: LinkHandle;
  readonly formSequence: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly grammarMembership: LinkHandle;
  readonly theoryMembership: LinkHandle;
}

export class SourceError extends Error {
  override readonly name: string = "SourceError";

  constructor(readonly code: SourceErrorCode) {
    super(code);
  }
}

/**
 * RootBasis is evidence, not host authority: replay verifies every defining
 * equation through poles() and never needs a 256-entry injected byte table,
 * find(), incoming(), outgoing() or materialization.
 */
function verifyRootBasis(
  memory: ReadMemory,
  basis: RootBasis,
): RootBasis {
  try {
    const { R, O, C, L, U } = basis;
    if (R !== memory.root) {
      throw new SourceError("invalid-source-content");
    }
    const root = memory.poles(R);
    const open = memory.poles(O);
    const close = memory.poles(C);
    const one = memory.poles(L);
    const zero = memory.poles(U);
    if (
      root.start !== R || root.end !== R ||
      open.start !== O || open.end !== R ||
      close.start !== R || close.end !== C ||
      one.start !== O || one.end !== C ||
      zero.start !== C || zero.end !== O
    ) {
      throw new SourceError("invalid-source-content");
    }
    return basis;
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError("invalid-source-content");
  }
}

/** Materializes the accepted source carrier ExactSequence<Byte(p)>. */
export function materializeSourceContent(
  memory: WriteMemory,
  bytes: Uint8Array,
): LinkHandle {
  const basis = ensureRootBasis(memory);
  return materializeCanonicalByteSequence(memory, basis, bytes);
}

/**
 * Reads only the accepted canonical byte carrier. Source boundaries reuse the
 * ExactSequence positions directly: [R, ...cells].
 */
export function readSourceContent(
  memory: ReadMemory,
  basis: RootBasis,
  content: LinkHandle,
): SourceContent {
  try {
    const canonical = readCanonicalByteSequence(
      memory,
      verifyRootBasis(memory, basis),
      content,
    );
    return Object.freeze({
      bytes: canonical.bytes,
      prefixes: Object.freeze([memory.root, ...canonical.cells]),
    });
  } catch (error) {
    if (error instanceof SourceError) throw error;
    if (error instanceof ByteCarrierError) {
      throw new SourceError("invalid-source-content");
    }
    throw new SourceError("invalid-source-content");
  }
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
    // SourceForm имеет именно однополюсную форму START(content). ROOT может
    // быть пустым content, но не альтернативным source-wrapper для него.
    if (link.start !== source || link.end === source) {
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
  source: LinkHandle,
  specs: readonly SelectedSegmentSpec[],
  options: {
    readonly dictionary: LinkHandle;
    readonly grammar: LinkHandle;
    readonly theory: LinkHandle;
  },
): SourceFrontEndEvidence {
  const basis = ensureRootBasis(memory);
  const content = readSourceForm(memory, source);
  const sourceContent = readSourceContent(memory, basis, content);
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
  // Forms are position-sensitive evidence and ROOT is a legal semantic value,
  // therefore the restricted rooted fold is not a valid carrier here.
  const formSequence = materializeExactSequence(memory, segments.map((segment) => segment.form));
  const grammarMembership = memory.ensure(options.grammar, formSequence);
  const theoryMembership = memory.ensure(options.theory, formSequence);

  return Object.freeze({
    basis,
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

function verifyExactSequence(
  memory: ReadMemory,
  final: LinkHandle,
  values: readonly LinkHandle[],
): void {
  try {
    const sequence = readExactSequence(memory, final);
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
    if (error instanceof ExactSequenceError) {
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
  evidence: SourceFrontEndEvidence,
): readonly LinkHandle[] {
  const before = memory.linkCount;
  const content = readSourceForm(memory, evidence.source);
  if (content !== evidence.content) {
    throw new SourceError("invalid-source-evidence");
  }
  const sourceContent = readSourceContent(memory, evidence.basis, evidence.content);
  validatePartition(sourceContent.bytes.length, evidence.segments);

  const forms: LinkHandle[] = [];
  const selections: LinkHandle[] = [];
  for (const segment of evidence.segments) {
    const startPrefix = sourceContent.prefixes[segment.start];
    const endPrefix = sourceContent.prefixes[segment.end];
    if (startPrefix === undefined || endPrefix === undefined) {
      throw new SourceError("invalid-source-evidence");
    }

    const slice = readSourceContent(memory, evidence.basis, segment.sliceContent);
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
  verifyExactSequence(memory, evidence.formSequence, forms);
  verifyMembership(memory, evidence.grammarMembership, evidence.grammar, evidence.formSequence);
  verifyMembership(memory, evidence.theoryMembership, evidence.theory, evidence.formSequence);

  if (memory.linkCount !== before) {
    throw new SourceError("invalid-source-evidence");
  }
  return Object.freeze(forms);
}

export function replaySourceSubselection(
  memory: ReadMemory,
  evidence: SourceFrontEndEvidence,
  subselection: SourceSubselectionEvidence,
): readonly LinkHandle[] {
  const before = memory.linkCount;
  const forms = replaySelectedSourceEvidence(memory, evidence);
  if (
    !Number.isInteger(subselection.startSegment) ||
    !Number.isInteger(subselection.endSegment) ||
    subselection.startSegment < 0 ||
    subselection.endSegment < subselection.startSegment ||
    subselection.endSegment > evidence.segments.length
  ) {
    throw new SourceError("invalid-subselection");
  }

  const segments = evidence.segments.slice(
    subselection.startSegment,
    subselection.endSegment,
  );
  const selectedForms = forms.slice(
    subselection.startSegment,
    subselection.endSegment,
  );
  verifyFold(
    memory,
    subselection.selectionSequence,
    segments.map((segment) => segment.selection),
  );
  verifyExactSequence(memory, subselection.formSequence, selectedForms);
  verifyMembership(
    memory,
    subselection.grammarMembership,
    subselection.grammar,
    subselection.formSequence,
  );
  verifyMembership(
    memory,
    subselection.theoryMembership,
    subselection.theory,
    subselection.formSequence,
  );

  if (memory.linkCount !== before) {
    throw new SourceError("invalid-source-evidence");
  }
  return Object.freeze([...selectedForms]);
}
