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
    define_dictionary_membership,
    define_membership,
    define_source_occurrence,
    dictionary_forms,
    has_exact_membership,
    parent_of_context,
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


def test_same_source_can_resolve_differently_under_two_dictionaries() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    source_content = _anchor(builder)
    form_one = _anchor(builder)
    form_two = _anchor(builder)
    dictionary_one = _anchor(builder)
    dictionary_two = _anchor(builder)

    define_dictionary_membership(builder, dictionary_one, source_content, form_one)
    define_dictionary_membership(builder, dictionary_two, source_content, form_two)
    network = builder.freeze(root)

    assert dictionary_forms(network, dictionary_one, source_content) == (form_one,)
    assert dictionary_forms(network, dictionary_two, source_content) == (form_two,)


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
    role_dictionary = _anchor(builder)
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
    role_dictionary = _anchor(builder)
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


def test_role_names_are_resolved_by_explicit_role_dictionary() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    role_dictionary = _anchor(builder)
    role_name_source = _anchor(builder)
    role_source = _anchor(builder)
    role_other = _anchor(builder)

    define_dictionary_membership(
        builder,
        role_dictionary,
        role_name_source,
        role_source,
    )
    network = builder.freeze(root)

    assert dictionary_forms(network, role_dictionary, role_name_source) == (role_source,)
    assert role_other not in dictionary_forms(network, role_dictionary, role_name_source)


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
