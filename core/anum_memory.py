"""Canonical in-memory L4 associative link store for MTS/Anum v0.2.

L3 owns parsing, projection and denotation. This module consumes validated
``RawCarrierDescription`` / ``AnumDenotation`` values and is the only place in
the reference runtime that assigns session-local materialized LinkRefs.
"""

from collections.abc import Mapping
from dataclasses import dataclass

from core.anum_denotation import (
    AnumDenotation,
    DenotationKind,
    DenotationRef,
    DenotationRefKind,
    StructuralDenotation,
)
from core.anum_raw_carrier import RawCarrierDescription, validate_raw_carrier


LinkRef = int


@dataclass(frozen=True)
class LinkRecord:
    start: LinkRef
    end: LinkRef


@dataclass(frozen=True)
class MemorySnapshot:
    raw: tuple[RawCarrierDescription, ...]
    links: tuple[tuple[LinkRef, LinkRecord], ...]


class AnumMemoryError(RuntimeError):
    """Base error for the canonical L4 in-memory backend."""


class UnknownLinkRefError(AnumMemoryError):
    pass


class MissingAnchorError(AnumMemoryError):
    pass


class NonStructuralDenotationError(AnumMemoryError):
    pass


class LinkInUseError(AnumMemoryError):
    pass


class InvalidInitialGraphError(AnumMemoryError):
    pass


class AnumMemory:
    """One canonical in-memory L4 store with exact Link identity.

    ``initial_links`` imports an already existing finite closed Link graph. It
    is the explicit boundary through which callers provide cyclic/root anchors;
    normal ``intern_link`` calls require their endpoint refs to already exist.
    """

    def __init__(
        self,
        initial_links: Mapping[LinkRef, tuple[LinkRef, LinkRef]] | None = None,
    ) -> None:
        self._raw: dict[str, RawCarrierDescription] = {}
        self._links: dict[LinkRef, LinkRecord] = {}
        self._exact: dict[tuple[LinkRef, LinkRef], LinkRef] = {}
        self._outgoing: dict[LinkRef, set[LinkRef]] = {}
        self._incoming: dict[LinkRef, set[LinkRef]] = {}
        self._next_ref: LinkRef = 0

        if initial_links:
            self._load_initial_graph(initial_links)

    @property
    def raw_count(self) -> int:
        return len(self._raw)

    @property
    def link_count(self) -> int:
        return len(self._links)

    def snapshot(self) -> MemorySnapshot:
        return MemorySnapshot(
            raw=tuple(self._raw[key] for key in sorted(self._raw)),
            links=tuple(sorted(self._links.items())),
        )

    def load_raw(self, carrier: RawCarrierDescription) -> RawCarrierDescription:
        """Store one already parsed/validated raw carrier without denotation effects."""

        validate_raw_carrier(carrier)
        existing = self._raw.get(carrier.raw)
        if existing is not None and existing != carrier:
            raise ValueError("same raw spelling cannot map to two raw carrier descriptions")
        self._raw[carrier.raw] = carrier
        return carrier

    def has_raw(self, carrier: RawCarrierDescription) -> bool:
        """Read-only exact raw-carrier lookup."""

        validate_raw_carrier(carrier)
        return self._raw.get(carrier.raw) == carrier

    def find_link(self, start: LinkRef, end: LinkRef) -> LinkRef | None:
        """Read-only exact ordered-pair lookup."""

        self._require_ref(start)
        self._require_ref(end)
        return self._exact.get((start, end))

    def intern_link(self, start: LinkRef, end: LinkRef) -> LinkRef:
        """Return the canonical LinkRef for an ordered pair, creating it if absent."""

        self._require_ref(start)
        self._require_ref(end)
        existing = self._exact.get((start, end))
        if existing is not None:
            return existing

        ref = self._allocate_ref()
        self._insert_link(ref, LinkRecord(start=start, end=end))
        return ref

    def poles(self, ref: LinkRef) -> tuple[LinkRef, LinkRef]:
        record = self._links.get(ref)
        if record is None:
            raise UnknownLinkRefError(f"unknown LinkRef: {ref}")
        return record.start, record.end

    def outgoing(self, start: LinkRef) -> tuple[LinkRef, ...]:
        self._require_ref(start)
        return tuple(sorted(self._outgoing.get(start, ())))

    def incoming(self, end: LinkRef) -> tuple[LinkRef, ...]:
        self._require_ref(end)
        return tuple(sorted(self._incoming.get(end, ())))

    def find_denotation(
        self,
        denotation: AnumDenotation,
        anchors: Mapping[str, LinkRef],
    ) -> LinkRef | None:
        """Resolve a structural denotation without creating any links."""

        structural = self._structural(denotation)
        resolved_anchors = self._resolve_anchors(structural, anchors)
        local_nodes: dict[int, LinkRef] = {}

        for node in structural.nodes:
            start = self._resolve_ref(node.start, resolved_anchors, local_nodes)
            end = self._resolve_ref(node.end, resolved_anchors, local_nodes)
            found = self._exact.get((start, end))
            if found is None:
                return None
            local_nodes[node.id] = found

        return self._resolve_ref(structural.root, resolved_anchors, local_nodes)

    def realize_denotation(
        self,
        denotation: AnumDenotation,
        anchors: Mapping[str, LinkRef],
    ) -> LinkRef:
        """Atomically materialize one validated structural denotation.

        Planning happens entirely against local copies. The store mutates only
        after every anchor/ref has resolved and every new LinkRef has been
        assigned deterministically.
        """

        structural = self._structural(denotation)
        resolved_anchors = self._resolve_anchors(structural, anchors)

        staged_exact = dict(self._exact)
        local_nodes: dict[int, LinkRef] = {}
        planned: list[tuple[LinkRef, LinkRecord]] = []
        next_ref = self._next_ref

        for node in structural.nodes:
            start = self._resolve_ref(node.start, resolved_anchors, local_nodes)
            end = self._resolve_ref(node.end, resolved_anchors, local_nodes)
            pair = (start, end)
            ref = staged_exact.get(pair)
            if ref is None:
                while next_ref in self._links or any(item[0] == next_ref for item in planned):
                    next_ref += 1
                ref = next_ref
                next_ref += 1
                staged_exact[pair] = ref
                planned.append((ref, LinkRecord(start=start, end=end)))
            local_nodes[node.id] = ref

        root = self._resolve_ref(structural.root, resolved_anchors, local_nodes)

        for ref, record in planned:
            self._insert_link(ref, record)
        if planned:
            self._next_ref = max(self._next_ref, next_ref)
        return root

    def delete_link(self, ref: LinkRef) -> None:
        """Delete exactly one materialized Link without implicit cascade.

        Deletion is rejected when another Link still references ``ref``. This
        preserves referential integrity while keeping cascade semantics absent.
        Self-reference by the deleted Link itself is allowed.
        """

        record = self._links.get(ref)
        if record is None:
            raise UnknownLinkRefError(f"unknown LinkRef: {ref}")

        dependents = (
            self._outgoing.get(ref, set()) | self._incoming.get(ref, set())
        ) - {ref}
        if dependents:
            raise LinkInUseError(
                f"LinkRef {ref} is still referenced by links {sorted(dependents)}"
            )

        del self._links[ref]
        del self._exact[(record.start, record.end)]
        self._discard_index(self._outgoing, record.start, ref)
        self._discard_index(self._incoming, record.end, ref)

    def _load_initial_graph(
        self,
        initial_links: Mapping[LinkRef, tuple[LinkRef, LinkRef]],
    ) -> None:
        refs = set(initial_links)
        if any(not isinstance(ref, int) or isinstance(ref, bool) or ref < 0 for ref in refs):
            raise InvalidInitialGraphError("initial LinkRefs must be non-negative integers")

        records: dict[LinkRef, LinkRecord] = {}
        seen_pairs: dict[tuple[LinkRef, LinkRef], LinkRef] = {}
        for ref, pair in initial_links.items():
            if (
                not isinstance(pair, tuple)
                or len(pair) != 2
                or any(
                    not isinstance(value, int) or isinstance(value, bool) or value < 0
                    for value in pair
                )
            ):
                raise InvalidInitialGraphError("initial link poles must be LinkRef pairs")
            start, end = pair
            if start not in refs or end not in refs:
                raise InvalidInitialGraphError(
                    f"initial LinkRef {ref} points outside initial graph: {(start, end)}"
                )
            if pair in seen_pairs:
                raise InvalidInitialGraphError(
                    f"duplicate canonical pair {pair} for LinkRefs {seen_pairs[pair]} and {ref}"
                )
            seen_pairs[pair] = ref
            records[ref] = LinkRecord(start=start, end=end)

        for ref in sorted(records):
            self._insert_link(ref, records[ref])
        self._next_ref = max(refs, default=-1) + 1

    def _structural(self, denotation: AnumDenotation) -> StructuralDenotation:
        if denotation.kind is not DenotationKind.STRUCTURAL or denotation.structural is None:
            raise NonStructuralDenotationError(
                f"L4 materialization requires structural denotation, got {denotation.kind.value}"
            )
        return denotation.structural

    def _resolve_anchors(
        self,
        structural: StructuralDenotation,
        anchors: Mapping[str, LinkRef],
    ) -> dict[str, LinkRef]:
        resolved: dict[str, LinkRef] = {}
        for key in structural.anchors:
            if key not in anchors:
                raise MissingAnchorError(f"missing denotation anchor: {key}")
            ref = anchors[key]
            try:
                self._require_ref(ref)
            except UnknownLinkRefError as exc:
                raise MissingAnchorError(
                    f"anchor {key!r} resolves to unknown LinkRef {ref!r}"
                ) from exc
            resolved[key] = ref
        return resolved

    @staticmethod
    def _resolve_ref(
        ref: DenotationRef,
        anchors: Mapping[str, LinkRef],
        local_nodes: Mapping[int, LinkRef],
    ) -> LinkRef:
        if ref.kind is DenotationRefKind.ANCHOR:
            assert ref.anchor is not None
            return anchors[ref.anchor]
        assert ref.node is not None
        return local_nodes[ref.node]

    def _allocate_ref(self) -> LinkRef:
        ref = self._next_ref
        while ref in self._links:
            ref += 1
        self._next_ref = ref + 1
        return ref

    def _insert_link(self, ref: LinkRef, record: LinkRecord) -> None:
        pair = (record.start, record.end)
        if ref in self._links:
            raise InvalidInitialGraphError(f"duplicate LinkRef: {ref}")
        if pair in self._exact:
            raise InvalidInitialGraphError(f"duplicate canonical link pair: {pair}")

        self._links[ref] = record
        self._exact[pair] = ref
        self._outgoing.setdefault(record.start, set()).add(ref)
        self._incoming.setdefault(record.end, set()).add(ref)

    def _require_ref(self, ref: LinkRef) -> None:
        if ref not in self._links:
            raise UnknownLinkRefError(f"unknown LinkRef: {ref}")

    @staticmethod
    def _discard_index(
        index: dict[LinkRef, set[LinkRef]],
        key: LinkRef,
        ref: LinkRef,
    ) -> None:
        refs = index.get(key)
        if refs is None:
            return
        refs.discard(ref)
        if not refs:
            del index[key]
