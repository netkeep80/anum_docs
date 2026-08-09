from __future__ import annotations

from dataclasses import fields
import json
from pathlib import Path

import pytest

from core.exact_link_network import (
    Link,
    LinkNetwork,
    LinkNetworkBuilder,
    LinkNetworkError,
    NetworkSnapshot,
    OccurrenceRef,
)


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts/mts-exact-occurrence-link-network-v0.7.json"


def read_contract() -> dict:
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def build_reference_network():
    builder = LinkNetworkBuilder()
    root = builder.reserve()
    other_self = builder.reserve()
    shared = builder.reserve()
    left = builder.reserve()
    right = builder.reserve()
    duplicate1 = builder.reserve()
    duplicate2 = builder.reserve()
    mutual_a = builder.reserve()
    mutual_b = builder.reserve()

    builder.define(root, root, root)
    builder.define(other_self, other_self, other_self)
    builder.define(shared, root, other_self)
    builder.define(left, shared, root)
    builder.define(right, shared, other_self)
    builder.define(duplicate1, left, right)
    builder.define(duplicate2, left, right)
    builder.define(mutual_a, mutual_b, root)
    builder.define(mutual_b, mutual_a, root)
    return builder.freeze(root), {
        "root": root,
        "other_self": other_self,
        "shared": shared,
        "left": left,
        "right": right,
        "duplicate1": duplicate1,
        "duplicate2": duplicate2,
        "mutual_a": mutual_a,
        "mutual_b": mutual_b,
    }


def test_contract_is_candidate_and_does_not_authorize_cutover():
    contract = read_contract()
    assert contract["schema"] == "mts-exact-occurrence-link-network/v0.7"
    assert contract["status"] == "gate-p-candidate"
    assert contract["accepted"] is False
    assert contract["issue"] == 240
    assert contract["historicalBoundary"]["productionCutover"] is False
    assert contract["veto"]["downstreamRepin"] is False


def test_link_primitive_has_exactly_start_and_end():
    assert [field.name for field in fields(Link)] == ["start", "end"]
    contract = read_contract()
    assert contract["primitive"]["linkFields"] == ["start", "end"]
    assert contract["primitive"]["semanticTags"] == []


def test_distinguished_root_is_exact_occurrence_not_self_closed_shape_search():
    network, refs = build_reference_network()
    root = refs["root"]
    other = refs["other_self"]

    assert network.root is root
    assert network.link(root) == Link(root, root)
    assert network.link(other) == Link(other, other)
    assert root != other
    assert network.root != other


def test_duplicate_equal_pairs_remain_distinct_occurrences():
    network, refs = build_reference_network()
    first = refs["duplicate1"]
    second = refs["duplicate2"]

    assert first != second
    assert network.link(first) == network.link(second)
    assert network.link(first).start is refs["left"]
    assert network.link(first).end is refs["right"]


def test_sharing_is_preserved_by_exact_refs():
    network, refs = build_reference_network()
    assert network.link(refs["left"]).start is refs["shared"]
    assert network.link(refs["right"]).start is refs["shared"]


def test_mutual_cycle_is_finite_and_direct():
    network, refs = build_reference_network()
    a = refs["mutual_a"]
    b = refs["mutual_b"]
    assert network.link(a).start is b
    assert network.link(b).start is a
    assert network.link(a).end is refs["root"]
    assert network.link(b).end is refs["root"]


def test_snapshot_round_trip_preserves_topology_root_and_multiplicity():
    network, refs = build_reference_network()
    snapshot = network.snapshot()
    restored = LinkNetwork.from_snapshot(snapshot)

    assert restored.snapshot() == snapshot
    assert restored.root.slot == refs["root"].slot
    assert len(restored.refs) == len(network.refs)

    first = restored.refs[refs["duplicate1"].slot]
    second = restored.refs[refs["duplicate2"].slot]
    assert first != second
    assert restored.link(first) == restored.link(second)


def test_round_trip_creates_fresh_identity_scope():
    network, refs = build_reference_network()
    restored = LinkNetwork.from_snapshot(network.snapshot())

    assert restored.root != network.root
    assert restored.refs[refs["shared"].slot] != refs["shared"]
    with pytest.raises(LinkNetworkError, match="foreign occurrence reference"):
        restored.link(refs["shared"])
    with pytest.raises(LinkNetworkError, match="foreign occurrence reference"):
        network.link(restored.refs[refs["shared"].slot])


def test_foreign_builder_refs_reject():
    left_builder = LinkNetworkBuilder()
    right_builder = LinkNetworkBuilder()
    left_ref = left_builder.reserve()
    right_ref = right_builder.reserve()

    with pytest.raises(LinkNetworkError, match="foreign occurrence reference"):
        left_builder.define(left_ref, left_ref, right_ref)


def test_handcrafted_alias_ref_rejects_even_with_scope_and_slot():
    network, refs = build_reference_network()
    original = refs["shared"]
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

    with pytest.raises(LinkNetworkError, match="unbound occurrences"):
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


def test_invalid_snapshots_reject():
    invalid = [
        NetworkSnapshot(links=(), root=0),
        NetworkSnapshot(links=((0, 0),), root=1),
        NetworkSnapshot(links=((1, 0),), root=0),
        NetworkSnapshot(links=((-1, 0),), root=0),
    ]
    for snapshot in invalid:
        with pytest.raises(LinkNetworkError):
            LinkNetwork.from_snapshot(snapshot)


def test_snapshot_slots_are_transport_local_not_runtime_refs():
    network, refs = build_reference_network()
    snapshot = network.snapshot()
    assert isinstance(snapshot.root, int)
    assert all(isinstance(slot, int) for pair in snapshot.links for slot in pair)
    assert snapshot.root == refs["root"].slot
    assert read_contract()["identityBoundaries"]["snapshotSlotIsUniversalIdentity"] is False


def test_no_pair_interning_or_graph_equality_api_is_part_of_primitive_network():
    forbidden = {
        "intern",
        "find_or_create",
        "isomorphic",
        "equals",
        "meaning",
        "kind",
    }
    public = set(dir(LinkNetwork)) | set(dir(LinkNetworkBuilder)) | set(Link.__dataclass_fields__)
    assert forbidden.isdisjoint(public)
    identity = read_contract()["identityBoundaries"]
    assert identity["samePairImpliesSameOccurrence"] is False
    assert identity["isomorphismImpliesSemanticIdentity"] is False
