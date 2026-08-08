"""Decision guards for Foundation v0.6 Gate E / issue #180."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DECISION = ROOT / "contracts/mts-current-link-equality-decision-v0.6.json"
DIRECTION = ROOT / "contracts/mts-foundation-direction-decision-v0.6.json"
CHALLENGE = ROOT / "contracts/mts-current-link-equality-challenge-v0.6.json"
MTS_V05 = ROOT / "contracts/mts-contract-v0.5.json"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_gate_e_decision_is_resolved_but_not_foundation_acceptance():
    decision = read(DECISION)

    assert decision["schema"] == "mts-current-link-equality-decision/v0.6"
    assert decision["status"] == "candidate-decision"
    assert decision["accepted"] is False
    assert decision["gateResolved"] is True
    assert decision["issue"] == 180
    assert decision["gateOutcome"]["foundationAccepted"] is False
    assert decision["gateOutcome"]["productionInterpreterMigrationAllowed"] is False
    assert decision["veto"]["acceptedContractLinkAllowed"] is False


def test_decision_depends_exactly_on_direction_and_executable_challenge():
    decision = read(DECISION)
    direction = read(DIRECTION)
    challenge = read(CHALLENGE)

    assert decision["dependsOn"] == [direction["schema"], challenge["schema"]]
    assert direction["status"] == "candidate-decision"
    assert direction["accepted"] is False
    assert challenge["status"] == "candidate-challenge"
    assert challenge["accepted"] is False
    assert decision["schema"] not in MTS_V05.read_text(encoding="utf-8")


def test_current_link_is_selected_as_storage_neutral_virtual_semantic_link():
    current = read(DECISION)["currentLinkDecision"]

    assert current["currentAnchor"] == "↑"
    assert current["rawStart"] == "♀↑"
    assert current["rawEnd"] == "↑♂"
    assert current["requiresContextFrame"] is False
    assert current["requiresL4LinkRef"] is False
    assert current["requiresMaterialization"] is False
    assert current["supportsSelfCycle"] is True
    assert current["supportsMutualCycle"] is True
    assert current["localReferenceIdentityIsPersistentIdentity"] is False
    assert current["sourceSpanIsIdentity"] is False
    assert current["displayLabelIsIdentity"] is False
    assert current["decision"] == "preferred-for-v0.6-foundation-candidate"


def test_atomic_equality_is_local_representative_constraint_only():
    atomic = read(DECISION)["equalityDecision"]["atomicConstraint"]

    assert atomic["scope"] == "one interpretation/replay state"
    assert atomic["globalRewrite"] is False
    assert atomic["globalSubstitution"] is False
    assert atomic["genericCongruence"] is False
    assert atomic["recursiveGraphIsomorphism"] is False
    assert atomic["recursiveBisimulation"] is False
    assert atomic["decision"] == "preferred-atomic-substrate"


def test_derived_link_comparison_checks_immediate_raw_poles_without_recursive_topology():
    comparison = read(DECISION)["equalityDecision"]["derivedLinkComparison"]

    assert comparison["currentContext"] == "X=(A,B)"
    assert comparison["definitionShape"] == "{♀A = ♀B, A♂ = B♂}"
    assert comparison["candidateL2"] == (
        "{♀(♀↑) = ♀(↑♂), (♀↑)♂ = (↑♂)♂}"
    )
    assert comparison["comparesAAndBRefDirectly"] is False
    assert comparison["recursesThroughReachableTopology"] is False
    assert comparison["mayClassifyDistinctVirtualOccurrencesWithSamePoleRefsEqual"] is True
    assert comparison["mergesThoseOccurrenceRefsGlobally"] is False
    assert comparison["decision"] == "preferred-derived-comparison-for-foundation-candidate"
    assert comparison["acceptedAsProductionL2"] is False


def test_cycles_do_not_force_recursive_graph_equality():
    cycle = read(DECISION)["cycleDecision"]

    assert cycle["selfCycleNeedsRecursiveEqualityAlgorithm"] is False
    assert cycle["mutualCycleNeedsRecursiveEqualityAlgorithm"] is False
    assert cycle["recursiveTopologyComparatorMayStillExistAsSeparateResearchTool"] is True
    assert cycle["recursiveTopologyComparatorIsL2EqualityByDefault"] is False


def test_occurrence_identity_remains_distinct_from_pair_equality():
    boundary = read(DECISION)["occurrenceBoundary"]

    assert boundary["virtualNodeOccurrenceIdentityMayDifferFromSemanticPairEquality"] is True
    assert boundary["sameOrderedPoleRefsMaySatisfyDerivedLinkComparison"] is True
    assert boundary["sameOrderedPoleRefsForceVirtualOccurrenceMerge"] is False
    assert boundary["samePrintedSourceCreatesCoreference"] is False
    assert boundary["anonymousSquareOccurrenceLocal"] is True
    assert boundary["holeUnificationRemainsLocal"] is True


def test_l4_exact_pair_storage_is_compatible_but_not_virtual_ontology():
    boundary = read(DECISION)["materializationBoundary"]

    assert boundary["l4ExactPairCanonicalizationIsCompatible"] is True
    assert boundary["materializedSameOrderedPairMayReuseOneLinkRef"] is True
    assert boundary["l4CanonicalIdentityDefinesVirtualOntology"] is False
    assert boundary["virtualAndMaterializedRepresentationRefsNeedNotMatch"] is True
    assert boundary["interpretMayRealize"] is False


def test_contextframe_is_only_a_historical_adapter_after_gate_e():
    adapter = read(DECISION)["historicalAdapterBoundary"]

    assert adapter["ContextFrameStartEndCanAdaptVirtualCurrentLink"] is True
    assert adapter["adapterDirection"] == (
        "ContextFrame(start,end) <-> VirtualCurrentLink(start,end)"
    )
    assert adapter["adapterHasIndependentSemanticMeaning"] is False
    assert adapter["parentIncludedInPreferredCurrentLinkValue"] is False


def test_gate_e_rejects_hidden_stronger_equality_and_storage_defaults():
    rejected = {item["model"]: item["reason"] for item in read(DECISION)["rejectedDefaults"]}

    assert "ContextFrame as the semantic current-link ontology" in rejected
    assert "↑ must be a materialized L4 LinkRef" in rejected
    assert "whole-graph isomorphism/bisimulation is the implicit meaning of =" in rejected
    assert "equality creates global textual rewriting/substitutivity" in rejected


def test_proof_and_migration_boundaries_remain_closed():
    decision = read(DECISION)
    proof = decision["proofBoundary"]
    veto = decision["veto"]

    assert proof["proofArtifactMustSerializeCurrentLinkSemanticsExplicitly"] is True
    assert proof["checkerMayReadAmbientInterpreterState"] is False
    assert proof["checkerMayAssumeL4IdentityForVirtualCurrent"] is False
    assert proof["genericEqualityInferenceRulesAdded"] is False
    assert proof["globalSubstitutionRuleAdded"] is False
    assert veto["productionParserChangeAllowed"] is False
    assert veto["productionInterpreterChangeAllowed"] is False
    assert veto["aproverRepinAllowed"] is False
    assert veto["recursiveGraphEqualityPromotionAllowed"] is False
    assert veto["globalRewritePromotionAllowed"] is False


def test_gate_e_closes_only_itself_and_leaves_root_anum_and_nesting_gates():
    decision = read(DECISION)

    assert decision["gateOutcome"]["currentLinkSubstrateResolved"] is True
    assert decision["gateOutcome"]["atomicEqualityBoundaryResolved"] is True
    assert decision["gateOutcome"]["derivedLinkComparisonDirectionResolved"] is True
    assert decision["gateOutcome"]["productionSyntaxResolved"] is False
    assert decision["gateOutcome"]["remainingFoundationGates"] == [181, 182]
    assert decision["nextDependencies"] == {
        "rootAnumGate": 181,
        "nestingGate": 182,
        "foundationDirectionIssue": 179,
    }
