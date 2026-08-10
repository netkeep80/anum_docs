"""Storage-neutral binary-link network for the MTS Foundation-v2 reset.

A semantic MTS link is completely determined by its ordered poles. Therefore one
network state cannot contain two distinct semantic links with the same
``(start, end)`` pair.

``OccurrenceRef`` remains temporarily as a *technical handle* issued by one
runtime network/build scope. Its slot and Python object identity are useful for
finite cyclic construction and safe access, but they are not an additional MTS
identity field. Higher layers must not use a different handle as justification
for a second link with equal poles.

The builder API deliberately separates two cases:

* ``reserve`` + ``define`` is low-level construction machinery required for
  cycles and self-reference; defining a duplicate pair is rejected;
* ``ensure(start, end)`` is canonical materialization: it returns the already
  defined link for that pair or creates exactly one new link.

Snapshots contain transport-local integer slots only. Loading a snapshot issues
fresh runtime handles, but this says nothing about a new semantic identity: the
restored MTS network is still canonical by ordered poles.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable


class LinkNetworkError(ValueError):
    """Invalid canonical binary-link network construction or access."""


@dataclass(frozen=True)
class OccurrenceRef:
    """Network-local technical handle, not semantic identity of an MTS link."""

    _scope: object = field(repr=False)
    slot: int


@dataclass(frozen=True)
class Link:
    """The primitive semantic shape: one ordered pair of link handles."""

    start: OccurrenceRef
    end: OccurrenceRef


@dataclass(frozen=True)
class NetworkSnapshot:
    """Portable transport topology; integer slots are snapshot-local only."""

    links: tuple[tuple[int, int], ...]
    root: int


class LinkNetwork:
    """Immutable finite MTS network with exactly one link per ordered pole pair."""

    def __init__(
        self,
        scope: object,
        refs: tuple[OccurrenceRef, ...],
        links: tuple[Link, ...],
        root: OccurrenceRef,
    ) -> None:
        if not links:
            raise LinkNetworkError("LinkNetwork must contain at least one link")
        if len(refs) != len(links):
            raise LinkNetworkError("reference/link cardinality mismatch")
        self._scope = scope
        self._refs = refs
        self._links = links
        self._root = root
        self._validate_ref(root)

        pair_index: dict[tuple[OccurrenceRef, OccurrenceRef], OccurrenceRef] = {}
        for ref, link in zip(refs, links, strict=True):
            if ref.slot < 0 or ref.slot >= len(refs):
                raise LinkNetworkError("invalid link slot")
            self._validate_ref(link.start)
            self._validate_ref(link.end)
            pair = (link.start, link.end)
            existing = pair_index.get(pair)
            if existing is not None and existing is not ref:
                raise LinkNetworkError(
                    "duplicate semantic link pair is forbidden by MTS identity"
                )
            pair_index[pair] = ref
        self._pair_index = pair_index

    @property
    def root(self) -> OccurrenceRef:
        """Return the distinguished root through its runtime technical handle."""

        return self._root

    @property
    def refs(self) -> tuple[OccurrenceRef, ...]:
        """Return technical handles in deterministic local-slot order."""

        return self._refs

    def link(self, ref: OccurrenceRef) -> Link:
        """Read one link; foreign or forged runtime handles are rejected."""

        self._validate_ref(ref)
        return self._links[ref.slot]

    def find(self, start: OccurrenceRef, end: OccurrenceRef) -> OccurrenceRef | None:
        """Return the unique materialized link for ``(start,end)``, if present."""

        self._validate_ref(start)
        self._validate_ref(end)
        return self._pair_index.get((start, end))

    def snapshot(self) -> NetworkSnapshot:
        """Return deterministic storage-neutral topology in local-slot form."""

        return NetworkSnapshot(
            links=tuple((link.start.slot, link.end.slot) for link in self._links),
            root=self._root.slot,
        )

    def evolve(self) -> "LinkNetworkEvolutionBuilder":
        """Create an additive builder preserving the immutable base state.

        Existing runtime handles remain usable in the evolved state. New links
        may be added, but a pair already present in the base or the current
        evolution is always reused by :meth:`LinkNetworkEvolutionBuilder.ensure`
        and cannot be defined a second time.
        """

        return LinkNetworkEvolutionBuilder(self)

    @classmethod
    def from_snapshot(cls, snapshot: NetworkSnapshot) -> "LinkNetwork":
        """Load canonical topology and issue fresh runtime technical handles."""

        if not snapshot.links:
            raise LinkNetworkError("snapshot must contain at least one link")
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
            raise LinkNetworkError("expected network link handle")
        if ref._scope is not self._scope:
            raise LinkNetworkError("foreign network link handle")
        if ref.slot < 0 or ref.slot >= len(self._refs):
            raise LinkNetworkError("link handle slot is out of range")
        if self._refs[ref.slot] is not ref:
            raise LinkNetworkError("link handle was not issued by this network")


class LinkNetworkBuilder:
    """Finite construction utility for canonical cyclic/shared MTS networks.

    Reservation exists solely so cyclic endpoints can refer to links that are
    defined later. A reserved handle is construction machinery, not an
    ontological "undefined link" and not a source of semantic identity.
    """

    def __init__(self) -> None:
        self._scope = object()
        self._refs: list[OccurrenceRef] = []
        self._links: list[Link | None] = []
        self._pair_index: dict[
            tuple[OccurrenceRef, OccurrenceRef], OccurrenceRef
        ] = {}
        self._frozen = False

    def reserve(self) -> OccurrenceRef:
        """Reserve one technical handle for low-level cyclic construction."""

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
        """Define one reserved link, rejecting an already-defined equal pair."""

        self._require_mutable()
        self._validate_reserved(ref)
        self._validate_reserved(start)
        self._validate_reserved(end)
        if self._links[ref.slot] is not None:
            raise LinkNetworkError("reserved link is already defined")

        pair = (start, end)
        existing = self._pair_index.get(pair)
        if existing is not None and existing is not ref:
            raise LinkNetworkError(
                "duplicate semantic link pair is forbidden by MTS identity"
            )
        self._links[ref.slot] = Link(start, end)
        self._pair_index[pair] = ref

    def ensure(self, start: OccurrenceRef, end: OccurrenceRef) -> OccurrenceRef:
        """Return the canonical link for a pair, materializing it when absent."""

        self._require_mutable()
        self._validate_reserved(start)
        self._validate_reserved(end)
        existing = self._pair_index.get((start, end))
        if existing is not None:
            return existing
        ref = self.reserve()
        self.define(ref, start, end)
        return ref

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
            raise LinkNetworkError(f"unbound reserved links: {missing}")
        if not self._refs:
            raise LinkNetworkError("cannot freeze an empty network")

        refs = tuple(self._refs)
        links = tuple(link for link in self._links if link is not None)
        self._frozen = True
        return LinkNetwork(self._scope, refs, links, root)

    def _validate_reserved(self, ref: OccurrenceRef) -> None:
        if not isinstance(ref, OccurrenceRef):
            raise LinkNetworkError("expected reserved link handle")
        if ref._scope is not self._scope:
            raise LinkNetworkError("foreign reserved link handle")
        if ref.slot < 0 or ref.slot >= len(self._refs):
            raise LinkNetworkError("link handle was not reserved by this builder")
        if self._refs[ref.slot] is not ref:
            raise LinkNetworkError("link handle was not issued by this builder")

    def _require_mutable(self) -> None:
        if self._frozen:
            raise LinkNetworkError("builder is already frozen")


class LinkNetworkEvolutionBuilder:
    """Additive immutable-state builder with canonical pair reuse.

    The base network is never mutated. Existing handles are retained only as
    runtime access handles. New ``define`` calls cannot duplicate any ordered
    pair; ``ensure`` reuses the existing link whenever the pair is already
    materialized.
    """

    def __init__(self, base: LinkNetwork) -> None:
        self._base = base
        self._scope = base._scope
        self._refs: list[OccurrenceRef] = list(base._refs)
        self._links: list[Link | None] = list(base._links)
        self._pair_index: dict[
            tuple[OccurrenceRef, OccurrenceRef], OccurrenceRef
        ] = dict(base._pair_index)
        self._base_count = len(self._refs)
        self._frozen = False

    @property
    def base_count(self) -> int:
        """Number of links inherited from the immutable base state."""

        return self._base_count

    def reserve(self) -> OccurrenceRef:
        """Reserve a technical handle for a genuinely new cyclic link."""

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
        """Define a new reserved link; duplicate ordered pairs are rejected."""

        self._require_mutable()
        self._validate_reserved(ref)
        self._validate_reserved(start)
        self._validate_reserved(end)
        if ref.slot < self._base_count:
            raise LinkNetworkError("base link is immutable during evolution")
        if self._links[ref.slot] is not None:
            raise LinkNetworkError("reserved evolved link is already defined")

        pair = (start, end)
        existing = self._pair_index.get(pair)
        if existing is not None and existing is not ref:
            raise LinkNetworkError(
                "duplicate semantic link pair is forbidden by MTS identity"
            )
        self._links[ref.slot] = Link(start, end)
        self._pair_index[pair] = ref

    def ensure(self, start: OccurrenceRef, end: OccurrenceRef) -> OccurrenceRef:
        """Return the canonical link for a pair, appending it only when absent."""

        self._require_mutable()
        self._validate_reserved(start)
        self._validate_reserved(end)
        existing = self._pair_index.get((start, end))
        if existing is not None:
            return existing
        ref = self.reserve()
        self.define(ref, start, end)
        return ref

    def define_many(
        self,
        definitions: Iterable[tuple[OccurrenceRef, OccurrenceRef, OccurrenceRef]],
    ) -> None:
        for ref, start, end in definitions:
            self.define(ref, start, end)

    def freeze(self, root: OccurrenceRef | None = None) -> LinkNetwork:
        """Return a new immutable canonical state in the same runtime scope."""

        self._require_mutable()
        selected_root = self._base.root if root is None else root
        self._validate_reserved(selected_root)
        missing = [
            ref.slot
            for ref, link in zip(self._refs[self._base_count :], self._links[self._base_count :])
            if link is None
        ]
        if missing:
            raise LinkNetworkError(f"unbound evolved links: {missing}")

        refs = tuple(self._refs)
        links = tuple(link for link in self._links if link is not None)
        self._frozen = True
        return LinkNetwork(self._scope, refs, links, selected_root)

    def _validate_reserved(self, ref: OccurrenceRef) -> None:
        if not isinstance(ref, OccurrenceRef):
            raise LinkNetworkError("expected network link handle")
        if ref._scope is not self._scope:
            raise LinkNetworkError("foreign network link handle")
        if ref.slot < 0 or ref.slot >= len(self._refs):
            raise LinkNetworkError("link handle was not reserved in this runtime scope")
        if self._refs[ref.slot] is not ref:
            raise LinkNetworkError("link handle was not issued by this runtime scope")

    def _require_mutable(self) -> None:
        if self._frozen:
            raise LinkNetworkError("evolution builder is already frozen")
