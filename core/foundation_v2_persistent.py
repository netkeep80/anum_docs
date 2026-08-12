"""Canonical persistent apamemory reference backend for Foundation v2.

The JSON file is only a storage mechanism. Its lineage id and integer link ids
are technical coordinates of one dataset; they are not MTS semantic identity.
Semantic identity is reconstructed and validated by the rooted structural link
network:

* there is one fully self-closed root;
* ``S = S ⟼ e`` is unique for a distinguished ``e``;
* ``E = b ⟼ E`` is unique for a distinguished ``b``;
* ``b ⟼ e`` is unique for distinguished ordered poles;
* repeated materialization of an existing form returns the same stored link;
* reads never materialize;
* atomic batches may refer only to already distinguished links, earlier batch
  results, or the current link as an explicit one-sided self-closure marker.

Arbitrary address graphs and forward ID-only cycles are therefore not accepted
as already-semantic MTS networks. They belong to a separate import and
canonicalization boundary.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
from typing import Iterable
from uuid import uuid4

from .rooted_link_network import (
    LinkNetwork,
    LinkNetworkError,
    NetworkSnapshot,
    LinkRef,
)
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
    """Persistent canonical-link store operation or evidence is invalid."""


@dataclass(frozen=True, order=True)
class PersistentLinkId:
    """Dataset-local storage coordinate; never semantic MTS identity."""

    lineage: str
    local: int


@dataclass(frozen=True)
class BatchRef:
    """Reference to the semantic result of one request in the current batch."""

    index: int


BatchEndpoint = PersistentLinkId | BatchRef


@dataclass(frozen=True)
class BatchLink:
    """One canonical link request in an atomic persistent batch."""

    start: BatchEndpoint
    end: BatchEndpoint


@dataclass(frozen=True)
class PersistentSnapshot:
    """Normalized stored topology of one dataset state."""

    lineage: str
    root: PersistentLinkId
    links: tuple[
        tuple[PersistentLinkId, PersistentLinkId, PersistentLinkId], ...
    ]


@dataclass(frozen=True)
class PersistentSequenceAtom:
    value: PersistentLinkId


@dataclass(frozen=True)
class PersistentSequenceGroup:
    items: tuple["PersistentSequenceItem", ...]


PersistentSequenceItem = PersistentSequenceAtom | PersistentSequenceGroup


@dataclass(frozen=True)
class PersistentSequenceDescription:
    root: PersistentLinkId
    items: tuple[PersistentSequenceItem, ...]


@dataclass(frozen=True)
class PersistentMaterializedEdge:
    ref: PersistentLinkId
    start: PersistentLinkId
    end: PersistentLinkId


@dataclass(frozen=True)
class PersistentSequenceMaterialization:
    """Portable persistent evidence for one explicit sequence effect."""

    description: PersistentSequenceDescription
    before_count: int
    created: tuple[PersistentMaterializedEdge, ...]
    result: PersistentLinkId

    @property
    def after_count(self) -> int:
        return self.before_count + len(self.created)


class JsonLinkStore:
    """Small file-backed canonical MTS apamemory reference implementation."""

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
    def create(cls, path: str | Path) -> "JsonLinkStore":
        """Create a new storage lineage containing only the unique root."""

        target = Path(path)
        if target.exists():
            raise PersistentStoreError("persistent dataset already exists")
        target.parent.mkdir(parents=True, exist_ok=True)
        store = cls(target, uuid4().hex, [(0, 0)], 0)
        store._commit_candidate(store._links)
        return store

    @classmethod
    def open(cls, path: str | Path) -> "JsonLinkStore":
        """Open and structurally validate an existing canonical dataset."""

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
    ) -> "JsonLinkStore":
        """Import validated topology into a fresh *storage* lineage."""

        target = Path(path)
        if target.exists():
            raise PersistentStoreError("persistent dataset already exists")
        target.parent.mkdir(parents=True, exist_ok=True)
        if not isinstance(snapshot, PersistentSnapshot):
            raise PersistentStoreError("expected persistent snapshot")

        ordered = sorted(snapshot.links, key=lambda item: item[0].local)
        if [item[0].local for item in ordered] != list(range(len(ordered))):
            raise PersistentStoreError("snapshot local ids must be dense for import")
        for ref, start, end in ordered:
            if (
                ref.lineage != snapshot.lineage
                or start.lineage != snapshot.lineage
                or end.lineage != snapshot.lineage
            ):
                raise PersistentStoreError("snapshot mixes storage lineages")
        if snapshot.root.lineage != snapshot.lineage:
            raise PersistentStoreError("snapshot root belongs to another lineage")

        links = [(start.local, end.local) for _ref, start, end in ordered]
        store = cls(target, uuid4().hex, links, snapshot.root.local)
        store._commit_candidate(store._links)
        return store

    @property
    def lineage_id(self) -> str:
        self._require_open()
        return self._lineage

    @property
    def root(self) -> PersistentLinkId:
        self._require_open()
        return self._id(self._root_local)

    @property
    def count(self) -> int:
        self._require_open()
        return len(self._links)

    def close(self) -> None:
        self._require_open()
        self._closed = True

    def snapshot(self) -> PersistentSnapshot:
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
        ref: PersistentLinkId,
    ) -> tuple[PersistentLinkId, PersistentLinkId]:
        self._require_open()
        local = self._validate_id(ref)
        start, end = self._links[local]
        return self._id(start), self._id(end)

    def find(
        self,
        *,
        start: PersistentLinkId | None = None,
        end: PersistentLinkId | None = None,
    ) -> tuple[PersistentLinkId, ...]:
        """Read-only lookup; a complete pole pair has at most one result."""

        self._require_open()
        start_local = self._validate_id(start) if start is not None else None
        end_local = self._validate_id(end) if end is not None else None
        return tuple(
            self._id(local)
            for local, (candidate_start, candidate_end) in enumerate(self._links)
            if (start_local is None or candidate_start == start_local)
            and (end_local is None or candidate_end == end_local)
        )

    def outgoing(self, start: PersistentLinkId) -> tuple[PersistentLinkId, ...]:
        return self.find(start=start)

    def incoming(self, end: PersistentLinkId) -> tuple[PersistentLinkId, ...]:
        return self.find(end=end)

    def all_links(self) -> tuple[PersistentLinkId, ...]:
        self._require_open()
        return tuple(self._id(local) for local in range(len(self._links)))

    def materialize(
        self,
        start: PersistentLinkId,
        end: PersistentLinkId,
    ) -> PersistentLinkId:
        """Return the canonical stored ``start ⟼ end``, appending only if absent."""

        self._require_open()
        start_local = self._validate_id(start)
        end_local = self._validate_id(end)
        existing = self._find_pair(self._links, start_local, end_local)
        if existing is not None:
            return self._id(existing)
        candidate = [*self._links, (start_local, end_local)]
        self._validate_links(candidate, self._root_local)
        self._commit_candidate(candidate)
        self._links = candidate
        return self._id(len(candidate) - 1)

    def materialize_start_self_closed(self, end: PersistentLinkId) -> PersistentLinkId:
        """Return the unique ``S = S ⟼ end`` for an already stored ``end``."""

        self._require_open()
        end_local = self._validate_id(end)
        existing = self._find_start_self_closed(self._links, end_local)
        if existing is not None:
            return self._id(existing)
        local = len(self._links)
        candidate = [*self._links, (local, end_local)]
        self._validate_links(candidate, self._root_local)
        self._commit_candidate(candidate)
        self._links = candidate
        return self._id(local)

    def materialize_end_self_closed(self, start: PersistentLinkId) -> PersistentLinkId:
        """Return the unique ``E = start ⟼ E`` for an already stored ``start``."""

        self._require_open()
        start_local = self._validate_id(start)
        existing = self._find_end_self_closed(self._links, start_local)
        if existing is not None:
            return self._id(existing)
        local = len(self._links)
        candidate = [*self._links, (start_local, local)]
        self._validate_links(candidate, self._root_local)
        self._commit_candidate(candidate)
        self._links = candidate
        return self._id(local)

    def materialize_batch(
        self,
        links: Iterable[BatchLink],
    ) -> tuple[PersistentLinkId, ...]:
        """Atomically resolve canonical link requests in dependency order.

        ``BatchRef(j)`` with ``j < i`` names the semantic result of an earlier
        request. ``BatchRef(i)`` is allowed only as the self pole of request
        ``i``. Forward references are rejected: a technical future id cannot be
        used to manufacture semantic distinction.
        """

        self._require_open()
        requested = tuple(links)
        if not requested:
            return ()

        candidate = list(self._links)
        results: list[int] = []

        for index, request in enumerate(requested):
            if not isinstance(request, BatchLink):
                raise PersistentStoreError("invalid batch link request")

            start, start_self = self._resolve_batch_endpoint(
                request.start, index, results
            )
            end, end_self = self._resolve_batch_endpoint(request.end, index, results)

            if start_self and end_self:
                result = self._root_local
            elif start_self:
                assert end is not None
                existing = self._find_start_self_closed(candidate, end)
                if existing is not None:
                    result = existing
                else:
                    result = len(candidate)
                    candidate.append((result, end))
            elif end_self:
                assert start is not None
                existing = self._find_end_self_closed(candidate, start)
                if existing is not None:
                    result = existing
                else:
                    result = len(candidate)
                    candidate.append((start, result))
            else:
                assert start is not None and end is not None
                existing = self._find_pair(candidate, start, end)
                if existing is not None:
                    result = existing
                else:
                    result = len(candidate)
                    candidate.append((start, end))

            results.append(result)

        self._validate_links(candidate, self._root_local)
        if candidate != self._links:
            self._commit_candidate(candidate)
            self._links = candidate
        return tuple(self._id(local) for local in results)

    def runtime_network(
        self,
        *,
        count: int | None = None,
    ) -> tuple[LinkNetwork, dict[PersistentLinkId, LinkRef]]:
        """Reconstruct canonical runtime topology with fresh technical handles."""

        self._require_open()
        selected_count = len(self._links) if count is None else count
        if selected_count <= self._root_local or selected_count > len(self._links):
            raise PersistentStoreError("invalid runtime prefix count")
        for start, end in self._links[:selected_count]:
            if start >= selected_count or end >= selected_count:
                raise PersistentStoreError(
                    "requested runtime prefix is not topologically closed"
                )
        snapshot = NetworkSnapshot(
            links=tuple(self._links[:selected_count]),
            root=self._root_local,
        )
        try:
            network = LinkNetwork.from_snapshot(snapshot)
        except LinkNetworkError as exc:
            raise PersistentStoreError("persistent topology is not canonical MTS") from exc
        mapping = {
            self._id(local): network.refs[local] for local in range(selected_count)
        }
        return network, mapping

    def runtime_materialization_lineage(
        self,
        before_count: int,
        after_count: int,
    ) -> tuple[
        LinkNetwork,
        LinkNetwork,
        dict[PersistentLinkId, LinkRef],
    ]:
        """Reconstruct before/after runtime states in one technical runtime scope."""

        self._require_open()
        if (
            before_count <= self._root_local
            or after_count < before_count
            or after_count > len(self._links)
        ):
            raise PersistentStoreError("invalid persistent materialization range")

        before, initial_mapping = self.runtime_network(count=before_count)
        evolution = before.evolve()
        refs: dict[int, LinkRef] = {
            persistent.local: runtime
            for persistent, runtime in initial_mapping.items()
        }

        for local in range(before_count, after_count):
            start, end = self._links[local]
            try:
                if start == local and end == local:
                    runtime = evolution.ensure_root()
                elif start == local:
                    runtime = evolution.ensure_start_self_closed(refs[end])
                elif end == local:
                    runtime = evolution.ensure_end_self_closed(refs[start])
                else:
                    runtime = evolution.ensure(refs[start], refs[end])
            except (KeyError, LinkNetworkError) as exc:
                raise PersistentStoreError(
                    "persistent materialization is not dependency-ordered canonical MTS"
                ) from exc
            if runtime.slot != local:
                raise PersistentStoreError(
                    "persistent append duplicates an already canonical semantic link"
                )
            refs[local] = runtime

        after = evolution.freeze()
        mapping = {self._id(local): refs[local] for local in range(after_count)}
        return before, after, mapping

    def _resolve_batch_endpoint(
        self,
        endpoint: BatchEndpoint,
        current_index: int,
        results: list[int],
    ) -> tuple[int | None, bool]:
        if isinstance(endpoint, PersistentLinkId):
            return self._validate_id(endpoint), False
        if not isinstance(endpoint, BatchRef):
            raise PersistentStoreError("invalid batch endpoint")
        if endpoint.index < 0 or endpoint.index > current_index:
            raise PersistentStoreError(
                "batch forward reference cannot create semantic distinction"
            )
        if endpoint.index == current_index:
            return None, True
        return results[endpoint.index], False

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
            if (
                not isinstance(start, int)
                or not isinstance(end, int)
                or start < 0
                or start >= len(links)
                or end < 0
                or end >= len(links)
            ):
                raise PersistentStoreError("persistent endpoint is out of range")
        try:
            LinkNetwork.from_snapshot(
                NetworkSnapshot(links=tuple(links), root=root_local)
            )
        except LinkNetworkError as exc:
            raise PersistentStoreError(
                "persistent topology is not rooted canonical MTS"
            ) from exc

    @staticmethod
    def _find_pair(
        links: list[tuple[int, int]], start: int, end: int
    ) -> int | None:
        for local, pair in enumerate(links):
            if pair == (start, end):
                return local
        return None

    @staticmethod
    def _find_start_self_closed(
        links: list[tuple[int, int]], end: int
    ) -> int | None:
        for local, (start, candidate_end) in enumerate(links):
            if start == local and candidate_end == end and candidate_end != local:
                return local
        return None

    @staticmethod
    def _find_end_self_closed(
        links: list[tuple[int, int]], start: int
    ) -> int | None:
        for local, (candidate_start, end) in enumerate(links):
            if end == local and candidate_start == start and candidate_start != local:
                return local
        return None

    def _id(self, local: int) -> PersistentLinkId:
        return PersistentLinkId(self._lineage, local)

    def _validate_id(self, ref: PersistentLinkId) -> int:
        if not isinstance(ref, PersistentLinkId):
            raise PersistentStoreError("expected persistent link id")
        if ref.lineage != self._lineage:
            raise PersistentStoreError("foreign persistent dataset lineage")
        if ref.local < 0 or ref.local >= len(self._links):
            raise PersistentStoreError("persistent link id is out of range")
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
    store: JsonLinkStore,
    description: PersistentSequenceDescription,
) -> PersistentSequenceMaterialization:
    """Execute Gate-P sequence semantics and persist only newly materialized links."""

    if description.root != store.root:
        raise PersistentStoreError("persistent sequence uses another root")

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

    def endpoint(ref: LinkRef, current_index: int) -> BatchEndpoint:
        persistent = runtime_to_persistent.get(ref)
        if persistent is not None:
            return persistent
        index = created_index.get(ref)
        if index is None:
            raise PersistentStoreError(
                "runtime materialization endpoint cannot be normalized"
            )
        if index > current_index:
            raise PersistentStoreError(
                "runtime materialization contains an unresolved forward dependency"
            )
        return BatchRef(index)

    batch = tuple(
        BatchLink(
            start=endpoint(edge.start, index),
            end=endpoint(edge.end, index),
        )
        for index, edge in enumerate(runtime_effect.created)
    )
    persistent_refs = store.materialize_batch(batch)
    if len(persistent_refs) != len(runtime_effect.created):
        raise PersistentStoreError("persistent batch cardinality mismatch")
    for index, persistent_ref in enumerate(persistent_refs):
        if persistent_ref.local != before_count + index:
            raise PersistentStoreError(
                "runtime-created link unexpectedly reused persistent storage"
            )

    created = tuple(
        PersistentMaterializedEdge(
            ref=persistent_ref,
            start=_persistent_endpoint(
                edge.start,
                runtime_to_persistent,
                created_index,
                persistent_refs,
            ),
            end=_persistent_endpoint(
                edge.end,
                runtime_to_persistent,
                created_index,
                persistent_refs,
            ),
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
    store: JsonLinkStore,
    evidence: PersistentSequenceMaterialization,
) -> PersistentLinkId:
    """Replay persistent sequence evidence read-only, including after reopen."""

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
    try:
        runtime_created = tuple(
            MaterializedEdge(
                ref=mapping[edge.ref],
                start=mapping[edge.start],
                end=mapping[edge.end],
            )
            for edge in evidence.created
        )
        runtime_result = mapping[evidence.result]
    except KeyError as exc:
        raise PersistentStoreError("persistent sequence evidence references absent link") from exc

    runtime_evidence = SequenceMaterialization(
        description=runtime_description,
        after=after,
        created=runtime_created,
        result=runtime_result,
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
    mapping: dict[PersistentLinkId, LinkRef],
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
    mapping: dict[PersistentLinkId, LinkRef],
):
    if isinstance(item, PersistentSequenceAtom):
        try:
            return SequenceAtom(mapping[item.value])
        except KeyError as exc:
            raise PersistentStoreError("persistent sequence atom is unavailable") from exc
    if isinstance(item, PersistentSequenceGroup):
        return SequenceGroup(tuple(_runtime_item(child, mapping) for child in item.items))
    raise PersistentStoreError("invalid persistent sequence item")


def _persistent_endpoint(
    runtime: LinkRef,
    old: dict[LinkRef, PersistentLinkId],
    created_index: dict[LinkRef, int],
    new: tuple[PersistentLinkId, ...],
) -> PersistentLinkId:
    persistent = old.get(runtime)
    if persistent is not None:
        return persistent
    try:
        return new[created_index[runtime]]
    except (KeyError, IndexError) as exc:
        raise PersistentStoreError("cannot normalize runtime endpoint") from exc
