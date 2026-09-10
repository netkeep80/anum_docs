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
  Memory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`AR2 Entry/Use probe: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

class RevisionError extends Error {
  override readonly name = "RevisionError";
}

interface RevisionState {
  readonly parent: LinkHandle;
  readonly history: LinkHandle;
}

interface RevisionEffect {
  readonly fact: LinkHandle;
  readonly occurrence: LinkHandle;
  readonly historyAfter: LinkHandle;
  readonly afterRevision: LinkHandle;
}

interface UseEvidence {
  readonly entry: LinkHandle;
  readonly use: LinkHandle;
  readonly fact: LinkHandle;
  readonly occurrence: LinkHandle;
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

/**
 * Research-only generic persistent revision. This copies the already-existing
 * Dictionary scope/history shape to test whether the mechanism can separate
 * Entry resolution from later Use admission without ambient adjacency.
 */
function defineRevision(
  memory: Memory,
  parent: LinkHandle,
  history: LinkHandle,
): LinkHandle {
  const payload = memory.ensure(parent, history);
  return memory.ensureStartSelfClosed(payload);
}

function readRevision(memory: ReadMemory, revision: LinkHandle): RevisionState {
  try {
    const wrapper = memory.poles(revision);
    if (wrapper.start !== revision || wrapper.end === revision) {
      throw new RevisionError("invalid revision wrapper");
    }
    const payload = memory.poles(wrapper.end);
    return Object.freeze({ parent: payload.start, history: payload.end });
  } catch (error) {
    if (error instanceof RevisionError) throw error;
    throw new RevisionError("invalid revision");
  }
}

function appendRevisionFact(
  memory: Memory,
  beforeRevision: LinkHandle,
  fact: LinkHandle,
): RevisionEffect {
  const before = readRevision(memory, beforeRevision);
  const occurrence = memory.ensure(beforeRevision, fact);
  const historyAfter = memory.ensure(before.history, occurrence);
  const afterRevision = defineRevision(memory, before.parent, historyAfter);
  return Object.freeze({ fact, occurrence, historyAfter, afterRevision });
}

function visibleRevisionFacts(
  memory: ReadMemory,
  revision: LinkHandle,
): readonly RevisionEffect[] {
  const selected = readRevision(memory, revision);
  const result: RevisionEffect[] = [];
  const visited = new Set<LinkHandle>();
  let history = selected.history;

  while (history !== memory.root) {
    if (visited.has(history)) throw new RevisionError("revision history cycle");
    visited.add(history);

    const cell = memory.poles(history);
    const previousHistory = cell.start;
    const occurrence = cell.end;
    const occurrencePoles = memory.poles(occurrence);
    const beforeRevision = occurrencePoles.start;
    const fact = occurrencePoles.end;
    const before = readRevision(memory, beforeRevision);
    if (before.parent !== selected.parent || before.history !== previousHistory) {
      throw new RevisionError("invalid predecessor revision");
    }

    result.push(Object.freeze({
      fact,
      occurrence,
      historyAfter: history,
      afterRevision: revision,
    }));
    history = previousHistory;
  }

  return Object.freeze(result);
}

function verifyRevisionFact(
  memory: ReadMemory,
  revision: LinkHandle,
  occurrence: LinkHandle,
  fact: LinkHandle,
): void {
  const visible = visibleRevisionFacts(memory, revision);
  if (!visible.some((item) => item.occurrence === occurrence && item.fact === fact)) {
    throw new RevisionError("fact is outside selected revision");
  }
}

function useEvidence(
  memory: Memory,
  beforeRevision: LinkHandle,
  entry: LinkHandle,
  use: LinkHandle,
): { readonly evidence: UseEvidence; readonly afterRevision: LinkHandle } {
  const fact = memory.ensure(entry, use);
  const effect = appendRevisionFact(memory, beforeRevision, fact);
  return Object.freeze({
    evidence: Object.freeze({ entry, use, fact, occurrence: effect.occurrence }),
    afterRevision: effect.afterRevision,
  });
}

function verifyUse(
  memory: ReadMemory,
  sourceEvidence: SourceFrontEndEvidence,
  selectedDictionary: LinkHandle,
  selectedGrammarRevision: LinkHandle,
  candidate: UseEvidence,
): LinkHandle {
  const before = memory.linkCount;

  // Current source.ts still calls the selected dictionary value `form` and also
  // carries self-admitted G/T memberships. For this probe only the exact source,
  // occurrence and Dictionary result are retained: that result is interpreted
  // as Entry. The source builder's ambient G/T memberships grant no Use authority.
  const entries = replaySelectedSourceEvidence(memory, sourceEvidence);
  if (sourceEvidence.dictionary !== selectedDictionary || entries.length !== 1) {
    throw new RevisionError("wrong selected Dictionary or Entry cardinality");
  }
  const entry = entries[0];
  if (entry === undefined || entry !== candidate.entry) {
    throw new RevisionError("source occurrence resolves to another Entry");
  }
  const selectedSegment = sourceEvidence.segments[0];
  if (selectedSegment === undefined) throw new RevisionError("missing source segment");
  verifyVisibleDictionaryOccurrence(
    memory,
    selectedDictionary,
    selectedSegment.dictionaryOccurrence,
    selectedSegment.sliceContent,
    candidate.entry,
  );

  const fact = memory.poles(candidate.fact);
  if (fact.start !== candidate.entry || fact.end !== candidate.use) {
    throw new RevisionError("invalid Entry->Use fact");
  }
  verifyRevisionFact(memory, selectedGrammarRevision, candidate.occurrence, candidate.fact);

  if (memory.linkCount !== before) throw new RevisionError("Use replay wrote to Memory");
  return candidate.use;
}

function expectRejected(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof RevisionError, `${message}: wrong rejection ${String(error)}`);
    return;
  }
  throw new Error(`AR2 Entry/Use probe: ${message}: expected rejection`);
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("Entry/Use replay must not use find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("Entry/Use replay must not use outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("Entry/Use replay must not use incoming"); }
}

const memory = new Memory();
const pool = anchors(memory, 12);
let cursor = 0;
const next = (label: string): LinkHandle => {
  const value = pool[cursor++];
  assert(value !== undefined, `missing fixture ${label}`);
  return value;
};

const entryBracket = next("Entry-bracket");
const literalUse = next("Use-literal");
const nestingUse = next("Use-nesting");
const dummyGrammar = next("source-builder-dummy-grammar");
const dummyTheory = next("source-builder-dummy-theory");
const unrelated = next("unrelated");
const bracketBytes = new Uint8Array([0x5b]);
const source = defineSourceForm(memory, materializeSourceContent(memory, bracketBytes));

// Dictionary resolves the spelling once: physical '[' -> one Entry.
let dictionary = defineDictionaryScope(memory, memory.root, memory.root);
const dictionaryEffect = defineDictionaryEffect(
  memory,
  dictionary,
  memory.root,
  memory.root,
  materializeSourceContent(memory, bracketBytes),
  entryBracket,
);
dictionary = dictionaryEffect.afterScope;
const sourceSpec: SelectedSegmentSpec = Object.freeze({
  start: 0,
  end: 1,
  form: entryBracket,
  dictionaryOccurrence: dictionaryEffect.occurrence,
});
const sourceEvidence = buildSelectedSourceEvidence(
  memory,
  source,
  [sourceSpec],
  { dictionary, grammar: dummyGrammar, theory: dummyTheory },
);
same(replaySelectedSourceEvidence(memory, sourceEvidence)[0], entryBracket, "source resolves '[' to Entry");

// Grammar authority starts as one persistent rooted revision and may fork.
const grammarBase = defineRevision(memory, memory.root, memory.root);
const literal = useEvidence(memory, grammarBase, entryBracket, literalUse);
const nesting = useEvidence(memory, grammarBase, entryBracket, nestingUse);

// A3/A4 — same physical occurrence and same Entry, different admitted Uses.
same(
  verifyUse(memory, sourceEvidence, dictionary, literal.afterRevision, literal.evidence),
  literalUse,
  "A4 literal grammar admits literal Use",
);
expectRejected(
  () => verifyUse(memory, sourceEvidence, dictionary, literal.afterRevision, nesting.evidence),
  "A3 literal grammar must reject unadmitted nesting Use",
);
same(
  verifyUse(memory, sourceEvidence, dictionary, nesting.afterRevision, nesting.evidence),
  nestingUse,
  "A4 nesting grammar admits nesting Use",
);
expectRejected(
  () => verifyUse(memory, sourceEvidence, dictionary, nesting.afterRevision, literal.evidence),
  "A3 nesting grammar must reject unadmitted literal Use",
);

// A5/A9/A10 — extending Memory or even attaching a candidate directly to the
// old grammar revision cannot retroactively change the rooted old revision.
const ambientAttack = memory.ensure(literal.afterRevision, nesting.evidence.fact);
assert(ambientAttack !== nesting.evidence.occurrence, "ambient attack is not rooted revision occurrence");
memory.ensure(literal.afterRevision, unrelated);
expectRejected(
  () => verifyUse(memory, sourceEvidence, dictionary, literal.afterRevision, nesting.evidence),
  "A5 old grammar revision remains unchanged after ambient extension",
);
same(
  verifyUse(memory, sourceEvidence, dictionary, literal.afterRevision, literal.evidence),
  literalUse,
  "A10 old positive Use verdict is stable",
);

// A11/A14 — a new revision can explicitly admit both Uses. Ambiguity is legal:
// authority says what is permitted, not that exactly one permitted Use exists.
const both = useEvidence(memory, literal.afterRevision, entryBracket, nestingUse);
same(
  verifyUse(memory, sourceEvidence, dictionary, both.afterRevision, literal.evidence),
  literalUse,
  "A14 combined revision retains literal Use",
);
same(
  verifyUse(memory, sourceEvidence, dictionary, both.afterRevision, both.evidence),
  nestingUse,
  "A14 combined revision admits nesting Use",
);
assert(both.afterRevision !== literal.afterRevision, "A11 new authority fact creates a new revision root");

// A8 — exact supplied source/Entry/Use evidence is verifiable by pole traversal
// alone. No global candidate discovery is necessary in the trusted replay.
same(
  verifyUse(new PoleOnlyProbe(memory), sourceEvidence, dictionary, both.afterRevision, both.evidence),
  nestingUse,
  "A8 pole-only Entry->Use replay",
);

// Corruption/fork check: an occurrence from a sibling revision cannot be
// smuggled into another branch merely because its fact is structurally valid.
expectRejected(
  () => verifyUse(memory, sourceEvidence, dictionary, both.afterRevision, nesting.evidence),
  "sibling occurrence itself is not visible through the selected revision history",
);

const classification = Object.freeze({
  dictionaryCanActAsEntryResolver: true,
  entryAndUseAreStructurallyDistinct: true,
  sameOccurrenceAndEntryCanHaveGrammarRelativeUses: true,
  oldRevisionRejectsLaterOrSiblingUse: true,
  newRevisionMayAdmitAdditionalUse: true,
  ambiguityNeedNotBeRejected: true,
  useReplayCanBePoleOnly: true,
  sourceBuilderGrammarMembershipIsNotUseAuthority: true,
  contextDependentUseStillRequiresAR3Boundary: true,
  targetTransitionDerivationStillRequiresNextProbe: true,
  verdict: "PROVISIONAL_GREEN" as const,
  reason: "ENTRY_TO_USE_SEPARATION_SURVIVES_ROOTED_REVISION_FALSIFICATION" as const,
});

same(classification.verdict, "PROVISIONAL_GREEN", "AR2 Entry/Use classification");
console.log("MTS AR2 Entry->Use rooted revision: PROVISIONAL GREEN.");
