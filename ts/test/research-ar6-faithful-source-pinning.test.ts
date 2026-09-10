import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  replaySelectedSourceEvidence,
  type SourceFrontEndEvidence,
} from "../src/source.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  deserializeStream,
  symbolicStackAlgebra,
} from "../src/anum.js";
import {
  Memory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`AR6 F04 source pinning: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

class SourcePinningError extends Error {
  override readonly name = "SourcePinningError";
}

interface AuthorityWithoutSource {
  readonly dictionary: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly supportRevision: LinkHandle;
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

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function defineSupportRevision(
  memory: Memory,
  admissions: readonly LinkHandle[],
): LinkHandle {
  return memory.ensureStartSelfClosed(materializeExactSequence(memory, admissions));
}

function requireSupport(
  memory: ReadMemory,
  revision: LinkHandle,
  admission: LinkHandle,
): void {
  const wrapper = memory.poles(revision);
  if (wrapper.start !== revision || wrapper.end === revision) {
    throw new SourcePinningError("invalid support revision");
  }
  if (!readExactSequence(memory, wrapper.end).values.includes(admission)) {
    throw new SourcePinningError("admission outside fixed support");
  }
}

function verifyWithoutSourcePin(
  memory: ReadMemory,
  evidence: SourceFrontEndEvidence,
  authority: AuthorityWithoutSource,
): readonly LinkHandle[] {
  const before = memory.linkCount;
  if (
    evidence.dictionary !== authority.dictionary ||
    evidence.grammar !== authority.grammar ||
    evidence.theory !== authority.theory
  ) {
    throw new SourcePinningError("D/G/T mismatch");
  }
  const forms = replaySelectedSourceEvidence(memory, evidence);
  requireSupport(memory, authority.supportRevision, evidence.grammarMembership);
  requireSupport(memory, authority.supportRevision, evidence.theoryMembership);
  if (memory.linkCount !== before) throw new SourcePinningError("replay wrote");
  return forms;
}

function expectRejected(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch {
    return;
  }
  throw new Error(`AR6 F04 source pinning: ${message}: expected rejection`);
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("F04 replay forbids find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("F04 replay forbids outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("F04 replay forbids incoming"); }
}

const memory = new Memory();
const [entry, grammar, theory] = anchors(memory, 3);
assert(entry !== undefined && grammar !== undefined && theory !== undefined, "fixture anchors");

const sourceAText = "[]1";
const sourceBText = "[1]";
const sourceABytes = bytes(sourceAText);
const sourceBBytes = bytes(sourceBText);
assert(
  sourceABytes.some((value, index) => value !== sourceBBytes[index]),
  "faithful source bytes must differ",
);
same(
  deserializeStream(sourceAText, symbolicStackAlgebra).denotation,
  deserializeStream(sourceBText, symbolicStackAlgebra).denotation,
  "chosen sources must collide after lossy Q denotation",
);

// One fixed dictionary revision intentionally admits both faithful lexemes to
// the same Entry. Therefore D/G/T and downstream form sequence cannot rescue a
// verifier that forgot which source occurrence was independently selected.
let dictionary = defineDictionaryScope(memory, memory.root, memory.root);
const effectA = defineDictionaryEffect(
  memory,
  dictionary,
  memory.root,
  memory.root,
  materializeSourceContent(memory, sourceABytes),
  entry,
);
dictionary = effectA.afterScope;
const effectB = defineDictionaryEffect(
  memory,
  dictionary,
  memory.root,
  effectA.historyAfter,
  materializeSourceContent(memory, sourceBBytes),
  entry,
);
dictionary = effectB.afterScope;

const sourceA = defineSourceForm(memory, materializeSourceContent(memory, sourceABytes));
const sourceB = defineSourceForm(memory, materializeSourceContent(memory, sourceBBytes));
assert(sourceA !== sourceB, "distinct faithful source forms must have distinct Link identity");

const evidenceA = buildSelectedSourceEvidence(
  memory,
  sourceA,
  [{ start: 0, end: sourceABytes.length, form: entry, dictionaryOccurrence: effectA.occurrence }],
  { dictionary, grammar, theory },
);
const evidenceB = buildSelectedSourceEvidence(
  memory,
  sourceB,
  [{ start: 0, end: sourceBBytes.length, form: entry, dictionaryOccurrence: effectB.occurrence }],
  { dictionary, grammar, theory },
);

same(evidenceA.formSequence, evidenceB.formSequence, "same Entry must give same form sequence");
same(evidenceA.grammarMembership, evidenceB.grammarMembership, "same G/form sequence membership");
same(evidenceA.theoryMembership, evidenceB.theoryMembership, "same T/form sequence membership");

const supportRevision = defineSupportRevision(memory, [
  evidenceA.grammarMembership,
  evidenceA.theoryMembership,
]);
const authority: AuthorityWithoutSource = Object.freeze({
  dictionary,
  grammar,
  theory,
  supportRevision,
});

same(verifyWithoutSourcePin(memory, evidenceA, authority)[0], entry, "selected source A");

// TDD RED / F04: source B is internally faithful and has the same lossy Q
// denotation, Entry, G/T memberships and fixed support. It must still be rejected
// when source A was the independently selected source. The current authority
// shape has no source coordinate, so this expectation should fail.
expectRejected(
  () => verifyWithoutSourcePin(memory, evidenceB, authority),
  "different faithful source with same lossy denotation must not replace selected source A",
);

// Keep pole-only compatibility visible even in RED: the gap is missing source
// authority, not a need for ambient discovery.
same(
  verifyWithoutSourcePin(new PoleOnlyProbe(memory), evidenceA, authority)[0],
  entry,
  "pole-only selected source A",
);

console.log("MTS AR6 F04: expected RED while fixed authority omits selected source root.");
