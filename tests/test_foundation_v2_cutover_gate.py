from __future__ import annotations

import ast
import json
from collections import defaultdict, deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "cutover/foundation-v2-import-classification-v0.1.json"
CANDIDATE = ROOT / "cutover/foundation-v2-cutover-candidate-v0.1.json"
VALUE_BUNDLE_DECISION = ROOT / "cutover/value-bundle-rooted-migration-decision-v0.1.json"
SURFACE_DIRS = (ROOT / "core", ROOT / "converters")
HISTORICAL_CLASSES = {"HISTORICAL_SEMANTIC_ISLAND", "HISTORICAL_ENTRYPOINT"}


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def load_candidate() -> dict:
    return json.loads(CANDIDATE.read_text(encoding="utf-8"))


def discover_surface() -> set[str]:
    return {
        path.relative_to(ROOT).as_posix()
        for directory in SURFACE_DIRS
        for path in directory.glob("*.py")
    }


def _module_path(parts: list[str], discovered: set[str]) -> str | None:
    candidate = "/".join(parts) + ".py"
    if candidate in discovered:
        return candidate
    package_init = "/".join(parts + ["__init__"]) + ".py"
    return package_init if package_init in discovered else None


def imported_surface(source: str, discovered: set[str]) -> set[str]:
    path = ROOT / source
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=source)
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
    return {
        source: imported_surface(source, discovered)
        for source in sorted(discovered)
    }


def historical_reachability(
    graph: dict[str, set[str]],
    classifications: dict[str, str],
) -> list[tuple[str, ...]]:
    failures: list[tuple[str, ...]] = []
    for origin, origin_class in classifications.items():
        if origin_class != "FOUNDATION_V2_LIVE":
            continue
        queue = deque([(origin, (origin,))])
        visited = {origin}
        while queue:
            current, chain = queue.popleft()
            for target in graph.get(current, set()):
                if target in visited:
                    continue
                next_chain = chain + (target,)
                if classifications[target] in HISTORICAL_CLASSES:
                    failures.append(next_chain)
                    continue
                visited.add(target)
                queue.append((target, next_chain))
    return sorted(set(failures))


def test_manifest_classifies_the_entire_core_and_converter_surface() -> None:
    manifest = load_manifest()
    classifications = manifest["classifications"]

    assert manifest["schema"] == "foundation-v2-cutover-classification/v0.1"
    assert manifest["issue"] == 276
    assert set(classifications) == discover_surface()
    assert "UNKNOWN" not in set(classifications.values())


def test_foundation_v2_live_surface_cannot_reach_historical_semantics() -> None:
    manifest = load_manifest()
    assert historical_reachability(import_graph(), manifest["classifications"]) == []


def test_public_foundation_v2_facade_has_an_exact_direct_dependency_set() -> None:
    manifest = load_manifest()
    assert sorted(import_graph()["core/foundation_v2.py"]) == sorted(
        manifest["publicFacadeDirectDeps"]
    )


def test_historical_deletion_decisions_are_complete_and_c7_set_is_exact() -> None:
    manifest = load_manifest()
    classifications = manifest["classifications"]
    decisions = manifest["historicalDecisions"]
    historical = {
        path
        for path, classification in classifications.items()
        if classification in HISTORICAL_CLASSES
    }
    assert set(decisions) == historical

    for decision in decisions.values():
        assert isinstance(decision["deleteInC7"], bool)
        assert decision["deletePrecondition"].strip()
        for owner in decision["replacementLiveOwners"]:
            assert classifications[owner] == "FOUNDATION_V2_LIVE"

    expected_delete = sorted(
        path for path, decision in decisions.items() if decision["deleteInC7"]
    )
    assert manifest["c7DeletionSet"] == expected_delete
    assert {
        path for path, decision in decisions.items() if not decision["deleteInC7"]
    } == set()


def test_p3b_value_bundle_decision_is_machine_readable_and_delete_ready() -> None:
    decision = json.loads(VALUE_BUNDLE_DECISION.read_text(encoding="utf-8"))
    manifest = load_manifest()

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
    assert decision["current"] == {
        "outerContract": "mts-contract/v0.6",
        "surface": "mts-value-bundle/v0.2",
        "referenceCore": "core/mtc_value_bundle.py",
        "mutateInPlace": False,
    }

    old_owner = manifest["historicalDecisions"]["core/mtc_value_bundle.py"]
    assert old_owner["replacementLiveOwners"] == [
        "core/foundation_v2_value_bundle.py"
    ]
    assert old_owner["deleteInC7"] is True
    assert "core/mtc_value_bundle.py" in manifest["c7DeletionSet"]


def test_p3b_decision_preserves_identity_and_read_only_vetoes() -> None:
    decision = json.loads(VALUE_BUNDLE_DECISION.read_text(encoding="utf-8"))
    next_surface = decision["next"]

    assert next_surface["surfaceCandidate"] == "mts-value-bundle/v0.3"
    assert next_surface["referenceCore"] == "core/foundation_v2_value_bundle.py"
    assert next_surface["observableResultSemanticsChanged"] is False
    assert next_surface["historicalTypedAstIsNormativeInput"] is False
    assert next_surface["runtimeHandleIsSemanticIdentity"] is False
    assert next_surface["sourcePositionIsSemanticIdentity"] is False
    assert next_surface["pathIsSemanticIdentity"] is False
    assert next_surface["expansionUsesSharedReadOnlyFindLinks"] is True
    assert next_surface["readOnlyQueries"] is True
    assert next_surface["materializesDuringQuery"] is False

    assert decision["veto"] == {
        "compatibilityAstSemanticMode": False,
        "identifyBundleWithSequenceGroup": False,
        "implicitQueryWrites": False,
        "deduplicateBeforeOccurrenceResolution": False,
        "singletonBundleCoercion": False,
        "numericOrRuntimeHandleIdentity": False,
        "currentV06Mutation": False,
    }


def test_gate_does_not_claim_cutover_acceptance_or_downstream_repin() -> None:
    assert load_manifest()["baseline"] == {
        "currentMtsContract": "mts-contract/v0.6",
        "foundationV2Accepted": False,
        "cutoverPerformed": False,
        "downstreamRepinAllowed": False,
    }


def test_rooted_identity_veto_tests_are_part_of_the_gate() -> None:
    for relative_path, required_names in load_manifest()["rootedVetoTests"].items():
        path = ROOT / relative_path
        assert path.is_file()
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=relative_path)
        actual = {
            node.name
            for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        assert set(required_names) <= actual


def test_current_production_contract_remains_v06_not_foundation_v2() -> None:
    contract = json.loads(
        (ROOT / "contracts/mts-contract-v0.6.json").read_text(encoding="utf-8")
    )
    conformance = json.loads(
        (ROOT / "contracts/mts-conformance-v0.6.json").read_text(encoding="utf-8")
    )
    assert contract["schema"] == "mts-contract/v0.6"
    assert conformance["schema"] == "mts-conformance/v0.6"
    assert contract["accepted"] is True
    assert conformance["accepted"] is True


def test_historical_reverse_consumers_have_no_foundation_v2_live_owner() -> None:
    manifest = load_manifest()
    graph = import_graph()
    classifications = manifest["classifications"]
    reverse: dict[str, set[str]] = defaultdict(set)
    for consumer, dependencies in graph.items():
        for dependency in dependencies:
            reverse[dependency].add(consumer)

    violations = [
        (consumer, historical)
        for historical in manifest["historicalDecisions"]
        for consumer in reverse.get(historical, set())
        if classifications[consumer] == "FOUNDATION_V2_LIVE"
    ]
    assert violations == []


def test_c0_candidate_freezes_exact_post_p3_owner_and_deletion_surface() -> None:
    candidate = load_candidate()
    manifest = load_manifest()

    assert candidate["schema"] == "foundation-v2-cutover-candidate/v0.1"
    assert candidate["issue"] == 394
    assert candidate["parentIssue"] == 271
    assert candidate["status"] == "frozen-candidate"
    assert candidate["c7DeletionSet"] == manifest["c7DeletionSet"]
    assert set(candidate["c7DeletionSet"]) == set(manifest["historicalDecisions"])

    classifications = manifest["classifications"]
    neutral = {"core/anum_protocol.py", "core/anum_carrier.py"}
    for owner in candidate["owners"].values():
        assert (ROOT / owner).is_file(), owner
        if owner in neutral:
            assert classifications[owner] == "PRESERVED_NEUTRAL"
        else:
            assert classifications[owner] == "FOUNDATION_V2_LIVE"
        assert owner not in candidate["c7DeletionSet"]


def test_c0_candidate_keeps_v06_frozen_and_does_not_smuggle_c9_acceptance() -> None:
    candidate = load_candidate()
    previous = candidate["previousAcceptedRelease"]
    boundary = candidate["candidateBoundary"]

    assert candidate["accepted"] is False
    assert candidate["cutoverPerformed"] is False
    assert candidate["downstreamRepinAllowed"] is False
    assert previous == {
        "contract": "contracts/mts-contract-v0.6.json",
        "conformance": "contracts/mts-conformance-v0.6.json",
        "immutable": True,
        "remainsAcceptedUntilC9": True,
        "isLiveOwnerManifestAfterC7": False,
    }
    assert boundary["acceptedMtsVersionAssignedHere"] is False
    assert boundary["mustReferenceOnlyExistingPostC7Owners"] is True
    assert candidate["stageOrder"][-1] == "C9-explicit-acceptance-and-downstream-repin"


def test_c0_candidate_freezes_identity_and_read_only_vetoes() -> None:
    veto = load_candidate()["veto"]
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
