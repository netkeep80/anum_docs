"""Acceptance checks for replay-backed primitive MTS derivation relations v0.3."""

import json
from pathlib import Path


ROOT = Path(__file__).parents[1]
CONTRACT = ROOT / "contracts" / "mts-derivation-base-v0.3.json"
CONFORMANCE = ROOT / "contracts" / "mts-derivation-base-conformance-v0.3.json"
DOMAIN_DECISION = ROOT / "contracts" / "mts-proof-domain-decision-v0.3.json"
LIFTING_CHALLENGE = ROOT / "contracts" / "mts-proof-lifting-challenge-v0.3.json"
LIFTING_CORPUS = ROOT / "contracts" / "mts-proof-lifting-conformance-v0.3.json"
PROOF_V02 = ROOT / "contracts" / "mts-proof-v0.2.json"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_contract_is_accepted_only_after_domain_decision_and_lifting_challenge():
    contract = read(CONTRACT)
    decision = read(DOMAIN_DECISION)
    challenge = read(LIFTING_CHALLENGE)

    assert contract["schema"] == "mts-derivation-base/v0.3"
    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert contract["dependsOn"] == [
        "mts-contract/v0.3",
        decision["schema"],
        challenge["schema"],
    ]
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


def test_accepted_conformance_selects_challenged_vectors_without_erasing_counterexamples():
    conformance = read(CONFORMANCE)
    challenge_corpus = read(LIFTING_CORPUS)
    challenge_ids = {item["id"] for item in challenge_corpus["vectors"]}

    assert conformance["schema"] == "mts-derivation-base-conformance/v0.3"
    assert conformance["status"] == "accepted"
    assert conformance["accepted"] is True
    assert conformance["contract"] == "mts-derivation-base/v0.3"
    assert conformance["sourceChallenge"] == "contracts/mts-proof-lifting-conformance-v0.3.json"

    selected = {
        item
        for values in conformance["acceptedVectors"].values()
        for item in values
    }
    assert selected.issubset(challenge_ids)
    assert set(conformance["requiredCounterexamples"]).issubset(challenge_ids)
    assert "contextual-satisfaction-countercontext" in conformance["requiredCounterexamples"]
    assert "same-target-other-environment" in conformance["requiredCounterexamples"]


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


def test_v02_proof_kernel_stays_unchanged_and_v03_checker_is_next_gate():
    contract = read(CONTRACT)
    proof_v02 = read(PROOF_V02)
    boundary = contract["proofVersionBoundary"]

    assert proof_v02["checker"]["trustedRuleSet"] == ["interpret"]
    assert boundary["mtsProofV02Modified"] is False
    assert boundary["mtsProofV02TrustedRuleSet"] == ["interpret"]
    assert boundary["mtsProofV03Published"] is False
    assert boundary["productionV03CheckerImplemented"] is False
    assert boundary["aproverProofRepinAllowed"] is False

    gate = contract["nextGate"]
    assert gate["goal"].startswith("define a versioned mts-proof/v0.3 artifact/checker")
    assert "no generic step composition yet" in gate["requirements"]
    assert "no proof-search dependency" in gate["requirements"]
