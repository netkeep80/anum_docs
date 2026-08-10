from __future__ import annotations

from dataclasses import replace
import json
from pathlib import Path

import pytest

from core.foundation_v2_persistent import (
    PERSISTENT_SCHEMA,
    BatchLink,
    BatchRef,
    JsonLinkStore,
    PersistentLinkId,
    PersistentMaterializedEdge,
    PersistentSequenceAtom,
    PersistentSequenceDescription,
    PersistentSequenceGroup,
    PersistentStoreError,
    materialize_persistent_sequence,
    replay_persistent_sequence_materialization,
)


ROOT = Path(__file__).resolve().parents[1]


def _basis(store: JsonLinkStore):
    root = store.root
    opening = store.materialize_start_self_closed(root)
    closing = store.materialize_end_self_closed(root)
    linked = store.materialize(opening, closing)
    unlinked = store.materialize(closing, opening)
    return root, opening, closing, linked, unlinked


def _local_topology(store: JsonLinkStore):
    return tuple(
        (ref.local, start.local, end.local)
        for ref, start, end in store.snapshot().links
    )


def test_create_starts_with_unique_root_and_root_pair_is_idempotent(tmp_path) -> None:
    store = JsonLinkStore.create(tmp_path / "apamemory.json")
    root = store.root
    snapshot = store.snapshot()

    assert store.count == 1
    assert store.poles(root) == (root, root)
    assert store.materialize(root, root) == root
    assert store.count == 1
    assert store.snapshot() == snapshot


def test_root_basis_is_constructed_by_ostensive_forms_and_reused(tmp_path) -> None:
    store = JsonLinkStore.create(tmp_path / "apamemory.json")
    root, opening, closing, linked, unlinked = _basis(store)
    count = store.count

    assert store.poles(opening) == (opening, root)
    assert store.poles(closing) == (root, closing)
    assert store.poles(linked) == (opening, closing)
    assert store.poles(unlinked) == (closing, opening)

    assert store.materialize_start_self_closed(root) == opening
    assert store.materialize_end_self_closed(root) == closing
    assert store.materialize(opening, closing) == linked
    assert store.materialize(closing, opening) == unlinked
    assert store.count == count


def test_find_is_read_only_and_complete_pair_has_at_most_one_result(tmp_path) -> None:
    store = JsonLinkStore.create(tmp_path / "apamemory.json")
    _, opening, closing, linked, _ = _basis(store)
    snapshot = store.snapshot()

    assert store.find(start=opening, end=closing) == (linked,)
    assert linked in store.outgoing(opening)
    assert linked in store.incoming(closing)
    assert store.snapshot() == snapshot


def test_loop_is_not_full_self_closure(tmp_path) -> None:
    store = JsonLinkStore.create(tmp_path / "apamemory.json")
    _, opening, _, _, _ = _basis(store)
    loop = store.materialize(opening, opening)

    assert loop != opening
    assert store.poles(loop) == (opening, opening)
    assert store.materialize(opening, opening) == loop


def test_basis_and_loop_survive_clean_reopen_with_same_storage_coordinates(tmp_path) -> None:
    path = tmp_path / "apamemory.json"
    store = JsonLinkStore.create(path)
    root, opening, closing, linked, unlinked = _basis(store)
    loop = store.materialize(opening, opening)
    lineage = store.lineage_id
    expected = _local_topology(store)
    ids = (root, opening, closing, linked, unlinked, loop)
    store.close()

    reopened = JsonLinkStore.open(path)
    assert reopened.lineage_id == lineage
    assert _local_topology(reopened) == expected
    assert tuple(reopened.all_links()) == ids
    assert reopened.poles(opening) == (opening, root)
    assert reopened.poles(loop) == (opening, opening)


def test_import_same_topology_creates_fresh_storage_lineage_not_new_semantics(tmp_path) -> None:
    first = JsonLinkStore.create(tmp_path / "first.json")
    _basis(first)
    snapshot = first.snapshot()

    imported = JsonLinkStore.import_topology(tmp_path / "second.json", snapshot)

    assert imported.lineage_id != first.lineage_id
    assert _local_topology(imported) == _local_topology(first)
    runtime_first, _ = first.runtime_network()
    runtime_imported, _ = imported.runtime_network()
    assert runtime_first.snapshot().links == runtime_imported.snapshot().links


def test_batch_can_construct_rooted_forms_in_dependency_order(tmp_path) -> None:
    store = JsonLinkStore.create(tmp_path / "apamemory.json")
    root = store.root

    opening, closing, linked, unlinked = store.materialize_batch(
        (
            BatchLink(BatchRef(0), root),
            BatchLink(root, BatchRef(1)),
            BatchLink(BatchRef(0), BatchRef(1)),
            BatchLink(BatchRef(1), BatchRef(0)),
        )
    )

    assert store.poles(opening) == (opening, root)
    assert store.poles(closing) == (root, closing)
    assert store.poles(linked) == (opening, closing)
    assert store.poles(unlinked) == (closing, opening)


def test_batch_full_self_closure_resolves_to_existing_root(tmp_path) -> None:
    store = JsonLinkStore.create(tmp_path / "apamemory.json")
    root = store.root
    count = store.count

    assert store.materialize_batch(
        (BatchLink(BatchRef(0), BatchRef(0)),)
    ) == (root,)
    assert store.count == count


def test_forward_id_only_cycle_is_rejected_without_state_change(tmp_path) -> None:
    path = tmp_path / "apamemory.json"
    store = JsonLinkStore.create(path)
    root = store.root
    before = store.snapshot()
    file_before = path.read_bytes()

    with pytest.raises(PersistentStoreError, match="forward reference"):
        store.materialize_batch(
            (
                BatchLink(BatchRef(1), root),
                BatchLink(BatchRef(0), root),
            )
        )

    assert store.snapshot() == before
    assert path.read_bytes() == file_before


def test_failed_commit_leaves_memory_and_file_at_pre_state(tmp_path, monkeypatch) -> None:
    path = tmp_path / "apamemory.json"
    store = JsonLinkStore.create(path)
    _, opening, closing, _, _ = _basis(store)
    before = store.snapshot()
    file_before = path.read_bytes()

    def fail_commit(_links):
        raise OSError("simulated commit failure")

    monkeypatch.setattr(store, "_commit_candidate", fail_commit)
    with pytest.raises(OSError, match="simulated"):
        store.materialize(opening, opening)

    assert store.snapshot() == before
    assert path.read_bytes() == file_before
    assert store.find(start=opening, end=opening) == ()
    assert store.find(start=opening, end=closing)


def test_runtime_reconstruction_preserves_topology_but_uses_runtime_handles(tmp_path) -> None:
    store = JsonLinkStore.create(tmp_path / "apamemory.json")
    _basis(store)
    network, mapping = store.runtime_network()

    assert network.snapshot().links == tuple(
        (start.local, end.local) for _ref, start, end in store.snapshot().links
    )
    assert mapping[store.root] is network.root
    for persistent, runtime in mapping.items():
        start, end = store.poles(persistent)
        runtime_link = network.link(runtime)
        assert runtime_link.start is mapping[start]
        assert runtime_link.end is mapping[end]


def test_open_rejects_duplicate_pair_second_root_and_unrooted_cycle(tmp_path) -> None:
    cases = (
        [[0, 0], [0, 0]],
        [[0, 0], [1, 1]],
        [[0, 0], [2, 0], [1, 0]],
    )
    for index, links in enumerate(cases):
        path = tmp_path / f"invalid-{index}.json"
        path.write_text(
            json.dumps(
                {
                    "schema": PERSISTENT_SCHEMA,
                    "lineage": f"bad-{index}",
                    "root": 0,
                    "links": links,
                }
            ),
            encoding="utf-8",
        )
        with pytest.raises(PersistentStoreError, match="canonical|rooted"):
            JsonLinkStore.open(path)


def test_json_payload_contains_only_storage_coordinates(tmp_path) -> None:
    path = tmp_path / "apamemory.json"
    store = JsonLinkStore.create(path)
    _basis(store)
    raw = json.loads(path.read_text(encoding="utf-8"))

    assert raw["schema"] == PERSISTENT_SCHEMA
    assert isinstance(raw["lineage"], str)
    assert isinstance(raw["root"], int)
    assert all(
        isinstance(value, int)
        for pair in raw["links"]
        for value in pair
    )


def test_empty_sequence_and_empty_group_return_root_without_growth(tmp_path) -> None:
    store = JsonLinkStore.create(tmp_path / "apamemory.json")
    root = store.root
    before = store.count

    empty = materialize_persistent_sequence(
        store,
        PersistentSequenceDescription(root=root, items=()),
    )
    nested_empty = materialize_persistent_sequence(
        store,
        PersistentSequenceDescription(
            root=root,
            items=(PersistentSequenceGroup(()),),
        ),
    )

    assert empty.result == root and empty.created == ()
    assert nested_empty.result == root and nested_empty.created == ()
    assert store.count == before


def test_sequence_materialization_persists_only_absent_pair_and_then_reuses(tmp_path) -> None:
    store = JsonLinkStore.create(tmp_path / "apamemory.json")
    _, opening, closing, _, _ = _basis(store)
    description = PersistentSequenceDescription(
        root=store.root,
        items=(PersistentSequenceAtom(opening), PersistentSequenceAtom(closing)),
    )
    # The root basis already contains O⟼C = L.
    count = store.count
    reused = materialize_persistent_sequence(store, description)
    assert reused.created == ()
    assert reused.result == store.find(start=opening, end=closing)[0]
    assert store.count == count

    a = store.materialize(opening, opening)
    b = store.materialize(closing, closing)
    new_description = PersistentSequenceDescription(
        root=store.root,
        items=(PersistentSequenceAtom(a), PersistentSequenceAtom(b)),
    )
    first = materialize_persistent_sequence(store, new_description)
    after_first = store.count
    second = materialize_persistent_sequence(store, new_description)

    assert len(first.created) == 1
    assert first.result == second.result
    assert second.created == ()
    assert store.count == after_first


def test_three_value_sequence_persists_exact_left_fold_prefix(tmp_path) -> None:
    store = JsonLinkStore.create(tmp_path / "apamemory.json")
    _, opening, closing, linked, _ = _basis(store)
    a = store.materialize(opening, opening)
    b = store.materialize(closing, closing)
    c = store.materialize(linked, linked)
    description = PersistentSequenceDescription(
        root=store.root,
        items=(
            PersistentSequenceAtom(a),
            PersistentSequenceAtom(b),
            PersistentSequenceAtom(c),
        ),
    )

    evidence = materialize_persistent_sequence(store, description)

    assert len(evidence.created) == 2
    ab, abc = evidence.created
    assert (ab.start, ab.end) == (a, b)
    assert (abc.start, abc.end) == (ab.ref, c)
    assert evidence.result == abc.ref


def test_persistent_sequence_evidence_replays_after_clean_reopen(tmp_path) -> None:
    path = tmp_path / "apamemory.json"
    store = JsonLinkStore.create(path)
    _, opening, closing, _, _ = _basis(store)
    a = store.materialize(opening, opening)
    b = store.materialize(closing, closing)
    description = PersistentSequenceDescription(
        root=store.root,
        items=(PersistentSequenceAtom(a), PersistentSequenceAtom(b)),
    )
    evidence = materialize_persistent_sequence(store, description)
    snapshot = store.snapshot()
    store.close()

    reopened = JsonLinkStore.open(path)
    assert replay_persistent_sequence_materialization(reopened, evidence) == evidence.result
    assert reopened.snapshot() == snapshot


def test_forged_persistent_sequence_edge_rejects_read_only(tmp_path) -> None:
    store = JsonLinkStore.create(tmp_path / "apamemory.json")
    _, opening, closing, _, _ = _basis(store)
    a = store.materialize(opening, opening)
    b = store.materialize(closing, closing)
    evidence = materialize_persistent_sequence(
        store,
        PersistentSequenceDescription(
            root=store.root,
            items=(PersistentSequenceAtom(a), PersistentSequenceAtom(b)),
        ),
    )
    before = store.snapshot()
    edge = evidence.created[0]
    forged = replace(
        evidence,
        created=(
            PersistentMaterializedEdge(
                ref=edge.ref,
                start=opening,
                end=edge.end,
            ),
        ),
    )

    with pytest.raises((PersistentStoreError, ValueError)):
        replay_persistent_sequence_materialization(store, forged)
    assert store.snapshot() == before


def test_foreign_storage_id_and_closed_handle_reject(tmp_path) -> None:
    first = JsonLinkStore.create(tmp_path / "first.json")
    second = JsonLinkStore.create(tmp_path / "second.json")

    with pytest.raises(PersistentStoreError, match="foreign"):
        first.poles(second.root)

    first.close()
    with pytest.raises(PersistentStoreError, match="closed"):
        _ = first.count


def test_persistent_public_names_do_not_restore_occurrence_identity() -> None:
    source = (ROOT / "core/foundation_v2_persistent.py").read_text(encoding="utf-8")
    assert "PersistentOccurrenceId" not in source
    assert "JsonExactLinkStore" not in source
    assert "all_occurrences" not in source
    assert "samePairMayHaveMultipleOccurrences" not in source
    assert "fresh exact occurrence" not in source


def test_persistent_link_id_is_explicitly_only_storage_coordinate() -> None:
    ref = PersistentLinkId("lineage", 7)
    assert ref.lineage == "lineage"
    assert ref.local == 7
