import { exportCanonicalTopology, CanonicalTopologyError } from "../src/canonical-topology.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type EnumerableReadMemory,
  type LinkHandle,
} from "../src/memory.js";
import { exportTopology, restoreTopology } from "../src/persistence-topology.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function image(memory: Memory): string {
  return JSON.stringify(exportCanonicalTopology(memory).topology);
}

function expectCanonicalError(effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof CanonicalTopologyError, "expected CanonicalTopologyError");
    return;
  }
  throw new Error("expected canonical topology rejection");
}

function siblingFixture(reverse: boolean): Memory {
  const memory = new Memory();
  const { O, C } = ensureRootBasis(memory);
  let x: LinkHandle;
  let y: LinkHandle;
  if (reverse) {
    y = memory.ensure(C, C);
    x = memory.ensure(O, O);
  } else {
    x = memory.ensure(O, O);
    y = memory.ensure(C, C);
  }
  memory.ensure(x, y);
  return memory;
}

function layeredFixture(reverse: boolean): Memory {
  const memory = new Memory();
  const { O, C } = ensureRootBasis(memory);
  let x: LinkHandle;
  let y: LinkHandle;
  let z: LinkHandle;

  if (reverse) {
    z = memory.ensure(C, C);
    y = memory.ensure(C, O);
    x = memory.ensure(O, O);
  } else {
    x = memory.ensure(O, O);
    y = memory.ensure(C, O);
    z = memory.ensure(C, C);
  }

  let left: LinkHandle;
  let right: LinkHandle;
  if (reverse) {
    right = memory.ensure(y, z);
    left = memory.ensure(x, y);
  } else {
    left = memory.ensure(x, y);
    right = memory.ensure(y, z);
  }
  memory.ensure(left, right);
  return memory;
}

function pairOrientationFixture(reverse: boolean): Memory {
  const memory = new Memory();
  const { O, C } = ensureRootBasis(memory);
  const x = memory.ensure(O, O);
  const y = memory.ensure(C, C);
  memory.ensure(reverse ? y : x, reverse ? x : y);
  return memory;
}

function selfOrientationFixture(startSelf: boolean): Memory {
  const memory = new Memory();
  const { O } = ensureRootBasis(memory);
  const x = memory.ensure(O, O);
  if (startSelf) memory.ensureStartSelfClosed(x);
  else memory.ensureEndSelfClosed(x);
  return memory;
}

function sequenceFixture(reverse: boolean): Memory {
  const memory = new Memory();
  const { O, C } = ensureRootBasis(memory);
  const x = memory.ensure(O, O);
  const y = memory.ensure(C, C);
  materializeExactSequence(memory, reverse ? [y, x] : [x, y]);
  return memory;
}

// P6a witness: historical storage coordinates remain allocation-sensitive while
// the new canonical normalization is byte-identical for the same semantic net.
{
  const forward = siblingFixture(false);
  const reverse = siblingFixture(true);
  assert(
    JSON.stringify(exportTopology(forward)) !== JSON.stringify(exportTopology(reverse)),
    "ordinary persistence images should retain the P6a allocation-order distinction",
  );

  const beforeForward = forward.linkCount;
  const beforeReverse = reverse.linkCount;
  same(image(forward), image(reverse), "canonical sibling topology ignores allocation order");
  same(forward.linkCount, beforeForward, "forward canonical export is read-only");
  same(reverse.linkCount, beforeReverse, "reverse canonical export is read-only");
}

// Multiple independent siblings and a second dependent layer remain canonical
// without using issuance order as a tie-breaker.
{
  const forward = layeredFixture(false);
  const reverse = layeredFixture(true);
  same(image(forward), image(reverse), "layered topology canonicalizes across creation orders");
}

// Builder-side remap is complete, one-to-one, rooted at coordinate 0, and the
// normalized storage image reconstructs in a fresh Memory idempotently.
{
  const memory = layeredFixture(true);
  const before = memory.linkCount;
  const canonical = exportCanonicalTopology(memory);
  same(memory.linkCount, before, "canonical export does not write");
  same(canonical.coordinates.size, memory.linkCount, "remap covers every source Link");
  same(canonical.coordinates.get(memory.root), 0, "ROOT canonical coordinate");

  const seen = new Set<number>();
  for (const link of memory.allLinks()) {
    const coordinate = canonical.coordinates.get(link);
    assert(coordinate !== undefined, "every source Link has a canonical coordinate");
    seen.add(coordinate);
  }
  same(seen.size, memory.linkCount, "canonical coordinates are one-to-one");

  const restored = restoreTopology(canonical.topology);
  const beforeRestored = restored.linkCount;
  same(image(restored), JSON.stringify(canonical.topology), "canonical re-export is idempotent");
  same(restored.linkCount, beforeRestored, "fresh canonical re-export is read-only");
}

// Ordered Pair orientation, self-closure pole orientation, and explicitly
// materialized ExactSequence order remain semantic distinctions.
{
  assert(
    image(pairOrientationFixture(false)) !== image(pairOrientationFixture(true)),
    "Pair(X,Y) must differ from Pair(Y,X)",
  );
  assert(
    image(selfOrientationFixture(true)) !== image(selfOrientationFixture(false)),
    "START-self must differ from END-self",
  );
  assert(
    image(sequenceFixture(false)) !== image(sequenceFixture(true)),
    "ExactSequence([X,Y]) must differ from ExactSequence([Y,X])",
  );
}

// An enumerable view that omits the dependencies of one selected Link is not a
// rooted closed topology. Canonicalization fails closed rather than falling back
// to source issuance order.
{
  const source = new Memory();
  const { O } = ensureRootBasis(source);
  const orphaned = source.ensure(O, O);
  const broken: EnumerableReadMemory = {
    root: source.root,
    linkCount: 2,
    allLinks: () => Object.freeze([source.root, orphaned]),
    poles: (link) => source.poles(link),
    find: (start, end) => source.find(start, end),
    outgoing: (start) => source.outgoing(start),
    incoming: (end) => source.incoming(end),
  };
  expectCanonicalError(() => exportCanonicalTopology(broken));
}
