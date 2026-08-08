"""Executable, non-production challenge for flat ValueBundle algebra.

The resolver in this test is deliberately local to the challenge. It preserves
source occurrences, resolves each element independently, and only then derives
an extensional set of resolved L1 identities. No production AST/interpreter or
memory semantics are changed here.
"""

import json
from pathlib import Path

import pytest

from core.mtc_ast import BundleForm, SquareForm, Symbol, structural_key
from core.mtc_parser import parse_formula


ROOT = Path(__file__).parents[1]
CORPUS = ROOT / "contracts" / "mts-bundle-algebra-challenge-v0.2.json"
DECISION = ROOT / "contracts" / "mts-bundle-decision-v0.2.json"
ELABORATION = ROOT / "contracts" / "mts-bundle-elaboration-challenge-v0.2.json"
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.2.json"


class ResolutionError(ValueError):
    pass


def corpus() -> dict:
    return json.loads(CORPUS.read_text(encoding="utf-8"))


def _resolve_flat_bundle(
    source: str,
    symbols: dict[str, int],
    holes: dict[str, int],
) -> tuple[list[int], list[int]]:
    """Resolve each flat bundle occurrence independently.

    Hole bindings are keyed by the item occurrence path relative to the bundle,
    e.g. ``"0"`` and ``"1"``. Duplicate source spelling is never used as
    identity and never causes pre-resolution deduplication.
    """

    ast = parse_formula(source)
    if not isinstance(ast, BundleForm):
        raise ResolutionError("Challenge source must parse as a top-level BundleForm")

    occurrences: list[int] = []
    for index, item in enumerate(ast.items):
        if isinstance(item, Symbol):
            if item.name not in symbols:
                raise ResolutionError(f"Unbound symbol: {item.name}")
            occurrences.append(symbols[item.name])
            continue

        if isinstance(item, SquareForm) and item.content is None:
            key = str(index)
            if key not in holes:
                raise ResolutionError(f"Unbound anonymous occurrence: {key}")
            occurrences.append(holes[key])
            continue

        raise ResolutionError(
            "Flat algebra challenge supports only symbols and empty [] occurrences"
        )

    return occurrences, sorted(set(occurrences))


def _compare_case(case: dict) -> tuple[list[int], list[int], list[int], list[int], bool]:
    left_occurrences, left_set = _resolve_flat_bundle(
        case["left"], case["symbols"], case["leftHoles"]
    )
    right_occurrences, right_set = _resolve_flat_bundle(
        case["right"], case["symbols"], case["rightHoles"]
    )
    return left_occurrences, right_occurrences, left_set, right_set, left_set == right_set


def test_challenge_remains_non_normative_and_follows_elaboration_gate():
    data = corpus()
    decision = json.loads(DECISION.read_text(encoding="utf-8"))
    elaboration = json.loads(ELABORATION.read_text(encoding="utf-8"))
    mts_contract_text = MTS_CONTRACT.read_text(encoding="utf-8")

    assert data["schema"] == "mts-bundle-algebra-challenge/v0.2"
    assert data["status"] == "candidate-challenge"
    assert data["acceptedContractLinkAllowed"] is False
    assert data["productionSemanticsChanged"] is False
    assert data["dependsOn"] == [
        "mts-contract/v0.2",
        decision["schema"],
        elaboration["schema"],
    ]
    assert "mts-bundle-algebra-challenge" not in mts_contract_text


def test_model_verdicts_select_resolved_identity_extensional_only_as_candidate():
    models = {model["id"]: model for model in corpus()["models"]}

    assert models["syntax-extensional"]["verdict"] == "reject"
    assert models["occurrence-identity-set"]["verdict"] == "reject-as-value-algebra"
    assert models["resolved-identity-extensional"]["verdict"] == "preferred-candidate"
    assert models["resolved-identity-extensional"]["accepted"] is False
    assert models["multibundle"]["verdict"] == "defer"


def test_every_flat_case_preserves_occurrences_then_compares_unique_resolved_sets():
    for case in corpus()["cases"]:
        (
            left_occurrences,
            right_occurrences,
            left_set,
            right_set,
            equal,
        ) = _compare_case(case)

        assert left_occurrences == case["leftOccurrences"], case["id"]
        assert right_occurrences == case["rightOccurrences"], case["id"]
        assert left_set == case["leftSet"], case["id"]
        assert right_set == case["rightSet"], case["id"]
        assert equal is case["equal"], case["id"]


def test_source_order_and_multiplicity_remain_observable_before_semantic_set_projection():
    ab = structural_key(parse_formula("{a, b}"))
    ba = structural_key(parse_formula("{b, a}"))
    aa = structural_key(parse_formula("{a, a}"))
    single = structural_key(parse_formula("{a}"))

    assert ab != ba
    assert aa != single

    occurrences, resolved_set = _resolve_flat_bundle(
        "{a, a}", {"a": 10}, {}
    )
    assert occurrences == [10, 10]
    assert resolved_set == [10]


def test_anonymous_occurrences_are_never_deduplicated_by_glyph_before_resolution():
    ast = parse_formula("{[], []}")
    assert isinstance(ast, BundleForm)
    assert len(ast.items) == 2
    assert all(isinstance(item, SquareForm) for item in ast.items)
    assert ast.items[0] is not ast.items[1]

    different_occurrences, different_set = _resolve_flat_bundle(
        "{[], []}", {}, {"0": 10, "1": 20}
    )
    same_occurrences, same_set = _resolve_flat_bundle(
        "{[], []}", {}, {"0": 10, "1": 10}
    )

    assert different_occurrences == [10, 20]
    assert different_set == [10, 20]
    assert same_occurrences == [10, 10]
    assert same_set == [10]


def test_historical_anonymous_idempotence_is_conditional_not_a_source_axiom():
    claim = corpus()["historicalAnonymousIdempotence"]
    assert claim["sourceClaim"] == "{[], []} = {[]}"
    assert claim["unconditionalVerdict"] == "reject-under-v0.2"

    conditional = claim["conditionalExample"]
    left_occurrences, left_set = _resolve_flat_bundle(
        "{[], []}", {}, conditional["leftBindings"]
    )
    right_occurrences, right_set = _resolve_flat_bundle(
        "{[]}", {}, conditional["rightBindings"]
    )
    assert left_occurrences == [10, 10]
    assert right_occurrences == [10]
    assert (left_set == right_set) is conditional["equal"]

    counterexample = claim["counterexample"]
    _, left_set = _resolve_flat_bundle(
        "{[], []}", {}, counterexample["leftBindings"]
    )
    _, right_set = _resolve_flat_bundle(
        "{[]}", {}, counterexample["rightBindings"]
    )
    assert (left_set == right_set) is counterexample["equal"]


def test_symbol_and_anonymous_occurrence_can_alias_only_after_independent_resolution():
    case = next(
        item
        for item in corpus()["cases"]
        if item["id"] == "symbol-and-hole-can-alias-after-resolution"
    )
    left_occurrences, right_occurrences, left_set, right_set, equal = _compare_case(case)

    assert left_occurrences == [10, 10]
    assert right_occurrences == [10]
    assert left_set == right_set == [10]
    assert equal is True


def test_empty_value_bundle_is_empty_set_only_after_value_role_is_statically_known():
    empty = next(item for item in corpus()["cases"] if item["id"] == "empty-bundle-is-empty-set")
    nonempty = next(
        item for item in corpus()["cases"] if item["id"] == "empty-vs-nonempty-not-equal"
    )

    assert empty["expectedRole"] == "ValueBundle"
    assert nonempty["expectedRole"] == "ValueBundle"
    assert _compare_case(empty)[-1] is True
    assert _compare_case(nonempty)[-1] is False


def test_nested_and_expansion_semantics_remain_explicitly_deferred():
    deferred = corpus()["deferred"]

    assert deferred["nestedValueBundle"]["status"] == "unresolved"
    assert deferred["expansion"]["status"] == "separate-challenge-required"
    assert deferred["expansion"]["examples"] == [
        "a{}",
        "{}b",
        "{}{}",
        "{a,b}{c,d}",
    ]
    assert deferred["materialization"]["status"] == "out-of-scope"


def test_effect_veto_keeps_current_production_runtime_unchanged():
    veto = corpus()["effectVeto"]

    assert veto == {
        "readsMemoryForIdentityResolution": "allowed-only-in-future-read-only-resolution-context",
        "realizes": False,
        "deletes": False,
        "changesCurrentInterpreter": False,
        "changesCurrentAst": False,
        "changesCurrentParser": False,
    }


def test_challenge_resolver_rejects_unbound_or_nonflat_items():
    with pytest.raises(ResolutionError, match="Unbound symbol"):
        _resolve_flat_bundle("{a}", {}, {})
    with pytest.raises(ResolutionError, match="Unbound anonymous occurrence"):
        _resolve_flat_bundle("{[]}", {}, {})
    with pytest.raises(ResolutionError, match="only symbols and empty"):
        _resolve_flat_bundle("{a ⟼ b}", {"a": 1, "b": 2}, {})
