import {
  DictionaryError,
  defineDictionaryEffect,
  defineDictionaryScope,
  lookupScopedDictionary,
  readDictionaryScope,
  verifyVisibleDictionaryOccurrence,
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

function expectDictionaryError(
  effect: () => unknown,
  code: DictionaryError["code"],
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof DictionaryError, `expected DictionaryError, got ${String(error)}`);
    assertSame(error.code, code, "dictionary error code");
    return;
  }
  throw new Error(`expected DictionaryError(${code})`);
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
  find(): LinkHandle | undefined { throw new Error("dictionary lookup must not use find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("dictionary lookup must not use outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("dictionary lookup must not use incoming"); }
}

const memory = new Memory();
const [sourceX, sourceY, formOne, formTwo, parentY, childX, unrelated, wrongHistory] = anchors(memory, 8);
assert(
  sourceX !== undefined && sourceY !== undefined && formOne !== undefined &&
  formTwo !== undefined && parentY !== undefined && childX !== undefined &&
  unrelated !== undefined && wrongHistory !== undefined,
  "fixture anchors must exist",
);
const root = memory.root;

const base = defineDictionaryScope(memory, root, root);
assertSame(defineDictionaryScope(memory, root, root), base, "empty scope must be canonical");
assertDeepEqual(
  readDictionaryScope(memory, base),
  { parentScope: root, localHistory: root },
  "empty scope payload",
);
expectDictionaryError(() => readDictionaryScope(memory, root), "invalid-scope");
const ordinary = memory.ensure(sourceX, sourceY);
expectDictionaryError(() => readDictionaryScope(memory, ordinary), "invalid-scope");

const first = defineDictionaryEffect(memory, base, root, root, sourceX, formOne);
assertDeepEqual(memory.poles(first.entry), { start: sourceX, end: formOne }, "entry topology");
assertDeepEqual(memory.poles(first.occurrence), { start: base, end: first.entry }, "occurrence topology");
assertDeepEqual(memory.poles(first.historyAfter), { start: root, end: first.occurrence }, "history append topology");
assertDeepEqual(
  readDictionaryScope(memory, first.afterScope),
  { parentScope: root, localHistory: first.historyAfter },
  "after-scope selects appended history",
);

const beforeReads = memory.linkCount;
const firstResolution = lookupScopedDictionary(new ChainOnlyProbe(memory), first.afterScope, sourceX);
assert(firstResolution !== undefined, "first definition must resolve");
assertSame(firstResolution.form, formOne, "first resolved form");
assertDeepEqual(firstResolution.occurrences, [first.occurrence], "first occurrence evidence");
verifyVisibleDictionaryOccurrence(memory, first.afterScope, first.occurrence, sourceX, formOne);
assertSame(memory.linkCount, beforeReads, "dictionary reads must not materialize");

const secondSame = defineDictionaryEffect(
  memory, first.afterScope, root, first.historyAfter, sourceX, formOne,
);
const repeated = lookupScopedDictionary(memory, secondSame.afterScope, sourceX);
assert(repeated !== undefined, "repeated definition must resolve");
assertSame(repeated.form, formOne, "repeated same form remains one semantic form");
assertDeepEqual(
  repeated.occurrences,
  [secondSame.occurrence, first.occurrence],
  "repeated definitions preserve newest-to-oldest structural events",
);

const conflicting = defineDictionaryEffect(
  memory, first.afterScope, root, first.historyAfter, sourceX, formTwo,
);
expectDictionaryError(
  () => lookupScopedDictionary(memory, conflicting.afterScope, sourceX),
  "local-form-conflict",
);

const independentOther = defineDictionaryEffect(memory, base, root, root, sourceX, formTwo);
assertSame(lookupScopedDictionary(memory, first.afterScope, sourceX)?.form, formOne, "first independent scope");
assertSame(lookupScopedDictionary(memory, independentOther.afterScope, sourceX)?.form, formTwo, "second independent scope");

const parentX = first;
const parentSecond = defineDictionaryEffect(
  memory,
  parentX.afterScope,
  root,
  parentX.historyAfter,
  sourceY,
  parentY,
);
const childBase = defineDictionaryScope(memory, parentSecond.afterScope, root);
const child = defineDictionaryEffect(
  memory,
  childBase,
  parentSecond.afterScope,
  root,
  sourceX,
  childX,
);
assertSame(lookupScopedDictionary(memory, child.afterScope, sourceX)?.form, childX, "child shadows parent");
assertSame(lookupScopedDictionary(memory, child.afterScope, sourceY)?.form, parentY, "missing child name falls through");
assertSame(lookupScopedDictionary(memory, child.afterScope, unrelated), undefined, "missing name stays absent");

const unreachableHistory = memory.ensureStartSelfClosed(unrelated);
const unreachableBase = defineDictionaryScope(memory, root, unreachableHistory);
const unreachable = defineDictionaryEffect(
  memory,
  unreachableBase,
  root,
  unreachableHistory,
  sourceY,
  formTwo,
);
expectDictionaryError(
  () => verifyVisibleDictionaryOccurrence(memory, base, unreachable.occurrence, sourceY, formTwo),
  "source-not-visible",
);
expectDictionaryError(
  () => verifyVisibleDictionaryOccurrence(memory, first.afterScope, first.occurrence, sourceX, formTwo),
  "visible-form-mismatch",
);
expectDictionaryError(
  () => verifyVisibleDictionaryOccurrence(memory, first.afterScope, independentOther.occurrence, sourceX, formOne),
  "occurrence-not-visible",
);

const wrongBefore = defineDictionaryScope(memory, root, wrongHistory);
const forgedOccurrence = memory.ensure(wrongBefore, first.entry);
const forgedHistory = memory.ensure(root, forgedOccurrence);
const forgedScope = defineDictionaryScope(memory, root, forgedHistory);
expectDictionaryError(
  () => lookupScopedDictionary(memory, forgedScope, sourceX),
  "invalid-predecessor-snapshot",
);

function fake(): LinkHandle {
  return Object.freeze({}) as LinkHandle;
}

class FakeReadMemory implements ReadMemory {
  constructor(
    readonly root: LinkHandle,
    private readonly topology: ReadonlyMap<LinkHandle, LinkPoles>,
  ) {}

  get linkCount(): number { return this.topology.size; }
  poles(link: LinkHandle): LinkPoles {
    const poles = this.topology.get(link);
    if (poles === undefined) throw new Error("missing fake link");
    return poles;
  }
  find(): LinkHandle | undefined { throw new Error("fake dictionary must not search"); }
  outgoing(): readonly LinkHandle[] { throw new Error("fake dictionary must not scan outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("fake dictionary must not scan incoming"); }
}

{
  const R = fake(), d1 = fake(), d2 = fake(), p1 = fake(), p2 = fake(), source = fake();
  const cyclic = new FakeReadMemory(R, new Map([
    [d1, { start: d1, end: p1 }],
    [p1, { start: d2, end: R }],
    [d2, { start: d2, end: p2 }],
    [p2, { start: d1, end: R }],
  ]));
  expectDictionaryError(() => lookupScopedDictionary(cyclic, d1, source), "scope-parent-cycle");
}

{
  const R = fake(), d = fake(), payload = fake(), history = fake();
  const occurrence = fake(), entry = fake(), source = fake(), form = fake();
  const cyclic = new FakeReadMemory(R, new Map([
    [d, { start: d, end: payload }],
    [payload, { start: R, end: history }],
    [history, { start: history, end: occurrence }],
    [occurrence, { start: d, end: entry }],
    [entry, { start: source, end: form }],
  ]));
  expectDictionaryError(() => lookupScopedDictionary(cyclic, d, source), "local-history-cycle");
}
