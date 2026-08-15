from __future__ import annotations

from dataclasses import replace
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.foundation_v2_persistent import (
    PERSISTENT_SCHEMA,
    JsonLinkStore,
    PersistentMaterializedEdge,
    PersistentSequenceAtom,
    PersistentSequenceDescription,
    PersistentSequenceGroup,
    PersistentStoreError,
    materialize_persistent_sequence,
    replay_persistent_sequence_materialization,
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


def flat(store: JsonLinkStore, *values):
    return PersistentSequenceDescription(
        root=store.root,
        items=tuple(PersistentSequenceAtom(value) for value in values),
    )


def rejection(case_id: str, category: str = "invalid-persistent-sequence", **observable) -> dict:
    result = {"id": case_id, "accepted": False, "error": category}
    if observable:
        result["observable"] = observable
    return result


def materialization_observable(store: JsonLinkStore, before: int, evidence) -> dict:
    return {
        "createdCount": len(evidence.created),
        "countDelta": store.count - before,
        "contiguous": all(edge.ref.local == evidence.before_count + index for index, edge in enumerate(evidence.created)),
        "resultIsLastCreated": bool(evidence.created) and evidence.result == evidence.created[-1].ref,
        "replays": replay_persistent_sequence_materialization(store, evidence) == evidence.result,
    }


def analyze(case: dict) -> dict:
    case_id = case["id"]
    operation = case["operation"]
    with TemporaryDirectory() as directory:
        path = Path(directory) / "store.json"

        if operation == "malformed-json":
            before = b"{bad json\n"
            path.write_bytes(before)
            try:
                JsonLinkStore.open(path)
            except PersistentStoreError:
                return rejection(case_id, "invalid-json-backend", bytesStable=path.read_bytes() == before)
            raise RuntimeError("malformed JSON accepted")

        if operation == "invalid-topology":
            payload = {
                "schema": PERSISTENT_SCHEMA,
                "lineage": "bad",
                "root": 0,
                "links": [[0, 0], [1, 1]],
            }
            before = json.dumps(payload).encode("utf-8")
            path.write_bytes(before)
            try:
                JsonLinkStore.open(path)
            except PersistentStoreError:
                return rejection(case_id, "invalid-json-backend", bytesStable=path.read_bytes() == before)
            raise RuntimeError("invalid JSON topology accepted")

        store = JsonLinkStore.create(path)

        if operation == "empty":
            before = store.count
            evidence = materialize_persistent_sequence(
                store,
                PersistentSequenceDescription(root=store.root, items=()),
            )
            return {
                "id": case_id,
                "accepted": True,
                "observable": {
                    "rootResult": evidence.result == store.root,
                    "createdCount": len(evidence.created),
                    "countDelta": store.count - before,
                },
            }

        if operation == "nested-empty":
            before = store.count
            evidence = materialize_persistent_sequence(
                store,
                PersistentSequenceDescription(
                    root=store.root,
                    items=(PersistentSequenceGroup(()),),
                ),
            )
            return {
                "id": case_id,
                "accepted": True,
                "observable": {
                    "rootResult": evidence.result == store.root,
                    "createdCount": len(evidence.created),
                    "countDelta": store.count - before,
                },
            }

        root, opening, closing, linked, _unlinked = basis(store)

        if operation == "reuse-basis-pair":
            before = store.count
            evidence = materialize_persistent_sequence(store, flat(store, opening, closing))
            return {
                "id": case_id,
                "accepted": True,
                "observable": {
                    "createdCount": len(evidence.created),
                    "countDelta": store.count - before,
                    "resultIsLinked": evidence.result == linked,
                    "replays": replay_persistent_sequence_materialization(store, evidence) == linked,
                },
            }

        a = store.materialize(opening, opening)
        b = store.materialize(closing, closing)

        if operation == "three-value":
            c = store.materialize(linked, linked)
            before = store.count
            evidence = materialize_persistent_sequence(store, flat(store, a, b, c))
            observable = materialization_observable(store, before, evidence)
            observable["exactTwoCreated"] = len(evidence.created) == 2
            if len(evidence.created) == 2:
                first, second = evidence.created
                observable["leftFoldPoles"] = (
                    first.start == a
                    and first.end == b
                    and second.start == first.ref
                    and second.end == c
                )
            else:
                observable["leftFoldPoles"] = False
            return {"id": case_id, "accepted": True, "observable": observable}

        if operation == "prefix-reuse":
            prefix = store.materialize(a, b)
            before = store.count
            evidence = materialize_persistent_sequence(store, flat(store, a, b, opening))
            return {
                "id": case_id,
                "accepted": True,
                "observable": {
                    "createdCount": len(evidence.created),
                    "countDelta": store.count - before,
                    "oneSuffix": len(evidence.created) == 1,
                    "suffixStartsPrefix": bool(evidence.created) and evidence.created[0].start == prefix,
                    "replays": replay_persistent_sequence_materialization(store, evidence) == evidence.result,
                },
            }

        if operation == "repeat":
            description = flat(store, a, b, opening)
            first = materialize_persistent_sequence(store, description)
            after_first = store.count
            second = materialize_persistent_sequence(store, description)
            return {
                "id": case_id,
                "accepted": True,
                "observable": {
                    "firstCreated": len(first.created),
                    "secondCreated": len(second.created),
                    "countStable": store.count == after_first,
                    "sameResult": second.result == first.result,
                },
            }

        if operation == "nested-group":
            description = PersistentSequenceDescription(
                root=root,
                items=(
                    PersistentSequenceAtom(opening),
                    PersistentSequenceGroup((
                        PersistentSequenceAtom(closing),
                        PersistentSequenceAtom(opening),
                    )),
                    PersistentSequenceAtom(linked),
                ),
            )
            before = store.count
            evidence = materialize_persistent_sequence(store, description)
            observable = materialization_observable(store, before, evidence)
            observable["createdNonzero"] = len(evidence.created) > 0
            return {"id": case_id, "accepted": True, "observable": observable}

        description = flat(store, a, b, opening)
        evidence = materialize_persistent_sequence(store, description)

        if operation == "reopen-replay":
            before_count = store.count
            lineage = store.lineage_id
            store.close()
            reopened = JsonLinkStore.open(path)
            before_bytes = path.read_bytes()
            result = replay_persistent_sequence_materialization(reopened, evidence)
            return {
                "id": case_id,
                "accepted": True,
                "observable": {
                    "sameLineage": reopened.lineage_id == lineage,
                    "sameCount": reopened.count == before_count,
                    "sameResult": result == evidence.result,
                    "readOnlyBytes": path.read_bytes() == before_bytes,
                },
            }

        if operation == "forged-pole":
            first = evidence.created[0]
            forged = replace(
                evidence,
                created=(
                    PersistentMaterializedEdge(first.ref, opening, first.end),
                    *evidence.created[1:],
                ),
            )
            try:
                replay_persistent_sequence_materialization(store, forged)
            except PersistentStoreError:
                return rejection(case_id)
            raise RuntimeError("forged persistent sequence pole accepted")

        if operation == "missing-created":
            forged = replace(evidence, created=evidence.created[1:])
            try:
                replay_persistent_sequence_materialization(store, forged)
            except PersistentStoreError:
                return rejection(case_id)
            raise RuntimeError("missing persistent sequence edge accepted")

        if operation == "forged-result":
            forged = replace(evidence, result=opening)
            try:
                replay_persistent_sequence_materialization(store, forged)
            except PersistentStoreError:
                return rejection(case_id)
            raise RuntimeError("forged persistent sequence result accepted")

        if operation == "wrong-before":
            forged = replace(evidence, before_count=evidence.before_count - 1)
            try:
                replay_persistent_sequence_materialization(store, forged)
            except PersistentStoreError:
                return rejection(case_id)
            raise RuntimeError("wrong persistent sequence beforeCount accepted")

        if operation == "foreign-atom":
            foreign = JsonLinkStore.create(Path(directory) / "foreign.json")
            try:
                materialize_persistent_sequence(store, flat(store, opening, foreign.root))
            except PersistentStoreError:
                return rejection(case_id)
            raise RuntimeError("foreign persistent sequence atom accepted")

        if operation == "atomic-failure":
            target_before = path.read_bytes()
            count_before = store.count

            def fail_commit(_links):
                raise OSError("injected commit failure")

            store._commit_candidate = fail_commit
            threw = False
            try:
                store.materialize(opening, opening)
            except OSError:
                threw = True
            return {
                "id": case_id,
                "accepted": True,
                "observable": {
                    "threw": threw,
                    "countStable": store.count == count_before,
                    "bytesStable": path.read_bytes() == target_before,
                    "failedLinkAbsent": store.find(start=opening, end=opening) == (),
                },
            }

        raise RuntimeError(f"unknown persistent sequence differential operation: {operation}")


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: persistent_sequence_python_oracle.py FIXTURES.json")
    corpus = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if corpus.get("schema") != "mts-persistent-sequence-differential-fixtures/v0.1":
        raise RuntimeError("unexpected persistent sequence differential fixture schema")
    if corpus.get("contract") != "mts-contract/v0.7":
        raise RuntimeError("persistent sequence differential corpus must select accepted v0.7 contract")
    verify_freeze(corpus)
    if git_blob_sha(ROOT / "core/foundation_v2_persistent.py") != PERSISTENT_BLOB:
        raise RuntimeError("frozen Python persistent owner drift")
    results = [analyze(case) for case in corpus["cases"]]
    json.dump(results, sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
