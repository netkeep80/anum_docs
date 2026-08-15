from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.anum_protocol import StreamError, deserialize_stream
from core.foundation_v2_persistent import JsonLinkStore, PERSISTENT_SCHEMA, PersistentStoreError
from core.foundation_v2_source import SourceFrontEndBuilder, SourceReplayError
from core.foundation_v2_state import (
    RepresentativeConflictError,
    current_of_context,
    define_context,
    define_local_representative_binding,
    local_representative_resolution,
    parent_of_context,
)
from core.rooted_link_network import (
    LinkNetwork,
    LinkNetworkBuilder,
    LinkNetworkError,
    NetworkSnapshot,
    read_rooted_sequence,
)


FROZEN_ORACLE_SHA = "ef42d91a868bbc5b7004acc325006ad27db3bb68"
FROZEN_BLOBS = {
    "core/rooted_link_network.py": "e914e6f70628f82484bcde43fabdf29a93300a6b",
    "core/anum_protocol.py": "5360933e282cd52981e935efc5e8796d7f9fc096",
    "core/anum_model.py": "b87b76e65a0aadb5873cc30c5d04f648cb235da9",
    "core/anum_parser.py": "a92d32f39032b841b8bbbec72ddd0bb81326610c",
    "core/foundation_v2_persistent.py": "af7e97eaea9e01cb313dc264f44f040f0f00997c",
    "core/foundation_v2_materialization.py": "ff894030ec06f15acb8530cda8fe2143ecabbed3",
    "core/foundation_v2_source.py": "12c764f2ab0d7b2b98078cccb6325d0663be5996",
    "core/foundation_v2_state.py": "70e7ae5eece7f347d0879ba73edc3477cf91f8b7",
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


def byte_vocabulary(builder: LinkNetworkBuilder, root):
    refs = {}
    current = root
    for value in range(256):
        current = builder.ensure_start_self_closed(current)
        refs[value] = current
    return refs


def run_source(case: dict) -> dict:
    operation = case["input"]["operation"]
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    if operation == "invalid-vocabulary":
        try:
            SourceFrontEndBuilder(builder, root, {})
        except SourceReplayError:
            return {"id": case["id"], "accepted": False, "error": "invalid-source"}
        raise RuntimeError("invalid source vocabulary was unexpectedly accepted")

    refs = byte_vocabulary(builder, root)
    front_end = SourceFrontEndBuilder(builder, root, refs)
    data = bytes(case["input"]["bytes"])
    content = front_end.content_ref(data)
    repeated_content = front_end.content_ref(data)
    source = front_end.source_occurrence(data)
    repeated_source = front_end.source_occurrence(data)
    network = builder.freeze(root)
    before = network.snapshot()
    sequence = read_rooted_sequence(network, content)
    inverse = {ref: value for value, ref in refs.items()}
    decoded = [inverse[value] for value in sequence.values]
    source_link = network.link(source.source)
    after = network.snapshot()
    return {
        "id": case["id"],
        "accepted": True,
        "observable": {
            "bytes": decoded,
            "contentIsRoot": content is root,
            "contentReused": repeated_content is content,
            "sourceReused": repeated_source.source is source.source,
            "sourceStartSelfClosed": source_link.start is source.source and source_link.end is content,
            "readOnlyCountStable": len(before.links) == len(after.links),
        },
    }


def state_basis(builder: LinkNetworkBuilder):
    root = builder.ensure_root()
    opening = builder.ensure_start_self_closed(root)
    closing = builder.ensure_end_self_closed(root)
    linked = builder.ensure(opening, closing)
    unlinked = builder.ensure(closing, opening)
    return root, opening, closing, linked, unlinked


def run_state(case: dict) -> dict:
    operation = case["input"]["operation"]
    builder = LinkNetworkBuilder()
    root, opening, closing, linked, unlinked = state_basis(builder)
    context = define_context(builder, opening, closing)

    if operation == "context":
        repeated = define_context(builder, opening, closing)
        network = builder.freeze(root)
        before = network.snapshot()
        parent = parent_of_context(network, context)
        current = current_of_context(network, context)
        after = network.snapshot()
        observable = {
            "parentMatches": parent is opening,
            "currentMatches": current is closing,
            "contextReused": repeated is context,
            "readOnlyCountStable": len(before.links) == len(after.links),
        }
    elif operation == "representative-default":
        network = builder.freeze(root)
        before = network.snapshot()
        resolution = local_representative_resolution(network, context, linked)
        after = network.snapshot()
        observable = {
            "representativeMatches": resolution.representative is linked,
            "bindingCount": len(resolution.bindings),
            "readOnlyCountStable": len(before.links) == len(after.links),
        }
    elif operation == "representative-binding":
        _pair, binding = define_local_representative_binding(builder, context, linked, unlinked)
        _pair2, repeated = define_local_representative_binding(builder, context, linked, unlinked)
        network = builder.freeze(root)
        before = network.snapshot()
        resolution = local_representative_resolution(network, context, linked)
        after = network.snapshot()
        observable = {
            "representativeMatches": resolution.representative is unlinked,
            "bindingCount": len(resolution.bindings),
            "bindingReused": repeated is binding,
            "readOnlyCountStable": len(before.links) == len(after.links),
        }
    elif operation == "representative-conflict":
        define_local_representative_binding(builder, context, linked, opening)
        define_local_representative_binding(builder, context, linked, closing)
        network = builder.freeze(root)
        try:
            local_representative_resolution(network, context, linked)
        except RepresentativeConflictError:
            return {"id": case["id"], "accepted": False, "error": "representative-conflict"}
        raise RuntimeError("representative conflict was unexpectedly accepted")
    else:
        raise RuntimeError(f"unknown state operation: {operation}")

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
        elif category == "source":
            results.append(run_source(case))
        elif category == "state":
            results.append(run_state(case))
        else:
            raise RuntimeError(f"unknown differential category: {category}")
    json.dump(results, sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
