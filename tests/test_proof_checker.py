"""Negative-heavy tests for the replay-only trusted MTS v0.2 proof kernel."""

import json
from pathlib import Path

from core.proof_checker import (
    DistinguishedLink,
    ExpectedSubstitution,
    InterpretProofStep,
    ProofContext,
    ProofObject,
    check_proof,
)

CONTRACT = Path(__file__).parents[1] / "contracts" / "mts-proof-v0.2.json"


def test_proof_contract_is_candidate_and_trusts_only_interpret_replay():
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))

    assert contract["schema"] == "mts-proof/v0.2"
    assert contract["status"] == "candidate"
    assert contract["checker"]["trustedRuleSet"] == ["interpret"]
    assert contract["checker"]["mayMaterialize"] is False
    assert "transitivity" in contract["explicitlyNotTrusted"]
    assert "modus-ponens" in contract["explicitlyNotTrusted"]


def test_checker_replays_occurrence_local_substitution():
    proof = ProofObject(
        steps=(
            InterpretProofStep(
                expression="[] = ◁",
                context=ProofContext(start=10, end=12),
                expected_substitutions=(ExpectedSubstitution((0,), 10),),
            ),
        )
    )

    assert check_proof(proof)


def test_checker_rejects_forged_substitution():
    proof = ProofObject(
        steps=(
            InterpretProofStep(
                expression="[] = ◁",
                context=ProofContext(start=10, end=12),
                expected_substitutions=(ExpectedSubstitution((0,), 12),),
            ),
        )
    )

    assert not check_proof(proof)


def test_checker_replays_structural_link_decomposition():
    proof = ProofObject(
        steps=(
            InterpretProofStep(
                expression="30 = [] ⟼ []",
                context=ProofContext(start=10, end=10),
                symbols=(("30", 30),),
                distinguished_memory=(DistinguishedLink(30, 2, 3),),
                expected_substitutions=(
                    ExpectedSubstitution((1, 0), 2),
                    ExpectedSubstitution((1, 1), 3),
                ),
            ),
        )
    )

    assert check_proof(proof)


def test_checker_rejects_unknown_rule_instead_of_extending_trust():
    proof = ProofObject(
        steps=(
            InterpretProofStep(
                expression="[] = ◁",
                context=ProofContext(start=10, end=12),
                expected_substitutions=(ExpectedSubstitution((0,), 10),),
                rule="transitivity",
            ),
        )
    )

    assert not check_proof(proof)


def test_checker_rejects_wrong_contract_provenance():
    proof = ProofObject(steps=(), contract_version="mts-contract/v0.1")

    assert not check_proof(proof)


def test_checker_does_not_realize_missing_distinguished_link():
    proof = ProofObject(
        steps=(
            InterpretProofStep(
                expression="30 = 2 ⟼ 3",
                context=ProofContext(start=10, end=10),
                symbols=(("30", 30), ("2", 2), ("3", 3)),
                distinguished_memory=(),
            ),
        )
    )

    assert not check_proof(proof)
