"""Consistency gates for the non-normative flat ValueBundle candidate contract."""

import json
from pathlib import Path

from core.mtc_parser import parse_formula


ROOT = Path(__file__).parents[1]
CONTRACT = ROOT / "contracts" / "mts-value-bundle-v0.2.json"
CONFORMANCE = ROOT / "contracts" / "mts-value-bundle-conformance-v0.2.json"
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.2.json"
ELABORATION = ROOT / "contracts" / "mts-bundle-elaboration-challenge-v0.2.json"
ALGEBRA = ROOT / "contracts" / "mts-bundle-algebra-challenge-v0.2.json"
EXPANSION = ROOT / "contracts" / "mts-bundle-expansion-challenge-v0.2.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_candidate_is_versioned_but_not_accepted_or_linked_from_mts_contract():
    contract = load(CONTRACT)
    conformance = load(CONFORMANCE)
    accepted_text = MTS_CONTRACT.read_text(encoding="utf-8")

    assert contract["schema"] == "mts-value-bundle/v0.2"
    assert contract["status"] == "candidate-contract"
    assert contract["accepted"] is False
    assert contract["acceptedContractLinkAllowed"] is False
    assert conformance["schema"] == "mts-value-bundle-conformance/v0.2"
    assert conformance["status"] == "candidate-conformance"
    assert conformance["contract"] == contract["schema"]
    assert conformance["accepted"] is False
    assert "mts-value-bundle" not in accepted_text


def test_candidate_depends_on_all_three_passed_semantic_challenges():
    contract = load(CONTRACT)
    elaboration = load(ELABORATION)
    algebra = load(ALGEBRA)
    expansion = load(EXPANSION)

    assert contract["dependsOn"] == [
        "mts-contract/v0.2",
        "mts-bundle-decision/v0.2",
        elaboration["schema"],
        algebra["schema"],
        expansion["schema"],
    ]
    assert elaboration["status"] == "candidate-challenge"
    assert algebra["status"] == "candidate-challenge"
    assert expansion["status"] == "candidate-challenge"


def test_candidate_is_flat_only_and_does_not_smuggle_nested_semantics():
    contract = load(CONTRACT)
    conformance = load(CONFORMANCE)

    assert contract["scope"]["valueBundle"] == "flat only"
    assert contract["scope"]["nestedValueBundle"] == "rejected/deferred"
    assert conformance["veto"]["nestedValueBundleAccepted"] is False
    assert any(
        case["error"] == "nested-value-bundle-not-supported"
        for case in conformance["staticRejections"]
    )
    assert "nestedValueBundleSemantics" in contract["deferred"]


def test_static_elaboration_vectors_are_supported_by_the_passed_model_b_challenge():
    conformance = load(CONFORMANCE)
    challenge = load(ELABORATION)
    challenge_by_source = {}
    for case in challenge["cases"]:
        challenge_by_source.setdefault(case["source"], []).append(case)

    for case in conformance["elaboration"]:
        parse_formula(case["source"])
        source_cases = challenge_by_source[case["source"]]
        assert any(
            any(role["role"] == case["expectedRole"] for role in source_case.get("roles", []))
            for source_case in source_cases
        )

    mixed = next(item for item in conformance["staticRejections"] if item["id"] == "mixed-role")
    assert any(
        item.get("error") == mixed["error"] for item in challenge_by_source[mixed["source"]]
    )


def test_flat_equality_vectors_match_resolved_identity_algebra_challenge():
    conformance = load(CONFORMANCE)
    challenge = load(ALGEBRA)

    def key(case: dict) -> tuple:
        return (
            case["left"],
            case["right"],
            json.dumps(case["symbols"], sort_keys=True),
            json.dumps(case["leftHoles"], sort_keys=True),
            json.dumps(case["rightHoles"], sort_keys=True),
        )

    challenge_cases = {key(case): case for case in challenge["cases"]}
    for case in conformance["valueEquality"]:
        upstream = challenge_cases[key(case)]
        assert upstream["leftSet"] == case["leftSet"]
        assert upstream["rightSet"] == case["rightSet"]
        assert upstream["equal"] is case["equal"]


def test_cross_kind_comparison_is_tagged_and_has_no_singleton_coercion():
    contract = load(CONTRACT)
    conformance = load(CONFORMANCE)

    model = contract["runtimeValueModel"]
    assert model["scalar"]["kind"] == "link"
    assert model["bundle"]["kind"] == "bundle"
    assert model["crossKindEquality"] is False
    assert model["crossKindInequality"] is True

    for case in conformance["crossKindComparison"]:
        assert case["equal"] is False
        assert case["notEqual"] is True
        assert case["bundleSet"] != case["scalarIdentity"]


def test_expansion_vectors_match_read_only_l4_query_challenge():
    conformance = load(CONFORMANCE)
    challenge = load(EXPANSION)
    challenge_by_source = {case["source"]: case for case in challenge["cases"]}

    assert conformance["expansionMemory"] == {
        "links": challenge["memoryFixture"]["links"],
        "symbols": challenge["memoryFixture"]["symbols"],
    }
    for case in conformance["expansion"]:
        assert challenge_by_source[case["source"]]["expectedLinks"] == case["expectedLinks"]


def test_anonymous_occurrences_remain_independent_until_resolution():
    contract = load(CONTRACT)
    anonymous = contract["elementResolution"]

    assert anonymous["eachOccurrenceResolvedIndependently"] is True
    assert anonymous["deduplicateBeforeResolution"] is False
    assert anonymous["anonymousSquareIdentity"] == "ast-occurrence-path"
    assert anonymous["semanticSetBuiltAfterResolution"] is True

    cases = {case["id"]: case for case in load(CONFORMANCE)["valueEquality"]}
    assert cases["anonymous-different-bindings"]["equal"] is False
    assert cases["anonymous-same-bindings"]["equal"] is True


def test_current_ten_root_definitions_remain_parseable_and_candidate_cannot_enter_root():
    contract = load(CONTRACT)
    sources = [
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]

    assert len(sources) == 10
    for source in sources:
        parse_formula(source)
    regression = contract["elaboration"]["rootRegression"]
    assert regression["currentTenDefinitionsMustElaborateIdentically"] is True
    assert regression["valueBundleMayAppearInCurrentRoot"] is False


def test_effect_veto_preserves_interpret_not_realize_boundary():
    contract = load(CONTRACT)
    conformance = load(CONFORMANCE)

    assert contract["effects"] == {
        "interpretMayReadMemory": True,
        "interpretMayRealize": False,
        "interpretMayDelete": False,
        "bundleLiteralIsCommand": False,
        "expansionIsCommand": False,
    }
    assert conformance["veto"]["interpretMayRealize"] is False
    assert conformance["veto"]["interpretMayDelete"] is False
    assert conformance["veto"]["globalRewrite"] is False


def test_acceptance_gate_requires_reference_core_before_normative_linking():
    gate = load(CONTRACT)["acceptanceGate"]

    assert "single reference elaborator/value evaluator in core" in gate["requires"]
    assert "explicit proof that no current ConstraintBundle behavior changes" in gate["requires"]
    assert "downstream aprover repin and conformance after upstream acceptance" in gate["requires"]
    assert gate["mustVersionIfAccepted"] is True
