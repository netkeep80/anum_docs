from __future__ import annotations

from dataclasses import fields
from pathlib import Path

import pytest

from core.rooted_link_network import (
    Link,
    LinkNetwork,
    LinkNetworkBuilder,
    LinkNetworkError,
    NetworkSnapshot,
    LinkRef,
)


def build_reference_network():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    opening = builder.ensure_start_self_closed(root)
    closing = builder.ensure_end_self_closed(root)
    linked = builder.ensure(opening, closing)
    unlinked = builder.ensure(closing, opening)
    left = builder.ensure(linked, root)
    right = builder.ensure(linked, closing)
    loop_left = builder.ensure(left, left)
    return builder.freeze(root), {
        "root": root,
        "opening": opening,
        "closing": closing,
        "linked": linked,
        "unlinked": unlinked,
        "left": left,
        "right": right,
        "loop_left": loop_left,
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


def test_four_ostensive_constructors_are_canonical():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    opening = builder.ensure_start_self_closed(root)
    closing = builder.ensure_end_self_closed(root)
    linked = builder.ensure(opening, closing)

    assert builder.ensure_root() is root
    assert builder.ensure_start_self_closed(root) is opening
    assert builder.ensure_end_self_closed(root) is closing
    assert builder.ensure(opening, closing) is linked

    network = builder.freeze(root)
    assert network.link(root) == Link(root, root)
    assert network.link(opening) == Link(opening, root)
    assert network.link(closing) == Link(root, closing)
    assert network.link(linked) == Link(opening, closing)


def test_pair_lookup_reuses_self_closed_forms_too():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    opening = builder.ensure_start_self_closed(root)
    closing = builder.ensure_end_self_closed(root)

    assert builder.ensure(root, root) is root
    assert builder.ensure(opening, root) is opening
    assert builder.ensure(root, closing) is closing


def test_loop_is_not_full_self_closure():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    opening = builder.ensure_start_self_closed(root)
    loop = builder.ensure(opening, opening)
    network = builder.freeze(root)

    assert loop is not opening
    assert loop is not root
    assert network.link(loop) == Link(opening, opening)
    assert network.link(loop).start is not loop
    assert network.link(loop).end is not loop


def test_second_fully_self_closed_link_is_rejected_before_freeze():
    builder = LinkNetworkBuilder()
    builder.ensure_root()
    other = builder.reserve()

    with pytest.raises(LinkNetworkError, match="fully self-closed link is unique"):
        builder.define(other, other, other)


def test_same_start_self_closed_form_is_rejected_by_low_level_define():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    builder.ensure_start_self_closed(root)
    duplicate = builder.reserve()

    with pytest.raises(LinkNetworkError, match="start-self-closed form is unique"):
        builder.define(duplicate, duplicate, root)


def test_same_end_self_closed_form_is_rejected_by_low_level_define():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    builder.ensure_end_self_closed(root)
    duplicate = builder.reserve()

    with pytest.raises(LinkNetworkError, match="end-self-closed form is unique"):
        builder.define(duplicate, root, duplicate)


def test_duplicate_equal_pair_definition_is_rejected():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    left = builder.ensure_start_self_closed(root)
    right = builder.ensure_end_self_closed(root)
    builder.ensure(left, right)
    duplicate = builder.reserve()

    with pytest.raises(LinkNetworkError, match="duplicate semantic link pair"):
        builder.define(duplicate, left, right)


def test_non_self_pole_must_already_be_structurally_distinguished():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    a = builder.reserve()
    b = builder.reserve()

    with pytest.raises(LinkNetworkError, match="already be structurally distinguished"):
        builder.define(a, b, root)


def test_mutual_cycle_cannot_be_created_from_only_reserved_ids():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    a = builder.reserve()
    b = builder.reserve()

    with pytest.raises(LinkNetworkError, match="already be structurally distinguished"):
        builder.define(a, b, root)


def test_ensure_reuses_the_same_link_for_the_same_pair():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    left = builder.ensure_start_self_closed(root)
    right = builder.ensure_end_self_closed(root)

    first = builder.ensure(left, right)
    second = builder.ensure(left, right)
    assert second is first

    network = builder.freeze(root)
    assert network.find(left, right) is first
    assert len(network.refs) == 4


def test_sharing_is_preserved():
    network, refs = build_reference_network()
    assert network.link(refs["left"]).start is refs["linked"]
    assert network.link(refs["right"]).start is refs["linked"]


def test_snapshot_round_trip_preserves_rooted_canonical_topology():
    network, refs = build_reference_network()
    snapshot = network.snapshot()
    restored = LinkNetwork.from_snapshot(snapshot)

    assert restored.snapshot() == snapshot
    assert restored.root.slot == refs["root"].slot
    assert len(restored.refs) == len(network.refs)

    for ref in restored.refs:
        link = restored.link(ref)
        assert restored.find(link.start, link.end) is ref


def test_round_trip_issues_fresh_runtime_handles_without_new_semantic_identity():
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
    left_root = left_builder.ensure_root()
    right_root = right_builder.ensure_root()
    left_ref = left_builder.reserve()

    with pytest.raises(LinkNetworkError, match="foreign reserved link handle"):
        left_builder.define(left_ref, left_ref, right_root)

    assert left_root is not right_root


def test_handcrafted_alias_handle_rejects_even_with_scope_and_slot():
    network, refs = build_reference_network()
    original = refs["linked"]
    forged = LinkRef(original._scope, original.slot)
    assert forged == original
    assert forged is not original
    with pytest.raises(LinkNetworkError, match="not issued by this network"):
        network.link(forged)


def test_incomplete_builder_rejects_freeze_and_redefinition_rejects():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    other = builder.reserve()

    with pytest.raises(LinkNetworkError, match="unbound reserved links"):
        builder.freeze(root)

    builder.define(other, other, root)
    with pytest.raises(LinkNetworkError, match="already defined"):
        builder.define(other, root, root)


def test_builder_is_one_shot_after_freeze():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    builder.freeze(root)

    with pytest.raises(LinkNetworkError, match="already frozen"):
        builder.reserve()


def test_invalid_snapshots_reject_unrooted_cycles_and_duplicate_forms():
    invalid = [
        NetworkSnapshot(links=(), root=0),
        NetworkSnapshot(links=((0, 0),), root=1),
        NetworkSnapshot(links=((1, 0),), root=0),
        NetworkSnapshot(links=((-1, 0),), root=0),
        NetworkSnapshot(links=((0, 0), (0, 0)), root=0),
        NetworkSnapshot(links=((0, 0), (1, 1)), root=0),
        # two start-self-closed forms with the same distinguished end R
        NetworkSnapshot(links=((0, 0), (1, 0), (2, 0)), root=0),
        # unrooted mutual cycle: IDs alone do not distinguish 1 and 2
        NetworkSnapshot(links=((0, 0), (2, 0), (1, 0)), root=0),
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


def test_evolution_reuses_rooted_forms_and_adds_new_pair_once():
    network, refs = build_reference_network()
    evolution = network.evolve()

    assert evolution.ensure_root() is refs["root"]
    assert evolution.ensure_start_self_closed(refs["root"]) is refs["opening"]
    assert evolution.ensure_end_self_closed(refs["root"]) is refs["closing"]

    existing = evolution.ensure(refs["left"], refs["right"])
    same = evolution.ensure(refs["left"], refs["right"])
    assert same is existing

    after = evolution.freeze()
    assert len(after.refs) == len(network.refs) + 1
    assert after.find(refs["left"], refs["right"]) is existing


def test_evolution_cannot_create_second_fully_self_closed_link():
    network, _ = build_reference_network()
    evolution = network.evolve()
    other = evolution.reserve()

    with pytest.raises(LinkNetworkError, match="fully self-closed link is unique"):
        evolution.define(other, other, other)



def test_old_occurrence_api_vocabulary_does_not_return() -> None:
    root = Path(__file__).resolve().parents[1]
    old_type = "Occurrence" + "Ref"
    old_module = "exact_" + "link_network"
    old_test = "test_mts_exact_" + "occurrence_link_network.py"

    assert not (root / "core" / f"{old_module}.py").exists()
    assert not (root / "tests" / old_test).exists()

    for directory in (root / "core", root / "docs" / "specs", root / "tests"):
        for source in directory.rglob("*"):
            if not source.is_file() or source.suffix not in {".py", ".md"}:
                continue
            content = source.read_text(encoding="utf-8")
            assert old_type not in content, source
            assert old_module not in content, source
