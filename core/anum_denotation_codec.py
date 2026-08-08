"""Canonical L3 Anum -> storage-neutral denotation subset for MTS v0.2.

This is the single active denotation codec. The accepted subset is deliberately
small:

* root ``0`` / ``1`` denote protocol anchors;
* root boundary aliases ``][`` / ``[]`` denote the same anchors;
* exactly two direct protocol atoms ``00`` / ``01`` / ``10`` / ``11`` denote
  one structural Link node;
* quote context yields ``quoted-raw`` after the already accepted one-envelope
  quote projection;
* relative and every unsupported root carrier remain typed ``raw``.

No memory backend, storage-assigned LinkId, ``find`` or ``realize`` operation is
used here. Recursive bracket denotation is intentionally left to issue #95.
"""

from core.anum_denotation import (
    AnumDenotation,
    DenotationKind,
    DenotationNode,
    DenotationRef,
    DenotationRefKind,
    StructuralDenotation,
)
from core.anum_model import AnumForm, ProjectionContext, ProjectionKind
from core.anum_parser import normalize_raw_form
from core.anum_protocol import project_anum


PROTOCOL_ZERO_ANCHOR = "protocol:0"
PROTOCOL_ONE_ANCHOR = "protocol:1"
_PROTOCOL_ANCHOR_BY_ATOM = {
    "0": PROTOCOL_ZERO_ANCHOR,
    "1": PROTOCOL_ONE_ANCHOR,
}
_ATOM_BY_PROTOCOL_ANCHOR = {
    PROTOCOL_ZERO_ANCHOR: "0",
    PROTOCOL_ONE_ANCHOR: "1",
}


def decode_anum_denotation(
    form: AnumForm,
    context: ProjectionContext,
) -> AnumDenotation:
    """Decode the accepted v0.2 subset without reading or mutating L4 memory."""

    source = normalize_raw_form(form)

    if context is ProjectionContext.QUOTE:
        projection = project_anum(form, ProjectionContext.QUOTE)
        if projection.kind is not ProjectionKind.QUOTED_RAW or projection.projected is None:
            raise ValueError("quote projection must return quoted raw payload")
        return AnumDenotation.quoted_raw_result(normalize_raw_form(projection.projected))

    if context is ProjectionContext.RELATIVE:
        return AnumDenotation.raw_result(source)

    if context is not ProjectionContext.ROOT:
        raise TypeError("context должен быть ProjectionContext")

    if source in _PROTOCOL_ANCHOR_BY_ATOM:
        return _anchor_denotation(source)

    if source in ("[]", "]["):
        projection = project_anum(form, ProjectionContext.ROOT)
        if projection.kind is not ProjectionKind.PROTOCOL_VALUE:
            raise ValueError("accepted boundary alias must project to a protocol value")
        if projection.protocol_value not in _PROTOCOL_ANCHOR_BY_ATOM:
            raise ValueError("boundary alias projected outside the accepted 0/1 subset")
        return _anchor_denotation(projection.protocol_value)

    if len(source) == 2 and all(atom in _PROTOCOL_ANCHOR_BY_ATOM for atom in source):
        return _pair_denotation(source[0], source[1])

    return AnumDenotation.raw_result(source)


def canonical_anum_from_denotation(value: AnumDenotation) -> str:
    """Return the deterministic raw inverse for structural values in this subset.

    The inverse is canonical, not source-preserving: contextual boundary aliases
    ``[]`` and ``][`` decode to the same anchor values as ``1`` and ``0`` and
    therefore serialize canonically as the direct protocol atoms.
    """

    if value.kind is not DenotationKind.STRUCTURAL or value.structural is None:
        raise ValueError("canonical inverse is defined only for structural denotations")

    structural = value.structural
    if not structural.nodes:
        return _serialize_anchor_only(structural)

    if len(structural.nodes) != 1:
        raise ValueError("denotation is outside the accepted direct-pair subset")

    node = structural.nodes[0]
    if node.id != 0 or structural.root != DenotationRef.node_ref(0):
        raise ValueError("direct-pair denotation must have node 0 as structural root")

    start = _atom_from_anchor_ref(node.start)
    end = _atom_from_anchor_ref(node.end)
    expected_anchors = tuple(
        sorted({_PROTOCOL_ANCHOR_BY_ATOM[start], _PROTOCOL_ANCHOR_BY_ATOM[end]})
    )
    if structural.anchors != expected_anchors:
        raise ValueError("direct-pair denotation contains anchors outside the accepted subset")
    return start + end


def _anchor_denotation(atom: str) -> AnumDenotation:
    anchor = _PROTOCOL_ANCHOR_BY_ATOM[atom]
    return AnumDenotation.structural_result(
        StructuralDenotation(
            anchors=(anchor,),
            nodes=(),
            root=DenotationRef.anchor_ref(anchor),
        )
    )


def _pair_denotation(start_atom: str, end_atom: str) -> AnumDenotation:
    start_anchor = _PROTOCOL_ANCHOR_BY_ATOM[start_atom]
    end_anchor = _PROTOCOL_ANCHOR_BY_ATOM[end_atom]
    return AnumDenotation.structural_result(
        StructuralDenotation(
            anchors=tuple(sorted({start_anchor, end_anchor})),
            nodes=(
                DenotationNode(
                    id=0,
                    start=DenotationRef.anchor_ref(start_anchor),
                    end=DenotationRef.anchor_ref(end_anchor),
                ),
            ),
            root=DenotationRef.node_ref(0),
        )
    )


def _serialize_anchor_only(structural: StructuralDenotation) -> str:
    root = structural.root
    if root.kind is not DenotationRefKind.ANCHOR or root.anchor is None:
        raise ValueError("zero-node structural denotation must be rooted at a protocol anchor")
    atom = _ATOM_BY_PROTOCOL_ANCHOR.get(root.anchor)
    if atom is None or structural.anchors != (root.anchor,):
        raise ValueError("anchor-only denotation is outside the accepted protocol subset")
    return atom


def _atom_from_anchor_ref(ref: DenotationRef) -> str:
    if ref.kind is not DenotationRefKind.ANCHOR or ref.anchor is None:
        raise ValueError("direct-pair node poles must reference protocol anchors")
    try:
        return _ATOM_BY_PROTOCOL_ANCHOR[ref.anchor]
    except KeyError as exc:
        raise ValueError("direct-pair node uses an unsupported anchor") from exc
