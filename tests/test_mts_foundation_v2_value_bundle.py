from __future__ import annotations

import inspect
import json
from pathlib import Path

import pytest

from core.foundation_v2_value_bundle import (
    BundleRole,
    BundleValue,
    ExpectedRole,
    ScalarValue,
    ValueBundleReplayError,
    ValueBundleSkeletonBuilder,
    ValueBundleVocabulary,
    build_value_bundle_vocabulary,
    elaborate_bundle_skeleton,
    evaluate_resolved_bundle,
    expand_bundle_query,
    values_equal,
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


def distinct_value_refs(
    builder: LinkNetworkBuilder,
    vocabulary: ValueBundleVocabulary,
    identities: set[int],
) -> dict[int, LinkRef]:
    current = vocabulary.resolved_value_tag
    result: dict[int, LinkRef] = {}
    for identity in sorted(identities):
        current = builder.ensure(current, vocabulary.form_tag)
        result[identity] = current
    return result


def resolved_ids(
    bundle: BundleForm,
    symbols: dict[str, int],
    holes: dict[str, int],
    *,
    path: tuple[int, ...] = (),
) -> list[int]:
    values: list[int] = []
    for index, item in enumerate(bundle.items):
        item_path = path + (index,)
        if isinstance(item, Symbol):
            values.append(symbols[item.name])
        elif isinstance(item, SquareForm) and item.content is None:
            key = ".".join(str(part) for part in item_path)
            values.append(holes[key])
        else:
            raise TypeError(f"unsupported resolved challenge item: {type(item).__name__}")
    return values


def build_value_pair(case: dict):
    left_ast = parse_formula(case["left"])
    right_ast = parse_formula(case["right"])
    assert isinstance(left_ast, BundleForm)
    assert isinstance(right_ast, BundleForm)

    identities = set(case["symbols"].values())
    identities.update(case["leftHoles"].values())
    identities.update(case["rightHoles"].values())

    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    vocabulary = build_value_bundle_vocabulary(builder)
    skeleton = ValueBundleSkeletonBuilder(builder, vocabulary)
    mapped = distinct_value_refs(builder, vocabulary, identities)
    left_ids = resolved_ids(left_ast, case["symbols"], case["leftHoles"])
    right_ids = resolved_ids(right_ast, case["symbols"], case["rightHoles"])
    left_carrier = skeleton.resolved_bundle(mapped[item] for item in left_ids)
    right_carrier = skeleton.resolved_bundle(mapped[item] for item in right_ids)
    network = builder.freeze(root)
    return network, vocabulary, mapped, left_carrier, right_carrier


def remap_vocabulary(
    network: LinkNetwork,
    vocabulary: ValueBundleVocabulary,
) -> ValueBundleVocabulary:
    return ValueBundleVocabulary(
        **{
            name: network.refs[ref.slot]
            for name, ref in vocabulary.__dict__.items()
        }
    )


def test_current_elaboration_corpus_factors_through_rooted_skeleton() -> None:
    for case in corpus()["elaboration"]:
        network, carrier, vocabulary = build_structural(case["source"])
        elaboration = elaborate_bundle_skeleton(
            network,
            carrier,
            vocabulary,
            entry=entry(case),
        )
        role = elaboration.role_at(bundle_path(case))
        assert role is not None, case["id"]
        assert role.value == case["expectedRole"], case["id"]


def test_current_static_rejections_keep_exact_error_codes() -> None:
    for case in corpus()["staticRejections"]:
        network, carrier, vocabulary = build_structural(case["source"])
        with pytest.raises(ValueBundleReplayError) as caught:
            elaborate_bundle_skeleton(
                network,
                carrier,
                vocabulary,
                entry=entry(case),
            )
        assert caught.value.code == case["error"], case["id"]


def test_value_equality_preserves_membership_and_occurrence_coordinates() -> None:
    for case in corpus()["valueEquality"]:
        network, vocabulary, mapped, left_carrier, right_carrier = build_value_pair(case)
        before = network.snapshot()
        left = evaluate_resolved_bundle(network, left_carrier, vocabulary)
        right = evaluate_resolved_bundle(network, right_carrier, vocabulary)

        assert left.members == frozenset(mapped[item] for item in case["leftSet"]), case["id"]
        assert right.members == frozenset(mapped[item] for item in case["rightSet"]), case["id"]
        assert values_equal(left, right) is case["equal"], case["id"]
        assert network.snapshot() == before, case["id"]

        left_ast = parse_formula(case["left"])
        assert isinstance(left_ast, BundleForm)
        assert len(left.occurrences) == len(left_ast.items), case["id"]
        assert [item.path for item in left.occurrences] == [
            (index,) for index in range(len(left_ast.items))
        ]


def test_duplicate_source_positions_reuse_one_semantic_bundle_member() -> None:
    case = next(item for item in corpus()["valueEquality"] if item["id"] == "resolved-duplicate-idempotence")
    network, vocabulary, mapped, left_carrier, _ = build_value_pair(case)
    value = evaluate_resolved_bundle(network, left_carrier, vocabulary)

    assert len(value.occurrences) == 2
    assert value.occurrences[0].value is value.occurrences[1].value
    assert value.members == frozenset({mapped[10]})


def test_cross_kind_comparison_has_no_singleton_coercion() -> None:
    for case in corpus()["crossKindComparison"]:
        ast = parse_formula(case["bundle"])
        assert isinstance(ast, BundleForm)
        identities = set(case["symbols"].values()) | {case["scalarIdentity"]}
        builder = LinkNetworkBuilder()
        root = builder.ensure_root()
        vocabulary = build_value_bundle_vocabulary(builder)
        skeleton = ValueBundleSkeletonBuilder(builder, vocabulary)
        mapped = distinct_value_refs(builder, vocabulary, identities)
        bundle_ids = resolved_ids(ast, case["symbols"], {})
        carrier = skeleton.resolved_bundle(mapped[item] for item in bundle_ids)
        network = builder.freeze(root)

        bundle = evaluate_resolved_bundle(network, carrier, vocabulary)
        scalar = ScalarValue(mapped[case["scalarIdentity"]])
        assert bundle.members == frozenset(mapped[item] for item in case["bundleSet"])
        assert values_equal(bundle, scalar) is case["equal"]
        assert (not values_equal(bundle, scalar)) is case["notEqual"]


def build_expansion_memory():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()  # historical fixture 0 = (0,0)
    one = builder.ensure_end_self_closed(root)  # 1 = (0,1)
    two = builder.ensure(one, root)  # 2 = (1,0)
    three = builder.ensure(one, one)  # 3 = (1,1)
    universe = (root, one, two, three)
    old_ids = {0: root, 1: one, 2: two, 3: three}
    symbols = {
        name: old_ids[identity]
        for name, identity in corpus()["expansionMemory"]["symbols"].items()
    }
    vocabulary = build_value_bundle_vocabulary(builder)
    skeleton = ValueBundleSkeletonBuilder(builder, vocabulary)
    return builder, root, universe, old_ids, symbols, vocabulary, skeleton


def expansion_endpoint(expression, symbols, skeleton: ValueBundleSkeletonBuilder):
    if isinstance(expression, BundleForm):
        values = []
        for item in expression.items:
            assert isinstance(item, Symbol)
            values.append(symbols[item.name])
        return ("bundle", skeleton.resolved_bundle(values))
    assert isinstance(expression, Symbol)
    return ("scalar", symbols[expression.name])


def materialize_endpoint(kind, ref, network, vocabulary):
    if kind == "bundle":
        return evaluate_resolved_bundle(network, ref, vocabulary)
    return ScalarValue(ref)


def test_expansion_corpus_preserves_existing_pair_query_without_materialization() -> None:
    for case in corpus()["expansion"]:
        builder, root, universe, old_ids, symbols, vocabulary, skeleton = build_expansion_memory()
        ast = parse_formula(case["source"])
        assert isinstance(ast, Sequence), case["id"]
        assert len(ast.items) == 2, case["id"]
        left_pending = expansion_endpoint(ast.items[0], symbols, skeleton)
        right_pending = expansion_endpoint(ast.items[1], symbols, skeleton)
        network = builder.freeze(root)
        left = materialize_endpoint(*left_pending, network, vocabulary)
        right = materialize_endpoint(*right_pending, network, vocabulary)
        before = network.snapshot()

        result = expand_bundle_query(network, universe, left, right)
        expected = frozenset(old_ids[item] for item in case["expectedLinks"])
        assert result.members == expected, case["id"]
        assert result.occurrences == (), case["id"]
        assert network.snapshot() == before, case["id"]


def test_missing_pair_remains_not_found_and_does_not_create_a_link() -> None:
    case = next(item for item in corpus()["expansion"] if item["id"] == "missing-pair-no-realize")
    builder, root, universe, _old_ids, symbols, vocabulary, skeleton = build_expansion_memory()
    ast = parse_formula(case["source"])
    assert isinstance(ast, Sequence)
    left_pending = expansion_endpoint(ast.items[0], symbols, skeleton)
    right_pending = expansion_endpoint(ast.items[1], symbols, skeleton)
    network = builder.freeze(root)
    left = materialize_endpoint(*left_pending, network, vocabulary)
    right = materialize_endpoint(*right_pending, network, vocabulary)
    before = network.snapshot()

    assert expand_bundle_query(network, universe, left, right).members == frozenset()
    assert network.snapshot() == before


def test_snapshot_reload_changes_handles_but_not_bundle_membership_pattern() -> None:
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    vocabulary = build_value_bundle_vocabulary(builder)
    skeleton = ValueBundleSkeletonBuilder(builder, vocabulary)
    mapped = distinct_value_refs(builder, vocabulary, {10, 20})
    carrier = skeleton.resolved_bundle((mapped[10], mapped[10], mapped[20]))
    network = builder.freeze(root)
    expected = evaluate_resolved_bundle(network, carrier, vocabulary)

    restored = LinkNetwork.from_snapshot(network.snapshot())
    restored_carrier = restored.refs[carrier.slot]
    restored_vocabulary = remap_vocabulary(restored, vocabulary)
    observed = evaluate_resolved_bundle(restored, restored_carrier, restored_vocabulary)

    assert restored_carrier != carrier
    assert [item.path for item in observed.occurrences] == [
        item.path for item in expected.occurrences
    ]
    assert [item.value.slot for item in observed.occurrences] == [
        item.value.slot for item in expected.occurrences
    ]
    assert {item.slot for item in observed.members} == {item.slot for item in expected.members}


def test_non_rooted_structural_child_carrier_is_rejected_finitely() -> None:
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    vocabulary = build_value_bundle_vocabulary(builder)
    malformed = builder.ensure(vocabulary.bundle_tag, vocabulary.start_role)
    network = builder.freeze(root)

    with pytest.raises(ValueBundleReplayError) as caught:
        elaborate_bundle_skeleton(network, malformed, vocabulary)
    assert caught.value.code == "children-not-rooted"


def test_rooted_vocabulary_is_structural_and_query_core_has_no_historical_dependencies() -> None:
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    vocabulary = build_value_bundle_vocabulary(builder)
    network = builder.freeze(root)
    source = CORE.read_text(encoding="utf-8")
    query_source = inspect.getsource(expand_bundle_query)

    assert len(set(vocabulary.__dict__.values())) == len(vocabulary.__dict__)
    for ref in vocabulary.__dict__.values():
        network.link(ref)

    for forbidden in (
        "mtc_ast",
        "mtc_parser",
        "mtc_interpreter",
        "anum_memory",
        "ContextFrame",
        "MemoryView",
    ):
        assert forbidden not in source
    assert "ensure(" not in query_source


def test_value_bundle_challenge_does_not_mutate_current_contract_files() -> None:
    contract = json.loads((ROOT / "contracts/mts-contract-v0.6.json").read_text(encoding="utf-8"))
    surface = contract["surfaces"]["valueBundle"]
    assert surface["schema"] == "mts-value-bundle/v0.2"
    assert surface["status"] == "accepted"
    assert surface["accepted"] is True
