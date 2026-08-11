"""Acceptance gate for the self-contained one-step definition-opening semantics."""

import json
from pathlib import Path

from core.mtc_ast import ContextPronoun, Definition, SquareForm, format_expression
from core.mtc_parser import parse_formula
from core.root_library import load_root_library


ROOT = Path(__file__).parents[1]
CONTRACT = ROOT / "contracts" / "mts-definition-opening-v0.3.json"
CORPUS = ROOT / "contracts" / "mts-definition-opening-conformance-v0.3.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def contract() -> dict:
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def test_contract_is_accepted_integrated_and_not_inherited_from_historical_umbrella():
    data = contract()

    assert data["schema"] == "mts-definition-opening/v0.3"
    assert data["status"] == "accepted"
    assert data["accepted"] is True
    assert "dependsOn" not in data
    assert "historical MTS umbrella" in data["foundation"]

    status = data["integrationStatus"]
    assert status == {
        "semanticContractAccepted": True,
        "productionReferenceCoreImplemented": True,
        "canonicalRootLibraryUsesDefinitionEnvironment": True,
        "productionConformancePresent": True,
    }

    integration = data["productionIntegration"]
    assert integration["referenceCore"] == "core/mtc_definitions.py"
    assert integration["rootLibrary"] == "core/root_library.py"
    assert integration["rootValidator"] == "core/validate_root.py"
    assert integration["productionConformance"] == "tests/test_mts_definition_opening_reference.py"
    assert integration["legacyDifferenceRegistryRetained"] is False
    assert integration["challengeOnlyEnvironmentCloneRetained"] is False
    assert integration["interpretConstraintsExecutesDefinition"] is False


def test_acceptance_depends_only_on_self_contained_contract_and_conformance():
    data = contract()
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))

    assert data["conformanceCorpus"] == "contracts/mts-definition-opening-conformance-v0.3.json"
    assert corpus["status"] == "accepted"
    assert corpus["accepted"] is True
    assert corpus["contract"] == data["schema"]
    assert corpus["rootOpenings"]
    assert corpus["scenarios"]
    serialized = json.dumps(data, ensure_ascii=False).lower()
    assert "mts-contract/v0.2" not in serialized
    assert "candidate-challenge" not in serialized
    assert "candidate-decision" not in serialized
    assert "acceptanceevidence" not in serialized


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


def test_occurrence_local_deictic_and_bundle_targets_are_not_globalized():
    addressability = contract()["addressability"]
    assert addressability["anonymousEmptySquareTarget"] == "non-addressable"
    assert addressability["ContextPronounTarget"] == "non-addressable"
    assert addressability["bundleTarget"] == "non-addressable under the accepted scalar definition-target boundary"
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
    assert len(library.formulas) == len(library.definitions.entries()) == 10
    assert library.definitions.conflicts() == ()
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


def test_downstream_boundary_is_current_and_has_no_release_history_status():
    downstream = contract()["downstream"]

    assert downstream == {
        "aproverMustNotInventLocalOpeningSemantics": True,
        "proofUseRequiresExplicitAcceptedLift": True,
    }
