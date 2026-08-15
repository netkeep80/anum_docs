from __future__ import annotations

import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.foundation_v2_materialization import (
    SequenceAtom,
    SequenceGroup,
    SequenceMaterializationError,
    replay_resolved_sequence_grouping,
    replay_root_opening_restoration,
)
from core.rooted_link_network import LinkNetworkBuilder
from python_oracle import verify_freeze


def fixture():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    refs = []
    current = root
    for _ in range(5):
        current = builder.ensure_start_self_closed(current)
        refs.append(current)
    opening, closing, a, b, c = refs
    return builder.freeze(root), opening, closing, a, b, c


def token_names(values, opening, closing, a, b, c):
    names = {opening: "open", closing: "close", a: "a", b: "b", c: "c"}
    return [names[value] for value in values]


def item_tree(items, a, b, c):
    names = {a: "a", b: "b", c: "c"}
    result = []
    for item in items:
        if isinstance(item, SequenceAtom):
            result.append(names[item.value])
        elif isinstance(item, SequenceGroup):
            result.append({"group": item_tree(item.items, a, b, c)})
        else:
            raise RuntimeError("unknown sequence item")
    return result


def run(case: dict) -> dict:
    network, opening, closing, a, b, c = fixture()
    operation = case["operation"]

    restore_inputs = {
        "restore-empty": (),
        "restore-non-leading": (a, closing),
        "restore-balanced": (opening, a, closing),
        "restore-deficit": (opening, closing, closing),
        "restore-recovered-prefix": (opening, closing, closing, opening),
    }
    if operation in restore_inputs:
        forms = restore_inputs[operation]
        before = network.snapshot()
        restored = replay_root_opening_restoration(
            network,
            forms,
            open_form=opening,
            close_form=closing,
        )
        after = network.snapshot()
        return {
            "id": case["id"],
            "accepted": True,
            "observable": {
                "restoredTokens": token_names(restored, opening, closing, a, b, c),
                "prependedCount": len(restored) - len(forms),
                "inputReused": restored is forms,
                "readOnlyCountStable": before == after,
            },
        }

    if operation == "restore-recovered-prefix-group":
        forms = (opening, closing, closing, opening)
        before = network.snapshot()
        restored = replay_root_opening_restoration(
            network,
            forms,
            open_form=opening,
            close_form=closing,
        )
        grouping_accepted = True
        try:
            replay_resolved_sequence_grouping(
                network,
                restored,
                open_form=opening,
                close_form=closing,
            )
        except SequenceMaterializationError:
            grouping_accepted = False
        after = network.snapshot()
        return {
            "id": case["id"],
            "accepted": True,
            "observable": {
                "restoredTokens": token_names(restored, opening, closing, a, b, c),
                "inputReused": restored is forms,
                "groupingAccepted": grouping_accepted,
                "readOnlyCountStable": before == after,
            },
        }

    group_inputs = {
        "group-empty": (),
        "group-flat": (a, b),
        "group-nested": (opening, a, b, closing, c),
        "group-empty-nested": (opening, closing),
        "group-deep": (opening, a, opening, b, closing, closing),
        "group-unexpected-close": (closing,),
        "group-unclosed-open": (opening, a),
        "group-same-delimiter": (a,),
    }
    if operation not in group_inputs:
        raise RuntimeError(f"unknown sequence differential operation: {operation}")
    forms = group_inputs[operation]
    selected_close = opening if operation == "group-same-delimiter" else closing
    before = network.snapshot()
    try:
        description = replay_resolved_sequence_grouping(
            network,
            forms,
            open_form=opening,
            close_form=selected_close,
        )
    except SequenceMaterializationError:
        return {"id": case["id"], "accepted": False, "error": "invalid-sequence-evidence"}
    after = network.snapshot()
    return {
        "id": case["id"],
        "accepted": True,
        "observable": {
            "items": item_tree(description.items, a, b, c),
            "rootMatches": description.root is network.root,
            "readOnlyCountStable": before == after,
        },
    }


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: sequence_python_oracle.py FIXTURES.json")
    corpus = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if corpus.get("schema") != "mts-sequence-differential-fixtures/v0.1":
        raise RuntimeError("unexpected sequence differential fixture schema")
    if corpus.get("contract") != "mts-contract/v0.7":
        raise RuntimeError("sequence differential corpus must select accepted v0.7 contract")
    verify_freeze(corpus)
    results = [run(case) for case in corpus["cases"]]
    json.dump(results, sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
