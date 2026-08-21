import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import { readExactSequence } from "../src/exact-sequence.js";
import {
  InterpreterReplayError,
  replayTopLevelContextualReading,
  type TopLevelContextualReadingEvidence,
  type TopLevelContextualReadingRoles,
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
  readSourceContent,
  type SelectedSegmentSpec,
  type SourceFrontEndEvidence,
} from "../src/source.js";
import { defineContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.11 top-level ROOT binding: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function deepSame(actual: unknown, expected: unknown, message: string): void {
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
  throw new Error(`v0.11 top-level ROOT binding: ${message}: expected rejection`);
}

class Probe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("C3 replay must not use find/ambient lookup"); }
  outgoing(start: LinkHandle): readonly LinkHandle[] { return this.source.outgoing(start); }
  incoming(): readonly LinkHandle[] { throw new Error("C3 replay must not scan incoming"); }
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

function sourceEvidence(
  memory: Memory,
  bytes: Uint8Array,
  form: LinkHandle,
  dictionary: DictionaryFixture,
  grammar: LinkHandle,
  theory: LinkHandle,
): SourceFrontEndEvidence {
  const content = materializeSourceContent(memory, bytes);
  const source = defineSourceForm(memory, content);
  const specs: SelectedSegmentSpec[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    specs.push(Object.freeze({
      start: index,
      end: index + 1,
      form,
      dictionaryOccurrence: dictionary.occurrence,
    }));
  }
  return buildSelectedSourceEvidence(
    memory,
    source,
    specs,
    { dictionary: dictionary.dictionary, grammar, theory },
  );
}

function roles(memory: Memory): TopLevelContextualReadingRoles {
  // Keep the Act field vocabulary disjoint from fixture semantic values so a
  // canonical Link cannot accidentally play both host-schema and value roles.
  const r = anchors(memory, 20).slice(10);
  assert(r.length === 10, "role vocabulary");
  return Object.freeze({
    source: r[0]!,
    sourceSelection: r[1]!,
    formSequence: r[2]!,
    dictionary: r[3]!,
    grammar: r[4]!,
    theory: r[5]!,
    beforeContext: r[6]!,
    contextualRole: r[7]!,
    result: r[8]!,
    afterContext: r[9]!,
  });
}

interface ActOptions {
  readonly sourceEvidence: SourceFrontEndEvidence;
  readonly roles: TopLevelContextualReadingRoles;
  readonly interpreter: LinkHandle;
  readonly roleDictionary: LinkHandle;
  readonly beforeContext: LinkHandle;
  readonly contextualRole: LinkHandle;
  readonly result: LinkHandle;
  readonly afterContext: LinkHandle;
  readonly omitContextualRole?: boolean;
  readonly extraContextualRole?: LinkHandle;
}

function act(memory: Memory, options: ActOptions): TopLevelContextualReadingEvidence {
  const value = defineActHeader(
    memory,
    options.interpreter,
    options.roleDictionary,
    options.afterContext,
  );
  const fields: readonly [LinkHandle, LinkHandle][] = [
    [options.roles.source, options.sourceEvidence.source],
    [options.roles.sourceSelection, options.sourceEvidence.selectionSequence],
    [options.roles.formSequence, options.sourceEvidence.formSequence],
    [options.roles.dictionary, options.sourceEvidence.dictionary],
    [options.roles.grammar, options.sourceEvidence.grammar],
    [options.roles.theory, options.sourceEvidence.theory],
    [options.roles.beforeContext, options.beforeContext],
    [options.roles.result, options.result],
    [options.roles.afterContext, options.afterContext],
  ];
  for (const [role, fieldValue] of fields) defineActField(memory, value, role, fieldValue);
  if (!options.omitContextualRole) {
    defineActField(memory, value, options.roles.contextualRole, options.contextualRole);
  }
  if (options.extraContextualRole !== undefined) {
    defineActField(memory, value, options.roles.contextualRole, options.extraContextualRole);
  }
  return Object.freeze({
    sourceEvidence: options.sourceEvidence,
    act: value,
    roles: options.roles,
    interpreter: options.interpreter,
    roleDictionary: options.roleDictionary,
  });
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const pool = anchors(memory, 10);
const dotRole = pool[0];
const otherRole = pool[1];
const A = pool[2];
const otherParent = pool[3];
const grammar = pool[4];
const theory = pool[5];
const interpreter = pool[6];
const roleDictionary = pool[7];
assert(
  dotRole && otherRole && A && otherParent && grammar && theory && interpreter && roleDictionary,
  "fixture anchors",
);

const dotMeaning = memory.ensure(basis.L, basis.R);
assert(dotRole !== dotMeaning, "Role_ctx must remain distinct from DotMeaning=L⟼R");
assert(![basis.O, basis.C, basis.L, basis.U].includes(dotRole), "Role_ctx must not enter Q=[ ]10");

const dotContent = materializeSourceContent(memory, new Uint8Array([0x2e]));
const admittedDot = oneEntryDictionary(memory, dotContent, dotRole);
const vocabulary = roles(memory);
const topContext = defineContext(memory, memory.root, memory.root);
same(topContext, basis.O, "K0 must remain O=START(R), not R");
assert(topContext !== memory.root, "zero whole A0=R must differ from execution frame K0=O");

// Production single-dot path: source admission supplies Role_ctx; the explicit
// top-level K supplies its value R. No hidden ROOT source byte is introduced.
const single = sourceEvidence(
  memory,
  new Uint8Array([0x2e]),
  dotRole,
  admittedDot,
  grammar,
  theory,
);
const singleEvidence = act(memory, {
  sourceEvidence: single,
  roles: vocabulary,
  interpreter,
  roleDictionary,
  beforeContext: topContext,
  contextualRole: dotRole,
  result: memory.root,
  afterContext: topContext,
});
const beforeSingle = memory.linkCount;
same(
  replayTopLevelContextualReading(new Probe(memory), singleEvidence),
  memory.root,
  "v011-production-top-level-dot-resolves-root",
);
same(memory.linkCount, beforeSingle, "single-dot production replay must be read-only");
deepSame(
  Array.from(readSourceContent(new Probe(memory), basis, single.content).bytes),
  [0x2e],
  "single physical source remains exact dot byte",
);

// Two equal physical bytes remain two source/form positions before the semantic
// fixed point Pair(R,R)=R collapses only the final Link value.
const dotDot = sourceEvidence(
  memory,
  new Uint8Array([0x2e, 0x2e]),
  dotRole,
  admittedDot,
  grammar,
  theory,
);
const dotDotEvidence = act(memory, {
  sourceEvidence: dotDot,
  roles: vocabulary,
  interpreter,
  roleDictionary,
  beforeContext: topContext,
  contextualRole: dotRole,
  result: memory.root,
  afterContext: topContext,
});
const beforeDotDot = memory.linkCount;
same(
  replayTopLevelContextualReading(new Probe(memory), dotDotEvidence),
  memory.root,
  "v011-production-top-level-dot-dot-folds-root",
);
same(memory.linkCount, beforeDotDot, "two-dot production replay must be read-only");
deepSame(
  Array.from(readSourceContent(new Probe(memory), basis, dotDot.content).bytes),
  [0x2e, 0x2e],
  "v011-production-no-hidden-root-prefix",
);
deepSame(
  readExactSequence(new Probe(memory), dotDot.formSequence).values,
  [dotRole, dotRole],
  "v011-production-top-level-dot-dot-preserves-two-source-occurrences",
);
same(dotDot.segments[0]?.start, 0, "first dot start");
same(dotDot.segments[0]?.end, 1, "first dot end");
same(dotDot.segments[1]?.start, 1, "second dot start");
same(dotDot.segments[1]?.end, 2, "second dot end");
assert(dotDot.segments[0]?.span !== dotDot.segments[1]?.span, "equal dots must retain distinct spans");

// An unrelated context can exist, but the replay has no ambient-current path:
// Probe rejects find()/incoming() and only the Act-named K is authoritative.
defineContext(memory, memory.root, A);
same(
  replayTopLevelContextualReading(new Probe(memory), dotDotEvidence),
  memory.root,
  "unrelated context must not affect top-level binding",
);

const nonRootContext = defineContext(memory, memory.root, A);
const nonRootAfter = defineContext(memory, memory.root, A);
reject("non-root K must not be accepted as TopBind(R,S)", () =>
  replayTopLevelContextualReading(new Probe(memory), act(memory, {
    sourceEvidence: single,
    roles: vocabulary,
    interpreter,
    roleDictionary,
    beforeContext: nonRootContext,
    contextualRole: dotRole,
    result: A,
    afterContext: nonRootAfter,
  }))
);

const forgedResultAfter = defineContext(memory, memory.root, A);
reject("forged semantic result must fail", () =>
  replayTopLevelContextualReading(new Probe(memory), act(memory, {
    sourceEvidence: single,
    roles: vocabulary,
    interpreter,
    roleDictionary,
    beforeContext: topContext,
    contextualRole: dotRole,
    result: A,
    afterContext: forgedResultAfter,
  }))
);

const driftAfter = defineContext(memory, otherParent, memory.root);
reject("after-context parent drift must fail", () =>
  replayTopLevelContextualReading(new Probe(memory), act(memory, {
    sourceEvidence: single,
    roles: vocabulary,
    interpreter,
    roleDictionary,
    beforeContext: topContext,
    contextualRole: dotRole,
    result: memory.root,
    afterContext: driftAfter,
  }))
);

// The same physical byte admitted to another form is not a dot occurrence merely
// because its carrier is 0x2E. Role_ctx must be present in both source admission
// and the explicit Act field.
const admittedOther = oneEntryDictionary(memory, dotContent, otherRole);
const alternative = sourceEvidence(
  memory,
  new Uint8Array([0x2e]),
  otherRole,
  admittedOther,
  grammar,
  theory,
);
reject("different source admission must not be reinterpreted as dot", () =>
  replayTopLevelContextualReading(new Probe(memory), act(memory, {
    sourceEvidence: alternative,
    roles: vocabulary,
    interpreter,
    roleDictionary,
    beforeContext: topContext,
    contextualRole: dotRole,
    result: memory.root,
    afterContext: topContext,
  }))
);

reject("missing contextual-role Act evidence must fail", () =>
  replayTopLevelContextualReading(new Probe(memory), act(memory, {
    sourceEvidence: single,
    roles: vocabulary,
    interpreter,
    roleDictionary,
    beforeContext: topContext,
    contextualRole: dotRole,
    result: memory.root,
    afterContext: topContext,
    omitContextualRole: true,
  }))
);

reject("multiple contextual-role Act evidence must fail", () =>
  replayTopLevelContextualReading(new Probe(memory), act(memory, {
    sourceEvidence: single,
    roles: vocabulary,
    interpreter,
    roleDictionary,
    beforeContext: topContext,
    contextualRole: dotRole,
    result: memory.root,
    afterContext: topContext,
    extraContextualRole: otherRole,
  }))
);
