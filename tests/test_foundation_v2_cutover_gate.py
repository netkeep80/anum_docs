from __future__ import annotations

import ast
import json
from collections import deque
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "cutover/foundation-v2-import-classification-v0.1.json"
CANDIDATE = ROOT / "cutover/foundation-v2-cutover-candidate-v0.1.json"
VALUE_BUNDLE_DECISION = ROOT / "cutover/value-bundle-rooted-migration-decision-v0.1.json"
SURFACE_DIRS = (ROOT / "core", ROOT / "converters")


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def discover_surface() -> set[str]:
    return {path.relative_to(ROOT).as_posix() for directory in SURFACE_DIRS for path in directory.glob("*.py")}


def _module_path(parts: list[str], discovered: set[str]) -> str | None:
    candidate = "/".join(parts) + ".py"
    if candidate in discovered:
        return candidate
    package_init = "/".join(parts + ["__init__"]) + ".py"
    return package_init if package_init in discovered else None


def imported_surface(source: str, discovered: set[str]) -> set[str]:
    tree = ast.parse((ROOT / source).read_text(encoding="utf-8"), filename=source)
    package = list(Path(source).with_suffix("").parts[:-1])
    targets: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                target = _module_path(alias.name.split("."), discovered)
                if target:
                    targets.add(target)
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
        if node.module:
            target = _module_path(base + node.module.split("."), discovered)
            if target:
                targets.add(target)
        elif node.level:
            for alias in node.names:
                target = _module_path(base + alias.name.split("."), discovered)
                if target:
                    targets.add(target)
    return targets


def import_graph() -> dict[str, set[str]]:
    discovered = discover_surface()
    return {source: imported_surface(source, discovered) for source in sorted(discovered)}


def test_post_c7_manifest_classifies_exactly_the_live_surface() -> None:
    manifest = read(MANIFEST)
    assert manifest["schema"] == "foundation-v2-cutover-classification/v0.1"
    assert manifest["issue"] == 276
    assert manifest["c7Performed"] is True
    assert set(manifest["classifications"]) == discover_surface()
    assert "UNKNOWN" not in set(manifest["classifications"].values())
    assert not ({"HISTORICAL_SEMANTIC_ISLAND", "HISTORICAL_ENTRYPOINT"} & set(manifest["classifications"].values()))


def test_historical_decisions_are_preserved_as_audit_evidence_but_files_are_gone() -> None:
    manifest = read(MANIFEST)
    decisions = manifest["historicalDecisions"]
    assert set(decisions) == set(manifest["c7DeletionSet"])
    assert len(decisions) == 10
    for path, decision in decisions.items():
        assert decision["deleteInC7"] is True, path
        assert decision["deletePrecondition"].strip(), path
        assert not (ROOT / path).exists(), path
        for owner in decision["replacementLiveOwners"]:
            assert manifest["classifications"][owner] == "FOUNDATION_V2_LIVE", owner
            assert (ROOT / owner).is_file(), owner


def test_foundation_v2_live_surface_has_no_edge_to_deleted_historical_modules() -> None:
    manifest = read(MANIFEST)
    deleted_modules = {path.removesuffix(".py").replace("/", ".") for path in manifest["historicalDecisions"]}
    for source in discover_surface():
        tree = ast.parse((ROOT / source).read_text(encoding="utf-8"), filename=source)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                assert not any(alias.name in deleted_modules for alias in node.names), source
            elif isinstance(node, ast.ImportFrom):
                assert (node.module or "") not in deleted_modules, source


def test_public_foundation_v2_facade_has_exact_direct_dependency_set() -> None:
    manifest = read(MANIFEST)
    assert sorted(import_graph()["core/foundation_v2.py"]) == sorted(manifest["publicFacadeDirectDeps"])


def test_all_live_foundation_nodes_are_closed_under_nonhistorical_surface() -> None:
    manifest = read(MANIFEST)
    graph = import_graph()
    classifications = manifest["classifications"]
    for origin, classification in classifications.items():
        if classification != "FOUNDATION_V2_LIVE":
            continue
        queue = deque([origin])
        visited = {origin}
        while queue:
            current = queue.popleft()
            for target in graph.get(current, set()):
                assert target in classifications
                if target not in visited:
                    visited.add(target)
                    queue.append(target)


def test_p3b_value_bundle_decision_remains_the_deletion_justification() -> None:
    decision = read(VALUE_BUNDLE_DECISION)
    manifest = read(MANIFEST)
    assert decision["schema"] == "value-bundle-rooted-migration-decision/v0.1"
    assert decision["issue"] == 391
    assert decision["decision"] == "PRESERVE_BY_ROOTED_MIGRATION"
    assert decision["next"]["referenceCore"] == "core/foundation_v2_value_bundle.py"
    assert decision["next"]["observableResultSemanticsChanged"] is False
    assert decision["next"]["historicalTypedAstIsNormativeInput"] is False
    old_owner = manifest["historicalDecisions"]["core/mtc_value_bundle.py"]
    assert old_owner["replacementLiveOwners"] == ["core/foundation_v2_value_bundle.py"]
    assert not (ROOT / "core/mtc_value_bundle.py").exists()


def test_post_c7_stage_is_not_c9_acceptance() -> None:
    manifest = read(MANIFEST)
    assert manifest["baseline"] == {
        "currentMtsContract": "mts-contract/v0.6",
        "foundationV2Accepted": False,
        "cutoverPerformed": True,
        "downstreamRepinAllowed": False,
    }
    previous_contract = read(ROOT / "contracts/mts-contract-v0.6.json")
    previous_conformance = read(ROOT / "contracts/mts-conformance-v0.6.json")
    assert previous_contract["schema"] == "mts-contract/v0.6"
    assert previous_conformance["schema"] == "mts-conformance/v0.6"
    assert previous_contract["accepted"] is True
    assert previous_conformance["accepted"] is True


def test_rooted_identity_veto_tests_remain_executable_after_c7() -> None:
    for relative_path, required_names in read(MANIFEST)["rootedVetoTests"].items():
        path = ROOT / relative_path
        assert path.is_file()
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=relative_path)
        actual = {node.name for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}
        assert set(required_names) <= actual


def test_frozen_c0_candidate_still_names_exact_deleted_and_live_owner_sets() -> None:
    candidate = read(CANDIDATE)
    manifest = read(MANIFEST)
    assert candidate["schema"] == "foundation-v2-cutover-candidate/v0.1"
    assert candidate["status"] == "frozen-candidate"
    assert candidate["accepted"] is False
    assert candidate["cutoverPerformed"] is False
    assert candidate["downstreamRepinAllowed"] is False
    assert candidate["c7DeletionSet"] == manifest["c7DeletionSet"]
    for owner in candidate["owners"].values():
        assert (ROOT / owner).is_file(), owner
        assert owner not in candidate["c7DeletionSet"]


def test_frozen_candidate_vetoes_forbid_compatibility_and_hidden_identity() -> None:
    veto = read(CANDIDATE)["veto"]
    assert veto == {
        "secondLiveSemanticRuntime": False,
        "compatibilityOccurrenceMode": False,
        "runtimeIdAsSemanticIdentity": False,
        "sourcePositionAsSemanticIdentity": False,
        "contextFrameDisguisedAsK": False,
        "astOrTokenSemanticAuthority": False,
        "readMayMaterialize": False,
        "mutateMtsV06InPlace": False,
        "deleteBeforeCandidateOwnerMigration": False,
        "acceptInsideC7OrC8": False,
    }
