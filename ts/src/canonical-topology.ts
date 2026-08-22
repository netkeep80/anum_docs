import {
  MemoryError,
  type EnumerableReadMemory,
  type LinkHandle,
} from "./memory.js";
import {
  STORAGE_TOPOLOGY_SCHEMA,
  type StorageTopologyImage,
} from "./persistence-topology.js";

export interface CanonicalTopologyExport {
  readonly topology: StorageTopologyImage;
  readonly coordinates: ReadonlyMap<LinkHandle, number>;
}

export class CanonicalTopologyError extends Error {
  override readonly name = "CanonicalTopologyError";
}

type ReadyKind = 0 | 1 | 2;

interface ReadyLink {
  readonly link: LinkHandle;
  readonly kind: ReadyKind;
  readonly first: number;
  readonly second: number;
}

function invalid(message: string): never {
  throw new CanonicalTopologyError(message);
}

function compareReady(left: ReadyLink, right: ReadyLink): number {
  return left.kind - right.kind || left.first - right.first || left.second - right.second;
}

function sameKey(left: ReadyLink, right: ReadyLink): boolean {
  return left.kind === right.kind && left.first === right.first && left.second === right.second;
}

/**
 * Produces allocation-independent coordinates for one rooted finite MTS topology.
 * The coordinate map is builder-side bookkeeping only; portable proof evidence
 * must serialize coordinates, never LinkHandle or host callbacks.
 */
export function exportCanonicalTopology(memory: EnumerableReadMemory): CanonicalTopologyExport {
  const before = memory.linkCount;
  try {
    const all = memory.allLinks();
    if (all.length !== before || new Set(all).size !== all.length || !all.includes(memory.root)) {
      invalid("enumeration does not match selected Memory");
    }

    const coordinates = new Map<LinkHandle, number>([[memory.root, 0]]);
    const links: Array<readonly [number, number]> = [Object.freeze([0, 0] as const)];
    const remaining = new Set(all.filter((link) => link !== memory.root));

    while (remaining.size > 0) {
      const ready: ReadyLink[] = [];

      for (const link of remaining) {
        const poles = memory.poles(link);
        if (poles.start === link && poles.end === link) {
          invalid("second fully self-closed Link is not canonical");
        }

        const startSelf = poles.start === link;
        const endSelf = poles.end === link;
        const start = startSelf ? undefined : coordinates.get(poles.start);
        const end = endSelf ? undefined : coordinates.get(poles.end);

        if (startSelf && end !== undefined) {
          ready.push({ link, kind: 0, first: end, second: 0 });
        } else if (endSelf && start !== undefined) {
          ready.push({ link, kind: 1, first: start, second: 0 });
        } else if (!startSelf && !endSelf && start !== undefined && end !== undefined) {
          ready.push({ link, kind: 2, first: start, second: end });
        }
      }

      if (ready.length === 0) {
        invalid("topology is not rooted dependency-respecting MTS");
      }

      ready.sort(compareReady);
      for (let index = 1; index < ready.length; index += 1) {
        if (sameKey(ready[index - 1]!, ready[index]!)) {
          invalid("duplicate canonical structural key");
        }
      }

      // Assign one dependency-closed round atomically. A Link made ready by this
      // round is deliberately deferred to the next round, so enumeration order
      // cannot become semantic/canonical ordering authority.
      for (const item of ready) {
        const coordinate = links.length;
        coordinates.set(item.link, coordinate);
        if (item.kind === 0) {
          links.push(Object.freeze([coordinate, item.first] as const));
        } else if (item.kind === 1) {
          links.push(Object.freeze([item.first, coordinate] as const));
        } else {
          links.push(Object.freeze([item.first, item.second] as const));
        }
        remaining.delete(item.link);
      }
    }

    if (coordinates.size !== all.length || links.length !== all.length) {
      invalid("canonical topology cardinality mismatch");
    }
    if (memory.linkCount !== before) invalid("canonical topology export mutated Memory");

    return Object.freeze({
      topology: Object.freeze({
        schema: STORAGE_TOPOLOGY_SCHEMA,
        root: 0,
        links: Object.freeze(links),
      }),
      coordinates,
    });
  } catch (error) {
    if (error instanceof CanonicalTopologyError) throw error;
    if (error instanceof MemoryError) {
      throw new CanonicalTopologyError("invalid selected Memory topology");
    }
    throw error;
  } finally {
    if (memory.linkCount !== before) {
      throw new CanonicalTopologyError("canonical topology export mutated Memory");
    }
  }
}
