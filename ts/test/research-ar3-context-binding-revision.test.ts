import {
  Memory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
  type WriteMemory,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`AR3 revision probe: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
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

interface ContextSnapshot {
  readonly parent: LinkHandle;
  readonly current: LinkHandle;
  readonly localBindingHistory: LinkHandle;
}

interface BindingEffect {
  readonly pair: LinkHandle;
  readonly occurrence: LinkHandle;
  readonly historyAfter: LinkHandle;
  readonly afterContext: LinkHandle;
}

// Research-only candidate. K remains one explicit handle, but its defining
// structure closes over the selected local-binding revision instead of leaving
// local bindings in ambient outgoing(K) adjacency.
function defineContextSnapshot(
  memory: WriteMemory,
  parent: LinkHandle,
  current: LinkHandle,
  localBindingHistory: LinkHandle,
): LinkHandle {
  const frame = memory.ensure(parent, current);
  const payload = memory.ensure(frame, localBindingHistory);
  return memory.ensureStartSelfClosed(payload);
}

function readContextSnapshot(
  memory: ReadMemory,
  context: LinkHandle,
): ContextSnapshot {
  const header = memory.poles(context);
  assert(header.start === context && header.end !== context, "K must be explicit START(payload)");
  const payload = memory.poles(header.end);
  const frame = memory.poles(payload.start);
  return Object.freeze({
    parent: frame.start,
    current: frame.end,
    localBindingHistory: payload.end,
  });
}

function defineBindingEffect(
  memory: WriteMemory,
  beforeContext: LinkHandle,
  member: LinkHandle,
  representative: LinkHandle,
): BindingEffect {
  const before = readContextSnapshot(memory, beforeContext);
  const pair = memory.ensure(member, representative);
  const occurrence = memory.ensure(beforeContext, pair);
  const historyAfter = memory.ensure(before.localBindingHistory, occurrence);
  const afterContext = defineContextSnapshot(
    memory,
    before.parent,
    before.current,
    historyAfter,
  );
  return Object.freeze({ pair, occurrence, historyAfter, afterContext });
}

function localRepresentativeAtSnapshot(
  memory: ReadMemory,
  context: LinkHandle,
  member: LinkHandle,
): LinkHandle {
  const selected = readContextSnapshot(memory, context);
  const representatives: LinkHandle[] = [];
  const visitedHistory = new Set<LinkHandle>();
  let history = selected.localBindingHistory;

  while (history !== memory.root) {
    assert(!visitedHistory.has(history), "binding history must be acyclic");
    visitedHistory.add(history);

    const cell = memory.poles(history);
    const previousHistory = cell.start;
    const occurrence = memory.poles(cell.end);
    const beforeContext = occurrence.start;
    const pair = memory.poles(occurrence.end);
    const before = readContextSnapshot(memory, beforeContext);

    assert(before.parent === selected.parent, "binding predecessor parent mismatch");
    assert(before.current === selected.current, "binding predecessor current mismatch");
    assert(
      before.localBindingHistory === previousHistory,
      "binding predecessor revision mismatch",
    );

    if (pair.start === member) representatives.push(pair.end);
    history = previousHistory;
  }

  if (representatives.length === 0) return member;
  const unique = new Set(representatives);
  assert(unique.size === 1, "representative-conflict");
  const representative = representatives[0];
  assert(representative !== undefined, "representative must exist");
  return representative;
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("AR3 revision replay forbids find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("AR3 revision replay forbids outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("AR3 revision replay forbids incoming"); }
}

const memory = new Memory();
const [parent, current, member, representativeA, representativeB, noise] = anchors(memory, 6);
assert(
  parent !== undefined &&
  current !== undefined &&
  member !== undefined &&
  representativeA !== undefined &&
  representativeB !== undefined &&
  noise !== undefined,
  "fixture anchors must exist",
);

const K0 = defineContextSnapshot(memory, parent, current, memory.root);
const K0State = readContextSnapshot(memory, K0);
same(K0State.parent, parent, "K0 parent");
same(K0State.current, current, "K0 current");
same(K0State.localBindingHistory, memory.root, "K0 starts with empty binding revision");
same(localRepresentativeAtSnapshot(memory, K0, member), member, "K0 unbound fallback");

// Adding a local binding is an explicit state transition K0 -> K1A. It does not
// retroactively change K0, even though parent/current remain exactly the same.
const effectA = defineBindingEffect(memory, K0, member, representativeA);
const K1A = effectA.afterContext;
assert(K1A !== K0, "binding must produce a new contextual revision handle");
const K1AState = readContextSnapshot(memory, K1A);
same(K1AState.parent, parent, "K1A preserves parent");
same(K1AState.current, current, "K1A preserves current");
same(K1AState.localBindingHistory, effectA.historyAfter, "K1A pins binding history");
same(localRepresentativeAtSnapshot(memory, K0, member), member, "K0 stays immutable after K1A");
same(localRepresentativeAtSnapshot(memory, K1A, member), representativeA, "K1A resolves A");

// Ambient topology, including a forged old-style K0 -> (member -> B)
// attachment, is outside the selected history closure and therefore cannot
// alter either old snapshot.
let unrelated = noise;
for (let index = 0; index < 30; index += 1) unrelated = memory.ensureStartSelfClosed(unrelated);
const ambientPairB = memory.ensure(member, representativeB);
memory.ensure(K0, ambientPairB);
same(localRepresentativeAtSnapshot(memory, K0, member), member, "ambient attachment cannot mutate K0");
same(localRepresentativeAtSnapshot(memory, K1A, member), representativeA, "ambient attachment cannot mutate K1A");

// Replay needs only explicitly rooted pole structure; no ambient discovery API
// participates in the judgment.
const poleOnly = new PoleOnlyProbe(memory);
same(localRepresentativeAtSnapshot(poleOnly, K0, member), member, "pole-only K0 replay");
same(localRepresentativeAtSnapshot(poleOnly, K1A, member), representativeA, "pole-only K1A replay");

// Persistent revisions may fork. Two children of the same K0 can select
// different local meanings without rewriting K0 or one another.
const effectB = defineBindingEffect(memory, K0, member, representativeB);
const K1B = effectB.afterContext;
assert(K1B !== K1A, "forked revisions with different bindings must differ");
same(localRepresentativeAtSnapshot(memory, K1A, member), representativeA, "fork A remains A");
same(localRepresentativeAtSnapshot(memory, K1B, member), representativeB, "fork B resolves B");
same(localRepresentativeAtSnapshot(memory, K0, member), member, "common predecessor remains unbound");

// A conflicting second binding is representable only in a NEW descendant
// revision. The descendant rejects, while the accepted predecessor remains
// replay-stable.
const conflictEffect = defineBindingEffect(memory, K1A, member, representativeB);
const K2Conflict = conflictEffect.afterContext;
let conflictRejected = false;
try {
  localRepresentativeAtSnapshot(memory, K2Conflict, member);
} catch (error) {
  assert(error instanceof Error, `expected conflict error, got ${String(error)}`);
  assert(error.message.includes("representative-conflict"), `unexpected conflict: ${error.message}`);
  conflictRejected = true;
}
assert(conflictRejected, "conflicting descendant revision must reject");
same(localRepresentativeAtSnapshot(memory, K1A, member), representativeA, "K1A remains valid after conflicting descendant");

const classification = Object.freeze({
  contextPinsBindingRevision: true,
  bindingCreatesNewContextRevision: true,
  oldContextMeaningIsStable: true,
  forkedContextRevisionsAreIndependent: true,
  conflictingBindingAffectsOnlyDescendantRevision: true,
  replayUsesOnlyRootedPoleClosure: true,
  ambientAdjacencyCannotRetroactivelyRebind: true,
  verdict: "GREEN-CANDIDATE" as const,
  reason: "PERSISTENT_CONTEXT_REVISION_SATISFIES_FRAME_LAW" as const,
});

same(classification.verdict, "GREEN-CANDIDATE", "AR3 revision classification");
same(
  classification.reason,
  "PERSISTENT_CONTEXT_REVISION_SATISFIES_FRAME_LAW",
  "AR3 revision reason",
);

console.log("MTS AR3 contextual binding revision: GREEN candidate model exercised.");
