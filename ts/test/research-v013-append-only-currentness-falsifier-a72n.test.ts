import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A72n append-only currentness falsifier: " + m);
}

function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}

class CurrentBindingError extends Error {
  override readonly name = "CurrentBindingError";

  constructor(readonly code: "missing-current" | "ambiguous-current") {
    super(code);
  }
}

/**
 * Candidate direct encoding:
 *
 *   CURRENT -> Scope
 *
 * This intentionally uses only ordinary Links and no timestamp, END marker,
 * sequence, generation number or host cursor.
 */
function currentScopeBindings(
  memory: Memory,
  currentMarker: LinkHandle,
): readonly LinkHandle[] {
  const bindings: LinkHandle[] = [];

  for (const candidate of memory.outgoing(currentMarker)) {
    const poles = memory.poles(candidate);
    if (poles.start !== currentMarker) continue;
    bindings.push(candidate);
  }

  return Object.freeze(bindings);
}

function readUniqueCurrentScope(
  memory: Memory,
  currentMarker: LinkHandle,
): LinkHandle {
  const bindings = currentScopeBindings(memory, currentMarker);

  if (bindings.length === 0) {
    throw new CurrentBindingError("missing-current");
  }
  if (bindings.length !== 1) {
    throw new CurrentBindingError("ambiguous-current");
  }

  return memory.poles(bindings[0]!).end;
}

function expectAmbiguous(
  action: () => unknown,
  message: string,
): void {
  try {
    action();
    throw new Error("expected ambiguous-current");
  } catch (error) {
    assert(error instanceof CurrentBindingError, message + ": error type");
    same(error.code, "ambiguous-current", message + ": exact error");
  }
}

/**
 * An explicitly stronger reader can treat END(oldBinding) as a tombstone.
 *
 * A72n does NOT propose this as the solution. It demonstrates that resolving
 * append-only ambiguity this way requires extra lifecycle semantics and leaves
 * a history/tombstone object in the carrier.
 */
function readCurrentWithEndTombstones(
  memory: Memory,
  currentMarker: LinkHandle,
  endedBindings: readonly LinkHandle[],
): LinkHandle {
  const alive = currentScopeBindings(memory, currentMarker)
    .filter((binding) => !endedBindings.includes(binding));

  assert(alive.length === 1,
    "tombstone reader requires exactly one non-ended binding");
  return memory.poles(alive[0]!).end;
}

function exercise(): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];
  for (let i = 0; i < 20; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }
  const at = (i: number): LinkHandle => {
    const value = fresh[i];
    assert(value !== undefined, "fresh anchor " + i);
    return value;
  };

  const currentMarker = memory.ensure(at(0), at(1));
  const scope0 = memory.ensureStartSelfClosed(at(2));
  const scope1 = memory.ensureStartSelfClosed(at(3));

  // Initial currentness is unambiguous.
  const binding0 = memory.ensure(currentMarker, scope0);
  same(currentScopeBindings(memory, currentMarker).length, 1,
    "one direct CURRENT binding initially");
  same(readUniqueCurrentScope(memory, currentMarker), scope0,
    "scope0 initially current");

  const countAfterFirstBinding = memory.linkCount;

  // Candidate "mutation" by append-only ensure.
  const binding1 = memory.ensure(currentMarker, scope1);

  assert(binding1 !== binding0,
    "different Scope necessarily gives a different canonical Link");
  same(memory.linkCount, countAfterFirstBinding + 1,
    "append-only update adds a second binding instead of replacing the first");
  same(currentScopeBindings(memory, currentMarker).length, 2,
    "CURRENT now has two equally shaped bindings");

  expectAmbiguous(
    () => readUniqueCurrentScope(memory, currentMarker),
    "plain Link topology cannot choose the newer current Scope",
  );

  // Re-ensuring the new binding is only canonical replay. It does not remove
  // or mutate the old binding.
  same(memory.ensure(currentMarker, scope1), binding1,
    "re-ensure returns canonical new binding");
  same(currentScopeBindings(memory, currentMarker).length, 2,
    "canonical replay does not repair ambiguity");

  // Option A: END tombstone. This can recover a unique answer only after a
  // reader is taught explicit tombstone semantics.
  const endOld = memory.ensureEndSelfClosed(binding0);
  same(readCurrentWithEndTombstones(memory, currentMarker, [binding0]), scope1,
    "END-aware extra semantics can select scope1");
  same(currentScopeBindings(memory, currentMarker).length, 2,
    "raw CURRENT topology remains ambiguous after END tombstone");
  assert(memory.poles(endOld).start === binding0,
    "END tombstone permanently references old binding");

  // Option B: explicit ordering/history edge. It does not remove either
  // binding; it merely adds another fact from which a special reader could
  // define 'latest'.
  const order = memory.ensure(binding0, binding1);
  same(currentScopeBindings(memory, currentMarker).length, 2,
    "ordering edge leaves both current candidates present");
  const orderPoles = memory.poles(order);
  same(orderPoles.start, binding0, "order edge references old binding");
  same(orderPoles.end, binding1, "order edge references new binding");

  expectAmbiguous(
    () => readUniqueCurrentScope(memory, currentMarker),
    "plain topology remains ambiguous despite added history edge",
  );

  // The two candidate bindings are structurally symmetric with respect to the
  // CURRENT marker. LinkHandle allocation order is host/carrier history and is
  // not admitted as MTS semantic time.
  const p0 = memory.poles(binding0);
  const p1 = memory.poles(binding1);
  same(p0.start, currentMarker, "old binding has CURRENT source");
  same(p1.start, currentMarker, "new binding has CURRENT source");
  same(p0.end, scope0, "old binding points to scope0");
  same(p1.end, scope1, "new binding points to scope1");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-append-only-currentness-falsifier-a72n.test.ts"),
    "utf8",
  );

  const candidateStart = own.indexOf("function readUniqueCurrentScope(");
  const candidateEnd = own.indexOf("\nfunction expectAmbiguous(", candidateStart);
  assert(candidateStart >= 0 && candidateEnd > candidateStart,
    "plain currentness reader source slice");
  const candidate = own.slice(candidateStart, candidateEnd);

  for (const forbidden of [
    "Date",
    "timestamp",
    "generation",
    "Math.max",
    "sort(",
    "END",
    "history",
  ]) {
    assert(!candidate.includes(forbidden),
      "plain currentness reader has no hidden ordering/lifecycle semantics: " + forbidden);
  }

  const prior = readFileSync(
    join(root, "ts/test/research-v013-working-scope-reachability-a72m.test.ts"),
    "utf8",
  );
  assert(prior.includes("WORKING_STATE_AS_SCOPE_REACHABILITY=GREEN_SCOPED_RESEARCH"),
    "A72m single-current-scope baseline remains retained");
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72n: APPEND_ONLY_CURRENTNESS_FALSIFIER=GREEN_SCOPED_RESEARCH",
    "CANDIDATE=CURRENT_TO_SCOPE_DIRECT_LINK",
    "FIRST_BINDING=UNIQUE_GREEN",
    "SECOND_BINDING_REPLACES_FIRST=FALSE",
    "SECOND_BINDING_CREATES_AMBIGUITY=TRUE",
    "PLAIN_LINK_TOPOLOGY_CAN_SELECT_LATEST=FALSE",
    "LINK_HANDLE_ORDER_AS_SEMANTIC_TIME=REJECTED",
    "END_TOMBSTONE_CAN_DISAMBIGUATE_ONLY_WITH_EXTRA_LIFECYCLE_SEMANTICS=TRUE",
    "END_TOMBSTONE_LEAVES_HISTORY_OBJECT=TRUE",
    "ORDER_EDGE_CAN_DISAMBIGUATE_ONLY_WITH_EXTRA_HISTORY_SEMANTICS=TRUE",
    "ORDER_EDGE_LEAVES_HISTORY_ANCESTRY=TRUE",
    "A72M_HOST_CURRENT_SCOPE_CURSOR=STILL_REQUIRED_UNDER_CURRENT_APPEND_ONLY_CARRIER",
    "SCOPED_CONCLUSION=PLAIN_APPEND_ONLY_CURRENT_BINDING_IS_INSUFFICIENT",
    "MINIMUM_BOUNDARY=MUTABLE_CURRENTNESS_OR_EXTERNAL_ROOT_OR_EXPLICIT_LIFECYCLE_SEMANTICS",
    "PHYSICAL_DELETION_OR_MUTATION=OPEN",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
