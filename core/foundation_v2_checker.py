"""Integrated Foundation-v2 trusted proof/checker replay.

This module intentionally contains no new operator semantics. It composes the
already-established source, equality, admitted-rule and exact-run replay layers
and checks cross-layer exact occurrence identity.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from .exact_link_network import LinkNetwork, OccurrenceRef
from .foundation_v2_interpreter import InterpreterReplayError, replay_equality_evaluation
from .foundation_v2_proof import (
    DecomposeEqualityEvidence,
    ProofRuleReplayError,
    replay_decompose_equal_relations,
)
from .foundation_v2_run import RunEvidence, RunReplayError, replay_run
from .foundation_v2_source import (
    SourceFrontEndEvidence,
    SourceReplayError,
    replay_source_front_end,
)


class IntegratedCheckerError(ValueError):
    """Cross-layer Foundation-v2 proof evidence is inconsistent or forged."""


@dataclass(frozen=True)
class ProofGoalEvidence:
    """Transport selection of the exact claim occurrences the proof must establish.

    This dataclass is not a new MTS ontological type or a claim-kind tag. The
    semantic content remains the two already-existing exact link occurrences.
    """

    start_claim: OccurrenceRef
    end_claim: OccurrenceRef


@dataclass(frozen=True)
class ProofJudgmentEvidence:
    """Transport selection of one exact Foundation-v2 proof judgment.

    ``theory`` and ``context`` are already-existing exact occurrences. ``goal``
    selects exact claim occurrences. The dataclass adds no Gamma-like global
    premise store and no new semantic tag to primitive links.
    """

    theory: OccurrenceRef
    context: OccurrenceRef
    goal: ProofGoalEvidence


@dataclass(frozen=True)
class IntegratedProofEvidence:
    """Evidence offered for one explicitly selected exact proof judgment."""

    source: SourceFrontEndEvidence
    rule_application: DecomposeEqualityEvidence
    run: RunEvidence
    judgment: ProofJudgmentEvidence


def replay_integrated_proof(
    network: LinkNetwork,
    evidence: IntegratedProofEvidence,
    byte_refs: Mapping[int, OccurrenceRef],
) -> tuple[OccurrenceRef, OccurrenceRef]:
    """Replay one source-selected rule proof for one exact selected judgment.

    Search is outside the trusted boundary. Success requires all nested evidence
    to use the judgment's exact theory and context, and trusted replay must
    produce the same exact goal-claim occurrences in the same roles. Same-shape
    or same-pole substitutes do not satisfy the judgment.
    """

    before_snapshot = network.snapshot()
    try:
        judgment = evidence.judgment
        rule = evidence.rule_application.rule
        premise = evidence.rule_application.premise

        if evidence.rule_application.theory is not judgment.theory:
            raise IntegratedCheckerError(
                "proof application uses another exact theory than selected judgment"
            )
        if premise.context is not judgment.context:
            raise IntegratedCheckerError(
                "equality premise uses another exact context than selected judgment"
            )

        try:
            selected_forms = replay_source_front_end(network, evidence.source, byte_refs)
        except SourceReplayError as exc:
            raise IntegratedCheckerError("invalid integrated source evidence") from exc
        if selected_forms != (rule,):
            raise IntegratedCheckerError(
                "source must select exactly the same exact Rule used by proof application"
            )
        if evidence.source.theory is not judgment.theory:
            raise IntegratedCheckerError(
                "source admission uses another exact theory than selected judgment"
            )

        try:
            premise_result = replay_equality_evaluation(network, premise)
        except InterpreterReplayError as exc:
            raise IntegratedCheckerError("invalid equality premise") from exc
        if not premise_result:
            raise IntegratedCheckerError("integrated proof equality premise is false")

        if evidence.rule_application.before_context is not judgment.context:
            raise IntegratedCheckerError("proof application uses another exact K")
        if evidence.rule_application.after_context is not judgment.context:
            raise IntegratedCheckerError("observational proof rule changed exact K")

        try:
            claims = replay_decompose_equal_relations(network, evidence.rule_application)
        except ProofRuleReplayError as exc:
            raise IntegratedCheckerError("invalid admitted proof-rule application") from exc

        _verify_exact_goal(judgment.goal, claims)

        expected_acts = (premise.act, evidence.rule_application.act)
        if evidence.run.initial_context is not judgment.context:
            raise IntegratedCheckerError("run starts from another exact K")
        if evidence.run.terminal_context is not judgment.context:
            raise IntegratedCheckerError("run terminates at another exact K")
        try:
            selected_acts = replay_run(network, evidence.run)
        except RunReplayError as exc:
            raise IntegratedCheckerError("invalid exact proof Run") from exc
        if selected_acts != expected_acts:
            raise IntegratedCheckerError(
                "Run must contain exactly equality premise then rule application"
            )

        return claims
    finally:
        if network.snapshot() != before_snapshot:
            raise IntegratedCheckerError("integrated proof replay mutated the network")


def _verify_exact_goal(
    goal: ProofGoalEvidence,
    claims: tuple[OccurrenceRef, OccurrenceRef],
) -> None:
    if claims[0] is not goal.start_claim or claims[1] is not goal.end_claim:
        raise IntegratedCheckerError(
            "replayed proof does not establish the exact selected goal"
        )
