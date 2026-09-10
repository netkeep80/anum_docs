import {
  StateError,
  defineContext,
  defineLocalRepresentativeBinding,
  localRepresentativeResolution,
} from "../src/state.js";
import {
  Memory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`AR3 context binding probe: ${message}`);
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

class NoAmbientDiscoveryProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("AR3 probe forbids ambient find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("AR3 probe forbids ambient outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("AR3 probe forbids ambient incoming"); }
}

const memory = new Memory();
const [parent, current, member, representativeOne, representativeTwo] = anchors(memory, 5);
assert(
  parent !== undefined &&
  current !== undefined &&
  member !== undefined &&
  representativeOne !== undefined &&
  representativeTwo !== undefined,
  "fixture anchors must exist",
);

// One explicit K handle. Its own pole structure never changes below.
const context = defineContext(memory, parent, current);
const contextPolesBefore = memory.poles(context);
const payloadPolesBefore = memory.poles(contextPolesBefore.end);
same(payloadPolesBefore.start, parent, "K parent before ambient bindings");
same(payloadPolesBefore.end, current, "K current before ambient bindings");

// RED-1: before any ambient K -> (member -> representative) attachment, the
// current resolver interprets the same (K, member) as identity.
const beforeBinding = localRepresentativeResolution(memory, context, member);
same(beforeBinding.representative, member, "same K/member initially resolves to identity");
same(beforeBinding.bindings.length, 0, "initial resolution has no binding evidence");

// A producer can append a binding adjacent to the already-existing K. K itself
// is not replaced and its defining poles are unchanged, but the semantic answer
// for the old (K, member) query changes.
const bindingOne = defineLocalRepresentativeBinding(
  memory,
  context,
  member,
  representativeOne,
);
const afterFirstBinding = localRepresentativeResolution(memory, context, member);
same(afterFirstBinding.representative, representativeOne, "old K/member changed after later attachment");
same(afterFirstBinding.bindings.length, 1, "first ambient attachment becomes authority");
same(afterFirstBinding.bindings[0], bindingOne, "resolver discovers producer-created attachment");

const contextPolesAfterFirst = memory.poles(context);
const payloadPolesAfterFirst = memory.poles(contextPolesAfterFirst.end);
same(contextPolesAfterFirst.start, contextPolesBefore.start, "K start pole stayed unchanged");
same(contextPolesAfterFirst.end, contextPolesBefore.end, "K end pole stayed unchanged");
same(payloadPolesAfterFirst.start, payloadPolesBefore.start, "K parent stayed unchanged");
same(payloadPolesAfterFirst.end, payloadPolesBefore.end, "K current stayed unchanged");

// RED-2: another later attachment to the same old K can change the same query
// again, this time from a successful value into a conflict. Thus an old replay
// cannot be stable merely by pinning the K handle.
defineLocalRepresentativeBinding(
  memory,
  context,
  member,
  representativeTwo,
);
let conflictObserved = false;
try {
  localRepresentativeResolution(memory, context, member);
} catch (error) {
  assert(error instanceof StateError, `expected StateError, got ${String(error)}`);
  same(error.code, "representative-conflict", "second later attachment changes old verdict to conflict");
  conflictObserved = true;
}
assert(conflictObserved, "ambient second binding must reproduce representative conflict");

// RED-3: unlike the closure-bounded AR1/AR2 probes, current local binding replay
// cannot run on a pole-only view because it requires ambient outgoing(K)
// discovery. This is the exact dependency that lets future Memory growth alter
// the meaning of an already-selected context handle.
let ambientDiscoveryRequired = false;
try {
  localRepresentativeResolution(new NoAmbientDiscoveryProbe(memory), context, member);
} catch (error) {
  assert(error instanceof Error, `expected ambient-discovery failure, got ${String(error)}`);
  assert(error.message.includes("ambient outgoing"), `unexpected probe failure: ${error.message}`);
  ambientDiscoveryRequired = true;
}
assert(ambientDiscoveryRequired, "current binding resolution must expose outgoing(K) dependency");

const classification = Object.freeze({
  contextHandlePoleStructureStayedFixed: true,
  sameContextMemberVerdictChangedAfterLaterAttachment: true,
  laterSecondAttachmentCanTurnOldSuccessIntoConflict: true,
  currentReplayRequiresAmbientOutgoingDiscovery: true,
  unrelatedMemoryGrowthIsNotTheIssue: true,
  sameContextAdjacencyGrowthIsTheIssue: true,
  verdict: "RED" as const,
  reason: "CONTEXT_BINDING_AUTHORITY_DEPENDS_ON_AMBIENT_OUTGOING_EXTENSION" as const,
});

same(classification.verdict, "RED", "AR3 ambient-binding classification");
same(
  classification.reason,
  "CONTEXT_BINDING_AUTHORITY_DEPENDS_ON_AMBIENT_OUTGOING_EXTENSION",
  "AR3 RED reason",
);

console.log("MTS AR3 context binding authority: RED ambient-outgoing gap confirmed.");
