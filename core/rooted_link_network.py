"""Rooted canonical binary-link network for the MTS semantic reset.

The semantic source of distinction is not a runtime pointer. MTS distinction is
rooted in ostensive self-closure and then propagates through already-distinguished
poles.

The semantic construction forms are therefore:

    R = R ⟼ R       fully self-closed root
    S = S ⟼ e       start-self-closed form (♂e)
    E = b ⟼ E       end-self-closed form (b♀)
    X = b ⟼ e       complete form

Only the current link may be referenced before it is defined, and only in the
self-closed pole(s) shown above. Every other pole must already be distinguished.
This makes distinction constructive and rooted: arbitrary mutually-recursive
technical handles cannot manufacture semantic identity.

For already-distinguished poles, one ordered pair denotes one semantic link.
The pair index therefore includes self-closed forms as well: after ``S=S⟼e``
has been constructed, asking for the complete pair ``(S,e)`` returns ``S``.
Likewise ``ensure(R,R)`` returns the root.

``LinkRef`` is a network-local technical access handle. Its slot/object identity is not an MTS identity component.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable


class LinkNetworkError(ValueError):
    """Invalid rooted/canonical binary-link network construction or access."""


@dataclass(frozen=True)
class LinkRef:
    """Network-local technical handle, not semantic identity of an MTS link."""

    _scope: object = field(repr=False)
    slot: int


@dataclass(frozen=True)
class Link:
    """Primitive binary view of one semantic MTS link."""

    start: LinkRef
    end: LinkRef


@dataclass(frozen=True)
class NetworkSnapshot:
    """Portable transport topology; integer slots are snapshot-local only."""

    links: tuple[tuple[int, int], ...]
    root: int


class LinkNetwork:
    """Immutable finite network whose distinction is rooted in self-closure."""

    def __init__(
        self,
        scope: object,
        refs: tuple[LinkRef, ...],
        links: tuple[Link, ...],
        root: LinkRef,
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

        for ref, link in zip(refs, links, strict=True):
            if ref.slot < 0 or ref.slot >= len(refs):
                raise LinkNetworkError("invalid link slot")
            self._validate_ref(link.start)
            self._validate_ref(link.end)

        root_link = self._links[root.slot]
        if root_link.start is not root or root_link.end is not root:
            raise LinkNetworkError(
                "distinguished root must be fully self-closed: R = R ⟼ R"
            )

        self._pair_index: dict[
            tuple[LinkRef, LinkRef], LinkRef
        ] = {}
        self._start_self_index: dict[LinkRef, LinkRef] = {}
        self._end_self_index: dict[LinkRef, LinkRef] = {}
        self._validate_rooted_canonical_structure()

    @property
    def root(self) -> LinkRef:
        """Return the distinguished unique fully self-closed root."""

        return self._root

    @property
    def refs(self) -> tuple[LinkRef, ...]:
        """Return canonical semantic-link handles in local storage order."""

        return self._refs

    def link(self, ref: LinkRef) -> Link:
        """Read one link; foreign or forged runtime handles are rejected."""

        self._validate_ref(ref)
        return self._links[ref.slot]

    def find(self, start: LinkRef, end: LinkRef) -> LinkRef | None:
        """Return the unique materialized link for an already-distinguished pair."""

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
        """Create an additive builder in the same technical access scope."""

        return LinkNetworkEvolutionBuilder(self)

    @classmethod
    def from_snapshot(cls, snapshot: NetworkSnapshot) -> "LinkNetwork":
        """Load and validate a rooted canonical semantic snapshot.

        Arbitrary physical graphs with unresolved mutual cycles belong at a
        separate import/canonicalization boundary. The semantic core accepts only
        a topology whose links can all be distinguished from the selected root by
        the four ostensive construction forms.
        """

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
        refs = tuple(LinkRef(scope, slot) for slot in range(count))
        links = tuple(Link(refs[start], refs[end]) for start, end in snapshot.links)
        return cls(scope, refs, links, refs[snapshot.root])

    def _validate_rooted_canonical_structure(self) -> None:
        root = self._root
        unresolved = set(self._refs)
        resolved: set[LinkRef] = set()

        self._register_resolved(root)
        resolved.add(root)
        unresolved.remove(root)

        while unresolved:
            progressed = False
            for ref in tuple(unresolved):
                link = self._links[ref.slot]
                start_self = link.start is ref
                end_self = link.end is ref

                if start_self and end_self:
                    raise LinkNetworkError(
                        "fully self-closed link is unique; only the root may have this form"
                    )

                if start_self:
                    if link.end not in resolved:
                        continue
                elif end_self:
                    if link.start not in resolved:
                        continue
                else:
                    if link.start not in resolved or link.end not in resolved:
                        continue

                self._register_resolved(ref)
                resolved.add(ref)
                unresolved.remove(ref)
                progressed = True

            if not progressed:
                slots = sorted(ref.slot for ref in unresolved)
                raise LinkNetworkError(
                    "links are not structurally distinguishable from the root; "
                    f"unresolved slots: {slots}"
                )

    def _register_resolved(self, ref: LinkRef) -> None:
        link = self._links[ref.slot]
        start_self = link.start is ref
        end_self = link.end is ref

        if start_self and end_self:
            if ref is not self._root:
                raise LinkNetworkError("only the distinguished root may be fully self-closed")
        elif start_self:
            existing = self._start_self_index.get(link.end)
            if existing is not None and existing is not ref:
                raise LinkNetworkError(
                    "start-self-closed form is unique for each distinguished end"
                )
            self._start_self_index[link.end] = ref
        elif end_self:
            existing = self._end_self_index.get(link.start)
            if existing is not None and existing is not ref:
                raise LinkNetworkError(
                    "end-self-closed form is unique for each distinguished start"
                )
            self._end_self_index[link.start] = ref

        pair = (link.start, link.end)
        existing = self._pair_index.get(pair)
        if existing is not None and existing is not ref:
            raise LinkNetworkError(
                "duplicate semantic link pair is forbidden by MTS identity"
            )
        self._pair_index[pair] = ref

    def _validate_ref(self, ref: LinkRef) -> None:
        if not isinstance(ref, LinkRef):
            raise LinkNetworkError("expected network link handle")
        if ref._scope is not self._scope:
            raise LinkNetworkError("foreign network link handle")
        if ref.slot < 0 or ref.slot >= len(self._refs):
            raise LinkNetworkError("link handle slot is out of range")
        if self._refs[ref.slot] is not ref:
            raise LinkNetworkError("link handle was not issued by this network")


class LinkNetworkBuilder:
    """Construct a semantic network outward from self-closure and root.

    ``reserve``/``define`` are low-level construction primitives. They do not
    create identity by reservation. ``define`` requires every non-self pole to be
    already defined, so a technical forward reference cannot create a new MTS
    distinction.

    Prefer the semantic constructors:

    * :meth:`ensure_root`
    * :meth:`ensure_start_self_closed`
    * :meth:`ensure_end_self_closed`
    * :meth:`ensure`
    """

    def __init__(self) -> None:
        self._scope = object()
        self._refs: list[LinkRef] = []
        self._links: list[Link | None] = []
        self._pair_index: dict[
            tuple[LinkRef, LinkRef], LinkRef
        ] = {}
        self._start_self_index: dict[LinkRef, LinkRef] = {}
        self._end_self_index: dict[LinkRef, LinkRef] = {}
        self._root: LinkRef | None = None
        self._frozen = False

    def reserve(self) -> LinkRef:
        """Reserve a technical handle; reservation alone has no semantic meaning."""

        self._require_mutable()
        ref = LinkRef(self._scope, len(self._refs))
        self._refs.append(ref)
        self._links.append(None)
        return ref

    def ensure_root(self) -> LinkRef:
        """Return the unique fully self-closed root, constructing it once."""

        self._require_mutable()
        if self._root is not None:
            return self._root
        root = self.reserve()
        self.define(root, root, root)
        return root

    def ensure_start_self_closed(self, end: LinkRef) -> LinkRef:
        """Return the unique ``S = S ⟼ end`` form for a distinguished ``end``."""

        self._require_mutable()
        self._validate_defined(end)
        existing = self._start_self_index.get(end)
        if existing is not None:
            return existing
        ref = self.reserve()
        self.define(ref, ref, end)
        return ref

    def ensure_end_self_closed(self, start: LinkRef) -> LinkRef:
        """Return the unique ``E = start ⟼ E`` form for a distinguished ``start``."""

        self._require_mutable()
        self._validate_defined(start)
        existing = self._end_self_index.get(start)
        if existing is not None:
            return existing
        ref = self.reserve()
        self.define(ref, start, ref)
        return ref

    def define(
        self,
        ref: LinkRef,
        start: LinkRef,
        end: LinkRef,
    ) -> None:
        """Define one reserved link from already-distinguished external poles."""

        self._require_mutable()
        self._validate_reserved(ref)
        self._validate_reserved(start)
        self._validate_reserved(end)
        if self._links[ref.slot] is not None:
            raise LinkNetworkError("reserved link is already defined")

        start_self = start is ref
        end_self = end is ref
        if not start_self:
            self._validate_defined(start)
        if not end_self:
            self._validate_defined(end)

        if start_self and end_self:
            if self._root is not None and self._root is not ref:
                raise LinkNetworkError(
                    "fully self-closed link is unique; a second root is forbidden"
                )
        elif start_self:
            existing = self._start_self_index.get(end)
            if existing is not None and existing is not ref:
                raise LinkNetworkError(
                    "start-self-closed form is unique for each distinguished end"
                )
        elif end_self:
            existing = self._end_self_index.get(start)
            if existing is not None and existing is not ref:
                raise LinkNetworkError(
                    "end-self-closed form is unique for each distinguished start"
                )

        pair = (start, end)
        existing_pair = self._pair_index.get(pair)
        if existing_pair is not None and existing_pair is not ref:
            raise LinkNetworkError(
                "duplicate semantic link pair is forbidden by MTS identity"
            )

        self._links[ref.slot] = Link(start, end)
        self._pair_index[pair] = ref
        if start_self and end_self:
            self._root = ref
        elif start_self:
            self._start_self_index[end] = ref
        elif end_self:
            self._end_self_index[start] = ref

    def ensure(self, start: LinkRef, end: LinkRef) -> LinkRef:
        """Return the unique link for an already-distinguished ordered pair.

        This operation constructs the complete form only when the pair is absent.
        Because the pair index includes root and one-sided self-closed forms,
        ``ensure(R,R)`` returns ``R`` and ``ensure(S,e)`` returns ``S`` for an
        existing ``S=S⟼e``.
        """

        self._require_mutable()
        self._validate_defined(start)
        self._validate_defined(end)
        existing = self._pair_index.get((start, end))
        if existing is not None:
            return existing
        ref = self.reserve()
        self.define(ref, start, end)
        return ref

    def define_many(
        self,
        definitions: Iterable[tuple[LinkRef, LinkRef, LinkRef]],
    ) -> None:
        """Define in semantic dependency order; arbitrary forward cycles reject."""

        for ref, start, end in definitions:
            self.define(ref, start, end)

    def freeze(self, root: LinkRef | None = None) -> LinkNetwork:
        self._require_mutable()
        selected_root = self._root if root is None else root
        if selected_root is None:
            raise LinkNetworkError("cannot freeze a network before defining the root")
        self._validate_defined(selected_root)
        if selected_root is not self._root:
            raise LinkNetworkError("selected root must be the unique fully self-closed link")
        missing = [
            ref.slot for ref, link in zip(self._refs, self._links, strict=True) if link is None
        ]
        if missing:
            raise LinkNetworkError(f"unbound reserved links: {missing}")

        refs = tuple(self._refs)
        links = tuple(link for link in self._links if link is not None)
        self._frozen = True
        return LinkNetwork(self._scope, refs, links, selected_root)

    def _validate_reserved(self, ref: LinkRef) -> None:
        if not isinstance(ref, LinkRef):
            raise LinkNetworkError("expected reserved link handle")
        if ref._scope is not self._scope:
            raise LinkNetworkError("foreign reserved link handle")
        if ref.slot < 0 or ref.slot >= len(self._refs):
            raise LinkNetworkError("link handle was not reserved by this builder")
        if self._refs[ref.slot] is not ref:
            raise LinkNetworkError("link handle was not issued by this builder")

    def _validate_defined(self, ref: LinkRef) -> None:
        self._validate_reserved(ref)
        if self._links[ref.slot] is None:
            raise LinkNetworkError(
                "non-self pole must already be structurally distinguished"
            )

    def _require_mutable(self) -> None:
        if self._frozen:
            raise LinkNetworkError("builder is already frozen")


class LinkNetworkEvolutionBuilder:
    """Add links outward from an already-distinguished immutable base network."""

    def __init__(self, base: LinkNetwork) -> None:
        self._base = base
        self._scope = base._scope
        self._refs: list[LinkRef] = list(base._refs)
        self._links: list[Link | None] = list(base._links)
        self._pair_index = dict(base._pair_index)
        self._start_self_index = dict(base._start_self_index)
        self._end_self_index = dict(base._end_self_index)
        self._base_count = len(self._refs)
        self._frozen = False

    @property
    def base_count(self) -> int:
        return self._base_count

    def reserve(self) -> LinkRef:
        self._require_mutable()
        ref = LinkRef(self._scope, len(self._refs))
        self._refs.append(ref)
        self._links.append(None)
        return ref

    def ensure_root(self) -> LinkRef:
        """Evolution preserves and returns the already-distinguished root."""

        self._require_mutable()
        return self._base.root

    def ensure_start_self_closed(self, end: LinkRef) -> LinkRef:
        self._require_mutable()
        self._validate_defined(end)
        existing = self._start_self_index.get(end)
        if existing is not None:
            return existing
        ref = self.reserve()
        self.define(ref, ref, end)
        return ref

    def ensure_end_self_closed(self, start: LinkRef) -> LinkRef:
        self._require_mutable()
        self._validate_defined(start)
        existing = self._end_self_index.get(start)
        if existing is not None:
            return existing
        ref = self.reserve()
        self.define(ref, start, ref)
        return ref

    def define(
        self,
        ref: LinkRef,
        start: LinkRef,
        end: LinkRef,
    ) -> None:
        self._require_mutable()
        self._validate_reserved(ref)
        self._validate_reserved(start)
        self._validate_reserved(end)
        if ref.slot < self._base_count:
            raise LinkNetworkError("base link is immutable during evolution")
        if self._links[ref.slot] is not None:
            raise LinkNetworkError("reserved evolved link is already defined")

        start_self = start is ref
        end_self = end is ref
        if not start_self:
            self._validate_defined(start)
        if not end_self:
            self._validate_defined(end)

        if start_self and end_self:
            raise LinkNetworkError(
                "fully self-closed link is unique; evolution cannot create another root"
            )
        if start_self:
            existing = self._start_self_index.get(end)
            if existing is not None and existing is not ref:
                raise LinkNetworkError(
                    "start-self-closed form is unique for each distinguished end"
                )
        elif end_self:
            existing = self._end_self_index.get(start)
            if existing is not None and existing is not ref:
                raise LinkNetworkError(
                    "end-self-closed form is unique for each distinguished start"
                )

        pair = (start, end)
        existing_pair = self._pair_index.get(pair)
        if existing_pair is not None and existing_pair is not ref:
            raise LinkNetworkError(
                "duplicate semantic link pair is forbidden by MTS identity"
            )

        self._links[ref.slot] = Link(start, end)
        self._pair_index[pair] = ref
        if start_self:
            self._start_self_index[end] = ref
        elif end_self:
            self._end_self_index[start] = ref

    def ensure(self, start: LinkRef, end: LinkRef) -> LinkRef:
        self._require_mutable()
        self._validate_defined(start)
        self._validate_defined(end)
        existing = self._pair_index.get((start, end))
        if existing is not None:
            return existing
        ref = self.reserve()
        self.define(ref, start, end)
        return ref

    def define_many(
        self,
        definitions: Iterable[tuple[LinkRef, LinkRef, LinkRef]],
    ) -> None:
        for ref, start, end in definitions:
            self.define(ref, start, end)

    def freeze(self, root: LinkRef | None = None) -> LinkNetwork:
        self._require_mutable()
        selected_root = self._base.root if root is None else root
        self._validate_defined(selected_root)
        if selected_root is not self._base.root:
            raise LinkNetworkError("evolution cannot replace the distinguished root")
        missing = [
            ref.slot
            for ref, link in zip(
                self._refs[self._base_count :],
                self._links[self._base_count :],
                strict=True,
            )
            if link is None
        ]
        if missing:
            raise LinkNetworkError(f"unbound evolved links: {missing}")

        refs = tuple(self._refs)
        links = tuple(link for link in self._links if link is not None)
        self._frozen = True
        return LinkNetwork(self._scope, refs, links, selected_root)

    def _validate_reserved(self, ref: LinkRef) -> None:
        if not isinstance(ref, LinkRef):
            raise LinkNetworkError("expected network link handle")
        if ref._scope is not self._scope:
            raise LinkNetworkError("foreign network link handle")
        if ref.slot < 0 or ref.slot >= len(self._refs):
            raise LinkNetworkError("link handle was not reserved in this runtime scope")
        if self._refs[ref.slot] is not ref:
            raise LinkNetworkError("link handle was not issued by this runtime scope")

    def _validate_defined(self, ref: LinkRef) -> None:
        self._validate_reserved(ref)
        if self._links[ref.slot] is None:
            raise LinkNetworkError(
                "non-self pole must already be structurally distinguished"
            )

    def _require_mutable(self) -> None:
        if self._frozen:
            raise LinkNetworkError("evolution builder is already frozen")
