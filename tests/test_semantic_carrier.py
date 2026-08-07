"""Tests for the accepted finite cyclic carrier subset of L1 v0.1."""

import pytest

from core.semantic_carrier import (
    CarrierGraph,
    LinkNode,
    associative_root_carrier,
    carrier_isomorphic,
    end_carrier,
    invert_root_carrier,
    link_carrier,
    reachable_indices,
    start_carrier,
)


def test_associative_root_is_one_finite_self_closed_link():
    root = associative_root_carrier()

    assert len(root.nodes) == 1
    assert root.root == 0
    assert root.root_node == LinkNode(start=0, end=0)
    assert reachable_indices(root) == (0,)


def test_start_carrier_is_finite_self_closed_at_start():
    form = associative_root_carrier()
    started = start_carrier(form)

    assert len(started.nodes) == 2
    assert started.root_node.start == started.root
    assert started.root_node.end == form.root
    assert reachable_indices(started) == (1, 0)


def test_end_carrier_is_finite_self_closed_at_end():
    form = associative_root_carrier()
    ended = end_carrier(form)

    assert len(ended.nodes) == 2
    assert ended.root_node.start == form.root
    assert ended.root_node.end == ended.root
    assert reachable_indices(ended) == (1, 0)


def test_link_carrier_preserves_ordered_start_and_end_subcarriers():
    left = start_carrier(associative_root_carrier())
    right = end_carrier(associative_root_carrier())
    linked = link_carrier(left, right)

    assert linked.root_node.start == left.root
    assert linked.root_node.end == len(left.nodes) + right.root

    swapped = link_carrier(right, left)
    assert not carrier_isomorphic(linked, swapped)


def test_inversion_creates_new_root_with_swapped_endpoints_without_mutation():
    original = link_carrier(
        start_carrier(associative_root_carrier()),
        end_carrier(associative_root_carrier()),
    )
    before = original
    inverted = invert_root_carrier(original)

    assert original == before
    assert inverted.root != original.root
    assert inverted.root_node.start == original.root_node.end
    assert inverted.root_node.end == original.root_node.start


def test_exact_rooted_carrier_isomorphism_preserves_cycle_and_sharing_topology():
    first = start_carrier(associative_root_carrier())
    second = start_carrier(associative_root_carrier())
    different = end_carrier(associative_root_carrier())

    assert carrier_isomorphic(first, second)
    assert not carrier_isomorphic(first, different)


def test_root_self_cycle_does_not_collapse_to_explicit_link_of_two_root_copies():
    root = associative_root_carrier()
    expanded = link_carrier(root, root)

    assert len(reachable_indices(root)) == 1
    assert len(reachable_indices(expanded)) == 3
    assert not carrier_isomorphic(root, expanded)


def test_carrier_isomorphic_is_not_presented_as_l2_equality():
    """The utility must distinguish topologies even where future MTS `=` may not.

    This protects #79 from being accidentally decided by implementation detail.
    """

    root = associative_root_carrier()
    expanded = link_carrier(root, root)
    assert carrier_isomorphic(root, expanded) is False


def test_invalid_carrier_references_are_rejected():
    with pytest.raises(ValueError, match="вне carrier"):
        CarrierGraph(nodes=(LinkNode(start=0, end=1),), root=0)

    with pytest.raises(ValueError, match="root index"):
        CarrierGraph(nodes=(LinkNode(start=0, end=0),), root=2)
