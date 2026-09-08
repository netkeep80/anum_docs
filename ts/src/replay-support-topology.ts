import {
  CanonicalTopologyError,
  exportCanonicalTopology,
} from "./canonical-topology.js";
import {
  MemoryError,
  type EnumerableReadMemory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "./memory.js";
import type { StorageTopologyImage } from "./persistence-topology.js";

export interface ObservedReplaySupportTopology<T> {
  readonly replay: T;
  readonly topology: StorageTopologyImage;
  readonly coordinates: ReadonlyMap<LinkHandle, number>;
  /** Support Links ordered by canonical coordinate, never source allocation order. */
  readonly links: readonly LinkHandle[];
}

export class ReplaySupportTopologyError extends Error {
  override readonly name = "ReplaySupportTopologyError";
}

class TracingReadMemory implements ReadMemory {
  readonly observed = new Set<LinkHandle>();

  constructor(private readonly source: ReadMemory) {
    this.observed.add(source.root);
  }

  get root(): LinkHandle {
    return this.source.root;
  }

  get linkCount(): number {
    // Trusted replay read-only checks must observe the selected source Memory,
    // not the gradually accumulated trace cardinality.
    return this.source.linkCount;
  }

  poles(link: LinkHandle): LinkPoles {
    this.observed.add(link);
    const poles = this.source.poles(link);
    this.observed.add(poles.start);
    this.observed.add(poles.end);
    return poles;
  }

  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    this.observed.add(start);
    this.observed.add(end);
    const found = this.source.find(start, end);
    if (found !== undefined) this.observed.add(found);
    return found;
  }

  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.observed.add(start);
    const found = this.source.outgoing(start);
    for (const link of found) this.observed.add(link);
    return found;
  }

  incoming(end: LinkHandle): readonly LinkHandle[] {
    this.observed.add(end);
    const found = this.source.incoming(end);
    for (const link of found) this.observed.add(link);
    return found;
  }
}

class ReplaySupportView implements EnumerableReadMemory {
  readonly root: LinkHandle;
  private readonly ordered: readonly LinkHandle[];

  constructor(
    private readonly source: ReadMemory,
    private readonly support: ReadonlySet<LinkHandle>,
  ) {
    this.root = source.root;
    this.ordered = Object.freeze([...support]);
  }

  get linkCount(): number {
    return this.ordered.length;
  }

  private require(link: LinkHandle): void {
    if (!this.support.has(link)) {
      throw new MemoryError("Link is outside observed replay support");
    }
  }

  poles(link: LinkHandle): LinkPoles {
    this.require(link);
    const poles = this.source.poles(link);
    if (!this.support.has(poles.start) || !this.support.has(poles.end)) {
      throw new MemoryError("observed replay support is not pole-closed");
    }
    return poles;
  }

  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    this.require(start);
    this.require(end);
    const found = this.source.find(start, end);
    return found !== undefined && this.support.has(found) ? found : undefined;
  }

  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.require(start);
    return Object.freeze(this.source.outgoing(start).filter((link) => this.support.has(link)));
  }

  incoming(end: LinkHandle): readonly LinkHandle[] {
    this.require(end);
    return Object.freeze(this.source.incoming(end).filter((link) => this.support.has(link)));
  }

  allLinks(): readonly LinkHandle[] {
    return this.ordered;
  }
}

function includePoleClosure(
  memory: ReadMemory,
  support: Set<LinkHandle>,
): void {
  const pending = [...support];
  while (pending.length > 0) {
    const link = pending.pop();
    if (link === undefined) continue;
    const poles = memory.poles(link);
    for (const pole of [poles.start, poles.end]) {
      if (support.has(pole)) continue;
      support.add(pole);
      pending.push(pole);
    }
  }
}

/**
 * Executes one already-trusted read-only replay through an observing ReadMemory,
 * then canonicalizes exactly the Link surface that replay actually read plus its
 * pole closure. This helper knows no proof grammar and grants no proof authority.
 */
export function exportObservedReplaySupportTopology<T>(
  memory: ReadMemory,
  replay: (observedMemory: ReadMemory) => T,
): ObservedReplaySupportTopology<T> {
  const before = memory.linkCount;
  try {
    const observedMemory = new TracingReadMemory(memory);
    const replayResult = replay(observedMemory);
    if (memory.linkCount !== before) {
      throw new ReplaySupportTopologyError("trusted replay mutated Memory");
    }

    const support = new Set(observedMemory.observed);
    support.add(memory.root);
    includePoleClosure(memory, support);

    const canonical = exportCanonicalTopology(new ReplaySupportView(memory, support));
    const links = Object.freeze(
      [...canonical.coordinates.entries()]
        .sort((left, right) => left[1] - right[1])
        .map(([link]) => link),
    );

    if (links.length !== support.size || canonical.coordinates.size !== support.size) {
      throw new ReplaySupportTopologyError("observed replay support cardinality mismatch");
    }
    if (memory.linkCount !== before) {
      throw new ReplaySupportTopologyError("support export mutated Memory");
    }

    return Object.freeze({
      replay: replayResult,
      topology: canonical.topology,
      coordinates: canonical.coordinates,
      links,
    });
  } catch (error) {
    if (error instanceof ReplaySupportTopologyError) throw error;
    if (error instanceof CanonicalTopologyError || error instanceof MemoryError) {
      throw new ReplaySupportTopologyError("invalid observed replay support");
    }
    throw error;
  } finally {
    if (memory.linkCount !== before) {
      throw new ReplaySupportTopologyError("support export mutated Memory");
    }
  }
}
