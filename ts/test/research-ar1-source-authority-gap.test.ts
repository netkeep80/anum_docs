import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  replaySelectedSourceEvidence,
  type SelectedSegmentSpec,
} from "../src/source.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  type LinkHandle,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`AR1 source authority probe: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
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

interface DictionaryFixture {
  readonly dictionary: LinkHandle;
  readonly occurrences: readonly LinkHandle[];
}

function dictionaryWith(
  memory: Memory,
  mappings: readonly (readonly [Uint8Array, LinkHandle])[],
): DictionaryFixture {
  let history = memory.root;
  let dictionary = defineDictionaryScope(memory, memory.root, history);
  const occurrences: LinkHandle[] = [];

  for (const [bytes, form] of mappings) {
    const effect = defineDictionaryEffect(
      memory,
      dictionary,
      memory.root,
      history,
      materializeSourceContent(memory, bytes),
      form,
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
  form: LinkHandle,
  dictionaryOccurrence: LinkHandle,
): SelectedSegmentSpec {
  return Object.freeze({ start, end, form, dictionaryOccurrence });
}

const memory = new Memory();
const pool = anchors(memory, 16);
let cursor = 0;
function next(label: string): LinkHandle {
  const value = pool[cursor++];
  assert(value !== undefined, `missing fixture ${label}`);
  return value;
}

// A1 — exact physical source and dictionary occurrence replay are real and
// useful, but the replay currently receives D/G/T from the evidence itself.
const goodForm = next("good-form");
const attackerForm = next("attacker-form");
const goodGrammar = next("good-grammar");
const attackerGrammar = next("attacker-grammar");
const goodTheory = next("good-theory");
const attackerTheory = next("attacker-theory");
const x = new Uint8Array([0x78]);
const sourceX = defineSourceForm(memory, materializeSourceContent(memory, x));
const goodDictionary = dictionaryWith(memory, [[x, goodForm]]);
const attackerDictionary = dictionaryWith(memory, [[x, attackerForm]]);

const goodEvidence = buildSelectedSourceEvidence(
  memory,
  sourceX,
  [segment(0, 1, goodForm, goodDictionary.occurrences[0]!)],
  {
    dictionary: goodDictionary.dictionary,
    grammar: goodGrammar,
    theory: goodTheory,
  },
);
const attackerEvidence = buildSelectedSourceEvidence(
  memory,
  sourceX,
  [segment(0, 1, attackerForm, attackerDictionary.occurrences[0]!)],
  {
    dictionary: attackerDictionary.dictionary,
    grammar: attackerGrammar,
    theory: attackerTheory,
  },
);

same(replaySelectedSourceEvidence(memory, goodEvidence)[0], goodForm, "selected good D/G/T replay");

// Current behavior under falsification: structurally valid attacker-selected
// D/G/T also replays successfully because no independent expected authority is
// supplied to replaySelectedSourceEvidence.
const attackerResult = replaySelectedSourceEvidence(memory, attackerEvidence);
same(attackerResult[0], attackerForm, "attacker-selected D/G/T currently self-authenticates");
assert(attackerEvidence.dictionary !== goodEvidence.dictionary, "A1 dictionary substitution is real");
assert(attackerEvidence.grammar !== goodEvidence.grammar, "A1 grammar substitution is real");
assert(attackerEvidence.theory !== goodEvidence.theory, "A1 theory substitution is real");

// A2 — even pinning bare grammar/theory Link handles would not yet be enough.
// The source builder itself materializes G⟼formSequence and T⟼formSequence,
// so an alternative host-selected segmentation can add its own admission to
// the same mutable G/T without changing those handles.
const formA = next("form-a");
const formB = next("form-b");
const formAB = next("form-ab");
const grammar = next("shared-grammar");
const theory = next("shared-theory");
const a = new Uint8Array([0x61]);
const b = new Uint8Array([0x62]);
const ab = new Uint8Array([0x61, 0x62]);
const sourceAB = defineSourceForm(memory, materializeSourceContent(memory, ab));
const dictionary = dictionaryWith(memory, [
  [a, formA],
  [b, formB],
  [ab, formAB],
]);

const splitSequence = materializeExactSequence(memory, [formA, formB]);
const wholeSequence = materializeExactSequence(memory, [formAB]);
same(memory.find(grammar, splitSequence), undefined, "A2 split is not admitted before source builder");
same(memory.find(grammar, wholeSequence), undefined, "A2 whole is not admitted before source builder");
same(memory.find(theory, splitSequence), undefined, "A2 split is not theory-admitted before source builder");
same(memory.find(theory, wholeSequence), undefined, "A2 whole is not theory-admitted before source builder");

const splitEvidence = buildSelectedSourceEvidence(
  memory,
  sourceAB,
  [
    segment(0, 1, formA, dictionary.occurrences[0]!),
    segment(1, 2, formB, dictionary.occurrences[1]!),
  ],
  { dictionary: dictionary.dictionary, grammar, theory },
);
same(splitEvidence.formSequence, splitSequence, "A2 split uses precomputed exact form sequence");
assert(memory.find(grammar, splitSequence) !== undefined, "A2 builder self-admitted split in grammar");
assert(memory.find(theory, splitSequence) !== undefined, "A2 builder self-admitted split in theory");
same(memory.find(grammar, wholeSequence), undefined, "A2 whole remains unadmitted before attacker build");
same(memory.find(theory, wholeSequence), undefined, "A2 whole remains theory-unadmitted before attacker build");

const wholeEvidence = buildSelectedSourceEvidence(
  memory,
  sourceAB,
  [segment(0, 2, formAB, dictionary.occurrences[2]!)],
  { dictionary: dictionary.dictionary, grammar, theory },
);
same(wholeEvidence.formSequence, wholeSequence, "A2 whole uses precomputed exact form sequence");
assert(memory.find(grammar, wholeSequence) !== undefined, "A2 attacker build self-admitted whole in same grammar");
assert(memory.find(theory, wholeSequence) !== undefined, "A2 attacker build self-admitted whole in same theory");

const splitResult = replaySelectedSourceEvidence(memory, splitEvidence);
const wholeResult = replaySelectedSourceEvidence(memory, wholeEvidence);
same(splitResult.length, 2, "A2 split segmentation replays");
same(splitResult[0], formA, "A2 split first form");
same(splitResult[1], formB, "A2 split second form");
same(wholeResult.length, 1, "A2 whole segmentation also replays after self-admission");
same(wholeResult[0], formAB, "A2 whole form");

const classification = Object.freeze({
  faithfulBytesAndSpansAlreadyPresent: true,
  visibleDictionaryOccurrenceAlreadyVerified: true,
  replayUsesIndependentlySelectedDGT: false,
  builderMayCreateGrammarAdmission: true,
  builderMayCreateTheoryAdmission: true,
  bareDGTHandlePinWouldPreventSelfAdmission: false,
  verdict: "RED" as const,
  reason: "SOURCE_SELECTION_AUTHORITY_CAN_BE_SELF_ADMITTED" as const,
});

same(classification.verdict, "RED", "AR1 authority classification");
same(
  classification.reason,
  "SOURCE_SELECTION_AUTHORITY_CAN_BE_SELF_ADMITTED",
  "AR1 authority RED reason",
);

console.log("MTS AR1 source authority: RED self-admission gap confirmed.");
