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
    assert all(
        after.refs[index] is ref for index, ref in enumerate(before.refs)
    )
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


def test_infinity_abc_creates_adjacent_relations_and_returns_last_edge() -> None:
    before, root, refs = _base_network(("a", "b", "c"))
    evidence = materialize_sequence(
        before,
        _description(root, _atom(refs["a"]), _atom(refs["b"]), _atom(refs["c"])),
    )

    assert len(evidence.created) == 2
    ab, bc = evidence.created
    assert (ab.start, ab.end) == (refs["a"], refs["b"])
    assert (bc.start, bc.end) == (refs["b"], refs["c"])
    assert evidence.result is bc.ref
    assert replay_sequence_materialization(before, evidence) is bc.ref


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
    xi, q, window_cursor, cursor_position, position_q = evidence.created

    assert (xi.start, xi.end) == (refs["x"], refs["int"])
    assert q.start is xi.ref
    assert q.end is refs["point"]
    assert (window_cursor.start, window_cursor.end) == (
        refs["window"],
        refs["cursor"],
    )
    assert (cursor_position.start, cursor_position.end) == (
        refs["cursor"],
        refs["position"],
    )
    assert position_q.start is refs["position"]
    assert position_q.end is q.ref
    assert evidence.result is position_q.ref
    assert replay_sequence_materialization(before, evidence) is position_q.ref


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


def test_empty_top_level_and_nested_sequences_reject() -> None:
    before, root, _ = _base_network(("a",))
    with pytest.raises(SequenceMaterializationError, match="top-level"):
        SequenceDescription(root=root, items=())
    with pytest.raises(SequenceMaterializationError, match="nested"):
        SequenceGroup(items=())
    assert before.root is root


def test_replay_rejects_forged_edge_poles_and_result() -> None:
    before, root, refs = _base_network(("a", "b", "c"))
    evidence = materialize_sequence(
        before,
        _description(root, _atom(refs["a"]), _atom(refs["b"])),
    )
    edge = evidence.created[0]

    forged_edge = replace(edge, end=refs["c"])
    with pytest.raises(SequenceMaterializationError, match="adjacency"):
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
