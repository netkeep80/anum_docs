import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  replaySelectedSourceEvidence,
  type SelectedSegmentSpec,
  type SourceFrontEndEvidence,
} from "../src/source.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
  verifyVisibleDictionaryOccurrence,
} from "../src/dictionary.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  exportCanonicalTopology,
} from "../src/canonical-topology.js";
import {
  Memory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`AR1 root-bounded support probe: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

class SupportProbeError extends Error {
  override readonly name = "SupportProbeError";
}

interface SelectedAuthority {
  readonly dictionary: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly revision: LinkHandle;
}

interface DictionaryFixture {
  readonly dictionary: LinkHandle;
  readonly occurrences: readonly LinkHandle[];
}

function anchors(memory: Memory, count: number): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  let current = memory.ensureEndSelfClosed(memory.root);
  for (let index = 0; index < count; index += 1) {
    current = memory.ensureStartSelfClosed(current);
    result.push(current);
  }
  return Object.freeze(result);
}

function dictionaryWith(
  memory: Memory,
  mappings: readonly (readonly [Uint8Array, LinkHandle])[],
): DictionaryFixture {
  let history = memory.root;
  let dictionary = defineDictionaryScope(memory, memory.root, history);
  const occurrences: LinkHandle[] = [];

  for (const [bytes, entry] of mappings) {
    const effect = defineDictionaryEffect(
      memory,
      dictionary,
      memory.root,
      history,
      materializeSourceContent(memory, bytes),
      entry,
    );
    occurrences.push(effect.occurrence);
    history = effect.historyAfter;
    dictionary = effect.afterScope;
  }

  return Object.freeze({
    dictionary,
    occurrences: Object.freeze(occurrences),
  });
}

function segment(
  start: number,
  end: number,
  entry: LinkHandle,
  dictionaryOccurrence: LinkHandle,
): SelectedSegmentSpec {
  return Object.freeze({ start, end, form: entry, dictionaryOccurrence });
}

/**
 * Research-only authority manifest. The revision is an ordinary rooted Link:
 * START(ExactSequence<AdmissionLink>). Nothing here is proposed as a second
 * production kernel; this is only an executable falsifier for the property
 * that later ambient adjacency must not extend an already selected authority.
 */
function defineSupportRevision(
  memory: Memory,
  admissions: readonly LinkHandle[],
): LinkHandle {
  if (new Set(admissions).size !== admissions.length) {
    throw new SupportProbeError("duplicate support admission");
  }
  return memory.ensureStartSelfClosed(materializeExactSequence(memory, admissions));
}

function readSupportAdmissions(
  memory: ReadMemory,
  revision: LinkHandle,
): readonly LinkHandle[] {
  const wrapper = memory.poles(revision);
  if (wrapper.start !== revision || wrapper.end === revision) {
    throw new SupportProbeError("invalid support revision");
  }
  return readExactSequence(memory, wrapper.end).values;
}

function requireSupportAdmission(
  memory: ReadMemory,
  revision: LinkHandle,
  admission: LinkHandle,
): void {
  if (!readSupportAdmissions(memory, revision).includes(admission)) {
    throw new SupportProbeError("admission is outside selected support revision");
  }
}

function verifySourceUnderAuthority(
  memory: ReadMemory,
  evidence: SourceFrontEndEvidence,
  authority: SelectedAuthority,
): readonly LinkHandle[] {
  const before = memory.linkCount;
  const entries = replaySelectedSourceEvidence(memory, evidence);

  if (
    evidence.dictionary !== authority.dictionary ||
    evidence.grammar !== authority.grammar ||
    evidence.theory !== authority.theory
  ) {
    throw new SupportProbeError("source evidence selected another authority");
  }

  // Recheck dictionary visibility against the independently selected revision,
  // not merely against the dictionary handle carried by untrusted evidence.
  for (const selected of evidence.segments) {
    verifyVisibleDictionaryOccurrence(
      memory,
      authority.dictionary,
      selected.dictionaryOccurrence,
      selected.sliceContent,
      selected.form,
    );
  }

  // Current source builder may materialize these links. That is harmless only
  // when materialization does not grant authority: the exact admission must
  // already be present in the independently selected manifest root.
  requireSupportAdmission(memory, authority.revision, evidence.grammarMembership);
  requireSupportAdmission(memory, authority.revision, evidence.theoryMembership);

  if (memory.linkCount !== before) {
    throw new SupportProbeError("authority verification wrote to Memory");
  }
  return entries;
}

function expectRejected(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof SupportProbeError, `${message}: wrong rejection ${String(error)}`);
    return;
  }
  throw new Error(`AR1 root-bounded support probe: ${message}: expected rejection`);
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("authority replay must not use ambient find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("authority replay must not use ambient outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("authority replay must not use ambient incoming"); }
}

// A1 — complete D/G/T substitution must fail under independently selected S.
{
  const memory = new Memory();
  const pool = anchors(memory, 12);
  let cursor = 0;
  const next = (label: string): LinkHandle => {
    const value = pool[cursor++];
    assert(value !== undefined, `missing A1 fixture ${label}`);
    return value;
  };

  const goodEntry = next("good-entry");
  const attackerEntry = next("attacker-entry");
  const goodGrammar = next("good-grammar");
  const attackerGrammar = next("attacker-grammar");
  const goodTheory = next("good-theory");
  const attackerTheory = next("attacker-theory");
  const x = new Uint8Array([0x78]);
  const source = defineSourceForm(memory, materializeSourceContent(memory, x));
  const goodDictionary = dictionaryWith(memory, [[x, goodEntry]]);
  const attackerDictionary = dictionaryWith(memory, [[x, attackerEntry]]);

  const goodEvidence = buildSelectedSourceEvidence(
    memory,
    source,
    [segment(0, 1, goodEntry, goodDictionary.occurrences[0]!)],
    { dictionary: goodDictionary.dictionary, grammar: goodGrammar, theory: goodTheory },
  );
  const attackerEvidence = buildSelectedSourceEvidence(
    memory,
    source,
    [segment(0, 1, attackerEntry, attackerDictionary.occurrences[0]!)],
    { dictionary: attackerDictionary.dictionary, grammar: attackerGrammar, theory: attackerTheory },
  );

  const revision = defineSupportRevision(memory, [
    goodEvidence.grammarMembership,
    goodEvidence.theoryMembership,
  ]);
  const authority: SelectedAuthority = {
    dictionary: goodDictionary.dictionary,
    grammar: goodGrammar,
    theory: goodTheory,
    revision,
  };

  same(verifySourceUnderAuthority(memory, goodEvidence, authority)[0], goodEntry, "A1 good evidence");
  expectRejected(
    () => verifySourceUnderAuthority(memory, attackerEvidence, authority),
    "A1 attacker-selected D/G/T must not self-authenticate",
  );
}

// A2/A9/A10/A11/A14 — same D/G/T anchors, alternative segmentation and later
// ambient admissions cannot change old S; explicit S' may admit both parses.
{
  const memory = new Memory();
  const pool = anchors(memory, 16);
  let cursor = 0;
  const next = (label: string): LinkHandle => {
    const value = pool[cursor++];
    assert(value !== undefined, `missing A2 fixture ${label}`);
    return value;
  };

  const entryA = next("entry-a");
  const entryB = next("entry-b");
  const entryAB = next("entry-ab");
  const grammar = next("grammar");
  const theory = next("theory");
  const unrelatedOne = next("unrelated-one");
  const unrelatedTwo = next("unrelated-two");
  const a = new Uint8Array([0x61]);
  const b = new Uint8Array([0x62]);
  const ab = new Uint8Array([0x61, 0x62]);
  const source = defineSourceForm(memory, materializeSourceContent(memory, ab));
  const dictionary = dictionaryWith(memory, [
    [a, entryA],
    [b, entryB],
    [ab, entryAB],
  ]);

  const splitEvidence = buildSelectedSourceEvidence(
    memory,
    source,
    [
      segment(0, 1, entryA, dictionary.occurrences[0]!),
      segment(1, 2, entryB, dictionary.occurrences[1]!),
    ],
    { dictionary: dictionary.dictionary, grammar, theory },
  );
  const splitRevision = defineSupportRevision(memory, [
    splitEvidence.grammarMembership,
    splitEvidence.theoryMembership,
  ]);
  const splitAuthority: SelectedAuthority = {
    dictionary: dictionary.dictionary,
    grammar,
    theory,
    revision: splitRevision,
  };

  const split = verifySourceUnderAuthority(memory, splitEvidence, splitAuthority);
  same(split.length, 2, "A2 split accepted by selected revision");
  same(split[0], entryA, "A2 first split entry");
  same(split[1], entryB, "A2 second split entry");

  // The untrusted builder now creates a second internally consistent admission
  // around exactly the same grammar/theory anchors.
  const wholeEvidence = buildSelectedSourceEvidence(
    memory,
    source,
    [segment(0, 2, entryAB, dictionary.occurrences[2]!)],
    { dictionary: dictionary.dictionary, grammar, theory },
  );
  same(
    memory.ensure(grammar, wholeEvidence.formSequence),
    wholeEvidence.grammarMembership,
    "A9 ambient grammar admission exists",
  );
  same(
    memory.ensure(theory, wholeEvidence.formSequence),
    wholeEvidence.theoryMembership,
    "A9 ambient theory admission exists",
  );
  expectRejected(
    () => verifySourceUnderAuthority(memory, wholeEvidence, splitAuthority),
    "A2/A9 old revision must not see producer-added whole parse",
  );

  // Unrelated adjacency, including new outgoing links from the same G/T anchors,
  // must not alter either verdict under the already selected revision.
  memory.ensure(grammar, unrelatedOne);
  memory.ensure(theory, unrelatedTwo);
  same(
    verifySourceUnderAuthority(memory, splitEvidence, splitAuthority).length,
    2,
    "A10 old positive verdict survives unrelated Memory extension",
  );
  expectRejected(
    () => verifySourceUnderAuthority(memory, wholeEvidence, splitAuthority),
    "A10 old negative verdict survives unrelated Memory extension",
  );

  // A new explicitly selected revision may admit the alternative as well.
  const bothRevision = defineSupportRevision(memory, [
    splitEvidence.grammarMembership,
    splitEvidence.theoryMembership,
    wholeEvidence.grammarMembership,
    wholeEvidence.theoryMembership,
  ]);
  const bothAuthority: SelectedAuthority = { ...splitAuthority, revision: bothRevision };
  same(verifySourceUnderAuthority(memory, splitEvidence, bothAuthority).length, 2, "A11 S1 admits split");
  same(verifySourceUnderAuthority(memory, wholeEvidence, bothAuthority).length, 1, "A11 S1 admits whole");

  // A14: authority constrains admissibility, not uniqueness. Both parses are
  // legal when the same selected support genuinely contains both admissions.
  assert(splitRevision !== bothRevision, "A11 support revision root must change when authority changes");

  // A8: with all candidate evidence supplied, this bounded replay requires
  // poles only. Ambient find/incoming/outgoing discovery is unnecessary.
  same(
    verifySourceUnderAuthority(new PoleOnlyProbe(memory), splitEvidence, splitAuthority).length,
    2,
    "A8 pole-only replay",
  );

  // A13: manifest order changes exact revision identity but need not change
  // extensional admission judgments. This is intentionally left as a semantic
  // decision for later: revision provenance identity != necessarily authority-set equality.
  const reversedRevision = defineSupportRevision(memory, [
    wholeEvidence.theoryMembership,
    wholeEvidence.grammarMembership,
    splitEvidence.theoryMembership,
    splitEvidence.grammarMembership,
  ]);
  assert(reversedRevision !== bothRevision, "A13 ordered manifest has distinct structural identity");
  const reversedAuthority: SelectedAuthority = { ...splitAuthority, revision: reversedRevision };
  same(verifySourceUnderAuthority(memory, splitEvidence, reversedAuthority).length, 2, "A13 reversed S admits split");
  same(verifySourceUnderAuthority(memory, wholeEvidence, reversedAuthority).length, 1, "A13 reversed S admits whole");
}

// A12 — no runtime LinkHandle sharing is required. Two independently allocated
// Memories can carry the same rooted support design and reach the same verdict.
function independentFixture(): {
  readonly memory: Memory;
  readonly evidence: SourceFrontEndEvidence;
  readonly authority: SelectedAuthority;
} {
  const memory = new Memory();
  const [entry, grammar, theory] = anchors(memory, 3);
  assert(entry !== undefined && grammar !== undefined && theory !== undefined, "missing A12 anchors");
  const x = new Uint8Array([0x78]);
  const source = defineSourceForm(memory, materializeSourceContent(memory, x));
  const dictionary = dictionaryWith(memory, [[x, entry]]);
  const evidence = buildSelectedSourceEvidence(
    memory,
    source,
    [segment(0, 1, entry, dictionary.occurrences[0]!)],
    { dictionary: dictionary.dictionary, grammar, theory },
  );
  const revision = defineSupportRevision(memory, [
    evidence.grammarMembership,
    evidence.theoryMembership,
  ]);
  return {
    memory,
    evidence,
    authority: { dictionary: dictionary.dictionary, grammar, theory, revision },
  };
}

{
  const left = independentFixture();
  const right = independentFixture();
  same(verifySourceUnderAuthority(left.memory, left.evidence, left.authority).length, 1, "A12 left verdict");
  same(verifySourceUnderAuthority(right.memory, right.evidence, right.authority).length, 1, "A12 right verdict");
  assert(left.authority.revision !== right.authority.revision, "A12 runtime handles must be independent");
  same(
    JSON.stringify(exportCanonicalTopology(left.memory).topology),
    JSON.stringify(exportCanonicalTopology(right.memory).topology),
    "A12 independently allocated fixtures have identical canonical topology",
  );
}

const classification = Object.freeze({
  rootBoundedAuthorityBlocksWholeDGTSubstitution: true,
  oldRevisionIgnoresLaterAmbientAdmissions: true,
  verdictStableUnderUnrelatedMemoryExtension: true,
  explicitNewRevisionCanAdmitNewCandidate: true,
  ambiguityCanRemainLegalUnderOneRevision: true,
  suppliedEvidenceCanVerifyPoleOnly: true,
  crossMemoryRuntimeHandlesAreNotAuthorityIdentity: true,
  manifestOrderIdentityQuestionRemainsOpen: true,
  entryUseSeparationStillRequiresNextProbe: true,
  verdict: "PROVISIONAL_GREEN" as const,
  reason: "ROOT_BOUNDED_SUPPORT_REVISION_SURVIVES_AR1_AUTHORITY_ATTACKS" as const,
});

same(classification.verdict, "PROVISIONAL_GREEN", "root-bounded support classification");
console.log("MTS AR1 root-bounded support revision: PROVISIONAL GREEN.");
