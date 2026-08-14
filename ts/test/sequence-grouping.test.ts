import { Memory, type LinkHandle, type LinkPoles, type ReadMemory } from "../src/memory.js";
import {
  SequenceReplayError,
  replayResolvedSequenceGrouping,
  replayRootOpeningRestoration,
  type SequenceItem,
} from "../src/sequence.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function reject(effect: () => unknown): void {
  try { effect(); }
  catch (error) {
    assert(error instanceof SequenceReplayError, `expected SequenceReplayError, got ${String(error)}`);
    same(error.code, "invalid-sequence-evidence", "sequence error code");
    return;
  }
  throw new Error("expected invalid-sequence-evidence");
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
function atom(item: SequenceItem | undefined, value: LinkHandle, message: string): void {
  assert(item?.kind === "atom", `${message}: expected atom`);
  same(item.value, value, `${message}: value`);
}
function group(item: SequenceItem | undefined, length: number, message: string): readonly SequenceItem[] {
  assert(item?.kind === "group", `${message}: expected group`);
  same(item.items.length, length, `${message}: length`);
  return item.items;
}

{
  const m = new Memory();
  const [open, close, a, b, c] = anchors(m, 5);
  assert(open && close && a && b && c, "fixture refs");
  const before = m.linkCount;

  const empty = replayResolvedSequenceGrouping(m, [], open, close);
  same(empty.root, m.root, "empty root");
  same(empty.items.length, 0, "empty items");

  const flat = replayResolvedSequenceGrouping(m, [a, b], open, close);
  atom(flat.items[0], a, "flat a");
  atom(flat.items[1], b, "flat b");

  const nested = replayResolvedSequenceGrouping(m, [open, a, b, close, c], open, close);
  const nestedItems = group(nested.items[0], 2, "nested group");
  atom(nestedItems[0], a, "nested a");
  atom(nestedItems[1], b, "nested b");
  atom(nested.items[1], c, "nested tail");

  const emptyNested = replayResolvedSequenceGrouping(m, [open, close], open, close);
  group(emptyNested.items[0], 0, "empty nested group");

  const deep = replayResolvedSequenceGrouping(m, [open, a, open, b, close, close], open, close);
  const outer = group(deep.items[0], 2, "outer group");
  atom(outer[0], a, "outer atom");
  const inner = group(outer[1], 1, "inner group");
  atom(inner[0], b, "inner atom");

  same(m.linkCount, before, "grouping must be read-only");
}

{
  const m = new Memory();
  const [open, close, a] = anchors(m, 3);
  assert(open && close && a, "fixture refs");
  reject(() => replayResolvedSequenceGrouping(m, [close], open, close));
  reject(() => replayResolvedSequenceGrouping(m, [open, a], open, close));
  reject(() => replayResolvedSequenceGrouping(m, [a], open, open));
}

{
  const m = new Memory();
  const [open, close, a] = anchors(m, 3);
  assert(open && close && a, "fixture refs");
  const before = m.linkCount;
  const balanced = [open, a, close] as const;
  same(replayRootOpeningRestoration(m, balanced, open, close), balanced, "balanced unchanged identity");

  const deficit = replayRootOpeningRestoration(m, [open, close, close], open, close);
  same(deficit.length, 4, "restored length");
  same(deficit[0], open, "restored repeated opening");
  same(deficit[1], open, "original opening retained");

  const ineligible = [a, close] as const;
  same(replayRootOpeningRestoration(m, ineligible, open, close), ineligible, "non-leading open unchanged");
  same(m.linkCount, before, "restoration must be read-only");
}

{
  const left = new Memory();
  const right = new Memory();
  const [open, close, a] = anchors(left, 3);
  const [foreign] = anchors(right, 1);
  assert(open && close && a && foreign, "foreign refs");
  reject(() => replayResolvedSequenceGrouping(left, [foreign], open, close));
  reject(() => replayRootOpeningRestoration(left, [open, foreign], open, close));
  reject(() => replayResolvedSequenceGrouping(left, [a], foreign, close));
}

class Probe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("sequence replay must not use find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("sequence replay must not use outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("sequence replay must not use incoming"); }
}

{
  const m = new Memory();
  const [open, close, a] = anchors(m, 3);
  assert(open && close && a, "probe refs");
  const probe = new Probe(m);
  replayResolvedSequenceGrouping(probe, [open, a, close], open, close);
  replayRootOpeningRestoration(probe, [open, close, close], open, close);
}
