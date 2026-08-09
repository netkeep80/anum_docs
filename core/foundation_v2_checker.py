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

    This dataclass is not a new MTS ontological type or a claim-kind tag.  The
    semantic content remains the two already-existing exact link occurrences.
    """

    start_claim: OccurrenceRef
    end_claim: OccurrenceRef


@dataclass(frozen=True)
class IntegratedProofEvidence:
    """One selected exact Foundation-v2 proof artifact."""

    source: SourceFrontEndEvidence
    rule_application: DecomposeEqualityEvidence
    run: RunEvidence
    goal: ProofGoalEvidence


def replay_integrated_proof(
    network: LinkNetwork,
    evidence: IntegratedProofEvidence,
    byte_refs: Mapping[int, OccurrenceRef],
) -> tuple[OccurrenceRef, OccurrenceRef]:
    """Replay one source-selected rule proof for one exact selected goal.

    Search is outside the trusted boundary.  Success means that trusted replay
    produces the same exact claim occurrences, in the same roles, that were
    selected as the goal.  Same-shape or same-pole substitute occurrences do
    not satisfy the goal.
    """

    before_snapshot = network.snapshot()
    try:
        rule = evidence.rule_application.rule
        theory = evidence.rule_application.theory
        premise = evidence.rule_application.premise
        context = premise.context

        try:
            selected_forms = replay_source_front_end(network, evidence.source, byte_refs)
        except SourceReplayError as exc:
            raise IntegratedCheckerError("invalid integrated source evidence") from exc
        if selected_forms != (rule,):
            raise IntegratedCheckerError(
                "source must select exactly the same exact Rule used by proof application"
            )
        if evidence.source.theory is not theory:
            raise IntegratedCheckerError(
                "source admission and proof application use different exact theories"
            )

        try:
            premise_result = replay_equality_evaluation(network, premise)
        except InterpreterReplayError as exc:
            raise IntegratedCheckerError("invalid equality premise") from exc
        if not premise_result:
            raise IntegratedCheckerError("integrated proof equality premise is false")

        if evidence.rule_application.before_context is not context:
            raise IntegratedCheckerError("proof application uses another exact K")
        if evidence.rule_application.after_context is not context:
            raise IntegratedCheckerError("observational proof rule changed exact K")

        try:
            claims = replay_decompose_equal_relations(network, evidence.rule_application)
        except ProofRuleReplayError as exc:
            raise IntegratedCheckerError("invalid admitted proof-rule application") from exc

        _verify_exact_goal(evidence.goal, claims)

        expected_acts = (premise.act, evidence.rule_application.act)
        if evidence.run.initial_context is not context:
            raise IntegratedCheckerError("run starts from another exact K")
        if evidence.run.terminal_context is not context:
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
