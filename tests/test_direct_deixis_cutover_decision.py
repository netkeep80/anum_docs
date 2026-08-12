from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DECISION = ROOT / "cutover/direct-deixis-rooted-migration-decision-v0.1.json"
MANIFEST = ROOT / "cutover/foundation-v2-import-classification-v0.1.json"
CONTRACT = ROOT / "contracts/mts-contract-v0.6.json"
CONFORMANCE = ROOT / "contracts/mts-conformance-v0.6.json"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_p3a_decision_preserves_direct_deixis_by_rooted_migration() -> None:
    decision = read(DECISION)

    assert decision["schema"] == "direct-deixis-rooted-migration-decision/v0.1"
    assert decision["issue"] == 385
    assert decision["parentIssue"] == 382
    assert decision["decision"] == "PRESERVE_BY_ROOTED_MIGRATION"
    assert decision["evidence"] == {
        "challengeIssue": 383,
        "pullRequest": 384,
        "mergeCommit": "efc6b405fab6f927da9e6465a57de486a6868bcd",
        "executableCorpusGate": "tests/test_mts_foundation_v2_direct_deixis.py",
    }


def test_next_surface_changes_input_boundary_not_observable_result_semantics() -> None:
    next_surface = read(DECISION)["next"]

    assert next_surface["surfaceCandidate"] == "mts-direct-deixis/v0.6"
    assert next_surface["referenceCore"] == "core/foundation_v2_direct_deixis.py"
    assert next_surface["observableResult"] == ["path", "up", "pole"]
    assert next_surface["observableResultSemanticsChanged"] is False
    assert next_surface["historicalTypedAstIsNormativeInput"] is False
    assert next_surface["sourceOffsetIsSemanticIdentity"] is False
    assert next_surface["runtimeHandleIsSemanticIdentity"] is False
    assert next_surface["pathIsSemanticIdentity"] is False
    assert next_surface["readOnly"] is True
    assert next_surface["materializes"] is False


def test_direct_deixis_old_owner_is_now_planned_for_atomic_c7_deletion() -> None:
    manifest = read(MANIFEST)
    decision = manifest["historicalDecisions"]["core/mtc_context_analysis.py"]

    assert decision["replacementLiveOwners"] == [
        "core/foundation_v2_direct_deixis.py"
    ]
    assert decision["deleteInC7"] is True
    assert "core/mtc_context_analysis.py" in manifest["c7DeletionSet"]

    unresolved = {
        path
        for path, item in manifest["historicalDecisions"].items()
        if not item["deleteInC7"]
    }
    assert unresolved == {"core/mtc_value_bundle.py"}


def test_current_v06_is_not_mutated_by_the_cutover_decision() -> None:
    contract = read(CONTRACT)
    conformance = read(CONFORMANCE)
    direct = contract["surfaces"]["directDeixis"]

    assert contract["schema"] == "mts-contract/v0.6"
    assert conformance["schema"] == "mts-conformance/v0.6"
    assert direct["schema"] == "mts-direct-deixis/v0.5"
    assert conformance["corpora"]["directDeixis"]["contract"] == direct["schema"]

    baseline = read(MANIFEST)["baseline"]
    assert baseline["foundationV2Accepted"] is False
    assert baseline["cutoverPerformed"] is False
    assert baseline["downstreamRepinAllowed"] is False


def test_decision_preserves_current_non_implication_and_identity_vetoes() -> None:
    decision = read(DECISION)

    assert decision["preservedBoundaries"] == {
        "groupingVisibleInPath": True,
        "positiveImpliesContextSensitivity": False,
        "emptyImpliesContextInvariance": False,
        "trustedProofRelationAdded": False,
        "sharingCreatesSecondSemanticSubtree": False,
    }
    assert decision["veto"] == {
        "compatibilityAstSemanticMode": False,
        "contextFrameToKAdapter": False,
        "contextSensitivityTheorem": False,
        "contextInvarianceTheorem": False,
        "queryMaterialization": False,
        "currentV06Mutation": False,
    }
