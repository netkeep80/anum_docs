"""Executable, non-production challenge for bundle expansion/query semantics.

The evaluator is deliberately test-local. It uses only the existing read-only
L4 indexes and never calls ``intern_link`` or ``realize_denotation``.
"""

import json
from pathlib import Path

import pytest

from core.anum_memory import AnumMemory
from core.mtc_ast import BundleForm, Sequence, Symbol, format_expression
from core.mtc_parser import parse_formula


ROOT = Path(__file__).parents[1]
CORPUS = ROOT / "contracts" / "mts-bundle-expansion-challenge-v0.2.json"
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.2.json"
ALGEBRA = ROOT / "contracts" / "mts-bundle-algebra-challenge-v0.2.json"


class ExpansionError(ValueError):
    pass


def corpus() -> dict:
    return json.loads(CORPUS.read_text(encoding="utf-8"))


def memory_and_symbols() -> tuple[AnumMemory, dict[str, int]]:
    fixture = corpus()["memoryFixture"]
    initial = {int(ref): tuple(pair) for ref, pair in fixture["links"].items()}
    return AnumMemory(initial_links=initial), fixture["symbols"]


def _domain(expression, symbols: dict[str, int]) -> set[int] | None:
    """Return endpoint identities; None means expansion-position wildcard."""

    if isinstance(expression, Symbol):
        if expression.name not in symbols:
            raise ExpansionError(f"Unbound symbol: {expression.name}")
        return {symbols[expression.name]}

    if isinstance(expression, BundleForm):
        if not expression.items:
            return None
        result: set[int] = set()
        for item in expression.items:
            if not isinstance(item, Symbol):
                raise ExpansionError("Expansion challenge supports flat symbol bundles only")
            if item.name not in symbols:
                raise ExpansionError(f"Unbound symbol: {item.name}")
            result.add(symbols[item.name])
        return result

    raise ExpansionError("Expansion endpoint must be a Form identity or ValueBundle")


def _query(source: str, memory: AnumMemory, symbols: dict[str, int]) -> list[int]:
    ast = parse_formula(source)
    if not isinstance(ast, Sequence) or len(ast.items) != 2:
        raise ExpansionError("Expansion source must parse as a two-endpoint Sequence")

    left_expr, right_expr = ast.items
    if not isinstance(left_expr, BundleForm) and not isinstance(right_expr, BundleForm):
        raise ExpansionError("Expansion requires at least one ValueBundle operand")

    left = _domain(left_expr, symbols)
    right = _domain(right_expr, symbols)

    if left is None and right is None:
        return sorted(ref for ref, _record in memory.snapshot().links)

    if left is None:
        assert right is not None
        return sorted({ref for end in right for ref in memory.incoming(end)})

    if right is None:
        return sorted({ref for start in left for ref in memory.outgoing(start)})

    found: set[int] = set()
    for start in left:
        for end in right:
            ref = memory.find_link(start, end)
            if ref is not None:
                found.add(ref)
    return sorted(found)


def test_challenge_is_non_normative_and_follows_flat_algebra_gate():
    data = corpus()
    algebra = json.loads(ALGEBRA.read_text(encoding="utf-8"))
    mts_contract_text = MTS_CONTRACT.read_text(encoding="utf-8")

    assert data["schema"] == "mts-bundle-expansion-challenge/v0.2"
    assert data["status"] == "candidate-challenge"
    assert data["acceptedContractLinkAllowed"] is False
    assert data["productionSemanticsChanged"] is False
    assert algebra["deferred"]["expansion"]["status"] == "separate-challenge-required"
    assert "mts-bundle-expansion-challenge" not in mts_contract_text


def test_model_verdicts_reject_materialization_and_select_read_only_wildcard_candidate():
    models = {model["id"]: model for model in corpus()["models"]}

    assert models["pure-cartesian-empty-set"]["verdict"] == "reject-for-issue-50"
    assert models["read-only-empty-endpoint-wildcard"]["verdict"] == "preferred-candidate"
    assert models["read-only-empty-endpoint-wildcard"]["accepted"] is False
    assert models["materializing-cartesian-product"]["verdict"] == "reject"
    assert models["synthetic-unmaterialized-linkforms"]["verdict"] == "defer"


def test_every_query_vector_uses_existing_links_only_and_matches_expected_result():
    memory, symbols = memory_and_symbols()
    before = memory.snapshot()

    for case in corpus()["cases"]:
        ast = parse_formula(case["source"])
        assert format_expression(ast) == case["source"], case["id"]
        assert _query(case["source"], memory, symbols) == case["expectedLinks"], case["id"]
        assert memory.snapshot() == before, case["id"]


def test_nonempty_bundle_expansion_is_cartesian_filter_over_existing_exact_pairs():
    memory, symbols = memory_and_symbols()

    assert _query("a{c, d}", memory, symbols) == [0, 1]
    assert _query("{a, b}d", memory, symbols) == [1, 3]
    assert _query("{a, b}{c, d}", memory, symbols) == [0, 1, 2, 3]
    assert _query("{a}{d}", memory, symbols) == [1]


def test_empty_bundle_is_wildcard_only_under_statically_known_expansion_parent():
    memory, symbols = memory_and_symbols()

    assert _query("a{}", memory, symbols) == list(memory.outgoing(symbols["a"]))
    assert _query("{}d", memory, symbols) == list(memory.incoming(symbols["d"]))
    assert _query("{}{}", memory, symbols) == [0, 1, 2, 3]

    preferred = corpus()["preferredCandidate"]
    assert preferred["endpointDomains"]["emptyValueBundleInExpansionPosition"] == (
        "wildcard / unconstrained endpoint"
    )
    assert "parent operation is statically known" in preferred["emptyBundleContextualNote"]


def test_missing_exact_pair_is_omitted_without_realization():
    memory, symbols = memory_and_symbols()
    before = memory.snapshot()
    before_count = memory.link_count

    # e is an existing LinkRef, so (a,e) is a valid query pair; it is simply absent.
    assert symbols["e"] == 2
    assert memory.find_link(symbols["a"], symbols["e"]) is None
    assert _query("a{e}", memory, symbols) == []
    assert memory.link_count == before_count
    assert memory.snapshot() == before


def test_wildcard_query_with_no_matching_links_returns_empty_set_without_side_effects():
    memory, symbols = memory_and_symbols()
    before = memory.snapshot()

    assert memory.outgoing(symbols["e"]) == ()
    assert _query("e{}", memory, symbols) == []
    assert memory.snapshot() == before


def test_plain_form_juxtaposition_is_outside_expansion_challenge():
    memory, symbols = memory_and_symbols()

    with pytest.raises(ExpansionError, match="requires at least one ValueBundle"):
        _query("a d", memory, symbols)


def test_nested_value_bundles_are_not_silently_flattened_by_query_challenge():
    memory, symbols = memory_and_symbols()

    with pytest.raises(ExpansionError, match="flat symbol bundles only"):
        _query("a{{c, d}}", memory, symbols)
    assert corpus()["vetoes"]["nestedValueBundle"] == "out-of-scope"


def test_effect_veto_matches_read_only_l4_query_boundary():
    vetoes = corpus()["vetoes"]

    assert vetoes["readsOnlyExistingL4Links"] is True
    assert vetoes["missingPairsAreNeverCreated"] is True
    assert vetoes["realize"] is False
    assert vetoes["delete"] is False
    assert vetoes["cascade"] is False
    assert vetoes["globalRewrite"] is False
    assert vetoes["memorySnapshotUnchanged"] is True
