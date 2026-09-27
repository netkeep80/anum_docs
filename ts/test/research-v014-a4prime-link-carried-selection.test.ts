// mts-version-evidence: candidate-from=0.14
// research-owner: #1669

import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, type LinkHandle } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 N20 link-carried orientation selection: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}

type Frame = "DIRECT" | "MIRROR" | "UNRESOLVED";

function discoverRootNeighbourOrbit(memory: Memory, R: LinkHandle): readonly LinkHandle[] {
  const out: LinkHandle[] = [];
  for (const link of memory.allLinks()) {
    if (link === R) continue;
    const p = memory.poles(link);
    if ((p.start === link && p.end === R) || (p.start === R && p.end === link)) out.push(link);
  }
  assert(new Set(out).size === 2, "root-neighbour orbit has two members");
  return Object.freeze([...new Set(out)]);
}

function complementaryRootAdjacency(memory: Memory, R: LinkHandle, neighbour: LinkHandle): LinkHandle {
  const p = memory.poles(neighbour);
  if (p.start === neighbour && p.end === R) return memory.ensure(R, neighbour);
  if (p.start === R && p.end === neighbour) return memory.ensure(neighbour, R);
  throw new Error("v0.14 N20 link-carried orientation selection: invalid root neighbour");
}

function discoverWitnessOrbit(memory: Memory, R: LinkHandle): readonly LinkHandle[] {
  const orbit = discoverRootNeighbourOrbit(memory, R).map((n) => complementaryRootAdjacency(memory, R, n));
  assert(new Set(orbit).size === 2, "witness orbit has two members");
  return Object.freeze(orbit);
}

function deriveFrameFromFoundationCarrier(
  memory: Memory,
  R: LinkHandle,
  witnessOrbit: readonly LinkHandle[],
  foundationSelectionCarrier: LinkHandle,
): Frame {
  const selected = readExactSequence(memory, foundationSelectionCarrier).values;
  const unique = [...new Set(selected)];
  if (unique.length !== 1) return "UNRESOLVED";
  const W = unique[0]!;
  if (!witnessOrbit.includes(W)) return "UNRESOLVED";

  const p = memory.poles(W);
  if (p.end === R && p.start !== R) return "DIRECT";
  if (p.start === R && p.end !== R) return "MIRROR";
  return "UNRESOLVED";
}

function exercise(reverseBootstrap: boolean): void {
  const memory = new Memory();
  const R = memory.root;
  if (reverseBootstrap) {
    memory.ensureEndSelfClosed(R);
    memory.ensureStartSelfClosed(R);
  } else {
    memory.ensureStartSelfClosed(R);
    memory.ensureEndSelfClosed(R);
  }

  const orbit = discoverWitnessOrbit(memory, R);
  same(orbit.length, 2, "two chiral witnesses");

  const none = materializeExactSequence(memory, []);
  same(deriveFrameFromFoundationCarrier(memory, R, orbit, none), "UNRESOLVED", "zero selected witnesses");

  const both = materializeExactSequence(memory, orbit);
  same(deriveFrameFromFoundationCarrier(memory, R, orbit, both), "UNRESOLVED", "two selected witnesses");

  const unrelated = memory.ensure(orbit[0]!, orbit[1]!);
  const unrelatedCarrier = materializeExactSequence(memory, [unrelated]);
  same(
    deriveFrameFromFoundationCarrier(memory, R, orbit, unrelatedCarrier),
    "UNRESOLVED",
    "unrelated selected Link",
  );

  const firstCarrier = materializeExactSequence(memory, [orbit[0]!]);
  const secondCarrier = materializeExactSequence(memory, [orbit[1]!]);
  const first = deriveFrameFromFoundationCarrier(memory, R, orbit, firstCarrier);
  const second = deriveFrameFromFoundationCarrier(memory, R, orbit, secondCarrier);
  assert(first !== "UNRESOLVED" && second !== "UNRESOLVED", "one orbit member resolves a frame");
  assert(first !== second, "the two chiral witnesses resolve opposite frames");

  const duplicateCarrier = materializeExactSequence(memory, [orbit[0]!, orbit[0]!]);
  same(
    deriveFrameFromFoundationCarrier(memory, R, orbit, duplicateCarrier),
    first,
    "duplicate occurrence of same witness is one semantic selection",
  );
}

exercise(false);
exercise(true);

console.log([
  "MTS v0.14 N20: LINK_CARRIED_ORIENTATION_SELECTION=GREEN",
  "FOUNDATION_SELECTION_AUTHORITY=EXACT_SEQUENCE_OF_LINKS",
  "HOST_SELECTED_WITNESS_ARGUMENT_AUTHORITY=FALSE",
  "RAW_WITNESS_PRESENCE_AUTHORITY=FALSE",
  "ZERO_OR_TWO_DISTINCT_W=UNRESOLVED",
  "ONE_DISTINCT_W=RESOLVED",
  "TECHNICAL_BOOTSTRAP_ORDER_AUTHORITY=FALSE",
].join(" "));
