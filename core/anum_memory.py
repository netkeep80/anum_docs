"""Finite explicit L4 ordered-pair memory used by current MTS tests and queries.

This module is intentionally independent of ANUM stream denotation. It stores a
caller-supplied finite snapshot of local LinkRef handles, offers read-only pair
queries, and exposes explicit ``intern_link`` / ``delete_link`` effects. Local
handles are storage coordinates, not an additional source of semantic Link
identity. Imported-carrier admissibility beyond this finite memory-view boundary
is not defined here.
"""

from dataclasses import dataclass
from typing import Mapping


class UnknownLinkRefError(KeyError):
    pass


class LinkInUseError(ValueError):
    pass


class InvalidInitialGraphError(ValueError):
    pass


@dataclass(frozen=True)
class MemorySnapshot:
    links: tuple[tuple[int, int, int], ...]


class AnumMemory:
    """In-memory finite pair store with explicit read/effect separation."""

    def __init__(
        self,
        *,
        initial_links: Mapping[int, tuple[int, int]] | None = None,
    ) -> None:
        self._links: dict[int, tuple[int, int]] = {}
        self._by_poles: dict[tuple[int, int], int] = {}
        self._outgoing: dict[int, set[int]] = {}
        self._incoming: dict[int, set[int]] = {}
        self._next_ref = 0

        if initial_links:
            self._load_initial_graph(initial_links)

    @property
    def link_count(self) -> int:
        return len(self._links)

    def snapshot(self) -> MemorySnapshot:
        return MemorySnapshot(
            links=tuple(
                (ref, start, end)
                for ref, (start, end) in sorted(self._links.items())
            )
        )

    def has_link(self, ref: int) -> bool:
        return ref in self._links

    def all_links(self) -> tuple[int, ...]:
        return tuple(sorted(self._links))

    def poles(self, link: int) -> tuple[int, int]:
        try:
            return self._links[link]
        except KeyError as exc:
            raise UnknownLinkRefError(f"Unknown LinkRef: {link}") from exc

    def find_link(self, start: int, end: int) -> int | None:
        return self._by_poles.get((start, end))

    def find_start_projection(self, form: int) -> int | None:
        for link in self._incoming.get(form, ()):
            if self._links.get(link) == (link, form):
                return link
        return None

    def find_end_projection(self, form: int) -> int | None:
        for link in self._outgoing.get(form, ()):
            if self._links.get(link) == (form, link):
                return link
        return None

    def outgoing(self, start: int) -> tuple[int, ...]:
        return tuple(sorted(self._outgoing.get(start, ())))

    def incoming(self, end: int) -> tuple[int, ...]:
        return tuple(sorted(self._incoming.get(end, ())))

    def intern_link(self, start: int, end: int) -> int:
        """Explicitly materialize an absent local pair or reuse the existing one."""

        self._assert_known_ref(start)
        self._assert_known_ref(end)

        existing = self._by_poles.get((start, end))
        if existing is not None:
            return existing

        ref = self._next_ref
        self._next_ref += 1
        while ref in self._links:
            ref = self._next_ref
            self._next_ref += 1

        self._insert_link(ref, start, end)
        return ref

    def delete_link(self, link: int) -> None:
        """Delete one local pair only when no other stored link references it."""

        self._assert_known_ref(link)
        users = {
            ref
            for ref in self._incoming.get(link, set()) | self._outgoing.get(link, set())
            if ref != link
        }
        if users:
            raise LinkInUseError(
                f"LinkRef {link} is referenced by stored links: {sorted(users)}"
            )

        start, end = self._links.pop(link)
        self._by_poles.pop((start, end), None)
        self._outgoing.get(start, set()).discard(link)
        self._incoming.get(end, set()).discard(link)
        if not self._outgoing.get(start):
            self._outgoing.pop(start, None)
        if not self._incoming.get(end):
            self._incoming.pop(end, None)

    def _load_initial_graph(self, initial_links: Mapping[int, tuple[int, int]]) -> None:
        refs = set(initial_links)
        for ref, poles in initial_links.items():
            if not isinstance(ref, int) or isinstance(ref, bool) or ref < 0:
                raise InvalidInitialGraphError("LinkRef must be a non-negative integer")
            if (
                not isinstance(poles, tuple)
                or len(poles) != 2
                or any(
                    not isinstance(item, int) or isinstance(item, bool) or item < 0
                    for item in poles
                )
            ):
                raise InvalidInitialGraphError(
                    f"Invalid pole pair for LinkRef {ref}: {poles!r}"
                )
            if poles[0] not in refs or poles[1] not in refs:
                raise InvalidInitialGraphError(
                    f"Initial graph is not closed at LinkRef {ref}: {poles!r}"
                )

        seen_pairs: dict[tuple[int, int], int] = {}
        for ref, poles in initial_links.items():
            previous = seen_pairs.get(poles)
            if previous is not None:
                raise InvalidInitialGraphError(
                    f"Duplicate ordered pair {poles!r} for LinkRefs {previous} and {ref}"
                )
            seen_pairs[poles] = ref

        for ref, (start, end) in sorted(initial_links.items()):
            self._insert_link(ref, start, end)

        self._next_ref = max(refs, default=-1) + 1

    def _insert_link(self, ref: int, start: int, end: int) -> None:
        self._links[ref] = (start, end)
        self._by_poles[(start, end)] = ref
        self._outgoing.setdefault(start, set()).add(ref)
        self._incoming.setdefault(end, set()).add(ref)

    def _assert_known_ref(self, ref: int) -> None:
        if ref not in self._links:
            raise UnknownLinkRefError(f"Unknown LinkRef: {ref}")
