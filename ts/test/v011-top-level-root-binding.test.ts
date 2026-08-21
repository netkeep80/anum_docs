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
  type RootBasis,
} from "../src/memory.js";
import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  readSourceContent,
  type SelectedSegmentSpec,
  type SourceFrontEndEvidence,
} from "../src/source.js";
import { defineContext, readContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
} from "../src/structural-rule.js";

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

function roleList(value: TopLevelContextualReadingRoles): readonly LinkHandle[] {
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

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly dotRole: LinkHandle;
  readonly otherRole: LinkHandle;
  readonly A: LinkHandle;
  readonly otherParent: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly vocabulary: TopLevelContextualReadingRoles;
  readonly topContext: LinkHandle;
  readonly dotContent: LinkHandle;
  readonly admittedDot: DictionaryFixture;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const pool = anchors(memory, 10);
  const dotRole = pool[0];
  const otherRole = pool[1];
  const A = pool[2];
  const otherParent = pool[3];
  const grammar = pool[4];
  const theory = pool[5];
  assert(dotRole && otherRole && A && otherParent && grammar && theory, "fixture anchors");

  const dotMeaning = memory.ensure(basis.L, basis.R);
  assert(dotRole !== dotMeaning, "Role_ctx must remain distinct from DotMeaning=L⟼R");
  assert(![basis.O, basis.C, basis.L, basis.U].includes(dotRole), "Role_ctx must not enter Q=[ ]10");

  const dotContent = materializeSourceContent(memory, new Uint8Array([0x2e]));
  const admittedDot = oneEntryDictionary(memory, dotContent, dotRole);
  const vocabulary = roles(memory);
  const topContext = defineContext(memory, memory.root, memory.root);
  same(topContext, basis.O, "K0 must remain O=START(R), not R");
  assert(topContext !== memory.root, "zero whole A0=R must differ from execution frame K0=O");
  const top = readContext(memory, topContext);
  same(top.parent, memory.root, "K0 parent must be R");
  same(top.current, memory.root, "K0 current whole must be R");

  return Object.freeze({
    memory,
    basis,
    dotRole,
    otherRole,
    A,
    otherParent,
    grammar,
    theory,
    vocabulary,
    topContext,
    dotContent,
    admittedDot,
  });
}

interface ActOptions {
  readonly sourceEvidence: SourceFrontEndEvidence;
  readonly beforeContext: LinkHandle;
  readonly contextualRole: LinkHandle;
  readonly result: LinkHandle;
  readonly afterContext: LinkHandle;
  readonly omitContextualRole?: boolean;
  readonly extraContextualRole?: LinkHandle;
}

function act(f: Fixture, options: ActOptions): TopLevelContextualReadingEvidence {
  const { memory, vocabulary } = f;
  const interpreter = defineStructuralInterpreter(
    memory,
    options.sourceEvidence.dictionary,
    options.sourceEvidence.grammar,
    options.sourceEvidence.theory,
  );
  const roleDictionary = defineStructuralRoleDictionary(memory, roleList(vocabulary));
  const value = defineActHeader(memory, interpreter, roleDictionary, options.afterContext);
  const fields: readonly [LinkHandle, LinkHandle][] = [
    [vocabulary.source, options.sourceEvidence.source],
    [vocabulary.sourceSelection, options.sourceEvidence.selectionSequence],
    [vocabulary.formSequence, options.sourceEvidence.formSequence],
    [vocabulary.dictionary, options.sourceEvidence.dictionary],
    [vocabulary.grammar, options.sourceEvidence.grammar],
    [vocabulary.theory, options.sourceEvidence.theory],
    [vocabulary.beforeContext, options.beforeContext],
    [vocabulary.result, options.result],
    [vocabulary.afterContext, options.afterContext],
  ];
  for (const [role, fieldValue] of fields) defineActField(memory, value, role, fieldValue);
  if (!options.omitContextualRole) {
    defineActField(memory, value, vocabulary.contextualRole, options.contextualRole);
  }
  if (options.extraContextualRole !== undefined) {
    defineActField(memory, value, vocabulary.contextualRole, options.extraContextualRole);
  }
  return Object.freeze({
    sourceEvidence: options.sourceEvidence,
    act: value,
    roles: vocabulary,
    interpreter,
    roleDictionary,
  });
}

// One semantic Act per isolated fixture: repeated host construction with an
// identical header is not a new event (#732), so independent cases must not
// accumulate fields onto one canonical Act.
{
  const f = fixture();
  const single = sourceEvidence(
    f.memory,
    new Uint8Array([0x2e]),
    f.dotRole,
    f.admittedDot,
    f.grammar,
    f.theory,
  );
  const evidence = act(f, {
    sourceEvidence: single,
    beforeContext: f.topContext,
    contextualRole: f.dotRole,
    result: f.memory.root,
    afterContext: f.topContext,
  });

  // An unrelated context may exist, but it is not semantic authority. Probe
  // also rejects find()/incoming(), so only the Act-named K can bind Role_ctx.
  defineContext(f.memory, f.memory.root, f.A);
  const before = f.memory.linkCount;
  same(
    replayTopLevelContextualReading(new Probe(f.memory), evidence),
    f.memory.root,
    "v011-production-top-level-dot-resolves-root",
  );
  same(f.memory.linkCount, before, "single-dot production replay must be read-only");
  // Replaying the same immutable Act is stable and must remain read-only.
  same(replayTopLevelContextualReading(new Probe(f.memory), evidence), f.memory.root, "repeated replay is stable");
  same(f.memory.linkCount, before, "repeated replay must not materialize");
  deepSame(
    Array.from(readSourceContent(new Probe(f.memory), f.basis, single.content).bytes),
    [0x2e],
    "single physical source remains exact dot byte",
  );
}

{
  const f = fixture();
  const dotDot = sourceEvidence(
    f.memory,
    new Uint8Array([0x2e, 0x2e]),
    f.dotRole,
    f.admittedDot,
    f.grammar,
    f.theory,
  );
  const evidence = act(f, {
    sourceEvidence: dotDot,
    beforeContext: f.topContext,
    contextualRole: f.dotRole,
    result: f.memory.root,
    afterContext: f.topContext,
  });
  const before = f.memory.linkCount;
  same(
    replayTopLevelContextualReading(new Probe(f.memory), evidence),
    f.memory.root,
    "v011-production-top-level-dot-dot-folds-root",
  );
  same(f.memory.linkCount, before, "two-dot production replay must be read-only");
  deepSame(
    Array.from(readSourceContent(new Probe(f.memory), f.basis, dotDot.content).bytes),
    [0x2e, 0x2e],
    "v011-production-no-hidden-root-prefix",
  );
  deepSame(
    readExactSequence(new Probe(f.memory), dotDot.formSequence).values,
    [f.dotRole, f.dotRole],
    "v011-production-top-level-dot-dot-preserves-two-source-occurrences",
  );
  same(dotDot.segments[0]?.start, 0, "first dot start");
  same(dotDot.segments[0]?.end, 1, "first dot end");
  same(dotDot.segments[1]?.start, 1, "second dot start");
  same(dotDot.segments[1]?.end, 2, "second dot end");
  assert(dotDot.segments[0]?.span !== dotDot.segments[1]?.span, "equal dots must retain distinct spans");
}

{
  const f = fixture();
  const single = sourceEvidence(f.memory, new Uint8Array([0x2e]), f.dotRole, f.admittedDot, f.grammar, f.theory);
  const nonRoot = defineContext(f.memory, f.memory.root, f.A);
  reject("non-root K must not be accepted as TopBind(R,S)", () =>
    replayTopLevelContextualReading(new Probe(f.memory), act(f, {
      sourceEvidence: single,
      beforeContext: nonRoot,
      contextualRole: f.dotRole,
      result: f.A,
      afterContext: nonRoot,
    }))
  );
}

{
  const f = fixture();
  const single = sourceEvidence(f.memory, new Uint8Array([0x2e]), f.dotRole, f.admittedDot, f.grammar, f.theory);
  const forgedAfter = defineContext(f.memory, f.memory.root, f.A);
  reject("forged semantic result must fail", () =>
    replayTopLevelContextualReading(new Probe(f.memory), act(f, {
      sourceEvidence: single,
      beforeContext: f.topContext,
      contextualRole: f.dotRole,
      result: f.A,
      afterContext: forgedAfter,
    }))
  );
}

{
  const f = fixture();
  const single = sourceEvidence(f.memory, new Uint8Array([0x2e]), f.dotRole, f.admittedDot, f.grammar, f.theory);
  const driftAfter = defineContext(f.memory, f.otherParent, f.memory.root);
  reject("after-context parent drift must fail", () =>
    replayTopLevelContextualReading(new Probe(f.memory), act(f, {
      sourceEvidence: single,
      beforeContext: f.topContext,
      contextualRole: f.dotRole,
      result: f.memory.root,
      afterContext: driftAfter,
    }))
  );
}

{
  const f = fixture();
  const admittedOther = oneEntryDictionary(f.memory, f.dotContent, f.otherRole);
  const alternative = sourceEvidence(
    f.memory,
    new Uint8Array([0x2e]),
    f.otherRole,
    admittedOther,
    f.grammar,
    f.theory,
  );
  reject("different source admission must not be reinterpreted as dot", () =>
    replayTopLevelContextualReading(new Probe(f.memory), act(f, {
      sourceEvidence: alternative,
      beforeContext: f.topContext,
      contextualRole: f.dotRole,
      result: f.memory.root,
      afterContext: f.topContext,
    }))
  );
}

{
  const f = fixture();
  const single = sourceEvidence(f.memory, new Uint8Array([0x2e]), f.dotRole, f.admittedDot, f.grammar, f.theory);
  reject("missing contextual-role Act evidence must fail", () =>
    replayTopLevelContextualReading(new Probe(f.memory), act(f, {
      sourceEvidence: single,
      beforeContext: f.topContext,
      contextualRole: f.dotRole,
      result: f.memory.root,
      afterContext: f.topContext,
      omitContextualRole: true,
    }))
  );
}

{
  const f = fixture();
  const single = sourceEvidence(f.memory, new Uint8Array([0x2e]), f.dotRole, f.admittedDot, f.grammar, f.theory);
  reject("multiple contextual-role Act evidence must fail", () =>
    replayTopLevelContextualReading(new Probe(f.memory), act(f, {
      sourceEvidence: single,
      beforeContext: f.topContext,
      contextualRole: f.dotRole,
      result: f.memory.root,
      afterContext: f.topContext,
      extraContextualRole: f.otherRole,
    }))
  );
}
