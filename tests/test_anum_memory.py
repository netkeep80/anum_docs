"""L4 invariants for the canonical in-memory MTS/Anum v0.2 store."""

import pytest

from core.anum_denotation import AnumDenotation
from core.anum_memory import (
    AnumMemory,
    InvalidInitialGraphError,
    LinkInUseError,
    MissingAnchorError,
    NonStructuralDenotationError,
    UnknownLinkRefError,
)
from core.anum_model import ProjectionContext
from core.anum_pair_denotation import denotate_anum_pair_subset
from core.anum_parser import parse_raw_quaternary
from core.anum_raw_carrier import describe_raw_carrier
from core.anum_recursive_denotation import denotate_recursive_anum


INITIAL_GRAPH = {
    0: (0, 0),
    1: (1, 0),
    2: (0, 2),
}
ANCHORS = {
    "protocol:0": 1,
    "protocol:1": 2,
}


def memory() -> AnumMemory:
    return AnumMemory(initial_links=INITIAL_GRAPH)


def pair(raw: str) -> AnumDenotation:
    return denotate_anum_pair_subset(
        parse_raw_quaternary(raw),
        ProjectionContext.ROOT,
    )


def recursive(raw: str) -> AnumDenotation:
    return denotate_recursive_anum(
        parse_raw_quaternary(raw),
        ProjectionContext.ROOT,
    )


def test_initial_graph_supports_cycles_and_canonical_exact_identity():
    store = memory()

    assert store.poles(0) == (0, 0)
    assert store.poles(1) == (1, 0)
    assert store.poles(2) == (0, 2)
    assert store.find_link(0, 0) == 0
    assert store.intern_link(0, 0) == 0
    assert store.link_count == 3


def test_initial_graph_must_be_closed_and_have_unique_ordered_pairs():
    with pytest.raises(InvalidInitialGraphError):
        AnumMemory(initial_links={0: (0, 1)})

    with pytest.raises(InvalidInitialGraphError):
        AnumMemory(initial_links={0: (0, 0), 1: (0, 0)})


def test_load_raw_is_separate_from_denotation_and_non_materializing():
    store = memory()
    carrier = describe_raw_carrier(parse_raw_quaternary("01"))
    before = store.snapshot()

    assert store.has_raw(carrier) is False
    assert store.load_raw(carrier) == carrier
    assert store.has_raw(carrier) is True
    assert store.raw_count == 1
    assert store.link_count == len(before.links)
    assert store.find_denotation(pair("01"), ANCHORS) is None


def test_find_denotation_is_read_only_and_realize_is_idempotent():
    store = memory()
    denotation = pair("01")
    before = store.snapshot()

    assert store.find_denotation(denotation, ANCHORS) is None
    assert store.snapshot() == before

    ref = store.realize_denotation(denotation, ANCHORS)
    assert ref == 3
    assert store.poles(ref) == (ANCHORS["protocol:0"], ANCHORS["protocol:1"])
    assert store.find_link(1, 2) == ref
    assert store.find_denotation(denotation, ANCHORS) == ref
    assert ref in store.outgoing(1)
    assert ref in store.incoming(2)

    after_first = store.snapshot()
    assert store.realize_denotation(denotation, ANCHORS) == ref
    assert store.snapshot() == after_first


def test_atomic_structural_anchor_root_returns_existing_ref_without_creation():
    store = memory()
    denotation = pair("0")
    before = store.snapshot()

    assert store.find_denotation(denotation, ANCHORS) == ANCHORS["protocol:0"]
    assert store.realize_denotation(denotation, ANCHORS) == ANCHORS["protocol:0"]
    assert store.snapshot() == before


def test_recursive_denotation_materializes_in_description_order():
    store = memory()
    denotation = recursive("[01]1")

    root = store.realize_denotation(denotation, ANCHORS)

    inner = store.find_link(1, 2)
    assert inner == 3
    assert root == 4
    assert store.poles(root) == (inner, 2)
    assert store.find_denotation(denotation, ANCHORS) == root


def test_missing_or_unknown_anchor_is_typed_error_without_partial_mutation():
    store = memory()
    denotation = recursive("[01]1")
    before = store.snapshot()

    with pytest.raises(MissingAnchorError, match="protocol:1"):
        store.realize_denotation(denotation, {"protocol:0": 1})
    assert store.snapshot() == before

    with pytest.raises(MissingAnchorError, match="unknown LinkRef"):
        store.realize_denotation(
            denotation,
            {"protocol:0": 1, "protocol:1": 999},
        )
    assert store.snapshot() == before


def test_raw_and_quoted_raw_are_not_implicit_materialization_commands():
    store = memory()
    before = store.snapshot()

    for denotation in (
        AnumDenotation.raw_result("010"),
        AnumDenotation.quoted_raw_result("01"),
    ):
        with pytest.raises(NonStructuralDenotationError):
            store.find_denotation(denotation, ANCHORS)
        with pytest.raises(NonStructuralDenotationError):
            store.realize_denotation(denotation, ANCHORS)

    assert store.snapshot() == before


def test_delete_updates_all_indexes_without_implicit_cascade():
    store = memory()
    inner = store.realize_denotation(pair("01"), ANCHORS)
    assert inner == 3

    outer = store.intern_link(inner, 2)
    assert outer == 4

    with pytest.raises(LinkInUseError):
        store.delete_link(inner)

    store.delete_link(outer)
    assert store.find_link(inner, 2) is None
    assert outer not in store.outgoing(inner)
    assert outer not in store.incoming(2)

    store.delete_link(inner)
    assert store.find_link(1, 2) is None
    assert inner not in store.outgoing(1)
    assert inner not in store.incoming(2)

    with pytest.raises(UnknownLinkRefError):
        store.poles(inner)


def test_read_operations_do_not_mutate_store():
    store = memory()
    denotation = pair("01")
    before = store.snapshot()

    assert store.find_link(1, 2) is None
    assert store.poles(1) == (1, 0)
    assert store.outgoing(1) == (1,)
    assert 2 in store.incoming(2)
    assert store.find_denotation(denotation, ANCHORS) is None

    assert store.snapshot() == before
