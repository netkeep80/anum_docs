"""Non-normative decision guards for the MTS v0.6 foundation reset.

The decision selects one preferred research direction after executable challenges,
but deliberately keeps every production semantic migration blocked until Gates
E/A/N provide the remaining evidence.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DECISION = ROOT / "contracts/mts-foundation-direction-decision-v0.6.json"
MTS_V05 = ROOT / "contracts/mts-contract-v0.5.json"
ROOT_FIXTURE = ROOT / "tests/mtc_formulas.mtc"

EVIDENCE = {
    "mts-current-link-foundation-challenge/v0.6": ROOT
    / "contracts/mts-current-link-foundation-challenge-v0.6.json",
    "mts-interpretation-act-network-challenge/v0.6": ROOT
    / "contracts/mts-interpretation-act-network-challenge-v0.6.json",
    "mts-pole-projection-foundation-challenge/v0.6": ROOT
    / "contracts/mts-pole-projection-foundation-challenge-v0.6.json",
    "mts-constructor-destructor-foundation-challenge/v0.6": ROOT
    / "contracts/mts-constructor-destructor-foundation-challenge-v0.6.json",
}


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def historical_root() -> list[str]:
    return [
        line.strip()
        for line in ROOT_FIXTURE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def test_decision_is_candidate_only_and_not_published_through_v05():
    decision = read(DECISION)
    accepted = MTS_V05.read_text(encoding="utf-8")

    assert decision["schema"] == "mts-foundation-direction-decision/v0.6"
    assert decision["status"] == "candidate-decision"
    assert decision["accepted"] is False
    assert decision["issue"] == 179
    assert decision["schema"] not in accepted
    assert decision["migrationBoundary"]["productionMigrationAllowed"] is False
    assert decision["migrationBoundary"]["acceptedContractLinkAllowed"] is False
    assert decision["migrationBoundary"]["aproverRepinAllowed"] is False


def test_all_four_executable_foundation_challenges_are_exact_dependencies():
    decision = read(DECISION)

    assert decision["dependsOn"] == list(EVIDENCE)
    for schema, path in EVIDENCE.items():
        evidence = read(path)
        assert evidence["schema"] == schema
        assert evidence["accepted"] is False
        assert evidence["status"] == "candidate-challenge"


def test_preferred_direction_has_one_constructor_two_destructors_and_one_deictic_anchor():
    preferred = read(DECISION)["preferredDirection"]

    assert preferred["ontology"] == "everything is a link"
    assert preferred["linkConstructor"]["symbol"] == "⟼"
    assert preferred["rawStartDestructor"]["symbol"] == "♀"
    assert preferred["rawEndDestructor"]["symbol"] == "♂"
    assert preferred["currentLinkDeixis"]["symbol"] == "↑"
    assert preferred["currentLinkDeixis"]["mayBeVirtual"] is True
    assert preferred["currentLinkDeixis"]["requiresL4LinkRef"] is False
    assert preferred["derivedCurrentStart"] == "♀↑"
    assert preferred["derivedCurrentEnd"] == "↑♂"
    assert preferred["primitiveCurrentPolePronouns"] is False
    assert preferred["parentAscentPrimitive"] is False
    assert preferred["genericConstructiveProjectionWrapper"] is False
    assert preferred["contextFrameOntology"] is False
    assert preferred["separateSubjectOntology"] is False


def test_operator_roles_are_not_overloaded_in_the_preferred_direction():
    roles = read(DECISION)["operatorOrthogonality"]

    assert roles["constructor"] == "⟼"
    assert roles["destructors"] == ["♀", "♂"]
    assert roles["deixis"] == "↑"
    assert roles["inversion"] == "¬"
    assert roles["definitionIntroduction"] == ":"
    assert roles["judgments"] == ["=", "!="]
    assert roles[
        "sameOperatorMustNotCarryBothRawDestructorAndWrapperConstructorSemantics"
    ] is True


def test_historical_root_remains_immutable_but_is_not_a_foundation_veto():
    decision = read(DECISION)
    historical = historical_root()
    candidate = decision["preferredCandidateRoot"]

    assert len(historical) == decision["historicalBoundary"]["historicalRootDefinitionCount"] == 10
    assert historical[0] == "∞ : {◁ = ∞, ▷ = ∞}"
    assert candidate[0] == "∞ : ∞ ⟼ ∞"
    assert historical != candidate
    assert decision["historicalBoundary"]["historicalRootFixtureRemainsUnchanged"] is True
    assert decision["rootBoundary"]["rootCountIsFundamentalVeto"] is False
    assert decision["rootBoundary"]["candidateRootAccepted"] is False


def test_candidate_root_carrier_and_anum_direction_remain_unaccepted():
    decision = read(DECISION)
    carrier = decision["candidateRootCarrier"]
    anum = decision["anumDirection"]

    assert carrier == {
        "R": "(R,R)",
        "O": "(O,R)",
        "C": "(R,C)",
        "L": "(O,C)",
        "U": "(C,O)",
        "finite": True,
        "closed": True,
        "exactPairUnique": True,
        "acceptedAsProductionRoot": False,
    }
    assert anum["candidateOpen"] == "([)"
    assert anum["candidateClose"] == "(])"
    assert anum["candidateOne"] == "(⟼)"
    assert anum["candidateZero"] == "(↛)"
    assert anum["productionBoundaryChanged"] is False
    assert anum["requiresGate"] == 181


def test_context_frame_is_demoted_to_adapter_not_ontology():
    decision = read(DECISION)
    adapter = decision["contextAdapterBoundary"]

    assert adapter["legacyContextFrameMayTemporarilyAdaptCurrentLink"] is True
    assert adapter["legacyAdapterShape"] == (
        "VirtualCurrentLink(start,end) <-> ContextFrame(start,end)"
    )
    assert adapter["legacyParentFieldPreferredOntology"] is False
    assert adapter["adapterMayDefineNewSemantics"] is False
    assert adapter["adapterIsNotFoundation"] is True
    assert "ContextFrame as an ontological primitive" in decision[
        "demotedFromPreferredFoundation"
    ]


def test_full_act_and_local_observability_are_kept_distinct():
    boundary = read(DECISION)["fullActBoundary"]

    assert boundary["preferredOuterResearchShape"] == "Act = S_before ⟼ S_after"
    assert boundary["fullActOntologyImpliesFullActObservability"] is False
    assert boundary["currentLinkAnchorMayStayLocal"] is True
    assert boundary["genericIncomingSearchMeansCurrentAct"] is False
    assert boundary["nestingMustStartFromOrdinaryActStateLinks"] is True
    assert boundary["requiresGate"] == 182


def test_equality_stays_blocked_until_virtual_recursive_semantics_are_challenged():
    equality = read(DECISION)["equalityBoundary"]

    assert equality["candidateForCurrentXEqualAB"] == (
        "{♀(♀↑) = ♀(↑♂), (♀↑)♂ = (↑♂)♂}"
    )
    assert equality["materializedExactPairObservationAvailable"] is True
    assert equality["virtualRecursiveEqualityAccepted"] is False
    assert equality["genericGraphIsomorphismAcceptedAsEquality"] is False
    assert equality["requiresGate"] == 180


def test_all_three_falsification_gates_are_required_before_acceptance():
    decision = read(DECISION)
    gates = decision["nextGates"]

    assert gates["E"]["issue"] == 180
    assert gates["A"]["issue"] == 181
    assert gates["N"]["issue"] == 182
    assert decision["acceptanceGate"]["directionChosen"] is True
    assert decision["acceptanceGate"]["foundationAccepted"] is False
    assert decision["acceptanceGate"]["requiresAllGates"] == [180, 181, 182]
    assert decision["acceptanceGate"]["requiresExecutableVerticalSlice"] is True


def test_effect_and_migration_vetoes_preserve_existing_architecture_boundaries():
    decision = read(DECISION)
    effects = decision["effectsBoundary"]
    migration = decision["migrationBoundary"]

    assert effects["interpretMayRealize"] is False
    assert effects["findMayRealize"] is False
    assert effects["foundationDecisionMutatesL4"] is False
    assert migration["dualProjectionSemanticCompatibilityLayerAllowed"] is False
    assert migration["dualMeaningOfUpAllowed"] is False
    assert migration["ifLaterAcceptedUseOneCanonicalParserInterpreterPath"] is True
    assert migration["deleteSupersededSemanticPathAfterConsumerMigration"] is True
