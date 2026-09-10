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
} from "../src/dictionary.js";
import {
  defineTypedContext,
  openFormalContext,
  openFormalSquareBracketContext,
  verifyTypedContext,
  type TypedContext,
} from "../src/context-integration.js";
import {
  defineStructuralInterpreter,
  readStructuralInterpreter,
  type StructuralInterpreter,
} from "../src/structural-rule.js";
import { readContext } from "../src/state.js";
import {
  Memory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`AR2 C4 source-target probe: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

class TargetAuthorityError extends Error {
  override readonly name = "TargetAuthorityError";
}

interface InterpreterFixture {
  readonly handle: LinkHandle;
  readonly structure: StructuralInterpreter;
}

interface RevisionState {
  readonly parent: LinkHandle;
  readonly history: LinkHandle;
}

interface RevisionEffect {
  readonly fact: LinkHandle;
  readonly occurrence: LinkHandle;
  readonly afterRevision: LinkHandle;
}

interface TargetEvidence {
  readonly entry: LinkHandle;
  readonly targetInterpreter: LinkHandle;
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

function defineRevision(
  memory: Memory,
  parent: LinkHandle,
  history: LinkHandle,
): LinkHandle {
  return memory.ensureStartSelfClosed(memory.ensure(parent, history));
}

function readRevision(memory: ReadMemory, revision: LinkHandle): RevisionState {
  try {
    const wrapper = memory.poles(revision);
    if (wrapper.start !== revision || wrapper.end === revision) {
      throw new TargetAuthorityError("invalid revision wrapper");
    }
    const payload = memory.poles(wrapper.end);
    return Object.freeze({ parent: payload.start, history: payload.end });
  } catch (error) {
    if (error instanceof TargetAuthorityError) throw error;
    throw new TargetAuthorityError("invalid revision");
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
  return Object.freeze({ fact, occurrence, afterRevision });
}

function verifyRevisionOccurrence(
  memory: ReadMemory,
  selectedRevision: LinkHandle,
  expectedOccurrence: LinkHandle,
  expectedFact: LinkHandle,
): void {
  const selected = readRevision(memory, selectedRevision);
  const visited = new Set<LinkHandle>();
  let history = selected.history;

  while (history !== memory.root) {
    if (visited.has(history)) throw new TargetAuthorityError("revision history cycle");
    visited.add(history);
    const cell = memory.poles(history);
    const previousHistory = cell.start;
    const occurrence = cell.end;
    const occurrencePoles = memory.poles(occurrence);
    const beforeRevision = occurrencePoles.start;
    const fact = occurrencePoles.end;
    const before = readRevision(memory, beforeRevision);
    if (before.parent !== selected.parent || before.history !== previousHistory) {
      throw new TargetAuthorityError("invalid predecessor revision");
    }
    if (occurrence === expectedOccurrence && fact === expectedFact) return;
    history = previousHistory;
  }
  throw new TargetAuthorityError("target fact is outside selected Grammar revision");
}

function interpreter(
  memory: Memory,
  dictionary: LinkHandle,
  grammar: LinkHandle,
  theory: LinkHandle,
): InterpreterFixture {
  const structure: StructuralInterpreter = Object.freeze({ dictionary, grammar, theory });
  return Object.freeze({
    handle: defineStructuralInterpreter(memory, dictionary, grammar, theory),
    structure,
  });
}

function targetEvidence(
  memory: Memory,
  grammarBefore: LinkHandle,
  entry: LinkHandle,
  targetInterpreter: LinkHandle,
): { readonly evidence: TargetEvidence; readonly grammarAfter: LinkHandle } {
  const fact = memory.ensure(entry, targetInterpreter);
  const effect = appendRevisionFact(memory, grammarBefore, fact);
  return Object.freeze({
    evidence: Object.freeze({
      entry,
      targetInterpreter,
      fact,
      occurrence: effect.occurrence,
    }),
    grammarAfter: effect.afterRevision,
  });
}

function verifySourceSelectedTarget(
  memory: ReadMemory,
  sourceEvidence: SourceFrontEndEvidence,
  formalBefore: TypedContext,
  selectedFormalInterpreter: InterpreterFixture,
  target: TargetEvidence,
  candidateChild: TypedContext,
): LinkHandle {
  const before = memory.linkCount;

  verifyTypedContext(memory, formalBefore, selectedFormalInterpreter.structure);
  if (
    formalBefore.interpreter !== selectedFormalInterpreter.handle ||
    sourceEvidence.dictionary !== selectedFormalInterpreter.structure.dictionary ||
    sourceEvidence.grammar !== selectedFormalInterpreter.structure.grammar ||
    sourceEvidence.theory !== selectedFormalInterpreter.structure.theory
  ) {
    throw new TargetAuthorityError("source/context authority profile mismatch");
  }

  const entries = replaySelectedSourceEvidence(memory, sourceEvidence);
  if (entries.length !== 1 || entries[0] !== target.entry) {
    throw new TargetAuthorityError("source does not resolve to target Entry");
  }

  const targetFact = memory.poles(target.fact);
  if (targetFact.start !== target.entry || targetFact.end !== target.targetInterpreter) {
    throw new TargetAuthorityError("invalid Entry->target transition fact");
  }
  verifyRevisionOccurrence(
    memory,
    selectedFormalInterpreter.structure.grammar,
    target.occurrence,
    target.fact,
  );

  if (candidateChild.interpreter !== target.targetInterpreter) {
    throw new TargetAuthorityError("candidate child selected wrong target interpreter");
  }
  const targetStructure = readStructuralInterpreter(memory, target.targetInterpreter);
  verifyTypedContext(memory, candidateChild, targetStructure);
  const childState = readContext(memory, candidateChild.context);
  if (childState.parent !== formalBefore.context || childState.current !== memory.root) {
    throw new TargetAuthorityError("candidate child is not the retained C4 open transition");
  }

  if (memory.linkCount !== before) {
    throw new TargetAuthorityError("source-target verification wrote to Memory");
  }
  return target.targetInterpreter;
}

function expectRejected(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof TargetAuthorityError,
      `${message}: wrong rejection ${String(error)}`,
    );
    return;
  }
  throw new Error(`AR2 C4 source-target probe: ${message}: expected rejection`);
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("source-target replay must not use find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("source-target replay must not use outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("source-target replay must not use incoming"); }
}

const memory = new Memory();
const pool = anchors(memory, 24);
let cursor = 0;
const next = (label: string): LinkHandle => {
  const value = pool[cursor++];
  assert(value !== undefined, `missing fixture ${label}`);
  return value;
};

// Exact D/G/T revision roots for non-FORMAL profiles. Their concrete content is
// irrelevant to this bounded probe; the important property is that I carries
// selected revision roots rather than deriving authority from ambient adjacency.
const stringD = defineDictionaryScope(memory, memory.root, memory.root);
const stringG = defineRevision(memory, memory.root, memory.root);
const stringT = defineRevision(memory, memory.root, memory.root);
const stringI = interpreter(memory, stringD, stringG, stringT);

const qD = defineDictionaryScope(memory, memory.root, memory.root);
const qGSeed = defineRevision(memory, next("q-parent"), memory.root);
const qT = defineRevision(memory, next("q-theory-parent"), memory.root);
const qI = interpreter(memory, qD, qGSeed, qT);
assert(stringI.handle !== qI.handle, "STRING and Q profile handles differ");

const rootD = defineDictionaryScope(memory, next("root-d-parent"), memory.root);
const rootG = defineRevision(memory, next("root-g-parent"), memory.root);
const rootT = defineRevision(memory, next("root-t-parent"), memory.root);
const rootI = interpreter(memory, rootD, rootG, rootT);

// The physical source '[' has one Dictionary Entry in the FORMAL D revision.
const bracketBytes = new Uint8Array([0x5b]);
const bracketEntry = next("bracket-entry");
let formalD = defineDictionaryScope(memory, memory.root, memory.root);
const dictionaryEffect = defineDictionaryEffect(
  memory,
  formalD,
  memory.root,
  memory.root,
  materializeSourceContent(memory, bracketBytes),
  bracketEntry,
);
formalD = dictionaryEffect.afterScope;

// C4 authority: selected FORMAL Grammar revision admits the concrete structural
// transition Entry_bracket -> I_STRING. No opaque UseKind is needed for this
// bounded transition claim.
const formalG0 = defineRevision(memory, next("formal-g-parent"), memory.root);
const stringTarget = targetEvidence(memory, formalG0, bracketEntry, stringI.handle);
const formalT = defineRevision(memory, next("formal-t-parent"), memory.root);
const formalI = interpreter(memory, formalD, stringTarget.grammarAfter, formalT);

const source = defineSourceForm(memory, materializeSourceContent(memory, bracketBytes));
const sourceSpec: SelectedSegmentSpec = Object.freeze({
  start: 0,
  end: 1,
  form: bracketEntry,
  dictionaryOccurrence: dictionaryEffect.occurrence,
});
const sourceEvidence = buildSelectedSourceEvidence(
  memory,
  source,
  [sourceSpec],
  {
    dictionary: formalI.structure.dictionary,
    grammar: formalI.structure.grammar,
    theory: formalI.structure.theory,
  },
);

const parent = defineTypedContext(memory, rootI.handle, memory.root, memory.root);
const formal = openFormalContext(memory, parent, rootI.structure, formalI.handle);

// Producer may materialize either structurally valid child. Authority decides.
const candidateStringChild = openFormalSquareBracketContext(
  memory,
  formal,
  formalI.structure,
  stringI.handle,
);
const candidateQChild = openFormalSquareBracketContext(
  memory,
  formal,
  formalI.structure,
  qI.handle,
);

same(
  verifySourceSelectedTarget(
    memory,
    sourceEvidence,
    formal,
    formalI,
    stringTarget.evidence,
    candidateStringChild,
  ),
  stringI.handle,
  "C4 source+FORMAL authority selects STRING target",
);

// F01/A7 — wrong but internally well-formed target must fail under unchanged
// source, Dictionary, Grammar revision, Theory revision and parent context.
expectRejected(
  () => verifySourceSelectedTarget(
    memory,
    sourceEvidence,
    formal,
    formalI,
    stringTarget.evidence,
    candidateQChild,
  ),
  "unchanged source/support rejects structurally valid Q child",
);

// Attacker can create an ambient Entry->Q fact and even attach it to the old G
// root, but that is not an occurrence in the selected persistent revision.
const attackerFact = memory.ensure(bracketEntry, qI.handle);
const attackerAmbientOccurrence = memory.ensure(formalI.structure.grammar, attackerFact);
const attackerEvidence: TargetEvidence = Object.freeze({
  entry: bracketEntry,
  targetInterpreter: qI.handle,
  fact: attackerFact,
  occurrence: attackerAmbientOccurrence,
});
expectRejected(
  () => verifySourceSelectedTarget(
    memory,
    sourceEvidence,
    formal,
    formalI,
    attackerEvidence,
    candidateQChild,
  ),
  "ambient self-admission cannot authorize Q under old FORMAL Grammar revision",
);

// Explicit authority evolution creates G' and therefore a different I'. The old
// I remains stable; the new profile may intentionally choose Q for the same Entry.
const qTarget = targetEvidence(
  memory,
  formalI.structure.grammar,
  bracketEntry,
  qI.handle,
);
const formalI2 = interpreter(memory, formalD, qTarget.grammarAfter, formalT);
assert(formalI2.handle !== formalI.handle, "Grammar revision change changes interpreter profile identity");

const sourceEvidence2 = buildSelectedSourceEvidence(
  memory,
  source,
  [sourceSpec],
  {
    dictionary: formalI2.structure.dictionary,
    grammar: formalI2.structure.grammar,
    theory: formalI2.structure.theory,
  },
);
const formal2 = openFormalContext(memory, parent, rootI.structure, formalI2.handle);
const candidateQChild2 = openFormalSquareBracketContext(
  memory,
  formal2,
  formalI2.structure,
  qI.handle,
);
same(
  verifySourceSelectedTarget(
    memory,
    sourceEvidence2,
    formal2,
    formalI2,
    qTarget.evidence,
    candidateQChild2,
  ),
  qI.handle,
  "explicit G' / I' may authorize Q",
);

// Creating G'/I' does not retroactively alter old FORMAL authority.
same(
  verifySourceSelectedTarget(
    memory,
    sourceEvidence,
    formal,
    formalI,
    stringTarget.evidence,
    candidateStringChild,
  ),
  stringI.handle,
  "old FORMAL profile remains STRING-selecting after G'/I' exists",
);
expectRejected(
  () => verifySourceSelectedTarget(
    memory,
    sourceEvidence,
    formal,
    formalI,
    qTarget.evidence,
    candidateQChild,
  ),
  "new revision occurrence is not visible from old FORMAL profile",
);

// Trusted C4 verification is pole-only once source/transition evidence is given.
same(
  verifySourceSelectedTarget(
    new PoleOnlyProbe(memory),
    sourceEvidence,
    formal,
    formalI,
    stringTarget.evidence,
    candidateStringChild,
  ),
  stringI.handle,
  "C4 source-target replay is pole-only",
);

const classification = Object.freeze({
  c4MechanicsRetained: true,
  sourceOccurrenceResolvesEntry: true,
  grammarRevisionSelectsConcreteTarget: true,
  wrongWellFormedTargetRejectedUnderSameAuthority: true,
  ambientTargetSelfAdmissionRejected: true,
  authorityEvolutionCreatesNewInterpreterProfile: true,
  oldInterpreterProfileRemainsStable: true,
  opaqueUseObjectNotRequiredForThisBoundedTransition: true,
  universalUseAsRuleApplicationStillUnproven: true,
  rootContextAuthorityStillRequiresExplicitBootstrap: true,
  verdict: "PROVISIONAL_GREEN" as const,
  reason: "SOURCE_ENTRY_TO_TARGET_AUTHORITY_REFRAMES_C4_WITHOUT_REWRITING_MECHANICS" as const,
});

same(classification.verdict, "PROVISIONAL_GREEN", "AR2 C4 target classification");
console.log("MTS AR2 C4 source->Entry->target authority: PROVISIONAL GREEN.");
