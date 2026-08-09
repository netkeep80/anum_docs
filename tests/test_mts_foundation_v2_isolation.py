from __future__ import annotations

import ast
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "mts-foundation-v2-isolation-v0.7.json"
CLASSES = {
    "FOUNDATION_V2_LIVE",
    "HISTORICAL_SEMANTIC_ISLAND",
    "HISTORICAL_ENTRYPOINT",
    "NON_SEMANTIC_TOOLING",
    "PRESERVED_NEUTRAL",
}


def contract() -> dict:
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def module_name(path: Path) -> str:
    return path.relative_to(ROOT).with_suffix("").as_posix().replace("/", ".")


def internal_imports(path: Path) -> set[str]:
    relative = path.relative_to(ROOT).as_posix()
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=relative)
    result: set[str] = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "core" or alias.name.startswith("core."):
                    result.add(alias.name)
                if alias.name == "converters" or alias.name.startswith("converters."):
                    result.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if node.level == 0:
                if module == "core" or module.startswith("core."):
                    result.add(module)
                if module == "converters" or module.startswith("converters."):
                    result.add(module)
            elif node.level == 1:
                if relative.startswith("core/") and module:
                    result.add(f"core.{module}")
                elif relative.startswith("converters/") and module:
                    result.add(f"converters.{module}")

    return result


def scanned_python_files() -> tuple[Path, ...]:
    files: list[Path] = []
    for root_name in contract()["repositoryScan"]["roots"]:
        files.extend((ROOT / root_name).rglob("*.py"))
    return tuple(sorted(path for path in files if path.is_file()))


def classification_sets() -> dict[str, set[str]]:
    data = contract()
    return {
        "FOUNDATION_V2_LIVE": set(data["foundationV2Live"]),
        "HISTORICAL_SEMANTIC_ISLAND": {
            row["path"] for row in data["historicalSemanticIsland"]
        },
        "HISTORICAL_ENTRYPOINT": {
            row["path"] for row in data["historicalEntrypoints"]
        },
        "NON_SEMANTIC_TOOLING": set(data["nonSemanticTooling"]),
    }


def classify(path: Path) -> str:
    relative = path.relative_to(ROOT).as_posix()
    explicit = classification_sets()
    hits = [name for name, paths in explicit.items() if relative in paths]
    if len(hits) > 1:
        raise AssertionError((relative, hits))
    if hits:
        return hits[0]
    return "PRESERVED_NEUTRAL"


def historical_modules() -> set[str]:
    return {
        module_name(ROOT / row["path"])
        for row in contract()["historicalSemanticIsland"]
    }


def test_isolation_contract_is_nonaccepting_cutover_gate() -> None:
    data = contract()
    assert data["schema"] == "mts-foundation-v2-isolation/v0.7"
    assert data["status"] == "gate-p-historical-isolation"
    assert data["accepted"] is False
    assert data["issue"] == 276
    assert data["parent"] == 271
    assert data["umbrella"] == 237
    assert data["baseMainCommit"] == "89ffd525f888354a85dde06012001997d117adc0"
    assert data["cutoverPerformed"] is False
    assert data["foundationV2Accepted"] is False
    assert data["downstreamRepinAllowed"] is False
    assert set(data["classes"]) == CLASSES
    assert data["repositoryScan"]["unknownAllowed"] is False
    assert data["repositoryScan"]["unexpectedHistoricalConsumerIsFailure"] is True


def test_all_explicit_classification_paths_exist_and_are_disjoint() -> None:
    sets = classification_sets()
    seen: set[str] = set()
    for class_name, paths in sets.items():
        assert paths, class_name
        for relative in paths:
            assert relative not in seen, (class_name, relative)
            seen.add(relative)
            assert (ROOT / relative).is_file(), (class_name, relative)


def test_every_core_and_converter_python_file_is_classifiable() -> None:
    files = scanned_python_files()
    assert files
    for path in files:
        assert classify(path) in CLASSES, path


def test_preserved_neutral_files_do_not_import_historical_semantic_island() -> None:
    old = historical_modules()
    failures: dict[str, list[str]] = {}
    for path in scanned_python_files():
        if classify(path) != "PRESERVED_NEUTRAL":
            continue
        overlap = internal_imports(path) & old
        if overlap:
            failures[path.relative_to(ROOT).as_posix()] = sorted(overlap)
    assert failures == {}


def test_foundation_v2_live_has_zero_historical_imports() -> None:
    old = historical_modules()
    live = classification_sets()["FOUNDATION_V2_LIVE"]
    failures: dict[str, list[str]] = {}
    for relative in sorted(live):
        overlap = internal_imports(ROOT / relative) & old
        if overlap:
            failures[relative] = sorted(overlap)
    assert failures == {}


def test_only_explicit_historical_classes_may_import_historical_modules() -> None:
    old = historical_modules()
    allowed_classes = {"HISTORICAL_SEMANTIC_ISLAND", "HISTORICAL_ENTRYPOINT"}
    failures: dict[str, tuple[str, list[str]]] = {}

    for path in scanned_python_files():
        overlap = internal_imports(path) & old
        if not overlap:
            continue
        class_name = classify(path)
        if class_name not in allowed_classes:
            failures[path.relative_to(ROOT).as_posix()] = (
                class_name,
                sorted(overlap),
            )
    assert failures == {}


def test_historical_entrypoints_depend_only_on_declared_island_edges() -> None:
    data = contract()
    rows = {row["path"]: row for row in data["historicalEntrypoints"]}
    old = historical_modules()

    for relative, row in rows.items():
        actual = internal_imports(ROOT / relative) & old
        assert actual == set(row["dependsOnIsland"]), (relative, sorted(actual))


def test_historical_runtime_is_marked_for_c7_deletion_with_preconditions() -> None:
    data = contract()
    for section in ("historicalSemanticIsland", "historicalEntrypoints"):
        for row in data[section]:
            assert row["deleteInC7"] is True, row["path"]
            assert row["deletePrecondition"], row["path"]
            assert row["historicalOwner"], row["path"]
            if section == "historicalSemanticIsland":
                assert row["replacementLiveOwner"], row["path"]


def test_recursive_anum_is_preserved_outside_pair_interning_l4_island() -> None:
    data = contract()["preservedSemanticBoundaries"]
    assert data["recursiveAnumModule"] == "core/anum_recursive_denotation.py"
    assert data["recursiveAnumIsHistoricalL4"] is False
    assert classify(ROOT / data["recursiveAnumModule"]) == "PRESERVED_NEUTRAL"
    assert "core.anum_memory" not in internal_imports(ROOT / data["recursiveAnumModule"])


def test_public_surface_and_ostensive_invariant_remain_exact() -> None:
    data = contract()["preservedSemanticBoundaries"]
    assert data["publicFoundationEntry"] == "core/foundation_v2.py"
    assert data["compatibilityModeAllowed"] is False
    assert data["ostensivePrimary"] == [
        "∞",
        "♂e = S = S ⟼ e",
        "b♀ = E = b ⟼ E",
        "b ⟼ e",
    ]
    assert classify(ROOT / data["publicFoundationEntry"]) == "FOUNDATION_V2_LIVE"


def test_pair_interning_l4_is_confined_to_historical_island() -> None:
    memory = (ROOT / "core" / "anum_memory.py").read_text(encoding="utf-8")
    assert "self._exact: dict[tuple[LinkRef, LinkRef], LinkRef]" in memory
    assert "existing = self._exact.get((start, end))" in memory
    assert classify(ROOT / "core" / "anum_memory.py") == "HISTORICAL_SEMANTIC_ISLAND"
    assert classify(ROOT / "converters" / "l4_backend_driver.py") == "HISTORICAL_ENTRYPOINT"


def test_gate_points_directly_to_c7_not_compatibility_runtime() -> None:
    data = contract()
    assert "C7 atomic deletion" in data["next"]
    assert "compatibility" not in data["next"].lower()
