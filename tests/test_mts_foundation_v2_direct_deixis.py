from __future__ import annotations

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
from core.mtc_ast import (
    BundleForm,
    ContextPronoun,
    Definition,
    EndProjection,
    Equality,
    Inequality,
    Inversion,
    LinkForm,
    Literal,
    RoundForm,
    Sequence,
    SquareForm,
    StartProjection,
    Symbol,
)
from core.mtc_parser import parse_formula
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


def ast_children(expression) -> tuple:
    if isinstance(expression, (Symbol, Literal, ContextPronoun)):
        return ()
    if isinstance(expression, (RoundForm, SquareForm)):
        return () if expression.content is None else (expression.content,)
    if isinstance(expression, (BundleForm, Sequence)):
        return expression.items
    if isinstance(expression, (StartProjection, EndProjection, Inversion)):
        return (expression.value,)
    if isinstance(expression, (LinkForm, Equality, Inequality)):
        return (expression.left, expression.right)
    if isinstance(expression, Definition):
        return (expression.target, expression.value)
    raise TypeError(f"unsupported challenge AST node: {type(expression).__name__}")


def project_ast(expression, skeleton: DirectDeixisSkeletonBuilder):
    """Test-only differential projection; never imported by Foundation-v2 core."""

    if isinstance(expression, ContextPronoun):
        pole = (
            DeicticPole.START
            if expression.pole.value == DeicticPole.START.value
            else DeicticPole.END
        )
        return skeleton.pronoun(expression.up, pole)
    if isinstance(expression, (Symbol, Literal)):
        return skeleton.opaque()
    return skeleton.node(project_ast(child, skeleton) for child in ast_children(expression))


def build_challenge(source: str):
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    vocabulary = build_direct_deixis_vocabulary(builder)
    skeleton = DirectDeixisSkeletonBuilder(builder, vocabulary)
    carrier = project_ast(parse_formula(source), skeleton)
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


def test_current_direct_deixis_vectors_factor_through_rooted_skeleton() -> None:
    for vector in direct_deixis_corpus()["vectors"]:
        network, carrier, vocabulary = build_challenge(vector["source"])
        result = analyze_direct_deixis_carrier(network, carrier, vocabulary)
        assert portable(result) == vector["expected"], vector["id"]


def test_equivalent_spellings_factor_to_the_same_rooted_query_result() -> None:
    for vector in direct_deixis_corpus()["equivalentSpellings"]:
        observed = []
        for source in vector["sources"]:
            network, carrier, vocabulary = build_challenge(source)
            observed.append(portable(analyze_direct_deixis_carrier(network, carrier, vocabulary)))
        assert all(result == vector["expected"] for result in observed), vector["id"]


def test_grouping_stays_visible_as_structural_child_path() -> None:
    network, carrier, vocabulary = build_challenge("((↑↑◁)) = a")

    assert portable(analyze_direct_deixis_carrier(network, carrier, vocabulary)) == [
        {"path": [0, 0, 0], "up": 2, "pole": "◁"}
    ]


def test_shared_semantic_subtree_produces_two_occurrence_paths() -> None:
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    vocabulary = build_direct_deixis_vocabulary(builder)
    skeleton = DirectDeixisSkeletonBuilder(builder, vocabulary)
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
    network, carrier, vocabulary = build_challenge("{◁ = a, ↑▷ = b, ▷ = c}")
    before = network.snapshot()
    expected = analyze_direct_deixis_carrier(network, carrier, vocabulary)
    assert network.snapshot() == before

    restored = LinkNetwork.from_snapshot(before)
    restored_carrier = restored.refs[carrier.slot]
    restored_vocabulary = remap_vocabulary(restored, vocabulary)

    assert restored_carrier != carrier
    assert analyze_direct_deixis_carrier(
        restored,
        restored_carrier,
        restored_vocabulary,
    ) == expected


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


def test_new_core_has_no_historical_ast_parser_interpreter_dependency() -> None:
    source = CORE.read_text(encoding="utf-8")
    query_source = inspect.getsource(analyze_direct_deixis_carrier)

    for forbidden in (
        "mtc_ast",
        "mtc_parser",
        "mtc_interpreter",
        "ContextFrame",
        "MemoryView",
        "DefinitionEnvironment",
    ):
        assert forbidden not in source
    assert "ensure(" not in query_source


def test_challenge_preserves_non_implication_boundary() -> None:
    positive_network, positive, positive_vocabulary = build_challenge("◁ = ◁")
    empty_network, empty, empty_vocabulary = build_challenge("[] = []")

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
