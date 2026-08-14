import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  replaySourceSubselection,
  SourceError,
  type SelectedSegmentSpec,
  type SourceSubselectionEvidence,
} from "../src/source.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import {
  Memory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertSame<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
  );
}

function expectSourceError(effect: () => unknown, code: SourceError["code"]): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof SourceError, `expected SourceError, got ${String(error)}`);
    assertSame(error.code, code, "source error code");
    return;
  }
  throw new Error(`expected SourceError(${code})`);
}

function anchors(memory: Memory, count: number): LinkHandle[] {
  const result: LinkHandle[] = [];
  let current = memory.root;
  for (let index = 0; index < count; index += 1) {
    current = memory.ensureStartSelfClosed(current);
    result.push(current);
  }
  return result;
}

class ChainOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("subselection replay must not use find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("subselection replay must not use outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("subselection replay must not use incoming"); }
}

function fold(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  let current = memory.root;
  for (const value of values) current = memory.ensure(current, value);
  return current;
}

function spec(
  start: number,
  end: number,
  form: LinkHandle,
  dictionaryOccurrence: LinkHandle,
): SelectedSegmentSpec {
  return Object.freeze({ start, end, form, dictionaryOccurrence });
}

const memory = new Memory();
const refs = anchors(memory, 264);
const byteRefs = refs.slice(0, 256);
const [formA, formB, formC, grammar, theory, unrelated] = refs.slice(256, 262);
assert(
  byteRefs.length === 256 && formA !== undefined && formB !== undefined &&
  formC !== undefined && grammar !== undefined && theory !== undefined && unrelated !== undefined,
  "subselection fixture refs",
);

let history = memory.root;
let dictionary = defineDictionaryScope(memory, memory.root, history);
const occurrences: LinkHandle[] = [];
for (const [value, form] of [[0x61, formA], [0x62, formB], [0x63, formC]] as const) {
  const content = materializeSourceContent(memory, byteRefs, new Uint8Array([value]));
  const effect = defineDictionaryEffect(
    memory,
    dictionary,
    memory.root,
    history,
    content,
    form,
  );
  occurrences.push(effect.occurrence);
  history = effect.historyAfter;
  dictionary = effect.afterScope;
}

const source = defineSourceForm(
  memory,
  materializeSourceContent(memory, byteRefs, new Uint8Array([0x61, 0x62, 0x63])),
);
const evidence = buildSelectedSourceEvidence(
  memory,
  byteRefs,
  source,
  [
    spec(0, 1, formA, occurrences[0]!),
    spec(1, 2, formB, occurrences[1]!),
    spec(2, 3, formC, occurrences[2]!),
  ],
  { dictionary, grammar, theory },
);

function subselection(
  startSegment: number,
  endSegment: number,
  selectionSequence: LinkHandle,
  formSequence: LinkHandle,
  grammarMembership: LinkHandle,
  theoryMembership: LinkHandle,
): SourceSubselectionEvidence {
  return Object.freeze({
    startSegment,
    endSegment,
    selectionSequence,
    formSequence,
    grammar: grammar!,
    theory: theory!,
    grammarMembership,
    theoryMembership,
  });
}

const middleSelection = fold(memory, [evidence.segments[1]!.selection]);
const middleForms = fold(memory, [formB]);
const middleGrammar = memory.ensure(grammar, middleForms);
const middleTheory = memory.ensure(theory, middleForms);
const middle = subselection(1, 2, middleSelection, middleForms, middleGrammar, middleTheory);

{
  const before = memory.linkCount;
  assertDeepEqual(
    replaySourceSubselection(new ChainOnlyProbe(memory), byteRefs, evidence, middle),
    [formB],
    "middle contiguous subselection",
  );
  assertSame(memory.linkCount, before, "middle replay must be read-only");
}

assertDeepEqual(
  replaySourceSubselection(
    memory,
    byteRefs,
    evidence,
    subselection(
      0,
      3,
      evidence.selectionSequence,
      evidence.formSequence,
      evidence.grammarMembership,
      evidence.theoryMembership,
    ),
  ),
  [formA, formB, formC],
  "complete subselection",
);

const emptyGrammar = memory.ensure(grammar, memory.root);
const emptyTheory = memory.ensure(theory, memory.root);
assertDeepEqual(
  replaySourceSubselection(
    memory,
    byteRefs,
    evidence,
    subselection(1, 1, memory.root, memory.root, emptyGrammar, emptyTheory),
  ),
  [],
  "empty subselection uses root folds",
);

for (const [start, end] of [[-1, 1], [2, 1], [0, 4]] as const) {
  expectSourceError(
    () => replaySourceSubselection(
      memory,
      byteRefs,
      evidence,
      subselection(start, end, middleSelection, middleForms, middleGrammar, middleTheory),
    ),
    "invalid-subselection",
  );
}

expectSourceError(
  () => replaySourceSubselection(
    memory,
    byteRefs,
    evidence,
    subselection(1, 2, evidence.selectionSequence, middleForms, middleGrammar, middleTheory),
  ),
  "invalid-source-evidence",
);
expectSourceError(
  () => replaySourceSubselection(
    memory,
    byteRefs,
    evidence,
    subselection(1, 2, middleSelection, evidence.formSequence, middleGrammar, middleTheory),
  ),
  "invalid-source-evidence",
);

const forgedMembership = memory.ensure(grammar, unrelated);
expectSourceError(
  () => replaySourceSubselection(
    memory,
    byteRefs,
    evidence,
    subselection(1, 2, middleSelection, middleForms, forgedMembership, middleTheory),
  ),
  "invalid-admission-evidence",
);
expectSourceError(
  () => replaySourceSubselection(
    memory,
    byteRefs,
    evidence,
    subselection(1, 2, middleSelection, middleForms, middleGrammar, forgedMembership),
  ),
  "invalid-admission-evidence",
);
