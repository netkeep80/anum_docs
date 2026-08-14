import {
  InterpreterReplayError,
  replayColonEffect,
  type ColonReplayEvidence,
  type ColonRoles,
} from "../src/interpreter.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import { defineSourceForm } from "../src/source.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import { Memory, type LinkHandle, type LinkPoles, type ReadMemory } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function reject(effect: () => unknown): void {
  try { effect(); }
  catch (error) {
    assert(error instanceof InterpreterReplayError, `expected InterpreterReplayError, got ${String(error)}`);
    same(error.code, "invalid-colon-evidence", "colon error code");
    return;
  }
  throw new Error("expected invalid-colon-evidence");
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

interface Fields {
  readonly source: LinkHandle;
  readonly sourceContent: LinkHandle;
  readonly form: LinkHandle;
  readonly beforeDictionary: LinkHandle;
  readonly entry: LinkHandle;
  readonly definitionOccurrence: LinkHandle;
  readonly historyBefore: LinkHandle;
  readonly historyAfter: LinkHandle;
  readonly afterDictionary: LinkHandle;
  readonly context: LinkHandle;
}
interface Fixture {
  readonly memory: Memory;
  readonly roles: ColonRoles;
  readonly interpreter: LinkHandle;
  readonly roleDictionary: LinkHandle;
  readonly fields: Fields;
  readonly other: LinkHandle;
  makeEvidence(overrides?: Partial<Fields>, headerContext?: LinkHandle): ColonReplayEvidence;
}

function fixture(): Fixture {
  const memory = new Memory();
  const refs = anchors(memory, 7);
  const sourceContent = refs[0]!;
  const form = refs[1]!;
  const parent = refs[2]!;
  const context = refs[3]!;
  const interpreter = refs[4]!;
  const roleDictionary = refs[5]!;
  const other = refs[6]!;
  const source = defineSourceForm(memory, sourceContent);
  const historyBefore = memory.root;
  const beforeDictionary = defineDictionaryScope(memory, parent, historyBefore);
  const effect = defineDictionaryEffect(
    memory, beforeDictionary, parent, historyBefore, sourceContent, form,
  );
  const roleRefs = anchors(memory, 10);
  const roles: ColonRoles = Object.freeze({
    source: roleRefs[0]!, sourceContent: roleRefs[1]!, form: roleRefs[2]!,
    beforeDictionary: roleRefs[3]!, entry: roleRefs[4]!, definitionOccurrence: roleRefs[5]!,
    historyBefore: roleRefs[6]!, historyAfter: roleRefs[7]!, afterDictionary: roleRefs[8]!,
    context: roleRefs[9]!,
  });
  const fields: Fields = Object.freeze({
    source, sourceContent, form, beforeDictionary, entry: effect.entry,
    definitionOccurrence: effect.occurrence, historyBefore, historyAfter: effect.historyAfter,
    afterDictionary: effect.afterScope, context,
  });

  function makeEvidence(overrides: Partial<Fields> = {}, headerContext = context): ColonReplayEvidence {
    const selected = { ...fields, ...overrides };
    const act = defineActHeader(memory, interpreter, roleDictionary, headerContext);
    const values: readonly [LinkHandle, LinkHandle][] = [
      [roles.source, selected.source], [roles.sourceContent, selected.sourceContent],
      [roles.form, selected.form], [roles.beforeDictionary, selected.beforeDictionary],
      [roles.entry, selected.entry], [roles.definitionOccurrence, selected.definitionOccurrence],
      [roles.historyBefore, selected.historyBefore], [roles.historyAfter, selected.historyAfter],
      [roles.afterDictionary, selected.afterDictionary], [roles.context, selected.context],
    ];
    for (const [role, value] of values) defineActField(memory, act, role, value);
    return Object.freeze({ act, roles, interpreter, roleDictionary });
  }
  return { memory, roles, interpreter, roleDictionary, fields, other, makeEvidence };
}

class Probe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("colon replay must not use find"); }
  outgoing(start: LinkHandle): readonly LinkHandle[] { return this.source.outgoing(start); }
  incoming(): readonly LinkHandle[] { throw new Error("colon replay must not use incoming"); }
}

{
  const f = fixture();
  const evidence = f.makeEvidence();
  const before = f.memory.linkCount;
  same(replayColonEffect(new Probe(f.memory), evidence), f.fields.afterDictionary, "colon effect result");
  same(f.memory.linkCount, before, "colon replay must be read-only");
}

// Each destructive/forged vector gets a fresh Memory because act identity is
// canonical by header and role fields are additive structural facts.
{
  const f = fixture();
  reject(() => replayColonEffect(f.memory, f.makeEvidence({ sourceContent: f.other })));
}
{
  const f = fixture();
  reject(() => replayColonEffect(f.memory, f.makeEvidence({ beforeDictionary: f.memory.root })));
}
{
  const f = fixture();
  const wrongEntry = f.memory.ensure(f.other, f.fields.form);
  reject(() => replayColonEffect(f.memory, f.makeEvidence({ entry: wrongEntry })));
}
{
  const f = fixture();
  const wrongOccurrence = f.memory.ensure(f.other, f.fields.entry);
  reject(() => replayColonEffect(f.memory, f.makeEvidence({ definitionOccurrence: wrongOccurrence })));
}
{
  const f = fixture();
  const wrongHistory = f.memory.ensure(f.other, f.fields.definitionOccurrence);
  reject(() => replayColonEffect(f.memory, f.makeEvidence({ historyAfter: wrongHistory })));
}
{
  const f = fixture();
  const changedParent = defineDictionaryScope(f.memory, f.other, f.fields.historyAfter);
  reject(() => replayColonEffect(f.memory, f.makeEvidence({ afterDictionary: changedParent })));
}
{
  const f = fixture();
  const wrongHistoryScope = defineDictionaryScope(f.memory, f.memory.poles(f.fields.source).end, f.other);
  reject(() => replayColonEffect(f.memory, f.makeEvidence({ afterDictionary: wrongHistoryScope })));
}
{
  const f = fixture();
  const wrongContext = f.memory.ensureStartSelfClosed(f.other);
  reject(() => replayColonEffect(f.memory, f.makeEvidence({}, wrongContext)));
}
{
  const f = fixture();
  const evidence = f.makeEvidence();
  defineActField(f.memory, evidence.act, f.roles.form, f.other);
  reject(() => replayColonEffect(f.memory, evidence));
}

// A malformed predecessor history can make an apparently appended definition
// fail accepted dictionary visibility even when the immediate colon edges fit.
{
  const f = fixture();
  const oldEntry = f.memory.ensure(f.other, f.fields.form);
  const oldOccurrence = f.memory.ensure(f.other, oldEntry);
  const malformedHistory = f.memory.ensure(f.memory.root, oldOccurrence);
  const beforeDictionary = defineDictionaryScope(
    f.memory, f.memory.poles(f.fields.beforeDictionary).end, malformedHistory,
  );
  const entry = f.memory.ensure(f.fields.sourceContent, f.fields.form);
  const occurrence = f.memory.ensure(beforeDictionary, entry);
  const historyAfter = f.memory.ensure(malformedHistory, occurrence);
  const beforeScope = f.memory.poles(f.fields.beforeDictionary).end;
  const parent = f.memory.poles(beforeScope).start;
  const afterDictionary = defineDictionaryScope(f.memory, parent, historyAfter);
  reject(() => replayColonEffect(f.memory, f.makeEvidence({
    beforeDictionary, entry, definitionOccurrence: occurrence,
    historyBefore: malformedHistory, historyAfter, afterDictionary,
  })));
}
