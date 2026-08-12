from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DECISION = ROOT / "cutover/value-bundle-rooted-migration-decision-v0.1.json"
MANIFEST = ROOT / "cutover/foundation-v2-import-classification-v0.1.json"
CONTRACT = ROOT / "contracts/mts-contract-v0.6.json"
CONFORMANCE = ROOT / "contracts/mts-conformance-v0.6.json"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_p3b_decision_preserves_value_bundle_by_rooted_migration() -> None:
    decision = read(DECISION)

    assert decision["schema"] == "value-bundle-rooted-migration-decision/v0.1"
    assert decision["issue"] == 391
    assert decision["parentIssue"] == 382
    assert decision["decision"] == "PRESERVE_BY_ROOTED_MIGRATION"
    assert decision["evidence"] == {
        "challengeIssue": 387,
        "pullRequest": 389,
        "mergeCommit": "775078f95995b1de6157ace10a033b36af496ab3",
        "executableCorpusGate": "tests/test_mts_foundation_v2_value_bundle.py",
    }


def test_next_surface_changes_input_authority_not_observable_v02_semantics() -> None:
    next_surface = read(DECISION)["next"]

    assert next_surface["surfaceCandidate"] == "mts-value-bundle/v0.3"
    assert next_surface["referenceCore"] == "core/foundation_v2_value_bundle.py"
    assert next_surface["observableStaticRolesChanged"] is False
    assert next_surface["observableStaticErrorCodesChanged"] is False
    assert next_surface["observableValueEqualityChanged"] is False
    assert next_surface["observableExpansionChanged"] is False
    assert next_surface["historicalTypedAstIsNormativeInput"] is False
    assert next_surface["sourceOffsetIsSemanticIdentity"] is False
    assert next_surface["runtimeHandleIsSemanticIdentity"] is False
    assert next_surface["occurrencePathIsSemanticIdentity"] is False
    assert next_surface["occurrenceResolutionBeforeDedup"] is True
    assert next_surface["singletonBundleCoercion"] is False
    assert (
        next_surface["expansionSearchOwner"]
        == "core/foundation_v2_materialization.py:find_links"
    )
    assert next_surface["readOnly"] is True
    assert next_surface["materializesMissingPairs"] is False


def test_value_bundle_old_owner_is_now_planned_for_atomic_c7_deletion() -> None:
    manifest = read(MANIFEST)
    decision = manifest["historicalDecisions"]["core/mtc_value_bundle.py"]

    assert decision["replacementLiveOwners"] == [
        "core/foundation_v2_value_bundle.py"
    ]
    assert decision["deleteInC7"] is True
    assert "core/mtc_value_bundle.py" in manifest["c7DeletionSet"]

    unresolved = {
        path
        for path, item in manifest["historicalDecisions"].items()
        if not item["deleteInC7"]
    }
    assert unresolved == set()


def test_current_v06_and_value_bundle_v02_are_not_mutated_by_the_decision() -> None:
    contract = read(CONTRACT)
    conformance = read(CONFORMANCE)
    value_bundle = contract["surfaces"]["valueBundle"]

    assert contract["schema"] == "mts-contract/v0.6"
    assert conformance["schema"] == "mts-conformance/v0.6"
    assert value_bundle["schema"] == "mts-value-bundle/v0.2"
    assert (
        value_bundle["productionIntegration"]["referenceCore"]
        == "core/mtc_value_bundle.py"
    )
    assert conformance["corpora"]["valueBundle"]["contract"] == value_bundle["schema"]

    baseline = read(MANIFEST)["baseline"]
    assert baseline["foundationV2Accepted"] is False
    assert baseline["cutoverPerformed"] is False
    assert baseline["downstreamRepinAllowed"] is False


def test_decision_preserves_value_bundle_v02_veto_boundaries() -> None:
    decision = read(DECISION)

    assert decision["preservedBoundaries"] == {
        "nestedValueBundleAccepted": False,
        "bundleValuedDefinitionAccepted": False,
        "scalarOperatorLiftingAccepted": False,
        "emptyBundleWildcardOnlyInExpansionEndpoint": True,
        "missingPairOmitted": True,
        "interpretMayRealize": False,
        "interpretMayDelete": False,
        "globalRewrite": False,
    }
    assert decision["veto"] == {
        "compatibilityAstSemanticMode": False,
        "valueBundleEqualsSequenceGroup": False,
        "implicitWrites": False,
        "dedupBeforeOccurrenceResolution": False,
        "singletonBundleCoercion": False,
        "technicalIdentitySemantics": False,
        "currentV06Mutation": False,
    }
