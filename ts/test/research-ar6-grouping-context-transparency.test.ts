import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
  type WriteMemory,
} from "../src/memory.js";
import { replayResolvedSequenceGrouping } from "../src/sequence.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`AR6 grouping probe: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

interface ContextSnapshot {
  readonly parent: LinkHandle;
  readonly current: LinkHandle;
  readonly bindingHistory: LinkHandle;
}

function defineContextSnapshot(
  memory: WriteMemory,
  parent: LinkHandle,
  current: LinkHandle,
  bindingHistory: LinkHandle,
): LinkHandle {
  return memory.ensureStartSelfClosed(
    memory.ensure(memory.ensure(parent, current), bindingHistory),
  );
}

function readContextSnapshot(memory: ReadMemory, context: LinkHandle): ContextSnapshot {
  const wrapper = memory.poles(context);
  assert(wrapper.start === context && wrapper.end !== context, "invalid context wrapper");
  const payload = memory.poles(wrapper.end);
  const frame = memory.poles(payload.start);
  return Object.freeze({
    parent: frame.start,
    current: frame.end,
    bindingHistory: payload.end,
  });
}

function appendContextBinding(
  memory: WriteMemory,
  beforeContext: LinkHandle,
  role: LinkHandle,
  value: LinkHandle,
): LinkHandle {
  const before = readContextSnapshot(memory, beforeContext);
  const occurrence = memory.ensure(beforeContext, memory.ensure(role, value));
  const historyAfter = memory.ensure(before.bindingHistory, occurrence);
  return defineContextSnapshot(memory, before.parent, before.current, historyAfter);
}

function bindingAtSnapshot(
  memory: ReadMemory,
  context: LinkHandle,
  role: LinkHandle,
): LinkHandle {
  const selected = readContextSnapshot(memory, context);
  const values: LinkHandle[] = [];
  const visited = new Set<LinkHandle>();
  let history = selected.bindingHistory;
  while (history !== memory.root) {
    assert(!visited.has(history), "binding history cycle");
    visited.add(history);
    const cell = memory.poles(history);
    const occurrence = memory.poles(cell.end);
    const before = readContextSnapshot(memory, occurrence.start);
    assert(
      before.parent === selected.parent &&
      before.current === selected.current &&
      before.bindingHistory === cell.start,
      "invalid binding predecessor",
    );
    const pair = memory.poles(occurrence.end);
    if (pair.start === role) values.push(pair.end);
    history = cell.start;
  }
  const unique = new Set(values);
  assert(unique.size === 1, "binding must remain exactly one value");
  const result = values[0];
  assert(result !== undefined, "binding value");
  return result;
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("AR6 grouping forbids ambient find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("AR6 grouping forbids ambient outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("AR6 grouping forbids ambient incoming"); }
}

const memory = new Memory();
const { R, O, C, L, U } = ensureRootBasis(memory);
const parent = memory.ensureStartSelfClosed(C);
const current = memory.ensureEndSelfClosed(O);
const role = memory.ensure(L, U);
const baseContext = defineContextSnapshot(memory, parent, current, R);
const context = appendContextBinding(memory, baseContext, role, R);

const before = readContextSnapshot(memory, context);
same(bindingAtSnapshot(memory, context, role), R, "pre-grouping binding");
const countBeforeGrouping = memory.linkCount;

// Parentheses/group delimiters are consumed only into a structural sequence
// description. No contextual/deictic K is supplied to or returned by grouping.
const description = replayResolvedSequenceGrouping(
  memory,
  [O, L, O, U, C, C],
  O,
  C,
);
assert(description.items.length === 1, "outer group count");
assert(description.items[0]?.kind === "group", "outer grouping shape");
same(memory.linkCount, countBeforeGrouping, "grouping must be read-only");

const after = readContextSnapshot(memory, context);
same(after.parent, before.parent, "grouping preserves K.parent");
same(after.current, before.current, "grouping preserves K.current");
same(after.bindingHistory, before.bindingHistory, "grouping preserves K.bindingRevision");
same(bindingAtSnapshot(memory, context, role), R, "grouping cannot rebind role");

// The same statement survives a pole-only boundary: grouping and contextual
// binding validation require selected closure, never ambient discovery.
const poleOnly = new PoleOnlyProbe(memory);
const poleOnlyDescription = replayResolvedSequenceGrouping(
  poleOnly,
  [O, L, C],
  O,
  C,
);
assert(poleOnlyDescription.items[0]?.kind === "group", "pole-only grouping shape");
same(bindingAtSnapshot(poleOnly, context, role), R, "pole-only grouping preserves binding");

const classification = Object.freeze({
  groupingConsumesOnlyResolvedForms: true,
  groupingHasNoContextInputOrOutput: true,
  groupingIsReadOnly: true,
  selectedContextIdentityIsUnchanged: true,
  selectedBindingRevisionIsUnchanged: true,
  rebindingRequiresSeparateExplicitContextEffect: true,
  poleOnlyReplay: true,
  verdict: "GREEN-CANDIDATE" as const,
  reason: "GROUPING_IS_CONTEXT_TRANSPARENT" as const,
});

same(classification.verdict, "GREEN-CANDIDATE", "F06 grouping classification");
console.log("MTS AR6 grouping/context: grouping is transparent; explicit rebinding remains separate.");
