from __future__ import annotations

import ast
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts/mts-contract-v0.6.json"
CONFORMANCE = ROOT / "contracts/mts-conformance-v0.6.json"
ROOT_FIXTURE = ROOT / "tests/mtc_formulas.mtc"

EXPECTED_SURFACES = [
    "anum",
    "valueBundle",
    "definitionOpening",
    "derivationBase",
    "openingPath",
    "proof",
    "directDeixis",
]
EXPECTED_DEPENDENCIES = [
    "anum-deserialization/v0.4",
    "mts-value-bundle/v0.2",
    "mts-definition-opening/v0.3",
    "mts-derivation-base/v0.3",
    "mts-opening-path/v0.4",
    "mts-proof/v0.4",
    "mts-direct-deixis/v0.5",
]
EXPECTED_ROOT_FORMULAS = [
    "∞ : {◁ = ∞, ▷ = ∞}",
    "() : ♀() ⟼ ()♂",
    "([) : (♀∞)",
    "(]) : (∞♂)",
    "(⟼) : (♀∞ ⟼ ∞♂)",
    "(↛) : (∞♂ ⟼ ♀∞)",
    "[1] : (⟼)",
    "[0] : (↛)",
    "(=) : {♀◁ = ♀▷, ◁♂ = ▷♂}",
    "(!=) : ¬(=)",
]


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def root_formulas() -> list[str]:
    return [
        line.strip()
        for line in ROOT_FIXTURE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def test_v06_is_immutable_accepted_previous_release_data() -> None:
    contract = load(CONTRACT)
    conformance = load(CONFORMANCE)

    assert contract["schema"] == "mts-contract/v0.6"
    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert conformance["schema"] == "mts-conformance/v0.6"
    assert conformance["status"] == "accepted"
    assert conformance["accepted"] is True
    assert conformance["contract"] == contract["schema"]

    assert "extends" not in contract
    assert "baseContract" not in contract
    assert "versionBoundaries" not in contract
    assert "legacyCoreRegressionCorpus" not in conformance
    assert "legacyCoreRegressionNormative" not in conformance


def test_v06_embeds_exactly_seven_self_contained_surface_boundaries() -> None:
    contract = load(CONTRACT)
    conformance = load(CONFORMANCE)
    required = conformance["requiredAcceptedSurfaces"]

    assert contract["dependsOn"] == EXPECTED_DEPENDENCIES
    assert list(contract["surfaces"]) == EXPECTED_SURFACES
    assert list(conformance["corpora"]) == EXPECTED_SURFACES
    assert [item["schema"] for item in required] == EXPECTED_DEPENDENCIES
    assert [item["surfaceKey"] for item in required] == EXPECTED_SURFACES
    assert [item["conformanceKey"] for item in required] == EXPECTED_SURFACES

    for item in required:
        surface = contract["surfaces"][item["surfaceKey"]]
        corpus = conformance["corpora"][item["conformanceKey"]]
        assert surface["schema"] == item["schema"]
        assert surface["status"] == "accepted"
        assert surface["accepted"] is True
        assert surface["conformanceKey"] == item["conformanceKey"]
        assert corpus["schema"]
        if item["surfaceKey"] == "anum":
            assert corpus["schema"] == "anum-deserialization-conformance/v0.4"
        else:
            assert corpus["status"] == "accepted"
            assert corpus["accepted"] is True
            assert corpus["contract"] == item["schema"]


def test_v06_freezes_semantic_identity_without_runtime_handle_identity() -> None:
    identity = load(CONTRACT)["semanticIdentity"]

    assert identity["linkIdentity"] == "by ordered semantic poles"
    assert identity["runtimeHandleIsSemanticIdentity"] is False
    assert identity["sourcePositionIsSemanticIdentity"] is False
    assert identity["samePairCreatesSecondSemanticLink"] is False
    assert identity["root"] == "R = R ⟼ R"
    assert identity["secondFullySelfClosedRootAllowed"] is False


def test_v06_freezes_four_abit_anum_transport_and_read_only_carrier() -> None:
    anum = load(CONTRACT)["anum"]

    assert anum["schema"] == "anum-deserialization/v0.4"
    assert anum["alphabet"] == ["[", "]", "1", "0"]
    assert anum["rootIsFifthAbit"] is False
    assert anum["emptyStream"] == "R"
    assert anum["emptyGroup"] == "R"
    assert anum["linkIdentityByOrderedPoles"] is True
    assert anum["denotationEffect"] == "none"
    assert anum["materializationAcceptedByThisOperation"] is False
    assert anum["existingAsetCarrierSemanticsAccepted"] is True
    assert anum["rawChannelInputAccepted"] is True
    assert anum["carrierRoleIsExplicit"] is True
    assert anum["carrierReadOnly"] is True
    assert anum["bothTransportsShareStackMachine"] is True


def test_v06_freezes_read_vs_effect_memory_boundary() -> None:
    memory = load(CONTRACT)["memory"]

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


def test_v06_freezes_formal_notation_context_and_anonymous_form_boundary() -> None:
    notation = load(CONTRACT)["formalNotation"]

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


def test_v06_freezes_exact_six_relation_proof_surface() -> None:
    l5 = load(CONTRACT)["l5"]

    assert l5["proofSchema"] == "mts-proof/v0.4"
    assert l5["trustedRelations"] == [
        "ContextuallySatisfies",
        "Opens",
        "NoVisibleDefinition",
        "DefinitionConflict",
        "NonAddressableDefinitionTarget",
        "DefinitionOpeningPath",
    ]
    assert l5["searchTrusted"] is False
    assert l5["checkerTrusted"] is True
    assert l5["genericCompositionAccepted"] is False
    assert l5["judgmentOrderImpliesDependency"] is False
    assert l5["openingPathImpliesEquality"] is False
    assert l5["openingPathFeedsContextuallySatisfiesImplicitly"] is False
    assert l5["transitivityAccepted"] is False
    assert l5["proofDagDependencyAccepted"] is False


def test_v06_freezes_direct_deixis_as_structural_non_implication() -> None:
    analysis = load(CONTRACT)["contextAnalysis"]
    corpus = load(CONFORMANCE)["corpora"]["directDeixis"]

    assert analysis["operation"] == "analyze_direct_deixis"
    assert analysis["positiveImpliesContextSensitive"] is False
    assert analysis["emptyImpliesContextInvariant"] is False
    assert analysis["opensDefinitions"] is False
    assert analysis["readsMemory"] is False
    assert analysis["readsContextFrame"] is False
    assert analysis["readsInterpreterIdentity"] is False
    assert analysis["trustedProofRelationAdded"] is False
    assert corpus["vectors"]
    assert corpus["equivalentSpellings"]
    assert corpus["negativeClaims"]


def test_v06_freezes_interpreter_as_link_without_hidden_identity_input() -> None:
    boundary = load(CONTRACT)["interpreterBoundary"]

    assert boundary["interpreterIsALink"] is True
    assert boundary["separateSubjectOntologyRequired"] is False
    assert boundary["acceptedEvaluationContext"] == "explicit ContextFrame(start,end,parent?)"
    assert boundary["interpreterLinkIdentityIsHiddenEvalInput"] is False
    assert boundary["currentFocusBindingSemanticsAccepted"] is False
    assert boundary["currentFocusLinkRefObservable"] is False
    assert boundary["contextMayBeVirtual"] is True


def test_v06_root_program_is_exact_frozen_text_not_executable_parser_authority() -> None:
    contract = load(CONTRACT)
    root = contract["rootProgram"]

    assert root["path"] == "tests/mtc_formulas.mtc"
    assert root["definitionCount"] == 10
    assert root_formulas() == EXPECTED_ROOT_FORMULAS


def test_v06_value_bundle_boundary_is_frozen_as_data() -> None:
    contract = load(CONTRACT)["surfaces"]["valueBundle"]
    corpus = load(CONFORMANCE)["corpora"]["valueBundle"]

    assert contract["schema"] == "mts-value-bundle/v0.2"
    assert contract["scope"]["valueBundle"] == "flat only"
    assert contract["scope"]["nestedValueBundle"] == "rejected/deferred"
    assert contract["runtimeValueModel"]["crossKindEquality"] is False
    assert contract["runtimeValueModel"]["crossKindInequality"] is True
    assert contract["elementResolution"]["eachOccurrenceResolvedIndependently"] is True
    assert contract["elementResolution"]["deduplicateBeforeResolution"] is False
    assert contract["elementResolution"]["semanticSetBuiltAfterResolution"] is True
    assert contract["expansionQuery"]["readOnly"] is True
    assert contract["expansionQuery"]["implicitRealize"] is False
    assert contract["expansionQuery"]["implicitDelete"] is False

    assert corpus["elaboration"]
    assert corpus["staticRejections"]
    assert corpus["valueEquality"]
    assert corpus["crossKindComparison"]
    assert corpus["expansion"]
    assert corpus["veto"]["nestedValueBundleAccepted"] is False
    assert corpus["veto"]["interpretMayRealize"] is False
    assert corpus["veto"]["interpretMayDelete"] is False


def test_v06_other_accepted_corpora_remain_nonempty_frozen_evidence() -> None:
    corpora = load(CONFORMANCE)["corpora"]

    assert corpora["anum"]["valid"]
    assert corpora["anum"]["invalid"]
    assert corpora["definitionOpening"]["rootOpenings"]
    assert corpora["definitionOpening"]["scenarios"]
    assert corpora["derivationBase"]["vectors"]
    assert corpora["openingPath"]["validPaths"]
    assert corpora["openingPath"]["invalidPaths"]
    assert corpora["proof"]["baseJudgments"]
    assert corpora["proof"]["invalidArtifacts"]


def test_v06_historical_replay_has_no_executable_historical_core_dependency() -> None:
    tree = ast.parse(Path(__file__).read_text(encoding="utf-8"), filename=__file__)

    imports: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            imports.append(node.module or "")

    assert not any(module == "core" or module.startswith("core.") for module in imports)
