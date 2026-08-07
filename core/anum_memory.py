"""Minimal symbolic L4 test double for load/find/realize invariants.

Quotation belongs to the real L3 protocol in ``core.anum_protocol``. This test
double intentionally has no fake ``Quote`` type and no context-free ``project_K``
method.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Link:
    left: str
    right: str


@dataclass(frozen=True)
class SymbolicAnum:
    """Test-only symbolic description whose denotation is ``left ⟼ right``."""

    left: str
    right: str


def symbolic_denotation(anum: SymbolicAnum | Link) -> Link:
    if isinstance(anum, SymbolicAnum):
        return Link(anum.left, anum.right)
    if isinstance(anum, Link):
        return anum
    raise TypeError(f"Неподдерживаемое symbolic anum значение: {anum!r}")


class AnumMemory:
    """Small test double retained until the real L4 memory in issue #72."""

    def __init__(self):
        self.raw_forms: set[SymbolicAnum] = set()
        self.links: set[Link] = set()

    def load(self, anum: SymbolicAnum) -> SymbolicAnum:
        self.raw_forms.add(anum)
        return anum

    def decode(self, anum: SymbolicAnum) -> SymbolicAnum:
        return anum

    def find(self, anum: SymbolicAnum) -> bool:
        return symbolic_denotation(anum) in self.links

    def realize(self, anum: SymbolicAnum) -> Link:
        projected = symbolic_denotation(anum)
        self.links.add(projected)
        return projected
