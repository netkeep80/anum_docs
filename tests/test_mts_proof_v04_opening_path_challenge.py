"""Executable evidence for the non-normative mts-proof/v0.4 lifting challenge."""

import json
from copy import deepcopy
from pathlib import Path

from core.mtc_ast import format_expression
from core.mtc_definitions import DefinitionId
from core.mtc_opening_path import OpeningPathEdge, OpeningPathWitness, verify_opening_path
from core.mtc_parser import parse_formula
from core.proof_checker import (
    _build_definition_environments,
    _definition_id_from_data,
    _parse_definition_target,
    _path_from_data,
    _require_exact_keys,
    _scopes_from_data,
    check_proof_v03,
    proof_v03_from_data,
)


ROOT = Path(__file__).parents[1]
CHALLENGE = ROOT / "contracts" / "mts-proof-opening-path-challenge-v0.4.json"
CORPUS = ROOT / "contracts" / "mts-proof-v0.4-conformance-candidate.json"
BASE_CORPUS = ROOT / "contracts" / "mts-proof-conformance-v0.3.json"
OPENING_CORPUS = ROOT / "contracts" / "mts-opening-path-conformance-candidate-v0.4.json"
PROOF_V03 = ROOT / "contracts" / "mts-proof-v0.3.json"
OPENING_CONTRACT = ROOT / "contracts" / "mts-opening-path-v0.4.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"

PROOF_VERSION = "mts-proof/v0.4"
CONTRACT_VERSION = "mts-contract/v0.4"
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


def candidate_artifact(judgments: list[dict]) -> dict:
    return {
        "proofVersion": PROOF_VERSION,
        "contractVersion": CONTRACT_VERSION,
        "judgments": judgments,
    }


def base_judgment_replays(judgment: dict) -> bool:
    artifact = {
        "proofVersion": "mts-proof/v0.3",
        "contractVersion": "mts-contract/v0.3",
        "judgments": [judgment],
    }
    try:
        proof = proof_v03_from_data(artifact)
    except (KeyError, TypeError, ValueError):
        return False
    return check_proof_v03(proof)


def v03_artifact_replays(artifact: dict) -> bool:
    try:
        proof = proof_v03_from_data(artifact)
    except (KeyError, TypeError, ValueError):
        return False
    return check_proof_v03(proof)


def opening_path_judgment(vector: dict) -> dict:
    return {"relation": "DefinitionOpeningPath", **deepcopy(vector)}


def check_opening_path_judgment(data: dict) -> bool:
    try:
        _require_exact_keys(
            data,
            {"relation", "scopes", "lookupScope", "startTarget", "edges", "finalBody"},
            "DefinitionOpeningPath",
        )
        if data["relation"] != "DefinitionOpeningPath":
            return False
        if not isinstance(data["startTarget"], str):
            raise ValueError("startTarget must be a string")
        if not isinstance(data["edges"], list):
            raise ValueError("edges must be an array")
        if not isinstance(data["finalBody"], str):
            raise ValueError("finalBody must be a string")

        scopes = _scopes_from_data(data["scopes"])
        environments = _build_definition_environments(scopes)
        lookup_scope = _path_from_data(data["lookupScope"], "lookupScope")
        environment = environments.get(lookup_scope)
        if environment is None:
            raise ValueError("lookupScope must name a serialized scope")

        start_target = _parse_definition_target(data["startTarget"])
        edges: list[OpeningPathEdge] = []
        for index, edge_data in enumerate(data["edges"]):
            if not isinstance(edge_data, dict):
                raise ValueError("opening path edge must be an object")
            _require_exact_keys(
                edge_data,
                {"target", "definitionId", "body"},
                "opening path edge",
            )
            if not isinstance(edge_data["target"], str):
                raise ValueError("edge target must be a string")
            if not isinstance(edge_data["body"], str):
                raise ValueError("edge body must be a string")

            target = _parse_definition_target(edge_data["target"])
            expected_id = _definition_id_from_data(edge_data["definitionId"])
            body = parse_formula(edge_data["body"])
            if format_expression(body) != edge_data["body"]:
                raise ValueError(f"edge[{index}].body must be canonical")
            edges.append(
                OpeningPathEdge(
                    target=target,
                    definition_id=DefinitionId(
                        expected_id.scope_path,
                        expected_id.ordinal,
                    ),
                    body=body,
                )
            )

        final_body = parse_formula(data["finalBody"])
        if format_expression(final_body) != data["finalBody"]:
            raise ValueError("finalBody must be canonical")

        witness = OpeningPathWitness(
            start_target=start_target,
            edges=tuple(edges),
            final_body=final_body,
        )
        return verify_opening_path(witness, environment).accepted
    except (KeyError, TypeError, ValueError):
        return False


def check_candidate_proof(data: object) -> bool:
    try:
        if not isinstance(data, dict):
            raise ValueError("proof must be an object")
        _require_exact_keys(
            data,
            {"proofVersion", "contractVersion", "judgments"},
            "proof",
        )
        if data["proofVersion"] != PROOF_VERSION:
            raise ValueError("unsupported proofVersion")
        if data["contractVersion"] != CONTRACT_VERSION:
            raise ValueError("unsupported contractVersion")
        if not isinstance(data["judgments"], list):
            raise ValueError("judgments must be an array")

        for judgment in data["judgments"]:
            if not isinstance(judgment, dict):
                return False
            relation = judgment.get("relation")
            if relation == "DefinitionOpeningPath":
                if not check_opening_path_judgment(judgment):
                    return False
            elif relation in BASE_RELATIONS:
                if not base_judgment_replays(judgment):
                    return False
            else:
                return False
        return True
    except (KeyError, TypeError, ValueError):
        return False


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
        for item in read(BASE_CORPUS)["validJudgments"]
    }


def forge_base(vector: dict) -> dict:
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


def test_challenge_is_non_normative_and_does_not_modify_proof_v03():
    challenge = read(CHALLENGE)
    v03 = read(PROOF_V03)

    assert challenge["schema"] == "mts-proof-opening-path-challenge/v0.4"
    assert challenge["status"] == "candidate-challenge"
    assert challenge["acceptedContractLinkAllowed"] is False
    assert challenge["productionCheckerChangeAllowed"] is False
    assert challenge["proofV03ChangeAllowed"] is False
    assert challenge["schema"] not in PROOF_V03.read_text(encoding="utf-8")
    assert v03["proofObject"]["proofVersion"] == "mts-proof/v0.3"
    assert v03["compositionBoundary"]["genericCompositionAccepted"] is False


def test_candidate_versions_and_exact_six_relation_surface_are_fixed():
    challenge = read(CHALLENGE)
    candidate = challenge["candidateProof"]

    assert candidate["proofVersion"] == PROOF_VERSION
    assert candidate["contractVersion"] == CONTRACT_VERSION
    assert candidate["judgmentOrderImpliesDependency"] is False
    assert candidate["emptyJudgmentArrayAllowed"] is True
    assert set(challenge["trustedRelationsCandidate"]) == BASE_RELATIONS | {
        "DefinitionOpeningPath"
    }
    assert len(challenge["trustedRelationsCandidate"]) == 6


def test_all_v03_valid_base_judgments_lift_without_new_base_semantics():
    for vector in read(BASE_CORPUS)["validJudgments"]:
        judgment = vector["judgment"]
        assert base_judgment_replays(judgment), vector["id"]
        assert check_candidate_proof(candidate_artifact([judgment])), vector["id"]

    reuse = read(CHALLENGE)["baseRelationReuse"]
    assert reuse["firstFiveShapesIdenticalToV03"] is True
    assert reuse["firstFiveTrustedMeaningIdenticalToV03"] is True
    assert reuse["mustDelegateCanonicalExistingReplay"] is True


def test_all_v03_base_forgeries_remain_rejected_when_lifted():
    for vector in read(BASE_CORPUS)["forgeries"]:
        forged = forge_base(vector)
        assert vector["mustReject"] is True
        assert not base_judgment_replays(forged), vector["id"]
        assert not check_candidate_proof(candidate_artifact([forged])), vector["id"]


def test_existing_v03_invalid_artifacts_remain_rejected_by_existing_api():
    for vector in read(BASE_CORPUS)["invalidArtifacts"]:
        assert not v03_artifact_replays(vector["artifact"]), vector["id"]

    regression = read(CHALLENGE)["v03Regression"]
    assert regression["existingPortableArtifactsRemainStrictlyReplayable"] is True
    assert regression["retroactiveReinterpretation"] is False


def test_all_opening_path_valid_vectors_lift_through_canonical_verifier():
    for vector in read(OPENING_CORPUS)["validPaths"]:
        judgment = opening_path_judgment(vector)
        assert check_opening_path_judgment(judgment), vector["id"]
        assert check_candidate_proof(candidate_artifact([judgment])), vector["id"]


def test_all_opening_path_invalid_vectors_reject_when_lifted():
    for vector in read(OPENING_CORPUS)["invalidPaths"]:
        judgment = opening_path_judgment(vector)
        assert not check_opening_path_judgment(judgment), vector["id"]
        assert not check_candidate_proof(candidate_artifact([judgment])), vector["id"]


def test_v04_specific_transport_forgeries_fail_closed():
    for vector in read(CORPUS)["invalidArtifacts"]:
        assert not check_candidate_proof(vector["artifact"]), vector["id"]


def test_mixed_base_and_opening_judgments_are_independent_of_array_order():
    mixed = read(CORPUS)["mixedArtifact"]
    base = base_by_id()[mixed["baseJudgmentId"]]
    opening_vector = next(
        item
        for item in read(OPENING_CORPUS)["validPaths"]
        if item["id"] == mixed["openingPathId"]
    )
    opening = opening_path_judgment(opening_vector)

    assert check_candidate_proof(candidate_artifact([base, opening]))
    assert check_candidate_proof(candidate_artifact([opening, base]))
    assert mixed["requiredBothOrdersAccepted"] is True
    assert mixed["orderImpliesDependency"] is False


def test_opening_path_transport_delegates_to_accepted_relation_not_search_trace():
    challenge = read(CHALLENGE)
    opening = read(OPENING_CONTRACT)

    assert challenge["openingPathJudgment"]["trustedReplay"] == (
        "construct OpeningPathWitness and invoke canonical verify_opening_path exactly once"
    )
    assert opening["typedCore"]["verifier"] == "verify_opening_path"
    assert challenge["searchCheckerBoundary"]["searchTrusted"] is False
    assert challenge["searchCheckerBoundary"]["checkerMustReplayWithoutSearch"] is True
    assert challenge["searchCheckerBoundary"]["checkerMayAutoExtendPath"] is False


def test_no_generic_composition_or_equality_bridge_is_introduced():
    boundary = read(CHALLENGE)["compositionBoundary"]

    assert boundary["DefinitionOpeningPathInternallyComposesEdges"] is True
    assert boundary["genericJudgmentCompositionAccepted"] is False
    assert boundary["openingPathFeedsContextuallySatisfiesImplicitly"] is False
    assert boundary["openingPathImpliesEquality"] is False
    assert boundary["openingPathImpliesEquivalence"] is False
    assert boundary["openingPathImpliesNormalization"] is False
    assert boundary["transitivityAccepted"] is False
    assert boundary["symmetryAccepted"] is False
    assert boundary["congruenceAccepted"] is False
    assert boundary["modusPonensAccepted"] is False
    assert boundary["globalSubstitutionAccepted"] is False
    assert boundary["proofDagDependencyAccepted"] is False


def test_candidate_checker_reads_no_hidden_runtime_state_for_opening_paths():
    effects = read(CHALLENGE)["effectsBoundary"]

    assert effects["openingPathReadsMemory"] is False
    assert effects["openingPathReadsContextFrame"] is False
    assert effects["openingPathReadsInterpreterIdentity"] is False
    assert effects["openingPathMaterializes"] is False
    assert effects["openingPathDeletes"] is False


def test_root_program_remains_exactly_ten_and_unchanged():
    before = root_sources()
    assert len(before) == 10
    assert root_sources() == before
