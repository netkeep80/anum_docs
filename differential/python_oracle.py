from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile

from core.anum_protocol import StreamError, deserialize_stream
from core.foundation_v2_persistent import JsonLinkStore, PERSISTENT_SCHEMA, PersistentStoreError
from core.rooted_link_network import LinkNetwork, LinkNetworkBuilder, LinkNetworkError, NetworkSnapshot


ROOT = Path(__file__).resolve().parents[1]
FROZEN_ORACLE_SHA = "ef42d91a868bbc5b7004acc325006ad27db3bb68"
FROZEN_BLOBS = {
    "core/rooted_link_network.py": "e914e6f70628f82484bcde43fabdf29a93300a6b",
    "core/anum_protocol.py": "5360933e282cd52981e935efc5e8796d7f9fc096",
    "core/anum_model.py": "b87b76e65a0aadb5873cc30c5d04f648cb235da9",
    "core/anum_parser.py": "a92d32f39032b841b8bbbec72ddd0bb81326610c",
    "core/foundation_v2_persistent.py": "af7e97eaea9e01cb313dc264f44f040f0f00997c",
    "core/foundation_v2_materialization.py": "ff894030ec06f15acb8530cda8fe2143ecabbed3",
}


def git_blob_sha(path: Path) -> str:
    data = path.read_bytes()
    header = f"blob {len(data)}\0".encode()
    return hashlib.sha1(header + data).hexdigest()


def verify_freeze(corpus: dict) -> None:
    if corpus.get("pythonOracleSha") != FROZEN_ORACLE_SHA:
        raise RuntimeError("differential corpus does not select the frozen Python oracle")
    changed = [
        relative
        for relative, expected in FROZEN_BLOBS.items()
        if git_blob_sha(ROOT / relative) != expected
    ]
    if changed:
        raise RuntimeError("frozen Python oracle drift: " + ", ".join(changed))


def topology_basis_loop() -> dict:
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    opening = builder.ensure_start_self_closed(root)
    closing = builder.ensure_end_self_closed(root)
    linked = builder.ensure(opening, closing)
    builder.ensure(closing, opening)
    builder.ensure(linked, linked)
    network = builder.freeze(root)
    snapshot = network.snapshot()
    return {"root": snapshot.root, "links": [list(pair) for pair in snapshot.links]}


def topology_same_pair() -> dict:
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    opening = builder.ensure_start_self_closed(root)
    closing = builder.ensure_end_self_closed(root)
    linked = builder.ensure(opening, closing)
    builder.ensure(closing, opening)
    reused = builder.ensure(opening, closing)
    network = builder.freeze(root)
    count = len(network.refs)
    snapshot = network.snapshot()
    return {
        "root": snapshot.root,
        "links": [list(pair) for pair in snapshot.links],
        "countBefore": count,
        "countAfter": count,
        "reused": reused is linked,
    }


def run_topology(case: dict) -> dict:
    operation = case["input"]["operation"]
    try:
        if operation == "basis-loop":
            observable = topology_basis_loop()
        elif operation == "same-pair":
            observable = topology_same_pair()
        elif operation == "restore":
            raw = case["input"]
            network = LinkNetwork.from_snapshot(
                NetworkSnapshot(
                    links=tuple(tuple(pair) for pair in raw["links"]),
                    root=raw["root"],
                )
            )
            snapshot = network.snapshot()
            observable = {"root": snapshot.root, "links": [list(pair) for pair in snapshot.links]}
        else:
            raise RuntimeError(f"unknown topology operation: {operation}")
    except LinkNetworkError:
        return {"id": case["id"], "accepted": False, "error": "invalid-topology"}
    return {"id": case["id"], "accepted": True, "observable": observable}


def run_anum(case: dict) -> dict:
    try:
        result = deserialize_stream(case["input"]["source"])
    except StreamError as exc:
        return {"id": case["id"], "accepted": False, "error": exc.code}
    return {
        "id": case["id"],
        "accepted": True,
        "observable": {
            "denotation": result.denotation,
            "resolvedValues": list(result.resolved_values),
            "operations": list(result.operations),
        },
    }


def persistent_basis(store: JsonLinkStore):
    root = store.root
    opening = store.materialize_start_self_closed(root)
    closing = store.materialize_end_self_closed(root)
    linked = store.materialize(opening, closing)
    store.materialize(closing, opening)
    return root, opening, closing, linked


def persistent_topology(store: JsonLinkStore) -> dict:
    snapshot = store.snapshot()
    return {
        "root": snapshot.root.local,
        "links": [[start.local, end.local] for _ref, start, end in snapshot.links],
    }


def run_persistence(case: dict) -> dict:
    operation = case["input"]["operation"]
    try:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "store.json"
            if operation == "open-topology":
                raw = case["input"]
                path.write_text(
                    json.dumps(
                        {
                            "schema": PERSISTENT_SCHEMA,
                            "lineage": "differential-lineage",
                            "root": raw["root"],
                            "links": raw["links"],
                        },
                        separators=(",", ":"),
                    )
                    + "\n",
                    encoding="utf-8",
                )
                store = JsonLinkStore.open(path)
                observable = persistent_topology(store)
            else:
                store = JsonLinkStore.create(path)
                if operation == "root":
                    observable = persistent_topology(store)
                elif operation == "basis-loop-reopen":
                    _root, _opening, _closing, linked = persistent_basis(store)
                    store.materialize(linked, linked)
                    store.close()
                    reopened = JsonLinkStore.open(path)
                    observable = persistent_topology(reopened)
                elif operation == "same-pair":
                    _root, opening, closing, linked = persistent_basis(store)
                    before = store.count
                    reused = store.materialize(opening, closing)
                    observable = {
                        **persistent_topology(store),
                        "countBefore": before,
                        "countAfter": store.count,
                        "reused": reused == linked,
                    }
                else:
                    raise RuntimeError(f"unknown persistence operation: {operation}")
    except PersistentStoreError:
        return {"id": case["id"], "accepted": False, "error": "invalid-topology"}
    return {"id": case["id"], "accepted": True, "observable": observable}


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python_oracle.py FIXTURES.json")
    corpus = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    verify_freeze(corpus)
    results = []
    for case in corpus["cases"]:
        category = case["category"]
        if category == "topology":
            results.append(run_topology(case))
        elif category == "anum":
            results.append(run_anum(case))
        elif category == "persistence":
            results.append(run_persistence(case))
        else:
            raise RuntimeError(f"unknown differential category: {category}")
    json.dump(results, sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
