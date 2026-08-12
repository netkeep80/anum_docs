"""Acceptance checks for self-contained primitive MTS derivation relations."""

import json
from pathlib import Path


ROOT = Path(__file__).parents[1]
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.5.json"
MTS_CONFORMANCE = ROOT / "contracts" / "mts-conformance-v0.5.json"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _contract() -> dict:
    return read(MTS_CONTRACT)["surfaces"]["derivationBase"]


def _conformance() -> dict:
    return read(MTS_CONFORMANCE)["corpora"]["derivationBase"]


def test_contract_is_accepted_self_contained_and_has_no_release_parent():
    contract = _contract()

    assert contract["schema"] == "mts-derivation-base/v0.3"
    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert "dependsOn" not in contract
    serialized = json.dumps(contract, ensure_ascii=False)
    assert "mts-contract/v0." not in serialized
    assert "mts-proof/v0." not in serialized
    assert contract["conformanceKey"] == "derivationBase"


def test_exact_five_relations_are_accepted_and_all_name_explicit_scope():
    contract = _contract()
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


def test_accepted_conformance_owns_lifting_vectors_and_counterexamples():
    conformance = _conformance()
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


def test_independent_replay_remains_part_of_trusted_boundary():
    contract = _contract()
    evidence = contract["evidenceBoundary"]

    assert evidence["replayCertificateIsTrustedWithoutReplay"] is False
    assert evidence["checkerMustReplayCanonicalOperation"] is True
    assert evidence["searchTraceIsEvidence"] is False
    assert evidence["uiStateIsEvidence"] is False
    assert evidence["sourceSpanIsSemanticIdentity"] is False
    assert evidence["persistentBackendIdentityIsSemanticIdentity"] is False


def test_negative_relations_are_scoped_facts_not_global_closed_world_theorems():
    boundary = _contract()["negativeRelationBoundary"]
    assert set(boundary["negativeRelationsAccepted"]) == {
        "NoVisibleDefinition",
        "DefinitionConflict",
        "NonAddressableDefinitionTarget",
    }
    assert "no global absence" in boundary["reason"]
    assert _conformance()["releaseAssertions"]["negativeRelationsDoNotCreateGlobalClosedWorld"] is True


def test_no_composition_or_classical_rule_is_accepted_by_base_contract():
    boundary = _contract()["compositionBoundary"]
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


def test_production_integration_points_to_version_neutral_base_replay():
    integration = _contract()["productionIntegration"]

    assert integration == {
        "checker": "core/proof_checker.py",
        "canonicalReplay": "check_base_judgment",
        "proofSearchTrusted": False,
        "genericCompositionAccepted": False,
    }
