"""Foundation-v2 proof-rule replay over exact actual acts.

This module does not introduce a proof AST or a second interpreter.  It composes
already-trusted primitives from the Gate-P replay spine.  The first rule is an
explicitly theory-admitted, one-step decomposition of a *replayed true local
equality* between two complete exact binary links.

The rule produces exact claim occurrences only.  It does not mutate the local
representative network, recursively decompose nested links, assert theorem
closure, or materialize any application link while replaying.
"""
from __future__ import annotations

from dataclasses import dataclass

from .rooted_link_network import LinkNetwork, LinkRef
from .foundation_v2_interpreter import (
    EqualityEvaluationEvidence,
    InterpreterReplayError,
    replay_equality_evaluation,
)
from .foundation_v2_state import FoundationStateError, act_header, act_values


class ProofRuleReplayError(ValueError):
    """Selected proof-rule evidence is forged, inadmissible or inconsistent."""


@dataclass(frozen=True)
class DecomposeEqualityRoleRefs:
    """Exact role refs used by one decomposition-rule actual act."""

    premise_equality_act: LinkRef
    theory: LinkRef
    rule: LinkRef
    rule_membership: LinkRef
    left_relation: LinkRef
    right_relation: LinkRef
    start_claim: LinkRef
    end_claim: LinkRef
    before_context: LinkRef
    after_context: LinkRef


@dataclass(frozen=True)
class DecomposeEqualityEvidence:
    """Exact evidence for one admitted equality-decomposition application."""

    premise: EqualityEvaluationEvidence
    interpreter: LinkRef
    theory: LinkRef
    rule: LinkRef
    rule_membership: LinkRef
    left_relation: LinkRef
    right_relation: LinkRef
    start_claim: LinkRef
    end_claim: LinkRef
    before_context: LinkRef
    after_context: LinkRef
    act: LinkRef
    role_dictionary: LinkRef
    roles: DecomposeEqualityRoleRefs


def replay_decompose_equal_relations(
    network: LinkNetwork,
    evidence: DecomposeEqualityEvidence,
) -> tuple[LinkRef, LinkRef]:
    """Replay one explicitly admitted, non-recursive equality decomposition.

    Premise:
        a previously represented equality evaluation ``Equal_K(L, R)``.

    Conclusions:
        exact claim links ``L.start ⟼ R.start`` and ``L.end ⟼ R.end``.

    The claims are evidence only.  No equality binding is added to ``K`` and no
    nested decomposition is attempted.
    """

    before_snapshot = network.snapshot()
    try:
        _verify_true_exact_premise(network, evidence)
        _verify_rule_membership(network, evidence)

        left = _complete_relation(network, evidence.left_relation, "left")
        right = _complete_relation(network, evidence.right_relation, "right")

        start_claim = network.link(evidence.start_claim)
        if start_claim.start is not left.start or start_claim.end is not right.start:
            raise ProofRuleReplayError("forged start-pole equality claim")

        end_claim = network.link(evidence.end_claim)
        if end_claim.start is not left.end or end_claim.end is not right.end:
            raise ProofRuleReplayError("forged end-pole equality claim")

        if evidence.before_context is not evidence.after_context:
            raise ProofRuleReplayError(
                "decomposition is observational and must preserve exact K"
            )
        if evidence.before_context is not evidence.premise.context:
            raise ProofRuleReplayError(
                "proof-rule context differs from exact equality-premise context"
            )

        _verify_act_header(network, evidence)
        _verify_act_fields(network, evidence)
        return evidence.start_claim, evidence.end_claim
    finally:
        if network.snapshot() != before_snapshot:
            raise ProofRuleReplayError("proof-rule replay mutated the network")


def _verify_true_exact_premise(
    network: LinkNetwork,
    evidence: DecomposeEqualityEvidence,
) -> None:
    if evidence.premise.left is not evidence.left_relation:
        raise ProofRuleReplayError("left relation differs from equality premise")
    if evidence.premise.right is not evidence.right_relation:
        raise ProofRuleReplayError("right relation differs from equality premise")
    if evidence.premise.context is not evidence.before_context:
        raise ProofRuleReplayError("equality premise belongs to another exact context")
    try:
        premise_true = replay_equality_evaluation(network, evidence.premise)
    except InterpreterReplayError as exc:
        raise ProofRuleReplayError("invalid equality-premise evidence") from exc
    if not premise_true:
        raise ProofRuleReplayError("equality-decomposition premise is false")


def _verify_rule_membership(
    network: LinkNetwork,
    evidence: DecomposeEqualityEvidence,
) -> None:
    membership = network.link(evidence.rule_membership)
    if membership.start is not evidence.theory or membership.end is not evidence.rule:
        raise ProofRuleReplayError("selected rule is not admitted by exact theory membership")


def _complete_relation(network: LinkNetwork, ref: LinkRef, label: str):
    link = network.link(ref)
    if link.start is ref or link.end is ref:
        raise ProofRuleReplayError(f"{label} relation is partial/self-closed")
    return link


def _verify_act_header(
    network: LinkNetwork,
    evidence: DecomposeEqualityEvidence,
) -> None:
    try:
        header = act_header(network, evidence.act)
    except FoundationStateError as exc:
        raise ProofRuleReplayError("invalid proof-rule actual-act header") from exc
    expected = (
        evidence.interpreter,
        evidence.role_dictionary,
        evidence.after_context,
    )
    if header != expected:
        raise ProofRuleReplayError(
            "proof-rule actual-act header does not match I/D_roles/K_after"
        )


def _verify_act_fields(
    network: LinkNetwork,
    evidence: DecomposeEqualityEvidence,
) -> None:
    expected = (
        (
            evidence.roles.premise_equality_act,
            evidence.premise.act,
            "premise-equality-act",
        ),
        (evidence.roles.theory, evidence.theory, "theory"),
        (evidence.roles.rule, evidence.rule, "rule"),
        (
            evidence.roles.rule_membership,
            evidence.rule_membership,
            "rule-membership",
        ),
        (
            evidence.roles.left_relation,
            evidence.left_relation,
            "left-relation",
        ),
        (
            evidence.roles.right_relation,
            evidence.right_relation,
            "right-relation",
        ),
        (evidence.roles.start_claim, evidence.start_claim, "start-claim"),
        (evidence.roles.end_claim, evidence.end_claim, "end-claim"),
        (
            evidence.roles.before_context,
            evidence.before_context,
            "before-context",
        ),
        (
            evidence.roles.after_context,
            evidence.after_context,
            "after-context",
        ),
    )
    for role, value, label in expected:
        values = act_values(network, evidence.act, role)
        if values != (value,):
            raise ProofRuleReplayError(
                f"proof-rule actual-act field {label!r} is missing, duplicated or forged"
            )
