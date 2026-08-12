from __future__ import annotations

import ast
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DECISION = ROOT / "cutover/direct-deixis-rooted-migration-decision-v0.1.json"
MANIFEST = ROOT / "cutover/foundation-v2-import-classification-v0.1.json"
DISPOSITION = ROOT / "cutover/foundation-v2-consumer-disposition-v0.1.json"
CONTRACT = ROOT / "contracts/mts-contract-v0.6.json"
CONFORMANCE = ROOT / "contracts/mts-conformance-v0.6.json"
CANDIDATE = ROOT / "cutover/foundation-v2-cutover-candidate-v0.1.json"
CANDIDATE_CONTRACT = ROOT / "cutover/foundation-v2-cutover-contract-v0.1.json"
CANDIDATE_CONFORMANCE = ROOT / "cutover/foundation-v2-cutover-conformance-v0.1.json"
CONSUMER_MATRIX = ROOT / "cutover/foundation-v2-c7-consumer-matrix-v0.1.json"


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
    assert "core/mtc_context_analysis.py" not in unresolved


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


def _historical_module_names() -> set[str]:
    return {
        path.removesuffix(".py").replace("/", ".")
        for path in read(DISPOSITION)["historicalOwners"]
    }


def _imports_historical(path: Path, historical: set[str]) -> bool:
    source = path.relative_to(ROOT).as_posix()
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=source)
    package = list(path.relative_to(ROOT).with_suffix("").parts[:-1])

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            if any(alias.name in historical for alias in node.names):
                return True
            continue
        if not isinstance(node, ast.ImportFrom):
            continue

        if node.level:
            keep = len(package) - (node.level - 1)
            if keep < 0:
                continue
            parts = package[:keep]
            if node.module:
                parts += node.module.split(".")
            module = ".".join(parts)
        else:
            module = node.module or ""

        if module in historical:
            return True
        if module == "core" and any(f"core.{alias.name}" in historical for alias in node.names):
            return True
    return False


def _external_direct_historical_consumers() -> set[str]:
    disposition = read(DISPOSITION)
    historical_paths = set(disposition["historicalOwners"])
    historical_modules = _historical_module_names()
    roots = (ROOT / "core", ROOT / "converters", ROOT / "tests")
    result: set[str] = set()

    for directory in roots:
        for path in directory.glob("*.py"):
            relative = path.relative_to(ROOT).as_posix()
            if relative in historical_paths:
                continue
            if _imports_historical(path, historical_modules):
                result.add(relative)
    return result


def test_c1_consumer_disposition_is_exact_for_all_external_direct_importers() -> None:
    disposition = read(DISPOSITION)

    assert disposition["schema"] == "foundation-v2-consumer-disposition/v0.1"
    assert disposition["issue"] == 394
    assert disposition["parentIssue"] == 271
    assert disposition["historicalOwners"] == read(MANIFEST)["c7DeletionSet"]
    assert set(disposition["externalDirectConsumers"]) == _external_direct_historical_consumers()


def test_c1_dispositions_are_closed_and_migration_targets_exist() -> None:
    disposition = read(DISPOSITION)
    allowed = set(disposition["allowedDispositions"])
    assert allowed == {
        "DELETE_WITH_OWNER",
        "MIGRATE_TO_FOUNDATION_V2",
        "HISTORICAL_REPLAY_ONLY",
        "NON_SEMANTIC_TOOLING",
    }

    for path, item in disposition["externalDirectConsumers"].items():
        assert (ROOT / path).is_file(), path
        assert item["disposition"] in allowed, path
        assert item["reason"].strip(), path
        if item["disposition"] == "MIGRATE_TO_FOUNDATION_V2":
            assert (ROOT / item["target"]).is_file(), path


def test_c1_freezes_no_legacy_runtime_after_atomic_c7() -> None:
    rule = read(DISPOSITION)["c7Rule"]
    assert rule == {
        "noExternalDirectHistoricalImportsAfterMigration": True,
        "unknownConsumerAllowed": False,
        "compatibilityFacadeAllowed": False,
        "historicalRuntimeSelectableAfterC7": False,
        "frozenV06MayImportDeletedRuntime": False,
    }


def test_candidate_artifacts_are_non_authoritative_cutover_evidence() -> None:
    assert CANDIDATE_CONTRACT.parent == ROOT / "cutover"
    assert CANDIDATE_CONFORMANCE.parent == ROOT / "cutover"
    assert {path.name for path in (ROOT / "contracts").glob("*.json")} == {
        "mts-contract-v0.6.json",
        "mts-conformance-v0.6.json",
    }


def test_candidate_contract_is_nonaccepted_and_uses_only_frozen_candidate_owners() -> None:
    candidate = read(CANDIDATE)
    contract = read(CANDIDATE_CONTRACT)

    assert contract["schema"] == "foundation-v2-cutover-contract/v0.1"
    assert contract["status"] == "candidate"
    assert contract["accepted"] is False
    assert contract["acceptedMtsVersion"] is None
    assert contract["owners"] == candidate["owners"]
    assert contract["consumerMatrix"] == candidate["candidateBoundary"]["consumerMatrix"]
    assert set(contract["owners"].values()).isdisjoint(candidate["c7DeletionSet"])
    for owner in contract["owners"].values():
        assert (ROOT / owner).is_file(), owner

    cutover = contract["cutover"]
    assert cutover["foundationV2Accepted"] is False
    assert cutover["cutoverPerformed"] is False
    assert cutover["downstreamRepinAllowed"] is False
    assert cutover["historicalRuntimeSelectableAfterC7"] is False
    assert cutover["compatibilityOccurrenceMode"] is False


def test_candidate_contract_freezes_identity_transport_and_read_only_boundaries() -> None:
    contract = read(CANDIDATE_CONTRACT)

    assert contract["semanticIdentity"]["runtimeHandleIsSemanticIdentity"] is False
    assert contract["semanticIdentity"]["sourcePositionIsSemanticIdentity"] is False
    assert contract["semanticIdentity"]["pathIsSemanticIdentity"] is False
    assert contract["semanticIdentity"]["samePairCreatesSecondSemanticLink"] is False
    assert contract["semanticIdentity"]["secondFullySelfClosedRootAllowed"] is False

    assert contract["transport"]["abits"] == ["[", "]", "1", "0"]
    assert contract["transport"]["exactlyFour"] is True
    assert contract["transport"]["rootIsFifthAbit"] is False
    assert contract["transport"]["emptyStream"] == "R"
    assert contract["transport"]["emptyGroup"] == "R"
    assert contract["transport"]["rawAndExistingCarrierShareOneStackMachine"] is True
    assert contract["transport"]["existingCarrierReadOnly"] is True

    assert contract["effects"] == {
        "findEqualsMaterialize": False,
        "notFoundImpliesNonExistence": False,
        "readMayMaterialize": False,
        "replayMayMaterialize": False,
        "explicitMaterializationMustReuseSamePair": True,
    }


def test_candidate_conformance_points_only_to_existing_executable_gates() -> None:
    candidate = read(CANDIDATE)
    contract = read(CANDIDATE_CONTRACT)
    conformance = read(CANDIDATE_CONFORMANCE)

    assert conformance["schema"] == "foundation-v2-cutover-conformance/v0.1"
    assert conformance["status"] == "candidate"
    assert conformance["accepted"] is False
    assert conformance["contract"] == candidate["candidateBoundary"]["contract"]
    assert contract["conformance"] == candidate["candidateBoundary"]["conformance"]
    assert conformance["integratedPath"] == candidate["c8IntegratedPath"]
    assert conformance["requiredNegativeVectors"] == candidate["requiredNegativeVectors"]
    assert conformance["migrationPrerequisite"]["consumerMatrix"] == str(
        CONSUMER_MATRIX.relative_to(ROOT)
    )

    assert len(conformance["requiredExecutableGates"]) == len(
        set(conformance["requiredExecutableGates"])
    )
    for gate in conformance["requiredExecutableGates"]:
        assert gate.startswith("tests/") and gate.endswith(".py"), gate
        assert (ROOT / gate).is_file(), gate

    assert conformance["acceptance"] == {
        "performedHere": False,
        "acceptedMtsVersionAssignedHere": False,
        "downstreamRepinAllowed": False,
        "requiresSeparateC9": True,
    }
