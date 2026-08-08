"""Executable challenge gate for post-foundation BundleForm value semantics.

This suite deliberately does not implement a value bundle. It freezes the
already accepted constraint-bundle behavior and records the current typed
syntax of value-looking forms so a future proposal cannot silently overload it.
"""

import json
from pathlib import Path

import pytest

from core.mtc_ast import BundleForm, Definition, format_expression, structural_key
from core.mtc_interpreter import (
    ContextFrame,
    InterpretationError,
    MemoryView,
    interpret_constraints,
)
from core.mtc_parser import parse_formula


ROOT = Path(__file__).parents[1]
CHALLENGE = ROOT / "contracts" / "mts-bundle-challenge-v0.2.json"
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.2.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


class NoReadMemory(MemoryView):
    """Memory view that proves challenge constraint cases need no L4 access."""

    def poles(self, link: int) -> tuple[int, int]:
        raise AssertionError("bundle challenge case unexpectedly read L4 poles")

    def find_link(self, start: int, end: int) -> int | None:
        raise AssertionError("bundle challenge case unexpectedly searched L4 links")

    def find_start_projection(self, form: int) -> int | None:
        raise AssertionError("bundle challenge case unexpectedly read start projection")

    def find_end_projection(self, form: int) -> int | None:
        raise AssertionError("bundle challenge case unexpectedly read end projection")


def challenge() -> dict:
    return json.loads(CHALLENGE.read_text(encoding="utf-8"))


def json_key(value):
    if isinstance(value, tuple):
        return [json_key(item) for item in value]
    return value


def result_payload(result) -> dict:
    return {
        "success": result.success,
        "substitutions": [
            {"path": list(hole.path), "link": link} for hole, link in result.holes
        ],
        "aliases": [
            {"path": list(hole.path), "targetPath": list(target.path)}
            for hole, target in result.aliases
        ],
    }


def test_challenge_is_not_an_accepted_mts_contract_extension():
    data = challenge()
    mts_contract_text = MTS_CONTRACT.read_text(encoding="utf-8")

    assert data["schema"] == "mts-bundle-challenge/v0.2"
    assert data["status"] == "candidate-challenge"
    assert data["dependsOn"] == "mts-contract/v0.2"
    assert data["acceptedContractLinkAllowed"] is False
    assert "mts-bundle-challenge" not in mts_contract_text


def test_existing_root_constraint_bundles_remain_exactly_in_root_program():
    data = challenge()
    sources = {
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }

    for source in data["acceptedConstraintBundle"]["rootDefinitionsUsingConstraintBundles"]:
        assert source in sources
        ast = parse_formula(source)
        assert isinstance(ast, Definition)
        assert isinstance(ast.value, BundleForm)


def test_current_bundle_parser_shape_matches_challenge_vectors_without_semantic_canonicalization():
    for case in challenge()["syntaxCases"]:
        ast = parse_formula(case["source"])
        assert format_expression(ast) == case["canonical"]
        assert json_key(structural_key(ast)) == case["structuralKey"]


def test_parser_preserves_order_multiplicity_and_anonymous_occurrences_syntactically():
    xy = structural_key(parse_formula("{x,y}"))
    yx = structural_key(parse_formula("{y,x}"))
    xx = structural_key(parse_formula("{x,x}"))
    anonymous = structural_key(parse_formula("{[],[]}"))

    assert xy != yx
    assert xx == ("bundle", (("symbol", "x"), ("symbol", "x")))
    assert anonymous == ("bundle", (("square", None), ("square", None)))

    # These are syntax facts only. They deliberately do not decide semantic
    # commutativity, idempotence, multiplicity, or bundle identity.


def test_accepted_constraint_bundle_vectors_replay_with_shared_occurrence_local_state():
    data = challenge()
    memory = NoReadMemory()

    for case in data["constraintNonRegressionCases"]:
        result = interpret_constraints(
            parse_formula(case["source"]),
            ContextFrame(**case["context"]),
            memory,
            symbols=case["symbols"],
        )
        assert result_payload(result) == case["expected"]


def test_value_looking_bundle_forms_have_no_accepted_interpreter_semantics_yet():
    data = challenge()
    memory = NoReadMemory()

    unsupported = [
        case
        for case in data["syntaxCases"]
        if case["currentInterpreter"] != "accepted-empty-constraint-bundle"
    ]
    for case in unsupported:
        with pytest.raises(InterpretationError):
            interpret_constraints(
                parse_formula(case["source"]),
                ContextFrame(start=1, end=2),
                memory,
                symbols={"a": 1, "b": 2, "x": 1, "y": 2},
            )


def test_all_value_integration_and_algebra_models_remain_unaccepted():
    data = challenge()

    assert len(data["candidateValueBundleIntegrationModels"]) == 4
    assert all(
        model["accepted"] is False
        for model in data["candidateValueBundleIntegrationModels"]
    )
    assert len(data["valueAlgebraModelsAfterCollisionResolution"]) == 4
    assert all(
        model["accepted"] is False
        for model in data["valueAlgebraModelsAfterCollisionResolution"]
    )


def test_bundle_challenge_forbids_implicit_effects():
    veto = challenge()["effectVeto"]

    assert veto == {
        "ordinaryBundleMayRealize": False,
        "ordinaryBundleMayDelete": False,
        "emptyBundleMayDelete": False,
        "descriptionIsCommand": False,
        "interpretEqualsRealize": False,
    }
