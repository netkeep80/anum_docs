import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  InterpreterReplayError,
  replayContextualReading,
  type ContextualReadingEvidence,
  type ContextualReadingRoles,
} from "../src/interpreter.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  type SelectedSegmentSpec,
  type SourceFrontEndEvidence,
} from "../src/source.js";
import { defineContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`historical Coq self/context: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function sameJson(actual: unknown, expected: unknown, message: string): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
  );
}

function reject(message: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof InterpreterReplayError, `${message}: expected InterpreterReplayError`);
    same(error.code, "invalid-flat-evidence", `${message}: error code`);
    return;
  }
  throw new Error(`historical Coq self/context: ${message}: expected rejection`);
}

class Probe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined {
    throw new Error("historical self replay must not use find/ambient lookup");
  }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    return this.source.outgoing(start);
  }
  incoming(): readonly LinkHandle[] {
    throw new Error("historical self replay must not scan incoming");
  }
}

function anchors(memory: Memory, count: number): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  const seed = memory.ensureEndSelfClosed(memory.root);
  let tag = memory.ensureStartSelfClosed(memory.root);
  for (let index = 0; index < count; index += 1) {
    tag = memory.ensureStartSelfClosed(tag);
    result.push(memory.ensure(seed, tag));
  }
  return Object.freeze(result);
}

interface DictionaryFixture {
  readonly dictionary: LinkHandle;
  readonly occurrence: LinkHandle;
}

function oneEntryDictionary(
  memory: Memory,
  sourceContent: LinkHandle,
  form: LinkHandle,
): DictionaryFixture {
  const before = defineDictionaryScope(memory, memory.root, memory.root);
  const effect = defineDictionaryEffect(
    memory,
    before,
    memory.root,
    memory.root,
    sourceContent,
    form,
  );
  return Object.freeze({ dictionary: effect.afterScope, occurrence: effect.occurrence });
}

function dotSourceEvidence(
  memory: Memory,
  form: LinkHandle,
  dictionary: DictionaryFixture,
  grammar: LinkHandle,
  theory: LinkHandle,
): SourceFrontEndEvidence {
  const bytes = new Uint8Array([0x2e]);
  const content = materializeSourceContent(memory, bytes);
  const source = defineSourceForm(memory, content);
  const specs: readonly SelectedSegmentSpec[] = Object.freeze([
    Object.freeze({
      start: 0,
      end: 1,
      form,
      dictionaryOccurrence: dictionary.occurrence,
    }),
  ]);
  return buildSelectedSourceEvidence(
    memory,
    source,
    specs,
    { dictionary: dictionary.dictionary, grammar, theory },
  );
}

function contextualRoles(memory: Memory): ContextualReadingRoles {
  const values = anchors(memory, 24).slice(14);
  assert(values.length === 10, "role vocabulary must contain ten roles");
  return Object.freeze({
    source: values[0]!,
    sourceSelection: values[1]!,
    formSequence: values[2]!,
    dictionary: values[3]!,
    grammar: values[4]!,
    theory: values[5]!,
    beforeContext: values[6]!,
    contextualRole: values[7]!,
    result: values[8]!,
    afterContext: values[9]!,
  });
}

function roleList(value: ContextualReadingRoles): readonly LinkHandle[] {
  return Object.freeze([
    value.source,
    value.sourceSelection,
    value.formSequence,
    value.dictionary,
    value.grammar,
    value.theory,
    value.beforeContext,
    value.contextualRole,
    value.result,
    value.afterContext,
  ]);
}

function contextualEvidence(
  memory: Memory,
  source: SourceFrontEndEvidence,
  vocabulary: ContextualReadingRoles,
  contextualRole: LinkHandle,
  beforeContext: LinkHandle,
  result: LinkHandle,
  afterContext: LinkHandle,
  omitBeforeContext = false,
): ContextualReadingEvidence {
  const interpreter = defineStructuralInterpreter(
    memory,
    source.dictionary,
    source.grammar,
    source.theory,
  );
  const roleDictionary = defineStructuralRoleDictionary(memory, roleList(vocabulary));
  const act = defineActHeader(memory, interpreter, roleDictionary, afterContext);
  const fields: readonly [LinkHandle, LinkHandle][] = [
    [vocabulary.source, source.source],
    [vocabulary.sourceSelection, source.selectionSequence],
    [vocabulary.formSequence, source.formSequence],
    [vocabulary.dictionary, source.dictionary],
    [vocabulary.grammar, source.grammar],
    [vocabulary.theory, source.theory],
    [vocabulary.contextualRole, contextualRole],
    [vocabulary.result, result],
    [vocabulary.afterContext, afterContext],
  ];
  for (const [role, value] of fields) defineActField(memory, act, role, value);
  if (!omitBeforeContext) defineActField(memory, act, vocabulary.beforeContext, beforeContext);
  return Object.freeze({
    sourceEvidence: source,
    act,
    roles: vocabulary,
    interpreter,
    roleDictionary,
  });
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const { R, O, C, L, U } = basis;
const pool = anchors(memory, 8);
const dotRole = pool[0];
const otherForm = pool[1];
const grammar = pool[2];
const theory = pool[3];
assert(dotRole && otherForm && grammar && theory, "fixture anchors must exist");

// Historical Coq `self` is tested only as an occurrence role. It is not a new
// semantic Self primitive and is not the accepted semantic DotMeaning Link.
const dotMeaning = memory.ensure(L, R);
assert(dotRole !== dotMeaning, "contextual self occurrence must differ from DotMeaning=L⟼R");
assert(![R, O, C, L, U].includes(dotRole), "contextual self occurrence must not alias root basis");

const dotContent = materializeSourceContent(memory, new Uint8Array([0x2e]));
const dotDictionary = oneEntryDictionary(memory, dotContent, dotRole);
const source = dotSourceEvidence(memory, dotRole, dotDictionary, grammar, theory);
const vocabulary = contextualRoles(memory);

const rootContext = defineContext(memory, R, R);
const oContext = defineContext(memory, R, O);
const cContext = defineContext(memory, R, C);
assert(new Set([rootContext, oContext, cContext]).size === 3, "explicit contexts must remain distinct");

const rootEvidence = contextualEvidence(memory, source, vocabulary, dotRole, rootContext, R, rootContext);
const oEvidence = contextualEvidence(memory, source, vocabulary, dotRole, oContext, O, oContext);
const cEvidence = contextualEvidence(memory, source, vocabulary, dotRole, cContext, C, cContext);
const constructionCount = memory.linkCount;
const probe = new Probe(memory);

// One and the same occurrence role resolves deictically from the explicit K.
same(replayContextualReading(probe, rootEvidence), R, "old self in old E resolves to current R");
same(replayContextualReading(probe, oEvidence), O, "old self in old O resolves to current O");
same(replayContextualReading(probe, cEvidence), C, "old self in old S resolves to current C");
same(memory.linkCount, constructionCount, "contextual self replay must be read-only");

// Two self occurrences are two structural positions even though both carry the
// same role and resolve to the same selected current Link.
const twoSelfOccurrences = materializeExactSequence(memory, [dotRole, dotRole]);
const occurrences = readExactSequence(memory, twoSelfOccurrences);
sameJson(occurrences.values, [dotRole, dotRole], "two historical self occurrences keep the same role value");
same(occurrences.cells.length, 2, "two historical self occurrences keep two exact positions");
assert(occurrences.cells[0] !== occurrences.cells[1], "the two occurrence positions must remain distinct");
const afterOccurrenceConstruction = memory.linkCount;
same(replayContextualReading(new Probe(memory), rootEvidence), R, "first root self occurrence resolves to R");
same(replayContextualReading(new Probe(memory), rootEvidence), R, "second root self occurrence resolves to R");
same(memory.linkCount, afterOccurrenceConstruction, "replaying both self occurrences performs zero writes");

// The historical definitions then become the already accepted root equations.
// No finite `self` leaf is substituted into the semantic structure.
const rPoles = probe.poles(R);
same(rPoles.start, R, "old E -> current R satisfies Pair(R,R)=R at START pole");
same(rPoles.end, R, "old E -> current R satisfies Pair(R,R)=R at END pole");
const oPoles = probe.poles(O);
same(oPoles.start, O, "old O -> current O satisfies Pair(O,R)=O at START pole");
same(oPoles.end, R, "old O -> current O satisfies Pair(O,R)=O at END pole");
const cPoles = probe.poles(C);
same(cPoles.start, R, "old S -> current C satisfies Pair(R,C)=C at START pole");
same(cPoles.end, C, "old S -> current C satisfies Pair(R,C)=C at END pole");
const lPoles = probe.poles(L);
same(lPoles.start, O, "old R -> current L satisfies Pair(O,C)=L at START pole");
same(lPoles.end, C, "old R -> current L satisfies Pair(O,C)=L at END pole");

// Physical '.' is presentation only. If the admitted dictionary maps the same
// byte to another form, it cannot impersonate the explicit contextual role.
const glyphOnlyDictionary = oneEntryDictionary(memory, dotContent, otherForm);
const glyphOnlySource = dotSourceEvidence(memory, otherForm, glyphOnlyDictionary, grammar, theory);
const glyphOnlyEvidence = contextualEvidence(
  memory,
  glyphOnlySource,
  vocabulary,
  dotRole,
  rootContext,
  R,
  rootContext,
);
const afterGlyphConstruction = memory.linkCount;
reject("physical dot without admitted contextual role has no self authority", () =>
  replayContextualReading(new Probe(memory), glyphOnlyEvidence)
);
same(memory.linkCount, afterGlyphConstruction, "glyph-only rejection must be read-only");

// Explicit context is authority: using the wrong K cannot be repaired by host
// lexical state, ambient current, or the requested result.
const wrongContextEvidence = contextualEvidence(
  memory,
  source,
  vocabulary,
  dotRole,
  oContext,
  C,
  cContext,
);
const afterWrongContextConstruction = memory.linkCount;
reject("wrong explicit context cannot resolve self to another current", () =>
  replayContextualReading(new Probe(memory), wrongContextEvidence)
);
same(memory.linkCount, afterWrongContextConstruction, "wrong-context rejection must be read-only");

// Missing the explicit K binding is underdetermined and fails closed.
const missingContextEvidence = contextualEvidence(
  memory,
  source,
  vocabulary,
  dotRole,
  rootContext,
  R,
  rootContext,
  true,
);
const afterMissingContextConstruction = memory.linkCount;
reject("missing explicit context binding", () =>
  replayContextualReading(new Probe(memory), missingContextEvidence)
);
same(memory.linkCount, afterMissingContextConstruction, "missing-context rejection must be read-only");
