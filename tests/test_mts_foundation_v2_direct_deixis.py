from __future__ import annotations

import ast
import inspect
import json
from pathlib import Path

import pytest

from core.foundation_v2_direct_deixis import (
    DeicticOccurrence,
    DeicticPole,
    DirectDeixisReplayError,
    DirectDeixisSkeletonBuilder,
    DirectDeixisVocabulary,
    analyze_direct_deixis_carrier,
    build_direct_deixis_vocabulary,
)
from core.rooted_link_network import LinkNetwork, LinkNetworkBuilder, read_rooted_sequence


ROOT = Path(__file__).resolve().parents[1]
CONFORMANCE = ROOT / "contracts/mts-conformance-v0.6.json"
CORE = ROOT / "core/foundation_v2_direct_deixis.py"


def direct_deixis_corpus() -> dict:
    data = json.loads(CONFORMANCE.read_text(encoding="utf-8"))
    return data["corpora"]["directDeixis"]


def portable(occurrences: tuple[DeicticOccurrence, ...]) -> list[dict]:
    return [
        {"path": list(item.path), "up": item.up, "pole": item.pole.value}
        for item in occurrences
    ]


def imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    result: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            result.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            result.add(node.module)
    return result


def _new_skeleton():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    vocabulary = build_direct_deixis_vocabulary(builder)
    skeleton = DirectDeixisSkeletonBuilder(builder, vocabulary)
    return builder, root, vocabulary, skeleton


def _carrier_from_portable_evidence(
    skeleton: DirectDeixisSkeletonBuilder,
    expected: list[dict],
):
    """Build the rooted carrier from portable occurrence evidence, not source text."""

    trie: dict = {}
    for item in expected:
        node = trie
        for index in item["path"]:
            node = node.setdefault(index, {})
        if "pronoun" in node or any(isinstance(key, int) for key in node):
            raise AssertionError(f"overlapping direct-deixis evidence: {item!r}")
        node["pronoun"] = (item["up"], DeicticPole(item["pole"]))

    def materialize(node: dict):
        if "pronoun" in node:
            if len(node) != 1:
                raise AssertionError("pronoun occurrence cannot also have structural children")
            up, pole = node["pronoun"]
            return skeleton.pronoun(up, pole)

        indexes = [key for key in node if isinstance(key, int)]
        if not indexes:
            return skeleton.opaque()
        children = []
        for index in range(max(indexes) + 1):
            children.append(materialize(node.get(index, {})))
        return skeleton.node(children)

    return materialize(trie)


def build_from_evidence(expected: list[dict]):
    builder, root, vocabulary, skeleton = _new_skeleton()
    carrier = _carrier_from_portable_evidence(skeleton, expected)
    return builder.freeze(root), carrier, vocabulary


def remap_vocabulary(
    network: LinkNetwork,
    vocabulary: DirectDeixisVocabulary,
) -> DirectDeixisVocabulary:
    def mapped(ref):
        return network.refs[ref.slot]

    return DirectDeixisVocabulary(
        node_tag=mapped(vocabulary.node_tag),
        opaque_tag=mapped(vocabulary.opaque_tag),
        pronoun_tag=mapped(vocabulary.pronoun_tag),
        up_step=mapped(vocabulary.up_step),
        start_pole=mapped(vocabulary.start_pole),
        end_pole=mapped(vocabulary.end_pole),
    )


def test_current_direct_deixis_portable_vectors_replay_as_rooted_evidence() -> None:
    for vector in direct_deixis_corpus()["vectors"]:
        network, carrier, vocabulary = build_from_evidence(vector["expected"])
        result = analyze_direct_deixis_carrier(network, carrier, vocabulary)
        assert portable(result) == vector["expected"], vector["id"]


def test_equivalent_spelling_corpus_is_retained_as_data_not_executable_authority() -> None:
    for vector in direct_deixis_corpus()["equivalentSpellings"]:
        assert len(vector["sources"]) >= 2, vector["id"]
        network, carrier, vocabulary = build_from_evidence(vector["expected"])
        assert portable(analyze_direct_deixis_carrier(network, carrier, vocabulary)) == vector[
            "expected"
        ]


def test_grouping_stays_visible_as_structural_child_path() -> None:
    builder, root, vocabulary, skeleton = _new_skeleton()
    pronoun = skeleton.pronoun(2, DeicticPole.START)
    carrier = skeleton.node((skeleton.node((skeleton.node((pronoun,)),)), skeleton.opaque()))
    network = builder.freeze(root)

    assert portable(analyze_direct_deixis_carrier(network, carrier, vocabulary)) == [
        {"path": [0, 0, 0], "up": 2, "pole": "◁"}
    ]


def test_shared_semantic_subtree_produces_two_occurrence_paths() -> None:
    builder, root, vocabulary, skeleton = _new_skeleton()
    pronoun = skeleton.pronoun(1, DeicticPole.END)
    shared = skeleton.node((pronoun,))
    carrier = skeleton.node((shared, shared))
    network = builder.freeze(root)

    child_sequence = read_rooted_sequence(network, network.link(carrier).end)
    assert child_sequence.values == (shared, shared)
    assert portable(analyze_direct_deixis_carrier(network, carrier, vocabulary)) == [
        {"path": [0, 0], "up": 1, "pole": "▷"},
        {"path": [1, 0], "up": 1, "pole": "▷"},
    ]


def test_query_is_read_only_and_round_trip_storage_handles_do_not_change_result() -> None:
    expected = [
        {"path": [0, 0], "up": 0, "pole": "◁"},
        {"path": [1, 0], "up": 1, "pole": "▷"},
        {"path": [2, 0], "up": 0, "pole": "▷"},
    ]
    network, carrier, vocabulary = build_from_evidence(expected)
    before = network.snapshot()
    observed = analyze_direct_deixis_carrier(network, carrier, vocabulary)
    assert network.snapshot() == before

    restored = LinkNetwork.from_snapshot(before)
    restored_carrier = restored.refs[carrier.slot]
    restored_vocabulary = remap_vocabulary(restored, vocabulary)

    assert restored_carrier != carrier
    assert analyze_direct_deixis_carrier(
        restored,
        restored_carrier,
        restored_vocabulary,
    ) == observed


def test_non_rooted_child_history_and_invalid_pronoun_metadata_reject() -> None:
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    vocabulary = build_direct_deixis_vocabulary(builder)

    non_terminating_children = builder.ensure(vocabulary.node_tag, vocabulary.start_pole)
    invalid_metadata = builder.ensure(root, vocabulary.opaque_tag)
    bad_pronoun = builder.ensure(vocabulary.pronoun_tag, invalid_metadata)
    network = builder.freeze(root)

    with pytest.raises(DirectDeixisReplayError, match="NODE children"):
        analyze_direct_deixis_carrier(network, non_terminating_children, vocabulary)
    with pytest.raises(DirectDeixisReplayError, match="invalid pole marker"):
        analyze_direct_deixis_carrier(network, bad_pronoun, vocabulary)


def test_rooted_vocabulary_is_structural_not_numeric_identity() -> None:
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    vocabulary = build_direct_deixis_vocabulary(builder)
    network = builder.freeze(root)

    expected = (
        (vocabulary.start_pole, vocabulary.start_pole, root),
        (vocabulary.end_pole, root, vocabulary.end_pole),
        (vocabulary.node_tag, vocabulary.start_pole, vocabulary.end_pole),
        (vocabulary.opaque_tag, vocabulary.end_pole, vocabulary.start_pole),
        (vocabulary.pronoun_tag, vocabulary.node_tag, vocabulary.opaque_tag),
        (vocabulary.up_step, vocabulary.opaque_tag, vocabulary.node_tag),
    )
    for ref, start, end in expected:
        assert network.link(ref).start is start
        assert network.link(ref).end is end
    assert len(set(vocabulary.__dict__.values())) == 6


def test_gate_has_no_historical_ast_parser_or_interpreter_dependency() -> None:
    gate_imports = imported_modules(Path(__file__))
    core_source = CORE.read_text(encoding="utf-8")
    query_source = inspect.getsource(analyze_direct_deixis_carrier)

    assert gate_imports.isdisjoint(
        {"core.mtc_ast", "core.mtc_parser", "core.mtc_interpreter"}
    )
    for forbidden in (
        "mtc_ast",
        "mtc_parser",
        "mtc_interpreter",
        "ContextFrame",
        "MemoryView",
        "DefinitionEnvironment",
    ):
        assert forbidden not in core_source
    assert "ensure(" not in query_source


def test_rooted_result_preserves_non_implication_boundary() -> None:
    positive_network, positive, positive_vocabulary = build_from_evidence(
        [
            {"path": [0], "up": 0, "pole": "◁"},
            {"path": [1], "up": 0, "pole": "◁"},
        ]
    )
    empty_network, empty, empty_vocabulary = build_from_evidence([])

    assert len(
        analyze_direct_deixis_carrier(
            positive_network,
            positive,
            positive_vocabulary,
        )
    ) == 2
    assert analyze_direct_deixis_carrier(empty_network, empty, empty_vocabulary) == ()

    negative = {item["id"]: item for item in direct_deixis_corpus()["negativeClaims"]}
    assert negative["empty-does-not-mean-invariant"]["forbiddenConclusion"] == "ContextInvariant"
    assert negative["present-does-not-mean-sensitive"]["forbiddenConclusion"] == "ContextSensitive"
