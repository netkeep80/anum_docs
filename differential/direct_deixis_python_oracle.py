from __future__ import annotations

from dataclasses import replace
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.foundation_v2_direct_deixis import (
    DeicticPole,
    DirectDeixisReplayError,
    DirectDeixisSkeletonBuilder,
    analyze_direct_deixis_carrier,
    build_direct_deixis_vocabulary,
)
from core.rooted_link_network import LinkNetworkBuilder
from python_oracle import git_blob_sha, verify_freeze


DIRECT_DEIXIS_BLOB = "1345c42c8ab5c5a2e09ba9a00a28df85564faad6"


def fold(builder, values):
    current = builder.ensure_root()
    for value in values:
        current = builder.ensure(current, value)
    return current


def normalize(occurrences) -> list[dict]:
    return [
        {
            "path": list(occurrence.path),
            "up": occurrence.up,
            "pole": "start" if occurrence.pole is DeicticPole.START else "end",
        }
        for occurrence in occurrences
    ]


def analyze(case: dict) -> dict:
    operation = case["operation"]
    builder = LinkNetworkBuilder()
    vocabulary = build_direct_deixis_vocabulary(builder)
    skeleton = DirectDeixisSkeletonBuilder(builder, vocabulary)
    selected_vocabulary = vocabulary

    if operation == "basic":
        carrier = skeleton.node((
            skeleton.node((skeleton.pronoun(0, DeicticPole.START),)),
            skeleton.node((skeleton.pronoun(2, DeicticPole.END),)),
            skeleton.opaque(),
        ))
    elif operation == "shared-subtree":
        pronoun = skeleton.pronoun(1, DeicticPole.END)
        shared = skeleton.node((pronoun,))
        carrier = skeleton.node((shared, shared))
    elif operation == "deep-path":
        carrier = skeleton.node((
            skeleton.node((skeleton.node((skeleton.pronoun(2, DeicticPole.START),)),)),
            skeleton.opaque(),
        ))
    elif operation == "opaque":
        carrier = skeleton.opaque()
    elif operation == "malformed-opaque":
        carrier = builder.ensure(vocabulary.opaque_tag, vocabulary.start_pole)
    elif operation == "empty-metadata":
        carrier = builder.ensure(vocabulary.pronoun_tag, builder.ensure_root())
    elif operation == "invalid-marker":
        carrier = builder.ensure(vocabulary.pronoun_tag, fold(builder, (vocabulary.node_tag,)))
    elif operation == "non-up-prefix":
        carrier = builder.ensure(
            vocabulary.pronoun_tag,
            fold(builder, (vocabulary.opaque_tag, vocabulary.start_pole)),
        )
    elif operation == "malformed-node":
        carrier = builder.ensure(vocabulary.node_tag, vocabulary.start_pole)
    elif operation == "duplicate-vocabulary":
        carrier = skeleton.opaque()
        selected_vocabulary = replace(vocabulary, end_pole=vocabulary.start_pole)
    elif operation == "foreign-vocabulary":
        carrier = skeleton.opaque()
        other = LinkNetworkBuilder()
        other_vocabulary = build_direct_deixis_vocabulary(other)
        selected_vocabulary = replace(vocabulary, start_pole=other_vocabulary.start_pole)
    else:
        raise RuntimeError(f"unknown Direct Deixis differential operation: {operation}")

    network = builder.freeze()
    before = network.snapshot()
    try:
        occurrences = analyze_direct_deixis_carrier(network, carrier, selected_vocabulary)
    except DirectDeixisReplayError:
        return {"id": case["id"], "accepted": False, "error": "invalid-direct-deixis-evidence"}
    after = network.snapshot()
    return {
        "id": case["id"],
        "accepted": True,
        "observable": {
            "occurrences": normalize(occurrences),
            "readOnlyCountStable": before == after,
        },
    }


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: direct_deixis_python_oracle.py FIXTURES.json")
    corpus = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if corpus.get("schema") != "mts-direct-deixis-differential-fixtures/v0.1":
        raise RuntimeError("unexpected Direct Deixis differential fixture schema")
    if corpus.get("contract") != "mts-contract/v0.7":
        raise RuntimeError("Direct Deixis differential corpus must select accepted v0.7 contract")
    verify_freeze(corpus)
    if git_blob_sha(ROOT / "core/foundation_v2_direct_deixis.py") != DIRECT_DEIXIS_BLOB:
        raise RuntimeError("frozen Python Direct Deixis owner drift")
    results = [analyze(case) for case in corpus["cases"]]
    json.dump(results, sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
