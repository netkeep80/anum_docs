"""Storage-neutral exact-occurrence binary-link network for Foundation-v2 Gate P.

This module is intentionally smaller than the MTS language.  A semantic link has
exactly two fields, ``start`` and ``end``.  Context, dictionary, theory, act,
source, equality, token and AST roles are *not* link tags; higher layers may
represent those roles with ordinary link occurrences.

``OccurrenceRef`` is network-local identity.  A portable snapshot stores local
slots, but loading it creates a fresh identity scope.  Consequently a backend
address, a snapshot slot and a runtime occurrence ref are deliberately not one
universal identifier.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable


class LinkNetworkError(ValueError):
    """Invalid exact-occurrence network construction or access."""


@dataclass(frozen=True)
class OccurrenceRef:
    """Opaque identity of one exact occurrence inside one network scope."""

    _scope: object = field(repr=False)
    slot: int


@dataclass(frozen=True)
class Link:
    """The only primitive semantic shape: an ordered binary relation."""

    start: OccurrenceRef
    end: OccurrenceRef


@dataclass(frozen=True)
class NetworkSnapshot:
    """Portable transport topology; integer slots are snapshot-local only."""

    links: tuple[tuple[int, int], ...]
    root: int


class LinkNetwork:
    """Immutable finite network preserving exact occurrence multiplicity."""

    def __init__(
        self,
        scope: object,
        refs: tuple[OccurrenceRef, ...],
        links: tuple[Link, ...],
        root: OccurrenceRef,
    ) -> None:
        if not links:
            raise LinkNetworkError("LinkNetwork must contain at least one occurrence")
        if len(refs) != len(links):
            raise LinkNetworkError("reference/link cardinality mismatch")
        self._scope = scope
        self._refs = refs
        self._links = links
        self._root = root
        self._validate_ref(root)
        for ref, link in zip(refs, links, strict=True):
            if ref.slot < 0 or ref.slot >= len(refs):
                raise LinkNetworkError("invalid occurrence slot")
            self._validate_ref(link.start)
            self._validate_ref(link.end)

    @property
    def root(self) -> OccurrenceRef:
        """Return the distinguished root occurrence by exact reference."""

        return self._root

    @property
    def refs(self) -> tuple[OccurrenceRef, ...]:
        """Return all exact occurrence refs in deterministic local-slot order."""

        return self._refs

    def link(self, ref: OccurrenceRef) -> Link:
        """Read one exact occurrence; foreign-network refs are rejected."""

        self._validate_ref(ref)
        return self._links[ref.slot]

    def snapshot(self) -> NetworkSnapshot:
        """Return deterministic storage-neutral topology in local-slot form."""

        return NetworkSnapshot(
            links=tuple((link.start.slot, link.end.slot) for link in self._links),
            root=self._root.slot,
        )

    @classmethod
    def from_snapshot(cls, snapshot: NetworkSnapshot) -> "LinkNetwork":
        """Load topology into a fresh identity scope."""

        if not snapshot.links:
            raise LinkNetworkError("snapshot must contain at least one occurrence")
        count = len(snapshot.links)
        if snapshot.root < 0 or snapshot.root >= count:
            raise LinkNetworkError("snapshot root slot is out of range")
        for pair in snapshot.links:
            if len(pair) != 2:
                raise LinkNetworkError("snapshot link must contain start/end slots")
            start, end = pair
            if not isinstance(start, int) or not isinstance(end, int):
                raise LinkNetworkError("snapshot slots must be integers")
            if start < 0 or start >= count or end < 0 or end >= count:
                raise LinkNetworkError("snapshot endpoint slot is out of range")

        scope = object()
        refs = tuple(OccurrenceRef(scope, slot) for slot in range(count))
        links = tuple(Link(refs[start], refs[end]) for start, end in snapshot.links)
        return cls(scope, refs, links, refs[snapshot.root])

    def _validate_ref(self, ref: OccurrenceRef) -> None:
        if not isinstance(ref, OccurrenceRef):
            raise LinkNetworkError("expected OccurrenceRef")
        if ref._scope is not self._scope:
            raise LinkNetworkError("foreign occurrence reference")
        if ref.slot < 0 or ref.slot >= len(self._refs):
            raise LinkNetworkError("occurrence slot is out of range")
        if self._refs[ref.slot] is not ref:
            # Prevent hand-crafted refs with the right scope/slot from becoming
            # aliases of the exact object issued by this network/builder.
            raise LinkNetworkError("occurrence reference was not issued by this network")


class LinkNetworkBuilder:
    """Host construction utility for finite cyclic/shared exact networks.

    Reservation exists solely so cyclic endpoints can refer to occurrences that
    are defined later.  It is construction machinery, not an ontological link
    state or a semantic notion of an "undefined link".
    """

    def __init__(self) -> None:
        self._scope = object()
        self._refs: list[OccurrenceRef] = []
        self._links: list[Link | None] = []
        self._frozen = False

    def reserve(self) -> OccurrenceRef:
        self._require_mutable()
        ref = OccurrenceRef(self._scope, len(self._refs))
        self._refs.append(ref)
        self._links.append(None)
        return ref

    def define(
        self,
        ref: OccurrenceRef,
        start: OccurrenceRef,
        end: OccurrenceRef,
    ) -> None:
        self._require_mutable()
        self._validate_reserved(ref)
        self._validate_reserved(start)
        self._validate_reserved(end)
        if self._links[ref.slot] is not None:
            raise LinkNetworkError("occurrence is already defined")
        self._links[ref.slot] = Link(start, end)

    def define_many(
        self,
        definitions: Iterable[tuple[OccurrenceRef, OccurrenceRef, OccurrenceRef]],
    ) -> None:
        for ref, start, end in definitions:
            self.define(ref, start, end)

    def freeze(self, root: OccurrenceRef) -> LinkNetwork:
        self._require_mutable()
        self._validate_reserved(root)
        missing = [ref.slot for ref, link in zip(self._refs, self._links) if link is None]
        if missing:
            raise LinkNetworkError(f"unbound occurrences: {missing}")
        if not self._refs:
            raise LinkNetworkError("cannot freeze an empty network")

        refs = tuple(self._refs)
        links = tuple(link for link in self._links if link is not None)
        self._frozen = True
        return LinkNetwork(self._scope, refs, links, root)

    def _validate_reserved(self, ref: OccurrenceRef) -> None:
        if not isinstance(ref, OccurrenceRef):
            raise LinkNetworkError("expected OccurrenceRef")
        if ref._scope is not self._scope:
            raise LinkNetworkError("foreign occurrence reference")
        if ref.slot < 0 or ref.slot >= len(self._refs):
            raise LinkNetworkError("occurrence was not reserved by this builder")
        if self._refs[ref.slot] is not ref:
            raise LinkNetworkError("occurrence reference was not issued by this builder")

    def _require_mutable(self) -> None:
        if self._frozen:
            raise LinkNetworkError("builder is already frozen")
