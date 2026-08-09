"""Foundation-v2 persistent exact-occurrence apamemory reference backend.

The JSON file used here is deliberately only a reference persistence mechanism.
Its format is not MTS ontology and is not the canonical high-performance storage
layout. The semantic contract is the observable behavior:

* each materialization creates a fresh exact occurrence;
* duplicate pole pairs survive as distinct logical occurrences;
* one persistent dataset has an opaque lineage id;
* reopening that dataset preserves lineage-local logical occurrence ids;
* importing the same topology creates a fresh lineage;
* physical file offsets/addresses and portable snapshot slots are not semantic
  identity;
* reads never materialize;
* batches commit atomically or expose the previous state.

The module also bridges the already-accepted Gate-P candidate sequence
materializer to persistent ids without reimplementing its nested sequence
semantics.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
from typing import Iterable
from uuid import uuid4

from .exact_link_network import LinkNetwork, LinkNetworkBuilder, OccurrenceRef
from .foundation_v2_materialization import (
    MaterializedEdge,
    SequenceAtom,
    SequenceDescription,
    SequenceGroup,
    SequenceMaterialization,
    materialize_sequence,
    replay_sequence_materialization,
)


PERSISTENT_SCHEMA = "mts-foundation-v2-persistent-reference/v0.7"


class PersistentStoreError(ValueError):
    """Persistent exact-occurrence store operation or evidence is invalid."""


@dataclass(frozen=True, order=True)
class PersistentOccurrenceId:
    """Stable logical occurrence id inside exactly one persistent dataset lineage."""

    lineage: str
    local: int


@dataclass(frozen=True)
class BatchRef:
    """Reference to an occurrence allocated by the current atomic batch."""

    index: int


BatchEndpoint = PersistentOccurrenceId | BatchRef


@dataclass(frozen=True)
class BatchLink:
    """One requested fresh exact occurrence in an atomic materialization batch."""

    start: BatchEndpoint
    end: BatchEndpoint


@dataclass(frozen=True)
class PersistentSnapshot:
    """Normalized logical topology of one persistent dataset state."""

    lineage: str
    root: PersistentOccurrenceId
    links: tuple[tuple[PersistentOccurrenceId, PersistentOccurrenceId, PersistentOccurrenceId], ...]


@dataclass(frozen=True)
class PersistentSequenceAtom:
    value: PersistentOccurrenceId


@dataclass(frozen=True)
class PersistentSequenceGroup:
    items: tuple["PersistentSequenceItem", ...]

    def __post_init__(self) -> None:
        if not self.items:
            raise PersistentStoreError("persistent sequence group cannot be empty")


PersistentSequenceItem = PersistentSequenceAtom | PersistentSequenceGroup


@dataclass(frozen=True)
class PersistentSequenceDescription:
    root: PersistentOccurrenceId
    items: tuple[PersistentSequenceItem, ...]

    def __post_init__(self) -> None:
        if not self.items:
            raise PersistentStoreError("persistent sequence cannot be empty")


@dataclass(frozen=True)
class PersistentMaterializedEdge:
    ref: PersistentOccurrenceId
    start: PersistentOccurrenceId
    end: PersistentOccurrenceId


@dataclass(frozen=True)
class PersistentSequenceMaterialization:
    """Portable persistent evidence for one sequence effect."""

    description: PersistentSequenceDescription
    before_count: int
    created: tuple[PersistentMaterializedEdge, ...]
    result: PersistentOccurrenceId

    @property
    def after_count(self) -> int:
        return self.before_count + len(self.created)


class JsonExactLinkStore:
    """Small file-backed reference implementation of the Foundation-v2 L4 contract."""

    def __init__(
        self,
        path: Path,
        lineage: str,
        links: list[tuple[int, int]],
        root_local: int,
    ) -> None:
        self._path = path
        self._lineage = lineage
        self._links = links
        self._root_local = root_local
        self._closed = False
        self._validate_state()

    @classmethod
    def create(cls, path: str | Path) -> "JsonExactLinkStore":
        """Create a fresh persistent lineage with one exact self-closed root."""

        target = Path(path)
        if target.exists():
            raise PersistentStoreError("persistent dataset already exists")
        target.parent.mkdir(parents=True, exist_ok=True)
        store = cls(target, uuid4().hex, [(0, 0)], 0)
        store._commit_candidate(store._links)
        return store

    @classmethod
    def open(cls, path: str | Path) -> "JsonExactLinkStore":
        """Open an existing dataset preserving its logical lineage and ids."""

        target = Path(path)
        try:
            raw = json.loads(target.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise PersistentStoreError("cannot open persistent dataset") from exc
        if raw.get("schema") != PERSISTENT_SCHEMA:
            raise PersistentStoreError("unsupported persistent dataset schema")
        lineage = raw.get("lineage")
        root = raw.get("root")
        links_raw = raw.get("links")
        if not isinstance(lineage, str) or not lineage:
            raise PersistentStoreError("invalid persistent lineage id")
        if not isinstance(root, int):
            raise PersistentStoreError("invalid persistent root id")
        if not isinstance(links_raw, list):
            raise PersistentStoreError("invalid persistent links")
        links: list[tuple[int, int]] = []
        for pair in links_raw:
            if (
                not isinstance(pair, list)
                or len(pair) != 2
                or not all(isinstance(value, int) for value in pair)
            ):
                raise PersistentStoreError("invalid persistent link pair")
            links.append((pair[0], pair[1]))
        return cls(target, lineage, links, root)

    @classmethod
    def import_topology(
        cls,
        path: str | Path,
        snapshot: PersistentSnapshot,
    ) -> "JsonExactLinkStore":
        """Import topology into a fresh lineage instead of claiming source identity."""

        target = Path(path)
        if target.exists():
            raise PersistentStoreError("persistent dataset already exists")
        target.parent.mkdir(parents=True, exist_ok=True)
        ordered = sorted(snapshot.links, key=lambda item: item[0].local)
        if [item[0].local for item in ordered] != list(range(len(ordered))):
            raise PersistentStoreError("snapshot local ids must be dense for import")
        links = [(start.local, end.local) for _ref, start, end in ordered]
        store = cls(target, uuid4().hex, links, snapshot.root.local)
        store._commit_candidate(store._links)
        return store

    @property
    def lineage_id(self) -> str:
        self._require_open()
        return self._lineage

    @property
    def root(self) -> PersistentOccurrenceId:
        self._require_open()
        return self._id(self._root_local)

    @property
    def count(self) -> int:
        self._require_open()
        return len(self._links)

    def close(self) -> None:
        """Close this runtime handle; committed file state already persists."""

        self._require_open()
        self._closed = True

    def snapshot(self) -> PersistentSnapshot:
        """Return normalized logical topology without backend physical addresses."""

        self._require_open()
        return PersistentSnapshot(
            lineage=self._lineage,
            root=self.root,
            links=tuple(
                (self._id(local), self._id(start), self._id(end))
                for local, (start, end) in enumerate(self._links)
            ),
        )

    def poles(
        self,
        ref: PersistentOccurrenceId,
    ) -> tuple[PersistentOccurrenceId, PersistentOccurrenceId]:
        self._require_open()
        local = self._validate_id(ref)
        start, end = self._links[local]
        return self._id(start), self._id(end)

    def find(
        self,
        *,
        start: PersistentOccurrenceId | None = None,
        end: PersistentOccurrenceId | None = None,
    ) -> tuple[PersistentOccurrenceId, ...]:
        """Read-only exact occurrence lookup preserving duplicate pairs."""

        self._require_open()
        start_local = self._validate_id(start) if start is not None else None
        end_local = self._validate_id(end) if end is not None else None
        return tuple(
            self._id(local)
            for local, (candidate_start, candidate_end) in enumerate(self._links)
            if (start_local is None or candidate_start == start_local)
            and (end_local is None or candidate_end == end_local)
        )

    def outgoing(
        self,
        start: PersistentOccurrenceId,
    ) -> tuple[PersistentOccurrenceId, ...]:
        return self.find(start=start)

    def incoming(
        self,
        end: PersistentOccurrenceId,
    ) -> tuple[PersistentOccurrenceId, ...]:
        return self.find(end=end)

    def all_occurrences(self) -> tuple[PersistentOccurrenceId, ...]:
        self._require_open()
        return tuple(self._id(local) for local in range(len(self._links)))

    def materialize(
        self,
        start: PersistentOccurrenceId,
        end: PersistentOccurrenceId,
    ) -> PersistentOccurrenceId:
        """Create one fresh exact occurrence even if the same pair already exists."""

        return self.materialize_batch((BatchLink(start, end),))[0]

    def materialize_batch(
        self,
        links: Iterable[BatchLink],
    ) -> tuple[PersistentOccurrenceId, ...]:
        """Atomically append fresh exact occurrences, including cyclic batches."""

        self._require_open()
        requested = tuple(links)
        if not requested:
            return ()
        base = len(self._links)
        allocated = tuple(self._id(base + index) for index in range(len(requested)))

        def resolve(endpoint: BatchEndpoint) -> int:
            if isinstance(endpoint, PersistentOccurrenceId):
                return self._validate_id(endpoint)
            if not isinstance(endpoint, BatchRef):
                raise PersistentStoreError("invalid batch endpoint")
            if endpoint.index < 0 or endpoint.index >= len(allocated):
                raise PersistentStoreError("batch reference is out of range")
            return allocated[endpoint.index].local

        additions = [(resolve(link.start), resolve(link.end)) for link in requested]
        candidate = [*self._links, *additions]
        self._validate_links(candidate, self._root_local)

        # Persist first. If this raises, in-memory observable state remains old.
        self._commit_candidate(candidate)
        self._links = candidate
        return allocated

    def runtime_network(
        self,
        *,
        count: int | None = None,
    ) -> tuple[LinkNetwork, dict[PersistentOccurrenceId, OccurrenceRef]]:
        """Reconstruct a fresh runtime exact network from a persistent prefix."""

        self._require_open()
        selected_count = len(self._links) if count is None else count
        if selected_count <= self._root_local or selected_count > len(self._links):
            raise PersistentStoreError("invalid runtime prefix count")
        for start, end in self._links[:selected_count]:
            if start >= selected_count or end >= selected_count:
                raise PersistentStoreError(
                    "requested runtime prefix is not topologically closed"
                )

        builder = LinkNetworkBuilder()
        refs = tuple(builder.reserve() for _ in range(selected_count))
        for local, (start, end) in enumerate(self._links[:selected_count]):
            builder.define(refs[local], refs[start], refs[end])
        network = builder.freeze(refs[self._root_local])
        mapping = {self._id(local): refs[local] for local in range(selected_count)}
        return network, mapping

    def runtime_materialization_lineage(
        self,
        before_count: int,
        after_count: int,
    ) -> tuple[
        LinkNetwork,
        LinkNetwork,
        dict[PersistentOccurrenceId, OccurrenceRef],
    ]:
        """Reconstruct before/after runtime states sharing one exact identity scope."""

        if after_count < before_count or after_count > len(self._links):
            raise PersistentStoreError("invalid persistent materialization range")
        before, mapping = self.runtime_network(count=before_count)
        evolution = before.evolve()
        refs: dict[int, OccurrenceRef] = {
            persistent.local: runtime for persistent, runtime in mapping.items()
        }
        for local in range(before_count, after_count):
            refs[local] = evolution.reserve()
        for local in range(before_count, after_count):
            start, end = self._links[local]
            if start not in refs or end not in refs:
                raise PersistentStoreError(
                    "persistent materialization range has unresolved endpoint"
                )
            evolution.define(refs[local], refs[start], refs[end])
        after = evolution.freeze()
        full_mapping = {self._id(local): refs[local] for local in range(after_count)}
        return before, after, full_mapping

    def _validate_state(self) -> None:
        if not self._lineage:
            raise PersistentStoreError("persistent lineage id cannot be empty")
        self._validate_links(self._links, self._root_local)

    @staticmethod
    def _validate_links(links: list[tuple[int, int]], root_local: int) -> None:
        if not links:
            raise PersistentStoreError("persistent dataset cannot be empty")
        if root_local < 0 or root_local >= len(links):
            raise PersistentStoreError("persistent root is out of range")
        for start, end in links:
            if start < 0 or start >= len(links) or end < 0 or end >= len(links):
                raise PersistentStoreError("persistent endpoint is out of range")

    def _id(self, local: int) -> PersistentOccurrenceId:
        return PersistentOccurrenceId(self._lineage, local)

    def _validate_id(self, ref: PersistentOccurrenceId) -> int:
        if not isinstance(ref, PersistentOccurrenceId):
            raise PersistentStoreError("expected persistent occurrence id")
        if ref.lineage != self._lineage:
            raise PersistentStoreError("foreign persistent dataset lineage")
        if ref.local < 0 or ref.local >= len(self._links):
            raise PersistentStoreError("persistent occurrence id is out of range")
        return ref.local

    def _payload(self, links: list[tuple[int, int]]) -> dict:
        return {
            "schema": PERSISTENT_SCHEMA,
            "lineage": self._lineage,
            "root": self._root_local,
            "links": [[start, end] for start, end in links],
        }

    def _commit_candidate(self, links: list[tuple[int, int]]) -> None:
        payload = self._payload(links)
        temporary = self._path.with_name(f".{self._path.name}.tmp")
        try:
            with temporary.open("w", encoding="utf-8") as stream:
                json.dump(payload, stream, sort_keys=True, separators=(",", ":"))
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self._path)
        except OSError:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
            raise

    def _require_open(self) -> None:
        if self._closed:
            raise PersistentStoreError("persistent store handle is closed")


def materialize_persistent_sequence(
    store: JsonExactLinkStore,
    description: PersistentSequenceDescription,
) -> PersistentSequenceMaterialization:
    """Execute the existing Gate-P sequence semantics as one persistent batch."""

    if description.root != store.root:
        raise PersistentStoreError("persistent sequence uses another exact root")
    before_count = store.count
    before, persistent_to_runtime = store.runtime_network()
    runtime_description = _runtime_description(description, persistent_to_runtime)
    runtime_effect = materialize_sequence(before, runtime_description)

    runtime_to_persistent = {
        runtime: persistent for persistent, runtime in persistent_to_runtime.items()
    }
    created_index = {
        edge.ref: index for index, edge in enumerate(runtime_effect.created)
    }

    def endpoint(ref: OccurrenceRef) -> BatchEndpoint:
        persistent = runtime_to_persistent.get(ref)
        if persistent is not None:
            return persistent
        index = created_index.get(ref)
        if index is None:
            raise PersistentStoreError("runtime materialization endpoint is not normalized")
        return BatchRef(index)

    batch = tuple(
        BatchLink(start=endpoint(edge.start), end=endpoint(edge.end))
        for edge in runtime_effect.created
    )
    persistent_refs = store.materialize_batch(batch)
    if len(persistent_refs) != len(runtime_effect.created):
        raise PersistentStoreError("persistent batch cardinality mismatch")

    created = tuple(
        PersistentMaterializedEdge(
            ref=persistent_ref,
            start=_persistent_endpoint(edge.start, runtime_to_persistent, created_index, persistent_refs),
            end=_persistent_endpoint(edge.end, runtime_to_persistent, created_index, persistent_refs),
        )
        for persistent_ref, edge in zip(
            persistent_refs, runtime_effect.created, strict=True
        )
    )
    if runtime_effect.result in runtime_to_persistent:
        result = runtime_to_persistent[runtime_effect.result]
    else:
        result = persistent_refs[created_index[runtime_effect.result]]

    evidence = PersistentSequenceMaterialization(
        description=description,
        before_count=before_count,
        created=created,
        result=result,
    )
    replay_persistent_sequence_materialization(store, evidence)
    return evidence


def replay_persistent_sequence_materialization(
    store: JsonExactLinkStore,
    evidence: PersistentSequenceMaterialization,
) -> PersistentOccurrenceId:
    """Replay persisted sequence evidence, including after a clean reopen."""

    snapshot_before = store.snapshot()
    if evidence.description.root.lineage != store.lineage_id:
        raise PersistentStoreError("persistent evidence belongs to another lineage")
    if evidence.after_count > store.count:
        raise PersistentStoreError("persistent evidence extends past current store state")

    before, after, mapping = store.runtime_materialization_lineage(
        evidence.before_count,
        evidence.after_count,
    )
    runtime_description = _runtime_description(evidence.description, mapping)
    runtime_created = tuple(
        MaterializedEdge(
            ref=mapping[edge.ref],
            start=mapping[edge.start],
            end=mapping[edge.end],
        )
        for edge in evidence.created
    )
    runtime_evidence = SequenceMaterialization(
        description=runtime_description,
        after=after,
        created=runtime_created,
        result=mapping[evidence.result],
    )
    replay_sequence_materialization(before, runtime_evidence)

    for edge in evidence.created:
        if store.poles(edge.ref) != (edge.start, edge.end):
            raise PersistentStoreError("persistent edge evidence has forged poles")
    if store.snapshot() != snapshot_before:
        raise PersistentStoreError("persistent replay mutated the store")
    return evidence.result


def _runtime_description(
    description: PersistentSequenceDescription,
    mapping: dict[PersistentOccurrenceId, OccurrenceRef],
) -> SequenceDescription:
    try:
        root = mapping[description.root]
    except KeyError as exc:
        raise PersistentStoreError("persistent sequence root is unavailable") from exc
    return SequenceDescription(
        root=root,
        items=tuple(_runtime_item(item, mapping) for item in description.items),
    )


def _runtime_item(
    item: PersistentSequenceItem,
    mapping: dict[PersistentOccurrenceId, OccurrenceRef],
):
    if isinstance(item, PersistentSequenceAtom):
        try:
            return SequenceAtom(mapping[item.value])
        except KeyError as exc:
            raise PersistentStoreError("persistent sequence atom is unavailable") from exc
    return SequenceGroup(tuple(_runtime_item(child, mapping) for child in item.items))


def _persistent_endpoint(
    runtime: OccurrenceRef,
    old: dict[OccurrenceRef, PersistentOccurrenceId],
    created_index: dict[OccurrenceRef, int],
    new: tuple[PersistentOccurrenceId, ...],
) -> PersistentOccurrenceId:
    persistent = old.get(runtime)
    if persistent is not None:
        return persistent
    try:
        return new[created_index[runtime]]
    except (KeyError, IndexError) as exc:
        raise PersistentStoreError("cannot normalize runtime endpoint") from exc
