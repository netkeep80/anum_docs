from __future__ import annotations

import inspect
import json
from pathlib import Path

import pytest

from core.foundation_v2_value_bundle import (
    BundleElaborationError,
    BundleNodeKind,
    BundleRole,
    BundleRoleSkeletonBuilder,
    BundleValue,
    ExpectedRole,
    LinkValue,
    ResolvedOccurrence,
    ValueBundleReplayError,
    elaborate_bundle_roles,
    expand_resolved_bundle_query,
    build_value_bundle_vocabulary,
    resolve_flat_bundle,
    values_equal,
)
from core.mtc_ast import (
    BundleForm,
    Definition,
    EndProjection,
    Equality,
    Form,
    Inequality,
    Inversion,
    Judgment,
    LinkForm,
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
CONTRACT = ROOT / "contracts/mts-contract-v0.6.json"
ROOT_PROGRAM = ROOT / "tests/mtc_formulas.mtc"
CORE = ROOT / "core/foundation_v2_value_bundle.py"


def corpus() -> dict:
    return json.loads(CONFORMANCE.read_text(encoding="utf-8"))["corpora"][
        "valueBundle"
    ]


def entry_for(case: dict) -> ExpectedRole:
    if case.get("context") == "constraint-entry":
        return ExpectedRole.CONSTRAINT
    if case.get("context") in {"form-required", "value-entry"}:
        return ExpectedRole.VALUE
    return ExpectedRole.NONE


def bundle_path(case: dict) -> tuple[int, ...]:
    return tuple(case.get("bundlePath", ()))


def project_ast(expression, skeleton: BundleRoleSkeletonBuilder) -> LinkRef:
    """Test-only historical AST projection into the smaller rooted quotient."""

    if isinstance(expression, BundleForm):
        return skeleton.node(
            BundleNodeKind.BUNDLE,
            (project_ast(item, skeleton) for item in expression.items),
        )
    if isinstance(expression, Definition):
        return skeleton.node(
            BundleNodeKind.DEFINITION,
            (
                project_ast(expression.target, skeleton),
                project_ast(expression.value, skeleton),
            ),
        )
    if isinstance(expression, (Equality, Inequality)):
        return skeleton.node(
            BundleNodeKind.COMPARISON,
            (
                project_ast(expression.left, skeleton),
                project_ast(expression.right, skeleton),
            ),
        )
    if isinstance(expression, Sequence):
        return skeleton.node(
            BundleNodeKind.SEQUENCE,
            (project_ast(item, skeleton) for item in expression.items),
        )
    if isinstance(expression, LinkForm):
        return skeleton.node(
            BundleNodeKind.LINK,
            (
                project_ast(expression.left, skeleton),
                project_ast(expression.right, skeleton),
            ),
        )
    if isinstance(expression, (StartProjection, EndProjection, Inversion)):
        return skeleton.node(
            BundleNodeKind.UNARY,
            (project_ast(expression.value, skeleton),),
        )
    if isinstance(expression, RoundForm):
        children = (
            ()
            if expression.content is None
            else (project_ast(expression.content, skeleton),)
        )
        return skeleton.node(BundleNodeKind.ROUND, children)
    if isinstance(expression, SquareForm):
        # Current v0.2 elaboration treats square syntax as one scalar form and
        # deliberately does not inspect its content.
        return skeleton.node(BundleNodeKind.SQUARE)
    if isinstance(expression, Form):
        return skeleton.node(BundleNodeKind.SCALAR)
    if isinstance(expression, Judgment):
        return skeleton.node(BundleNodeKind.JUDGMENT)
    raise TypeError(f"unsupported ValueBundle challenge node: {type(expression).__name__}")


def build_role_challenge(source: str):
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    vocabulary = build_value_bundle_vocabulary(builder)
    skeleton = BundleRoleSkeletonBuilder(builder, vocabulary)
    carrier = project_ast(parse_formula(source), skeleton)
    return builder.freeze(root), carrier, vocabulary


def test_current_elaboration_vectors_factor_through_rooted_role_skeleton() -> None:
    for case in corpus()["elaboration"]:
        network, carrier, vocabulary = build_role_challenge(case["source"])
        result = elaborate_bundle_roles(
            network,
            carrier,
            vocabulary,
            entry=entry_for(case),
        )
        role = result.role_at(bundle_path(case))
        assert role is not None, case["id"]
        assert role.value == case["expectedRole"], case["id"]


def test_every_current_static_rejection_keeps_exact_error_code() -> None:
    for case in corpus()["staticRejections"]:
        network, carrier, vocabulary = build_role_challenge(case["source"])
        with pytest.raises(BundleElaborationError) as caught:
            elaborate_bundle_roles(
                network,
                carrier,
                vocabulary,
                entry=entry_for(case),
            )
        assert caught.value.code == case["error"], case["id"]


def semantic_fixture(ids: set[int]):
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    seed = builder.ensure_end_self_closed(root)
    current = root
    mapping: dict[int, LinkRef] = {}
    for identity in sorted(ids):
        current = builder.ensure(current, seed)
        mapping[identity] = current
    return builder.freeze(root), mapping


def required_ids(*cases: dict) -> set[int]:
    result: set[int] = set()
    for case in cases:
        for key in ("symbols", "leftHoles", "rightHoles"):
            result.update(case.get(key, {}).values())
        if "scalarIdentity" in case:
            result.add(case["scalarIdentity"])
    return result


def resolve_form(
    form,
    path: tuple[int, ...],
    *,
    symbols: dict[str, int],
    holes: dict[str, int],
    mapping: dict[int, LinkRef],
) -> LinkRef:
    if isinstance(form, Symbol):
        if form.name not in symbols:
            raise ValueError(f"unbound symbol: {form.name}")
        return mapping[symbols[form.name]]
    if isinstance(form, SquareForm) and form.content is None:
        key = ".".join(str(part) for part in path)
        if key not in holes:
            raise ValueError(f"unbound anonymous occurrence: {key}")
        return mapping[holes[key]]
    raise ValueError(f"unsupported resolved test form: {type(form).__name__}")


def resolve_bundle_source(
    network: LinkNetwork,
    source: str,
    *,
    symbols: dict[str, int],
    holes: dict[str, int],
    mapping: dict[int, LinkRef],
    path: tuple[int, ...] = (),
) -> BundleValue:
    expression = parse_formula(source)
    assert isinstance(expression, BundleForm)
    occurrences = []
    for index, item in enumerate(expression.items):
        item_path = path + (index,)
        occurrences.append(
            ResolvedOccurrence(
                item_path,
                resolve_form(
                    item,
                    item_path,
                    symbols=symbols,
                    holes=holes,
                    mapping=mapping,
                ),
            )
        )
    return resolve_flat_bundle(network, occurrences)


def portable_ids(value: BundleValue, mapping: dict[int, LinkRef]) -> list[int]:
    inverse = {ref: identity for identity, ref in mapping.items()}
    return sorted(inverse[ref] for ref in value.links)


def test_value_equality_preserves_occurrences_and_deduplicates_after_resolution() -> None:
    for case in corpus()["valueEquality"]:
        network, mapping = semantic_fixture(required_ids(case))
        left = resolve_bundle_source(
            network,
            case["left"],
            symbols=case["symbols"],
            holes=case["leftHoles"],
            mapping=mapping,
        )
        right = resolve_bundle_source(
            network,
            case["right"],
            symbols=case["symbols"],
            holes=case["rightHoles"],
            mapping=mapping,
        )

        assert portable_ids(left, mapping) == case["leftSet"], case["id"]
        assert portable_ids(right, mapping) == case["rightSet"], case["id"]
        assert values_equal(left, right) is case["equal"], case["id"]

        left_ast = parse_formula(case["left"])
        assert isinstance(left_ast, BundleForm)
        assert len(left.occurrences) == len(left_ast.items), case["id"]
        assert [item.path for item in left.occurrences] == [
            (index,) for index in range(len(left_ast.items))
        ]


def test_cross_kind_comparison_keeps_no_singleton_coercion() -> None:
    for case in corpus()["crossKindComparison"]:
        network, mapping = semantic_fixture(required_ids(case))
        bundle = resolve_bundle_source(
            network,
            case["bundle"],
            symbols=case["symbols"],
            holes={},
            mapping=mapping,
        )
        scalar = LinkValue(mapping[case["scalarIdentity"]])

        assert portable_ids(bundle, mapping) == case["bundleSet"], case["id"]
        assert values_equal(bundle, scalar) is case["equal"], case["id"]
        assert (not values_equal(bundle, scalar)) is case["notEqual"], case["id"]


def test_unresolved_or_foreign_occurrence_never_guesses_a_link() -> None:
    network, mapping = semantic_fixture(set())
    with pytest.raises(ValueError, match="unbound anonymous occurrence"):
        resolve_bundle_source(
            network,
            "{[]}",
            symbols={},
            holes={},
            mapping=mapping,
        )

    foreign_builder = LinkNetworkBuilder()
    foreign = foreign_builder.ensure_root()
    foreign_builder.freeze(foreign)
    with pytest.raises(ValueBundleReplayError, match="selected network"):
        resolve_flat_bundle(network, (ResolvedOccurrence((0,), foreign),))


def expansion_fixture() -> LinkNetwork:
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()  # slot 0: R = R -> R
    one = builder.ensure_end_self_closed(root)  # slot 1: R -> one
    two = builder.ensure(one, root)  # slot 2: one -> R
    three = builder.ensure(one, one)  # slot 3: one -> one
    assert [root.slot, one.slot, two.slot, three.slot] == [0, 1, 2, 3]
    return builder.freeze(root)


def query_endpoint(
    network: LinkNetwork,
    expression,
    path: tuple[int, ...],
    symbols: dict[str, int],
) -> LinkValue | BundleValue:
    if isinstance(expression, BundleForm):
        occurrences = []
        for index, item in enumerate(expression.items):
            item_path = path + (index,)
            assert isinstance(item, Symbol)
            occurrences.append(
                ResolvedOccurrence(item_path, network.refs[symbols[item.name]])
            )
        return resolve_flat_bundle(network, occurrences)
    assert isinstance(expression, Symbol)
    return LinkValue(network.refs[symbols[expression.name]])


def test_expansion_corpus_reuses_rooted_read_only_find_links_exactly() -> None:
    fixture = corpus()["expansionMemory"]
    assert fixture["links"] == {
        "0": [0, 0],
        "1": [0, 1],
        "2": [1, 0],
        "3": [1, 1],
    }
    network = expansion_fixture()
    symbols = fixture["symbols"]
    before = network.snapshot()

    for case in corpus()["expansion"]:
        role_network, carrier, vocabulary = build_role_challenge(case["source"])
        elaborate_bundle_roles(role_network, carrier, vocabulary)

        expression = parse_formula(case["source"])
        assert isinstance(expression, Sequence), case["id"]
        assert len(expression.items) == 2
        left = query_endpoint(network, expression.items[0], (0,), symbols)
        right = query_endpoint(network, expression.items[1], (1,), symbols)
        value = expand_resolved_bundle_query(network, left, right)

        assert sorted(ref.slot for ref in value.links) == case["expectedLinks"], case["id"]
        assert network.snapshot() == before, case["id"]


def test_missing_pair_is_omitted_and_never_materialized() -> None:
    network = expansion_fixture()
    symbols = corpus()["expansionMemory"]["symbols"]
    expression = parse_formula("a{e}")
    assert isinstance(expression, Sequence)
    left = query_endpoint(network, expression.items[0], (0,), symbols)
    right = query_endpoint(network, expression.items[1], (1,), symbols)
    before = network.snapshot()

    value = expand_resolved_bundle_query(network, left, right)

    assert value.links == frozenset()
    assert network.snapshot() == before
    assert len(network.refs) == 4


def test_runtime_handle_reissue_does_not_change_bundle_occurrence_provenance() -> None:
    network, mapping = semantic_fixture({10, 20})
    value = resolve_bundle_source(
        network,
        "{a, b, a}",
        symbols={"a": 10, "b": 20},
        holes={},
        mapping=mapping,
    )
    snapshot = network.snapshot()
    restored = LinkNetwork.from_snapshot(snapshot)
    restored_occurrences = tuple(
        ResolvedOccurrence(item.path, restored.refs[item.link.slot])
        for item in value.occurrences
    )
    restored_value = resolve_flat_bundle(restored, restored_occurrences)

    assert all(
        restored.refs[item.link.slot] != item.link
        for item in value.occurrences
    )
    assert [item.path for item in restored_value.occurrences] == [
        item.path for item in value.occurrences
    ]
    assert sorted(ref.slot for ref in restored_value.links) == sorted(
        ref.slot for ref in value.links
    )


def test_current_root_program_still_elaborates_only_constraint_bundles() -> None:
    sources = [
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    assert len(sources) == 10

    roles: list[BundleRole] = []
    for source in sources:
        network, carrier, vocabulary = build_role_challenge(source)
        result = elaborate_bundle_roles(network, carrier, vocabulary)
        roles.extend(item.role for item in result.roles)

    assert roles
    assert set(roles) == {BundleRole.CONSTRAINT}


def test_new_core_has_no_historical_ast_parser_interpreter_or_anum_memory_dependency() -> None:
    source = CORE.read_text(encoding="utf-8")
    trusted_source = "\n".join(
        inspect.getsource(function)
        for function in (
            elaborate_bundle_roles,
            resolve_flat_bundle,
            expand_resolved_bundle_query,
        )
    )

    for forbidden in ("mtc_ast", "mtc_parser", "mtc_interpreter", "anum_memory"):
        assert forbidden not in source
    assert "ensure(" not in trusted_source
    assert "find_links(" in inspect.getsource(expand_resolved_bundle_query)


def test_challenge_does_not_mutate_current_value_bundle_v02_contract() -> None:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    conformance = json.loads(CONFORMANCE.read_text(encoding="utf-8"))

    assert contract["schema"] == "mts-contract/v0.6"
    assert contract["surfaces"]["valueBundle"]["schema"] == "mts-value-bundle/v0.2"
    assert (
        contract["surfaces"]["valueBundle"]["productionIntegration"]["referenceCore"]
        == "core/mtc_value_bundle.py"
    )
    assert conformance["corpora"]["valueBundle"]["contract"] == "mts-value-bundle/v0.2"
