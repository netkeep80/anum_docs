from __future__ import annotations

import ast
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
    build_value_bundle_vocabulary,
    elaborate_bundle_roles,
    expand_resolved_bundle_query,
    resolve_flat_bundle,
    values_equal,
)
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


def imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    result: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            result.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            result.add(node.module)
    return result


def entry_for(case: dict) -> ExpectedRole:
    if case.get("context") == "constraint-entry":
        return ExpectedRole.CONSTRAINT
    if case.get("context") in {"form-required", "value-entry"}:
        return ExpectedRole.VALUE
    return ExpectedRole.NONE


def bundle_path(case: dict) -> tuple[int, ...]:
    return tuple(case.get("bundlePath", ()))


def _new_role_builder():
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    vocabulary = build_value_bundle_vocabulary(builder)
    skeleton = BundleRoleSkeletonBuilder(builder, vocabulary)
    return builder, root, vocabulary, skeleton


def _static_fixture(case_id: str, skeleton: BundleRoleSkeletonBuilder) -> LinkRef:
    def n(kind: BundleNodeKind, *children: LinkRef) -> LinkRef:
        return skeleton.node(kind, children)

    def s() -> LinkRef:
        return n(BundleNodeKind.SCALAR)

    def b(*children: LinkRef) -> LinkRef:
        return n(BundleNodeKind.BUNDLE, *children)

    def comparison(left: LinkRef, right: LinkRef) -> LinkRef:
        return n(BundleNodeKind.COMPARISON, left, right)

    fixtures = {
        "constraint-nonempty": lambda: b(comparison(s(), s()), comparison(s(), s())),
        "value-nonempty": lambda: b(s(), s()),
        "empty-constraint-entry": lambda: b(),
        "empty-value-form-position": lambda: comparison(b(), s()),
        "empty-definition-default": lambda: n(BundleNodeKind.DEFINITION, s(), b()),
        "mixed-role": lambda: b(s(), comparison(s(), s())),
        "ambiguous-empty": lambda: b(b()),
        "nested-value": lambda: comparison(b(b(s(), s())), s()),
        "value-at-constraint-entry": lambda: b(s(), s()),
        "bundle-valued-definition-deferred": lambda: n(
            BundleNodeKind.DEFINITION, s(), b(s(), s())
        ),
        "bundle-explicit-link-pole-deferred": lambda: n(
            BundleNodeKind.LINK, b(s(), s()), s()
        ),
        "bundle-projection-deferred": lambda: n(BundleNodeKind.UNARY, b(s(), s())),
        "bundle-inversion-deferred": lambda: n(BundleNodeKind.UNARY, b(s(), s())),
        "bundle-expansion-as-explicit-link-pole-deferred": lambda: n(
            BundleNodeKind.LINK,
            n(BundleNodeKind.SEQUENCE, s(), b(s(), s())),
            s(),
        ),
    }
    try:
        return fixtures[case_id]()
    except KeyError as exc:
        raise AssertionError(f"missing rooted static fixture for {case_id}") from exc


def build_static_case(case_id: str):
    builder, root, vocabulary, skeleton = _new_role_builder()
    carrier = _static_fixture(case_id, skeleton)
    return builder.freeze(root), carrier, vocabulary


def test_current_elaboration_vectors_replay_from_explicit_rooted_role_evidence() -> None:
    for case in corpus()["elaboration"]:
        network, carrier, vocabulary = build_static_case(case["id"])
        result = elaborate_bundle_roles(
            network,
            carrier,
            vocabulary,
            entry=entry_for(case),
        )
        role = result.role_at(bundle_path(case))
        assert role is not None, case["id"]
        assert role.value == case["expectedRole"], case["id"]


def test_every_current_static_rejection_keeps_exact_error_code_without_parser() -> None:
    for case in corpus()["staticRejections"]:
        network, carrier, vocabulary = build_static_case(case["id"])
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


def bundle_from_ids(
    network: LinkNetwork,
    mapping: dict[int, LinkRef],
    identities: tuple[int, ...],
) -> BundleValue:
    return resolve_flat_bundle(
        network,
        tuple(
            ResolvedOccurrence((index,), mapping[identity])
            for index, identity in enumerate(identities)
        ),
    )


def portable_ids(value: BundleValue, mapping: dict[int, LinkRef]) -> list[int]:
    inverse = {ref: identity for identity, ref in mapping.items()}
    return sorted(inverse[ref] for ref in value.links)


VALUE_EQUALITY_OCCURRENCES = {
    "order-insensitive": ((10, 20), (20, 10)),
    "resolved-duplicate-idempotence": ((10, 10), (10,)),
    "anonymous-different-bindings": ((10, 20), (10,)),
    "anonymous-same-bindings": ((10, 10), (10,)),
    "different-sets": ((10, 20), (10,)),
}


def test_value_equality_preserves_occurrences_and_deduplicates_after_resolution() -> None:
    for case in corpus()["valueEquality"]:
        left_ids, right_ids = VALUE_EQUALITY_OCCURRENCES[case["id"]]
        network, mapping = semantic_fixture(set(left_ids) | set(right_ids))
        left = bundle_from_ids(network, mapping, left_ids)
        right = bundle_from_ids(network, mapping, right_ids)

        assert portable_ids(left, mapping) == case["leftSet"], case["id"]
        assert portable_ids(right, mapping) == case["rightSet"], case["id"]
        assert values_equal(left, right) is case["equal"], case["id"]
        assert [item.path for item in left.occurrences] == [
            (index,) for index in range(len(left_ids))
        ]
        assert len(left.occurrences) == len(left_ids), case["id"]


def test_cross_kind_comparison_keeps_no_singleton_coercion() -> None:
    for case in corpus()["crossKindComparison"]:
        identities = set(case["bundleSet"]) | {case["scalarIdentity"]}
        network, mapping = semantic_fixture(identities)
        bundle = bundle_from_ids(network, mapping, tuple(case["bundleSet"]))
        scalar = LinkValue(mapping[case["scalarIdentity"]])

        assert portable_ids(bundle, mapping) == case["bundleSet"], case["id"]
        assert values_equal(bundle, scalar) is case["equal"], case["id"]
        assert (not values_equal(bundle, scalar)) is case["notEqual"], case["id"]


def test_foreign_occurrence_is_fail_closed_and_never_guesses_a_link() -> None:
    network, _mapping = semantic_fixture(set())
    foreign_builder = LinkNetworkBuilder()
    foreign = foreign_builder.ensure_root()
    foreign_builder.freeze(foreign)

    with pytest.raises(ValueBundleReplayError, match="selected network"):
        resolve_flat_bundle(network, (ResolvedOccurrence((0,), foreign),))


def expansion_fixture() -> LinkNetwork:
    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    one = builder.ensure_end_self_closed(root)
    two = builder.ensure(one, root)
    three = builder.ensure(one, one)
    assert [root.slot, one.slot, two.slot, three.slot] == [0, 1, 2, 3]
    return builder.freeze(root)


def expansion_endpoint(network: LinkNetwork, spec: tuple[str, tuple[int, ...] | int]):
    kind, value = spec
    if kind == "scalar":
        assert isinstance(value, int)
        return LinkValue(network.refs[value])
    assert kind == "bundle" and isinstance(value, tuple)
    return resolve_flat_bundle(
        network,
        tuple(
            ResolvedOccurrence((index,), network.refs[slot])
            for index, slot in enumerate(value)
        ),
    )


EXPANSION_ENDPOINTS = {
    "single-to-bundle": (("scalar", 0), ("bundle", (0, 1))),
    "bundle-to-single": (("bundle", (0, 1)), ("scalar", 1)),
    "cartesian-existing": (("bundle", (0, 1)), ("bundle", (0, 1))),
    "outgoing-wildcard": (("scalar", 0), ("bundle", ())),
    "incoming-wildcard": (("bundle", ()), ("scalar", 1)),
    "all-links-wildcard": (("bundle", ()), ("bundle", ())),
    "missing-pair-no-realize": (("scalar", 0), ("bundle", (2,))),
}


def test_expansion_corpus_reuses_rooted_read_only_find_links_exactly() -> None:
    fixture = corpus()["expansionMemory"]
    assert fixture["links"] == {
        "0": [0, 0],
        "1": [0, 1],
        "2": [1, 0],
        "3": [1, 1],
    }
    network = expansion_fixture()
    before = network.snapshot()

    for case in corpus()["expansion"]:
        left_spec, right_spec = EXPANSION_ENDPOINTS[case["id"]]
        left = expansion_endpoint(network, left_spec)
        right = expansion_endpoint(network, right_spec)
        value = expand_resolved_bundle_query(network, left, right)

        assert sorted(ref.slot for ref in value.links) == case["expectedLinks"], case["id"]
        assert network.snapshot() == before, case["id"]


def test_missing_pair_is_omitted_and_never_materialized() -> None:
    network = expansion_fixture()
    before = network.snapshot()
    value = expand_resolved_bundle_query(
        network,
        LinkValue(network.refs[0]),
        bundle_from_ids(network, {2: network.refs[2]}, (2,)),
    )

    assert value.links == frozenset()
    assert network.snapshot() == before
    assert len(network.refs) == 4


def test_runtime_handle_reissue_does_not_change_bundle_occurrence_provenance() -> None:
    network, mapping = semantic_fixture({10, 20})
    value = bundle_from_ids(network, mapping, (10, 20, 10))
    snapshot = network.snapshot()
    restored = LinkNetwork.from_snapshot(snapshot)
    restored_occurrences = tuple(
        ResolvedOccurrence(item.path, restored.refs[item.link.slot])
        for item in value.occurrences
    )
    restored_value = resolve_flat_bundle(restored, restored_occurrences)

    assert all(restored.refs[item.link.slot] != item.link for item in value.occurrences)
    assert [item.path for item in restored_value.occurrences] == [
        item.path for item in value.occurrences
    ]
    assert sorted(ref.slot for ref in restored_value.links) == sorted(
        ref.slot for ref in value.links
    )


def test_current_root_regression_is_retained_as_data_not_historical_parser_authority() -> None:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))["surfaces"]["valueBundle"]
    regression = contract["elaboration"]["rootRegression"]
    lines = [
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]

    assert len(lines) == 10
    assert regression["currentTenDefinitionsMustElaborateIdentically"] is True
    assert regression["valueBundleMayAppearInCurrentRoot"] is False


def test_gate_and_core_have_no_historical_ast_parser_interpreter_or_anum_memory_dependency() -> None:
    gate_imports = imported_modules(Path(__file__))
    core_source = CORE.read_text(encoding="utf-8")
    trusted_source = "\n".join(
        inspect.getsource(function)
        for function in (
            elaborate_bundle_roles,
            resolve_flat_bundle,
            expand_resolved_bundle_query,
        )
    )

    assert gate_imports.isdisjoint(
        {"core.mtc_ast", "core.mtc_parser", "core.mtc_interpreter", "core.anum_memory"}
    )
    for forbidden in ("mtc_ast", "mtc_parser", "mtc_interpreter", "anum_memory"):
        assert forbidden not in core_source
    assert "ensure(" not in trusted_source
    assert "find_links(" in inspect.getsource(expand_resolved_bundle_query)


def test_migration_does_not_mutate_current_value_bundle_v02_contract() -> None:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    conformance = json.loads(CONFORMANCE.read_text(encoding="utf-8"))

    assert contract["schema"] == "mts-contract/v0.6"
    assert contract["surfaces"]["valueBundle"]["schema"] == "mts-value-bundle/v0.2"
    assert (
        contract["surfaces"]["valueBundle"]["productionIntegration"]["referenceCore"]
        == "core/mtc_value_bundle.py"
    )
    assert conformance["corpora"]["valueBundle"]["contract"] == "mts-value-bundle/v0.2"
