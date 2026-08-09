from __future__ import annotations

import pytest

from core.exact_link_network import LinkNetworkBuilder
from core.foundation_v2_state import (
    FoundationStateError,
    act_header,
    act_values,
    current_of_context,
    define_act_field,
    define_act_header,
    define_context,
    define_dictionary_effect,
    define_dictionary_scope,
    define_membership,
    define_source_occurrence,
    has_exact_membership,
    lookup_scoped_dictionary,
    parent_of_context,
    verify_visible_dictionary_occurrence,
)


def _anchor(builder: LinkNetworkBuilder):
    ref = builder.reserve()
    builder.define(ref, ref, ref)
    return ref


def test_explicit_context_resolves_current_without_ambient_stack() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    parent = _anchor(builder)
    current = _anchor(builder)
    context = define_context(builder, parent, current)
    network = builder.freeze(root)

    before = network.snapshot()
    assert parent_of_context(network, context) is parent
    assert current_of_context(network, context) is current
    assert network.snapshot() == before


def test_same_source_can_resolve_differently_under_two_scoped_dictionaries() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    source_content = _anchor(builder)
    form_one = _anchor(builder)
    form_two = _anchor(builder)

    base_one = define_dictionary_scope(builder, root, root)
    effect_one = define_dictionary_effect(
        builder, base_one, root, root, source_content, form_one
    )
    base_two = define_dictionary_scope(builder, root, root)
    effect_two = define_dictionary_effect(
        builder, base_two, root, root, source_content, form_two
    )
    network = builder.freeze(root)

    resolution_one = lookup_scoped_dictionary(
        network, effect_one.after_scope, source_content
    )
    resolution_two = lookup_scoped_dictionary(
        network, effect_two.after_scope, source_content
    )
    assert resolution_one is not None and resolution_one.form is form_one
    assert resolution_two is not None and resolution_two.form is form_two
    verify_visible_dictionary_occurrence(
        network,
        effect_one.after_scope,
        effect_one.occurrence,
        source_content,
        form_one,
    )
    verify_visible_dictionary_occurrence(
        network,
        effect_two.after_scope,
        effect_two.occurrence,
        source_content,
        form_two,
    )


def test_theory_and_grammar_membership_are_ordinary_exact_links() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    theory = _anchor(builder)
    grammar = _anchor(builder)
    form = _anchor(builder)
    grammar_evidence = _anchor(builder)

    theory_membership = define_membership(builder, theory, form)
    grammar_membership = define_membership(builder, grammar, grammar_evidence)
    network = builder.freeze(root)

    assert network.link(theory_membership).start is theory
    assert network.link(theory_membership).end is form
    assert network.link(grammar_membership).start is grammar
    assert network.link(grammar_membership).end is grammar_evidence
    assert has_exact_membership(network, theory, form)
    assert has_exact_membership(network, grammar, grammar_evidence)
    assert not has_exact_membership(network, theory, grammar_evidence)


def test_source_occurrence_is_distinct_from_canonical_content() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    content = _anchor(builder)
    source_one = define_source_occurrence(builder, content)
    source_two = define_source_occurrence(builder, content)
    network = builder.freeze(root)

    assert source_one is not content
    assert source_two is not content
    assert source_one is not source_two
    assert network.link(source_one).start is source_one
    assert network.link(source_one).end is content
    assert network.link(source_two).end is content


def test_gate_r_header_keeps_two_actual_acts_occurrence_distinct() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    interpreter = _anchor(builder)
    role_dictionary = define_dictionary_scope(builder, root, root)
    parent = _anchor(builder)
    result = _anchor(builder)
    after_context = define_context(builder, parent, result)

    act_one = define_act_header(builder, interpreter, role_dictionary, after_context)
    act_two = define_act_header(builder, interpreter, role_dictionary, after_context)
    network = builder.freeze(root)

    assert act_one is not act_two
    assert act_header(network, act_one) == (interpreter, role_dictionary, after_context)
    assert act_header(network, act_two) == (interpreter, role_dictionary, after_context)


def test_role_addressed_act_fields_are_additive_link_data() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    interpreter = _anchor(builder)
    role_dictionary = define_dictionary_scope(builder, root, root)
    parent = _anchor(builder)
    current = _anchor(builder)
    after_context = define_context(builder, parent, current)
    role_source = _anchor(builder)
    role_theory = _anchor(builder)
    source = _anchor(builder)
    theory = _anchor(builder)
    act = define_act_header(builder, interpreter, role_dictionary, after_context)

    define_act_field(builder, act, role_source, source)
    define_act_field(builder, act, role_theory, theory)
    network = builder.freeze(root)

    before = network.snapshot()
    assert act_values(network, act, role_source) == (source,)
    assert act_values(network, act, role_theory) == (theory,)
    assert act_values(network, act, interpreter) == ()
    assert network.snapshot() == before


def test_role_names_are_resolved_by_explicit_scoped_role_dictionary() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    role_name_source = _anchor(builder)
    role_source = _anchor(builder)
    role_other = _anchor(builder)
    base = define_dictionary_scope(builder, root, root)
    effect = define_dictionary_effect(
        builder, base, root, root, role_name_source, role_source
    )
    network = builder.freeze(root)

    resolution = lookup_scoped_dictionary(network, effect.after_scope, role_name_source)
    assert resolution is not None
    assert resolution.form is role_source
    assert role_other is not resolution.form


def test_non_context_and_non_act_shapes_reject_structural_readers() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    left = _anchor(builder)
    right = _anchor(builder)
    ordinary = builder.reserve()
    builder.define(ordinary, left, right)
    network = builder.freeze(root)

    with pytest.raises(FoundationStateError):
        current_of_context(network, ordinary)
    with pytest.raises(FoundationStateError):
        act_header(network, ordinary)
