"""Acceptance checks for replay-backed primitive MTS derivation relations v0.3."""

import json
from pathlib import Path


ROOT = Path(__file__).parents[1]
CONTRACT = ROOT / "contracts" / "mts-derivation-base-v0.3.json"
CONFORMANCE = ROOT / "contracts" / "mts-derivation-base-conformance-v0.3.json"
PROOF_V03 = ROOT / "contracts" / "mts-proof-v0.3.json"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_contract_is_accepted_and_depends_only_on_normative_v03_surface():
    contract = read(CONTRACT)

    assert contract["schema"] == "mts-derivation-base/v0.3"
    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert contract["dependsOn"] == ["mts-contract/v0.3"]
    assert contract["conformanceCorpus"] == "contracts/mts-derivation-base-conformance-v0.3.json"


def test_exact_five_relations_are_accepted_and_all_name_explicit_scope():
    contract = read(CONTRACT)
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
    conformance = read(CONFORMANCE)
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
    contract = read(CONTRACT)
    evidence = contract["evidenceBoundary"]

    assert evidence["replayCertificateIsTrustedWithoutReplay"] is False
    assert evidence["checkerMustReplayCanonicalOperation"] is True
    assert evidence["searchTraceIsEvidence"] is False
    assert evidence["uiStateIsEvidence"] is False
    assert evidence["sourceSpanIsSemanticIdentity"] is False
    assert evidence["persistentBackendIdentityIsSemanticIdentity"] is False


def test_negative_relations_are_scoped_facts_not_global_closed_world_theorems():
    boundary = read(CONTRACT)["negativeRelationBoundary"]
    assert set(boundary["negativeRelationsAccepted"]) == {
        "NoVisibleDefinition",
        "DefinitionConflict",
        "NonAddressableDefinitionTarget",
    }
    assert "no global absence" in boundary["reason"]
    assert read(CONFORMANCE)["releaseAssertions"]["negativeRelationsDoNotCreateGlobalClosedWorld"] is True


def test_no_composition_or_classical_rule_is_accepted_by_base_contract():
    boundary = read(CONTRACT)["compositionBoundary"]
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


def test_accepted_proof_v03_is_current_production_consumer_without_search_trust():
    contract = read(CONTRACT)
    proof = read(PROOF_V03)
    integration = contract["productionIntegration"]

    assert proof["schema"] == "mts-proof/v0.3"
    assert proof["accepted"] is True
    assert set(proof["trustedRelations"]) == {
        "ContextuallySatisfies",
        "Opens",
        "NoVisibleDefinition",
        "DefinitionConflict",
        "NonAddressableDefinitionTarget",
    }
    assert integration["proofContract"] == "mts-proof/v0.3"
    assert integration["proofConformance"] == "contracts/mts-proof-conformance-v0.3.json"
    assert integration["checker"] == "core/proof_checker.py"
    assert integration["acceptedRelationsPublished"] is True
    assert integration["proofSearchTrusted"] is False
    assert integration["genericCompositionAccepted"] is False
    assert contract["downstream"]["aproverProofRepinAllowed"] is False
