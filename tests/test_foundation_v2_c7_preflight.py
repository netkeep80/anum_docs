from __future__ import annotations

import ast
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MATRIX = ROOT / "cutover/foundation-v2-c7-consumer-matrix-v0.1.json"
CLASSIFICATION = ROOT / "cutover/foundation-v2-import-classification-v0.1.json"
DISPOSITION = ROOT / "cutover/foundation-v2-consumer-disposition-v0.1.json"
SCAN_DIRS = (ROOT / "core", ROOT / "converters", ROOT / "tests")
MACHINE_FILES = (ROOT / "contracts/mts-contract-v0.6.json", ROOT / "contracts/mts-conformance-v0.6.json")
ALLOWED_ACTIONS = {"MIGRATE_TO_FOUNDATION_V2", "DELETE_WITH_OWNER", "NON_SEMANTIC_TOOLING", "HISTORICAL_REPLAY_ONLY"}
RESOLVED_ACTIONS = {"MIGRATE_TO_FOUNDATION_V2", "HISTORICAL_REPLAY_ONLY"}


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def historical_paths() -> set[str]:
    return set(read(CLASSIFICATION)["historicalDecisions"])


def historical_modules() -> dict[str, str]:
    return {path.removesuffix(".py").replace("/", "."): path for path in historical_paths()}


def resolve_imports(path: Path) -> set[str]:
    modules = historical_modules()
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    found: set[str] = set()
    relative_package = list(path.relative_to(ROOT).with_suffix("").parts[:-1])
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                owner = modules.get(alias.name)
                if owner:
                    found.add(owner)
            continue
        if not isinstance(node, ast.ImportFrom):
            continue
        if node.level:
            keep = len(relative_package) - (node.level - 1)
            if keep < 0:
                continue
            base = relative_package[:keep]
        else:
            base = []
        imported = ".".join(base + node.module.split(".")) if node.module else ".".join(base)
        owner = modules.get(imported)
        if owner:
            found.add(owner)
    return found


def discover_python_consumers() -> dict[str, list[str]]:
    historical = historical_paths()
    discovered: dict[str, list[str]] = {}
    for directory in SCAN_DIRS:
        for path in sorted(directory.glob("*.py")):
            relative = path.relative_to(ROOT).as_posix()
            if relative in historical:
                continue
            imports = sorted(resolve_imports(path))
            if imports:
                discovered[relative] = imports
    return discovered


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings(item)


def discover_machine_consumers(python_consumers: dict[str, list[str]]) -> dict[str, dict[str, list[str]]]:
    historical = historical_paths()
    result = {}
    for path in MACHINE_FILES:
        values = set(strings(read(path)))
        owner_refs = sorted(historical & values)
        test_refs = sorted(consumer for consumer in python_consumers if consumer in values)
        if owner_refs or test_refs:
            result[path.relative_to(ROOT).as_posix()] = {"historicalOwnerPaths": owner_refs, "historicalConsumerTests": test_refs}
    return result


def test_matrix_exactly_classifies_every_current_historical_consumer() -> None:
    matrix = read(MATRIX)
    discovered_python = discover_python_consumers()
    discovered_machine = discover_machine_consumers(discovered_python)
    assert matrix["schema"] == "foundation-v2-c7-consumer-matrix/v0.1"
    assert matrix["issue"] == 395
    assert matrix["historicalDeletionSet"] == sorted(historical_paths())
    assert matrix["pythonConsumers"] == discovered_python == {}
    actual_machine = matrix["machineConsumers"]
    assert set(actual_machine) == set(discovered_machine)
    for consumer, refs in discovered_machine.items():
        entry = actual_machine[consumer]
        assert entry["historicalOwnerPaths"] == refs["historicalOwnerPaths"], consumer
        assert entry["historicalConsumerTests"] == refs["historicalConsumerTests"], consumer
        assert entry["classification"] == "MIGRATE_TO_FOUNDATION_V2", consumer
        assert entry["cutoverAction"].strip(), consumer


def test_deleted_consumers_and_owners_are_physically_absent_after_c7() -> None:
    matrix = read(MATRIX)
    disposition = read(DISPOSITION)
    assert set(matrix["deletedPythonConsumers"]) == set(disposition["deletedConsumers"])
    assert len(matrix["deletedPythonConsumers"]) == 10
    for path in matrix["deletedPythonConsumers"]:
        assert not (ROOT / path).exists(), path
    for path in matrix["historicalDeletionSet"]:
        assert not (ROOT / path).exists(), path


def test_resolved_consumers_exist_and_no_longer_import_historical_owners() -> None:
    matrix = read(MATRIX)["resolvedPythonConsumers"]
    disposition = read(DISPOSITION)["resolvedConsumers"]
    assert set(matrix) == set(disposition)
    for consumer, entry in matrix.items():
        path = ROOT / consumer
        assert path.is_file(), consumer
        assert resolve_imports(path) == set(), consumer
        assert entry["classification"] in RESOLVED_ACTIONS, consumer
        assert entry["currentHistoricalImports"] is False, consumer
        assert isinstance(entry["resolvedByIssue"], int) and entry["resolvedByIssue"] > 0, consumer
        assert entry["cutoverAction"].strip(), consumer
        c1 = disposition[consumer]
        assert c1["disposition"] == entry["classification"], consumer
        assert c1["currentHistoricalImports"] is False, consumer
        assert c1["resolvedByIssue"] == entry["resolvedByIssue"], consumer
        assert c1["reason"].strip(), consumer
        if entry["classification"] == "MIGRATE_TO_FOUNDATION_V2":
            assert entry["target"] == c1["target"], consumer
            assert (ROOT / entry["target"]).is_file(), consumer
        else:
            assert "target" not in entry and "target" not in c1, consumer
        if "resolvedByPullRequest" in entry or "resolvedByPullRequest" in c1:
            assert entry["resolvedByPullRequest"] == c1["resolvedByPullRequest"], consumer


def test_post_c7_consumer_sets_are_closed() -> None:
    matrix = read(MATRIX)
    disposition = read(DISPOSITION)
    assert matrix["pythonConsumers"] == {}
    assert disposition["externalDirectConsumers"] == {}
    assert len(matrix["resolvedPythonConsumers"]) == 4
    assert set(matrix["resolvedPythonConsumers"]) == set(disposition["resolvedConsumers"])
    assert disposition["c7Performed"] is True


def test_v06_is_resolved_as_data_only_historical_replay() -> None:
    matrix = read(MATRIX)["resolvedPythonConsumers"]["tests/test_mts_contract_v06.py"]
    disposition = read(DISPOSITION)["resolvedConsumers"]["tests/test_mts_contract_v06.py"]
    assert matrix["classification"] == "HISTORICAL_REPLAY_ONLY"
    assert disposition["disposition"] == "HISTORICAL_REPLAY_ONLY"
    assert matrix["currentHistoricalImports"] is False
    assert disposition["currentHistoricalImports"] is False


def test_preflight_records_c7_without_claiming_c9_acceptance() -> None:
    assert read(MATRIX)["baseline"] == {
        "mainCommit": "af01e7477e9cb3e573461e9cfce41eca5bcae62f",
        "currentMtsContract": "mts-contract/v0.6",
        "foundationV2Accepted": False,
        "cutoverPerformed": True,
        "downstreamRepinAllowed": False,
    }


def test_final_cutover_is_one_merge_without_compatibility_runtime() -> None:
    assert read(MATRIX)["finalCutover"] == {
        "singleMergeRequired": True,
        "stages": ["C7", "C8", "C9"],
        "unknownConsumersAllowed": False,
        "compatibilityRuntimeAllowed": False,
        "oldAcceptedContractMayReferenceDeletedFiles": False,
    }
