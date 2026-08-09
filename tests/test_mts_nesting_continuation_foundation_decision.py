"""Decision guards for Foundation v0.6 Gate N / issue #182."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DECISION = ROOT / "contracts/mts-nesting-continuation-foundation-decision-v0.6.json"
DIRECTION = ROOT / "contracts/mts-foundation-direction-decision-v0.6.json"
EQUALITY = ROOT / "contracts/mts-current-link-equality-decision-v0.6.json"
ANUM = ROOT / "contracts/mts-root-anum-foundation-decision-v0.6.json"
CHALLENGE = ROOT / "contracts/mts-nesting-continuation-foundation-challenge-v0.6.json"
MTS_V05 = ROOT / "contracts/mts-contract-v0.5.json"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_gate_n_is_resolved_without_overall_foundation_acceptance():
    decision = read(DECISION)

    assert decision["schema"] == "mts-nesting-continuation-foundation-decision/v0.6"
    assert decision["status"] == "candidate-decision"
    assert decision["accepted"] is False
    assert decision["gateResolved"] is True
    assert decision["issue"] == 182
    assert decision["gateOutcome"]["foundationAccepted"] is False
    assert decision["veto"]["acceptedContractLinkAllowed"] is False
    assert decision["veto"]["productionInterpreterChangeAllowed"] is False


def test_gate_n_depends_on_all_prior_foundation_decisions_and_its_challenge():
    decision = read(DECISION)

    assert decision["dependsOn"] == [
        read(DIRECTION)["schema"],
        read(EQUALITY)["schema"],
        read(ANUM)["schema"],
        read(CHALLENGE)["schema"],
    ]
    assert read(CHALLENGE)["status"] == "candidate-challenge"
    assert read(CHALLENGE)["accepted"] is False
    assert decision["schema"] not in MTS_V05.read_text(encoding="utf-8")


def test_only_one_current_link_deictic_anchor_is_selected():
    deictic = read(DECISION)["deicticDecision"]

    assert deictic["primitiveAnchors"] == ["↑"]
    assert deictic["currentMeaning"] == "↑ -> one current semantic link"
    assert deictic["secondParentOrOuterAnchor"] is False
    assert deictic["secondAnchorPermanentlyForbidden"] is False
    assert deictic["secondAnchorRequiresFutureFiniteCounterexample"] is True
    assert deictic["oldUpAsDepthCounter"] is False
    assert deictic["primitiveCurrentPolePronouns"] is False
    assert deictic["derivedCurrentStart"] == "♀↑"
    assert deictic["derivedCurrentEnd"] == "↑♂"


def test_nested_data_and_continuation_are_explicit_link_structure():
    nesting = read(DECISION)["nestingDecision"]

    assert nesting["outerDataPolicy"].startswith("data required by a child is explicitly included")
    assert nesting["deepNestingPolicy"].startswith("nested current structures are ordinary binary links")
    assert nesting["continuationPolicy"].startswith("result and continuation inputs are explicit links")
    assert nesting["callPolicy"].startswith("calls are ordinary relations")
    assert nesting["historyPolicy"].startswith("history/continuation order is represented by ordinary links")
    assert nesting["hostContextFrameParent"] is False
    assert nesting["hostReturnAddress"] is False
    assert nesting["hiddenCallStack"] is False
    assert nesting["implicitCallerSearch"] is False


def test_full_act_exists_without_becoming_implicitly_observable():
    act = read(DECISION)["actDecision"]

    assert act["outerShape"] == "Act = S_before ⟼ S_after"
    assert act["commandAndActualActDistinct"] is True
    assert act["resultIsExplicitInGraph"] is True
    assert act["fullActOntologyImpliesFullActObservability"] is False
    assert act["formulaAutomaticallyObservesCallerAct"] is False
    assert act["formulaAutomaticallyObservesInterpreterIdentity"] is False


def test_explicit_passing_examples_are_the_selected_nesting_mechanism():
    passing = read(DECISION)["explicitPassingDecision"]

    assert passing["childExample"] == "XC=(O,L) gives ♀↑=O and ↑♂=L"
    assert passing["grandchildExample"] == (
        "XG=(XC,G) allows ♀(♀↑)=O and (♀↑)♂=L"
    )
    assert passing["continuationExample"] == "XR=(O,R) gives outer data and explicit child result"
    assert passing["unpassedOuterDataVisible"] is False
    assert passing["arbitraryFiniteDataMayBePackedIntoBinaryLinks"] is True
    assert passing["passingDataCreatesNewPrimitive"] is False


def test_generic_incoming_search_is_not_promoted_to_parent_or_caller_semantics():
    incoming = read(DECISION)["incomingSearchDecision"]

    assert incoming["genericIncomingSearchMayBeAmbiguous"] is True
    assert incoming["genericIncomingSearchDefinesParent"] is False
    assert incoming["genericIncomingSearchDefinesCaller"] is False
    assert incoming["implicitAssociativeSearchMayChangeDeicticMeaning"] is False
    assert incoming["futureCallerObservationRequiresExplicitAcceptedRelation"] is True


def test_historical_parent_ascent_is_demoted_not_reinterpreted_in_place():
    historical = read(DECISION)["historicalBoundary"]

    assert historical["ContextFrameParentPreferredOntology"] is False
    assert historical["oldParentAscentForms"] == ["↑◁", "↑▷", "↑↑◁", "↑↑▷"]
    assert historical["oldParentAscentAutomaticallyPreserved"] is False
    assert historical["historicalV02ThroughV05ReplayImmutable"] is True
    assert historical["migrationDirection"].startswith(
        "replace hidden outer-frame reads with explicit link data"
    )


def test_nested_replay_boundary_contains_no_hidden_stack_or_ambient_identity():
    replay = read(DECISION)["proofReplayBoundary"]

    assert replay["nestedReplayInputs"].startswith("finite serialized act/state graph")
    assert replay["serializeHostParentStack"] is False
    assert replay["readAmbientSession"] is False
    assert replay["readAmbientInterpreterIdentity"] is False
    assert replay["sameSerializedGraphAndCurrentDeterministic"] is True
    assert replay["newParentProofRuleAccepted"] is False


def test_second_deictic_anchor_requires_future_counterexample_not_convenience():
    policy = read(DECISION)["counterexamplePolicy"]

    assert policy["currentRequiredCorpusNeedsSecondAnchor"] is False
    assert policy["universalTheoremNoSecondAnchorEverNeeded"] is False
    assert "smallest finite semantic counterexample" in policy["futureExtensionRule"]
    assert policy["convenienceIsSufficientJustification"] is False


def test_all_isolated_foundation_gates_are_resolved_but_integrated_slice_is_next():
    decision = read(DECISION)

    assert decision["gateOutcome"]["hostParentRemovedFromPreferredFoundation"] is True
    assert decision["gateOutcome"]["oneAnchorSufficientForRequiredNestedCorpus"] is True
    assert decision["gateOutcome"]["explicitPassingDirectionResolved"] is True
    assert decision["gateOutcome"]["continuationDirectionResolved"] is True
    assert decision["gateOutcome"]["allIsolatedFoundationGatesResolved"] is True
    assert decision["gateOutcome"]["foundationAccepted"] is False
    assert decision["gateOutcome"]["nextRequiredGate"] == (
        "integrated-v0.6-foundation-vertical-slice"
    )


def test_production_and_aprover_remain_blocked_until_integrated_slice():
    decision = read(DECISION)
    veto = decision["veto"]

    assert veto["productionParserChangeAllowed"] is False
    assert veto["productionInterpreterChangeAllowed"] is False
    assert veto["aproverRepinAllowed"] is False
    assert veto["hiddenParentStackAllowed"] is False
    assert veto["dualMeaningOfUpAllowed"] is False
    assert veto["secondDeicticPrimitiveAllowedWithoutCounterexample"] is False
    assert decision["nextDependencies"]["productionMigrationBeforeIntegratedSlice"] is False
