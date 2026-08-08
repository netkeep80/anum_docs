"""Recursive root-context Anum denotation for the accepted v0.2 subset.

The grammar composes the already accepted protocol atoms and pair semantics.
Brackets are structural grouping only in root recursive context; quote/relative
behavior remains owned by ``core.anum_protocol``. No memory backend is used.
"""

from dataclasses import dataclass

from core.anum_denotation import (
    AnumDenotation,
    DenotationNode,
    DenotationRef,
    DenotationRefKind,
    StructuralDenotation,
)
from core.anum_model import AnumForm, ProjectionContext
from core.anum_pair_denotation import (
    PROTOCOL_ONE_ANCHOR,
    PROTOCOL_ZERO_ANCHOR,
    denotate_anum_pair_subset,
)
from core.anum_parser import normalize_raw_form


class RecursiveAnumDecodeError(ValueError):
    """The raw carrier is outside the accepted canonical recursive subset."""


@dataclass(frozen=True)
class RecursiveAnumTree:
    atom: str | None = None
    start: "RecursiveAnumTree | None" = None
    end: "RecursiveAnumTree | None" = None

    @staticmethod
    def atom_tree(atom: str) -> "RecursiveAnumTree":
        if atom not in ("0", "1"):
            raise ValueError("recursive Anum atom must be 0 or 1")
        return RecursiveAnumTree(atom=atom)

    @staticmethod
    def link_tree(
        start: "RecursiveAnumTree",
        end: "RecursiveAnumTree",
    ) -> "RecursiveAnumTree":
        return RecursiveAnumTree(start=start, end=end)

    def __post_init__(self) -> None:
        if self.atom is not None:
            if self.atom not in ("0", "1") or self.start is not None or self.end is not None:
                raise ValueError("atom tree must contain only atom 0 or 1")
            return
        if self.start is None or self.end is None:
            raise ValueError("link tree requires both start and end")

    @property
    def is_atom(self) -> bool:
        return self.atom is not None


def denotate_recursive_anum(
    form: AnumForm,
    context: ProjectionContext,
) -> AnumDenotation:
    """Project the accepted recursive root subset without any L4 effects."""

    base = denotate_anum_pair_subset(form, context)
    if context is not ProjectionContext.ROOT or base.structural is not None:
        return base

    source = normalize_raw_form(form)
    if source in ("[[", "]]"):
        return base

    try:
        tree = decode_recursive_tree(source)
    except RecursiveAnumDecodeError:
        return base
    return recursive_tree_denotation(tree)


def decode_recursive_tree(raw: str) -> RecursiveAnumTree:
    """Decode one canonical root raw string into an occurrence tree."""

    if raw in ("[]", "][", "[[", "]]"):
        raise RecursiveAnumDecodeError("special boundary form is outside recursive grammar")
    if raw in ("0", "1"):
        return RecursiveAnumTree.atom_tree(raw)
    if not raw:
        raise RecursiveAnumDecodeError("empty raw carrier has no recursive denotation")

    expanded = restore_collapsed_root_opens(raw)
    try:
        tree, end = _parse_root(expanded)
    except RecursiveAnumDecodeError:
        raise
    except (IndexError, RecursionError) as exc:
        raise RecursiveAnumDecodeError("malformed recursive Anum carrier") from exc

    if end != len(expanded):
        raise RecursiveAnumDecodeError("recursive Anum carrier has trailing values or brackets")
    if canonical_recursive_tree_raw(tree) != raw:
        raise RecursiveAnumDecodeError("recursive Anum carrier is not canonical")
    return tree


def canonical_recursive_tree_raw(tree: RecursiveAnumTree) -> str:
    """Encode one occurrence tree and apply the root-opening collapse rule."""

    if tree.is_atom:
        assert tree.atom is not None
        return tree.atom
    return collapse_root_opens(_encode_pair_expanded(tree))


def canonical_recursive_anum(value: AnumDenotation) -> str:
    """Canonical inverse for structural occurrence trees emitted by this decoder."""

    if value.structural is None:
        raise ValueError("only structural recursive denotations have a canonical inverse")
    tree = _tree_from_structural(value.structural)
    return canonical_recursive_tree_raw(tree)


def recursive_tree_denotation(tree: RecursiveAnumTree) -> AnumDenotation:
    """Convert an occurrence tree to topological storage-neutral denotation IR."""

    nodes: list[DenotationNode] = []
    anchors: set[str] = set()

    def emit(item: RecursiveAnumTree) -> DenotationRef:
        if item.is_atom:
            assert item.atom is not None
            anchor = _anchor_for_atom(item.atom)
            anchors.add(anchor)
            return DenotationRef.anchor_ref(anchor)

        assert item.start is not None and item.end is not None
        start_ref = emit(item.start)
        end_ref = emit(item.end)
        node_id = len(nodes)
        nodes.append(DenotationNode(id=node_id, start=start_ref, end=end_ref))
        return DenotationRef.node_ref(node_id)

    root = emit(tree)
    return AnumDenotation.structural_result(
        StructuralDenotation(
            anchors=tuple(sorted(anchors)),
            nodes=tuple(nodes),
            root=root,
        )
    )


def restore_collapsed_root_opens(raw: str) -> str:
    """Restore only virtual opens lost by the historical root-opening collapse."""

    if not raw.startswith("["):
        return raw

    balance = raw.count("[") - raw.count("]")
    if balance >= 0:
        return raw
    return "[" * (-balance) + raw


def collapse_root_opens(expanded: str) -> str:
    """Collapse a leading run of root opens to one physical opening abit."""

    count = 0
    while count < len(expanded) and expanded[count] == "[":
        count += 1
    if count <= 1:
        return expanded
    return "[" + expanded[count:]


def _parse_root(raw: str) -> tuple[RecursiveAnumTree, int]:
    if raw in ("0", "1"):
        return RecursiveAnumTree.atom_tree(raw), 1

    start, position = _parse_value(raw, 0)
    end, position = _parse_value(raw, position)
    return RecursiveAnumTree.link_tree(start, end), position


def _parse_value(raw: str, position: int) -> tuple[RecursiveAnumTree, int]:
    if position >= len(raw):
        raise RecursiveAnumDecodeError("recursive Anum value is missing")

    current = raw[position]
    if current in ("0", "1"):
        return RecursiveAnumTree.atom_tree(current), position + 1
    if current != "[":
        raise RecursiveAnumDecodeError("recursive Anum value must start with atom or '['")

    start, position = _parse_value(raw, position + 1)
    end, position = _parse_value(raw, position)
    if position >= len(raw) or raw[position] != "]":
        raise RecursiveAnumDecodeError("recursive bracket value must close after exactly one pair")
    return RecursiveAnumTree.link_tree(start, end), position + 1


def _encode_pair_expanded(tree: RecursiveAnumTree) -> str:
    if tree.is_atom:
        raise ValueError("root pair encoder requires a link tree")
    assert tree.start is not None and tree.end is not None
    return _encode_value_expanded(tree.start) + _encode_value_expanded(tree.end)


def _encode_value_expanded(tree: RecursiveAnumTree) -> str:
    if tree.is_atom:
        assert tree.atom is not None
        return tree.atom
    return "[" + _encode_pair_expanded(tree) + "]"


def _tree_from_structural(value: StructuralDenotation) -> RecursiveAnumTree:
    visited_nodes: set[int] = set()
    used_anchors: set[str] = set()

    def visit(ref: DenotationRef) -> RecursiveAnumTree:
        if ref.kind is DenotationRefKind.ANCHOR:
            if ref.anchor is None:
                raise ValueError("recursive denotation anchor reference is missing")
            used_anchors.add(ref.anchor)
            return RecursiveAnumTree.atom_tree(_atom_for_anchor(ref.anchor))

        if ref.node is None:
            raise ValueError("recursive denotation node reference is missing")
        if ref.node in visited_nodes:
            raise ValueError("explicit shared node references are outside occurrence-tree subset")
        visited_nodes.add(ref.node)
        node = value.nodes[ref.node]
        return RecursiveAnumTree.link_tree(visit(node.start), visit(node.end))

    tree = visit(value.root)
    if visited_nodes != set(range(len(value.nodes))):
        raise ValueError("recursive denotation contains unused structural nodes")
    if used_anchors != set(value.anchors):
        raise ValueError("recursive denotation contains unused or missing anchors")
    return tree


def _anchor_for_atom(atom: str) -> str:
    if atom == "0":
        return PROTOCOL_ZERO_ANCHOR
    if atom == "1":
        return PROTOCOL_ONE_ANCHOR
    raise ValueError("recursive Anum atom must be 0 or 1")


def _atom_for_anchor(anchor: str) -> str:
    if anchor == PROTOCOL_ZERO_ANCHOR:
        return "0"
    if anchor == PROTOCOL_ONE_ANCHOR:
        return "1"
    raise ValueError("recursive denotation endpoint must be protocol:0 or protocol:1")
