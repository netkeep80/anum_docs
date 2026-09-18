import {
  DictionaryError,
  verifyVisibleDictionaryOccurrence,
} from "./dictionary.js";
import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "./exact-sequence.js";
import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";
import {
  RootedSequenceError,
  readRootedSequence,
} from "./rooted-sequence.js";
import {
  SourceError,
  readSourceForm,
  type SelectedSegmentEvidence,
  type SelectedSegmentSpec,
  type SourceFrontEndEvidence,
} from "./source.js";
import {
  V012StringAnumError,
  materializeV012StringAnum,
  readV012StringAnum,
} from "./v012-string-anum.js";

export interface V012SourceAuthority {
  readonly dictionary: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  /**
   * These memberships are fixed independently of candidate evidence.
   * The candidate may reference them but must never synthesize replacements.
   */
  readonly grammarMembership: LinkHandle;
  readonly theoryMembership: LinkHandle;
}

export interface V012SourceContent {
  readonly bytes: Uint8Array;
  /** R plus every exact rooted STRING prefix in byte order. */
  readonly prefixes: readonly LinkHandle[];
}

export function materializeV012SourceContent(
  memory: WriteMemory,
  basis: RootBasis,
  bytes: Uint8Array,
): LinkHandle {
  return materializeV012StringAnum(memory, basis, bytes).anumLink;
}

export function readV012SourceContent(
  memory: ReadMemory,
  basis: RootBasis,
  content: LinkHandle,
): V012SourceContent {
  try {
    const value = readV012StringAnum(memory, basis, content);
    return Object.freeze({
      bytes: value.bytes,
      prefixes: value.prefixes,
    });
  } catch (error) {
    if (error instanceof V012StringAnumError || error instanceof MemoryError) {
      throw new SourceError("invalid-source-content");
    }
    throw error;
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

/**
 * Producer-side construction of candidate source evidence over v0.12 STRING.
 *
 * Crucially, this function does NOT admit its formSequence into Grammar/Theory.
 * Authority membership is supplied as an already fixed external reference and
 * will be checked only by replay.
 */
export function buildV012SelectedSourceEvidence(
  memory: WriteMemory,
  basis: RootBasis,
  source: LinkHandle,
  specs: readonly SelectedSegmentSpec[],
  authority: V012SourceAuthority,
): SourceFrontEndEvidence {
  const content = readSourceForm(memory, source);
  const sourceContent = readV012SourceContent(memory, basis, content);
  validatePartition(sourceContent.bytes.length, specs);

  const segments: SelectedSegmentEvidence[] = [];
  for (const spec of specs) {
    const startPrefix = sourceContent.prefixes[spec.start];
    const endPrefix = sourceContent.prefixes[spec.end];
    if (startPrefix === undefined || endPrefix === undefined) {
      throw new SourceError("invalid-selected-partition");
    }

    const sliceContent = materializeV012SourceContent(
      memory,
      basis,
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

  const selectionSequence = fold(
    memory,
    segments.map((segment) => segment.selection),
  );
  const formSequence = materializeExactSequence(
    memory,
    segments.map((segment) => segment.form),
  );

  return Object.freeze({
    basis,
    content,
    source,
    dictionary: authority.dictionary,
    grammar: authority.grammar,
    theory: authority.theory,
    segments: Object.freeze(segments),
    selectionSequence,
    formSequence,
    grammarMembership: authority.grammarMembership,
    theoryMembership: authority.theoryMembership,
  });
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
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
    if (error instanceof SourceError) throw error;
    if (error instanceof RootedSequenceError || error instanceof MemoryError) {
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
    if (error instanceof SourceError) throw error;
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
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
    if (error instanceof SourceError) throw error;
    throw new SourceError("invalid-admission-evidence");
  }
}

/**
 * Small read-only verifier for candidate source selection over exact v0.12
 * STRING content. It verifies the fixed dictionary and Grammar/Theory authority
 * carried by evidence; it never discovers or materializes replacement authority.
 */
export function replayV012SelectedSourceEvidence(
  memory: ReadMemory,
  basis: RootBasis,
  evidence: SourceFrontEndEvidence,
): readonly LinkHandle[] {
  const before = memory.linkCount;

  try {
    const content = readSourceForm(memory, evidence.source);
    if (content !== evidence.content) {
      throw new SourceError("invalid-source-evidence");
    }

    const sourceContent = readV012SourceContent(memory, basis, evidence.content);
    validatePartition(sourceContent.bytes.length, evidence.segments);

    const forms: LinkHandle[] = [];
    const selections: LinkHandle[] = [];

    for (const segment of evidence.segments) {
      const startPrefix = sourceContent.prefixes[segment.start];
      const endPrefix = sourceContent.prefixes[segment.end];
      if (startPrefix === undefined || endPrefix === undefined) {
        throw new SourceError("invalid-source-evidence");
      }

      const slice = readV012SourceContent(memory, basis, segment.sliceContent);
      if (
        !sameBytes(
          slice.bytes,
          sourceContent.bytes.slice(segment.start, segment.end),
        )
      ) {
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
        if (
          sliceEvidence.start !== segment.span ||
          sliceEvidence.end !== segment.sliceContent
        ) {
          throw new SourceError("invalid-source-evidence");
        }
        if (
          lexeme.start !== evidence.source ||
          lexeme.end !== segment.sliceEvidence
        ) {
          throw new SourceError("invalid-source-evidence");
        }
        if (
          resolution.start !== segment.lexeme ||
          resolution.end !== segment.form
        ) {
          throw new SourceError("invalid-source-evidence");
        }
      } catch (error) {
        if (error instanceof SourceError) throw error;
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
        if (error instanceof SourceError) throw error;
        throw new SourceError("invalid-source-evidence");
      }

      forms.push(segment.form);
      selections.push(segment.selection);
    }

    verifyFold(memory, evidence.selectionSequence, selections);
    verifyExactSequence(memory, evidence.formSequence, forms);
    verifyMembership(
      memory,
      evidence.grammarMembership,
      evidence.grammar,
      evidence.formSequence,
    );
    verifyMembership(
      memory,
      evidence.theoryMembership,
      evidence.theory,
      evidence.formSequence,
    );

    if (memory.linkCount !== before) {
      throw new SourceError("invalid-source-evidence");
    }
    return Object.freeze(forms);
  } finally {
    if (memory.linkCount !== before) {
      throw new SourceError("invalid-source-evidence");
    }
  }
}
