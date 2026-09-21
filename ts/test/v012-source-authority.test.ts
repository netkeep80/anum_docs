// mts-version-evidence: required-from=0.12

import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import {
  materializeExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  exportPortableStructuralTheory,
} from "../src/portable-theory.js";
import {
  SourceError,
  defineSourceForm,
} from "../src/source.js";
import {
  materializeV012StringAnum,
  readV012StringAnum,
} from "../src/v012-string-anum.js";
import {
  V012SourceResultError,
  buildV012SelectedSourceEvidence,
  materializeV012SourceContent,
  replayV012SelectedSourceEvidence,
  replayV012SelectedSourceEvidenceAgainstAuthority,
  type V012SourceAuthority,
} from "../src/v012-source.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 source authority: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function sourceError(code: SourceError["code"], effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof SourceError, `expected SourceError, got ${String(error)}`);
    same(error.code, code, "source error code");
    return;
  }
  throw new Error(`v0.12 source authority: expected ${code}`);
}
function sourceResultError(
  code: V012SourceResultError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof V012SourceResultError,
      `expected V012SourceResultError, got ${String(error)}`,
    );
    same(error.code, code, "source result error code");
    return;
  }
  throw new Error(`v0.12 source authority: expected ${code}`);
}
function anchors(memory: Memory, count: number): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  let current = ensureRootBasis(memory).L;
  for (let index = 0; index < count; index += 1) {
    current = memory.ensureStartSelfClosed(current);
    result.push(current);
  }
  return Object.freeze(result);
}
class ReadOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    return this.source.find(start, end);
  }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    return this.source.outgoing(start);
  }
  incoming(end: LinkHandle): readonly LinkHandle[] {
    return this.source.incoming(end);
  }
}

// Same exact FORMAL source glyph + same fixed authority:
// selected nesting Use is valid; a different well-formed literal Use is invalid.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const refs = anchors(memory, 6);
  const nestingUse = refs[0]!;
  const literalUse = refs[1]!;
  const grammar = refs[2]!;
  const theory = refs[3]!;

  assert(nestingUse !== literalUse, "candidate Uses are distinct well-formed Links");
  assert(nestingUse !== basis.O && literalUse !== basis.O, "Use identity is not Q OPEN identity");

  const bytes = Uint8Array.of(0x5b); // literal UTF-8 source glyph "["
  const content = materializeV012SourceContent(memory, basis, bytes);
  same(
    content,
    materializeV012StringAnum(memory, basis, bytes).anumLink,
    "source content is the exact v0.12 STRING Anum Link",
  );
  const readContent = readV012StringAnum(memory, basis, content);
  same(readContent.bytes[0], 0x5b, "source content preserves literal [ byte");

  const source = defineSourceForm(memory, content);

  // Fixed dictionary authority is established BEFORE candidate evidence.
  const scope0 = defineDictionaryScope(memory, memory.root, memory.root);
  const dictionaryEffect = defineDictionaryEffect(
    memory,
    scope0,
    memory.root,
    memory.root,
    content,
    nestingUse,
  );
  const dictionary = dictionaryEffect.afterScope;

  // Fixed Grammar/Theory admit only the selected one-Use form sequence.
  const admittedForms = materializeExactSequence(memory, [nestingUse]);
  const grammarMembership = memory.ensure(grammar, admittedForms);
  const theoryMembership = memory.ensure(theory, admittedForms);
  const authority: V012SourceAuthority = Object.freeze({
    dictionary,
    grammar,
    theory,
    grammarMembership,
    theoryMembership,
  });
  const fixedTheoryAuthority = exportPortableStructuralTheory(memory, theory);

  const authorityLinkCount = memory.linkCount;

  const correct = buildV012SelectedSourceEvidence(
    memory,
    basis,
    source,
    [{
      start: 0,
      end: 1,
      form: nestingUse,
      dictionaryOccurrence: dictionaryEffect.occurrence,
    }],
    authority,
  );

  // Candidate construction may add evidence, but must not mutate fixed
  // dictionary/grammar/theory membership authority.
  same(authority.dictionary, dictionary, "dictionary authority stable");
  same(authority.grammarMembership, grammarMembership, "grammar authority stable");
  same(authority.theoryMembership, theoryMembership, "theory authority stable");
  assert(memory.linkCount >= authorityLinkCount, "candidate evidence may materialize its own Links");

  const beforeCorrectReplay = memory.linkCount;
  const selected = replayV012SelectedSourceEvidenceAgainstAuthority(
    new ReadOnlyProbe(memory),
    basis,
    correct,
    authority,
    fixedTheoryAuthority,
  );
  same(selected.length, 1, "one selected Use");
  same(selected[0], nestingUse, "fixed authority selects nesting Use");
  same(memory.linkCount, beforeCorrectReplay, "correct strong replay is read-only");

  // A candidate can also construct a different but independently valid
  // Dictionary snapshot after authority selection. Raw replay accepts that
  // snapshot on its own terms; the stronger boundary must not let candidate
  // evidence replace the consumer-selected Dictionary identity.
  const unrelatedContent = materializeV012SourceContent(
    memory,
    basis,
    Uint8Array.of(0x78),
  );
  const candidateSeedEffect = defineDictionaryEffect(
    memory,
    scope0,
    memory.root,
    memory.root,
    unrelatedContent,
    literalUse,
  );
  const candidateDictionaryEffect = defineDictionaryEffect(
    memory,
    candidateSeedEffect.afterScope,
    memory.root,
    candidateSeedEffect.historyAfter,
    content,
    nestingUse,
  );
  assert(
    candidateDictionaryEffect.afterScope !== dictionary,
    "candidate Dictionary snapshot differs from fixed Dictionary",
  );

  const candidateDictionaryEvidence = buildV012SelectedSourceEvidence(
    memory,
    basis,
    source,
    [{
      start: 0,
      end: 1,
      form: nestingUse,
      dictionaryOccurrence: candidateDictionaryEffect.occurrence,
    }],
    Object.freeze({
      ...authority,
      dictionary: candidateDictionaryEffect.afterScope,
    }),
  );
  const candidateDictionarySelected = replayV012SelectedSourceEvidence(
    new ReadOnlyProbe(memory),
    basis,
    candidateDictionaryEvidence,
  );
  same(
    candidateDictionarySelected[0],
    nestingUse,
    "low-level replay accepts alternate valid Dictionary snapshot",
  );
  sourceResultError(
    "source-authority-mismatch",
    () => replayV012SelectedSourceEvidenceAgainstAuthority(
      new ReadOnlyProbe(memory),
      basis,
      candidateDictionaryEvidence,
      authority,
      fixedTheoryAuthority,
    ),
  );

  // Untrusted producer proposes another internally well-formed resolution for
  // the SAME exact source and carries the SAME fixed authority references.
  const wrong = buildV012SelectedSourceEvidence(
    memory,
    basis,
    source,
    [{
      start: 0,
      end: 1,
      form: literalUse,
      dictionaryOccurrence: dictionaryEffect.occurrence,
    }],
    authority,
  );

  same(wrong.source, correct.source, "wrong candidate keeps same exact source");
  same(wrong.content, correct.content, "wrong candidate keeps same exact STRING content");
  same(wrong.dictionary, correct.dictionary, "wrong candidate keeps same dictionary");
  same(wrong.grammar, correct.grammar, "wrong candidate keeps same grammar");
  same(wrong.theory, correct.theory, "wrong candidate keeps same theory");
  same(wrong.grammarMembership, correct.grammarMembership, "wrong candidate cannot replace grammar authority");
  same(wrong.theoryMembership, correct.theoryMembership, "wrong candidate cannot replace theory authority");

  const beforeWrongReplay = memory.linkCount;
  sourceError(
    "invalid-dictionary-evidence",
    () => replayV012SelectedSourceEvidence(new ReadOnlyProbe(memory), basis, wrong),
  );
  same(memory.linkCount, beforeWrongReplay, "rejected wrong Use replay is read-only");

  // Spelling does not choose the semantic Use: the exact source byte is "[",
  // while authority selected a Link distinct from semantic Q OPEN.
  assert(nestingUse !== basis.O, "source glyph [ did not select Q OPEN by spelling");
}

// Authority membership is fixed independently. A producer cannot swap the
// form sequence and keep the old Theory/Grammar membership evidence.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const refs = anchors(memory, 6);
  const admittedUse = refs[0]!;
  const alternateUse = refs[1]!;
  const grammar = refs[2]!;
  const theory = refs[3]!;

  const content = materializeV012SourceContent(memory, basis, Uint8Array.of(0x5b));
  const source = defineSourceForm(memory, content);
  const scope0 = defineDictionaryScope(memory, memory.root, memory.root);
  const effect = defineDictionaryEffect(memory, scope0, memory.root, memory.root, content, alternateUse);

  // Grammar/Theory are deliberately fixed to a DIFFERENT form sequence.
  const admittedForms = materializeExactSequence(memory, [admittedUse]);
  const authority: V012SourceAuthority = Object.freeze({
    dictionary: effect.afterScope,
    grammar,
    theory,
    grammarMembership: memory.ensure(grammar, admittedForms),
    theoryMembership: memory.ensure(theory, admittedForms),
  });

  const candidate = buildV012SelectedSourceEvidence(
    memory,
    basis,
    source,
    [{
      start: 0,
      end: 1,
      form: alternateUse,
      dictionaryOccurrence: effect.occurrence,
    }],
    authority,
  );

  const before = memory.linkCount;
  sourceError(
    "invalid-admission-evidence",
    () => replayV012SelectedSourceEvidence(new ReadOnlyProbe(memory), basis, candidate),
  );
  same(memory.linkCount, before, "authority-mismatch replay is read-only");
}

// Grammar self-admission adversarial boundary: raw source replay validates
// selected membership shape, while the stronger consumer boundary must reject a
// candidate-created membership that replaces the independently selected one.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const refs = anchors(memory, 6);
  const selectedUse = refs[0]!;
  const alternateUse = refs[1]!;
  const grammar = refs[2]!;
  const theory = refs[3]!;

  const content = materializeV012SourceContent(memory, basis, Uint8Array.of(0x5b));
  const source = defineSourceForm(memory, content);

  const scope0 = defineDictionaryScope(memory, memory.root, memory.root);
  const dictionaryEffect = defineDictionaryEffect(
    memory,
    scope0,
    memory.root,
    memory.root,
    content,
    selectedUse,
  );

  const selectedForms = materializeExactSequence(memory, [selectedUse]);
  const alternateForms = materializeExactSequence(memory, [alternateUse]);

  // Independent source authority is fixed first. Grammar admits a different
  // sequence; Theory admits the selected sequence used by this source.
  const fixedGrammarMembership = memory.ensure(grammar, alternateForms);
  const fixedTheoryMembership = memory.ensure(theory, selectedForms);
  const expectedAuthority: V012SourceAuthority = Object.freeze({
    dictionary: dictionaryEffect.afterScope,
    grammar,
    theory,
    grammarMembership: fixedGrammarMembership,
    theoryMembership: fixedTheoryMembership,
  });
  const fixedTheoryAuthority = exportPortableStructuralTheory(memory, theory);
  const fixedAuthorityCount = memory.linkCount;

  assert(
    memory.find(grammar, selectedForms) === undefined,
    "fixed Grammar does not admit selected source forms",
  );

  // Candidate later synthesizes the exact selected Grammar membership shape.
  const candidateGrammarMembership = memory.ensure(grammar, selectedForms);
  assert(
    memory.linkCount > fixedAuthorityCount,
    "candidate Grammar admission is created after fixed authority boundary",
  );

  const candidate = buildV012SelectedSourceEvidence(
    memory,
    basis,
    source,
    [{
      start: 0,
      end: 1,
      form: selectedUse,
      dictionaryOccurrence: dictionaryEffect.occurrence,
    }],
    Object.freeze({
      ...expectedAuthority,
      grammarMembership: candidateGrammarMembership,
    }),
  );

  const beforeReplay = memory.linkCount;

  // Low-level replay deliberately proves only the supplied membership shape.
  const lowLevelSelected = replayV012SelectedSourceEvidence(
    new ReadOnlyProbe(memory),
    basis,
    candidate,
  );
  same(lowLevelSelected[0], selectedUse, "low-level replay accepts selected membership shape");

  // Strong replay owns the independent authority selection and rejects the
  // candidate's replacement membership.
  sourceResultError(
    "source-authority-mismatch",
    () => replayV012SelectedSourceEvidenceAgainstAuthority(
      new ReadOnlyProbe(memory),
      basis,
      candidate,
      expectedAuthority,
      fixedTheoryAuthority,
    ),
  );
  same(
    memory.linkCount,
    beforeReplay,
    "candidate Grammar self-admission strong rejection is read-only",
  );
}

console.log("MTS v0.12 exact STRING source authority: GREEN.");
