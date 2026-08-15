from __future__ import annotations

from dataclasses import replace
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.foundation_v2_materialization import (
    SequenceAtom,
    SequenceDescription,
    SequenceGroup,
    SequenceMaterializationError,
    materialize_sequence,
    replay_sequence_materialization,
)
from core.rooted_link_network import LinkNetworkBuilder
from python_oracle import verify_freeze


def anchor(builder: LinkNetworkBuilder, current):
    return builder.ensure_start_self_closed(current)


def fixture(*, preexisting_ab: bool = False):
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    a = anchor(builder, root)
    b = anchor(builder, a)
    c = anchor(builder, b)
    ab = builder.ensure(a, b) if preexisting_ab else None
    return builder, builder.freeze(root), root, a, b, c, ab


def atom(value):
    return SequenceAtom(value)


def group(*items):
    return SequenceGroup(tuple(items))


def description(root, *items):
    return SequenceDescription(root=root, items=tuple(items))


def normalize_effect(before, effect, base_labels: dict) -> dict:
    created_labels = {edge.ref: f"e{index}" for index, edge in enumerate(effect.created)}

    def label(ref) -> str:
        if ref in base_labels:
            return base_labels[ref]
        if ref in created_labels:
            return created_labels[ref]
        raise RuntimeError("materialization observable contains an unlabeled link")

    return {
        "createdCount": len(effect.created),
        "createdEdges": [
            {"ref": created_labels[edge.ref], "start": label(edge.start), "end": label(edge.end)}
            for edge in effect.created
        ],
        "result": label(effect.result),
        "writeDelta": len(effect.after.refs) - len(before.refs),
    }


def build_effect(operation: str):
    reuse_prefix = operation in ("reuse", "partial-prefix")
    _builder, before, root, a, b, c, ab = fixture(preexisting_ab=reuse_prefix)
    base_labels = {root: "root", a: "a", b: "b", c: "c"}
    if ab is not None:
        base_labels[ab] = "ab"

    descriptions = {
        "empty": description(root),
        "singleton": description(root, atom(a)),
        "two-new": description(root, atom(a), atom(b)),
        "reuse": description(root, atom(a), atom(b)),
        "partial-prefix": description(root, atom(a), atom(b), atom(c)),
        "nested": description(root, group(atom(a), atom(b)), atom(c)),
        "empty-nested": description(root, group(), atom(c)),
        "repeated-nested": description(root, group(atom(a), atom(b)), group(atom(a), atom(b))),
        "replay-valid": description(root, atom(a), atom(b), atom(c)),
        "replay-forged-result": description(root, atom(a), atom(b), atom(c)),
        "replay-wrong-poles": description(root, atom(a), atom(b), atom(c)),
        "replay-omitted-created": description(root, atom(a), atom(b), atom(c)),
        "replay-reordered-created": description(root, atom(a), atom(b), atom(c)),
    }
    selected = descriptions.get(operation)
    if selected is None:
        raise RuntimeError(f"unknown materialization differential operation: {operation}")
    effect = materialize_sequence(before, selected)
    return before, effect, base_labels, a, c


def run(case: dict) -> dict:
    operation = case["operation"]
    before, effect, base_labels, a, c = build_effect(operation)

    if operation in {
        "empty",
        "singleton",
        "two-new",
        "reuse",
        "partial-prefix",
        "nested",
        "empty-nested",
        "repeated-nested",
    }:
        return {
            "id": case["id"],
            "accepted": True,
            "observable": normalize_effect(before, effect, base_labels),
        }

    before_snapshot = before.snapshot()
    after_snapshot = effect.after.snapshot()
    if operation == "replay-valid":
        replay_sequence_materialization(before, effect)
        observable = normalize_effect(before, effect, base_labels)
        observable["replayReadOnly"] = before.snapshot() == before_snapshot and effect.after.snapshot() == after_snapshot
        return {"id": case["id"], "accepted": True, "observable": observable}

    forged = effect
    if operation == "replay-forged-result":
        forged = replace(effect, result=a)
    elif operation == "replay-wrong-poles":
        if not effect.created:
            raise RuntimeError("wrong-poles fixture needs created evidence")
        first = replace(effect.created[0], start=c)
        forged = replace(effect, created=(first, *effect.created[1:]))
    elif operation == "replay-omitted-created":
        forged = replace(effect, created=())
    elif operation == "replay-reordered-created":
        forged = replace(effect, created=tuple(reversed(effect.created)))
    else:
        raise RuntimeError(f"unknown materialization replay operation: {operation}")

    try:
        replay_sequence_materialization(before, forged)
    except SequenceMaterializationError:
        return {"id": case["id"], "accepted": False, "error": "invalid-sequence-evidence"}
    raise RuntimeError("forged materialization evidence was unexpectedly accepted")


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: materialization_python_oracle.py FIXTURES.json")
    corpus = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if corpus.get("schema") != "mts-materialization-differential-fixtures/v0.1":
        raise RuntimeError("unexpected materialization differential fixture schema")
    if corpus.get("contract") != "mts-contract/v0.7":
        raise RuntimeError("materialization differential corpus must select accepted v0.7 contract")
    verify_freeze(corpus)
    results = [run(case) for case in corpus["cases"]]
    json.dump(results, sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
