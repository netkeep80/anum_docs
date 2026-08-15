import type { LinkHandle } from "./memory.js";
import {
  PersistentStore,
  PersistentStoreError,
  type BatchEndpoint,
  type BatchLink,
  type PersistentLinkId,
  type PersistentRuntimeView,
} from "./persistent-store.js";
import {
  materializeSequence,
  replaySequenceMaterialization,
  type MaterializedEdge,
  type SequenceDescription,
  type SequenceItem,
  type SequenceMaterializationEffect,
} from "./sequence.js";

export type PersistentSequenceItem =
  | { readonly kind: "atom"; readonly value: PersistentLinkId }
  | { readonly kind: "group"; readonly items: readonly PersistentSequenceItem[] };

export interface PersistentSequenceDescription {
  readonly root: PersistentLinkId;
  readonly items: readonly PersistentSequenceItem[];
}

export interface PersistentMaterializedEdge {
  readonly ref: PersistentLinkId;
  readonly start: PersistentLinkId;
  readonly end: PersistentLinkId;
}

export interface PersistentSequenceMaterialization {
  readonly description: PersistentSequenceDescription;
  readonly beforeCount: number;
  readonly created: readonly PersistentMaterializedEdge[];
  readonly result: PersistentLinkId;
}

function invalid(message: string): never {
  throw new PersistentStoreError(message);
}

function sameId(left: PersistentLinkId, right: PersistentLinkId): boolean {
  return left.lineage === right.lineage && left.local === right.local;
}

function persistentId(store: PersistentStore, ref: PersistentLinkId, limit = store.count): PersistentLinkId {
  store.poles(ref);
  if (ref.local >= limit) invalid("persistent sequence reference is outside selected prefix");
  return Object.freeze({ lineage: store.lineage, local: ref.local });
}

function runtimeDescription(
  store: PersistentStore,
  description: PersistentSequenceDescription,
  view: PersistentRuntimeView,
  limit: number,
): SequenceDescription {
  if (!sameId(description.root, store.root)) invalid("persistent sequence uses another root");
  const root = view.refs[description.root.local];
  if (root === undefined || root !== view.memory.root) invalid("persistent sequence root is unavailable");

  const visit = (items: readonly PersistentSequenceItem[]): readonly SequenceItem[] => Object.freeze(items.map((item) => {
    if (item.kind === "atom") {
      const ref = persistentId(store, item.value, limit);
      const value = view.refs[ref.local];
      if (value === undefined) invalid("persistent sequence atom is unavailable");
      return Object.freeze({ kind: "atom" as const, value });
    }
    if (item.kind === "group") {
      return Object.freeze({ kind: "group" as const, items: visit(item.items) });
    }
    return invalid("invalid persistent sequence item");
  }));

  return Object.freeze({ root, items: visit(description.items) });
}

function normalizeEndpoint(
  runtime: LinkHandle,
  oldByRuntime: ReadonlyMap<LinkHandle, PersistentLinkId>,
  createdIndex: ReadonlyMap<LinkHandle, number>,
  current: number,
): BatchEndpoint {
  const old = oldByRuntime.get(runtime);
  if (old !== undefined) return old;
  const batch = createdIndex.get(runtime);
  if (batch === undefined || batch >= current) {
    invalid("persistent sequence has unresolved runtime dependency");
  }
  return Object.freeze({ batch });
}

function persistentEndpoint(
  runtime: LinkHandle,
  oldByRuntime: ReadonlyMap<LinkHandle, PersistentLinkId>,
  createdIndex: ReadonlyMap<LinkHandle, number>,
  created: readonly PersistentLinkId[],
): PersistentLinkId {
  const old = oldByRuntime.get(runtime);
  if (old !== undefined) return old;
  const index = createdIndex.get(runtime);
  const ref = index === undefined ? undefined : created[index];
  if (ref === undefined) invalid("cannot normalize persistent sequence endpoint");
  return ref;
}

export function materializePersistentSequence(
  store: PersistentStore,
  description: PersistentSequenceDescription,
): PersistentSequenceMaterialization {
  const beforeCount = store.count;
  const before = store.runtimeView(beforeCount);
  const runtime = runtimeDescription(store, description, before, beforeCount);
  const runtimeEffect = materializeSequence(before.memory, runtime);

  const persistentBefore = store.allLinks();
  const oldByRuntime = new Map<LinkHandle, PersistentLinkId>();
  before.refs.forEach((ref, local) => oldByRuntime.set(ref, persistentBefore[local]!));
  const createdIndex = new Map<LinkHandle, number>();
  runtimeEffect.created.forEach((edge, index) => createdIndex.set(edge.ref, index));

  const batch: readonly BatchLink[] = Object.freeze(runtimeEffect.created.map((edge, index) => Object.freeze({
    start: normalizeEndpoint(edge.start, oldByRuntime, createdIndex, index),
    end: normalizeEndpoint(edge.end, oldByRuntime, createdIndex, index),
  })));
  const persistentCreated = store.materializeBatch(batch);
  persistentCreated.forEach((ref, index) => {
    if (ref.local !== beforeCount + index) invalid("runtime-created persistent Link was unexpectedly reused");
  });

  const created = Object.freeze(runtimeEffect.created.map((edge, index) => Object.freeze({
    ref: persistentCreated[index]!,
    start: persistentEndpoint(edge.start, oldByRuntime, createdIndex, persistentCreated),
    end: persistentEndpoint(edge.end, oldByRuntime, createdIndex, persistentCreated),
  })));
  const result = oldByRuntime.get(runtimeEffect.result) ?? persistentCreated[createdIndex.get(runtimeEffect.result)!];
  if (result === undefined) invalid("cannot normalize persistent sequence result");

  const evidence = Object.freeze({ description, beforeCount, created, result });
  replayPersistentSequenceMaterialization(store, evidence);
  return evidence;
}

export function replayPersistentSequenceMaterialization(
  store: PersistentStore,
  evidence: PersistentSequenceMaterialization,
): PersistentLinkId {
  const snapshot = store.snapshot();
  const count = store.count;
  if (!Number.isInteger(evidence.beforeCount) || evidence.beforeCount <= store.root.local) {
    invalid("invalid persistent sequence beforeCount");
  }
  if (!Array.isArray(evidence.created)) invalid("invalid persistent sequence created evidence");
  const afterCount = evidence.beforeCount + evidence.created.length;
  if (afterCount > count) invalid("persistent sequence evidence extends past current store");

  const after = store.runtimeView(afterCount);
  const description = runtimeDescription(store, evidence.description, after, evidence.beforeCount);
  const runtimeCreated: MaterializedEdge[] = evidence.created.map((edge, index) => {
    const expectedLocal = evidence.beforeCount + index;
    const ref = persistentId(store, edge.ref, afterCount);
    const start = persistentId(store, edge.start, afterCount);
    const end = persistentId(store, edge.end, afterCount);
    if (ref.local !== expectedLocal) invalid("persistent sequence created lineage is missing or reordered");
    const poles = store.poles(ref);
    if (!sameId(poles[0], start) || !sameId(poles[1], end)) invalid("persistent sequence edge has forged poles");
    return Object.freeze({
      ref: after.refs[ref.local]!,
      start: after.refs[start.local]!,
      end: after.refs[end.local]!,
    });
  });
  const result = persistentId(store, evidence.result, afterCount);
  const runtimeResult = after.refs[result.local];
  if (runtimeResult === undefined) invalid("persistent sequence result is unavailable");

  const runtimeEvidence: SequenceMaterializationEffect = Object.freeze({
    description,
    result: runtimeResult,
    created: Object.freeze(runtimeCreated),
    linkCountBefore: evidence.beforeCount,
    linkCountAfter: afterCount,
  });
  try {
    replaySequenceMaterialization(after.memory, runtimeEvidence);
  } catch (error) {
    throw new PersistentStoreError("invalid persistent sequence replay evidence", { cause: error });
  }
  if (store.count !== count || store.snapshot() !== snapshot) invalid("persistent sequence replay mutated store");
  return result;
}
