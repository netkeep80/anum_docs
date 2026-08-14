import { Memory, type LinkHandle, type LinkPoles, type ReadMemory } from "../src/memory.js";
import {
  DirectDeixisReplayError,
  analyzeDirectDeixisCarrier,
  type DeicticPole,
  type DirectDeixisVocabulary,
} from "../src/direct-deixis.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function reject(effect: () => unknown): void {
  try { effect(); }
  catch (error) {
    assert(error instanceof DirectDeixisReplayError, `expected DirectDeixisReplayError, got ${String(error)}`);
    same(error.code, "invalid-direct-deixis-evidence", "direct deixis error code");
    return;
  }
  throw new Error("expected invalid-direct-deixis-evidence");
}

function fixture() {
  const memory = new Memory();
  const startPole = memory.ensureStartSelfClosed(memory.root);
  const endPole = memory.ensureEndSelfClosed(memory.root);
  const nodeTag = memory.ensure(startPole, endPole);
  const opaqueTag = memory.ensure(endPole, startPole);
  const pronounTag = memory.ensure(nodeTag, opaqueTag);
  const upStep = memory.ensure(opaqueTag, nodeTag);
  const vocabulary: DirectDeixisVocabulary = Object.freeze({
    nodeTag, opaqueTag, pronounTag, upStep, startPole, endPole,
  });
  const fold = (values: readonly LinkHandle[]): LinkHandle => {
    let current = memory.root;
    for (const value of values) current = memory.ensure(current, value);
    return current;
  };
  const opaque = (): LinkHandle => memory.ensure(opaqueTag, memory.root);
  const pronoun = (up: number, pole: DeicticPole): LinkHandle => {
    const marker = pole === "start" ? startPole : endPole;
    return memory.ensure(pronounTag, fold([...Array<LinkHandle>(up).fill(upStep), marker]));
  };
  const node = (...children: LinkHandle[]): LinkHandle => memory.ensure(nodeTag, fold(children));
  return { memory, vocabulary, fold, opaque, pronoun, node };
}

{
  const f = fixture();
  const carrier = f.node(
    f.node(f.pronoun(0, "start")),
    f.node(f.pronoun(2, "end")),
    f.opaque(),
  );
  const before = f.memory.linkCount;
  const result = analyzeDirectDeixisCarrier(f.memory, carrier, f.vocabulary);
  same(result.length, 2, "occurrence count");
  same(result[0]?.path.join(","), "0,0", "first path");
  same(result[0]?.up, 0, "first up");
  same(result[0]?.pole, "start", "first pole");
  same(result[1]?.path.join(","), "1,0", "second path");
  same(result[1]?.up, 2, "second up");
  same(result[1]?.pole, "end", "second pole");
  same(f.memory.linkCount, before, "analysis read-only");
}

{
  const f = fixture();
  const pronoun = f.pronoun(1, "end");
  const shared = f.node(pronoun);
  const carrier = f.node(shared, shared);
  const result = analyzeDirectDeixisCarrier(f.memory, carrier, f.vocabulary);
  same(result.length, 2, "shared subtree occurrence count");
  same(result[0]?.path.join(","), "0,0", "shared first path");
  same(result[1]?.path.join(","), "1,0", "shared second path");
  same(result[0]?.up, 1, "shared first up");
  same(result[1]?.pole, "end", "shared second pole");
}

{
  const f = fixture();
  const deeplyGrouped = f.node(f.node(f.node(f.pronoun(2, "start"))), f.opaque());
  const result = analyzeDirectDeixisCarrier(f.memory, deeplyGrouped, f.vocabulary);
  same(result[0]?.path.join(","), "0,0,0", "grouping remains structural path");
}

{
  const f = fixture();
  const result = analyzeDirectDeixisCarrier(f.memory, f.opaque(), f.vocabulary);
  same(result.length, 0, "opaque carrier has no implication/occurrence");
}

{
  const f = fixture();
  const badOpaque = f.memory.ensure(f.vocabulary.opaqueTag, f.vocabulary.startPole);
  reject(() => analyzeDirectDeixisCarrier(f.memory, badOpaque, f.vocabulary));

  const emptyMetadata = f.memory.ensure(f.vocabulary.pronounTag, f.memory.root);
  reject(() => analyzeDirectDeixisCarrier(f.memory, emptyMetadata, f.vocabulary));

  const invalidMarker = f.memory.ensure(
    f.vocabulary.pronounTag,
    f.fold([f.vocabulary.nodeTag]),
  );
  reject(() => analyzeDirectDeixisCarrier(f.memory, invalidMarker, f.vocabulary));

  const nonUpPrefix = f.memory.ensure(
    f.vocabulary.pronounTag,
    f.fold([f.vocabulary.opaqueTag, f.vocabulary.startPole]),
  );
  reject(() => analyzeDirectDeixisCarrier(f.memory, nonUpPrefix, f.vocabulary));

  const malformedNode = f.memory.ensure(f.vocabulary.nodeTag, f.vocabulary.startPole);
  reject(() => analyzeDirectDeixisCarrier(f.memory, malformedNode, f.vocabulary));
}

{
  const f = fixture();
  reject(() => analyzeDirectDeixisCarrier(f.memory, f.opaque(), Object.freeze({
    ...f.vocabulary,
    endPole: f.vocabulary.startPole,
  })));

  const other = new Memory();
  const foreign = other.ensureStartSelfClosed(other.root);
  reject(() => analyzeDirectDeixisCarrier(f.memory, f.opaque(), Object.freeze({
    ...f.vocabulary,
    startPole: foreign,
  })));
}

class Probe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("direct deixis must not use find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("direct deixis must not use outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("direct deixis must not use incoming"); }
}

{
  const f = fixture();
  const carrier = f.node(f.pronoun(1, "start"), f.opaque());
  const before = f.memory.linkCount;
  const result = analyzeDirectDeixisCarrier(new Probe(f.memory), carrier, f.vocabulary);
  same(result.length, 1, "ReadMemory probe result");
  same(f.memory.linkCount, before, "ReadMemory probe no writes");
}
