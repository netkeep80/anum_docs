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


def _anchor(builder: LinkNetworkBuilder):
    """Create a fresh value distinguished from the rooted structure."""

    if not builder._refs:
        return builder.ensure_root()
    current = next(
        ref
        for ref, link in reversed(list(zip(builder._refs, builder._links)))
        if link is not None
    )
    count = len(builder._refs)
    while len(builder._refs) == count:
        current = builder.ensure_start_self_closed(current)
    return current


def _base_network(names: tuple[str, ...]):
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    refs = {name: _anchor(builder) for name in names}
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
    assert contract["sequenceSemantics"]["emptySequenceAllowed"] is True
    assert "left fold" in contract["sequenceSemantics"]["fold"]


def test_evolution_preserves_base_and_appends_one_absent_pair() -> None:
    before, root, refs = _base_network(("a", "b"))
    before_snapshot = before.snapshot()
    evolution = before.evolve()
    created = evolution.ensure(refs["a"], refs["b"])
    after = evolution.freeze()

    assert before.snapshot() == before_snapshot
    assert after.root is root
    assert after.refs[: len(before.refs)] == before.refs
    assert after.link(refs["a"]) is before.link(refs["a"])
    assert after.link(created).start is refs["a"]
    assert after.link(created).end is refs["b"]
    with pytest.raises(LinkNetworkError, match="slot is out of range"):
        before.link(created)


def test_existing_pair_is_reused_instead_of_materialized_again() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    a = _anchor(builder)
    b = _anchor(builder)
    existing = builder.ensure(a, b)
    before = builder.freeze(root)
    snapshot = before.snapshot()

    evidence = materialize_sequence(before, _description(root, _atom(a), _atom(b)))

    assert evidence.result is existing
    assert evidence.created == ()
    assert evidence.after.snapshot() == snapshot
    assert find_links(evidence.after, start=a, end=b) == (existing,)


def test_source_carrier_does_not_imply_deserialized_target_before_effect() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    a = _anchor(builder)
    b = _anchor(builder)
    source_a = builder.ensure(root, a)
    builder.ensure(source_a, b)
    before = builder.freeze(root)
    description = _description(root, _atom(a), _atom(b))

    snapshot = before.snapshot()
    assert find_links(before, start=a, end=b) == ()

    evidence = materialize_sequence(before, description)

    assert before.snapshot() == snapshot
    assert find_links(before, start=a, end=b) == ()
    assert find_links(evidence.after, start=a, end=b) == (evidence.result,)
    assert len(evidence.created) == 1


def test_carrier_value_and_deserialized_value_are_different_structures() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    a = _anchor(builder)
    b = _anchor(builder)
    prefix = _anchor(builder)
    source_a = builder.ensure(root, a)
    carrier = builder.ensure(source_a, b)
    before = builder.freeze(root)
    before_snapshot = before.snapshot()

    carrier_value = materialize_sequence(
        before,
        _description(root, _atom(prefix), _group(_atom(carrier))),
    )
    assert len(carrier_value.created) == 1
    carrier_outer = carrier_value.created[0]
    assert carrier_outer.start is prefix
    assert carrier_outer.end is carrier
    assert find_links(carrier_value.after, start=a, end=b) == ()

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
    assert before.snapshot() == before_snapshot


def test_resolved_grouping_builds_nested_description_without_effect() -> None:
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
    assert (outer.start, outer.end) == (nested.ref, refs["c"])


def test_same_delimiter_pair_is_the_same_delimiter_link() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    left = _anchor(builder)
    right = _anchor(builder)
    open_form = builder.ensure(left, right)
    same_form = builder.ensure(left, right)
    close_form = _anchor(builder)
    value = _anchor(builder)
    network = builder.freeze(root)

    assert same_form is open_form
    description = replay_resolved_sequence_grouping(
        network,
        (same_form, value, close_form),
        open_form=open_form,
        close_form=close_form,
    )
    assert description.items == (_group(_atom(value)),)


def test_grouping_is_strict_but_empty_group_returns_root() -> None:
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


def test_infinity_abc_is_left_fold_and_returns_full_prefix() -> None:
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


def test_nested_ab_is_one_outer_value() -> None:
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
    assert (outer.start, outer.end) == (inner.ref, refs["c"])
    assert evidence.result is outer.ref


def test_existing_relation_and_nested_result_are_peer_values() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    a = _anchor(builder)
    b = _anchor(builder)
    c = _anchor(builder)
    d = _anchor(builder)
    existing = builder.ensure(a, b)
    before = builder.freeze(root)
    before_snapshot = before.snapshot()

    evidence = materialize_sequence(
        before,
        _description(root, _atom(existing), _group(_atom(c), _atom(d))),
    )

    assert before.snapshot() == before_snapshot
    assert len(evidence.created) == 2
    nested_result, outer = evidence.created
    assert evidence.after.link(existing) is before.link(existing)
    assert (nested_result.start, nested_result.end) == (c, d)
    assert (outer.start, outer.end) == (existing, nested_result.ref)
    assert evidence.result is outer.ref


def test_singleton_group_returns_item_without_materialization() -> None:
    before, root, refs = _base_network(("x",))
    evidence = materialize_sequence(
        before,
        _description(root, _group(_atom(refs["x"]))),
    )

    assert evidence.created == ()
    assert evidence.result is refs["x"]
    assert evidence.after.snapshot() == before.snapshot()


def test_full_nested_example_preserves_left_fold_structure() -> None:
    before, root, refs = _base_network(
        ("window", "cursor", "position", "x", "int", "point")
    )
    description = _description(
        root,
        _group(_atom(refs["window"])),
        _group(_atom(refs["cursor"])),
        _group(_atom(refs["position"])),
        _group(
            _group(_group(_atom(refs["x"])), _group(_atom(refs["int"]))),
            _group(_atom(refs["point"])),
        ),
    )
    evidence = materialize_sequence(before, description)

    assert len(evidence.created) == 5
    xi, q, window_cursor, window_cursor_position, full = evidence.created
    assert (xi.start, xi.end) == (refs["x"], refs["int"])
    assert (q.start, q.end) == (xi.ref, refs["point"])
    assert (window_cursor.start, window_cursor.end) == (
        refs["window"],
        refs["cursor"],
    )
    assert (window_cursor_position.start, window_cursor_position.end) == (
        window_cursor.ref,
        refs["position"],
    )
    assert (full.start, full.end) == (window_cursor_position.ref, q.ref)
    assert evidence.result is full.ref


def test_find_is_read_only_for_present_and_absent_pairs() -> None:
    before, _, refs = _base_network(("a", "b"))
    snapshot = before.snapshot()

    assert refs["a"] in find_links(before, start=refs["a"])
    assert find_links(before, start=refs["a"], end=refs["b"]) == ()
    assert before.snapshot() == snapshot


def test_wrong_root_and_foreign_atom_reject() -> None:
    before, root, refs = _base_network(("a", "b"))
    other, other_root, other_refs = _base_network(("x",))

    with pytest.raises(SequenceMaterializationError, match="distinguished network root"):
        materialize_sequence(
            before,
            _description(refs["a"], _atom(refs["a"]), _atom(refs["b"])),
        )

    assert other.root is other_root
    with pytest.raises(SequenceMaterializationError):
        materialize_sequence(
            before,
            _description(root, _atom(refs["a"]), _atom(other_refs["x"])),
        )


def test_empty_top_level_and_nested_contexts_return_root() -> None:
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
    with pytest.raises(SequenceMaterializationError):
        replay_sequence_materialization(
            before,
            replace(evidence, created=(forged_edge,)),
        )

    with pytest.raises(SequenceMaterializationError, match="result"):
        replay_sequence_materialization(before, replace(evidence, result=refs["a"]))


def test_replay_rejects_extra_after_link() -> None:
    before, root, refs = _base_network(("a", "b"))
    evidence = materialize_sequence(
        before,
        _description(root, _atom(refs["a"]), _atom(refs["b"])),
    )
    evolution = evidence.after.evolve()
    evolution.ensure(refs["a"], refs["a"])
    too_large_after = evolution.freeze()

    with pytest.raises(SequenceMaterializationError, match="cardinality"):
        replay_sequence_materialization(
            before,
            replace(evidence, after=too_large_after),
        )


def test_replay_requires_same_runtime_access_lineage_for_evidence() -> None:
    before, root, refs = _base_network(("a", "b"))
    evidence = materialize_sequence(
        before,
        _description(root, _atom(refs["a"]), _atom(refs["b"])),
    )
    reloaded = LinkNetwork.from_snapshot(evidence.after.snapshot())

    assert reloaded.snapshot() == evidence.after.snapshot()
    assert reloaded.root is not before.root
    with pytest.raises(SequenceMaterializationError):
        replay_sequence_materialization(
            before,
            replace(evidence, after=reloaded),
        )


def test_snapshot_roundtrip_preserves_semantic_topology_with_fresh_handles() -> None:
    before, root, refs = _base_network(("a", "b"))
    evidence = materialize_sequence(
        before,
        _description(root, _atom(refs["a"]), _atom(refs["b"])),
    )
    restored = LinkNetwork.from_snapshot(evidence.after.snapshot())

    assert restored.snapshot() == evidence.after.snapshot()
    assert restored.refs[evidence.result.slot] is not evidence.result


def test_materialized_edge_has_no_hidden_semantic_tags() -> None:
    before, root, refs = _base_network(("a", "b"))
    evidence = materialize_sequence(
        before,
        _description(root, _atom(refs["a"]), _atom(refs["b"])),
    )
    edge = evidence.created[0]

    assert isinstance(edge, MaterializedEdge)
    assert set(edge.__dataclass_fields__) == {"ref", "start", "end"}


def test_materialization_module_has_no_legacy_pair_identity_dependency() -> None:
    source = (ROOT / "core/foundation_v2_materialization.py").read_text(encoding="utf-8")
    assert "anum_memory" not in source
    assert "intern_link" not in source
    assert "mtc_parser" not in source
    assert "mtc_ast" not in source
