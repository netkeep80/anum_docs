from __future__ import annotations

import inspect
import json
from pathlib import Path

import pytest

from core.foundation_v2_value_bundle import (
    ExpectedRole,
    ValueBundleReplayError,
    ValueBundleSkeletonBuilder,
    ValueBundleVocabulary,
    build_value_bundle_vocabulary,
    elaborate_bundle_skeleton,
)
from core.mtc_ast import (
    BundleForm,
    ContextPronoun,
    Definition,
    EndProjection,
    Equality,
    Form,
    Inequality,
    Inversion,
    Judgment,
    LinkForm,
    Literal,
    RoundForm,
    Sequence,
    SquareForm,
    StartProjection,
    Symbol,
)
from core.mtc_parser import parse_formula
from core.rooted_link_network import LinkNetwork, LinkNetworkBuilder, LinkRef


ROOT = Path(__file__).resolve().parents[1]
CONFORMANCE = ROOT / "contracts/mts-conformance-v0.6.json"
CORE = ROOT / "core/foundation_v2_value_bundle.py"


def corpus() -> dict:
    data = json.loads(CONFORMANCE.read_text(encoding="utf-8"))
    return data["corpora"]["valueBundle"]


def entry(case: dict) -> ExpectedRole:
    if case.get("context") == "constraint-entry":
        return ExpectedRole.CONSTRAINT
    if case.get("context") in {"form-required", "value-entry"}:
        return ExpectedRole.VALUE
    return ExpectedRole.NONE


def bundle_path(case: dict) -> tuple[int, ...]:
    return tuple(case.get("bundlePath", ()))


def project_ast(expression, skeleton: ValueBundleSkeletonBuilder) -> LinkRef:
    """Test-only AST projection; Foundation-v2 core never imports historical AST."""

    if isinstance(expression, BundleForm):
        return skeleton.bundle(project_ast(item, skeleton) for item in expression.items)
    if isinstance(expression, Definition):
        return skeleton.definition(
            project_ast(expression.target, skeleton),
            project_ast(expression.value, skeleton),
        )
    if isinstance(expression, (Equality, Inequality)):
        return skeleton.comparison(
            project_ast(expression.left, skeleton),
            project_ast(expression.right, skeleton),
        )
    if isinstance(expression, Sequence):
        return skeleton.sequence(project_ast(item, skeleton) for item in expression.items)
    if isinstance(expression, LinkForm):
        return skeleton.scalar_op(
            (project_ast(expression.left, skeleton), project_ast(expression.right, skeleton))
        )
    if isinstance(expression, (StartProjection, EndProjection, Inversion)):
        return skeleton.scalar_op((project_ast(expression.value, skeleton),))
    if isinstance(expression, RoundForm):
        child = None if expression.content is None else project_ast(expression.content, skeleton)
        return skeleton.group(child)
    if isinstance(expression, SquareForm):
        return skeleton.form()
    if isinstance(expression, (Symbol, Literal, ContextPronoun)):
        return skeleton.form()
    if isinstance(expression, Judgment):
        return skeleton.judgment()
    if isinstance(expression, Form):
        return skeleton.form()
    raise TypeError(f"unsupported challenge AST node: {type(expression).__name__}")


def build_structural(source: str):
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    vocabulary = build_value_bundle_vocabulary(builder)
    skeleton = ValueBundleSkeletonBuilder(builder, vocabulary)
    carrier = project_ast(parse_formula(source), skeleton)
    return builder.freeze(root), carrier, vocabulary


def remap_vocabulary(
    network: LinkNetwork,
    vocabulary: ValueBundleVocabulary,
) -> ValueBundleVocabulary:
    return ValueBundleVocabulary(
        **{name: network.refs[ref.slot] for name, ref in vocabulary.__dict__.items()}
    )


def test_current_elaboration_corpus_factors_through_rooted_skeleton() -> None:
    for case in corpus()["elaboration"]:
        network, carrier, vocabulary = build_structural(case["source"])
        before = network.snapshot()
        elaboration = elaborate_bundle_skeleton(
            network,
            carrier,
            vocabulary,
            entry=entry(case),
        )
        role = elaboration.role_at(bundle_path(case))
        assert role is not None, case["id"]
        assert role.value == case["expectedRole"], case["id"]
        assert network.snapshot() == before, case["id"]


def test_current_static_rejections_keep_exact_error_codes() -> None:
    for case in corpus()["staticRejections"]:
        network, carrier, vocabulary = build_structural(case["source"])
        before = network.snapshot()
        with pytest.raises(ValueBundleReplayError) as caught:
            elaborate_bundle_skeleton(
                network,
                carrier,
                vocabulary,
                entry=entry(case),
            )
        assert caught.value.code == case["error"], case["id"]
        assert network.snapshot() == before, case["id"]


def test_operator_spelling_outside_observed_role_structure_is_not_authority() -> None:
    equality = build_structural("{} = x")
    inequality = build_structural("{} != x")

    left = elaborate_bundle_skeleton(*equality)
    right = elaborate_bundle_skeleton(*inequality)
    assert left == right
    assert left.role_at((0,)).value == "ValueBundle"


def test_snapshot_reload_changes_handles_but_not_role_result() -> None:
    network, carrier, vocabulary = build_structural("{x = y, y != z}")
    expected = elaborate_bundle_skeleton(network, carrier, vocabulary)
    restored = LinkNetwork.from_snapshot(network.snapshot())
    restored_carrier = restored.refs[carrier.slot]
    restored_vocabulary = remap_vocabulary(restored, vocabulary)

    assert restored_carrier != carrier
    assert elaborate_bundle_skeleton(
        restored,
        restored_carrier,
        restored_vocabulary,
    ) == expected


def test_repeated_opaque_form_positions_do_not_require_distinct_semantic_leaves() -> None:
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    vocabulary = build_value_bundle_vocabulary(builder)
    skeleton = ValueBundleSkeletonBuilder(builder, vocabulary)
    form = skeleton.form()
    carrier = skeleton.bundle((form, form))
    network = builder.freeze(root)

    result = elaborate_bundle_skeleton(network, carrier, vocabulary)
    assert result.role_at(()) is not None
    assert result.role_at(()).value == "ValueBundle"


def test_non_rooted_structural_child_carrier_is_rejected_finitely() -> None:
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    vocabulary = build_value_bundle_vocabulary(builder)
    malformed = builder.ensure(vocabulary.bundle_tag, vocabulary.start_role)
    network = builder.freeze(root)

    with pytest.raises(ValueBundleReplayError) as caught:
        elaborate_bundle_skeleton(network, malformed, vocabulary)
    assert caught.value.code == "children-not-rooted"


def test_new_core_has_no_historical_semantic_dependency_or_query_materialization() -> None:
    source = CORE.read_text(encoding="utf-8")
    query_source = inspect.getsource(elaborate_bundle_skeleton)

    for forbidden in (
        "mtc_ast",
        "mtc_parser",
        "mtc_interpreter",
        "anum_memory",
        "ContextFrame",
        "MemoryView",
        "FormResolver",
    ):
        assert forbidden not in source
    assert "ensure(" not in query_source


def test_current_value_bundle_contract_remains_accepted_and_unmodified() -> None:
    contract = json.loads((ROOT / "contracts/mts-contract-v0.6.json").read_text(encoding="utf-8"))
    surface = contract["surfaces"]["valueBundle"]
    assert surface["schema"] == "mts-value-bundle/v0.2"
    assert surface["status"] == "accepted"
    assert surface["accepted"] is True
