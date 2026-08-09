from __future__ import annotations

import json
from pathlib import Path

import pytest

from core.foundation_v2_persistent import (
    BatchLink,
    BatchRef,
    JsonExactLinkStore,
    PERSISTENT_SCHEMA,
    PersistentSequenceAtom,
    PersistentSequenceDescription,
    PersistentSequenceGroup,
    PersistentStoreError,
    materialize_persistent_sequence,
    replay_persistent_sequence_materialization,
)


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts/mts-foundation-v2-persistent-l4-v0.7.json"


def _contract() -> dict:
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def _self_occurrences(store: JsonExactLinkStore, count: int):
    return store.materialize_batch(
        tuple(BatchLink(BatchRef(index), BatchRef(index)) for index in range(count))
    )


def _local_topology(store: JsonExactLinkStore):
    snapshot = store.snapshot()
    return (
        snapshot.root.local,
        tuple((ref.local, start.local, end.local) for ref, start, end in snapshot.links),
    )


def _atom(ref):
    return PersistentSequenceAtom(ref)


def _group(*items):
    return PersistentSequenceGroup(tuple(items))


def test_contract_is_candidate_and_supersedes_pair_interning_for_foundation_v2() -> None:
    contract = _contract()
    assert contract["schema"] == "mts-foundation-v2-persistent-l4/v0.7"
    assert contract["status"] == "gate-p-candidate"
    assert contract["accepted"] is False
    assert contract["issue"] == 265
    assert contract["materialization"]["pairInterning"] is False
    assert contract["materialization"]["idempotentMaterializeByPair"] is False
    assert contract["aproverRepinAllowed"] is False


def test_duplicate_pair_occurrences_survive_clean_reopen(tmp_path: Path) -> None:
    path = tmp_path / "store.json"
    store = JsonExactLinkStore.create(path)
    a, b = _self_occurrences(store, 2)
    first = store.materialize(a, b)
    second = store.materialize(a, b)
    lineage = store.lineage_id

    assert first is not second
    assert first != second
    assert store.find(start=a, end=b) == (first, second)
    store.close()

    reopened = JsonExactLinkStore.open(path)
    assert reopened.lineage_id == lineage
    assert reopened.find(start=a, end=b) == (first, second)
    assert reopened.poles(first) == (a, b)
    assert reopened.poles(second) == (a, b)


def test_find_is_read_only_before_and_after_reopen(tmp_path: Path) -> None:
    path = tmp_path / "store.json"
    store = JsonExactLinkStore.create(path)
    a, b = _self_occurrences(store, 2)
    snapshot = store.snapshot()
    file_before = path.read_bytes()

    assert store.find(start=a, end=b) == ()
    assert store.snapshot() == snapshot
    assert path.read_bytes() == file_before
    store.close()

    reopened = JsonExactLinkStore.open(path)
    reopened_snapshot = reopened.snapshot()
    reopened_file = path.read_bytes()
    assert reopened.find(start=a, end=b) == ()
    assert reopened.snapshot() == reopened_snapshot
    assert path.read_bytes() == reopened_file


def test_self_and_mutual_cycles_survive_reopen(tmp_path: Path) -> None:
    path = tmp_path / "cycles.json"
    store = JsonExactLinkStore.create(path)
    x, y = _self_occurrences(store, 2)
    self_cycle = store.materialize_batch((BatchLink(BatchRef(0), BatchRef(0)),))[0]
    cycle_a, cycle_b = store.materialize_batch(
        (
            BatchLink(BatchRef(1), x),
            BatchLink(BatchRef(0), y),
        )
    )

    assert store.poles(self_cycle) == (self_cycle, self_cycle)
    assert store.poles(cycle_a) == (cycle_b, x)
    assert store.poles(cycle_b) == (cycle_a, y)
    store.close()

    reopened = JsonExactLinkStore.open(path)
    assert reopened.poles(self_cycle) == (self_cycle, self_cycle)
    assert reopened.poles(cycle_a) == (cycle_b, x)
    assert reopened.poles(cycle_b) == (cycle_a, y)


def test_shared_endpoint_remains_shared_after_reopen(tmp_path: Path) -> None:
    path = tmp_path / "sharing.json"
    store = JsonExactLinkStore.create(path)
    a, b, shared = _self_occurrences(store, 3)
    first = store.materialize(a, shared)
    second = store.materialize(b, shared)
    store.close()

    reopened = JsonExactLinkStore.open(path)
    assert reopened.poles(first) == (a, shared)
    assert reopened.poles(second) == (b, shared)
    assert reopened.incoming(shared) == (shared, first, second)


def test_root_logical_identity_survives_reopen_but_runtime_ref_is_reconstructed(
    tmp_path: Path,
) -> None:
    path = tmp_path / "root.json"
    store = JsonExactLinkStore.create(path)
    root = store.root
    runtime_before, mapping_before = store.runtime_network()
    runtime_root_before = mapping_before[root]
    store.close()

    reopened = JsonExactLinkStore.open(path)
    assert reopened.root == root
    runtime_after, mapping_after = reopened.runtime_network()
    assert runtime_after.snapshot() == runtime_before.snapshot()
    assert mapping_after[root] is not runtime_root_before
    assert mapping_after[root] != runtime_root_before


def test_invalid_batch_is_atomic_in_memory_and_on_disk(tmp_path: Path) -> None:
    path = tmp_path / "atomic-invalid.json"
    store = JsonExactLinkStore.create(path)
    before_snapshot = store.snapshot()
    before_file = path.read_bytes()

    with pytest.raises(PersistentStoreError, match="out of range"):
        store.materialize_batch((BatchLink(BatchRef(1), BatchRef(0)),))

    assert store.snapshot() == before_snapshot
    assert path.read_bytes() == before_file


def test_simulated_commit_failure_exposes_pre_state_only(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "atomic-commit.json"
    store = JsonExactLinkStore.create(path)
    a, b = _self_occurrences(store, 2)
    before_snapshot = store.snapshot()
    before_file = path.read_bytes()

    def fail(_links):
        raise OSError("simulated commit failure")

    monkeypatch.setattr(store, "_commit_candidate", fail)
    with pytest.raises(OSError, match="simulated"):
        store.materialize(a, b)

    assert store.snapshot() == before_snapshot
    assert path.read_bytes() == before_file


def test_fresh_import_of_same_topology_creates_another_lineage(tmp_path: Path) -> None:
    source_path = tmp_path / "source.json"
    imported_path = tmp_path / "imported.json"
    source = JsonExactLinkStore.create(source_path)
    a, b = _self_occurrences(source, 2)
    source.materialize(a, b)
    snapshot = source.snapshot()

    imported = JsonExactLinkStore.import_topology(imported_path, snapshot)

    assert imported.lineage_id != source.lineage_id
    assert _local_topology(imported) == _local_topology(source)
    assert imported.root.local == source.root.local
    assert imported.root != source.root


def test_backend_file_has_logical_ids_only_not_runtime_objects(tmp_path: Path) -> None:
    path = tmp_path / "wire.json"
    store = JsonExactLinkStore.create(path)
    a, b = _self_occurrences(store, 2)
    store.materialize(a, b)

    raw = json.loads(path.read_text(encoding="utf-8"))
    assert raw["schema"] == PERSISTENT_SCHEMA
    assert set(raw) == {"schema", "lineage", "root", "links"}
    assert all(isinstance(value, int) for pair in raw["links"] for value in pair)
    assert "OccurrenceRef" not in path.read_text(encoding="utf-8")


def test_persistent_sequence_materialization_replays_after_clean_reopen(
    tmp_path: Path,
) -> None:
    path = tmp_path / "sequence.json"
    store = JsonExactLinkStore.create(path)
    window, cursor, position, x, integer, point = _self_occurrences(store, 6)
    description = PersistentSequenceDescription(
        root=store.root,
        items=(
            _group(_atom(window)),
            _group(_atom(cursor)),
            _group(_atom(position)),
            _group(
                _group(_group(_atom(x)), _group(_atom(integer))),
                _group(_atom(point)),
            ),
        ),
    )

    evidence = materialize_persistent_sequence(store, description)
    assert len(evidence.created) == 5
    xi, q, window_cursor, cursor_position, position_q = evidence.created
    assert (xi.start, xi.end) == (x, integer)
    assert q.start == xi.ref
    assert q.end == point
    assert (window_cursor.start, window_cursor.end) == (window, cursor)
    assert (cursor_position.start, cursor_position.end) == (cursor, position)
    assert (position_q.start, position_q.end) == (position, q.ref)
    assert evidence.result == position_q.ref

    snapshot_after = store.snapshot()
    assert replay_persistent_sequence_materialization(store, evidence) == evidence.result
    assert store.snapshot() == snapshot_after
    store.close()

    reopened = JsonExactLinkStore.open(path)
    reopened_snapshot = reopened.snapshot()
    assert replay_persistent_sequence_materialization(reopened, evidence) == evidence.result
    assert reopened.snapshot() == reopened_snapshot


def test_sequence_bridge_preserves_duplicate_pair_policy(tmp_path: Path) -> None:
    path = tmp_path / "sequence-duplicate.json"
    store = JsonExactLinkStore.create(path)
    a, b = _self_occurrences(store, 2)
    old = store.materialize(a, b)
    description = PersistentSequenceDescription(
        root=store.root,
        items=(_atom(a), _atom(b)),
    )

    evidence = materialize_persistent_sequence(store, description)
    assert evidence.result != old
    assert store.find(start=a, end=b) == (old, evidence.result)


def test_closed_handle_rejects_observation(tmp_path: Path) -> None:
    path = tmp_path / "closed.json"
    store = JsonExactLinkStore.create(path)
    store.close()
    with pytest.raises(PersistentStoreError, match="closed"):
        _ = store.root


def test_backend_does_not_import_legacy_parser_or_pair_interning() -> None:
    source = (ROOT / "core/foundation_v2_persistent.py").read_text(encoding="utf-8")
    for forbidden in (
        "anum_memory",
        "intern_link",
        "anum_parser",
        "mtc_parser",
        "mtc_ast",
        "mtc_interpreter",
    ):
        assert forbidden not in source
    contract = _contract()
    assert contract["backendNeutrality"]["jsonReferenceFileFormatNormative"] is False
    assert contract["backendNeutrality"]["pmmApiNormative"] is False
