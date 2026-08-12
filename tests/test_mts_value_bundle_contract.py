"""Проверки самодостаточного принятого контракта плоских пучков значений."""

import json
from pathlib import Path

from core.mtc_parser import parse_formula


ROOT = Path(__file__).parents[1]
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.5.json"
MTS_CONFORMANCE = ROOT / "contracts" / "mts-conformance-v0.5.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _contract() -> dict:
    return load(MTS_CONTRACT)["surfaces"]["valueBundle"]


def _conformance() -> dict:
    return load(MTS_CONFORMANCE)["corpora"]["valueBundle"]


def test_value_bundle_contract_is_accepted_self_contained_and_conformant():
    contract = _contract()
    conformance = _conformance()

    assert contract["schema"] == "mts-value-bundle/v0.2"
    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert "dependsOn" not in contract
    assert "historical MTS umbrella" in contract["foundation"]
    assert conformance["schema"] == "mts-value-bundle-conformance/v0.2"
    assert conformance["status"] == "accepted"
    assert conformance["accepted"] is True
    assert conformance["contract"] == contract["schema"]


def test_accepted_conformance_is_self_contained_across_all_semantic_sections():
    conformance = _conformance()
    assert conformance["elaboration"]
    assert conformance["staticRejections"]
    assert conformance["valueEquality"]
    assert conformance["crossKindComparison"]
    assert conformance["expansionMemory"]
    assert conformance["expansion"]
    assert conformance["veto"]


def test_accepted_scope_is_flat_only_and_does_not_smuggle_nested_semantics():
    contract = _contract()
    conformance = _conformance()

    assert contract["scope"]["valueBundle"] == "flat only"
    assert contract["scope"]["nestedValueBundle"] == "rejected/deferred"
    assert conformance["veto"]["nestedValueBundleAccepted"] is False
    assert any(
        case["error"] == "nested-value-bundle-not-supported"
        for case in conformance["staticRejections"]
    )
    assert "nestedValueBundleSemantics" in contract["deferred"]


def test_flat_value_model_is_extensional_only_after_occurrence_resolution():
    contract = _contract()
    model = contract["runtimeValueModel"]
    resolution = contract["elementResolution"]

    assert model["scalar"]["kind"] == "link"
    assert "canonical semantic Link" in model["scalar"]["identity"]
    assert model["bundle"]["kind"] == "bundle"
    assert model["crossKindEquality"] is False
    assert model["crossKindInequality"] is True
    assert resolution["eachOccurrenceResolvedIndependently"] is True
    assert resolution["deduplicateBeforeResolution"] is False
    assert "syntactic-hole identity" in resolution["anonymousSquareIdentity"]
    assert resolution["semanticSetBuiltAfterResolution"] is True

    cases = {case["id"]: case for case in _conformance()["valueEquality"]}
    assert cases["anonymous-different-bindings"]["equal"] is False
    assert cases["anonymous-same-bindings"]["equal"] is True


def test_conformance_preserves_cross_kind_and_read_only_expansion_boundaries():
    contract = _contract()
    conformance = _conformance()

    for case in conformance["crossKindComparison"]:
        assert case["equal"] is False
        assert case["notEqual"] is True
        assert case["bundleSet"] != case["scalarIdentity"]

    assert contract["expansionQuery"]["readOnly"] is True
    assert contract["expansionQuery"]["implicitRealize"] is False
    assert contract["expansionQuery"]["implicitDelete"] is False
    assert conformance["veto"]["interpretMayRealize"] is False
    assert conformance["veto"]["interpretMayDelete"] is False
    assert conformance["veto"]["globalRewrite"] is False


def test_current_ten_root_definitions_remain_parseable_and_value_bundle_cannot_enter_root():
    contract = _contract()
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


def test_production_integration_and_downstream_boundary_are_current_only():
    contract = _contract()
    integration = contract["productionIntegration"]
    downstream = contract["downstream"]

    assert integration == {
        "referenceCore": "core/mtc_value_bundle.py",
        "conformanceCorpus": "mts-conformance/v0.5#corpora.valueBundle",
        "rootRegression": "tests/mtc_formulas.mtc",
        "constraintBundleRegression": "tests/test_mtc_value_bundle_reference.py",
    }
    assert "aproverRepinRequired" not in downstream
    assert downstream["consumerMustExecuteConformance"] is True
    assert downstream["compatibilityImplementationAllowed"] is False
