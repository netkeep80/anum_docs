"""Integration-readiness checks for Foundation-v2 issue #202.

This is deliberately not a production acceptance test.  It verifies that the
research direction is closed enough to enter one Gate-P migration design rather
than continuing to fork foundation semantics.
"""
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "contracts/mts-foundation-v2-integration-readiness-v0.7.json"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_review_is_gate_p_readiness_not_production_acceptance():
    review = read(REVIEW)
    assert review["schema"] == "mts-foundation-v2-integration-readiness/v0.7"
    assert review["status"] == "research-direction-ready-for-gate-p"
    assert review["accepted"] is False
    assert review["issue"] == 202
    production = review["productionAcceptance"]
    assert production["newAcceptedMtsVersionPublished"] is False
    assert production["productionMigrationAllowedNow"] is False
    assert production["gatePDesignAllowedNow"] is True
    assert production["aproverRepinAllowedNow"] is False
    assert production["mtsDependentAvmRepinAllowedNow"] is False


def test_all_declared_foundation_evidence_files_exist_and_remain_nonproduction():
    review = read(REVIEW)
    assert len(review["evidenceFiles"]) >= 16
    for relative in review["evidenceFiles"]:
        evidence = read(ROOT / relative)
        assert evidence["accepted"] is False
        assert evidence["status"] in {
            "candidate-challenge",
            "candidate-decision",
            "challenge",
        }


def test_direction_closes_the_previous_semantic_forks():
    direction = read(REVIEW)["foundationDirection"]
    assert "Meaning(x)" in direction["meaningBoundary"]
    assert "not universal identity" in direction["anum"]
    assert "resolution directions" in direction["relationForms"]
    assert "no hidden parent stack" in direction["context"]
    assert "canonical astring content C" in direction["source"]
    assert "no token enum/AST opcode semantic identity" in direction["language"]
    assert "does not imply unrestricted rewrite" in direction["theory"]
    assert "no automatic congruence/substitution/transitivity" in direction["equality"]
    assert "untrusted" in direction["search"]


def test_old_diagrams_are_integrated_as_evidence_not_normative_override():
    historical = read(REVIEW)["historicalDiagramIntegration"]
    assert historical == {
        "supportsRelationOfRelationsIntuition": True,
        "supportsSelfClosureAndOpenFormIntuition": True,
        "supportsLabelsPredicatesAsLinksIntuition": True,
        "changesNormativeEqualityBoundaries": False,
        "treatedAsAxioms": False,
    }


def test_gate_p_requires_one_path_and_no_post_cutover_compat_semantics():
    review = read(REVIEW)
    requirements = review["gatePRequirements"]
    joined = "\n".join(requirements)
    assert "one production-facing" in joined
    assert "one parser/source front-end" in joined
    assert "one reference interpreter/replay path" in joined
    assert "explicit L4 mapping" in joined
    assert "delete obsolete semantic paths" in joined
    assert review["productionAcceptance"]["legacyCompatibilitySemanticModesAllowedAfterCutover"] is False


def test_issue_lifecycle_has_one_replacement_for_obsolete_v06_migration_plan():
    lifecycle = read(REVIEW)["issueLifecycleDecision"]
    assert lifecycle == {
        "issue202MayCloseAfterThisReviewMerges": True,
        "freshGatePReplacesIssues194To199": True,
        "issues194To199ShouldCloseAsSupersededAfterGatePCreation": True,
        "noNewParallelFoundationGateWithoutNewFalsification": True,
    }
