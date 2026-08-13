"""Preserved-neutral L4 invariants for the auxiliary finite pair store."""

import pytest

from core.anum_memory import (
    AnumMemory,
    InvalidInitialGraphError,
    LinkInUseError,
    UnknownLinkRefError,
)


ROOT_BASIS = {
    0: (0, 0),
    1: (1, 0),
    2: (0, 2),
    3: (1, 2),
    4: (2, 1),
}


def memory() -> AnumMemory:
    return AnumMemory(initial_links=ROOT_BASIS)


def test_initial_snapshot_preserves_local_coordinates_and_unique_ordered_pairs():
    store = memory()

    assert store.poles(0) == (0, 0)
    assert store.poles(1) == (1, 0)
    assert store.poles(2) == (0, 2)
    assert store.poles(3) == (1, 2)
    assert store.poles(4) == (2, 1)
    assert store.find_link(0, 0) == 0
    assert store.find_link(1, 2) == 3
    assert store.all_links() == (0, 1, 2, 3, 4)


def test_initial_graph_must_be_closed_and_have_unique_local_pairs():
    with pytest.raises(InvalidInitialGraphError, match="not closed"):
        AnumMemory(initial_links={0: (0, 1)})

    with pytest.raises(InvalidInitialGraphError, match="Duplicate ordered pair"):
        AnumMemory(initial_links={0: (0, 0), 1: (0, 0)})


def test_read_operations_do_not_mutate_store():
    store = memory()
    before = store.snapshot()

    assert store.find_link(3, 4) is None
    assert store.poles(1) == (1, 0)
    assert store.outgoing(1) == (1, 3)
    assert store.incoming(2) == (2, 3)
    assert store.find_start_projection(0) == 1
    assert store.find_end_projection(0) == 2
    assert store.has_link(4) is True
    assert store.snapshot() == before


def test_intern_link_is_explicit_idempotent_effect():
    store = memory()
    before = store.snapshot()

    created = store.intern_link(3, 4)
    assert created == 5
    assert store.snapshot() != before
    assert store.poles(created) == (3, 4)
    assert store.find_link(3, 4) == created

    after_first = store.snapshot()
    assert store.intern_link(3, 4) == created
    assert store.snapshot() == after_first


def test_intern_link_requires_existing_local_pole_handles():
    store = memory()
    before = store.snapshot()

    with pytest.raises(UnknownLinkRefError):
        store.intern_link(3, 999)
    assert store.snapshot() == before


def test_delete_is_explicit_non_cascading_and_preserves_closure_of_remaining_store():
    store = memory()
    inner = store.intern_link(3, 4)
    outer = store.intern_link(inner, 4)

    with pytest.raises(LinkInUseError):
        store.delete_link(inner)

    store.delete_link(outer)
    assert store.find_link(inner, 4) is None

    store.delete_link(inner)
    assert store.find_link(3, 4) is None
    with pytest.raises(UnknownLinkRefError):
        store.poles(inner)


def test_storage_coordinate_is_not_added_to_semantic_pair_key():
    store = memory()
    before_count = store.link_count

    first = store.intern_link(3, 4)
    second = store.intern_link(3, 4)

    assert first == second
    assert store.link_count == before_count + 1
