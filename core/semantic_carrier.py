"""Finite cyclic carrier primitives for the accepted part of L1 v0.1.

This module deliberately does NOT implement the L2 operator ``=``. In
particular, ``carrier_isomorphic`` is an engineering check for exact rooted
finite carrier topology and must not be used as MTS equality while issue #79 is
open.
"""

from collections import deque
from dataclasses import dataclass


@dataclass(frozen=True)
class LinkNode:
    """One carrier node with ordered start/end references by node index."""

    start: int
    end: int


@dataclass(frozen=True)
class CarrierGraph:
    """Finite rooted graph of Link nodes; cycles and sharing are allowed."""

    nodes: tuple[LinkNode, ...]
    root: int

    def __post_init__(self) -> None:
        if not self.nodes:
            raise ValueError("CarrierGraph должен содержать хотя бы один LinkNode")
        if self.root < 0 or self.root >= len(self.nodes):
            raise ValueError(f"Некорректный root index: {self.root}")

        for index, node in enumerate(self.nodes):
            for role, target in (("start", node.start), ("end", node.end)):
                if target < 0 or target >= len(self.nodes):
                    raise ValueError(
                        f"Node {index}: {role} index {target} вне carrier"
                    )

    @property
    def root_node(self) -> LinkNode:
        return self.nodes[self.root]


def associative_root_carrier() -> CarrierGraph:
    """Return the minimal finite carrier ``root.start=root; root.end=root``."""

    return CarrierGraph(nodes=(LinkNode(start=0, end=0),), root=0)


def link_carrier(left: CarrierGraph, right: CarrierGraph) -> CarrierGraph:
    """Create a new Link whose ordered endpoints are two existing carriers.

    Inputs are copied into disjoint index spaces. Sharing inside each input is
    preserved; no semantic interning/equality is attempted here.
    """

    left_nodes = left.nodes
    right_offset = len(left_nodes)
    right_nodes = _shift_nodes(right.nodes, right_offset)

    root_index = len(left_nodes) + len(right_nodes)
    root = LinkNode(
        start=left.root,
        end=right.root + right_offset,
    )
    return CarrierGraph(
        nodes=left_nodes + right_nodes + (root,),
        root=root_index,
    )


def start_carrier(form: CarrierGraph) -> CarrierGraph:
    """Build a finite carrier with a self-closed start pole.

    ``start(F).start = start(F)`` and ``start(F).end = F``.
    """

    root_index = len(form.nodes)
    node = LinkNode(start=root_index, end=form.root)
    return CarrierGraph(nodes=form.nodes + (node,), root=root_index)


def end_carrier(form: CarrierGraph) -> CarrierGraph:
    """Build a finite carrier with a self-closed end pole.

    ``end(F).start = F`` and ``end(F).end = end(F)``.
    """

    root_index = len(form.nodes)
    node = LinkNode(start=form.root, end=root_index)
    return CarrierGraph(nodes=form.nodes + (node,), root=root_index)


def invert_root_carrier(form: CarrierGraph) -> CarrierGraph:
    """Create ``Link(original.end, original.start)`` without mutating input.

    The original carrier remains present as the endpoint substrate. This models
    inversion of one already distinguished concrete Link, not recursive
    inversion of all reachable links.
    """

    original = form.root_node
    root_index = len(form.nodes)
    inverse = LinkNode(start=original.end, end=original.start)
    return CarrierGraph(nodes=form.nodes + (inverse,), root=root_index)


def reachable_indices(graph: CarrierGraph) -> tuple[int, ...]:
    """Return deterministic BFS order of nodes reachable from the root."""

    seen: set[int] = set()
    order: list[int] = []
    queue = deque([graph.root])

    while queue:
        current = queue.popleft()
        if current in seen:
            continue
        seen.add(current)
        order.append(current)

        node = graph.nodes[current]
        queue.append(node.start)
        queue.append(node.end)

    return tuple(order)


def carrier_isomorphic(left: CarrierGraph, right: CarrierGraph) -> bool:
    """Check exact rooted finite carrier topology with ordered edges.

    This is intentionally stronger/different from generic coalgebraic
    bisimulation and is NOT the semantics of the L2 equality operator.
    The root mapping forces all subsequent mappings because ``start``/``end``
    edges are ordered. Sharing and cycle topology must match bijectively.
    """

    mapping: dict[int, int] = {left.root: right.root}
    reverse: dict[int, int] = {right.root: left.root}
    queue = deque([(left.root, right.root)])

    while queue:
        left_index, right_index = queue.popleft()
        left_node = left.nodes[left_index]
        right_node = right.nodes[right_index]

        for left_child, right_child in (
            (left_node.start, right_node.start),
            (left_node.end, right_node.end),
        ):
            mapped = mapping.get(left_child)
            if mapped is not None:
                if mapped != right_child:
                    return False
                continue

            reverse_mapped = reverse.get(right_child)
            if reverse_mapped is not None and reverse_mapped != left_child:
                return False

            mapping[left_child] = right_child
            reverse[right_child] = left_child
            queue.append((left_child, right_child))

    return (
        len(mapping) == len(reachable_indices(left))
        and len(reverse) == len(reachable_indices(right))
    )


def _shift_nodes(nodes: tuple[LinkNode, ...], offset: int) -> tuple[LinkNode, ...]:
    return tuple(
        LinkNode(start=node.start + offset, end=node.end + offset)
        for node in nodes
    )
