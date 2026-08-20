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
// Therefore member=parent and representative=current makes Pair=P and
// Binding=K. The context carrier and the local-binding carrier become the same
// semantic Link; there is no occurrence/host-call identity available to tell
// those two uses apart.
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

  // Before any explicit local-binding constructor call the context already has
  // exactly the topology K -> (parent -> current).
  const beforeBindingCall = memory.linkCount;
  const beforeResolution = localRepresentativeResolution(memory, context, parent);
  same(beforeResolution.representative, parent, "current reader treats K self-link as header-only");
  deepSame(beforeResolution.bindings, [], "no local binding is reported before constructor call");
  same(localRepresentative(memory, context, current), current, "current itself falls back to itself");
  assert(
    localRepresentative(memory, context, parent) !== localRepresentative(memory, context, current),
    "current runtime does not make Eq_K(parent,current) true from context topology alone",
  );

  const selfBinding = defineLocalRepresentativeBinding(memory, context, parent, current);
  same(selfBinding, context, "canonical self-binding collapses to K");
  same(memory.linkCount, beforeBindingCall, "explicit self-binding call creates no structural evidence");

  // Because the memory is structurally identical before/after the constructor
  // call, the reader still cannot observe the requested binding.
  const afterResolution = localRepresentativeResolution(memory, context, parent);
  same(afterResolution.representative, parent, "constructed parent->current binding is lost by reader");
  deepSame(afterResolution.bindings, [], "constructed self-binding has no reported evidence handle");

  // Add an ordinary distinct binding for the same member. The resolver sees
  // only that attachment and silently ignores the canonical self-binding K.
  const ordinaryBinding = defineLocalRepresentativeBinding(
    memory,
    context,
    parent,
    otherRepresentative,
  );
  assert(ordinaryBinding !== context, "ordinary binding must be a distinct attachment");

  const mixed = localRepresentativeResolution(memory, context, parent);
  same(mixed.representative, otherRepresentative, "self-binding is ignored in favor of distinct attachment");
  deepSame(mixed.bindings, [ordinaryBinding], "only distinct attachment is reported");

  // If K self-link were counted by RepSet_K, current and otherRepresentative
  // would be A6-distinct representatives and this exact state would be a
  // representative-conflict. Current runtime does not report that conflict.
  assert(current !== otherRepresentative, "mixed representatives are semantically distinct");
}

// H0 feasibility control: rejecting the self-colliding orientation does not
// make Eq_K(parent,current) inexpressible. A distinct reverse binding
// current->parent gives both references the same one-hop representative while
// keeping the context header out of RepSet.
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
    "Eq_K(parent,current) remains expressible without self-colliding binding",
  );
}

// Control: ordinary non-colliding local bindings keep the accepted one-hop and
// conflict behavior. #740 must not weaken that existing boundary.
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
