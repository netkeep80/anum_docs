import {
  InterpreterReplayError,
  replayEqualityEvaluation,
  type EqualityReplayEvidence,
  type EqualityRoles,
} from "../src/interpreter.js";
import {
  defineContext,
  defineLocalRepresentativeBinding,
  localRepresentative,
} from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
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

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

class ReadProbe implements ReadMemory {
  outgoingCalls = 0;

  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("equality replay must not use find"); }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.outgoingCalls += 1;
    return this.source.outgoing(start);
  }
  incoming(): readonly LinkHandle[] { throw new Error("equality replay must not use incoming"); }
}

interface Harness {
  readonly memory: Memory;
  readonly roles: EqualityRoles;
  readonly interpreter: LinkHandle;
  readonly roleDictionary: LinkHandle;
  evaluate(
    context: LinkHandle,
    left: LinkHandle,
    right: LinkHandle,
    leftRepresentative: LinkHandle,
    rightRepresentative: LinkHandle,
    readMemory?: ReadMemory,
  ): boolean;
}

function makeHarness(): Harness {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  const interpreter = memory.ensure(basis.L, basis.U);
  const roleDictionary = memory.ensure(basis.U, basis.L);
  const roles: EqualityRoles = Object.freeze({
    context: memory.ensure(basis.O, basis.O),
    left: memory.ensure(basis.O, basis.C),
    right: memory.ensure(basis.C, basis.O),
    leftRepresentative: memory.ensure(basis.L, basis.L),
    rightRepresentative: memory.ensure(basis.U, basis.U),
  });

  function evaluate(
    context: LinkHandle,
    left: LinkHandle,
    right: LinkHandle,
    leftRepresentative: LinkHandle,
    rightRepresentative: LinkHandle,
    readMemory: ReadMemory = memory,
  ): boolean {
    const act = defineActHeader(memory, interpreter, roleDictionary, context);
    for (const [role, value] of [
      [roles.context, context],
      [roles.left, left],
      [roles.right, right],
      [roles.leftRepresentative, leftRepresentative],
      [roles.rightRepresentative, rightRepresentative],
    ] as const) {
      defineActField(memory, act, role, value);
    }
    const evidence: EqualityReplayEvidence = Object.freeze({
      act, roles, interpreter, roleDictionary,
    });
    return replayEqualityEvaluation(readMemory, evidence);
  }

  return { memory, roles, interpreter, roleDictionary, evaluate };
}

// Eq_K is contextual: the same two references can be equal in one explicit K
// and unequal in another without changing either semantic Link.
{
  const h = makeHarness();
  const { memory } = h;
  const basis = ensureRootBasis(memory);
  const X = memory.ensure(basis.O, basis.L);
  const Y = memory.ensure(basis.C, basis.U);
  const representative = memory.ensure(basis.L, basis.O);
  const otherRepresentative = memory.ensure(basis.U, basis.C);

  const outer = defineContext(memory, basis.R, basis.O);
  const inner = defineContext(memory, outer, basis.C);

  defineLocalRepresentativeBinding(memory, outer, X, representative);
  defineLocalRepresentativeBinding(memory, outer, Y, representative);
  defineLocalRepresentativeBinding(memory, inner, X, representative);
  defineLocalRepresentativeBinding(memory, inner, Y, otherRepresentative);

  same(localRepresentative(memory, outer, X), representative, "outer X representative");
  same(localRepresentative(memory, outer, Y), representative, "outer Y representative");
  same(localRepresentative(memory, inner, X), representative, "inner X representative");
  same(localRepresentative(memory, inner, Y), otherRepresentative, "inner Y shadows equality locally");

  same(h.evaluate(outer, X, Y, representative, representative), true,
    "same references are context-equal in outer K");
  same(h.evaluate(inner, X, Y, representative, otherRepresentative), false,
    "same references are context-unequal in inner K");

  assert(X !== Y, "context equality must not collapse the original semantic Links");
  const xp = memory.poles(X);
  const yp = memory.poles(Y);
  assert(xp.start !== yp.start || xp.end !== yp.end,
    "X/Y remain different by ordered semantic poles while Eq_K may be true");
}

// Fundamental identity by ordered poles does not depend on contextual equality.
// Reconstructing the same pair returns the same semantic Link in every context.
{
  const h = makeHarness();
  const { memory } = h;
  const basis = ensureRootBasis(memory);
  const A = memory.ensure(basis.O, basis.U);
  const X1 = memory.ensure(A, basis.C);
  const X2 = memory.ensure(A, basis.C);
  same(X2, X1, "same ordered pair is one semantic Link before any equality act");

  const K1 = defineContext(memory, basis.R, basis.L);
  const K2 = defineContext(memory, K1, basis.U);
  same(h.evaluate(K1, X1, X2, X1, X1), true, "canonical identity is equal in K1");
  same(h.evaluate(K2, X1, X2, X1, X1), true, "canonical identity is equal in K2");
  same(memory.ensure(A, basis.C), X1, "equality evaluation does not create semantic identity");
}

// One-hop locality is strict. An X->Y and Y->Z chain does not make X resolve
// to Z, and a binding in the parent context is not inherited by the child.
{
  const h = makeHarness();
  const { memory } = h;
  const basis = ensureRootBasis(memory);
  const X = memory.ensure(basis.O, basis.O);
  const Y = memory.ensure(basis.C, basis.C);
  const Z = memory.ensure(basis.L, basis.L);

  const parent = defineContext(memory, basis.R, basis.O);
  const child = defineContext(memory, parent, basis.C);

  defineLocalRepresentativeBinding(memory, parent, X, Y);
  defineLocalRepresentativeBinding(memory, parent, Y, Z);

  same(localRepresentative(memory, parent, X), Y, "parent X resolves exactly one hop");
  same(localRepresentative(memory, parent, Y), Z, "parent Y has its own one-hop binding");
  same(localRepresentative(memory, child, X), X, "child does not inherit parent representative binding");

  same(h.evaluate(parent, X, Y, Y, Z), false,
    "one-hop representatives differ; equality does not take transitive closure");
  same(h.evaluate(child, X, Y, X, Y), false,
    "unbound child references fall back to themselves");
}

// Equality is a read-only judgment over explicit structural evidence. It does
// not use find/materialization and leaves the accepted memory unchanged.
{
  const h = makeHarness();
  const { memory } = h;
  const basis = ensureRootBasis(memory);
  const X = memory.ensure(basis.O, basis.L);
  const Y = memory.ensure(basis.C, basis.U);
  const representative = memory.ensure(basis.L, basis.C);
  const context = defineContext(memory, basis.R, basis.O);
  defineLocalRepresentativeBinding(memory, context, X, representative);
  defineLocalRepresentativeBinding(memory, context, Y, representative);

  // Build evidence first; the replay itself must not mutate anything.
  const act = defineActHeader(memory, h.interpreter, h.roleDictionary, context);
  for (const [role, value] of [
    [h.roles.context, context],
    [h.roles.left, X],
    [h.roles.right, Y],
    [h.roles.leftRepresentative, representative],
    [h.roles.rightRepresentative, representative],
  ] as const) {
    defineActField(memory, act, role, value);
  }
  const evidence: EqualityReplayEvidence = Object.freeze({
    act, roles: h.roles, interpreter: h.interpreter, roleDictionary: h.roleDictionary,
  });

  const before = memory.linkCount;
  const probe = new ReadProbe(memory);
  same(replayEqualityEvaluation(probe, evidence), true, "read-only contextual equality");
  same(memory.linkCount, before, "equality replay leaves linkCount unchanged");
  assert(probe.outgoingCalls >= 2, "representative resolution is explicit indexed structural reading");
}

// A forged representative is evidence failure, not an alternate equality
// result and not an opportunity to write a missing binding.
{
  const h = makeHarness();
  const { memory } = h;
  const basis = ensureRootBasis(memory);
  const X = memory.ensure(basis.O, basis.U);
  const Y = memory.ensure(basis.C, basis.L);
  const representative = memory.ensure(basis.L, basis.O);
  const forged = memory.ensure(basis.U, basis.C);
  const context = defineContext(memory, basis.R, basis.O);
  defineLocalRepresentativeBinding(memory, context, X, representative);
  defineLocalRepresentativeBinding(memory, context, Y, representative);

  try {
    h.evaluate(context, X, Y, forged, representative);
  } catch (error) {
    assert(error instanceof InterpreterReplayError, "forged representative must reject as equality evidence");
    same(error.code, "invalid-equality-evidence", "forged representative error code");
  }
}
