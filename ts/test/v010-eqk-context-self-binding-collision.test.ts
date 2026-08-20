import {
  StateError,
  defineContext,
  defineLocalRepresentativeBinding,
  localRepresentative,
  localRepresentativeResolution,
} from "../src/state.js";
import { Memory, type LinkHandle } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function deepSame(actual: unknown, expected: unknown, message: string): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
  );
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

function expectStateError(effect: () => unknown, code: StateError["code"]): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StateError, `expected StateError, got ${String(error)}`);
    same(error.code, code, "state error code");
    return;
  }
  throw new Error(`expected StateError(${code})`);
}

// #740 exact PAIR collision:
//
//   P = parent -> current
//   K = START(P) = K -> P
//
// Local representative evidence uses:
//
//   Pair    = member -> representative
//   Binding = K -> Pair
//
// member=parent and representative=current makes Pair=P and raw Binding=K.
// K is already the context header, so the canonical network contains no
// separate attachment that could witness a local-binding use-role.
{
  const memory = new Memory();
  const [parent, current, otherRepresentative] = anchors(memory, 3);
  assert(parent && current && otherRepresentative, "fixture anchors");
  assert(parent !== current && current !== otherRepresentative, "fixture values must differ");

  const payload = memory.ensure(parent, current);
  const context = defineContext(memory, parent, current);
  const contextPoles = memory.poles(context);
  same(contextPoles.start, context, "K is START(payload)");
  same(contextPoles.end, payload, "K payload is parent->current");

  // The raw ordered pair K->P is already K itself. This proves the collision
  // without assigning semantic meaning to a host constructor invocation.
  const beforeRawCollision = memory.linkCount;
  const rawSelfAttachment = memory.ensure(context, payload);
  same(rawSelfAttachment, context, "raw K->payload canonicalizes to K");
  same(memory.linkCount, beforeRawCollision, "raw collision creates no occurrence");

  // Context topology alone is header evidence, not an implicit Eq_K binding.
  const beforeResolution = localRepresentativeResolution(memory, context, parent);
  same(beforeResolution.representative, parent, "K self-link remains header-only");
  deepSame(beforeResolution.bindings, [], "context header is not reported as local binding");
  same(localRepresentative(memory, context, current), current, "current itself falls back to itself");
  assert(
    localRepresentative(memory, context, parent) !== localRepresentative(memory, context, current),
    "context existence alone must not imply Eq_K(parent,current)",
  );

  // The constructor must fail closed. Returning K would falsely report success
  // even though no distinguishable local-binding evidence was added.
  const beforeRejectedBinding = memory.linkCount;
  expectStateError(
    () => defineLocalRepresentativeBinding(memory, context, parent, current),
    "invalid-representative-binding",
  );
  same(memory.linkCount, beforeRejectedBinding, "rejected self-binding adds no Link");

  const afterRejected = localRepresentativeResolution(memory, context, parent);
  same(afterRejected.representative, parent, "rejection preserves fallback representative");
  deepSame(afterRejected.bindings, [], "rejection does not invent binding evidence");

  // A normal distinct attachment for the same member remains valid and is not
  // confused with the context header.
  const ordinaryBinding = defineLocalRepresentativeBinding(
    memory,
    context,
    parent,
    otherRepresentative,
  );
  assert(ordinaryBinding !== context, "ordinary binding must be a distinct attachment");
  const ordinary = localRepresentativeResolution(memory, context, parent);
  same(ordinary.representative, otherRepresentative, "ordinary binding still resolves");
  deepSame(ordinary.bindings, [ordinaryBinding], "ordinary binding evidence is preserved");
}

// Rejecting the colliding orientation does not make Eq_K(parent,current)=true
// inexpressible. A distinct reverse binding current->parent gives both
// references the same one-hop representative while K remains header-only.
{
  const memory = new Memory();
  const [parent, current] = anchors(memory, 2);
  assert(parent && current && parent !== current, "reverse-binding anchors");

  const context = defineContext(memory, parent, current);
  const reverseBinding = defineLocalRepresentativeBinding(memory, context, current, parent);
  assert(reverseBinding !== context, "reverse binding is a distinct attachment");
  same(localRepresentative(memory, context, parent), parent, "parent remains fallback representative");
  same(localRepresentative(memory, context, current), parent, "current resolves one hop to parent");
  same(
    localRepresentative(memory, context, parent),
    localRepresentative(memory, context, current),
    "Eq_K(parent,current) remains expressible through distinct evidence",
  );
}

// Ordinary non-colliding local bindings keep the accepted one-hop/conflict
// behavior from #726/#727.
{
  const memory = new Memory();
  const [parent, current, member, representativeA, representativeB] = anchors(memory, 5);
  assert(parent && current && member && representativeA && representativeB, "control anchors");

  const context = defineContext(memory, parent, current);
  const bindingA = defineLocalRepresentativeBinding(memory, context, member, representativeA);
  assert(bindingA !== context, "control binding is distinct from K");
  same(localRepresentative(memory, context, member), representativeA, "ordinary binding round-trip");

  defineLocalRepresentativeBinding(memory, context, member, representativeB);
  expectStateError(
    () => localRepresentativeResolution(memory, context, member),
    "representative-conflict",
  );
}
