from __future__ import annotations

import ast
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MATRIX = ROOT / "cutover/foundation-v2-c7-consumer-matrix-v0.1.json"
CLASSIFICATION = ROOT / "cutover/foundation-v2-import-classification-v0.1.json"
DISPOSITION = ROOT / "cutover/foundation-v2-consumer-disposition-v0.1.json"
SCAN_DIRS = (ROOT / "core", ROOT / "converters", ROOT / "tests")
MACHINE_FILES = (
    ROOT / "contracts/mts-contract-v0.6.json",
    ROOT / "contracts/mts-conformance-v0.6.json",
)
ALLOWED_ACTIONS = {
    "MIGRATE_TO_FOUNDATION_V2",
    "DELETE_WITH_OWNER",
    "NON_SEMANTIC_TOOLING",
    "HISTORICAL_REPLAY_ONLY",
}


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def historical_paths() -> set[str]:
    return set(read(CLASSIFICATION)["historicalDecisions"])


def historical_modules() -> dict[str, str]:
    return {
        path.removesuffix(".py").replace("/", "."): path
        for path in historical_paths()
    }


def resolve_imports(path: Path) -> set[str]:
    modules = historical_modules()
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    found: set[str] = set()
    relative_package = list(path.relative_to(ROOT).with_suffix("").parts[:-1])

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                for module, owner in modules.items():
                    if alias.name == module:
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
        if node.module:
            imported = ".".join(base + node.module.split("."))
        else:
            imported = ".".join(base)
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


def discover_machine_consumers(
    python_consumers: dict[str, list[str]],
) -> dict[str, dict[str, list[str]]]:
    historical = historical_paths()
    result = {}
    for path in MACHINE_FILES:
        values = set(strings(read(path)))
        owner_refs = sorted(historical & values)
        test_refs = sorted(
            consumer
            for consumer in python_consumers
            if consumer in values
        )
        if owner_refs or test_refs:
            result[path.relative_to(ROOT).as_posix()] = {
                "historicalOwnerPaths": owner_refs,
                "historicalConsumerTests": test_refs,
            }
    return result


def test_matrix_exactly_classifies_every_current_historical_consumer() -> None:
    matrix = read(MATRIX)
    discovered_python = discover_python_consumers()
    discovered_machine = discover_machine_consumers(discovered_python)

    assert matrix["schema"] == "foundation-v2-c7-consumer-matrix/v0.1"
    assert matrix["issue"] == 395
    assert matrix["historicalDeletionSet"] == sorted(historical_paths())

    actual_python = matrix["pythonConsumers"]
    assert set(actual_python) == set(discovered_python), (
        "python consumer matrix mismatch\n"
        f"missing={json.dumps(sorted(set(discovered_python) - set(actual_python)), ensure_ascii=False)}\n"
        f"extra={json.dumps(sorted(set(actual_python) - set(discovered_python)), ensure_ascii=False)}\n"
        f"discovered={json.dumps(discovered_python, ensure_ascii=False, sort_keys=True)}"
    )
    for consumer, owners in discovered_python.items():
        entry = actual_python[consumer]
        assert entry["historicalOwners"] == owners, consumer
        assert entry["classification"] in ALLOWED_ACTIONS, consumer
        assert entry["classification"] != "UNKNOWN", consumer
        assert entry["cutoverAction"].strip(), consumer

    actual_machine = matrix["machineConsumers"]
    assert set(actual_machine) == set(discovered_machine), (
        "machine consumer matrix mismatch\n"
        f"missing={json.dumps(sorted(set(discovered_machine) - set(actual_machine)), ensure_ascii=False)}\n"
        f"extra={json.dumps(sorted(set(actual_machine) - set(discovered_machine)), ensure_ascii=False)}\n"
        f"discovered={json.dumps(discovered_machine, ensure_ascii=False, sort_keys=True)}"
    )
    for consumer, refs in discovered_machine.items():
        entry = actual_machine[consumer]
        assert entry["historicalOwnerPaths"] == refs["historicalOwnerPaths"], consumer
        assert entry["historicalConsumerTests"] == refs["historicalConsumerTests"], consumer
        assert entry["classification"] == "MIGRATE_TO_FOUNDATION_V2", consumer
        assert entry["cutoverAction"].strip(), consumer


def test_python_classifications_refine_but_never_contradict_c1_disposition() -> None:
    matrix = read(MATRIX)["pythonConsumers"]
    c1 = read(DISPOSITION)["externalDirectConsumers"]

    assert set(matrix) == set(c1)
    for consumer, item in matrix.items():
        assert item["classification"] == c1[consumer]["disposition"], consumer


def test_preflight_does_not_claim_cutover_or_acceptance() -> None:
    baseline = read(MATRIX)["baseline"]
    assert baseline == {
        "mainCommit": "449ebdfb1d4276ebfba3e2dccc2897de62eb2577",
        "currentMtsContract": "mts-contract/v0.6",
        "foundationV2Accepted": False,
        "cutoverPerformed": False,
        "downstreamRepinAllowed": False,
    }


def test_final_cutover_is_one_merge_without_compatibility_runtime() -> None:
    boundary = read(MATRIX)["finalCutover"]
    assert boundary == {
        "singleMergeRequired": True,
        "stages": ["C7", "C8", "C9"],
        "unknownConsumersAllowed": False,
        "compatibilityRuntimeAllowed": False,
        "oldAcceptedContractMayReferenceDeletedFiles": False,
    }
