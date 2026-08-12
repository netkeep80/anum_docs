import json
from pathlib import Path

from core.mtc_ast import ContextPronoun, Definition, SquareForm, format_expression
from core.mtc_parser import parse_formula
from core.root_library import load_root_library
from core.validate_root import validate_root_library


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts/mts-contract-v0.6.json"
CONFORMANCE = ROOT / "contracts/mts-conformance-v0.6.json"
ROOT_FIXTURE = ROOT / "tests/mtc_formulas.mtc"


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))



def _value_bundle_contract() -> dict:
    return _load(CONTRACT)["surfaces"]["valueBundle"]


def _value_bundle_conformance() -> dict:
    return _load(CONFORMANCE)["corpora"]["valueBundle"]


def _definition_opening_contract() -> dict:
    return _load(CONTRACT)["surfaces"]["definitionOpening"]


def _definition_opening_conformance() -> dict:
    return _load(CONFORMANCE)["corpora"]["definitionOpening"]


def _derivation_base_contract() -> dict:
    return _load(CONTRACT)["surfaces"]["derivationBase"]


def _derivation_base_conformance() -> dict:
    return _load(CONFORMANCE)["corpora"]["derivationBase"]


def test_v06_is_current_only_manifest_without_historical_umbrella_parent():
    contract = _load(CONTRACT)

    assert contract["schema"] == "mts-contract/v0.6"
    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert "extends" not in contract
    assert "baseContract" not in contract
    assert "versionBoundaries" not in contract
    assert contract["dependsOn"] == [
        "anum-deserialization/v0.4",
        "mts-value-bundle/v0.2",
        "mts-definition-opening/v0.3",
        "mts-derivation-base/v0.3",
        "mts-opening-path/v0.4",
        "mts-proof/v0.4",
        "mts-direct-deixis/v0.5",
    ]
    assert not any(item.startswith("mts-contract/v0.") for item in contract["dependsOn"])
    assert contract["conformanceCorpus"] == "contracts/mts-conformance-v0.6.json"


def test_v06_conformance_requires_only_current_self_contained_surfaces():
    contract = _load(CONTRACT)
    conformance = _load(CONFORMANCE)

    assert conformance["schema"] == "mts-conformance/v0.6"
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
            assert corpus["schema"] == "anum-deserialization-conformance/v0.4"
            assert corpus["valid"]
            assert corpus["invalid"]
        else:
            assert corpus["status"] == "accepted"
            assert corpus["accepted"] is True
            assert corpus["contract"] == item["schema"]


def test_v06_semantic_identity_and_anum_are_post_reset_current_semantics():
    contract = _load(CONTRACT)
    identity = contract["semanticIdentity"]
    anum = contract["anum"]

    assert identity["linkIdentity"] == "by ordered semantic poles"
    assert identity["runtimeHandleIsSemanticIdentity"] is False
    assert identity["sourcePositionIsSemanticIdentity"] is False
    assert identity["samePairCreatesSecondSemanticLink"] is False
    assert identity["root"] == "R = R ⟼ R"
    assert identity["secondFullySelfClosedRootAllowed"] is False

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

    serialized = json.dumps(contract, ensure_ascii=False)
    assert "anum-raw-carrier-v0.2" not in serialized
    assert "anum-boundary-projection-v0.2" not in serialized
    assert "anum-denotation-v0.2" not in serialized
    assert "anum-recursive-denotation-v0.2" not in serialized


def test_v06_keeps_l2_anonymous_form_distinct_from_l3_empty_group():
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


def test_v06_memory_preserves_read_vs_effect_boundary():
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


def test_v06_publishes_exact_six_relation_proof_surface_without_generic_composition():
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


def test_v06_keeps_direct_deixis_structural_only():
    analysis = _load(CONTRACT)["contextAnalysis"]

    assert analysis["operation"] == "analyze_direct_deixis"
    assert analysis["positiveImpliesContextSensitive"] is False
    assert analysis["emptyImpliesContextInvariant"] is False
    assert analysis["opensDefinitions"] is False
    assert analysis["readsMemory"] is False
    assert analysis["readsContextFrame"] is False
    assert analysis["readsInterpreterIdentity"] is False
    assert analysis["trustedProofRelationAdded"] is False


def test_v06_models_interpreter_as_link_without_hidden_identity():
    boundary = _load(CONTRACT)["interpreterBoundary"]

    assert boundary["interpreterIsALink"] is True
    assert boundary["separateSubjectOntologyRequired"] is False
    assert boundary["acceptedEvaluationContext"] == "explicit ContextFrame(start,end,parent?)"
    assert boundary["interpreterLinkIdentityIsHiddenEvalInput"] is False
    assert boundary["currentFocusBindingSemanticsAccepted"] is False
    assert boundary["currentFocusLinkRefObservable"] is False
    assert boundary["contextMayBeVirtual"] is True
    assert boundary["securityPolicyChangesPronounMeaning"] is False


def test_v06_production_core_paths_exist_and_root_program_is_exact():
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


def test_value_bundle_surface_value_bundle_contract_is_accepted_self_contained_and_conformant():
    contract = _value_bundle_contract()
    conformance = _value_bundle_conformance()

    assert contract["schema"] == "mts-value-bundle/v0.2"
    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert "dependsOn" not in contract
    assert "historical MTS umbrella" in contract["foundation"]
    assert conformance["schema"] == "mts-value-bundle-conformance/v0.2"
    assert conformance["status"] == "accepted"
    assert conformance["accepted"] is True
    assert conformance["contract"] == contract["schema"]


def test_value_bundle_surface_accepted_conformance_is_self_contained_across_all_semantic_sections():
    conformance = _value_bundle_conformance()
    assert conformance["elaboration"]
    assert conformance["staticRejections"]
    assert conformance["valueEquality"]
    assert conformance["crossKindComparison"]
    assert conformance["expansionMemory"]
    assert conformance["expansion"]
    assert conformance["veto"]


def test_value_bundle_surface_accepted_scope_is_flat_only_and_does_not_smuggle_nested_semantics():
    contract = _value_bundle_contract()
    conformance = _value_bundle_conformance()

    assert contract["scope"]["valueBundle"] == "flat only"
    assert contract["scope"]["nestedValueBundle"] == "rejected/deferred"
    assert conformance["veto"]["nestedValueBundleAccepted"] is False
    assert any(
        case["error"] == "nested-value-bundle-not-supported"
        for case in conformance["staticRejections"]
    )
    assert "nestedValueBundleSemantics" in contract["deferred"]


def test_value_bundle_surface_flat_value_model_is_extensional_only_after_occurrence_resolution():
    contract = _value_bundle_contract()
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

    cases = {case["id"]: case for case in _value_bundle_conformance()["valueEquality"]}
    assert cases["anonymous-different-bindings"]["equal"] is False
    assert cases["anonymous-same-bindings"]["equal"] is True


def test_value_bundle_surface_conformance_preserves_cross_kind_and_read_only_expansion_boundaries():
    contract = _value_bundle_contract()
    conformance = _value_bundle_conformance()

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


def test_value_bundle_surface_current_ten_root_definitions_remain_parseable_and_value_bundle_cannot_enter_root():
    contract = _value_bundle_contract()
    sources = [
        line.strip()
        for line in ROOT_FIXTURE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]

    assert len(sources) == 10
    for source in sources:
        parse_formula(source)
    regression = contract["elaboration"]["rootRegression"]
    assert regression["currentTenDefinitionsMustElaborateIdentically"] is True
    assert regression["valueBundleMayAppearInCurrentRoot"] is False


def test_value_bundle_surface_production_integration_and_downstream_boundary_are_current_only():
    contract = _value_bundle_contract()
    integration = contract["productionIntegration"]
    downstream = contract["downstream"]

    assert integration == {
        "referenceCore": "core/mtc_value_bundle.py",
        "conformanceCorpus": "mts-conformance/v0.6#corpora.valueBundle",
        "rootRegression": "tests/mtc_formulas.mtc",
        "constraintBundleRegression": "tests/test_mtc_value_bundle_reference.py",
    }
    assert "aproverRepinRequired" not in downstream
    assert downstream["consumerMustExecuteConformance"] is True
    assert downstream["compatibilityImplementationAllowed"] is False


def test_definition_opening_surface_contract_is_accepted_integrated_and_not_inherited_from_historical_umbrella():
    data = _definition_opening_contract()

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


def test_definition_opening_surface_acceptance_depends_only_on_self_contained_contract_and_conformance():
    data = _definition_opening_contract()
    corpus = _definition_opening_conformance()

    assert data["conformanceKey"] == "definitionOpening"
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


def test_definition_opening_surface_accepted_operation_is_exactly_one_step_and_effect_free():
    operation = _definition_opening_contract()["operation"]
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


def test_definition_opening_surface_definition_environment_identity_scope_and_shadowing_are_normative():
    environment = _definition_opening_contract()["definitionEnvironment"]
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


def test_definition_opening_surface_occurrence_local_deictic_and_bundle_targets_are_not_globalized():
    addressability = _definition_opening_contract()["addressability"]
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


def test_definition_opening_surface_root_program_is_still_exactly_ten_definitions_and_acceptance_does_not_change_it():
    data = _definition_opening_contract()["rootProgram"]
    library = load_root_library(ROOT_FIXTURE)
    corpus = _definition_opening_conformance()

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


def test_definition_opening_surface_infinity_example_normatively_preserves_unresolved_context_pronouns():
    example = _definition_opening_contract()["bodySemantics"]["example"]
    assert example == {
        "definition": "∞ : {◁ = ∞, ▷ = ∞}",
        "openingResultBody": "{◁ = ∞, ▷ = ∞}",
        "pronounsResolvedByOpening": False,
    }

    infinity = parse_formula(example["definition"])
    assert isinstance(infinity, Definition)
    assert format_expression(infinity.value) == example["openingResultBody"]


def test_definition_opening_surface_recursion_is_normatively_single_step_not_global_normalization():
    recursion = _definition_opening_contract()["recursion"]
    separation = _definition_opening_contract()["separation"]

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


def test_definition_opening_surface_downstream_boundary_is_current_and_has_no_release_history_status():
    downstream = _definition_opening_contract()["downstream"]

    assert downstream == {
        "aproverMustNotInventLocalOpeningSemantics": True,
        "proofUseRequiresExplicitAcceptedLift": True,
    }


def test_derivation_base_surface_contract_is_accepted_self_contained_and_has_no_release_parent():
    contract = _derivation_base_contract()

    assert contract["schema"] == "mts-derivation-base/v0.3"
    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert "dependsOn" not in contract
    serialized = json.dumps(contract, ensure_ascii=False)
    assert "mts-contract/v0." not in serialized
    assert "mts-proof/v0." not in serialized
    assert contract["conformanceKey"] == "derivationBase"


def test_derivation_base_surface_exact_five_relations_are_accepted_and_all_name_explicit_scope():
    contract = _derivation_base_contract()
    relations = {item["id"]: item for item in contract["relations"]}

    assert set(relations) == {
        "ContextuallySatisfies",
        "Opens",
        "NoVisibleDefinition",
        "DefinitionConflict",
        "NonAddressableDefinitionTarget",
    }
    assert relations["ContextuallySatisfies"]["globalTruth"] is False
    assert "ContextFrame" in relations["ContextuallySatisfies"]["arguments"]
    assert relations["Opens"]["impliesEquality"] is False
    assert relations["Opens"]["evaluatesRhs"] is False
    assert relations["NoVisibleDefinition"]["globalAbsence"] is False
    assert relations["NoVisibleDefinition"]["closedWorldBeyondSnapshot"] is False
    assert relations["DefinitionConflict"]["impliesBodyEquality"] is False
    assert relations["NonAddressableDefinitionTarget"]["globalSemanticInvalidity"] is False


def test_derivation_base_surface_accepted_conformance_owns_lifting_vectors_and_counterexamples():
    conformance = _derivation_base_conformance()
    vector_ids = {item["id"] for item in conformance["vectors"]}

    assert conformance["schema"] == "mts-derivation-base-conformance/v0.3"
    assert conformance["status"] == "accepted"
    assert conformance["accepted"] is True
    assert conformance["contract"] == "mts-derivation-base/v0.3"

    selected = {
        item
        for values in conformance["acceptedVectors"].values()
        for item in values
    }
    assert selected.issubset(vector_ids)
    assert set(conformance["requiredCounterexamples"]).issubset(vector_ids)
    assert "contextual-satisfaction-countercontext" in conformance["requiredCounterexamples"]
    assert "same-target-other-environment" in conformance["requiredCounterexamples"]
    assert conformance["forbiddenConclusions"]


def test_derivation_base_surface_independent_replay_remains_part_of_trusted_boundary():
    contract = _derivation_base_contract()
    evidence = contract["evidenceBoundary"]

    assert evidence["replayCertificateIsTrustedWithoutReplay"] is False
    assert evidence["checkerMustReplayCanonicalOperation"] is True
    assert evidence["searchTraceIsEvidence"] is False
    assert evidence["uiStateIsEvidence"] is False
    assert evidence["sourceSpanIsSemanticIdentity"] is False
    assert evidence["persistentBackendIdentityIsSemanticIdentity"] is False


def test_derivation_base_surface_negative_relations_are_scoped_facts_not_global_closed_world_theorems():
    boundary = _derivation_base_contract()["negativeRelationBoundary"]
    assert set(boundary["negativeRelationsAccepted"]) == {
        "NoVisibleDefinition",
        "DefinitionConflict",
        "NonAddressableDefinitionTarget",
    }
    assert "no global absence" in boundary["reason"]
    assert _derivation_base_conformance()["releaseAssertions"]["negativeRelationsDoNotCreateGlobalClosedWorld"] is True


def test_derivation_base_surface_no_composition_or_classical_rule_is_accepted_by_base_derivation_base_contract():
    boundary = _derivation_base_contract()["compositionBoundary"]
    assert boundary == {
        "genericCompositionAccepted": False,
        "transitivityAccepted": False,
        "symmetryAccepted": False,
        "congruenceAccepted": False,
        "modusPonensAccepted": False,
        "globalSubstitutionAccepted": False,
        "openingToEqualityAccepted": False,
        "recursiveNormalizationAccepted": False,
    }


def test_derivation_base_surface_production_integration_points_to_version_neutral_base_replay():
    integration = _derivation_base_contract()["productionIntegration"]

    assert integration == {
        "checker": "core/proof_checker.py",
        "canonicalReplay": "check_base_judgment",
        "proofSearchTrusted": False,
        "genericCompositionAccepted": False,
    }
