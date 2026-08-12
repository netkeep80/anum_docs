import json
from pathlib import Path

from core.validate_root import validate_root_library


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts/mts-contract-v0.5.json"
CONFORMANCE = ROOT / "contracts/mts-conformance-v0.5.json"
ROOT_FIXTURE = ROOT / "tests/mtc_formulas.mtc"


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_v05_is_current_only_manifest_without_historical_umbrella_parent():
    contract = _load(CONTRACT)

    assert contract["schema"] == "mts-contract/v0.5"
    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert "extends" not in contract
    assert "baseContract" not in contract
    assert "versionBoundaries" not in contract
    assert contract["dependsOn"] == [
        "anum-stream-deserialization/v0.3",
        "mts-value-bundle/v0.2",
        "mts-definition-opening/v0.3",
        "mts-derivation-base/v0.3",
        "mts-opening-path/v0.4",
        "mts-proof/v0.4",
        "mts-direct-deixis/v0.5",
    ]
    assert not any(item.startswith("mts-contract/v0.") for item in contract["dependsOn"])
    assert contract["conformanceCorpus"] == "contracts/mts-conformance-v0.5.json"


def test_v05_conformance_requires_only_current_self_contained_surfaces():
    contract = _load(CONTRACT)
    conformance = _load(CONFORMANCE)

    assert conformance["schema"] == "mts-conformance/v0.5"
    assert conformance["status"] == "accepted"
    assert conformance["accepted"] is True
    assert conformance["contract"] == contract["schema"]
    assert "legacyCoreRegressionCorpus" not in conformance
    assert "legacyCoreRegressionNormative" not in conformance

    required = conformance["requiredAcceptedSurfaces"]
    expected_keys = [
        "anum",
        "valueBundle",
        "definitionOpening",
        "derivationBase",
        "openingPath",
        "proof",
        "directDeixis",
    ]
    assert [item["schema"] for item in required] == contract["dependsOn"]
    assert [item["surfaceKey"] for item in required] == expected_keys
    assert [item["conformanceKey"] for item in required] == expected_keys
    assert list(contract["surfaces"]) == expected_keys
    assert list(conformance["corpora"]) == expected_keys

    for item in required:
        leaf = contract["surfaces"][item["surfaceKey"]]
        corpus = conformance["corpora"][item["conformanceKey"]]
        assert leaf["schema"] == item["schema"]
        assert leaf["status"] == "accepted"
        assert leaf["accepted"] is True
        assert leaf["conformanceKey"] == item["conformanceKey"]
        assert corpus["schema"]
        if item["surfaceKey"] == "anum":
            assert corpus["schema"] == "anum-stream-deserialization-conformance/v0.3"
            assert corpus["valid"]
            assert corpus["invalid"]
        else:
            assert corpus["status"] == "accepted"
            assert corpus["accepted"] is True
            assert corpus["contract"] == item["schema"]


def test_v05_semantic_identity_and_anum_are_post_reset_current_semantics():
    contract = _load(CONTRACT)
    identity = contract["semanticIdentity"]
    anum = contract["anum"]

    assert identity["linkIdentity"] == "by ordered semantic poles"
    assert identity["runtimeHandleIsSemanticIdentity"] is False
    assert identity["sourcePositionIsSemanticIdentity"] is False
    assert identity["samePairCreatesSecondSemanticLink"] is False
    assert identity["root"] == "R = R ⟼ R"
    assert identity["secondFullySelfClosedRootAllowed"] is False

    assert anum["schema"] == "anum-stream-deserialization/v0.3"
    assert anum["alphabet"] == ["[", "]", "1", "0"]
    assert anum["rootIsFifthAbit"] is False
    assert anum["emptyStream"] == "R"
    assert anum["emptyGroup"] == "R"
    assert anum["linkIdentityByOrderedPoles"] is True
    assert anum["denotationEffect"] == "none"
    assert anum["materializationAcceptedByThisOperation"] is False
    assert anum["existingAsetCarrierSemanticsAccepted"] is False

    serialized = json.dumps(contract, ensure_ascii=False)
    assert "anum-raw-carrier-v0.2" not in serialized
    assert "anum-boundary-projection-v0.2" not in serialized
    assert "anum-denotation-v0.2" not in serialized
    assert "anum-recursive-denotation-v0.2" not in serialized


def test_v05_keeps_l2_anonymous_form_distinct_from_l3_empty_group():
    notation = _load(CONTRACT)["formalNotation"]

    assert notation["anonymousForm"] == {
        "source": "[]",
        "level": "L2",
        "identity": "local syntactic occurrence within one interpretation",
        "sameAsL3EmptyAnumGroup": False,
    }
    assert notation["context"]["roles"] == [
        {"source": "◁", "role": "start"},
        {"source": "▷", "role": "end"},
    ]
    assert notation["context"]["bracketOverloading"] is False
    assert notation["operations"]["interpretMayMaterialize"] is False
    assert notation["patternMatching"]["materializes"] is False


def test_v05_memory_preserves_read_vs_effect_boundary():
    memory = _load(CONTRACT)["memory"]

    assert memory["readOperations"] == [
        "poles",
        "find_link",
        "find_start_projection",
        "find_end_projection",
        "outgoing",
        "incoming",
        "all_links",
        "has_link",
    ]
    assert memory["effectOperations"] == ["intern_link", "delete_link"]
    assert memory["findEqualsMaterialize"] is False
    assert memory["notFoundImpliesNonExistence"] is False
    assert memory["readOperationsMayMaterialize"] is False
    assert memory["importedAsetCarrierAdmissibilityDefined"] is False


def test_v05_publishes_exact_six_relation_proof_surface_without_generic_composition():
    l5 = _load(CONTRACT)["l5"]

    assert l5["proofSchema"] == "mts-proof/v0.4"
    assert l5["proofContractVersionTransportTag"] == "mts-contract/v0.4"
    assert l5["transportTagIsSemanticUmbrellaDependency"] is False
    assert l5["trustedRelations"] == [
        "ContextuallySatisfies",
        "Opens",
        "NoVisibleDefinition",
        "DefinitionConflict",
        "NonAddressableDefinitionTarget",
        "DefinitionOpeningPath",
    ]
    assert l5["definitionOpeningPathClassification"] == "operational-composite-certificate"
    assert l5["searchTrusted"] is False
    assert l5["checkerTrusted"] is True
    assert l5["genericCompositionAccepted"] is False
    assert l5["judgmentOrderImpliesDependency"] is False
    assert l5["openingPathImpliesEquality"] is False
    assert l5["openingPathFeedsContextuallySatisfiesImplicitly"] is False
    assert l5["transitivityAccepted"] is False
    assert l5["proofDagDependencyAccepted"] is False


def test_v05_keeps_direct_deixis_structural_only():
    analysis = _load(CONTRACT)["contextAnalysis"]

    assert analysis["operation"] == "analyze_direct_deixis"
    assert analysis["positiveImpliesContextSensitive"] is False
    assert analysis["emptyImpliesContextInvariant"] is False
    assert analysis["opensDefinitions"] is False
    assert analysis["readsMemory"] is False
    assert analysis["readsContextFrame"] is False
    assert analysis["readsInterpreterIdentity"] is False
    assert analysis["trustedProofRelationAdded"] is False


def test_v05_models_interpreter_as_link_without_hidden_identity():
    boundary = _load(CONTRACT)["interpreterBoundary"]

    assert boundary["interpreterIsALink"] is True
    assert boundary["separateSubjectOntologyRequired"] is False
    assert boundary["acceptedEvaluationContext"] == "explicit ContextFrame(start,end,parent?)"
    assert boundary["interpreterLinkIdentityIsHiddenEvalInput"] is False
    assert boundary["currentFocusBindingSemanticsAccepted"] is False
    assert boundary["currentFocusLinkRefObservable"] is False
    assert boundary["contextMayBeVirtual"] is True
    assert boundary["securityPolicyChangesPronounMeaning"] is False


def test_v05_production_core_paths_exist_and_root_program_is_exact():
    contract = _load(CONTRACT)
    conformance = _load(CONFORMANCE)
    core = contract["productionCore"]

    for relative in core["requiredModules"]:
        assert (ROOT / relative).is_file(), relative
    assert conformance["productionCoreGates"] == core["requiredExecutableGates"]
    for relative in core["requiredExecutableGates"]:
        assert (ROOT / relative).is_file(), relative

    root = contract["rootProgram"]
    assert root["path"] == "tests/mtc_formulas.mtc"
    assert root["definitionCount"] == 10
    result = validate_root_library(ROOT_FIXTURE)
    assert result.is_valid, result.messages
    formulas = [
        line
        for line in ROOT_FIXTURE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    assert len(formulas) == 10
