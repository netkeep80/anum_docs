"""Production conformance for accepted mts-proof/v0.3 base-relation replay."""

from copy import deepcopy
import json
from pathlib import Path

from core.proof_checker import (
    CONTRACT_VERSION,
    PROOF_SCHEMA,
    PROOF_SCHEMA_V03,
    CONTRACT_VERSION_V03,
    ExpectedAlias,
    InterpretProofStep,
    ProofContext,
    ProofObject,
    canonical_proof_v03_json,
    check_proof,
    check_proof_v03,
    check_proof_v03_data,
    proof_v03_from_data,
    proof_v03_to_data,
)


ROOT = Path(__file__).parents[1]
CONTRACT = ROOT / "contracts" / "mts-proof-v0.3.json"
CORPUS = ROOT / "contracts" / "mts-proof-conformance-v0.3.json"
DERIVATION = ROOT / "contracts" / "mts-derivation-base-v0.3.json"
PROOF_V02 = ROOT / "contracts" / "mts-proof-v0.2.json"
MTS_V03 = ROOT / "contracts" / "mts-contract-v0.3.json"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def artifact(judgment: dict) -> dict:
    return {
        "proofVersion": PROOF_SCHEMA_V03,
        "contractVersion": CONTRACT_VERSION_V03,
        "judgments": [deepcopy(judgment)],
    }


def valid_judgments() -> dict[str, dict]:
    return {
        item["id"]: item["judgment"]
        for item in read(CORPUS)["validJudgments"]
    }


def patch_dotted(value: dict, patch: dict) -> dict:
    result = deepcopy(value)
    for dotted_path, replacement in patch.items():
        parts = dotted_path.split(".")
        current = result
        for part in parts[:-1]:
            current = current[part]
        current[parts[-1]] = deepcopy(replacement)
    return result


def forged_judgment(vector: dict) -> dict:
    if "judgment" in vector:
        return deepcopy(vector["judgment"])

    source = deepcopy(valid_judgments()[vector["sourceJudgment"]])
    if "patch" in vector:
        source = patch_dotted(source, vector["patch"])
    if "replaceRelation" in vector:
        source["relation"] = vector["replaceRelation"]
    for key in vector.get("remove", []):
        source.pop(key, None)
    return source


def test_contract_accepts_exactly_the_five_preaccepted_base_relations():
    contract = read(CONTRACT)
    derivation = read(DERIVATION)

    assert contract["schema"] == PROOF_SCHEMA_V03
    assert contract["status"] == "accepted"
    assert contract["accepted"] is True
    assert contract["dependsOn"] == [
        "mts-contract/v0.3",
        derivation["schema"],
        "mts-proof/v0.2",
    ]
    assert set(contract["trustedRelations"]) == {
        "ContextuallySatisfies",
        "Opens",
        "NoVisibleDefinition",
        "DefinitionConflict",
        "NonAddressableDefinitionTarget",
    }


def test_all_valid_conformance_judgments_strictly_parse_and_replay():
    for vector in read(CORPUS)["validJudgments"]:
        data = artifact(vector["judgment"])
        proof = proof_v03_from_data(data)

        assert check_proof_v03(proof), vector["id"]
        assert check_proof_v03_data(data), vector["id"]
        assert proof_v03_to_data(proof) == data
        assert json.loads(canonical_proof_v03_json(proof)) == data


def test_contextually_satisfies_is_explicit_context_scoped_not_global_truth():
    source = valid_judgments()["contextually-satisfies-aroot"]
    counter = patch_dotted(source, {"context.end": 2})

    assert check_proof_v03_data(artifact(source))
    assert not check_proof_v03_data(artifact(counter))

    contract = read(CONTRACT)
    relation = contract["contextuallySatisfies"]
    assert relation["globalTruth"] is False
    assert relation["hiddenInterpreterIdentity"] is False
    assert relation["subjectOrFocusIdentity"] is False


def test_every_forged_relation_or_result_is_rejected():
    for vector in read(CORPUS)["forgeries"]:
        assert vector["mustReject"] is True
        assert not check_proof_v03_data(artifact(forged_judgment(vector))), vector["id"]


def test_wrong_versions_unknown_relation_and_unexpected_fields_are_rejected():
    for vector in read(CORPUS)["invalidArtifacts"]:
        assert not check_proof_v03_data(vector["artifact"]), vector["id"]


def test_definition_environment_is_explicit_canonical_and_has_no_hidden_root():
    judgments = valid_judgments()

    assert check_proof_v03_data(artifact(judgments["opens-direct"]))
    assert check_proof_v03_data(artifact(judgments["opens-child-shadowing"]))
    assert check_proof_v03_data(artifact(judgments["opens-self-one-step"]))

    hidden_root = next(
        item for item in read(CORPUS)["forgeries"] if item["id"] == "hidden-root-injection"
    )
    assert not check_proof_v03_data(artifact(hidden_root["judgment"]))

    contract = read(CONTRACT)
    environment = contract["definitionEnvironment"]
    assert environment["rootScopeRequired"] is True
    assert environment["duplicateScopeRejected"] is True
    assert environment["hiddenRootInjection"] is False


def test_negative_relations_stay_bound_to_exact_replay_scope():
    judgments = valid_judgments()
    for vector_id in (
        "no-visible-definition",
        "definition-conflict",
        "non-addressable-target",
    ):
        assert check_proof_v03_data(artifact(judgments[vector_id])), vector_id

    visible_as_no_match = next(
        item for item in read(CORPUS)["forgeries"] if item["id"] == "no-match-when-visible"
    )
    assert not check_proof_v03_data(artifact(forged_judgment(visible_as_no_match)))

    contract = read(CONTRACT)
    assert contract["noVisibleDefinition"]["globalAbsence"] is False
    assert contract["noVisibleDefinition"]["closedWorldBeyondSnapshot"] is False
    assert contract["definitionConflict"]["impliesBodyEquality"] is False
    assert contract["nonAddressableDefinitionTarget"]["globalSemanticInvalidity"] is False


def test_v03_artifact_order_has_no_composition_or_inference_semantics():
    judgments = valid_judgments()
    data = {
        "proofVersion": PROOF_SCHEMA_V03,
        "contractVersion": CONTRACT_VERSION_V03,
        "judgments": [
            deepcopy(judgments["opens-direct"]),
            deepcopy(judgments["no-visible-definition"]),
        ],
    }
    assert check_proof_v03_data(data)

    boundary = read(CONTRACT)["compositionBoundary"]
    assert boundary == {
        "judgmentOrderImpliesDependency": False,
        "genericCompositionAccepted": False,
        "transitivityAccepted": False,
        "symmetryAccepted": False,
        "congruenceAccepted": False,
        "modusPonensAccepted": False,
        "globalSubstitutionAccepted": False,
        "openingToEqualityAccepted": False,
        "recursiveNormalizationAccepted": False,
    }


def test_v02_public_constants_artifact_and_checker_semantics_are_unchanged():
    proof_v02 = read(PROOF_V02)

    assert CONTRACT_VERSION == "mts-contract/v0.2"
    assert PROOF_SCHEMA == "mts-proof/v0.2"
    assert proof_v02["checker"]["trustedRuleSet"] == ["interpret"]

    step = InterpretProofStep(
        expression="[] = []",
        context=ProofContext(start=1, end=1),
        expected_aliases=(ExpectedAlias(path=(1,), target_path=(0,)),),
    )
    proof = ProofObject(steps=(step,))
    assert check_proof(proof)

    compatibility = read(CONTRACT)["v02Compatibility"]
    assert compatibility["mtsProofV02Modified"] is False
    assert compatibility["mtsProofV02TrustedRuleSet"] == ["interpret"]
    assert compatibility["retroactiveReinterpretation"] is False


def test_v03_does_not_smuggle_subject_focus_research_into_current_proof_artifact():
    boundary = read(CONTRACT)["contextVersionBoundary"]
    mts_v03 = read(MTS_V03)

    assert boundary["explicitContextFrameOnly"] is True
    assert boundary["subjectFocusResearchIssue"] == 148
    assert boundary["subjectOrFocusAddedToV03Artifact"] is False
    assert boundary["futureContextSemanticsMustUseAdditiveContract"] is True
    assert mts_v03["l5Boundary"]["currentProofContract"] == "contracts/mts-proof-v0.2.json"


def test_downstream_repin_waits_for_additive_umbrella_not_mutated_mts_contract_v03():
    downstream = read(CONTRACT)["downstream"]
    mts_v03 = read(MTS_V03)

    assert downstream["proofSemanticsAccepted"] is True
    assert downstream["aproverRepinAllowedDirectlyFromMtsContractV03"] is False
    assert mts_v03["downstream"]["aproverProofRepinAllowed"] is False
    assert "additive umbrella" in downstream["reason"]
