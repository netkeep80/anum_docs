from __future__ import annotations

from dataclasses import fields

import pytest

from core.exact_link_network import (
    Link,
    LinkNetwork,
    LinkNetworkBuilder,
    LinkNetworkError,
    NetworkSnapshot,
    OccurrenceRef,
)


def build_reference_network():
    builder = LinkNetworkBuilder()
    root = builder.reserve()
    opening = builder.reserve()
    closing = builder.reserve()
    linked = builder.reserve()
    unlinked = builder.reserve()
    left = builder.reserve()
    right = builder.reserve()
    mutual_a = builder.reserve()
    mutual_b = builder.reserve()

    builder.define(root, root, root)
    builder.define(opening, opening, root)
    builder.define(closing, root, closing)
    builder.define(linked, opening, closing)
    builder.define(unlinked, closing, opening)
    builder.define(left, linked, root)
    builder.define(right, linked, closing)
    builder.define(mutual_a, mutual_b, linked)
    builder.define(mutual_b, mutual_a, unlinked)
    return builder.freeze(root), {
        "root": root,
        "opening": opening,
        "closing": closing,
        "linked": linked,
        "unlinked": unlinked,
        "left": left,
        "right": right,
        "mutual_a": mutual_a,
        "mutual_b": mutual_b,
    }


def test_link_primitive_has_exactly_start_and_end():
    assert [field.name for field in fields(Link)] == ["start", "end"]


def test_root_is_the_only_fully_self_closed_link():
    network, refs = build_reference_network()
    root = refs["root"]

    assert network.link(root) == Link(root, root)
    assert network.find(root, root) is root
    assert [
        ref
        for ref in network.refs
        if network.link(ref).start is ref and network.link(ref).end is ref
    ] == [root]


def test_second_fully_self_closed_link_is_rejected_before_freeze():
    builder = LinkNetworkBuilder()
    root = builder.reserve()
    other = builder.reserve()
    builder.define(root, root, root)

    with pytest.raises(LinkNetworkError, match="fully self-closed link is unique"):
        builder.define(other, other, other)


def test_selected_root_must_be_the_unique_fully_self_closed_link():
    builder = LinkNetworkBuilder()
    root = builder.reserve()
    opening = builder.reserve()
    builder.define(root, root, root)
    builder.define(opening, opening, root)

    with pytest.raises(LinkNetworkError, match="selected root must be"):
        builder.freeze(opening)


def test_duplicate_equal_pair_definition_is_rejected():
    builder = LinkNetworkBuilder()
    root = builder.reserve()
    left = builder.reserve()
    right = builder.reserve()
    first = builder.reserve()
    duplicate = builder.reserve()

    builder.define(root, root, root)
    builder.define(left, left, root)
    builder.define(right, root, right)
    builder.define(first, left, right)

    with pytest.raises(LinkNetworkError, match="duplicate semantic link pair"):
        builder.define(duplicate, left, right)


def test_ensure_reuses_the_same_link_for_the_same_pair():
    builder = LinkNetworkBuilder()
    root = builder.reserve()
    left = builder.reserve()
    right = builder.reserve()
    builder.define(root, root, root)
    builder.define(left, left, root)
    builder.define(right, root, right)

    first = builder.ensure(left, right)
    second = builder.ensure(left, right)
    assert second is first

    network = builder.freeze(root)
    assert network.find(left, right) is first
    assert len(network.refs) == 4


def test_sharing_is_preserved_by_technical_handles():
    network, refs = build_reference_network()
    assert network.link(refs["left"]).start is refs["linked"]
    assert network.link(refs["right"]).start is refs["linked"]


def test_mutual_cycle_is_finite_and_direct():
    network, refs = build_reference_network()
    a = refs["mutual_a"]
    b = refs["mutual_b"]
    assert network.link(a).start is b
    assert network.link(b).start is a
    assert network.link(a).end is refs["linked"]
    assert network.link(b).end is refs["unlinked"]


def test_snapshot_round_trip_preserves_canonical_topology_and_root():
    network, refs = build_reference_network()
    snapshot = network.snapshot()
    restored = LinkNetwork.from_snapshot(snapshot)

    assert restored.snapshot() == snapshot
    assert restored.root.slot == refs["root"].slot
    assert len(restored.refs) == len(network.refs)

    for ref in restored.refs:
        link = restored.link(ref)
        assert restored.find(link.start, link.end) is ref


def test_round_trip_issues_fresh_runtime_handles_without_claiming_new_semantic_identity():
    network, refs = build_reference_network()
    restored = LinkNetwork.from_snapshot(network.snapshot())

    assert restored.root != network.root
    assert restored.snapshot() == network.snapshot()

    with pytest.raises(LinkNetworkError, match="foreign network link handle"):
        restored.link(refs["linked"])
    with pytest.raises(LinkNetworkError, match="foreign network link handle"):
        network.link(restored.refs[refs["linked"].slot])


def test_foreign_builder_handles_reject():
    left_builder = LinkNetworkBuilder()
    right_builder = LinkNetworkBuilder()
    left_ref = left_builder.reserve()
    right_ref = right_builder.reserve()

    with pytest.raises(LinkNetworkError, match="foreign reserved link handle"):
        left_builder.define(left_ref, left_ref, right_ref)


def test_handcrafted_alias_handle_rejects_even_with_scope_and_slot():
    network, refs = build_reference_network()
    original = refs["linked"]
    forged = OccurrenceRef(original._scope, original.slot)
    assert forged == original
    assert forged is not original
    with pytest.raises(LinkNetworkError, match="not issued by this network"):
        network.link(forged)


def test_incomplete_builder_rejects_freeze_and_redefinition_rejects():
    builder = LinkNetworkBuilder()
    root = builder.reserve()
    other = builder.reserve()
    builder.define(root, root, root)

    with pytest.raises(LinkNetworkError, match="unbound reserved links"):
        builder.freeze(root)

    builder.define(other, other, root)
    with pytest.raises(LinkNetworkError, match="already defined"):
        builder.define(other, root, root)


def test_builder_is_one_shot_after_freeze():
    builder = LinkNetworkBuilder()
    root = builder.reserve()
    builder.define(root, root, root)
    builder.freeze(root)

    with pytest.raises(LinkNetworkError, match="already frozen"):
        builder.reserve()


def test_invalid_snapshots_reject_duplicate_pair_wrong_root_and_second_self_loop():
    invalid = [
        NetworkSnapshot(links=(), root=0),
        NetworkSnapshot(links=((0, 0),), root=1),
        NetworkSnapshot(links=((1, 0),), root=0),
        NetworkSnapshot(links=((-1, 0),), root=0),
        NetworkSnapshot(links=((0, 0), (0, 0)), root=0),
        NetworkSnapshot(links=((0, 0), (1, 1)), root=0),
        NetworkSnapshot(links=((0, 0), (0, 1)), root=1),
    ]
    for snapshot in invalid:
        with pytest.raises(LinkNetworkError):
            LinkNetwork.from_snapshot(snapshot)


def test_snapshot_slots_are_transport_coordinates_not_semantic_identity():
    network, refs = build_reference_network()
    snapshot = network.snapshot()
    assert isinstance(snapshot.root, int)
    assert all(isinstance(slot, int) for pair in snapshot.links for slot in pair)
    assert snapshot.root == refs["root"].slot


def test_evolution_ensure_reuses_base_pair_and_appends_new_pair_once():
    network, refs = build_reference_network()
    evolution = network.evolve()

    existing = evolution.ensure(refs["left"], refs["right"])
    same = evolution.ensure(refs["left"], refs["right"])
    assert same is existing

    after = evolution.freeze()
    assert len(after.refs) == len(network.refs) + 1
    assert after.find(refs["left"], refs["right"]) is existing


def test_evolution_rejects_explicit_duplicate_of_base_pair():
    network, refs = build_reference_network()
    evolution = network.evolve()
    duplicate = evolution.reserve()

    with pytest.raises(LinkNetworkError, match="duplicate semantic link pair"):
        evolution.define(duplicate, refs["linked"], refs["root"])


def test_evolution_cannot_create_second_fully_self_closed_link():
    network, _ = build_reference_network()
    evolution = network.evolve()
    other = evolution.reserve()

    with pytest.raises(LinkNetworkError, match="fully self-closed link is unique"):
        evolution.define(other, other, other)
