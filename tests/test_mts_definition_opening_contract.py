"""Acceptance gate for normative one-step definition-opening semantics v0.3."""

import json
from pathlib import Path

from core.mtc_ast import ContextPronoun, Definition, SquareForm, format_expression
from core.mtc_parser import parse_formula
from core.root_library import load_root_library


ROOT = Path(__file__).parents[1]
CONTRACT = ROOT / "contracts" / "mts-definition-opening-v0.3.json"
MTS_V02 = ROOT / "contracts" / "mts-contract-v0.2.json"
PROOF_V02 = ROOT / "contracts" / "mts-proof-v0.2.json"
CORPUS = ROOT / "contracts" / "mts-definition-opening-conformance-v0.3.json"
CHALLENGE = ROOT / "contracts" / "mts-definition-opening-challenge-v0.3.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def contract() -> dict:
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def test_contract_is_normatively_accepted_but_does_not_retrofit_v02_umbrellas():
    data = contract()
    mts_v02 = MTS_V02.read_text(encoding="utf-8")
    proof_v02 = PROOF_V02.read_text(encoding="utf-8")

    assert data["schema"] == "mts-definition-opening/v0.3"
    assert data["status"] == "accepted"
    assert data["accepted"] is True
    assert data["integrationStatus"]["semanticContractAccepted"] is True
    assert data["integrationStatus"]["productionReferenceCoreImplemented"] is False
    assert data["integrationStatus"]["singleProductionInterpreterIntegrated"] is False
    assert data["integrationStatus"]["mtsContractV03Published"] is False
    assert data["integrationStatus"]["trustedL5RuleAccepted"] is False
    assert data["integrationStatus"]["aproverRepinAllowed"] is False

    assert "mts-definition-opening/v0.3" not in mts_v02
    assert "mts-definition-opening/v0.3" not in proof_v02


def test_acceptance_depends_on_the_full_decision_and_challenge_chain():
    data = contract()
    assert data["dependsOn"] == [
        "mts-contract/v0.2",
        "mts-definition-resolution-challenge/v0.3",
        "mts-definition-environment-decision/v0.3",
        "mts-definition-environment-challenge/v0.3",
        "mts-definition-opening-decision/v0.3",
        "mts-definition-opening-challenge/v0.3",
    ]
    assert data["conformanceCorpus"] == "contracts/mts-definition-opening-conformance-v0.3.json"

    challenge = json.loads(CHALLENGE.read_text(encoding="utf-8"))
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
    assert challenge["status"] == "candidate-challenge"
    assert corpus["status"] == "candidate-challenge-corpus"
    assert challenge["conformanceCorpus"] == "contracts/mts-definition-opening-conformance-v0.3.json"


def test_accepted_operation_is_exactly_one_step_and_effect_free():
    operation = contract()["operation"]
    assert operation["name"] == "open_definition"
    assert operation["inputs"] == [
        "typed addressable target Form",
        "explicit lexical DefinitionEnvironment",
    ]
    assert operation["doesNotTake"] == [
        "ContextFrame",
        "MemoryView",
        "symbol-to-LinkRef bindings",
        "proof state",
    ]
    assert set(operation["results"]) == {
        "match",
        "no-match",
        "conflict",
        "non-addressable",
    }
    assert operation["oneStep"] is True
    assert operation["recursive"] is False
    assert operation["evaluatesBody"] is False
    assert operation["resolvesContextPronouns"] is False
    assert operation["rewritesCallerAst"] is False
    assert operation["assertsEquality"] is False
    assert operation["producesProofStep"] is False
    assert operation["readsL4"] is False
    assert operation["writesL4"] is False


def test_definition_environment_identity_scope_and_shadowing_are_normative():
    environment = contract()["definitionEnvironment"]
    identity = environment["identity"]

    assert identity["definitionId"] == "replay-local pair (scopePath, ordinal)"
    assert identity["persistentStorageIdentity"] is False
    assert identity["targetStructuralKeyIsDefinitionIdentity"] is False
    assert identity["sourceSpanIsDefinitionIdentity"] is False
    assert identity["displayTextIsDefinitionIdentity"] is False
    assert environment["scopeModel"] == "explicit lexical scope tree"
    assert environment["sameScopeDuplicate"] == "conflict"
    assert environment["childSameTarget"] == "nearest-scope shadowing"
    assert environment["lookupOrder"] == "current scope then lexical parents"
    assert environment["ContextFrameAffectsLookup"] is False


def test_occurrence_local_and_deictic_targets_are_not_globalized():
    addressability = contract()["addressability"]
    assert addressability["anonymousEmptySquareTarget"] == "non-addressable"
    assert addressability["ContextPronounTarget"] == "non-addressable"
    assert addressability["structuralLookupDiscriminantImpliesSemanticEquality"] is False

    anonymous = parse_formula("[] : a")
    start = parse_formula("◁ : a")
    end = parse_formula("▷ : a")
    assert isinstance(anonymous, Definition)
    assert isinstance(anonymous.target, SquareForm) and anonymous.target.content is None
    assert isinstance(start, Definition) and isinstance(start.target, ContextPronoun)
    assert isinstance(end, Definition) and isinstance(end.target, ContextPronoun)


def test_root_program_is_still_exactly_ten_definitions_and_acceptance_does_not_change_it():
    data = contract()["rootProgram"]
    library = load_root_library(ROOT_PROGRAM)
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))

    assert data == {
        "path": "tests/mtc_formulas.mtc",
        "definitionCount": 10,
        "mustRemainUnchanged": True,
        "allCurrentTargetsAddressable": True,
        "allOpenToExactTypedRhs": True,
    }
    assert len(library.formulas) == 10
    assert all(isinstance(formula.ast, Definition) for formula in library.formulas)

    expected = [
        f"{item['target']} : {item['expected']['body']}"
        for item in corpus["rootOpenings"]
    ]
    assert [formula.text for formula in library.formulas] == expected


def test_infinity_example_normatively_preserves_unresolved_context_pronouns():
    example = contract()["bodySemantics"]["example"]
    assert example == {
        "definition": "∞ : {◁ = ∞, ▷ = ∞}",
        "openingResultBody": "{◁ = ∞, ▷ = ∞}",
        "pronounsResolvedByOpening": False,
    }

    infinity = parse_formula(example["definition"])
    assert isinstance(infinity, Definition)
    assert format_expression(infinity.value) == example["openingResultBody"]


def test_recursion_is_normatively_single_step_not_global_normalization():
    recursion = contract()["recursion"]
    separation = contract()["separation"]

    assert recursion["singleStepCycleMarkerRequired"] is False
    assert recursion["multiStepTraversalMustTrackDefinitionId"] is True
    assert recursion["globalNormalFormRequired"] is False
    assert separation == {
        "definitionIsEquality": False,
        "openingIsInterpretation": False,
        "openingIsProofStep": False,
        "openingIsRealize": False,
        "lookupIsRealize": False,
        "globalTextualSubstitution": False,
        "eagerRecursiveNormalization": False,
    }


def test_next_gate_requires_one_production_core_before_v03_umbrella_or_l5():
    gate = contract()["nextGate"]
    downstream = contract()["downstream"]

    assert gate["goal"].startswith("implement the accepted DefinitionEnvironment/open_definition operation once")
    assert "do not add a second parser or interpreter" in gate["constraints"]
    assert "do not turn Definition into Equality" in gate["constraints"]
    assert gate["afterProductionConformance"].startswith("publish mts-contract/v0.3 umbrella")

    assert downstream["directRuntimePinBeforeProductionIntegration"] is False
    assert downstream["aproverMustNotInventLocalOpeningSemantics"] is True
    assert downstream["futureConsumerMustUseVersionedV03Umbrella"] is True
