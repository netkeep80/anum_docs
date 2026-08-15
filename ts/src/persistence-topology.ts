import {
  Memory,
  MemoryError,
  type EnumerableReadMemory,
  type LinkHandle,
} from "./memory.js";

export const STORAGE_TOPOLOGY_SCHEMA = "mts-storage-topology/v0.1" as const;

export interface StorageTopologyImage {
  readonly schema: typeof STORAGE_TOPOLOGY_SCHEMA;
  readonly root: number;
  readonly links: readonly (readonly [number, number])[];
}

export class PersistenceTopologyError extends Error {
  override readonly name = "PersistenceTopologyError";
}

function invalid(message: string): never {
  throw new PersistenceTopologyError(message);
}

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function exportTopology(memory: EnumerableReadMemory): StorageTopologyImage {
  const before = memory.linkCount;
  try {
    const all = memory.allLinks();
    if (all.length !== before || new Set(all).size !== all.length || !all.includes(memory.root)) {
      invalid("enumeration does not match selected Memory");
    }

    const coordinates = new Map<LinkHandle, number>();
    const links: Array<readonly [number, number]> = [];
    coordinates.set(memory.root, 0);
    links.push(Object.freeze([0, 0] as const));

    const remaining = new Set(all.filter((link) => link !== memory.root));
    while (remaining.size > 0) {
      let progressed = false;
      for (const link of [...remaining]) {
        const poles = memory.poles(link);
        if (poles.start === link && poles.end === link) {
          invalid("second fully self-closed Link is not canonical");
        }

        const startSelf = poles.start === link;
        const endSelf = poles.end === link;
        const startCoordinate = startSelf ? undefined : coordinates.get(poles.start);
        const endCoordinate = endSelf ? undefined : coordinates.get(poles.end);
        const ready =
          (startSelf && endCoordinate !== undefined) ||
          (endSelf && startCoordinate !== undefined) ||
          (startCoordinate !== undefined && endCoordinate !== undefined);
        if (!ready) continue;

        const coordinate = links.length;
        coordinates.set(link, coordinate);
        links.push(Object.freeze([
          startSelf ? coordinate : startCoordinate!,
          endSelf ? coordinate : endCoordinate!,
        ] as const));
        remaining.delete(link);
        progressed = true;
      }
      if (!progressed) {
        invalid("topology is not rooted dependency-respecting MTS");
      }
    }

    if (memory.linkCount !== before) invalid("topology export mutated Memory");
    return Object.freeze({
      schema: STORAGE_TOPOLOGY_SCHEMA,
      root: 0,
      links: Object.freeze(links),
    });
  } catch (error) {
    if (error instanceof PersistenceTopologyError) throw error;
    if (error instanceof MemoryError) {
      throw new PersistenceTopologyError("invalid selected Memory topology");
    }
    throw error;
  } finally {
    if (memory.linkCount !== before) {
      throw new PersistenceTopologyError("topology export mutated Memory");
    }
  }
}

export function restoreTopology(image: StorageTopologyImage): Memory {
  validateImageShape(image);
  const links = image.links;
  const rootPair = links[image.root]!;
  if (rootPair[0] !== image.root || rootPair[1] !== image.root) {
    invalid("storage root is not fully self-closed");
  }

  for (let local = 0; local < links.length; local += 1) {
    const [start, end] = links[local]!;
    if (local !== image.root && start === local && end === local) {
      invalid("storage image contains a second fully self-closed root");
    }
  }

  const memory = new Memory();
  const refs = new Map<number, LinkHandle>([[image.root, memory.root]]);
  const semanticOwners = new Map<LinkHandle, number>([[memory.root, image.root]]);
  const remaining = new Set<number>();
  for (let local = 0; local < links.length; local += 1) {
    if (local !== image.root) remaining.add(local);
  }

  while (remaining.size > 0) {
    let progressed = false;
    for (const local of [...remaining]) {
      const [start, end] = links[local]!;
      const startSelf = start === local;
      const endSelf = end === local;
      let ref: LinkHandle | undefined;

      if (startSelf && endSelf) invalid("storage image contains a second root");
      if (startSelf) {
        const knownEnd = refs.get(end);
        if (knownEnd === undefined) continue;
        ref = memory.ensureStartSelfClosed(knownEnd);
      } else if (endSelf) {
        const knownStart = refs.get(start);
        if (knownStart === undefined) continue;
        ref = memory.ensureEndSelfClosed(knownStart);
      } else {
        const knownStart = refs.get(start);
        const knownEnd = refs.get(end);
        if (knownStart === undefined || knownEnd === undefined) continue;
        ref = memory.ensure(knownStart, knownEnd);
      }

      const previousOwner = semanticOwners.get(ref);
      if (previousOwner !== undefined && previousOwner !== local) {
        invalid("storage coordinates duplicate one semantic Link");
      }
      refs.set(local, ref);
      semanticOwners.set(ref, local);
      remaining.delete(local);
      progressed = true;
    }
    if (!progressed) {
      invalid("storage topology contains an unrooted or forward ID-only cycle");
    }
  }

  if (memory.linkCount !== links.length) {
    invalid("storage image does not map one-to-one to canonical Links");
  }
  return memory;
}

function validateImageShape(image: StorageTopologyImage): void {
  if (typeof image !== "object" || image === null) invalid("invalid storage topology image");
  const candidate = image as Partial<StorageTopologyImage>;
  if (candidate.schema !== STORAGE_TOPOLOGY_SCHEMA) invalid("unsupported storage topology schema");
  if (!isCoordinate(candidate.root)) invalid("invalid storage root coordinate");
  if (!Array.isArray(candidate.links) || candidate.links.length === 0) {
    invalid("storage topology must contain at least the root");
  }
  if (candidate.root >= candidate.links.length) invalid("storage root coordinate is out of range");

  candidate.links.forEach((pair, local) => {
    if (!Array.isArray(pair) || pair.length !== 2) invalid("invalid storage link pair");
    const start = pair[0];
    const end = pair[1];
    if (!isCoordinate(start) || !isCoordinate(end)) invalid("invalid storage endpoint coordinate");
    if (start >= candidate.links!.length || end >= candidate.links!.length) {
      invalid(`storage endpoint is out of range at ${local}`);
    }
  });
}
