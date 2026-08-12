from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from core.rooted_link_network import LinkNetworkBuilder
from core.foundation_v2_checker import (
    IntegratedCheckerError,
    IntegratedProofEvidence,
    ProofGoalEvidence,
    ProofJudgmentEvidence,
    replay_integrated_proof,
)
from core.foundation_v2_interpreter import EqualityEvaluationEvidence, EqualityRoleRefs
from core.foundation_v2_proof import DecomposeEqualityEvidence, DecomposeEqualityRoleRefs
from core.foundation_v2_run import RunEvidence, RunStepEvidence, define_run_chain
from core.foundation_v2_source import SegmentSpec, SourceFrontEndBuilder
from core.foundation_v2_state import (
    define_act_field,
    define_act_header,
    define_context,
    define_dictionary_effect,
    define_dictionary_scope,
    define_local_representative_binding,
    define_membership,
)


ROOT = Path(__file__).resolve().parents[1]


def _anchor(builder):
    if not builder._refs:
        return builder.ensure_root()
    current = next(
        ref
        for ref, link in reversed(list(zip(builder._refs, builder._links)))
        if link is not None
    )
    count = len(builder._refs)
    while len(builder._refs) == count:
        current = builder.ensure_start_self_closed(current)
    return current


def _link(builder, start, end):
    return builder.ensure(start, end)


def _byte_refs(builder):
    return {value: _anchor(builder) for value in range(256)}


def _source_evidence(builder, root, byte_refs, rule, theory, grammar=None):
    grammar = grammar or _anchor(builder)
    front = SourceFrontEndBuilder(builder, root, byte_refs)
    source = front.source_occurrence(b"decompose")
    d0 = define_dictionary_scope(builder, root, root)
    definition = define_dictionary_effect(
        builder,
        d0,
        root,
        root,
        front.content_ref(b"decompose"),
        rule,
    )
    return front.build_selected_evidence(
        source,
        (SegmentSpec(0, len(b"decompose"), rule, definition.occurrence),),
        dictionary=definition.after_scope,
        grammar=grammar,
        theory=theory,
    )


def _fixture():
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    byte_refs = _byte_refs(builder)
    context = define_context(builder, _anchor(builder), _anchor(builder))
    theory = _anchor(builder)
    rule = _anchor(builder)
    source = _source_evidence(builder, root, byte_refs, rule, theory)

    ls, le, rs, re = (_anchor(builder) for _ in range(4))
    left = _link(builder, ls, le)
    right = _link(builder, rs, re)
    representative = _anchor(builder)
    define_local_representative_binding(builder, context, left, representative)
    define_local_representative_binding(builder, context, right, representative)

    eq_roles = EqualityRoleRefs(*(_anchor(builder) for _ in range(5)))
    eq_i = _anchor(builder)
    eq_droles = define_dictionary_scope(builder, root, root)
    eq_act = define_act_header(builder, eq_i, eq_droles, context)
    for role, value in (
        (eq_roles.context, context),
        (eq_roles.left, left),
        (eq_roles.right, right),
        (eq_roles.left_representative, representative),
        (eq_roles.right_representative, representative),
    ):
        define_act_field(builder, eq_act, role, value)
    premise = EqualityEvaluationEvidence(
        interpreter=eq_i,
        context=context,
        left=left,
        right=right,
        left_representative=representative,
        right_representative=representative,
        act=eq_act,
        role_dictionary=eq_droles,
        roles=eq_roles,
    )

    membership = define_membership(builder, theory, rule)
    start_claim = _link(builder, ls, rs)
    end_claim = _link(builder, le, re)
    proof_roles = DecomposeEqualityRoleRefs(*(_anchor(builder) for _ in range(10)))
    proof_i = _anchor(builder)
    proof_droles = define_dictionary_scope(builder, root, root)
    proof_act = define_act_header(builder, proof_i, proof_droles, context)
    for role, value in (
        (proof_roles.premise_equality_act, eq_act),
        (proof_roles.theory, theory),
        (proof_roles.rule, rule),
        (proof_roles.rule_membership, membership),
        (proof_roles.left_relation, left),
        (proof_roles.right_relation, right),
        (proof_roles.start_claim, start_claim),
        (proof_roles.end_claim, end_claim),
        (proof_roles.before_context, context),
        (proof_roles.after_context, context),
    ):
        define_act_field(builder, proof_act, role, value)
    proof = DecomposeEqualityEvidence(
        premise=premise,
        interpreter=proof_i,
        theory=theory,
        rule=rule,
        rule_membership=membership,
        left_relation=left,
        right_relation=right,
        start_claim=start_claim,
        end_claim=end_claim,
        before_context=context,
        after_context=context,
        act=proof_act,
        role_dictionary=proof_droles,
        roles=proof_roles,
    )

    eq_step = RunStepEvidence(eq_act, context, context, eq_roles.context, eq_roles.context)
    proof_step = RunStepEvidence(
        proof_act,
        context,
        context,
        proof_roles.before_context,
        proof_roles.after_context,
    )
    run = RunEvidence(
        run_root=define_run_chain(builder, root, (eq_act, proof_act)),
        initial_context=context,
        terminal_context=context,
        steps=(eq_step, proof_step),
    )
    goal = ProofGoalEvidence(start_claim=start_claim, end_claim=end_claim)
    judgment = ProofJudgmentEvidence(theory=theory, context=context, goal=goal)
    evidence = IntegratedProofEvidence(
        source=source,
        rule_application=proof,
        run=run,
        judgment=judgment,
    )
    return builder, root, byte_refs, evidence, rule, theory, context


def test_integrated_source_to_rule_to_run_replays_read_only() -> None:
    builder, root, byte_refs, evidence, _, _, _ = _fixture()
    network = builder.freeze(root)
    before = network.snapshot()

    assert replay_integrated_proof(network, evidence, byte_refs) == (
        evidence.judgment.goal.start_claim,
        evidence.judgment.goal.end_claim,
    )
    assert network.snapshot() == before


def test_swapped_goal_rejects() -> None:
    builder, root, byte_refs, evidence, _, _, _ = _fixture()
    goal = evidence.judgment.goal
    forged = replace(
        evidence,
        judgment=replace(
            evidence.judgment,
            goal=ProofGoalEvidence(
                start_claim=goal.end_claim,
                end_claim=goal.start_claim,
            ),
        ),
    )
    network = builder.freeze(root)

    with pytest.raises(IntegratedCheckerError, match="exact selected goal"):
        replay_integrated_proof(network, forged, byte_refs)


def test_same_goal_pair_is_the_same_semantic_goal() -> None:
    builder, root, byte_refs, evidence, _, _, _ = _fixture()
    goal = evidence.judgment.goal
    original = builder._links[goal.start_claim.slot]  # type: ignore[attr-defined]
    same_claim = builder.ensure(original.start, original.end)
    assert same_claim is goal.start_claim

    network = builder.freeze(root)
    assert replay_integrated_proof(network, evidence, byte_refs) == (
        goal.start_claim,
        goal.end_claim,
    )


def test_structurally_different_goal_rejects() -> None:
    builder, root, byte_refs, evidence, _, _, _ = _fixture()
    goal = evidence.judgment.goal
    original = builder._links[goal.start_claim.slot]  # type: ignore[attr-defined]
    different_end = _anchor(builder)
    different_claim = builder.ensure(original.start, different_end)
    forged = replace(
        evidence,
        judgment=replace(
            evidence.judgment,
            goal=replace(goal, start_claim=different_claim),
        ),
    )
    network = builder.freeze(root)

    with pytest.raises(IntegratedCheckerError, match="exact selected goal"):
        replay_integrated_proof(network, forged, byte_refs)


def test_selected_judgment_theory_must_match() -> None:
    builder, root, byte_refs, evidence, _, theory, _ = _fixture()
    other_theory = _anchor(builder)
    forged = replace(evidence, judgment=replace(evidence.judgment, theory=other_theory))
    network = builder.freeze(root)

    assert other_theory is not theory
    with pytest.raises(IntegratedCheckerError, match="selected judgment"):
        replay_integrated_proof(network, forged, byte_refs)


def test_selected_judgment_context_must_match() -> None:
    builder, root, byte_refs, evidence, _, _, context = _fixture()
    other_context = define_context(builder, _anchor(builder), _anchor(builder))
    forged = replace(evidence, judgment=replace(evidence.judgment, context=other_context))
    network = builder.freeze(root)

    assert other_context is not context
    with pytest.raises(IntegratedCheckerError, match="selected judgment"):
        replay_integrated_proof(network, forged, byte_refs)


def test_valid_source_selecting_another_rule_rejects_cross_layer() -> None:
    builder, root, byte_refs, evidence, rule, theory, _ = _fixture()
    other_rule = _anchor(builder)
    other_source = _source_evidence(builder, root, byte_refs, other_rule, theory)
    forged = replace(evidence, source=other_source)
    network = builder.freeze(root)

    assert other_rule is not rule
    with pytest.raises(IntegratedCheckerError, match="same exact Rule"):
        replay_integrated_proof(network, forged, byte_refs)


def test_valid_source_under_another_theory_rejects_cross_layer() -> None:
    builder, root, byte_refs, evidence, rule, theory, _ = _fixture()
    other_theory = _anchor(builder)
    other_source = _source_evidence(builder, root, byte_refs, rule, other_theory)
    forged = replace(evidence, source=other_source)
    network = builder.freeze(root)

    assert other_theory is not theory
    with pytest.raises(IntegratedCheckerError, match="source admission"):
        replay_integrated_proof(network, forged, byte_refs)


def test_invalid_equality_premise_rejects_integrated_artifact() -> None:
    builder, root, byte_refs, evidence, _, _, _ = _fixture()
    forged_rep = _anchor(builder)
    forged_premise = replace(
        evidence.rule_application.premise,
        left_representative=forged_rep,
    )
    forged_rule = replace(evidence.rule_application, premise=forged_premise)
    forged = replace(evidence, rule_application=forged_rule)
    network = builder.freeze(root)

    with pytest.raises(IntegratedCheckerError, match="invalid equality premise"):
        replay_integrated_proof(network, forged, byte_refs)


def test_swapped_run_order_rejects() -> None:
    builder, root, byte_refs, evidence, _, _, _ = _fixture()
    swapped = replace(evidence.run, steps=tuple(reversed(evidence.run.steps)))
    network = builder.freeze(root)

    with pytest.raises(IntegratedCheckerError, match="invalid exact proof Run"):
        replay_integrated_proof(network, replace(evidence, run=swapped), byte_refs)


def test_structurally_other_run_context_rejects_before_replay() -> None:
    builder, root, byte_refs, evidence, _, _, context = _fixture()
    other_context = define_context(builder, _anchor(builder), _anchor(builder))
    forged_run = replace(evidence.run, initial_context=other_context)
    network = builder.freeze(root)

    assert other_context is not context
    with pytest.raises(IntegratedCheckerError, match="another exact K"):
        replay_integrated_proof(network, replace(evidence, run=forged_run), byte_refs)


def test_integrated_checker_has_no_search_parser_or_legacy_proof_dependency() -> None:
    source = (ROOT / "core/foundation_v2_checker.py").read_text(encoding="utf-8")
    assert "mtc_parser" not in source
    assert "mtc_ast" not in source
    assert "mtc_interpreter" not in source
    assert "proof_checker" not in source
    assert "carrier_isomorphic" not in source
    assert "materialize(" not in source
