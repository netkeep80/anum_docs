import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  PersistenceTopologyError,
  STORAGE_TOPOLOGY_SCHEMA,
  exportTopology,
  restoreTopology,
  type StorageTopologyImage,
} from "../src/persistence-topology.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertSame<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

function assertTopologyError(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof PersistenceTopologyError, `${message}: wrong error type`);
    return;
  }
  throw new Error(`${message}: expected PersistenceTopologyError`);
}

function sameImage(left: StorageTopologyImage, right: StorageTopologyImage): boolean {
  return left.schema === right.schema &&
    left.root === right.root &&
    left.links.length === right.links.length &&
    left.links.every((pair, index) => {
      const other = right.links[index];
      return other !== undefined && pair[0] === other[0] && pair[1] === other[1];
    });
}

function semanticSignatures(source: StorageTopologyImage): readonly string[] {
  const signatures = new Map<number, string>([[source.root, "R"]]);
  const remaining = new Set<number>();
  for (let local = 0; local < source.links.length; local += 1) {
    if (local !== source.root) remaining.add(local);
  }
  while (remaining.size > 0) {
    let progressed = false;
    for (const local of [...remaining]) {
      const pair = source.links[local];
      assert(pair !== undefined, "signature pair exists");
      const [start, end] = pair;
      let signature: string | undefined;
      if (start === local) {
        const endSignature = signatures.get(end);
        if (endSignature !== undefined) signature = `S(${endSignature})`;
      } else if (end === local) {
        const startSignature = signatures.get(start);
        if (startSignature !== undefined) signature = `E(${startSignature})`;
      } else {
        const startSignature = signatures.get(start);
        const endSignature = signatures.get(end);
        if (startSignature !== undefined && endSignature !== undefined) {
          signature = `L(${startSignature},${endSignature})`;
        }
      }
      if (signature === undefined) continue;
      signatures.set(local, signature);
      remaining.delete(local);
      progressed = true;
    }
    assert(progressed, "signature topology must be rooted");
  }
  return [...signatures.values()].sort();
}

function basisWithLoop(): { memory: Memory; loop: LinkHandle } {
  const memory = new Memory();
  const { O } = ensureRootBasis(memory);
  const loop = memory.ensure(O, O);
  return { memory, loop };
}

function image(
  root: number,
  links: readonly (readonly [number, number])[],
): StorageTopologyImage {
  return {
    schema: STORAGE_TOPOLOGY_SCHEMA,
    root,
    links,
  };
}

function permute(
  source: StorageTopologyImage,
  newToOld: readonly number[],
): StorageTopologyImage {
  assert(newToOld.length === source.links.length, "permutation length");
  const oldToNew = new Map<number, number>();
  newToOld.forEach((oldCoordinate, newCoordinate) => {
    assert(!oldToNew.has(oldCoordinate), "permutation must be bijective");
    oldToNew.set(oldCoordinate, newCoordinate);
  });
  const links = newToOld.map((oldCoordinate) => {
    const pair = source.links[oldCoordinate];
    assert(pair !== undefined, "permutation coordinate must exist");
    const start = oldToNew.get(pair[0]);
    const end = oldToNew.get(pair[1]);
    assert(start !== undefined && end !== undefined, "permutation must map poles");
    return [start, end] as const;
  });
  const root = oldToNew.get(source.root);
  assert(root !== undefined, "permutation must map root");
  return image(root, links);
}

{
  const memory = new Memory();
  const before = memory.linkCount;
  const encoded = exportTopology(memory);
  assertSame(encoded.root, 0, "export assigns an image-local root coordinate");
  assertSame(encoded.links.length, 1, "fresh image has one root");
  assert(encoded.links[0]?.[0] === 0 && encoded.links[0]?.[1] === 0, "root pair");
  assertSame(memory.linkCount, before, "export must be read-only");

  const restored = restoreTopology(encoded);
  assert(restored.root !== memory.root, "rehydration must allocate fresh runtime handles");
  assert(sameImage(exportTopology(restored), encoded), "fresh round-trip topology");
}

{
  const { memory, loop } = basisWithLoop();
  const before = memory.linkCount;
  const encoded = exportTopology(memory);
  const restored = restoreTopology(encoded);
  assertSame(memory.linkCount, before, "basis export read-only");
  assertSame(restored.linkCount, memory.linkCount, "round-trip link count");
  assert(sameImage(exportTopology(restored), encoded), "basis+loop round-trip");

  const originalLinks = memory.allLinks();
  const restoredLinks = restored.allLinks();
  assert(originalLinks.every((handle) => !restoredLinks.includes(handle)), "all runtime handles reissued");

  const loopCoordinate = encoded.links.findIndex(([start, end]) => start === end && start !== encoded.root);
  assert(loopCoordinate >= 0, "ordinary loop must remain visible in image");
  assert(loop !== memory.root, "ordinary loop remains non-root semantic Link");
}

{
  const memory = new Memory();
  const { O, C, L } = ensureRootBasis(memory);
  const encoded = exportTopology(memory);
  const restored = restoreTopology(encoded);
  const restoredAgain = restoreTopology(encoded);
  const first = restored.allLinks();
  const second = restoredAgain.allLinks();
  assert(first.every((handle) => !second.includes(handle)), "same image gets fresh technical handles");

  const restoredImage = exportTopology(restored);
  const o = restored.allLinks()[1]!;
  const c = restored.allLinks()[2]!;
  assertSame(restored.ensure(o, c), restored.allLinks()[3], "same pair stays canonical after restore");
  assertSame(restored.linkCount, encoded.links.length, "same pair restore does not grow");
  assert(O !== C && L !== memory.root, "fixture must distinguish basis Links");
  assert(sameImage(restoredImage, encoded), "canonical restored image");
}

{
  const { memory } = basisWithLoop();
  const canonical = exportTopology(memory);
  const permutation = [...canonical.links.keys()].reverse();
  const renumbered = permute(canonical, permutation);
  const restored = restoreTopology(renumbered);
  const reexported = exportTopology(restored);
  assertSame(restored.linkCount, memory.linkCount, "renumbering cannot create semantic Links");
  assert(
    JSON.stringify(semanticSignatures(reexported)) === JSON.stringify(semanticSignatures(canonical)),
    "storage-coordinate renumbering must preserve structural semantics",
  );
}

{
  const restored = restoreTopology(image(2, [
    [0, 2],
    [2, 1],
    [2, 2],
  ]));
  assertSame(restored.linkCount, 3, "root plus two one-sided self closures");
  const normalized = exportTopology(restored);
  const root = normalized.root;
  const selfClosed = normalized.links.filter((pair, local) =>
    local !== root && (pair[0] === local || pair[1] === local));
  assertSame(selfClosed.length, 2, "both one-sided self closures survive");
}

{
  const malformed: unknown[] = [
    image(0, []),
    image(2, [[0, 0]]),
    image(0, [[0, 1]]),
    image(0, [[0, 0], [0, 2]]),
    { schema: STORAGE_TOPOLOGY_SCHEMA, root: true, links: [[0, 0]] },
    { schema: STORAGE_TOPOLOGY_SCHEMA, root: 0, links: [[0, false]] },
    { schema: STORAGE_TOPOLOGY_SCHEMA, root: 0, links: [[0, 0.5]] },
    { schema: "other", root: 0, links: [[0, 0]] },
  ];
  malformed.forEach((candidate, index) => assertTopologyError(
    () => restoreTopology(candidate as StorageTopologyImage),
    `malformed image ${index}`,
  ));
}

{
  assertTopologyError(
    () => restoreTopology(image(0, [[0, 0], [1, 1]])),
    "second root",
  );
  assertTopologyError(
    () => restoreTopology(image(0, [[0, 0], [1, 0], [1, 0]])),
    "duplicate semantic pair",
  );
  assertTopologyError(
    () => restoreTopology(image(0, [[0, 0], [2, 0], [1, 0]])),
    "forward id-only cycle",
  );
}
