import { Memory, type LinkHandle, type LinkPoles, type ReadMemory } from "../src/memory.js";
import {
  SequenceReplayError,
  materializeSequence,
  replaySequenceMaterialization,
  type SequenceDescription,
  type SequenceItem,
  type SequenceMaterializationEffect,
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
const atom = (value: LinkHandle): SequenceItem => Object.freeze({ kind: "atom", value });
const group = (...items: SequenceItem[]): SequenceItem => Object.freeze({ kind: "group", items: Object.freeze(items) });
const description = (memory: Memory, ...items: SequenceItem[]): SequenceDescription =>
  Object.freeze({ root: memory.root, items: Object.freeze(items) });

{
  const m = new Memory();
  const [a, b, c] = anchors(m, 3);
  assert(a && b && c, "fixture refs");

  const empty = materializeSequence(m, description(m));
  same(empty.result, m.root, "empty result root");
  same(empty.created.length, 0, "empty creates");

  const singleton = materializeSequence(m, description(m, atom(a)));
  same(singleton.result, a, "singleton same link");
  same(singleton.created.length, 0, "singleton creates");

  const two = materializeSequence(m, description(m, atom(a), atom(b)));
  same(two.created.length, 1, "two atom create count");
  same(two.created[0]?.start, a, "two atom start");
  same(two.created[0]?.end, b, "two atom end");
  same(m.poles(two.result).start, a, "two atom result start");
  same(m.poles(two.result).end, b, "two atom result end");

  const reused = materializeSequence(m, description(m, atom(a), atom(b)));
  same(reused.result, two.result, "existing pair reused");
  same(reused.created.length, 0, "reused creates none");

  const three = materializeSequence(m, description(m, atom(a), atom(b), atom(c)));
  same(three.created.length, 1, "partial prefix creates suffix only");
  same(three.created[0]?.start, two.result, "suffix starts at reused prefix");
  same(three.created[0]?.end, c, "suffix end");
}

{
  const m = new Memory();
  const [a, b, c] = anchors(m, 3);
  assert(a && b && c, "nested refs");
  const nested = materializeSequence(m, description(m, group(atom(a), atom(b)), atom(c)));
  same(nested.created.length, 2, "nested creates inner and outer");
  same(nested.created[1]?.start, nested.created[0]?.ref, "nested result feeds outer fold");

  const emptyNested = materializeSequence(m, description(m, group(), atom(c)));
  same(emptyNested.created.length, 1, "empty group contributes root");
  same(emptyNested.created[0]?.start, m.root, "empty group is root");
  same(emptyNested.created[0]?.end, c, "empty group fold end");
}

{
  const m = new Memory();
  const [a, b] = anchors(m, 2);
  assert(a && b, "reuse refs");
  const effect = materializeSequence(m, description(m,
    group(atom(a), atom(b)),
    group(atom(a), atom(b)),
  ));
  same(effect.created.length, 2, "same nested pair created once plus outer self-pair");
  same(effect.created[0]?.start, a, "nested first start");
  same(effect.created[0]?.end, b, "nested first end");
  same(effect.created[1]?.start, effect.created[0]?.ref, "outer starts with reused nested ref");
  same(effect.created[1]?.end, effect.created[0]?.ref, "outer ends with reused nested ref");
}

{
  const m = new Memory();
  const foreignMemory = new Memory();
  const [a] = anchors(m, 1);
  const [foreign] = anchors(foreignMemory, 1);
  assert(a && foreign, "foreign refs");
  const before = m.linkCount;
  reject(() => materializeSequence(m, Object.freeze({ root: foreignMemory.root, items: [atom(a)] })));
  same(m.linkCount, before, "root mismatch no writes");
  reject(() => materializeSequence(m, description(m, atom(a), atom(foreign))));
  same(m.linkCount, before, "foreign atom no writes");
}

{
  const m = new Memory();
  const [a, b, c] = anchors(m, 3);
  assert(a && b && c, "replay refs");
  const effect = materializeSequence(m, description(m, atom(a), atom(b), atom(c)));
  const before = m.linkCount;
  same(replaySequenceMaterialization(m, effect), effect.result, "replay result");
  same(m.linkCount, before, "replay read-only");

  const forgedResult = Object.freeze({ ...effect, result: a });
  reject(() => replaySequenceMaterialization(m, forgedResult));

  const wrongPoles = Object.freeze({
    ...effect,
    created: Object.freeze([{ ...effect.created[0]!, start: c }]),
    linkCountAfter: effect.linkCountBefore + 1,
  });
  reject(() => replaySequenceMaterialization(m, wrongPoles));

  const duplicate = Object.freeze({
    ...effect,
    created: Object.freeze([effect.created[0]!, effect.created[0]!]),
    linkCountAfter: effect.linkCountBefore + 2,
  });
  reject(() => replaySequenceMaterialization(m, duplicate));

  const unrelated = m.ensure(a, c);
  const unrelatedEffect = Object.freeze({
    ...effect,
    created: Object.freeze([{ ref: unrelated, start: a, end: c }]),
    linkCountAfter: effect.linkCountBefore + 1,
  });
  reject(() => replaySequenceMaterialization(m, unrelatedEffect));
}

{
  const m = new Memory();
  const [a, b] = anchors(m, 2);
  assert(a && b, "missing pair refs");
  const fake: SequenceMaterializationEffect = Object.freeze({
    description: description(m, atom(a), atom(b)),
    result: a,
    created: Object.freeze([]),
    linkCountBefore: m.linkCount,
    linkCountAfter: m.linkCount,
  });
  const before = m.linkCount;
  reject(() => replaySequenceMaterialization(m, fake));
  same(m.linkCount, before, "missing replay pair not materialized");
}

class Probe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined { return this.source.find(start, end); }
  outgoing(): readonly LinkHandle[] { throw new Error("materialization replay must not scan outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("materialization replay must not scan incoming"); }
}

{
  const m = new Memory();
  const [a, b] = anchors(m, 2);
  assert(a && b, "probe refs");
  const effect = materializeSequence(m, description(m, atom(a), atom(b)));
  same(replaySequenceMaterialization(new Probe(m), effect), effect.result, "ReadMemory replay");
}
