import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import { readExactSequence } from "../src/exact-sequence.js";
import {
  InterpreterReplayError,
  replayContextualReading,
  replayTopLevelContextualReading,
  type ContextualReadingEvidence,
  type ContextualReadingRoles,
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
  replaySelectedSourceEvidence,
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
  if (!condition) throw new Error(`v0.11 nested explicit binding: ${message}`);
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
  throw new Error(`v0.11 nested explicit binding: ${message}: expected rejection`);
}

class Probe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined {
    throw new Error("C4 contextual replay must not use find/ambient lookup");
  }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    return this.source.outgoing(start);
  }
  incoming(): readonly LinkHandle[] {
    throw new Error("C4 contextual replay must not scan incoming");
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

function sourceEvidence(
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

function roles(memory: Memory): ContextualReadingRoles {
  const values = anchors(memory, 20).slice(10);
  assert(values.length === 10, "role vocabulary");
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

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly dotRole: LinkHandle;
  readonly A: LinkHandle;
  readonly B: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly sourceEvidence: SourceFrontEndEvidence;
  readonly vocabulary: ContextualReadingRoles;
  readonly outerContext: LinkHandle;
  readonly innerContext: LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const pool = anchors(memory, 10);
  const dotRole = pool[0];
  const A = pool[1];
  const B = pool[2];
  const grammar = pool[3];
  const theory = pool[4];
  assert(dotRole && A && B && grammar && theory, "fixture anchors");
  assert(A !== B, "outer and inner contextual wholes must differ");

  const dotMeaning = memory.ensure(basis.L, basis.R);
  assert(dotRole !== dotMeaning, "Role_ctx must remain distinct from DotMeaning=L⟼R");
  assert(
    ![basis.O, basis.C, basis.L, basis.U].includes(dotRole),
    "Role_ctx must remain outside Q=[ ]10",
  );

  const dotContent = materializeSourceContent(memory, new Uint8Array([0x2e]));
  const dictionary = oneEntryDictionary(memory, dotContent, dotRole);
  const admittedSource = sourceEvidence(memory, dotRole, dictionary, grammar, theory);
  const vocabulary = roles(memory);

  const outerContext = defineContext(memory, memory.root, A);
  const innerContext = defineContext(memory, outerContext, B);
  const outer = readContext(memory, outerContext);
  const inner = readContext(memory, innerContext);
  same(outer.parent, memory.root, "outer K parent");
  same(outer.current, A, "outer K current");
  same(inner.parent, outerContext, "v011-production-inner-parent-is-explicit-outer-K");
  same(inner.current, B, "inner K current");
  same(readContext(memory, outerContext).current, A, "v011-production-outer-current-remains-unchanged");

  return Object.freeze({
    memory,
    basis,
    dotRole,
    A,
    B,
    grammar,
    theory,
    sourceEvidence: admittedSource,
    vocabulary,
    outerContext,
    innerContext,
  });
}

function act(
  f: Fixture,
  beforeContext: LinkHandle,
  result: LinkHandle,
  afterContext: LinkHandle,
): ContextualReadingEvidence {
  const { memory, vocabulary, sourceEvidence: source } = f;
  const interpreter = defineStructuralInterpreter(
    memory,
    source.dictionary,
    source.grammar,
    source.theory,
  );
  const roleDictionary = defineStructuralRoleDictionary(memory, roleList(vocabulary));
  const value = defineActHeader(memory, interpreter, roleDictionary, afterContext);
  const fields: readonly [LinkHandle, LinkHandle][] = [
    [vocabulary.source, source.source],
    [vocabulary.sourceSelection, source.selectionSequence],
    [vocabulary.formSequence, source.formSequence],
    [vocabulary.dictionary, source.dictionary],
    [vocabulary.grammar, source.grammar],
    [vocabulary.theory, source.theory],
    [vocabulary.beforeContext, beforeContext],
    [vocabulary.contextualRole, f.dotRole],
    [vocabulary.result, result],
    [vocabulary.afterContext, afterContext],
  ];
  for (const [role, fieldValue] of fields) {
    defineActField(memory, value, role, fieldValue);
  }
  return Object.freeze({
    sourceEvidence: source,
    act: value,
    roles: vocabulary,
    interpreter,
    roleDictionary,
  });
}

{
  const f = fixture();
  const probe = new Probe(f.memory);

  deepSame(
    replaySelectedSourceEvidence(probe, f.sourceEvidence),
    [f.dotRole],
    "v011-production-nested-source-admission-remains-explicit",
  );
  deepSame(
    readExactSequence(probe, f.sourceEvidence.formSequence).values,
    [f.dotRole],
    "physical dot keeps one explicit Role_ctx occurrence",
  );
  deepSame(
    Array.from(readSourceContent(probe, f.basis, f.sourceEvidence.content).bytes),
    [0x2e],
    "physical source remains exact dot byte",
  );

  const innerEvidence = act(f, f.innerContext, f.B, f.innerContext);
  const before = f.memory.linkCount;
  same(
    replayContextualReading(probe, innerEvidence),
    f.B,
    "v011-production-nested-dot-uses-inner-explicit-current",
  );
  same(f.memory.linkCount, before, "v011-production-nested-replay-is-read-only");
  same(readContext(probe, f.outerContext).current, f.A, "outer current remains A after inner replay");

  // The v0.11 automatic ROOT binder is a strict wrapper over the same kernel.
  // It must not reinterpret a nested explicit A:E context as TopBind(R,S).
  reject("v011-production-top-level-resolver-rejects-inner-K", () =>
    replayTopLevelContextualReading(probe, innerEvidence)
  );
  same(f.memory.linkCount, before, "top-level rejection must remain read-only");
}

{
  const f = fixture();
  const probe = new Probe(f.memory);
  const outerEvidence = act(f, f.outerContext, f.A, f.outerContext);
  const before = f.memory.linkCount;
  same(
    replayContextualReading(probe, outerEvidence),
    f.A,
    "v011-production-outer-dot-still-uses-outer-explicit-current",
  );
  same(f.memory.linkCount, before, "outer replay is read-only");

  // An Act naming the outer K cannot claim the inner whole B: there is no
  // ambient nearest/current lookup that can silently replace the named K.
  const forgedAfter = defineContext(f.memory, f.memory.root, f.B);
  const wrongAuthority = act(f, f.outerContext, f.B, forgedAfter);
  const afterConstruction = f.memory.linkCount;
  reject("outer K cannot claim inner current", () =>
    replayContextualReading(new Probe(f.memory), wrongAuthority)
  );
  same(f.memory.linkCount, afterConstruction, "wrong-authority rejection is read-only");
}
