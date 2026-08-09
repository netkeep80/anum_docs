"""Decision guards for Foundation v0.6 Gate A / issue #181."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DECISION = ROOT / "contracts/mts-root-anum-foundation-decision-v0.6.json"
DIRECTION = ROOT / "contracts/mts-foundation-direction-decision-v0.6.json"
EQUALITY = ROOT / "contracts/mts-current-link-equality-decision-v0.6.json"
CHALLENGE = ROOT / "contracts/mts-root-anum-foundation-challenge-v0.6.json"
CORPUS = ROOT / "contracts/anum-boundary-conformance-candidate-v0.6.json"
MTS_V05 = ROOT / "contracts/mts-contract-v0.5.json"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_gate_a_is_resolved_without_foundation_or_production_acceptance():
    decision = read(DECISION)

    assert decision["schema"] == "mts-root-anum-foundation-decision/v0.6"
    assert decision["status"] == "candidate-decision"
    assert decision["accepted"] is False
    assert decision["gateResolved"] is True
    assert decision["issue"] == 181
    assert decision["gateOutcome"]["foundationAccepted"] is False
    assert decision["veto"]["acceptedContractLinkAllowed"] is False
    assert decision["veto"]["productionRootChangeAllowed"] is False
    assert decision["veto"]["productionAnumChangeAllowed"] is False


def test_decision_depends_on_direction_gate_e_and_executable_gate_a_evidence():
    decision = read(DECISION)

    assert decision["dependsOn"] == [
        read(DIRECTION)["schema"],
        read(EQUALITY)["schema"],
        read(CHALLENGE)["schema"],
        read(CORPUS)["schema"],
    ]
    assert read(CHALLENGE)["status"] == "candidate-challenge"
    assert read(CORPUS)["status"] == "candidate-challenge-corpus"
    assert decision["schema"] not in MTS_V05.read_text(encoding="utf-8")


def test_shared_root_carrier_is_the_preferred_gate_a_direction():
    root = read(DECISION)["rootDecision"]

    assert root["preferredCarrier"] == {
        "R": "(R,R)",
        "O": "(O,R)",
        "C": "(R,C)",
        "L": "(O,C)",
        "U": "(C,O)",
    }
    assert root["finite"] is True
    assert root["closed"] is True
    assert root["exactPairUnique"] is True
    assert root["rootSelfCycleUsesContext"] is False
    assert root["genericConstructiveStartEndWrapperRequired"] is False
    assert root["decision"] == "preferred-for-v0.6-foundation-candidate"
    assert root["acceptedAsProductionRoot"] is False


def test_anum_boundary_uses_explicit_root_meanings_and_same_protocol_anchor_names():
    anum = read(DECISION)["anumBoundaryDecision"]

    assert anum["open"] == "([)"
    assert anum["close"] == "(])"
    assert anum["one"] == "(⟼)"
    assert anum["zero"] == "(↛)"
    assert anum["protocol:1"] == "L"
    assert anum["protocol:0"] == "U"
    assert anum["anchorNamesChanged"] is False
    assert anum["anchorDerivationChanged"] is True
    assert anum["specialBoundary"] == {
        "[[": "Link(O,O), remains raw",
        "[]": "Link(O,C)=L, aliases protocol:1",
        "][": "Link(C,O)=U, aliases protocol:0",
        "]]": "Link(C,C), remains raw",
    }
    assert anum["acceptedAsProductionBoundary"] is False


def test_recursive_anum_v02_is_reused_without_a_parallel_v06_grammar():
    recursive = read(DECISION)["recursiveAnumDecision"]

    assert recursive["reuseAcceptedV02Grammar"] is True
    assert recursive["rawAlphabetChanged"] is False
    assert recursive["specialBoundaryPrecedenceChanged"] is False
    assert recursive["protocolAnchorNamesChanged"] is False
    assert recursive["rootOpeningCollapseChanged"] is False
    assert recursive["canonicalInverseChanged"] is False
    assert recursive["occurrencePreservingNodePolicyChanged"] is False
    assert recursive["quoteContextChanged"] is False
    assert recursive["relativeContextChanged"] is False
    assert recursive["memoryDependencyAdded"] is False
    assert recursive["allAcceptedV02CorpusVectorsReplay"] is True
    assert recursive["noParallelV06RecursiveGrammar"] is True


def test_sharing_delta_is_classified_without_promoting_engineering_carrier_identity():
    sharing = read(DECISION)["sharingTopologyDecision"]

    assert sharing["openHistoricalAndCandidateIsomorphic"] is True
    assert sharing["closeHistoricalAndCandidateIsomorphic"] is True
    assert sharing["oneHistoricalAndCandidateIsomorphic"] is False
    assert sharing["zeroHistoricalAndCandidateIsomorphic"] is False
    assert sharing["carrierIsomorphicIsL2Equality"] is False
    assert sharing["historicalOccurrenceCopyPolicyIsSemanticIdentityContract"] is False
    assert sharing["candidateSharedRootIsPreferredSemanticDirection"] is True
    assert sharing["candidateSharedRootAcceptedAsProductionIdentity"] is False


def test_round_form_a2_is_not_needed_for_anum_but_remains_open_for_broader_l2():
    a2 = read(DECISION)["roundFormA2Decision"]

    assert a2["requiredByAnumBoundary"] is False
    assert a2["requiredByRecursiveAnum"] is False
    assert a2["removalChangesROCLU"] is False
    assert a2["broaderL2NeedResolved"] is False
    assert a2["rootCountIsVeto"] is False


def test_historical_anum_and_root_snapshots_remain_immutable_and_replayable():
    historical = read(DECISION)["historicalBoundary"]

    assert historical["anumBoundaryProjectionV02Immutable"] is True
    assert historical["anumRecursiveDenotationV02Immutable"] is True
    assert historical["historicalRootFixtureImmutable"] is True
    assert historical["historicalReplayRemainsValid"] is True
    assert historical["retroactiveReinterpretation"] is False


def test_l4_is_compatible_but_not_promoted_into_l3_identity():
    l4 = read(DECISION)["l4Boundary"]

    assert l4["candidateRootRepresentableByExactPairMemory"] is True
    assert l4["rootConstructionRequiresImplicitRealization"] is False
    assert l4["recursiveAnumReadsL4"] is False
    assert l4["findMayRealize"] is False
    assert l4["interpretMayRealize"] is False
    assert l4["l4LinkRefDefinesL3OccurrenceIdentity"] is False


def test_gate_a_leaves_only_nesting_gate_before_integrated_foundation_slice():
    decision = read(DECISION)

    assert decision["gateOutcome"]["rootCarrierDirectionResolved"] is True
    assert decision["gateOutcome"]["anumBoundaryDirectionResolved"] is True
    assert decision["gateOutcome"]["recursiveAnumCompatibilityResolved"] is True
    assert decision["gateOutcome"]["sharingTopologyDeltaClassified"] is True
    assert decision["gateOutcome"]["productionRootSyntaxResolved"] is False
    assert decision["gateOutcome"]["remainingFoundationGates"] == [182]
    assert decision["nextDependencies"]["nestingGate"] == 182
    assert "integrated v0.6 foundation vertical-slice" in decision[
        "nextDependencies"
    ]["afterGateN"]


def test_proof_and_migration_remain_blocked():
    decision = read(DECISION)
    proof = decision["proofBoundary"]
    veto = decision["veto"]

    assert proof["proofMayAssumeHistoricalAnchorInternalTopology"] is False
    assert proof["proofMayUseProtocolAnchorNames"] is True
    assert proof["newRootProofRulesAccepted"] is False
    assert proof["proofRepinAllowed"] is False
    assert veto["productionParserChangeAllowed"] is False
    assert veto["aproverRepinAllowed"] is False
    assert veto["historicalOccurrenceCopyTopologyMayBePromotedToSemanticIdentity"] is False
    assert veto["dualAnumGrammarCompatibilityLayerAllowed"] is False
