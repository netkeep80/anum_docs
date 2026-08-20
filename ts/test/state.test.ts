import {
  StateError,
  currentOfContext,
  defineContext,
  defineLocalRepresentativeBinding,
  localRepresentative,
  localRepresentativeResolution,
  parentOfContext,
  readContext,
} from "../src/state.js";
import {
  Memory,
  ensureRootBasis,
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

function expectStateError(effect: () => unknown, code: StateError["code"]): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StateError, `expected StateError, got ${String(error)}`);
    assertSame(error.code, code, "state error code");
    return;
  }
  throw new Error(`expected StateError(${code})`);
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

class IndexedContextProbe implements ReadMemory {
  outgoingCalls = 0;

  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle {
    return this.source.root;
  }

  get linkCount(): number {
    return this.source.linkCount;
  }

  poles(link: LinkHandle): LinkPoles {
    return this.source.poles(link);
  }

  find(): LinkHandle | undefined {
    throw new Error("local representative resolution must not use pair lookup");
  }

  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.outgoingCalls += 1;
    return this.source.outgoing(start);
  }

  incoming(): readonly LinkHandle[] {
    throw new Error("local representative resolution must not use incoming scan");
  }
}

// #728: ROOT и START(payload) — разные grounded recursive forms. Для
// parent=current=R payload схлопывается в R, но сам явный K остаётся O=START(R).
// ROOT не должен приниматься как alias K и тем самым открывать root topology
// для ложного чтения local bindings.
{
  const rootMemory = new Memory();
  const basis = ensureRootBasis(rootMemory);
  const rootContext = defineContext(rootMemory, basis.R, basis.R);

  assertSame(rootContext, basis.O, "canonical (R,R) context is START(R)=O");
  assertDeepEqual(
    readContext(rootMemory, rootContext),
    { parent: basis.R, current: basis.R },
    "canonical root-state context payload",
  );
  const decoded = readContext(rootMemory, rootContext);
  assertSame(
    defineContext(rootMemory, decoded.parent, decoded.current),
    rootContext,
    "canonical context decode/encode round-trip",
  );

  expectStateError(() => readContext(rootMemory, basis.R), "invalid-context");

  const probe = new IndexedContextProbe(rootMemory);
  expectStateError(
    () => localRepresentativeResolution(probe, basis.R, basis.R),
    "invalid-context",
  );
  assertSame(
    probe.outgoingCalls,
    0,
    "invalid ROOT-as-context is rejected before scanning ordinary root topology",
  );
}

const memory = new Memory();
const [
  parent,
  current,
  otherParent,
  otherCurrent,
  member,
  representativeOne,
  representativeTwo,
  otherMember,
  otherRepresentative,
  ordinaryLeft,
  ordinaryRight,
] = anchors(memory, 11);

assert(
  parent !== undefined &&
  current !== undefined &&
  otherParent !== undefined &&
  otherCurrent !== undefined &&
  member !== undefined &&
  representativeOne !== undefined &&
  representativeTwo !== undefined &&
  otherMember !== undefined &&
  otherRepresentative !== undefined &&
  ordinaryLeft !== undefined &&
  ordinaryRight !== undefined,
  "fixture anchors must exist",
);

const context = defineContext(memory, parent, current);
const sameContext = defineContext(memory, parent, current);
assertSame(sameContext, context, "same parent/current must reuse canonical context");

const otherContext = defineContext(memory, otherParent, otherCurrent);
assert(otherContext !== context, "different explicit context must remain distinct");

const beforeContextReads = memory.linkCount;
assertDeepEqual(readContext(memory, context), { parent, current }, "context payload");
assertSame(parentOfContext(memory, context), parent, "context parent");
assertSame(currentOfContext(memory, context), current, "context current");
assertSame(currentOfContext(memory, otherContext), otherCurrent, "no ambient context stack");
assertSame(memory.linkCount, beforeContextReads, "context reads must not materialize");

const ordinary = memory.ensure(ordinaryLeft, ordinaryRight);
expectStateError(() => readContext(memory, ordinary), "invalid-context");
const foreignMemory = new Memory();
const foreignParent = foreignMemory.ensureStartSelfClosed(foreignMemory.root);
const foreignCurrent = foreignMemory.ensureEndSelfClosed(foreignMemory.root);
const foreignContext = defineContext(foreignMemory, foreignParent, foreignCurrent);
expectStateError(() => readContext(memory, foreignContext), "invalid-context");

const fallback = localRepresentativeResolution(memory, context, member);
assertSame(fallback.member, member, "fallback member");
assertSame(fallback.representative, member, "missing binding falls back to member");
assertDeepEqual(fallback.bindings, [], "fallback has no binding evidence");
assertSame(localRepresentative(memory, context, member), member, "fallback convenience reader");

const bindingOne = defineLocalRepresentativeBinding(
  memory,
  context,
  member,
  representativeOne,
);
const repeatedBinding = defineLocalRepresentativeBinding(
  memory,
  context,
  member,
  representativeOne,
);
assertSame(repeatedBinding, bindingOne, "same representative binding must be canonical");

const unrelatedBinding = defineLocalRepresentativeBinding(
  memory,
  context,
  otherMember,
  otherRepresentative,
);
assert(unrelatedBinding !== bindingOne, "unrelated binding must remain distinct");

const probe = new IndexedContextProbe(memory);
const resolved = localRepresentativeResolution(probe, context, member);
assertSame(probe.outgoingCalls, 1, "resolution must use one indexed outgoing(context) query");
assertSame(resolved.member, member, "resolved member");
assertSame(resolved.representative, representativeOne, "resolved representative");
assertDeepEqual(resolved.bindings, [bindingOne], "exact matching binding evidence");
assertSame(localRepresentative(memory, context, member), representativeOne, "representative convenience reader");

// Topology elsewhere in Memory must not affect the indexed context-local result.
let noise = otherRepresentative;
for (let index = 0; index < 40; index += 1) {
  noise = memory.ensureStartSelfClosed(noise);
}
const beforeResolutionReads = memory.linkCount;
const stillResolved = localRepresentativeResolution(memory, context, member);
assertSame(stillResolved.representative, representativeOne, "unrelated topology is irrelevant");
assertDeepEqual(stillResolved.bindings, [bindingOne], "unrelated topology does not add bindings");
assertSame(memory.linkCount, beforeResolutionReads, "representative reads must not materialize");

defineLocalRepresentativeBinding(memory, context, member, representativeTwo);
expectStateError(
  () => localRepresentativeResolution(memory, context, member),
  "representative-conflict",
);
