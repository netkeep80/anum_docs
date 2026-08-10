from __future__ import annotations

from dataclasses import replace
import json
from pathlib import Path

import pytest

from core.exact_link_network import LinkNetwork, LinkNetworkBuilder, LinkNetworkError
from core.foundation_v2_materialization import (
    MaterializedEdge,
    SequenceAtom,
    SequenceDescription,
    SequenceGroup,
    SequenceMaterializationError,
    find_links,
    materialize_sequence,
    replay_resolved_sequence_grouping,
    replay_sequence_materialization,
)


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts/mts-anum-sequence-materialization-v0.7.json"


def _contract() -> dict:
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def _base_network(names: tuple[str, ...]):
    builder = LinkNetworkBuilder()
    root = builder.reserve()
    refs = {name: builder.reserve() for name in names}
    builder.define(root, root, root)
    for ref in refs.values():
        builder.define(ref, ref, ref)
    return builder.freeze(root), root, refs


def _atom(ref):
    return SequenceAtom(ref)


def _group(*items):
    return SequenceGroup(tuple(items))


def _description(root, *items):
    return SequenceDescription(root=root, items=tuple(items))


def test_contract_is_candidate_and_does_not_authorize_aprover_repin() -> None:
    contract = _contract()
    assert contract["schema"] == "mts-anum-sequence-materialization/v0.7"
    assert contract["status"] == "gate-p-candidate"
    assert contract["accepted"] is False
    assert contract["issue"] == 242
    assert contract["aproverRepinAllowed"] is False
    assert contract["effectBoundary"]["pairInterning"] is False
    assert contract["sequenceSemantics"]["emptySequenceAllowed"] is True
    assert "left fold" in contract["sequenceSemantics"]["fold"]


def test_evolution_preserves_base_exact_identity_and_keeps_before_immutable() -> None:
    before, root, refs = _base_network(("a", "b"))
    before_snapshot = before.snapshot()
    evolution = before.evolve()
    created = evolution.reserve()
    evolution.define(created, refs["a"], refs["b"])
    after = evolution.freeze()

    assert before.snapshot() == before_snapshot
    assert after.root is root
    assert after.refs[: len(before.refs)] == before.refs
    assert all(after.refs[index] is ref for index, ref in enumerate(before.refs))
    assert after.link(refs["a"]) is before.link(refs["a"])
    assert after.link(created).start is refs["a"]
    assert after.link(created).end is refs["b"]
    with pytest.raises(LinkNetworkError, match="slot is out of range"):
        before.link(created)


def test_evolution_allows_duplicate_pair_occurrences_without_interning() -> None:
    builder = LinkNetworkBuilder()
    root = builder.reserve()
    a = builder.reserve()
    b = builder.reserve()
    old = builder.reserve()
    builder.define(root, root, root)
    builder.define(a, a, a)
    builder.define(b, b, b)
    builder.define(old, a, b)
    before = builder.freeze(root)

    evidence = materialize_sequence(before, _description(root, _atom(a), _atom(b)))
    new = evidence.result

    assert new is not old
    assert evidence.after.link(new) == evidence.after.link(old)
    assert find_links(evidence.after, start=a, end=b) == (old, new)


def test_source_carrier_for_infinity_ab_does_not_contain_target_before_effect() -> None:
    builder = LinkNetworkBuilder()
    root = builder.reserve()
    a = builder.reserve()
    b = builder.reserve()
    source_a = builder.reserve()
    source_b = builder.reserve()
    builder.define(root, root, root)
    builder.define(a, a, a)
    builder.define(b, b, b)
    builder.define(source_a, root, a)
    builder.define(source_b, source_a, b)
    before = builder.freeze(root)
    description = _description(root, _atom(a), _atom(b))

    snapshot = before.snapshot()
    assert find_links(before, start=a, end=b) == ()
    assert before.snapshot() == snapshot

    evidence = materialize_sequence(before, description)

    assert before.snapshot() == snapshot
    assert find_links(before, start=a, end=b) == ()
    assert find_links(evidence.after, start=a, end=b) == (evidence.result,)
    assert evidence.after.link(evidence.result).start is a
    assert evidence.after.link(evidence.result).end is b


def test_same_carrier_can_be_passed_as_value_or_deserialized_to_target() -> None:
    builder = LinkNetworkBuilder()
    root = builder.reserve()
    a = builder.reserve()
    b = builder.reserve()
    prefix = builder.reserve()
    source_a = builder.reserve()
    carrier = builder.reserve()
    builder.define(root, root, root)
    for ref in (a, b, prefix):
        builder.define(ref, ref, ref)
    builder.define(source_a, root, a)
    builder.define(carrier, source_a, b)
    before = builder.freeze(root)

    before_snapshot = before.snapshot()
    assert find_links(before, start=a, end=b) == ()

    carrier_value = materialize_sequence(
        before,
        _description(root, _atom(prefix), _group(_atom(carrier))),
    )
    assert len(carrier_value.created) == 1
    carrier_outer = carrier_value.created[0]
    assert carrier_outer.start is prefix
    assert carrier_outer.end is carrier
    assert find_links(carrier_value.after, start=a, end=b) == ()
    assert carrier_value.after.link(carrier) is before.link(carrier)

    deserialized_value = materialize_sequence(
        before,
        _description(root, _atom(prefix), _group(_atom(a), _atom(b))),
    )
    assert len(deserialized_value.created) == 2
    target, target_outer = deserialized_value.created
    assert (target.start, target.end) == (a, b)
    assert target.ref is not carrier
    assert target_outer.start is prefix
    assert target_outer.end is target.ref
    assert deserialized_value.after.link(carrier) is before.link(carrier)
    assert before.snapshot() == before_snapshot


def test_resolved_grouping_builds_nested_deserialization_without_effect() -> None:
    before, _, refs = _base_network(("open", "close", "a", "b", "c"))
    snapshot = before.snapshot()

    description = replay_resolved_sequence_grouping(
        before,
        (
            refs["open"],
            refs["a"],
            refs["b"],
            refs["close"],
            refs["c"],
        ),
        open_form=refs["open"],
        close_form=refs["close"],
    )

    assert description == _description(
        before.root,
        _group(_atom(refs["a"]), _atom(refs["b"])),
        _atom(refs["c"]),
    )
    assert before.snapshot() == snapshot

    evidence = materialize_sequence(before, description)
    assert len(evidence.created) == 2
    nested, outer = evidence.created
    assert (nested.start, nested.end) == (refs["a"], refs["b"])
    assert outer.start is nested.ref
    assert outer.end is refs["c"]


def test_resolved_grouping_uses_exact_delimiter_identity_not_link_shape() -> None:
    builder = LinkNetworkBuilder()
    root = builder.reserve()
    left = builder.reserve()
    right = builder.reserve()
    open_form = builder.reserve()
    same_shape = builder.reserve()
    close_form = builder.reserve()
    value = builder.reserve()
    builder.define(root, root, root)
    builder.define(left, left, left)
    builder.define(right, right, right)
    builder.define(open_form, left, right)
    builder.define(same_shape, left, right)
    builder.define(close_form, close_form, close_form)
    builder.define(value, value, value)
    network = builder.freeze(root)

    assert open_form is not same_shape
    assert network.link(open_form) == network.link(same_shape)

    description = replay_resolved_sequence_grouping(
        network,
        (same_shape, value),
        open_form=open_form,
        close_form=close_form,
    )
    assert description.items == (_atom(same_shape), _atom(value))


def test_resolved_grouping_keeps_structure_strict_but_empty_group_is_root() -> None:
    before, root, refs = _base_network(("open", "close", "a"))

    with pytest.raises(SequenceMaterializationError, match="unexpected close"):
        replay_resolved_sequence_grouping(
            before,
            (refs["close"], refs["a"]),
            open_form=refs["open"],
            close_form=refs["close"],
        )

    with pytest.raises(SequenceMaterializationError, match="missing close"):
        replay_resolved_sequence_grouping(
            before,
            (refs["open"], refs["a"]),
            open_form=refs["open"],
            close_form=refs["close"],
        )

    description = replay_resolved_sequence_grouping(
        before,
        (refs["open"], refs["close"]),
        open_form=refs["open"],
        close_form=refs["close"],
    )
    assert description == _description(root, _group())

    evidence = materialize_sequence(before, description)
    assert evidence.created == ()
    assert evidence.result is root
    assert evidence.after.snapshot() == before.snapshot()


def test_infinity_abc_is_exact_left_fold_and_returns_full_prefix() -> None:
    before, root, refs = _base_network(("a", "b", "c"))
    evidence = materialize_sequence(
        before,
        _description(root, _atom(refs["a"]), _atom(refs["b"]), _atom(refs["c"])),
    )

    assert len(evidence.created) == 2
    ab, abc = evidence.created
    assert (ab.start, ab.end) == (refs["a"], refs["b"])
    assert (abc.start, abc.end) == (ab.ref, refs["c"])
    assert evidence.result is abc.ref
    assert replay_sequence_materialization(before, evidence) is abc.ref
    assert find_links(evidence.after, start=refs["b"], end=refs["c"]) == ()


def test_nested_ab_is_one_outer_value_in_infinity_group_ab_c() -> None:
    before, root, refs = _base_network(("a", "b", "c"))
    evidence = materialize_sequence(
        before,
        _description(
            root,
            _group(_atom(refs["a"]), _atom(refs["b"])),
            _atom(refs["c"]),
        ),
    )

    assert len(evidence.created) == 2
    inner, outer = evidence.created
    assert (inner.start, inner.end) == (refs["a"], refs["b"])
    assert outer.start is inner.ref
    assert outer.end is refs["c"]
    assert evidence.result is outer.ref


def test_existing_relation_and_nested_result_are_peer_sequence_values() -> None:
    builder = LinkNetworkBuilder()
    root = builder.reserve()
    a = builder.reserve()
    b = builder.reserve()
    c = builder.reserve()
    d = builder.reserve()
    existing = builder.reserve()
    builder.define(root, root, root)
    for ref in (a, b, c, d):
        builder.define(ref, ref, ref)
    builder.define(existing, a, b)
    before = builder.freeze(root)

    before_snapshot = before.snapshot()
    evidence = materialize_sequence(
        before,
        _description(
            root,
            _atom(existing),
            _group(_atom(c), _atom(d)),
        ),
    )

    assert before.snapshot() == before_snapshot
    assert len(evidence.created) == 2
    nested_result, outer = evidence.created
    assert evidence.after.link(existing) is before.link(existing)
    assert (nested_result.start, nested_result.end) == (c, d)
    assert outer.start is existing
    assert outer.end is nested_result.ref
    assert evidence.result is outer.ref
    assert replay_sequence_materialization(before, evidence) is outer.ref


def test_singleton_group_returns_exact_item_without_materialization() -> None:
    before, root, refs = _base_network(("x",))
    evidence = materialize_sequence(
        before,
        _description(root, _group(_atom(refs["x"]))),
    )

    assert evidence.created == ()
    assert evidence.result is refs["x"]
    assert evidence.after.snapshot() == before.snapshot()
    assert evidence.after.refs[refs["x"].slot] is refs["x"]


def test_full_window_cursor_position_nested_example() -> None:
    before, root, refs = _base_network(
        ("window", "cursor", "position", "x", "int", "point")
    )
    description = _description(
        root,
        _group(_atom(refs["window"])),
        _group(_atom(refs["cursor"])),
        _group(_atom(refs["position"])),
        _group(
            _group(
                _group(_atom(refs["x"])),
                _group(_atom(refs["int"])),
            ),
            _group(_atom(refs["point"])),
        ),
    )
    evidence = materialize_sequence(before, description)

    assert len(evidence.created) == 5
    xi, q, window_cursor, window_cursor_position, full = evidence.created

    assert (xi.start, xi.end) == (refs["x"], refs["int"])
    assert q.start is xi.ref
    assert q.end is refs["point"]
    assert (window_cursor.start, window_cursor.end) == (
        refs["window"],
        refs["cursor"],
    )
    assert window_cursor_position.start is window_cursor.ref
    assert window_cursor_position.end is refs["position"]
    assert full.start is window_cursor_position.ref
    assert full.end is q.ref
    assert evidence.result is full.ref
    assert replay_sequence_materialization(before, evidence) is full.ref


def test_find_is_read_only_for_present_and_absent_pairs() -> None:
    before, _, refs = _base_network(("a", "b"))
    snapshot = before.snapshot()

    assert find_links(before, start=refs["a"]) == (refs["a"],)
    assert find_links(before, start=refs["a"], end=refs["b"]) == ()
    assert before.snapshot() == snapshot


def test_wrong_root_and_foreign_atom_reject() -> None:
    before, root, refs = _base_network(("a", "b"))
    other, other_root, other_refs = _base_network(("x",))

    with pytest.raises(SequenceMaterializationError, match="exact distinguished"):
        materialize_sequence(
            before,
            _description(refs["a"], _atom(refs["a"]), _atom(refs["b"])),
        )

    assert other.root is other_root
    with pytest.raises(SequenceMaterializationError, match="before network"):
        materialize_sequence(
            before,
            _description(root, _atom(refs["a"]), _atom(other_refs["x"])),
        )


def test_empty_top_level_and_nested_contexts_return_exact_root() -> None:
    before, root, _ = _base_network(("a",))

    top_level = materialize_sequence(before, _description(root))
    nested = materialize_sequence(before, _description(root, _group()))

    for evidence in (top_level, nested):
        assert evidence.created == ()
        assert evidence.result is root
        assert evidence.after.snapshot() == before.snapshot()
        assert replay_sequence_materialization(before, evidence) is root


def test_replay_rejects_forged_edge_poles_and_result() -> None:
    before, root, refs = _base_network(("a", "b", "c"))
    evidence = materialize_sequence(
        before,
        _description(root, _atom(refs["a"]), _atom(refs["b"])),
    )
    edge = evidence.created[0]

    forged_edge = replace(edge, end=refs["c"])
    with pytest.raises(SequenceMaterializationError, match="left fold"):
        replay_sequence_materialization(
            before,
            replace(evidence, created=(forged_edge,)),
        )

    with pytest.raises(SequenceMaterializationError, match="result"):
        replay_sequence_materialization(before, replace(evidence, result=refs["a"]))


def test_replay_rejects_extra_after_occurrence() -> None:
    before, root, refs = _base_network(("a", "b"))
    evidence = materialize_sequence(
        before,
        _description(root, _atom(refs["a"]), _atom(refs["b"])),
    )
    evolution = evidence.after.evolve()
    extra = evolution.reserve()
    evolution.define(extra, refs["a"], refs["a"])
    too_large_after = evolution.freeze()

    with pytest.raises(SequenceMaterializationError, match="cardinality"):
        replay_sequence_materialization(
            before,
            replace(evidence, after=too_large_after),
        )


def test_replay_rejects_independent_reload_as_fresh_identity_lineage() -> None:
    before, root, refs = _base_network(("a", "b"))
    evidence = materialize_sequence(
        before,
        _description(root, _atom(refs["a"]), _atom(refs["b"])),
    )
    reloaded = LinkNetwork.from_snapshot(evidence.after.snapshot())

    assert reloaded.snapshot() == evidence.after.snapshot()
    assert reloaded.root is not before.root
    with pytest.raises(SequenceMaterializationError, match="changed the exact root"):
        replay_sequence_materialization(
            before,
            replace(evidence, after=reloaded),
        )


def test_snapshot_roundtrip_preserves_topology_but_creates_fresh_identity() -> None:
    before, root, refs = _base_network(("a", "b"))
    evidence = materialize_sequence(
        before,
        _description(root, _atom(refs["a"]), _atom(refs["b"])),
    )
    restored = LinkNetwork.from_snapshot(evidence.after.snapshot())

    assert restored.snapshot() == evidence.after.snapshot()
    assert restored.refs[evidence.result.slot] is not evidence.result
    assert restored.refs[evidence.result.slot] != evidence.result


def test_old_v02_memory_interning_is_not_used_by_foundation_v2_module() -> None:
    source = (ROOT / "core/foundation_v2_materialization.py").read_text(encoding="utf-8")
    assert "anum_memory" not in source
    assert "intern_link" not in source
    assert "mtc_parser" not in source
    assert "mtc_ast" not in source
    assert _contract()["compatibility"]["historicalAnumMemoryPairInterningInherited"] is False


def test_materialized_edge_has_no_hidden_semantic_tags() -> None:
    before, root, refs = _base_network(("a", "b"))
    evidence = materialize_sequence(
        before,
        _description(root, _atom(refs["a"]), _atom(refs["b"])),
    )
    edge = evidence.created[0]

    assert isinstance(edge, MaterializedEdge)
    assert set(edge.__dataclass_fields__) == {"ref", "start", "end"}