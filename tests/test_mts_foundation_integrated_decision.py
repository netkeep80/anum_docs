"""Decision guards for integrated MTS v0.6 foundation issue #192."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DECISION = ROOT / "contracts/mts-foundation-integrated-decision-v0.6.json"
EQUALITY = ROOT / "contracts/mts-current-link-equality-decision-v0.6.json"
ANUM = ROOT / "contracts/mts-root-anum-foundation-decision-v0.6.json"
NESTING = ROOT / "contracts/mts-nesting-continuation-foundation-decision-v0.6.json"
CHALLENGE = ROOT / "contracts/mts-foundation-integrated-challenge-v0.6.json"
MTS_V05 = ROOT / "contracts/mts-contract-v0.5.json"
ROOT_FIXTURE = ROOT / "tests/mtc_formulas.mtc"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def historical_root() -> list[str]:
    return [
        line.strip()
        for line in ROOT_FIXTURE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def test_integrated_decision_resolves_gate_but_not_foundation_acceptance():
    decision = read(DECISION)

    assert decision["schema"] == "mts-foundation-integrated-decision/v0.6"
    assert decision["status"] == "candidate-decision"
    assert decision["accepted"] is False
    assert decision["integratedGateResolved"] is True
    assert decision["issue"] == 192
    assert decision["schema"] not in MTS_V05.read_text(encoding="utf-8")
    assert decision["migrationDesignPermission"]["acceptedFoundationContractAllowed"] is False
    assert decision["migrationDesignPermission"]["productionSemanticChangeAllowed"] is False


def test_integrated_decision_depends_on_all_three_gate_decisions_and_shared_challenge():
    decision = read(DECISION)

    assert decision["dependsOn"] == [
        read(EQUALITY)["schema"],
        read(ANUM)["schema"],
        read(NESTING)["schema"],
        read(CHALLENGE)["schema"],
    ]
    assert read(CHALLENGE)["status"] == "candidate-challenge"
    assert read(CHALLENGE)["accepted"] is False


def test_preferred_foundation_is_one_constructor_two_raw_destructors_one_current_anchor():
    foundation = read(DECISION)["preferredFoundation"]

    assert foundation["ontology"] == "everything is a link"
    assert foundation["constructor"] == "A ⟼ B"
    assert foundation["rawStartDestructor"] == "♀F"
    assert foundation["rawEndDestructor"] == "F♂"
    assert foundation["currentLinkDeixis"] == "↑"
    assert foundation["derivedCurrentStart"] == "♀↑"
    assert foundation["derivedCurrentEnd"] == "↑♂"
    assert foundation["primitiveCurrentPolePronouns"] is False
    assert foundation["parentAscentPrimitive"] is False
    assert foundation["ContextFrameOntology"] is False
    assert foundation["genericConstructiveProjectionWrapper"] is False
    assert foundation["separateSubjectOntology"] is False


def test_preserved_properties_include_readonly_local_equality_and_recursive_anum():
    preserved = read(DECISION)["preservedProperties"]

    assert preserved["allIsLinkDirection"] is True
    assert preserved["finiteCyclicCarrier"] is True
    assert preserved["interpretMayRealize"] is False
    assert preserved["findMayRealize"] is False
    assert preserved["localEqualityConstraint"] is True
    assert preserved["globalEqualityRewrite"] is False
    assert preserved["anonymousSquareOccurrenceLocal"] is True
    assert preserved["recursiveAnumV02GrammarReused"] is True
    assert preserved["recursiveAnumRawAlphabetChanged"] is False
    assert preserved["recursiveAnumCanonicalInverseChanged"] is False
    assert preserved["rootOpeningCollapseChanged"] is False
    assert preserved["protocolAnchorNamesChanged"] is False
    assert preserved["specialBoundaryPrecedenceChanged"] is False
    assert preserved["deterministicExplicitReplay"] is True
    assert preserved["optionalL4MaterializationOnly"] is True
    assert preserved["historicalV02ThroughV05Replay"] is True


def test_intentional_deltas_are_explicit_and_not_hidden_by_adapters():
    deltas = read(DECISION)["intentionalDeltas"]

    assert any("♀/♂ preferred semantics" in item for item in deltas)
    assert any("↑ preferred semantics" in item for item in deltas)
    assert any("◁/▷" in item for item in deltas)
    assert any("ContextFrame" in item for item in deltas)
    assert any("associative root" in item for item in deltas)
    assert any("shared R/O/C/L/U" in item for item in deltas)
    assert any("parent stack" in item for item in deltas)
    assert any("ten-root count" in item for item in deltas)


def test_integrated_evidence_records_positive_replay_and_negative_grammar_guard():
    evidence = read(DECISION)["integratedEvidence"]

    assert evidence["oneSharedCarrier"] is True
    assert evidence["sameLAndURefsUsedByRootEqualityAnumAndNesting"] is True
    assert evidence["localEqualityPositiveAndNegativeVectors"] is True
    assert evidence["allAcceptedRecursiveAnumV02VectorsReplay"] is True
    assert evidence["recursiveAnumGrammarWasNotExpanded"] is True
    assert evidence["tenBracketVectorStaysRaw"] == "10[01]"
    assert evidence["nestedExplicitPassingWithoutParent"] is True
    assert evidence["optionalMaterializationWithDifferentNumericRefs"] is True
    assert evidence["hiddenHistoricalSemanticBridgeUsed"] is False


def test_shared_root_anum_direction_remains_candidate_not_production():
    root = read(DECISION)["rootAnumDirection"]

    assert root["R"] == "(R,R)"
    assert root["O"] == "(O,R)"
    assert root["C"] == "(R,C)"
    assert root["L"] == "(O,C)"
    assert root["U"] == "(C,O)"
    assert root["open"] == "([)"
    assert root["close"] == "(])"
    assert root["one"] == "(⟼)"
    assert root["zero"] == "(↛)"
    assert root["protocol:1"] == "L"
    assert root["protocol:0"] == "U"
    assert root["candidateAcceptedAsProductionRoot"] is False


def test_decision_allows_migration_design_only_and_requires_one_target_path():
    permission = read(DECISION)["migrationDesignPermission"]

    assert permission["productionReferenceMigrationDesignAllowed"] is True
    assert permission["candidateConformanceDesignAllowed"] is True
    assert permission["singleCanonicalTargetPathRequired"] is True
    assert permission["productionSemanticChangeAllowed"] is False
    assert permission["acceptedFoundationContractAllowed"] is False
    assert permission["historicalRootReplacementAllowed"] is False
    assert permission["supersededSemanticDeletionAllowedNow"] is False
    assert permission["aproverRepinAllowed"] is False
    assert permission["newProofSemanticRulesAllowed"] is False


def test_migration_order_ends_in_consumer_move_deletion_and_separate_acceptance():
    order = read(DECISION)["migrationDesignOrder"]

    assert order[:3] == [
        "typed storage-neutral link/current substrate",
        "single target AST and grammar with standalone ↑ and raw ♀/♂",
        "read-only interpreter over explicit current semantic link",
    ]
    assert "candidate conformance combining preserved and intentional-delta vectors" in order
    assert "consumer/test/document migration" in order
    assert "delete superseded production semantics after consumers move" in order
    assert order[-1] == "separate acceptance review and additive release"


def test_compatibility_veto_prevents_dual_semantics_and_hidden_context():
    veto = read(DECISION)["compatibilityVeto"]

    assert veto["dualMeaningOfUp"] is False
    assert veto["dualMeaningOfFemaleMale"] is False
    assert veto["hiddenContextFrameSemantics"] is False
    assert veto["specialCaseRootBypassesLinkAlgebra"] is False
    assert veto["parallelRecursiveAnumGrammar"] is False
    assert veto["sourceSpellingIdentity"] is False
    assert veto["implicitRealization"] is False
    assert veto["proofAheadOfAcceptedL2"] is False


def test_historical_root_is_still_immutable_until_migration_acceptance():
    lines = historical_root()
    permission = read(DECISION)["migrationDesignPermission"]

    assert len(lines) == 10
    assert lines[0] == "∞ : {◁ = ∞, ▷ = ∞}"
    assert permission["historicalRootReplacementAllowed"] is False


def test_next_gate_is_migration_epic_then_separate_acceptance():
    next_gate = read(DECISION)["nextGate"]

    assert next_gate["name"] == "production-reference-migration-epic"
    assert next_gate["mayDesignAndImplementCandidateReferencePath"] is True
    assert next_gate["mayChangeCurrentProductionPathImmediately"] is False
    assert next_gate["mustEndWithSeparateAcceptanceGate"] is True
