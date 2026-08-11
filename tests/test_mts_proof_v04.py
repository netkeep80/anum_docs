"""Production acceptance for self-contained mts-proof/v0.4."""

import json
from copy import deepcopy
from pathlib import Path

from core.proof_checker import (
    CONTRACT_VERSION_V04,
    PROOF_SCHEMA_V04,
    DefinitionOpeningPathJudgment,
    canonical_proof_v04_json,
    check_proof_v04,
    check_proof_v04_data,
    proof_v04_from_data,
    proof_v04_to_data,
)


ROOT = Path(__file__).parents[1]
CONTRACT = ROOT / "contracts" / "mts-proof-v0.4.json"
CONFORMANCE = ROOT / "contracts" / "mts-proof-conformance-v0.4.json"
BASE_SEMANTIC_CORPUS = ROOT / "contracts" / "mts-derivation-base-conformance-v0.3.json"
OPENING_CONFORMANCE = ROOT / "contracts" / "mts-opening-path-conformance-v0.4.json"
CHECKER = ROOT / "core" / "proof_checker.py"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"

BASE_RELATIONS = {
    "ContextuallySatisfies",
    "Opens",
    "NoVisibleDefinition",
    "DefinitionConflict",
    "NonAddressableDefinitionTarget",
}


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def root_sources() -> tuple[str, ...]:
    return tuple(
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )


def v04_artifact(judgments: list[dict]) -> dict:
    return {
        "proofVersion": PROOF_SCHEMA_V04,
        "contractVersion": CONTRACT_VERSION_V04,
        "judgments": judgments,
    }


def opening_judgment(vector: dict) -> dict:
    return {
        "relation": "DefinitionOpeningPath",
        "scopes": deepcopy(vector["scopes"]),
        "lookupScope": deepcopy(vector["lookupScope"]),
        "startTarget": vector["startTarget"],
        "edges": deepcopy(vector["edges"]),
        "finalBody": vector["finalBody"],
    }


def patch_dotted(source: dict, patch: dict) -> dict:
    result = deepcopy(source)
    for dotted, replacement in patch.items():
        parts = dotted.split(".")
        current = result
        for part in parts[:-1]:
            current = current[part]
        current[parts[-1]] = deepcopy(replacement)
    return result


def base_by_id() -> dict[str, dict]:
    return {
        item["id"]: item["judgment"]
        for item in read(CONFORMANCE)["baseJudgments"]
    }


def forged_base(vector: dict) -> dict:
    if "sourceJudgment" in vector:
        source = base_by_id()[vector["sourceJudgment"]]
    elif "judgment" in vector:
        source = vector["judgment"]
    else:
        raise ValueError("forgery vector must provide sourceJudgment or judgment")

    result = patch_dotted(source, vector.get("patch", {}))
    if "replaceRelation" in vector:
        result["relation"] = vector["replaceRelation"]
    for key in vector.get("remove", []):
        result.pop(key, None)
    return result


def test_contract_is_accepted_self_contained_with_exact_six_relation_surface():
    contract = read(CONTRACT)
    conformance = read(CONFORMANCE)

    assert contract["schema"] == "mts-proof/v0.4"
    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert contract["dependsOn"] == [
        "mts-derivation-base/v0.3",
        "mts-opening-path/v0.4",
    ]
    serialized = json.dumps(contract, ensure_ascii=False)
    assert "mts-proof/v0.3" not in serialized
    assert "v03Compatibility" not in contract
    assert "versioning" not in contract
    assert contract["proofObject"]["proofVersion"] == PROOF_SCHEMA_V04
    assert contract["proofObject"]["contractVersion"] == CONTRACT_VERSION_V04
    assert set(contract["trustedRelations"]) == BASE_RELATIONS | {"DefinitionOpeningPath"}
    assert len(contract["trustedRelations"]) == 6
    assert conformance["schema"] == "mts-proof-conformance/v0.4"
    assert conformance["accepted"] is True
    assert conformance["contract"] == contract["schema"]
    assert contract["conformanceCorpus"] == "contracts/mts-proof-conformance-v0.4.json"


def test_conformance_uses_current_semantic_leaf_and_owns_base_transport_vectors():
    conformance = read(CONFORMANCE)
    base_semantics = read(BASE_SEMANTIC_CORPUS)

    assert conformance["baseSemanticCorpus"] == "contracts/mts-derivation-base-conformance-v0.3.json"
    assert base_semantics["contract"] == "mts-derivation-base/v0.3"
    assert conformance["openingPathCorpus"] == "contracts/mts-opening-path-conformance-v0.4.json"
    assert {item["judgment"]["relation"] for item in conformance["baseJudgments"]} == BASE_RELATIONS
    assert conformance["baseForgeries"]
    assert "legacyBaseRegressionCorpus" not in conformance
    assert "legacyBaseRegressionNormative" not in conformance


def test_current_base_valid_judgments_replay_directly_in_v04():
    for vector in read(CONFORMANCE)["baseJudgments"]:
        assert check_proof_v04_data(v04_artifact([vector["judgment"]])), vector["id"]

    base = read(CONTRACT)["baseRelations"]
    assert base == {
        "contract": "mts-derivation-base/v0.3",
        "checkerPath": "core/proof_checker.py::check_base_judgment",
        "parserPath": "core/proof_checker.py::_base_judgment_from_data",
        "serializerPath": "core/proof_checker.py::_base_judgment_to_data",
        "versionedProofDelegation": False,
    }


def test_current_base_forgeries_are_rejected_directly_by_v04():
    for vector in read(CONFORMANCE)["baseForgeries"]:
        forged = forged_base(vector)
        assert not check_proof_v04_data(v04_artifact([forged])), vector["id"]


def test_current_checker_has_no_versioned_v03_dispatch_path():
    source = CHECKER.read_text(encoding="utf-8")

    assert "def check_base_judgment" in source
    assert "def _base_judgment_from_data" in source
    assert "def _base_judgment_to_data" in source
    assert "def check_v03_judgment" not in source
    assert "return check_v03_judgment(judgment)" not in source
    assert "V04Judgment: TypeAlias = BaseJudgment | DefinitionOpeningPathJudgment" in source


def test_every_opening_path_valid_vector_lifts_to_trusted_v04_relation():
    for vector in read(OPENING_CONFORMANCE)["validPaths"]:
        artifact = v04_artifact([opening_judgment(vector)])
        assert check_proof_v04_data(artifact), vector["id"]
        typed = proof_v04_from_data(artifact)
        assert len(typed.judgments) == 1
        assert isinstance(typed.judgments[0], DefinitionOpeningPathJudgment)
        assert check_proof_v04(typed), vector["id"]


def test_every_opening_path_invalid_vector_rejects_when_lifted():
    for vector in read(OPENING_CONFORMANCE)["invalidPaths"]:
        assert not check_proof_v04_data(v04_artifact([opening_judgment(vector)])), vector["id"]


def test_every_v04_specific_transport_forgery_rejects():
    for vector in read(CONFORMANCE)["invalidArtifacts"]:
        assert not check_proof_v04_data(vector["artifact"]), vector["id"]


def test_mixed_base_and_opening_path_judgment_order_has_no_dependency_meaning():
    mixed = read(CONFORMANCE)["mixedArtifact"]
    base = base_by_id()[mixed["baseJudgmentId"]]
    opening_vector = next(
        item
        for item in read(OPENING_CONFORMANCE)["validPaths"]
        if item["id"] == mixed["openingPathId"]
    )
    opening = opening_judgment(opening_vector)

    assert check_proof_v04_data(v04_artifact([base, opening]))
    assert check_proof_v04_data(v04_artifact([opening, base]))
    assert mixed["requiredBothOrdersAccepted"] is True
    assert mixed["orderImpliesDependency"] is False

    boundary = read(CONTRACT)["compositionBoundary"]
    assert boundary["judgmentOrderImpliesDependency"] is False
    assert boundary["genericCompositionAccepted"] is False
    assert boundary["proofDagDependencyAccepted"] is False


def test_v04_canonical_round_trip_is_deterministic_for_mixed_proof():
    base = base_by_id()["opens-direct"]
    opening_vector = next(
        item for item in read(OPENING_CONFORMANCE)["validPaths"] if item["id"] == "two-edge"
    )
    source = v04_artifact([base, opening_judgment(opening_vector)])

    proof = proof_v04_from_data(source)
    assert check_proof_v04(proof)
    canonical_data = proof_v04_to_data(proof)
    canonical_json = canonical_proof_v04_json(proof)

    assert canonical_data["proofVersion"] == PROOF_SCHEMA_V04
    assert canonical_data["contractVersion"] == CONTRACT_VERSION_V04
    assert check_proof_v04_data(canonical_data)
    assert json.loads(canonical_json) == canonical_data
    assert canonical_proof_v04_json(proof_v04_from_data(canonical_data)) == canonical_json


def test_target_transport_may_normalize_whitespace_on_serialization_without_changing_identity():
    vector = next(
        deepcopy(item)
        for item in read(OPENING_CONFORMANCE)["validPaths"]
        if item["id"] == "structural-adjacency-whitespace"
    )
    artifact = v04_artifact([opening_judgment(vector)])

    assert artifact["judgments"][0]["edges"][1]["target"] == "( b )"
    proof = proof_v04_from_data(artifact)
    canonical = proof_v04_to_data(proof)

    assert canonical["judgments"][0]["edges"][1]["target"] == "(b)"
    assert check_proof_v04_data(canonical)


def test_noncanonical_expected_body_and_final_body_are_transport_errors():
    vector = next(
        deepcopy(item)
        for item in read(OPENING_CONFORMANCE)["validPaths"]
        if item["id"] == "structural-adjacency-whitespace"
    )
    judgment = opening_judgment(vector)
    judgment["edges"][0]["body"] = "( b )"
    assert not check_proof_v04_data(v04_artifact([judgment]))

    bundle = next(
        deepcopy(item)
        for item in read(OPENING_CONFORMANCE)["validPaths"]
        if item["id"] == "ends-in-constraint-bundle"
    )
    judgment = opening_judgment(bundle)
    judgment["finalBody"] = "{ ◁ = x, ▷ = y }"
    assert not check_proof_v04_data(v04_artifact([judgment]))


def test_opening_path_relation_uses_no_equality_or_other_generic_rule():
    boundary = read(CONTRACT)["compositionBoundary"]

    assert boundary["DefinitionOpeningPathInternallyComposesOpeningEdges"] is True
    assert boundary["openingPathFeedsContextuallySatisfiesImplicitly"] is False
    assert boundary["openingPathImpliesEquality"] is False
    assert boundary["openingPathImpliesEquivalence"] is False
    assert boundary["openingPathImpliesNormalization"] is False
    assert boundary["transitivityAccepted"] is False
    assert boundary["symmetryAccepted"] is False
    assert boundary["congruenceAccepted"] is False
    assert boundary["modusPonensAccepted"] is False
    assert boundary["globalSubstitutionAccepted"] is False


def test_checker_and_effect_boundaries_are_current_and_explicit():
    checker = read(CONTRACT)["checker"]
    effects = read(CONTRACT)["effectsBoundary"]

    assert checker["module"] == "core/proof_checker.py"
    assert checker["currentTrustedModule"] is True
    assert checker["baseRelationsUseCanonicalReplayCore"] is True
    assert checker["baseRelationsDelegateVersionedProof"] is False
    assert checker["openingPathDelegatesCanonicalVerifier"] is True
    assert checker["trustsSearchTrace"] is False
    assert checker["mayAutoExtendOpeningPath"] is False
    assert checker["mayReadAmbientInterpreterState"] is False
    assert checker["mayInjectCanonicalRootDefinitions"] is False
    assert checker["mayMaterialize"] is False
    assert checker["mayDelete"] is False

    assert effects["openingPathReadsMemory"] is False
    assert effects["openingPathReadsContextFrame"] is False
    assert effects["openingPathReadsInterpreterIdentity"] is False
    assert effects["openingPathMaterializes"] is False
    assert effects["openingPathDeletes"] is False


def test_current_proof_has_no_historical_release_gate_or_compatibility_surface():
    contract = read(CONTRACT)
    conformance = read(CONFORMANCE)
    source = CHECKER.read_text(encoding="utf-8")

    assert "v03Compatibility" not in contract
    assert "versioning" not in contract
    assert "futureUmbrella" not in json.dumps(contract, ensure_ascii=False)
    assert "legacyBaseRegression" not in json.dumps(conformance, ensure_ascii=False)
    assert "check_proof_v03_data" not in source
    assert contract["downstream"] == {
        "aproverMayInventAdditionalRules": False,
        "proofSearchTrusted": False,
    }


def test_root_program_remains_exactly_ten_and_unchanged():
    before = root_sources()
    assert len(before) == 10
    assert root_sources() == before
