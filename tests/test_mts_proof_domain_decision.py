"""Executable guards for the non-normative MTS proof-domain decision v0.3."""

import json
from pathlib import Path


ROOT = Path(__file__).parents[1]
DECISION = ROOT / "contracts" / "mts-proof-domain-decision-v0.3.json"
JUDGMENT_DECISION = ROOT / "contracts" / "mts-proof-judgment-decision-v0.3.json"
JUDGMENT_CHALLENGE = ROOT / "contracts" / "mts-proof-judgment-challenge-v0.3.json"
JUDGMENT_CORPUS = ROOT / "contracts" / "mts-proof-judgment-conformance-v0.3.json"
MTS_V03 = ROOT / "contracts" / "mts-contract-v0.3.json"
PROOF_V02 = ROOT / "contracts" / "mts-proof-v0.2.json"
OPENING = ROOT / "contracts" / "mts-definition-opening-v0.3.json"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_decision_is_non_normative_and_depends_on_green_replay_challenge_surface():
    data = read(DECISION)
    challenge = read(JUDGMENT_CHALLENGE)
    proof = read(PROOF_V02)

    assert data["schema"] == "mts-proof-domain-decision/v0.3"
    assert data["status"] == "candidate-decision"
    assert data["dependsOn"] == [
        "mts-contract/v0.3",
        "mts-proof-judgment-decision/v0.3",
        challenge["schema"],
        proof["schema"],
    ]
    assert data["acceptedContractLinkAllowed"] is False
    assert data["productionProofChangeAllowed"] is False
    assert data["trustedRuleChangeAllowed"] is False
    assert proof["checker"]["trustedRuleSet"] == ["interpret"]
    assert data["schema"] not in MTS_V03.read_text(encoding="utf-8")


def test_only_two_layer_model_is_preferred_and_nothing_is_accepted_yet():
    models = {item["id"]: item for item in read(DECISION)["models"]}

    assert set(models) == {"A", "B", "C", "D"}
    assert models["A"]["verdict"] == "reject"
    assert models["B"]["verdict"] == "reject"
    assert models["C"]["verdict"] == "preferred-candidate"
    assert models["D"]["verdict"] == "reject"
    assert all(item["accepted"] is False for item in models.values())

    preferred = read(DECISION)["preferredCandidate"]
    assert preferred["boundary"] == "certificate validity and derivation validity are different questions"
    assert preferred["operationalReplayClaim"]["compositionSemantics"] == "none"
    assert preferred["operationalReplayClaim"]["isTheoremByItself"] is False
    assert preferred["operationalReplayClaim"]["isDerivationPremiseByItself"] is False
    assert preferred["derivationJudgment"]["acceptedInThisDecision"] is False
    assert preferred["derivationJudgment"]["mustNotDefaultToGlobalTruth"] is True


def test_replay_challenge_really_contains_positive_and_negative_exact_claims():
    corpus = read(JUDGMENT_CORPUS)
    interpret = {item["id"]: item for item in corpus["interpretJudgments"]}
    opening = {item["id"]: item for item in corpus["openingJudgments"]}

    assert interpret["interpret-local-alias-success"]["expected"]["success"] is True
    assert interpret["interpret-aroot-negative-result"]["expected"]["success"] is False
    assert opening["open-explicit-root-infinity"]["expected"]["kind"] == "match"
    assert opening["open-no-hidden-root"]["expected"] == {"kind": "no-match"}
    assert opening["open-conflict"]["expected"] == {"kind": "conflict"}
    assert opening["open-non-addressable"]["expected"] == {"kind": "non-addressable"}

    boundary = read(DECISION)["negativeResultBoundary"]
    assert boundary["negativeReplayClaimCanBeValid"] is True
    assert boundary["negativeReplayClaimAutomaticallyBecomesTheorem"] is False
    assert boundary["absenceOrConflictCanBeUsedAsPremiseWithoutRule"] is False


def test_open_definition_match_still_does_not_become_equality_or_trusted_rule():
    opening = read(OPENING)
    boundary = read(DECISION)["definitionOpeningBoundary"]

    assert opening["operation"]["assertsEquality"] is False
    assert opening["operation"]["producesProofStep"] is False
    assert boundary["openingMatchCanBeCertified"] is True
    assert boundary["openingNegativeResultCanBeCertified"] is True
    assert boundary["openingMatchEstablishesEquality"] is False
    assert boundary["openingMatchEstablishesGlobalRewrite"] is False
    assert boundary["openingMatchIsTrustedDerivationRule"] is False
    assert boundary["returnedRhsEvaluationImplicit"] is False


def test_v02_compatibility_reframes_replay_without_rewriting_artifacts():
    proof = read(PROOF_V02)
    compatibility = read(DECISION)["v02Compatibility"]

    assert proof["schema"] == "mts-proof/v0.2"
    assert proof["checker"]["trustedRuleSet"] == ["interpret"]
    assert compatibility["mtsProofV02FileNameUnchanged"] is True
    assert compatibility["mtsProofV02TrustedRuleSetUnchanged"] == ["interpret"]
    assert compatibility["interpretStepMayBeViewedAsOperationalCertificate"] is True
    assert compatibility["reinterpretV02InterpretAsGeneralTheorem"] is False
    assert compatibility["retroactiveArtifactRewriteRequired"] is False


def test_future_derivation_judgment_cannot_hide_relation_context_or_search_trace():
    constraints = read(DECISION)["futureDerivationShapeConstraints"]

    assert constraints["genericGammaTurnstileImported"] is False
    assert constraints["globalFormulaTruthImported"] is False
    assert constraints["goalMustNameItsRelation"] is True
    assert constraints["premisesMustNameAcceptedEvidenceOrJudgments"] is True
    assert constraints["contextAndMemoryMustNotBeHidden"] is True
    assert constraints["proofSearchTraceIsNotPremise"] is True
    assert constraints["cyclesMustRemainFinite"] is True


def test_all_next_lift_families_remain_unaccepted_and_require_soundness_challenge():
    families = {item["id"]: item for item in read(DECISION)["candidateLiftFamiliesForNextChallenge"]}

    assert set(families) == {
        "interpret-result-relation",
        "definition-opening-relation",
        "constraint-satisfaction-lift",
        "negative-evidence-lift",
    }
    assert all(item["accepted"] is False for item in families.values())
    assert "A = F" not in families["definition-opening-relation"]["question"]

    gate = read(DECISION)["nextGate"]
    assert gate["artifact"] == "mts-proof-lifting-challenge/v0.3"
    assert gate["status"] == "candidate-challenge"
    assert gate["mustNotChangeProductionProofSemantics"] is True
    assert "which proposed lifts have counterexamples on small finite carriers" in gate["requiredQuestions"]


def test_classical_and_global_rules_are_still_rejected_or_deferred():
    rejected = set(read(DECISION)["stillRejectedOrDeferred"])

    assert {
        "successful opening implies equality",
        "all successful operations are theorems",
        "all replayable negative results are theorems",
        "global textual substitution",
        "unrestricted symmetry",
        "unrestricted transitivity",
        "unrestricted congruence",
        "modus ponens",
        "generic proof DAG composition",
        "proof by recursive textual normalization",
    } == rejected
