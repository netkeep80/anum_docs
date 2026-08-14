# -*- coding: utf-8 -*-
"""Repository architecture and current-release gate for the single rooted runtime."""
from __future__ import annotations

import ast
import json
import re
from pathlib import Path
from urllib.parse import unquote

from core.foundation_v2_root import build_root_kernel, root_role_refs, validate_root_kernel


ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT / "cutover/foundation-v2-cutover-candidate-v0.1.json"
CANDIDATE_CONTRACT = ROOT / "cutover/foundation-v2-cutover-contract-v0.1.json"
CANDIDATE_CONFORMANCE = ROOT / "cutover/foundation-v2-cutover-conformance-v0.1.json"
ACCEPTANCE = ROOT / "cutover/foundation-v2-c9-acceptance-v0.1.json"
PREVIOUS_CONTRACT = ROOT / "contracts/mts-contract-v0.6.json"
PREVIOUS_CONFORMANCE = ROOT / "contracts/mts-conformance-v0.6.json"
CURRENT_CONTRACT = ROOT / "contracts/mts-contract-v0.7.json"
CURRENT_CONFORMANCE = ROOT / "contracts/mts-conformance-v0.7.json"
ACTIVE_THEORY = {"Основания МТС.md", "Система аксиом МТС.md"}
ACTIVE_SPECS = {
    "Формальная нотация МТС.md",
    "Ачисла и сериализация.md",
    "Пучки значений МТС v0.2.md",
    "Апамять и управление сетью связей.md",
}
ACTIVE_MARKDOWN = (
    ROOT / "README.md",
    ROOT / "docs/CONTRIBUTING.md",
    *(ROOT / "docs/theory" / name for name in ACTIVE_THEORY),
    *(ROOT / "docs/specs" / name for name in ACTIVE_SPECS),
)
FORBIDDEN_DIRECTORIES = {"archive", "legacy", "old", "deprecated"}
DELETED_HISTORICAL_PATHS = {
    "core/mtc_ast.py",
    "core/mtc_context_analysis.py",
    "core/mtc_definitions.py",
    "core/mtc_interpreter.py",
    "core/mtc_opening_path.py",
    "core/mtc_parser.py",
    "core/mtc_value_bundle.py",
    "core/proof_checker.py",
    "core/root_library.py",
    "core/validate_root.py",
    "tests/test_context_pronouns.py",
    "tests/test_mtc_definitions.py",
    "tests/test_mtc_interpreter.py",
    "tests/test_mtc_parser.py",
    "tests/test_mtc_value_bundle_reference.py",
    "tests/test_mts_definition_opening_reference.py",
    "tests/test_mts_direct_deixis_reference.py",
    "tests/test_mts_opening_path_reference.py",
    "tests/test_mts_proof_v04.py",
    "tests/test_root_library.py",
}


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings(item)


def test_active_document_sets_are_exact() -> None:
    assert {path.name for path in (ROOT / "docs/theory").glob("*.md")} == ACTIVE_THEORY
    assert {path.name for path in (ROOT / "docs/specs").glob("*.md")} == ACTIVE_SPECS


def test_forbidden_archive_directories_do_not_exist() -> None:
    forbidden = [
        path.relative_to(ROOT)
        for path in ROOT.rglob("*")
        if path.is_dir() and path.name.lower() in FORBIDDEN_DIRECTORIES
    ]
    assert forbidden == []


def test_active_markdown_links_exist() -> None:
    missing: list[str] = []
    for document in ACTIVE_MARKDOWN:
        text = document.read_text(encoding="utf-8")
        for raw_target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", text):
            target = raw_target.strip().strip("<>").split("#", 1)[0]
            if not target or target.startswith(("http://", "https://", "mailto:")):
                continue
            if not (document.parent / unquote(target)).exists():
                missing.append(f"{document.relative_to(ROOT)} -> {target}")
    assert missing == []


def test_root_kernel_is_constructive_canonical_five_link_basis() -> None:
    kernel = build_root_kernel()
    validate_root_kernel(kernel)
    refs = root_role_refs(kernel)
    assert set(refs) == {"R", "O", "C", "L", "U"}
    assert len(kernel.network.refs) == 5
    assert kernel.network.root is refs["R"]
    assert kernel.network.find(refs["R"], refs["R"]) is refs["R"]
    assert kernel.network.find(refs["O"], refs["R"]) is refs["O"]
    assert kernel.network.find(refs["R"], refs["C"]) is refs["C"]
    assert kernel.network.find(refs["O"], refs["C"]) is refs["L"]
    assert kernel.network.find(refs["C"], refs["O"]) is refs["U"]


def test_cutover_candidate_uses_one_rooted_runtime_path() -> None:
    candidate = load(CANDIDATE)
    contract = load(CANDIDATE_CONTRACT)
    conformance = load(CANDIDATE_CONFORMANCE)
    assert candidate["schema"] == "foundation-v2-cutover-candidate/v0.1"
    assert contract["schema"] == "foundation-v2-cutover-contract/v0.1"
    assert conformance["schema"] == "foundation-v2-cutover-conformance/v0.1"
    assert contract["owners"] == candidate["owners"]
    assert set(contract["owners"].values()).isdisjoint(candidate["c7DeletionSet"])
    for owner in contract["owners"].values():
        assert (ROOT / owner).is_file(), owner


def test_previous_v06_release_is_frozen_data_not_candidate_owner_authority() -> None:
    candidate = load(CANDIDATE)
    previous = candidate["previousAcceptedRelease"]
    assert previous["contract"] == "contracts/mts-contract-v0.6.json"
    assert previous["conformance"] == "contracts/mts-conformance-v0.6.json"
    assert previous["immutable"] is True
    assert previous["isLiveOwnerManifestAfterC7"] is False
    assert load(PREVIOUS_CONTRACT)["schema"] == "mts-contract/v0.6"
    assert load(PREVIOUS_CONFORMANCE)["schema"] == "mts-conformance/v0.6"


def test_cutover_contract_preserves_identity_and_four_abit_transport() -> None:
    contract = load(CANDIDATE_CONTRACT)
    identity = contract["semanticIdentity"]
    transport = contract["transport"]
    effects = contract["effects"]
    assert identity["runtimeHandleIsSemanticIdentity"] is False
    assert identity["sourcePositionIsSemanticIdentity"] is False
    assert identity["pathIsSemanticIdentity"] is False
    assert identity["samePairCreatesSecondSemanticLink"] is False
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


def test_candidate_remains_nonaccepted_historical_cutover_evidence() -> None:
    candidate = load(CANDIDATE)
    contract = load(CANDIDATE_CONTRACT)
    conformance = load(CANDIDATE_CONFORMANCE)
    assert candidate["accepted"] is False
    assert candidate["cutoverPerformed"] is False
    assert candidate["downstreamRepinAllowed"] is False
    assert contract["accepted"] is False
    assert contract["acceptedMtsVersion"] is None
    assert conformance["accepted"] is False
    assert conformance["acceptance"]["performedHere"] is False
    assert conformance["acceptance"]["downstreamRepinAllowed"] is False


def test_c9_acceptance_selects_exactly_mts_v07_as_current() -> None:
    acceptance = load(ACCEPTANCE)
    assert acceptance["schema"] == "foundation-v2-c9-acceptance/v0.1"
    assert acceptance["issue"] == 403
    assert acceptance["decision"] == "ACCEPT_MTS_V0_7"
    assert acceptance["versionDecision"]["previousAcceptedVersion"] == "mts-contract/v0.6"
    assert acceptance["versionDecision"]["acceptedVersion"] == "mts-contract/v0.7"
    assert set(acceptance["current"]) == {"contract", "conformance", "publicFacade"}
    assert acceptance["current"]["publicFacade"] == "core/foundation_v2.py"
    assert acceptance["acceptance"] == {
        "foundationV2Accepted": True,
        "cutoverPerformed": True,
        "downstreamRepinAllowed": True,
        "singleLiveSemanticRuntime": True,
        "historicalRuntimeSelectable": False,
        "compatibilityRuntimeAllowed": False,
    }


def test_v07_release_metadata_matches_accepted_semantic_version() -> None:
    contract = load(CURRENT_CONTRACT)
    conformance = load(CURRENT_CONFORMANCE)
    assert contract["schema"] == "mts-contract/v0.7"
    assert contract["acceptedMtsVersion"] == contract["schema"]
    assert contract["currentPointer"] == "cutover/foundation-v2-c9-acceptance-v0.1.json"
    assert conformance["schema"] == "mts-conformance/v0.7"
    assert conformance["acceptance"]["acceptedMtsVersion"] == contract["schema"]
    assert conformance["acceptance"]["foundationV2Accepted"] is True
    assert conformance["acceptance"]["downstreamRepinAllowed"] is True


def test_v07_owners_exclude_deleted_historical_runtime_files() -> None:
    contract = load(CURRENT_CONTRACT)
    for role, path in contract["owners"].items():
        assert path not in DELETED_HISTORICAL_PATHS, (role, path)
    live_strings = set(strings(contract)) | set(strings(load(CURRENT_CONFORMANCE)))
    assert not (DELETED_HISTORICAL_PATHS & live_strings)
    for path in DELETED_HISTORICAL_PATHS:
        assert not (ROOT / path).exists(), path


def test_v07_preserves_rooted_identity_and_read_only_vetoes() -> None:
    contract = load(CURRENT_CONTRACT)
    identity = contract["semanticIdentity"]
    effects = contract["effects"]
    assert identity["linkIdentity"] == "by ordered semantic poles"
    assert identity["runtimeHandleIsSemanticIdentity"] is False
    assert identity["sourcePositionIsSemanticIdentity"] is False
    assert identity["pathIsSemanticIdentity"] is False
    assert identity["samePairCreatesSecondSemanticLink"] is False
    assert identity["secondFullySelfClosedRootAllowed"] is False
    assert effects == {
        "findEqualsMaterialize": False,
        "notFoundImpliesNonExistence": False,
        "readMayMaterialize": False,
        "replayMayMaterialize": False,
        "explicitMaterializationMustReuseSamePair": True,
    }


def test_v07_versioned_leaf_boundaries_match_completed_p3_decisions() -> None:
    contract = load(CURRENT_CONTRACT)
    conformance = load(CURRENT_CONFORMANCE)
    assert contract["surfaces"]["directDeixis"]["schema"] == "mts-direct-deixis/v0.6"
    assert contract["surfaces"]["directDeixis"]["observableResultSemanticsChangedFromV05"] is False
    assert contract["surfaces"]["valueBundle"]["schema"] == "mts-value-bundle/v0.3"
    assert contract["surfaces"]["valueBundle"]["observableResultSemanticsChangedFromV02"] is False
    assert contract["surfaces"]["anum"]["schema"] == "anum-deserialization/v0.4"
    assert conformance["versionedSurfaces"] == {
        "anum": "anum-deserialization/v0.4",
        "directDeixis": "mts-direct-deixis/v0.6",
        "valueBundle": "mts-value-bundle/v0.3",
    }


def test_v07_requires_the_green_c8_integrated_gate() -> None:
    conformance = load(CURRENT_CONFORMANCE)
    assert "tests/test_foundation_v2_c8_integrated.py" in conformance["requiredExecutableGates"]
    assert "tests/test_repository_contract.py" in conformance["requiredExecutableGates"]
    assert conformance["c7"] == {
        "performed": True,
        "historicalRuntimePresent": False,
        "externalHistoricalConsumers": 0,
    }
    assert conformance["c8"] == {
        "performed": True,
        "integratedGate": "tests/test_foundation_v2_c8_integrated.py",
        "integratedPathPassed": True,
        "requiredNegativeVectorsPassed": True,
        "compatibilityRuntimeUsed": False,
    }


def test_v06_remains_previous_release_evidence_not_current_pointer() -> None:
    previous_contract = load(PREVIOUS_CONTRACT)
    previous_conformance = load(PREVIOUS_CONFORMANCE)
    acceptance = load(ACCEPTANCE)
    assert previous_contract["schema"] == "mts-contract/v0.6"
    assert previous_conformance["schema"] == "mts-conformance/v0.6"
    assert acceptance["previousReleaseEvidence"]["immutable"] is True
    assert acceptance["previousReleaseEvidence"]["liveRuntimeSelectable"] is False


def test_contract_directory_contains_exactly_previous_and_current_release_pairs() -> None:
    assert {path.name for path in (ROOT / "contracts").glob("*.json")} == {
        "mts-contract-v0.6.json",
        "mts-conformance-v0.6.json",
        "mts-contract-v0.7.json",
        "mts-conformance-v0.7.json",
    }


def test_public_facade_and_contributing_point_to_accepted_v07() -> None:
    source = (ROOT / "core/foundation_v2.py").read_text(encoding="utf-8")
    docstring = ast.get_docstring(ast.parse(source)) or ""
    assert "accepted MTS v0.7" in docstring
    assert "candidate" not in docstring.lower()
    contributing = (ROOT / "docs/CONTRIBUTING.md").read_text(encoding="utf-8")
    assert "mts-contract/v0.7" in contributing
    assert "mts-conformance/v0.7" in contributing
    assert "текущей принятой версии" in contributing
