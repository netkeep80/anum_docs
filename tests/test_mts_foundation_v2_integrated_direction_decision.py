"""Non-production direction decision checks for foundation-v2 issue #221.

The integrated interpreter-act dependency is supplied by merged prerequisite #220;
this decision intentionally tests the composed main+decision surface.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DECISION = ROOT / "contracts/mts-foundation-v2-integrated-direction-decision-v0.7.json"

DEPENDENCIES = {
    "mts-integrated-interpreter-act-challenge/v0.7": ROOT
    / "contracts/mts-integrated-interpreter-act-challenge-v0.7.json",
    "mts-explicit-theory-network-challenge/v0.7": ROOT
    / "contracts/mts-explicit-theory-network-challenge-v0.7.json",
    "mts-scoped-link-dictionary-challenge/v0.7": ROOT
    / "contracts/mts-scoped-link-dictionary-challenge-v0.7.json",
    "anum-self-closed-context-challenge/v0.7": ROOT
    / "contracts/anum-self-closed-context-challenge-v0.7.json",
    "mts-four-binding-forms-challenge/v0.7": ROOT
    / "contracts/mts-four-binding-forms-challenge-v0.7.json",
    "anum-root-relative-meaning-challenge/v0.7": ROOT
    / "contracts/anum-root-relative-meaning-challenge-v0.7.json",
    "string-anum-byte-protocol-challenge/v0.7": ROOT
    / "contracts/string-anum-byte-protocol-challenge-v0.7.json",
    "mts-semantic-root-kernel-challenge/v0.7": ROOT
    / "contracts/mts-semantic-root-kernel-challenge-v0.7.json",
}


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_decision_selects_direction_without_claiming_acceptance():
    decision = read(DECISION)

    assert decision["schema"] == "mts-foundation-v2-integrated-direction-decision/v0.7"
    assert decision["status"] == "candidate-decision"
    assert decision["accepted"] is False
    assert decision["issue"] == 221
    assert decision["decisionScope"] == {
        "selectsPreferredResearchDirection": True,
        "productionAccepted": False,
        "acceptedContractVersionPublished": False,
        "referenceDesignWorkAllowed": True,
        "productionMigrationAllowed": False,
        "aproverRepinAllowed": False,
    }


def test_every_declared_dependency_exists_and_matches_its_schema():
    decision = read(DECISION)

    assert set(decision["dependsOn"]) == set(DEPENDENCIES)
    for schema in decision["dependsOn"]:
        dependency = read(DEPENDENCIES[schema])
        assert dependency["schema"] == schema
        assert dependency["accepted"] is False


def test_preferred_direction_keeps_source_form_theory_and_context_separate():
    preferred = read(DECISION)["preferredIntegratedDirection"]

    assert preferred["sourceFormTheorySeparationRequired"] is True
    assert preferred["dictionary"] == "D ⟼ (S ⟼ F)"
    assert preferred["theory"] == "T ⟼ F"
    assert preferred["context"] == "K = K ⟼ (parent ⟼ current)"
    assert preferred["currentPronoun"] == "↑ = current"
    assert preferred["contextUpdate"] == "persistent new K'; old K is immutable"
    assert preferred["interpreterIdentity"] == "I is an ordinary link"
    assert preferred["separateSubjectOntologyRequired"] is False


def test_self_closed_role_bundle_is_preferred_over_positional_act_ontology():
    decision = read(DECISION)
    preferred = decision["preferredIntegratedDirection"]
    integrated = read(DEPENDENCIES["mts-integrated-interpreter-act-challenge/v0.7"])

    assert preferred["actCandidate"] == "self-closed-role-bundle"
    assert preferred["actShape"] == (
        "A = A ⟼ (I ⟼ K') with A ⟼ (role ⟼ value) fields"
    )
    assert preferred["positionalSpineRole"] == (
        "compact transport/evidence candidate, not preferred act ontology"
    )
    assert integrated["candidateB"]["additiveFieldsStable"] is True
    assert integrated["candidateB"]["identicalEvidenceOccurrenceIdentityPreserved"] is True
    assert integrated["candidateA"]["externalPositionSchemaRequired"] is True
    assert integrated["candidateA"]["additiveFieldsStable"] is False
    assert integrated["candidateA"]["identicalEvidenceOccurrenceIdentityPreserved"] is False


def test_semantic_boundaries_reject_hidden_host_foundation_mechanisms():
    boundaries = read(DECISION)["requiredSemanticBoundaries"]

    assert boundaries["rootMeaningOfMeaningRemainsPrimary"] is True
    assert boundaries["meaningPrimitiveAllowed"] is False
    assert boundaries["selfClosureOstensiveMeaningRequired"] is True
    assert boundaries["rawProjectionSemanticsForSelfClosureGlyphsAllowed"] is False
    assert boundaries["sourceEqualsFormAllowed"] is False
    assert boundaries["formEqualsTheoryAdmissionAllowed"] is False
    assert boundaries["globalDictionaryAllowed"] is False
    assert boundaries["globalTheoryAllowed"] is False
    assert boundaries["globalCurrentAllowed"] is False
    assert boundaries["hiddenParentStackAllowed"] is False
    assert boundaries["isAxiomTagAllowed"] is False
    assert boundaries["stageTagRequired"] is False
    assert boundaries["searchRankingTrusted"] is False
    assert boundaries["selectedReplayReadOnly"] is True
    assert boundaries["historicalContractsImmutable"] is True


def test_decision_carries_forward_negative_boundaries_instead_of_hiding_them():
    results = read(DECISION)["challengeResultsCarriedForward"]

    assert results["recursiveAnumIsRootRelativeOccurrenceTreeDescription"] is True
    assert results["recursiveAnumPreservesExplicitSharingIdentity"] is False
    assert results["recursiveAnumRepresentsGeneralCyclesDirectly"] is False
    assert results["stringProtocolContextExplicit"] is True
    assert results["dictionaryConflictExplicit"] is True
    assert results["theoryMembershipExplicit"] is True
    assert results["partialFormMultiplicityAllowed"] is True
    assert results["selfClosedShapeGloballyMeansIncomplete"] is False
    assert results["actOccurrenceIdentityMatters"] is True
    assert results["roleBundleAdditivelyExtensible"] is True


def test_old_ast_first_and_ambient_context_directions_remain_demoted():
    superseded = read(DECISION)["supersededResearchDirections"]

    assert superseded == {
        "oldAstFirstV06MigrationBlocked": True,
        "rawProjectionFoundationBlocked": True,
        "ambientContextFrameFoundationBlocked": True,
        "markerBasedContextFrameCandidateDemoted": True,
        "positionalActSpineAsOntologyDemoted": True,
    }


def test_remaining_acceptance_blockers_are_explicit_and_nonempty():
    decision = read(DECISION)

    assert decision["remainingAcceptanceBlockers"] == [
        "canonical interpreter role vocabulary and its bootstrap",
        "multi-step interpreter loop and act chaining",
        "colon definition effects as explicit link-network changes",
        "equality/constraint semantics after foundation reset",
        "general shared/cyclic asest meaning/reference semantics",
        "canonical astring source topology and final string protocol",
        "persistent/L4 mapping",
        "single production parser/interpreter/reference cutover plan",
    ]
    assert decision["nextGates"] == {
        "roleVocabulary": "R",
        "multiStepLoop": "L",
        "definitionEffects": ":",
        "equality": "=",
        "productionReference": "P",
    }


def test_decision_veto_forbids_premature_release_or_parallel_semantics():
    veto = read(DECISION)["veto"]

    assert veto == {
        "productionFilesChangedByDecision": False,
        "acceptedUmbrellaPublished": False,
        "historicalContractMutationAllowed": False,
        "parallelCompatibilitySemanticsAllowed": False,
        "automaticGlobalRewriteAllowed": False,
        "roleRefsPromotedToFiveLinkRoot": False,
        "aproverRepinAllowed": False,
    }
