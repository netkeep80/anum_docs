from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from core.rooted_link_network import LinkNetworkBuilder
from core.foundation_v2_interpreter import (
    EqualityEvaluationEvidence,
    EqualityRoleRefs,
    InterpreterReplayError,
    replay_equality_evaluation,
)
from core.foundation_v2_state import (
    RepresentativeConflictError,
    define_act_field,
    define_act_header,
    define_context,
    define_dictionary_effect,
    define_dictionary_scope,
    define_local_representative_binding,
    local_representative,
    local_representative_resolution,
)


ROOT = Path(__file__).resolve().parents[1]
ROLE_NAMES = (
    "context",
    "left",
    "right",
    "left-representative",
    "right-representative",
)


def _anchor(builder: LinkNetworkBuilder):
    """Create a fresh structurally distinguished test value rooted at ∞."""

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


def _roles(builder: LinkNetworkBuilder) -> EqualityRoleRefs:
    refs = {name: _anchor(builder) for name in ROLE_NAMES}
    return EqualityRoleRefs(
        context=refs["context"],
        left=refs["left"],
        right=refs["right"],
        left_representative=refs["left-representative"],
        right_representative=refs["right-representative"],
    )


def _role_items(roles: EqualityRoleRefs):
    return (
        ("context", roles.context),
        ("left", roles.left),
        ("right", roles.right),
        ("left-representative", roles.left_representative),
        ("right-representative", roles.right_representative),
    )


def _role_dictionary(builder, root, roles):
    dictionary = define_dictionary_scope(builder, root, root)
    history = root
    for _, role_ref in _role_items(roles):
        name_content = _anchor(builder)
        effect = define_dictionary_effect(
            builder,
            dictionary,
            root,
            history,
            name_content,
            role_ref,
        )
        dictionary = effect.after_scope
        history = effect.history_after
    return dictionary


def _make_evidence(builder, root, context, left, right, left_rep, right_rep):
    interpreter = _anchor(builder)
    roles = _roles(builder)
    role_dictionary = _role_dictionary(builder, root, roles)
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


def test_equal_members_share_one_exact_local_representative() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    parent = _anchor(builder)
    current = _anchor(builder)
    context = define_context(builder, parent, current)
    left = _anchor(builder)
    right = _anchor(builder)
    representative = _anchor(builder)
    define_local_representative_binding(builder, context, left, representative)
    define_local_representative_binding(builder, context, right, representative)
    evidence = _make_evidence(
        builder, root, context, left, right, representative, representative
    )
    network = builder.freeze(root)
    before = network.snapshot()

    assert replay_equality_evaluation(network, evidence) is True
    assert network.snapshot() == before


def test_missing_mapping_falls_back_to_exact_member_and_can_be_false() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    context = define_context(builder, _anchor(builder), _anchor(builder))
    left = _anchor(builder)
    right = _anchor(builder)
    evidence = _make_evidence(builder, root, context, left, right, left, right)
    network = builder.freeze(root)

    assert local_representative(network, context, left) is left
    assert local_representative(network, context, right) is right
    assert replay_equality_evaluation(network, evidence) is False


def test_start_self_closed_forms_with_distinct_ends_are_distinct() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    context = define_context(builder, _anchor(builder), _anchor(builder))
    left_end = _anchor(builder)
    right_end = _anchor(builder)
    left = builder.ensure_start_self_closed(left_end)
    right = builder.ensure_start_self_closed(right_end)
    evidence = _make_evidence(builder, root, context, left, right, left, right)
    network = builder.freeze(root)

    assert left is not right
    assert network.link(left).start is left
    assert network.link(left).end is left_end
    assert network.link(right).start is right
    assert network.link(right).end is right_end
    assert replay_equality_evaluation(network, evidence) is False


def test_alias_chain_is_deliberately_one_hop_not_transitive() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    context = define_context(builder, _anchor(builder), _anchor(builder))
    left = _anchor(builder)
    middle = _anchor(builder)
    final = _anchor(builder)
    define_local_representative_binding(builder, context, left, middle)
    define_local_representative_binding(builder, context, middle, final)
    evidence = _make_evidence(builder, root, context, left, middle, middle, final)
    network = builder.freeze(root)

    assert local_representative(network, context, left) is middle
    assert local_representative(network, context, middle) is final
    assert replay_equality_evaluation(network, evidence) is False


def test_repeated_same_representative_binding_is_canonical_and_unambiguous() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    context = define_context(builder, _anchor(builder), _anchor(builder))
    member = _anchor(builder)
    representative = _anchor(builder)
    first_pair, first_binding = define_local_representative_binding(
        builder, context, member, representative
    )
    second_pair, second_binding = define_local_representative_binding(
        builder, context, member, representative
    )
    evidence = _make_evidence(
        builder, root, context, member, representative, representative, representative
    )
    network = builder.freeze(root)

    assert second_pair is first_pair
    assert second_binding is first_binding
    resolution = local_representative_resolution(network, context, member)
    assert resolution.representative is representative
    assert resolution.bindings == (first_binding,)
    assert replay_equality_evaluation(network, evidence) is True


def test_distinct_local_representatives_conflict() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    context = define_context(builder, _anchor(builder), _anchor(builder))
    member = _anchor(builder)
    rep_one = _anchor(builder)
    rep_two = _anchor(builder)
    define_local_representative_binding(builder, context, member, rep_one)
    define_local_representative_binding(builder, context, member, rep_two)
    evidence = _make_evidence(builder, root, context, member, rep_one, rep_one, rep_one)
    network = builder.freeze(root)

    with pytest.raises(RepresentativeConflictError):
        local_representative(network, context, member)
    with pytest.raises(InterpreterReplayError, match="conflicting local representative"):
        replay_equality_evaluation(network, evidence)


def test_forged_representative_evidence_rejects() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    context = define_context(builder, _anchor(builder), _anchor(builder))
    left = _anchor(builder)
    right = _anchor(builder)
    representative = _anchor(builder)
    define_local_representative_binding(builder, context, left, representative)
    evidence = _make_evidence(builder, root, context, left, right, representative, right)
    forged = replace(evidence, left_representative=right)
    network = builder.freeze(root)

    with pytest.raises(InterpreterReplayError, match="forged left representative"):
        replay_equality_evaluation(network, forged)


def test_conflicting_actual_act_field_rejects_even_when_equality_is_true() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    context = define_context(builder, _anchor(builder), _anchor(builder))
    left = _anchor(builder)
    right = _anchor(builder)
    representative = _anchor(builder)
    define_local_representative_binding(builder, context, left, representative)
    define_local_representative_binding(builder, context, right, representative)
    evidence = _make_evidence(
        builder, root, context, left, right, representative, representative
    )
    forged_value = _anchor(builder)
    define_act_field(
        builder,
        evidence.act,
        evidence.roles.left_representative,
        forged_value,
    )
    network = builder.freeze(root)

    with pytest.raises(InterpreterReplayError, match="left-representative"):
        replay_equality_evaluation(network, evidence)


def test_equality_engine_has_no_shape_comparator_or_legacy_dependency() -> None:
    source = (ROOT / "core/foundation_v2_interpreter.py").read_text(encoding="utf-8")
    assert "carrier_isomorphic" not in source
    assert "mtc_parser" not in source
    assert "mtc_ast" not in source
    assert "mtc_interpreter" not in source
    assert "union_find" not in source.lower()
