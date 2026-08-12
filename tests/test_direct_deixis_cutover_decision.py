from __future__ import annotations

import ast
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DECISION = ROOT / "cutover/direct-deixis-rooted-migration-decision-v0.1.json"
MANIFEST = ROOT / "cutover/foundation-v2-import-classification-v0.1.json"
DISPOSITION = ROOT / "cutover/foundation-v2-consumer-disposition-v0.1.json"
CANDIDATE = ROOT / "cutover/foundation-v2-cutover-candidate-v0.1.json"
CANDIDATE_CONTRACT = ROOT / "cutover/foundation-v2-cutover-contract-v0.1.json"
CANDIDATE_CONFORMANCE = ROOT / "cutover/foundation-v2-cutover-conformance-v0.1.json"
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
    assert next_surface["input"] == "explicit rooted NODE/OPAQUE/PRONOUN skeleton carrier"
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
    assert decision["replacementLiveOwners"] == ["core/foundation_v2_direct_deixis.py"]
    assert decision["deleteInC7"] is True
    assert "core/mtc_context_analysis.py" in manifest["c7DeletionSet"]
    unresolved = {path for path, item in manifest["historicalDecisions"].items() if not item["deleteInC7"]}
    assert "core/mtc_context_analysis.py" not in unresolved


def test_current_v06_is_immutable_previous_release_after_c7() -> None:
    contract = read(CONTRACT)
    conformance = read(CONFORMANCE)
    direct = contract["surfaces"]["directDeixis"]
    assert contract["schema"] == "mts-contract/v0.6"
    assert contract["accepted"] is True
    assert conformance["schema"] == "mts-conformance/v0.6"
    assert conformance["accepted"] is True
    assert direct["schema"] == "mts-direct-deixis/v0.5"
    assert conformance["corpora"]["directDeixis"]["contract"] == direct["schema"]
    baseline = read(MANIFEST)["baseline"]
    assert baseline["foundationV2Accepted"] is False
    assert baseline["cutoverPerformed"] is True
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
    return {path.removesuffix(".py").replace("/", ".") for path in read(DISPOSITION)["historicalOwners"]}


def _imports_historical(path: Path, historical_modules: set[str]) -> bool:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    package = list(path.relative_to(ROOT).with_suffix("").parts[:-1])
    for node in ast.walk(tree):
        imported: str | None = None
        if isinstance(node, ast.Import):
            if any(alias.name in historical_modules for alias in node.names):
                return True
            continue
        if not isinstance(node, ast.ImportFrom):
            continue
        if node.level:
            keep = len(package) - (node.level - 1)
            if keep < 0:
                continue
            base = package[:keep]
        else:
            base = []
        imported = ".".join(base + node.module.split(".")) if node.module else ".".join(base)
        if imported in historical_modules:
            return True
    return False


def _external_direct_historical_consumers() -> set[str]:
    disposition = read(DISPOSITION)
    historical_paths = set(disposition["historicalOwners"])
    historical_modules = _historical_module_names()
    result: set[str] = set()
    for directory in (ROOT / "core", ROOT / "converters", ROOT / "tests"):
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
    assert allowed == {"DELETE_WITH_OWNER", "MIGRATE_TO_FOUNDATION_V2", "HISTORICAL_REPLAY_ONLY", "NON_SEMANTIC_TOOLING"}
    for path, item in disposition["externalDirectConsumers"].items():
        assert (ROOT / path).is_file(), path
        assert item["disposition"] in allowed, path
        assert item["reason"].strip(), path
        if item["disposition"] == "MIGRATE_TO_FOUNDATION_V2":
            assert (ROOT / item["target"]).is_file(), path


def test_c1_freezes_no_legacy_runtime_after_atomic_c7() -> None:
    assert read(DISPOSITION)["c7Rule"] == {
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
        "mts-contract-v0.7.json",
        "mts-conformance-v0.7.json",
    }


def test_candidate_contract_is_nonaccepted_and_uses_only_frozen_candidate_owners() -> None:
    candidate = read(CANDIDATE)
    contract = read(CANDIDATE_CONTRACT)
    assert contract["schema"] == "foundation-v2-cutover-contract/v0.1"
    assert contract["status"] == "candidate"
    assert contract["accepted"] is False
    assert contract["acceptedMtsVersion"] is None
    assert contract["owners"] == candidate["owners"]
    assert set(contract["owners"].values()).isdisjoint(candidate["c7DeletionSet"])
    for path in contract["owners"].values():
        assert (ROOT / path).is_file(), path


def test_candidate_contract_freezes_identity_transport_and_read_only_boundaries() -> None:
    contract = read(CANDIDATE_CONTRACT)
    identity = contract["semanticIdentity"]
    transport = contract["transport"]
    effects = contract["effects"]
    assert identity["linkIdentity"] == "by ordered semantic poles"
    assert identity["runtimeHandleIsSemanticIdentity"] is False
    assert identity["sourcePositionIsSemanticIdentity"] is False
    assert identity["pathIsSemanticIdentity"] is False
    assert identity["samePairCreatesSecondSemanticLink"] is False
    assert identity["root"] == "R = R ⟼ R"
    assert identity["secondFullySelfClosedRootAllowed"] is False
    assert transport["abits"] == ["[", "]", "1", "0"]
    assert transport["exactlyFour"] is True
    assert transport["rootIsFifthAbit"] is False
    assert transport["emptyStream"] == "R"
    assert transport["emptyGroup"] == "R"
    assert transport["rawAndExistingCarrierShareOneStackMachine"] is True
    assert effects["findEqualsMaterialize"] is False
    assert effects["notFoundImpliesNonExistence"] is False
    assert effects["readMayMaterialize"] is False
    assert effects["replayMayMaterialize"] is False


def test_candidate_conformance_points_only_to_existing_executable_gates() -> None:
    conformance = read(CANDIDATE_CONFORMANCE)
    assert conformance["schema"] == "foundation-v2-cutover-conformance/v0.1"
    assert conformance["accepted"] is False
    assert conformance["acceptance"]["performedHere"] is False
    assert conformance["acceptance"]["downstreamRepinAllowed"] is False
    for path in conformance["requiredExecutableGates"]:
        assert (ROOT / path).is_file(), path
