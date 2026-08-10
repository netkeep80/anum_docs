from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from core.exact_link_network import LinkNetworkBuilder
from core.foundation_v2_interpreter import (
    EqualityEvaluationEvidence,
    EqualityRoleRefs,
)
from core.foundation_v2_proof import (
    DecomposeEqualityEvidence,
    DecomposeEqualityRoleRefs,
    ProofRuleReplayError,
    replay_decompose_equal_relations,
)
from core.foundation_v2_state import (
    define_act_field,
    define_act_header,
    define_context,
    define_dictionary_scope,
    define_local_representative_binding,
    define_membership,
    local_representative,
)


ROOT = Path(__file__).resolve().parents[1]


def _anchor(builder: LinkNetworkBuilder):
    ref = builder.reserve()
    builder.define(ref, ref, ref)
    return ref


def _link(builder: LinkNetworkBuilder, start, end):
    return builder.ensure(start, end)


def _equality_roles(builder: LinkNetworkBuilder) -> EqualityRoleRefs:
    return EqualityRoleRefs(
        context=_anchor(builder),
        left=_anchor(builder),
        right=_anchor(builder),
        left_representative=_anchor(builder),
        right_representative=_anchor(builder),
    )


def _proof_roles(builder: LinkNetworkBuilder) -> DecomposeEqualityRoleRefs:
    return DecomposeEqualityRoleRefs(
        premise_equality_act=_anchor(builder),
        theory=_anchor(builder),
        rule=_anchor(builder),
        rule_membership=_anchor(builder),
        left_relation=_anchor(builder),
        right_relation=_anchor(builder),
        start_claim=_anchor(builder),
        end_claim=_anchor(builder),
        before_context=_anchor(builder),
        after_context=_anchor(builder),
    )


def _equality_premise(
    builder: LinkNetworkBuilder,
    root,
    context,
    left,
    right,
    left_rep,
    right_rep,
) -> EqualityEvaluationEvidence:
    interpreter = _anchor(builder)
    role_dictionary = define_dictionary_scope(builder, root, root)
    roles = _equality_roles(builder)
    act = define_act_header(builder, interpreter, role_dictionary, context)
    for role, value in (
        (roles.context, context),
        (roles.left, left),
        (roles.right, right),
        (roles.left_representative, left_rep),
        (roles.right_representative, right_rep),
    ):
        define_act_field(builder, act, role, value)
    return EqualityEvaluationEvidence(
        interpreter=interpreter,
        context=context,
        left=left,
        right=right,
        left_representative=left_rep,
        right_representative=right_rep,
        act=act,
        role_dictionary=role_dictionary,
        roles=roles,
    )


def _proof_evidence(
    builder: LinkNetworkBuilder,
    root,
    premise: EqualityEvaluationEvidence,
    *,
    left=None,
    right=None,
    theory=None,
    rule=None,
    rule_membership=None,
    start_claim=None,
    end_claim=None,
    before_context=None,
    after_context=None,
    conflicting_field: bool = False,
):
    left = left or premise.left
    right = right or premise.right
    theory = theory or _anchor(builder)
    rule = rule or _anchor(builder)
    rule_membership = rule_membership or define_membership(builder, theory, rule)
    left_link = None
    right_link = None
    try:
        left_link = builder._links[left.slot]  # type: ignore[attr-defined]
        right_link = builder._links[right.slot]  # type: ignore[attr-defined]
    except (AttributeError, KeyError):
        pass
    if start_claim is None:
        assert left_link is not None and right_link is not None
        start_claim = _link(builder, left_link.start, right_link.start)
    if end_claim is None:
        assert left_link is not None and right_link is not None
        end_claim = _link(builder, left_link.end, right_link.end)

    before_context = before_context or premise.context
    after_context = after_context or before_context
    interpreter = _anchor(builder)
    role_dictionary = define_dictionary_scope(builder, root, root)
    roles = _proof_roles(builder)
    act = define_act_header(builder, interpreter, role_dictionary, after_context)
    fields = (
        (roles.premise_equality_act, premise.act),
        (roles.theory, theory),
        (roles.rule, rule),
        (roles.rule_membership, rule_membership),
        (roles.left_relation, left),
        (roles.right_relation, right),
        (roles.start_claim, start_claim),
        (roles.end_claim, end_claim),
        (roles.before_context, before_context),
        (roles.after_context, after_context),
    )
    for role_ref, value in fields:
        define_act_field(builder, act, role_ref, value)
    if conflicting_field:
        define_act_field(builder, act, roles.start_claim, _anchor(builder))

    return DecomposeEqualityEvidence(
        premise=premise,
        interpreter=interpreter,
        theory=theory,
        rule=rule,
        rule_membership=rule_membership,
        left_relation=left,
        right_relation=right,
        start_claim=start_claim,
        end_claim=end_claim,
        before_context=before_context,
        after_context=after_context,
        act=act,
        role_dictionary=role_dictionary,
        roles=roles,
    )


def _true_fixture(*, nested_poles: bool = False):
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    context = define_context(builder, _anchor(builder), _anchor(builder))

    if nested_poles:
        left_start = _link(builder, _anchor(builder), _anchor(builder))
        left_end = _link(builder, _anchor(builder), _anchor(builder))
        right_start = _link(builder, _anchor(builder), _anchor(builder))
        right_end = _link(builder, _anchor(builder), _anchor(builder))
    else:
        left_start = _anchor(builder)
        left_end = _anchor(builder)
        right_start = _anchor(builder)
        right_end = _anchor(builder)

    left = _link(builder, left_start, left_end)
    right = _link(builder, right_start, right_end)
    representative = _anchor(builder)
    define_local_representative_binding(builder, context, left, representative)
    define_local_representative_binding(builder, context, right, representative)
    premise = _equality_premise(
        builder, root, context, left, right, representative, representative
    )
    evidence = _proof_evidence(builder, root, premise)
    return builder, root, context, left, right, premise, evidence


def test_true_equality_decomposes_once_under_exact_admitted_rule() -> None:
    builder, root, context, left, right, _, evidence = _true_fixture()
    network = builder.freeze(root)
    before = network.snapshot()

    claims = replay_decompose_equal_relations(network, evidence)
    assert claims == (evidence.start_claim, evidence.end_claim)
    assert network.snapshot() == before

    left_link = network.link(left)
    right_link = network.link(right)
    assert network.link(evidence.start_claim).start is left_link.start
    assert network.link(evidence.start_claim).end is right_link.start
    assert network.link(evidence.end_claim).start is left_link.end
    assert network.link(evidence.end_claim).end is right_link.end

    assert local_representative(network, context, left_link.start) is left_link.start
    assert local_representative(network, context, right_link.start) is right_link.start


def test_false_equality_premise_rejects_rule_application() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    context = define_context(builder, _anchor(builder), _anchor(builder))
    left = _link(builder, _anchor(builder), _anchor(builder))
    right = _link(builder, _anchor(builder), _anchor(builder))
    premise = _equality_premise(builder, root, context, left, right, left, right)
    evidence = _proof_evidence(builder, root, premise)
    network = builder.freeze(root)

    with pytest.raises(ProofRuleReplayError, match="premise is false"):
        replay_decompose_equal_relations(network, evidence)


def test_rule_membership_from_another_theory_rejects() -> None:
    builder, root, _, _, _, premise, _ = _true_fixture()
    selected_theory = _anchor(builder)
    other_theory = _anchor(builder)
    rule = _anchor(builder)
    wrong_membership = define_membership(builder, other_theory, rule)
    evidence = _proof_evidence(
        builder,
        root,
        premise,
        theory=selected_theory,
        rule=rule,
        rule_membership=wrong_membership,
    )
    network = builder.freeze(root)

    with pytest.raises(ProofRuleReplayError, match="not admitted"):
        replay_decompose_equal_relations(network, evidence)


def test_same_relation_pair_is_the_same_relation() -> None:
    builder, root, _, left, _, premise, _ = _true_fixture()
    left_link = builder._links[left.slot]  # type: ignore[attr-defined]
    same_relation = _link(builder, left_link.start, left_link.end)
    assert same_relation is left

    evidence = _proof_evidence(builder, root, premise, left=same_relation)
    network = builder.freeze(root)
    assert replay_decompose_equal_relations(network, evidence) == (
        evidence.start_claim,
        evidence.end_claim,
    )


def test_partial_relation_rejects_even_with_true_local_equality_premise() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    context = define_context(builder, _anchor(builder), _anchor(builder))
    fixed = _anchor(builder)
    left = builder.reserve()
    builder.define(left, left, fixed)
    right = _link(builder, _anchor(builder), _anchor(builder))
    representative = _anchor(builder)
    define_local_representative_binding(builder, context, left, representative)
    define_local_representative_binding(builder, context, right, representative)
    premise = _equality_premise(
        builder, root, context, left, right, representative, representative
    )
    evidence = _proof_evidence(builder, root, premise)
    network = builder.freeze(root)

    with pytest.raises(ProofRuleReplayError, match="partial/self-closed"):
        replay_decompose_equal_relations(network, evidence)


def test_forged_start_claim_rejects() -> None:
    builder, root, _, _, _, premise, good = _true_fixture()
    forged_claim = _link(builder, _anchor(builder), _anchor(builder))
    evidence = _proof_evidence(
        builder,
        root,
        premise,
        theory=good.theory,
        rule=good.rule,
        rule_membership=good.rule_membership,
        start_claim=forged_claim,
    )
    network = builder.freeze(root)

    with pytest.raises(ProofRuleReplayError, match="start-pole"):
        replay_decompose_equal_relations(network, evidence)


def test_observational_rule_cannot_change_exact_context() -> None:
    builder, root, context, _, _, premise, _ = _true_fixture()
    other_context = define_context(builder, _anchor(builder), _anchor(builder))
    evidence = _proof_evidence(
        builder,
        root,
        premise,
        before_context=context,
        after_context=other_context,
    )
    network = builder.freeze(root)

    with pytest.raises(ProofRuleReplayError, match="must preserve exact K"):
        replay_decompose_equal_relations(network, evidence)


def test_conflicting_required_proof_act_field_rejects() -> None:
    builder, root, _, _, _, premise, _ = _true_fixture()
    evidence = _proof_evidence(builder, root, premise, conflicting_field=True)
    network = builder.freeze(root)

    with pytest.raises(ProofRuleReplayError, match="start-claim"):
        replay_decompose_equal_relations(network, evidence)


def test_nested_poles_produce_only_selected_first_level_claims() -> None:
    builder, root, _, left, right, _, evidence = _true_fixture(nested_poles=True)
    network = builder.freeze(root)
    before = network.snapshot()

    assert replay_decompose_equal_relations(network, evidence) == (
        evidence.start_claim,
        evidence.end_claim,
    )
    assert network.snapshot() == before

    left_start = network.link(left).start
    right_start = network.link(right).start
    assert network.link(evidence.start_claim).start is left_start
    assert network.link(evidence.start_claim).end is right_start
    nested_left = network.link(left_start)
    nested_right = network.link(right_start)
    assert not any(
        network.link(ref).start is nested_left.start
        and network.link(ref).end is nested_right.start
        for ref in network.refs
        if ref not in (left_start, right_start)
    )


def test_proof_rule_module_has_no_legacy_or_shape_equality_dependency() -> None:
    source = (ROOT / "core/foundation_v2_proof.py").read_text(encoding="utf-8")
    assert "mtc_parser" not in source
    assert "mtc_ast" not in source
    assert "mtc_interpreter" not in source
    assert "proof_checker" not in source
    assert "carrier_isomorphic" not in source
    assert "define_local_representative_binding" not in source
