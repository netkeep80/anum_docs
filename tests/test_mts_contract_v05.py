import json
from pathlib import Path

from core.validate_root import validate_root_library


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts/mts-contract-v0.5.json"
CONFORMANCE = ROOT / "contracts/mts-conformance-v0.5.json"
ROOT_FIXTURE = ROOT / "tests/mtc_formulas.mtc"


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_v05_release_composes_only_accepted_surfaces():
    contract = _load(CONTRACT)
    conformance = _load(CONFORMANCE)

    assert contract["schema"] == "mts-contract/v0.5"
    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert contract["extends"] == "mts-contract/v0.4"
    assert contract["baseContract"] == "contracts/mts-contract-v0.4.json"
    assert contract["conformanceCorpus"] == "contracts/mts-conformance-v0.5.json"
    assert contract["dependsOn"] == [
        "mts-contract/v0.4",
        "mts-opening-path/v0.4",
        "mts-proof/v0.4",
        "mts-direct-deixis/v0.5",
    ]

    required = {item["role"]: item for item in conformance["requiredCorpora"]}
    assert set(required) == {
        "base-v0.4",
        "opening-path-v0.4",
        "proof-v0.4",
        "direct-deixis-v0.5",
    }
    assert required["base-v0.4"]["schema"] == "mts-conformance/v0.4"
    assert required["opening-path-v0.4"]["schema"] == "mts-opening-path-conformance/v0.4"
    assert required["proof-v0.4"]["schema"] == "mts-proof-conformance/v0.4"
    assert required["direct-deixis-v0.5"]["schema"] == "mts-direct-deixis-conformance/v0.5"


def test_v05_publishes_exact_proof_surface_without_generic_composition():
    contract = _load(CONTRACT)
    l5 = contract["l5"]

    assert l5["proofSchema"] == "mts-proof/v0.4"
    assert l5["contractVersion"] == "mts-contract/v0.4"
    assert l5["trustedRelations"] == [
        "ContextuallySatisfies",
        "Opens",
        "NoVisibleDefinition",
        "DefinitionConflict",
        "NonAddressableDefinitionTarget",
        "DefinitionOpeningPath",
    ]
    assert l5["definitionOpeningPathClassification"] == "operational-composite-certificate"
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


def test_v05_downstream_boundary_allows_search_but_not_new_rules():
    downstream = _load(CONTRACT)["downstream"]

    assert downstream["aproverProofRepinAllowed"] is True
    assert downstream["requiredProofSchema"] == "mts-proof/v0.4"
    assert downstream["consumerMaySearchDefinitionOpeningPaths"] is True
    assert downstream["consumerSearchTrusted"] is False
    assert downstream["consumerMayInventAdditionalCompositionRules"] is False
    assert downstream["consumerMayInferContextSensitivityFromDirectDeixis"] is False
    assert downstream["consumerMayUseHiddenInterpreterIdentity"] is False


def test_v05_preserves_root_program():
    contract = _load(CONTRACT)
    result = validate_root_library(ROOT_FIXTURE)

    assert contract["rootProgram"] == "tests/mtc_formulas.mtc"
    assert contract["rootDefinitionCount"] == 10
    assert result.is_valid, result.messages
    formulas = [
        line
        for line in ROOT_FIXTURE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    assert len(formulas) == 10
