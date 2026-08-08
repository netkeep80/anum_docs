"""Machine-check the non-normative bundle integration decision.

The decision chooses the next challenge model but must not extend accepted MTS
semantics. Production AST/interpreter changes are deliberately out of scope.
"""

import json
from pathlib import Path

from core.mtc_ast import BundleForm, Form


ROOT = Path(__file__).parents[1]
DECISION = ROOT / "contracts" / "mts-bundle-decision-v0.2.json"
CHALLENGE = ROOT / "contracts" / "mts-bundle-challenge-v0.2.json"
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.2.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def decision() -> dict:
    return json.loads(DECISION.read_text(encoding="utf-8"))


def test_decision_remains_non_normative_and_depends_on_executable_challenge():
    data = decision()
    challenge = json.loads(CHALLENGE.read_text(encoding="utf-8"))
    mts_contract_text = MTS_CONTRACT.read_text(encoding="utf-8")

    assert data["schema"] == "mts-bundle-decision/v0.2"
    assert data["status"] == "candidate-decision"
    assert data["dependsOn"] == ["mts-contract/v0.2", challenge["schema"]]
    assert data["acceptedContractLinkAllowed"] is False
    assert "mts-bundle-decision" not in mts_contract_text


def test_decision_preserves_the_exact_current_root_program():
    data = decision()
    root_sources = [
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]

    assert data["preservedAcceptedFacts"]["rootDefinitionsUnchanged"] == root_sources


def test_model_verdicts_are_explicit_and_only_b_is_the_preferred_next_challenge():
    models = {model["id"]: model for model in decision()["models"]}

    assert set(models) == {"A", "B", "C", "D"}
    assert models["A"]["verdict"] == "reject"
    assert models["B"]["verdict"] == "preferred-candidate"
    assert models["C"]["verdict"] == "defer-fallback"
    assert models["D"]["verdict"] == "reject-for-issue-50"
    assert all(model["accepted"] is False for model in models.values())


def test_preferred_model_is_static_elaboration_not_runtime_guessing():
    model = next(model for model in decision()["models"] if model["id"] == "B")
    stage = model["elaborationStage"]

    assert model["syntaxStage"]["node"] == "CurlySyntax"
    assert model["syntaxStage"]["semanticType"] is False
    assert stage["outputs"] == ["ConstraintBundle", "ValueBundle"]
    assert stage["runtimeGuessing"] is False

    by_when = {rule["when"]: rule["result"] for rule in stage["rules"]}
    assert by_when["all non-empty items elaborate as Judgment"] == "ConstraintBundle"
    assert by_when["all non-empty items elaborate as Form"] == "ValueBundle"
    assert by_when["items mix Judgment and Form roles"] == "static-error"
    assert by_when["{} occurs where parent syntax requires Form"] == "ValueBundle"
    assert by_when["{} occurs at the constraint interpretation entry point"] == "ConstraintBundle"
    assert by_when["{} is a definition RHS with no stronger expected Form role"] == "ConstraintBundle"


def test_decision_records_current_typed_ast_mismatch_without_fixing_it_here():
    data = decision()

    # This is the exact current fact exposed by the challenge: syntactically the
    # node is a Form even though accepted runtime meaning is constraint-only.
    assert issubclass(BundleForm, Form)
    assert data["currentTypedAstDefect"]["fact"].startswith("BundleForm currently inherits Form")
    assert data["currentTypedAstDefect"]["decision"].startswith("Do not fix this by adding value runtime behavior")


def test_effect_veto_and_occurrence_identity_survive_the_decision():
    preserved = decision()["preservedAcceptedFacts"]

    assert preserved["anonymousSquareForm"] == {
        "source": "[]",
        "identity": "ast-occurrence-path",
        "globalIdentity": False,
    }
    assert preserved["effects"] == {
        "interpretMayRealize": False,
        "interpretMayDelete": False,
        "bundleDescriptionIsCommand": False,
    }


def test_value_algebra_stays_unaccepted_until_elaboration_is_proven():
    algebra = decision()["algebra"]

    assert algebra["accepted"] is False
    assert algebra["leadingIntent"] == "extensional-set-like"
    assert algebra["decisionAfter"] == "model-B-elaboration-challenge"
    assert "occurrence" in algebra["veto"].lower()


def test_next_gate_is_an_executable_non_production_elaboration_challenge():
    gate = decision()["nextGate"]

    assert gate["artifact"] == "mts-bundle-elaboration-challenge/v0.2"
    assert gate["status"] == "candidate-challenge"
    assert gate["mustNotChangeProductionSemantics"] is True
    assert {
        "empty constraint bundle",
        "empty value bundle in Form-required position",
        "mixed-role static rejection",
        "occurrence-local [] inside both bundle roles",
        "no realize/delete effects",
    }.issubset(set(gate["requiredVectors"]))
