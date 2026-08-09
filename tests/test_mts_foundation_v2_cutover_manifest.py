from __future__ import annotations

import ast
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "contracts" / "mts-foundation-v2-cutover-manifest-v0.7.json"
MATRIX = ROOT / "contracts" / "mts-foundation-v2-consumer-matrix-v0.7.json"
ALLOWED_ACTIONS = {
    "MIGRATE_TO_FOUNDATION_V2",
    "HISTORICAL_REPLAY_ONLY",
    "DELETE_WITH_OWNER",
    "NON_SEMANTIC_TOOLING",
}
EXPECTED_OWNER_KEYS = {
    "publicEntrySurface",
    "exactOccurrenceSubstrate",
    "rootBootstrapEvidence",
    "state",
    "sourceFrontEnd",
    "interpreterReplay",
    "run",
    "proofAndIntegratedChecker",
    "recursiveAnumPreservedDomain",
    "sequenceMaterialization",
    "persistentL4",
    "compatibilityClassification",
    "ostensiveRegressionGuard",
}


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _module_name(path: str) -> str:
    return path.removesuffix(".py").replace("/", ".")


def core_imports(path: str) -> tuple[str, ...]:
    source_path = ROOT / path
    tree = ast.parse(source_path.read_text(encoding="utf-8"), filename=path)
    result: set[str] = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "core" or alias.name.startswith("core."):
                    result.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if node.level == 0:
                if module == "core" or module.startswith("core."):
                    result.add(module)
            elif node.level == 1 and path.startswith("core/") and module:
                result.add(f"core.{module}")

    return tuple(sorted(result))


def test_manifest_freezes_nonaccepting_release_candidate() -> None:
    manifest = read(MANIFEST)
    assert manifest["schema"] == "mts-foundation-v2-cutover-manifest/v0.7"
    assert manifest["status"] == "gate-p-cutover-manifest"
    assert manifest["accepted"] is False
    assert manifest["issue"] == 274
    assert manifest["parent"] == 271
    assert manifest["umbrella"] == 237
    assert manifest["baseMainCommit"] == "884ce13d5528ac35d7e95c257711b9b4d7087e17"
    assert manifest["cutoverPerformed"] is False
    assert manifest["foundationV2Accepted"] is False
    assert manifest["downstreamRepinAllowed"] is False
    assert set(manifest["owners"]) == EXPECTED_OWNER_KEYS


def test_every_frozen_owner_path_and_contract_exists_with_exact_schema() -> None:
    manifest = read(MANIFEST)
    for name, owner in manifest["owners"].items():
        for path in owner.get("modules", []):
            assert (ROOT / path).is_file(), (name, path)
        for path in owner.get("readerFacingOwners", []):
            assert (ROOT / path).is_file(), (name, path)
        for path in owner.get("tests", []):
            assert (ROOT / path).is_file(), (name, path)

        contracts = owner.get("contracts", [])
        schemas = owner.get("schemas", [])
        assert len(contracts) == len(schemas), name
        for path, schema in zip(contracts, schemas, strict=True):
            contract_path = ROOT / path
            assert contract_path.is_file(), (name, path)
            assert read(contract_path)["schema"] == schema, (name, path, schema)


def test_manifest_promotes_exact_root_without_legacy_dispatch() -> None:
    manifest = read(MANIFEST)
    root = manifest["owners"]["rootBootstrapEvidence"]
    assert root["liveProductionEntrypointReady"] is True
    assert root["implementedByIssue"] == 274
    assert root["cutoverPhase"] == "C3"
    assert root["modules"] == ["core/foundation_v2_root.py"]
    assert root["requiredOstensiveForms"] == [
        "∞",
        "♂e = S = S ⟼ e",
        "b♀ = E = b ⟼ E",
        "b ⟼ e",
    ]
    assert "core/root_library.py" not in root["modules"]
    assert "core/validate_root.py" not in root["modules"]

    public = manifest["owners"]["publicEntrySurface"]
    assert public["modules"] == ["core/foundation_v2.py"]
    assert public["contracts"] == ["contracts/mts-foundation-v2-root-v0.7.json"]
    assert public["compatibilityMode"] is False
    assert public["legacyDispatcher"] is False

    guard = manifest["owners"]["ostensiveRegressionGuard"]
    assert guard["decisionIssue"] == 267
    assert guard["mergedPr"] == 268
    assert guard["releaseVeto"] is True

    compatibility = manifest["owners"]["compatibilityClassification"]
    assert compatibility["decisionIssue"] == 269
    assert compatibility["mergedPr"] == 270


def test_consumer_matrix_is_total_and_has_no_unknown_action() -> None:
    matrix = read(MATRIX)
    assert matrix["schema"] == "mts-foundation-v2-consumer-matrix/v0.7"
    assert matrix["status"] == "gate-p-cutover-consumer-audit"
    assert matrix["accepted"] is False
    assert matrix["issue"] == 274
    assert matrix["parent"] == 271
    assert matrix["baseMainCommit"] == "884ce13d5528ac35d7e95c257711b9b4d7087e17"
    assert set(matrix["allowedActions"]) == ALLOWED_ACTIONS
    assert matrix["unknownAllowed"] is False
    assert matrix["cutoverPerformed"] is False
    assert matrix["downstreamRepinAllowed"] is False

    paths: set[str] = set()
    for row in matrix["rows"]:
        assert row["path"] not in paths, row["path"]
        paths.add(row["path"])
        assert row["action"] in ALLOWED_ACTIONS, row["path"]
        assert row["role"], row["path"]
        assert row["replacementOwner"], row["path"]
        assert row["precondition"], row["path"]
        assert row["postCutover"], row["path"]
        assert (ROOT / row["path"]).is_file(), row["path"]

    required = {
        "core/root_library.py",
        "core/validate_root.py",
        "core/proof_checker.py",
        "core/mtc_opening_path.py",
        "core/mtc_parser.py",
        "core/mtc_ast.py",
        "core/mtc_interpreter.py",
        "core/mtc_definitions.py",
        "core/reference_model.py",
        "core/anum_memory.py",
        "converters/l4_backend_driver.py",
        "core/semantic_carrier.py",
    }
    assert paths == required


def test_matrix_pins_actual_direct_core_imports() -> None:
    matrix = read(MATRIX)
    for row in matrix["rows"]:
        expected = tuple(sorted(row["expectedCoreImports"]))
        assert core_imports(row["path"]) == expected, row["path"]

    pinned = matrix["verifiedHistoricalDependencyIsland"]
    for path, expected in pinned.items():
        assert core_imports(path) == tuple(sorted(expected)), path


def test_foundation_v2_trusted_modules_do_not_import_historical_semantics() -> None:
    matrix = read(MATRIX)
    forbidden = set(matrix["forbiddenHistoricalImportsInTrustedFoundationV2"])

    assert "core/foundation_v2_root.py" in matrix["trustedFoundationV2Modules"]
    assert "core/foundation_v2.py" in matrix["trustedFoundationV2Modules"]
    for path in matrix["trustedFoundationV2Modules"]:
        imports = set(core_imports(path))
        overlap = imports & forbidden
        assert not overlap, (path, sorted(overlap))


def test_nonsemantic_tooling_is_not_a_trusted_foundation_dependency() -> None:
    matrix = read(MATRIX)
    tooling_modules = {
        _module_name(row["path"])
        for row in matrix["rows"]
        if row["action"] == "NON_SEMANTIC_TOOLING" and row["path"].startswith("core/")
    }
    assert tooling_modules
    for path in matrix["trustedFoundationV2Modules"]:
        assert not (set(core_imports(path)) & tooling_modules), path


def test_delete_with_owner_rows_have_a_real_acceptance_precondition() -> None:
    rows = [row for row in read(MATRIX)["rows"] if row["action"] == "DELETE_WITH_OWNER"]
    assert {row["path"] for row in rows} == {"core/reference_model.py"}
    for row in rows:
        assert "accepted" in row["precondition"].lower(), row["path"]
        assert "delete" in row["postCutover"].lower(), row["path"]


def test_historical_root_and_proof_are_no_longer_new_live_authorities() -> None:
    by_path = {row["path"]: row for row in read(MATRIX)["rows"]}

    root = by_path["core/root_library.py"]
    validator = by_path["core/validate_root.py"]
    proof = by_path["core/proof_checker.py"]

    assert root["action"] == "HISTORICAL_REPLAY_ONLY"
    assert root["replacementOwner"] == "core/foundation_v2_root.py"
    assert validator["action"] == "HISTORICAL_REPLAY_ONLY"
    assert validator["replacementOwner"].startswith(
        "core/foundation_v2_root.py::validate_root_kernel"
    )
    assert proof["action"] == "HISTORICAL_REPLAY_ONLY"
    assert proof["replacementOwner"] == (
        "core/foundation_v2_checker.py for new production proofs"
    )


def test_historical_l4_pair_interning_fact_is_still_real_until_c6_updates_matrix() -> None:
    source = (ROOT / "core" / "anum_memory.py").read_text(encoding="utf-8")
    assert "self._exact: dict[tuple[LinkRef, LinkRef], LinkRef]" in source
    assert "def intern_link(" in source
    assert "existing = self._exact.get((start, end))" in source
    assert "return existing" in source

    driver = (ROOT / "converters" / "l4_backend_driver.py").read_text(encoding="utf-8")
    assert "from core.anum_memory import" in driver
    assert "AnumMemory" in driver


def test_manifest_does_not_authorize_cutover_or_acceptance_by_itself() -> None:
    manifest = read(MANIFEST)
    assert manifest["forbiddenReleaseInterpretations"] == {
        "candidateEvidenceMeansAcceptedRelease": False,
        "historicalReplayMeansSecondLiveRuntime": False,
        "machineLinkCarrierReplacesOstensiveNotation": False,
        "legacyContextFrameMayBackFoundationV2K": False,
        "legacyPairInterningMayBackFoundationV2Materialization": False,
    }
    assert "C4/C5/C6" in manifest["next"]
