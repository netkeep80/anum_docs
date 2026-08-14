const handleBrand: unique symbol = Symbol("mts.link.handle");

export interface LinkHandle {
  readonly [handleBrand]: true;
}

interface InternalHandle extends LinkHandle {
  readonly slot: number;
  readonly owner: symbol;
}

export interface LinkPoles {
  readonly start: LinkHandle;
  readonly end: LinkHandle;
}

export interface ReadMemory {
  readonly root: LinkHandle;
  readonly linkCount: number;
  poles(link: LinkHandle): LinkPoles;
  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined;
  outgoing(start: LinkHandle): readonly LinkHandle[];
  incoming(end: LinkHandle): readonly LinkHandle[];
}

/**
 * Narrow opt-in capability for operations whose accepted result is the whole
 * selected memory (for example an explicit all-links wildcard). Ordinary
 * replay/checkers should continue to depend on ReadMemory only.
 */
export interface EnumerableReadMemory extends ReadMemory {
  allLinks(): readonly LinkHandle[];
}

export interface WriteMemory extends ReadMemory {
  ensureRoot(): LinkHandle;
  ensureStartSelfClosed(end: LinkHandle): LinkHandle;
  ensureEndSelfClosed(start: LinkHandle): LinkHandle;
  ensure(start: LinkHandle, end: LinkHandle): LinkHandle;
}

export interface RootBasis {
  readonly R: LinkHandle;
  readonly O: LinkHandle;
  readonly C: LinkHandle;
  readonly L: LinkHandle;
  readonly U: LinkHandle;
}

export class MemoryError extends Error {
  override readonly name = "MemoryError";
}

export class Memory implements WriteMemory, EnumerableReadMemory {
  private readonly owner = Symbol("mts.memory.owner");
  private readonly handles: InternalHandle[] = [];
  private readonly links: LinkPoles[] = [];
  private readonly byPair = new Map<string, InternalHandle>();
  private readonly outgoingIndex = new Map<InternalHandle, Set<InternalHandle>>();
  private readonly incomingIndex = new Map<InternalHandle, Set<InternalHandle>>();
  private readonly startSelfClosed = new Map<InternalHandle, InternalHandle>();
  private readonly endSelfClosed = new Map<InternalHandle, InternalHandle>();

  constructor() {
    this.ensureRoot();
  }

  get root(): LinkHandle {
    const root = this.handles[0];
    if (root === undefined) {
      throw new MemoryError("root is not initialized");
    }
    return root;
  }

  get linkCount(): number {
    return this.links.length;
  }

  ensureRoot(): LinkHandle {
    const existing = this.handles[0];
    if (existing !== undefined) {
      return existing;
    }

    const root = this.allocateHandle();
    this.insert(root, root, root);
    return root;
  }

  ensureStartSelfClosed(end: LinkHandle): LinkHandle {
    const canonicalEnd = this.requireHandle(end);
    const existing = this.startSelfClosed.get(canonicalEnd);
    if (existing !== undefined) {
      return existing;
    }

    const created = this.allocateHandle();
    this.insert(created, created, canonicalEnd);
    this.startSelfClosed.set(canonicalEnd, created);
    return created;
  }

  ensureEndSelfClosed(start: LinkHandle): LinkHandle {
    const canonicalStart = this.requireHandle(start);
    const existing = this.endSelfClosed.get(canonicalStart);
    if (existing !== undefined) {
      return existing;
    }

    const created = this.allocateHandle();
    this.insert(created, canonicalStart, created);
    this.endSelfClosed.set(canonicalStart, created);
    return created;
  }

  ensure(start: LinkHandle, end: LinkHandle): LinkHandle {
    const canonicalStart = this.requireHandle(start);
    const canonicalEnd = this.requireHandle(end);
    const key = this.pairKey(canonicalStart, canonicalEnd);
    const existing = this.byPair.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const created = this.allocateHandle();
    this.insert(created, canonicalStart, canonicalEnd);
    return created;
  }

  poles(link: LinkHandle): LinkPoles {
    const canonical = this.requireHandle(link);
    const poles = this.links[canonical.slot];
    if (poles === undefined) {
      throw new MemoryError("known Link handle has no poles");
    }
    return poles;
  }

  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    const canonicalStart = this.requireHandle(start);
    const canonicalEnd = this.requireHandle(end);
    return this.byPair.get(this.pairKey(canonicalStart, canonicalEnd));
  }

  outgoing(start: LinkHandle): readonly LinkHandle[] {
    const canonicalStart = this.requireHandle(start);
    return [...(this.outgoingIndex.get(canonicalStart) ?? [])];
  }

  incoming(end: LinkHandle): readonly LinkHandle[] {
    const canonicalEnd = this.requireHandle(end);
    return [...(this.incomingIndex.get(canonicalEnd) ?? [])];
  }

  allLinks(): readonly LinkHandle[] {
    // Return a frozen copy: enumeration exposes issued handles, never the
    // mutable registry itself. Allocation order is iteration order only.
    return Object.freeze([...this.handles]);
  }

  private allocateHandle(): InternalHandle {
    const handle = Object.freeze({
      [handleBrand]: true as const,
      slot: this.handles.length,
      owner: this.owner,
    }) as InternalHandle;
    this.handles.push(handle);
    return handle;
  }

  private insert(
    link: InternalHandle,
    start: InternalHandle,
    end: InternalHandle,
  ): void {
    if (link.slot !== this.links.length) {
      throw new MemoryError("Link allocation is not append-only");
    }

    const key = this.pairKey(start, end);
    if (this.byPair.has(key)) {
      throw new MemoryError("duplicate semantic ordered pair");
    }

    this.links.push(Object.freeze({ start, end }));
    this.byPair.set(key, link);
    this.index(this.outgoingIndex, start, link);
    this.index(this.incomingIndex, end, link);
  }

  private requireHandle(handle: LinkHandle): InternalHandle {
    if (typeof handle !== "object" || handle === null) {
      throw new MemoryError("invalid Link handle");
    }

    const candidate = handle as Partial<InternalHandle>;
    if (
      candidate.owner !== this.owner ||
      candidate.slot === undefined ||
      !Number.isInteger(candidate.slot) ||
      candidate.slot < 0 ||
      this.handles[candidate.slot] !== handle
    ) {
      throw new MemoryError("foreign or forged Link handle");
    }
    return handle as InternalHandle;
  }

  private pairKey(start: InternalHandle, end: InternalHandle): string {
    return `${start.slot}:${end.slot}`;
  }

  private index(
    index: Map<InternalHandle, Set<InternalHandle>>,
    pole: InternalHandle,
    link: InternalHandle,
  ): void {
    let links = index.get(pole);
    if (links === undefined) {
      links = new Set<InternalHandle>();
      index.set(pole, links);
    }
    links.add(link);
  }
}

export function ensureRootBasis(memory: WriteMemory): RootBasis {
  const R = memory.ensureRoot();
  const O = memory.ensureStartSelfClosed(R);
  const C = memory.ensureEndSelfClosed(R);
  const L = memory.ensure(O, C);
  const U = memory.ensure(C, O);
  return Object.freeze({ R, O, C, L, U });
}
