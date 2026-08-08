"""Acceptance checks for additive MTS v0.4 proof-publication umbrella."""

import json
from pathlib import Path

from core.proof_checker import check_proof_v03_data


ROOT = Path(__file__).parents[1]
V03 = ROOT / "contracts" / "mts-contract-v0.3.json"
V03_CONFORMANCE = ROOT / "contracts" / "mts-conformance-v0.3.json"
V04 = ROOT / "contracts" / "mts-contract-v0.4.json"
V04_CONFORMANCE = ROOT / "contracts" / "mts-conformance-v0.4.json"
PROOF = ROOT / "contracts" / "mts-proof-v0.3.json"
PROOF_CONFORMANCE = ROOT / "contracts" / "mts-proof-conformance-v0.3.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_v04_is_additive_accepted_umbrella_over_immutable_v03():
    v03 = read(V03)
    v04 = read(V04)

    assert v03["schema"] == "mts-contract/v0.3"
    assert v03["status"] == "accepted"
    assert v04["schema"] == "mts-contract/v0.4"
    assert v04["status"] == "accepted"
    assert v04["accepted"] is True
    assert v04["extends"] == v03["schema"]
    assert v04["dependsOn"] == [v03["schema"], "mts-proof/v0.3"]
    assert v04["baseContract"] == "contracts/mts-contract-v0.3.json"
    assert v04["versionBoundaries"]["v03ModifiedInPlace"] is False
    assert v04["versionBoundaries"]["v03ConformanceReplaced"] is False
    assert v04["versionBoundaries"]["compatibilitySemanticLayerAllowed"] is False


def test_v04_conformance_composes_v03_and_proof_v03_without_copying_vectors():
    base = read(V03_CONFORMANCE)
    proof = read(PROOF_CONFORMANCE)
    corpus = read(V04_CONFORMANCE)

    assert corpus["schema"] == "mts-conformance/v0.4"
    assert corpus["contract"] == "mts-contract/v0.4"
    assert corpus["status"] == "accepted"
    required = {item["role"]: item for item in corpus["requiredCorpora"]}
    assert set(required) == {"base-v0.3", "proof-v0.3"}
    assert required["base-v0.3"]["schema"] == base["schema"]
    assert required["base-v0.3"]["contract"] == base["contract"]
    assert required["proof-v0.3"]["schema"] == proof["schema"]
    assert required["proof-v0.3"]["contract"] == proof["contract"]
    assert corpus["releaseAssertions"]["allRequiredCorporaMustPass"] is True


def test_v04_publishes_exactly_the_accepted_proof_v03_base_surface():
    v04 = read(V04)
    proof = read(PROOF)

    assert proof["schema"] == "mts-proof/v0.3"
    assert proof["status"] == "accepted"
    assert proof["accepted"] is True
    assert v04["l5"]["proofContract"] == "contracts/mts-proof-v0.3.json"
    assert v04["l5"]["proofSchema"] == proof["schema"]
    assert v04["l5"]["trustedRelations"] == proof["trustedRelations"]
    assert set(v04["l5"]["trustedRelations"]) == {
        "ContextuallySatisfies",
        "Opens",
        "NoVisibleDefinition",
        "DefinitionConflict",
        "NonAddressableDefinitionTarget",
    }
    assert v04["l5"]["searchTrusted"] is False
    assert v04["l5"]["checkerTrusted"] is True


def test_every_published_proof_v03_conformance_judgment_replays_in_release():
    corpus = read(PROOF_CONFORMANCE)

    for vector in corpus["validJudgments"]:
        artifact = {
            "proofVersion": corpus["proofVersion"],
            "contractVersion": corpus["contractVersion"],
            "judgments": [vector["judgment"]],
        }
        assert check_proof_v03_data(artifact), vector["id"]


def test_v04_does_not_accept_multistep_classical_or_opening_equality_rules():
    boundary = read(V04)["l5"]

    assert boundary["genericCompositionAccepted"] is False
    assert boundary["judgmentOrderImpliesDependency"] is False
    assert boundary["openingImpliesEquality"] is False
    assert boundary["globalSubstitutionAccepted"] is False
    assert boundary["transitivityAccepted"] is False
    assert boundary["symmetryAccepted"] is False
    assert boundary["congruenceAccepted"] is False
    assert boundary["modusPonensAccepted"] is False


def test_v04_keeps_explicit_contextframe_and_excludes_subject_focus_research():
    context = read(V04)["contextBoundary"]

    assert context["acceptedContextInput"] == "explicit ContextFrame(start,end,parent?)"
    assert context["ambientInterpreterIdentity"] is False
    assert context["subjectIdentity"] is False
    assert context["currentFocusLinkRefIdentity"] is False
    assert context["deicticSubjectFocusExtensionAccepted"] is False
    assert context["futureResearchIssue"] == 148
    assert context["futureResearchVersion"] == "v0.5+"


def test_v04_preserves_l3_l4_boundaries_and_ten_root_definitions():
    v04 = read(V04)
    lines = [
        line.strip()
        for line in ROOT_PROGRAM.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]

    assert len(lines) == 10
    assert v04["rootDefinitionCount"] == 10
    assert v04["preservedSurface"]["relativeAnum"] == "RAW in production"
    assert v04["preservedSurface"]["persistentL4Accepted"] is False
    assert v04["preservedSurface"]["interpretMayRealize"] is False
    assert v04["preservedSurface"]["openDefinitionMayRealize"] is False


def test_v04_changes_downstream_pin_boundary_without_rewriting_v03_history():
    v03 = read(V03)
    v04 = read(V04)

    assert v03["downstream"]["aproverProofRepinAllowed"] is False
    assert v03["l5Boundary"]["currentProofContract"] == "contracts/mts-proof-v0.2.json"
    assert v04["downstream"]["aproverProofRepinAllowed"] is True
    assert v04["downstream"]["requiredProofSchema"] == "mts-proof/v0.3"
    assert v04["downstream"]["requiredProofContractVersion"] == "mts-contract/v0.3"
    assert v04["downstream"]["consumerMustReplayIndependently"] is True
    assert v04["downstream"]["consumerMayInventCompositionRules"] is False
    assert v04["downstream"]["consumerMayUseSubjectFocusSemantics"] is False
