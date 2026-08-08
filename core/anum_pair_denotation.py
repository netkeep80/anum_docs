"""Minimal storage-neutral structural denotation subset for Anum L3 v0.2.

This module deliberately recognizes only semantics already justified by the
accepted protocol plus the original sequence rule ``∞ab -> denotation a⟼b``:
protocol atoms 0/1, their accepted root boundary aliases, and exactly two
direct protocol atoms. Recursive bracket denotation is outside this module.
"""

from core.anum_denotation import (
    AnumDenotation,
    DenotationNode,
    DenotationRef,
    DenotationRefKind,
    StructuralDenotation,
)
from core.anum_model import Abit, AnumForm, ProjectionContext, ProjectionKind
from core.anum_parser import normalize_raw_form
from core.anum_protocol import project_anum


PROTOCOL_ZERO_ANCHOR = "protocol:0"
PROTOCOL_ONE_ANCHOR = "protocol:1"
_PROTOCOL_ANCHORS = {
    "0": PROTOCOL_ZERO_ANCHOR,
    "1": PROTOCOL_ONE_ANCHOR,
}
_ANCHOR_ATOMS = {value: key for key, value in _PROTOCOL_ANCHORS.items()}


def denotate_anum_pair_subset(
    form: AnumForm,
    context: ProjectionContext,
) -> AnumDenotation:
    """Return the accepted v0.2 pair-subset denotation without L4 effects."""

    source = normalize_raw_form(form)
    projection = project_anum(form, context)

    if context is ProjectionContext.QUOTE:
        projected = projection.projected
        if projected is None:
            raise ValueError("quote projection must preserve a raw payload")
        return AnumDenotation.quoted_raw_result(normalize_raw_form(projected))

    if context is ProjectionContext.RELATIVE:
        return AnumDenotation.raw_result(source)

    if projection.kind is ProjectionKind.PROTOCOL_VALUE:
        protocol_value = projection.protocol_value
        if protocol_value not in _PROTOCOL_ANCHORS:
            raise ValueError("unsupported protocol value in pair denotation subset")
        return _anchor_denotation(_PROTOCOL_ANCHORS[protocol_value])

    direct_atoms = _direct_protocol_atoms(form)
    if direct_atoms is not None:
        start, end = direct_atoms
        return _pair_denotation(_PROTOCOL_ANCHORS[start], _PROTOCOL_ANCHORS[end])

    return AnumDenotation.raw_result(source)


def canonical_pair_anum(value: AnumDenotation) -> str:
    """Serialize one structural value from the accepted pair subset canonically."""

    structural = value.structural
    if structural is None:
        raise ValueError("only structural pair-subset denotations have a canonical inverse")

    if not structural.nodes:
        atom = _protocol_atom(structural.root)
        if tuple(sorted({structural.root.anchor})) != structural.anchors:
            raise ValueError("anchor-only denotation is outside the canonical pair subset")
        return atom

    if len(structural.nodes) != 1:
        raise ValueError("nested structural denotation is outside the pair subset")

    node = structural.nodes[0]
    if node.id != 0 or structural.root != DenotationRef.node_ref(0):
        raise ValueError("pair-subset structural root must be node 0")

    start = _protocol_atom(node.start)
    end = _protocol_atom(node.end)
    expected_anchors = tuple(sorted({node.start.anchor, node.end.anchor}))
    if structural.anchors != expected_anchors:
        raise ValueError("pair-subset denotation contains unused or missing anchors")
    return start + end


def _direct_protocol_atoms(form: AnumForm) -> tuple[str, str] | None:
    if len(form.tokens) != 2:
        return None

    values = tuple(token.abit for token in form.tokens)
    if any(abit not in (Abit.LINK, Abit.UNLINK) for abit in values):
        return None
    return values[0].value, values[1].value


def _anchor_denotation(anchor: str) -> AnumDenotation:
    return AnumDenotation.structural_result(
        StructuralDenotation(
            anchors=(anchor,),
            nodes=(),
            root=DenotationRef.anchor_ref(anchor),
        )
    )


def _pair_denotation(start: str, end: str) -> AnumDenotation:
    anchors = tuple(sorted({start, end}))
    return AnumDenotation.structural_result(
        StructuralDenotation(
            anchors=anchors,
            nodes=(
                DenotationNode(
                    id=0,
                    start=DenotationRef.anchor_ref(start),
                    end=DenotationRef.anchor_ref(end),
                ),
            ),
            root=DenotationRef.node_ref(0),
        )
    )


def _protocol_atom(ref: DenotationRef) -> str:
    if ref.kind is not DenotationRefKind.ANCHOR or ref.anchor not in _ANCHOR_ATOMS:
        raise ValueError("pair-subset endpoint must be a protocol anchor")
    if ref.node is not None:
        raise ValueError("protocol anchor reference cannot contain a node id")
    return _ANCHOR_ATOMS[ref.anchor]
