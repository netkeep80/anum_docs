from __future__ import annotations

import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.foundation_v2_persistent import (
    PERSISTENT_SCHEMA,
    BatchLink,
    BatchRef,
    JsonLinkStore,
    PersistentLinkId,
    PersistentStoreError,
)
from python_oracle import git_blob_sha, verify_freeze


PERSISTENT_BLOB = "af7e97eaea9e01cb313dc264f44f040f0f00997c"


def basis(store: JsonLinkStore):
    root = store.root
    opening = store.materialize_start_self_closed(root)
    closing = store.materialize_end_self_closed(root)
    linked = store.materialize(opening, closing)
    unlinked = store.materialize(closing, opening)
    return root, opening, closing, linked, unlinked


def local_pairs(store: JsonLinkStore):
    return tuple((start.local, end.local) for _ref, start, end in store.snapshot().links)


def signatures(root: int, links) -> list[str]:
    known = {root: "R"}
    remaining = set(range(len(links))) - {root}
    while remaining:
        progressed = False
        for local in tuple(sorted(remaining)):
            start, end = links[local]
            signature = None
            if start == local and end != local and end in known:
                signature = f"S({known[end]})"
            elif end == local and start != local and start in known:
                signature = f"E({known[start]})"
            elif start in known and end in known:
                signature = f"L({known[start]},{known[end]})"
            if signature is None:
                continue
            known[local] = signature
            remaining.remove(local)
            progressed = True
        if not progressed:
            raise PersistentStoreError("topology is not rooted for signature normalization")
    return sorted(known.values())


def store_signatures(store: JsonLinkStore) -> list[str]:
    return signatures(store.root.local, local_pairs(store))


def write_dataset(path: Path, links, *, root=0, lineage="fixture") -> None:
    path.write_text(
        json.dumps({
            "schema": PERSISTENT_SCHEMA,
            "lineage": lineage,
            "root": root,
            "links": links,
        }),
        encoding="utf-8",
    )


def rejection(case_id: str, *, state_stable: bool | None = None) -> dict:
    result = {"id": case_id, "accepted": False, "error": "invalid-persistent-evidence"}
    if state_stable is not None:
        result["observable"] = {"stateStable": state_stable}
    return result


def analyze(case: dict) -> dict:
    case_id = case["id"]
    operation = case["operation"]
    with TemporaryDirectory() as directory:
        path = Path(directory) / "store.json"

        if operation in {"second-root", "duplicate-pair", "forward-cycle"}:
            malformed = {
                "second-root": [[0, 0], [1, 1]],
                "duplicate-pair": [[0, 0], [1, 0], [1, 0]],
                "forward-cycle": [[0, 0], [2, 0], [1, 0]],
            }[operation]
            write_dataset(path, malformed)
            try:
                JsonLinkStore.open(path)
            except PersistentStoreError:
                return rejection(case_id)
            raise RuntimeError(f"malformed persistent topology accepted: {operation}")

        store = JsonLinkStore.create(path)

        if operation == "fresh-root":
            root = store.root
            before = store.snapshot()
            reused = store.materialize(root, root)
            return {
                "id": case_id,
                "accepted": True,
                "observable": {
                    "count": store.count,
                    "rootReused": reused == root,
                    "stateStable": store.snapshot() == before,
                    "signatures": store_signatures(store),
                },
            }

        if operation == "basis-loop":
            root, opening, closing, linked, unlinked = basis(store)
            loop = store.materialize(linked, linked)
            count = store.count
            reused = (
                store.materialize_start_self_closed(root) == opening
                and store.materialize_end_self_closed(root) == closing
                and store.materialize(opening, closing) == linked
                and store.materialize(closing, opening) == unlinked
                and store.materialize(linked, linked) == loop
            )
            return {
                "id": case_id,
                "accepted": True,
                "observable": {
                    "count": store.count,
                    "idempotent": reused and store.count == count,
                    "loopDistinct": loop != linked,
                    "signatures": store_signatures(store),
                },
            }

        if operation == "reopen":
            basis(store)
            before = store_signatures(store)
            count = store.count
            lineage = store.lineage_id
            store.close()
            reopened = JsonLinkStore.open(path)
            return {
                "id": case_id,
                "accepted": True,
                "observable": {
                    "countStable": reopened.count == count,
                    "lineageStable": reopened.lineage_id == lineage,
                    "topologyStable": store_signatures(reopened) == before,
                    "signatures": store_signatures(reopened),
                },
            }

        if operation == "fresh-lineage":
            basis(store)
            snapshot = store.snapshot()
            first_signatures = store_signatures(store)
            imported = JsonLinkStore.import_topology(Path(directory) / "imported.json", snapshot)
            return {
                "id": case_id,
                "accepted": True,
                "observable": {
                    "countStable": imported.count == store.count,
                    "lineageChanged": imported.lineage_id != store.lineage_id,
                    "topologyStable": store_signatures(imported) == first_signatures,
                    "signatures": store_signatures(imported),
                },
            }

        if operation == "read-only":
            _root, opening, closing, linked, _unlinked = basis(store)
            before = store.snapshot()
            exact = store.find(start=opening, end=closing) == (linked,)
            outgoing = linked in store.outgoing(opening)
            incoming = linked in store.incoming(closing)
            all_count = len(store.all_links())
            return {
                "id": case_id,
                "accepted": True,
                "observable": {
                    "exact": exact,
                    "outgoing": outgoing,
                    "incoming": incoming,
                    "allCount": all_count,
                    "stateStable": store.snapshot() == before,
                },
            }

        if operation == "batch-dependency":
            root = store.root
            results = store.materialize_batch((
                BatchLink(BatchRef(0), root),
                BatchLink(root, BatchRef(1)),
                BatchLink(BatchRef(0), BatchRef(1)),
                BatchLink(BatchRef(1), BatchRef(0)),
            ))
            opening, closing, linked, unlinked = results
            return {
                "id": case_id,
                "accepted": True,
                "observable": {
                    "count": store.count,
                    "polesCorrect": (
                        store.poles(opening) == (opening, root)
                        and store.poles(closing) == (root, closing)
                        and store.poles(linked) == (opening, closing)
                        and store.poles(unlinked) == (closing, opening)
                    ),
                    "signatures": store_signatures(store),
                },
            }

        if operation == "batch-double-self":
            root = store.root
            before = store.snapshot()
            result = store.materialize_batch((BatchLink(BatchRef(0), BatchRef(0)),))
            return {
                "id": case_id,
                "accepted": True,
                "observable": {
                    "returnedRoot": result == (root,),
                    "stateStable": store.snapshot() == before,
                },
            }

        if operation == "runtime-prefix":
            basis(store)
            network, _mapping = store.runtime_network(count=3)
            snapshot = network.snapshot()
            return {
                "id": case_id,
                "accepted": True,
                "observable": {
                    "count": len(snapshot.links),
                    "signatures": signatures(snapshot.root, snapshot.links),
                },
            }

        if operation == "forward-batch":
            before = store.snapshot()
            file_before = path.read_bytes()
            try:
                store.materialize_batch((
                    BatchLink(BatchRef(1), store.root),
                    BatchLink(BatchRef(0), store.root),
                ))
            except PersistentStoreError:
                return rejection(
                    case_id,
                    state_stable=store.snapshot() == before and path.read_bytes() == file_before,
                )
            raise RuntimeError("forward batch reference accepted")

        if operation == "foreign-id":
            foreign = JsonLinkStore.create(Path(directory) / "foreign.json")
            try:
                store.poles(foreign.root)
            except PersistentStoreError:
                return rejection(case_id)
            raise RuntimeError("foreign persistent id accepted")

        if operation == "invalid-coordinate":
            try:
                PersistentLinkId(store.lineage_id, True)
            except PersistentStoreError:
                return rejection(case_id)
            raise RuntimeError("boolean persistent coordinate accepted")

        if operation == "commit-failure":
            root = store.root
            before = store.snapshot()
            file_before = path.read_bytes()

            def fail_commit(_links):
                raise OSError("injected commit failure")

            store._commit_candidate = fail_commit
            threw = False
            try:
                store.materialize_start_self_closed(root)
            except OSError:
                threw = True
            return {
                "id": case_id,
                "accepted": True,
                "observable": {
                    "threw": threw,
                    "stateStable": store.snapshot() == before and path.read_bytes() == file_before,
                    "failedLinkAbsent": store.find(start=root) == (root,),
                },
            }

        raise RuntimeError(f"unknown persistence differential operation: {operation}")


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: persistence_python_oracle.py FIXTURES.json")
    corpus = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if corpus.get("schema") != "mts-persistence-differential-fixtures/v0.1":
        raise RuntimeError("unexpected persistence differential fixture schema")
    if corpus.get("contract") != "mts-contract/v0.7":
        raise RuntimeError("persistence differential corpus must select accepted v0.7 contract")
    verify_freeze(corpus)
    if git_blob_sha(ROOT / "core/foundation_v2_persistent.py") != PERSISTENT_BLOB:
        raise RuntimeError("frozen Python persistence owner drift")
    results = [analyze(case) for case in corpus["cases"]]
    json.dump(results, sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
