from __future__ import annotations

import pytest

from core.rooted_link_network import LinkNetworkBuilder
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
    """Create a fresh *structurally* distinguished test value rooted at ∞."""

    if not builder._refs:  # test fixture starts from the unique root
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


def test_same_source_content_has_one_canonical_start_self_closed_source() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    content = _anchor(builder)
    source_one = define_source_occurrence(builder, content)
    source_two = define_source_occurrence(builder, content)
    network = builder.freeze(root)

    assert source_one is not content
    assert source_two is source_one
    assert network.link(source_one).start is source_one
    assert network.link(source_one).end is content


def test_same_gate_r_header_is_one_canonical_act_form() -> None:
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

    assert act_two is act_one
    assert act_header(network, act_one) == (interpreter, role_dictionary, after_context)


def test_same_act_form_produces_same_explicit_deictic_context() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    interpreter = _anchor(builder)
    role_dictionary = define_dictionary_scope(builder, root, root)
    transition_parent = _anchor(builder)
    result = _anchor(builder)
    after_context = define_context(builder, transition_parent, result)

    act_one = define_act_header(builder, interpreter, role_dictionary, after_context)
    act_two = define_act_header(builder, interpreter, role_dictionary, after_context)

    deictic_parent = _anchor(builder)
    context_one = define_context(builder, deictic_parent, act_one)
    context_two = define_context(builder, deictic_parent, act_two)
    network = builder.freeze(root)

    before = network.snapshot()
    assert act_two is act_one
    assert context_two is context_one
    assert current_of_context(network, context_one) is act_one
    assert network.snapshot() == before


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


def test_same_source_can_have_two_structurally_distinct_reading_acts() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    interpreter = _anchor(builder)
    role_dictionary = define_dictionary_scope(builder, root, root)

    source_content = _anchor(builder)
    source = define_source_occurrence(builder, source_content)
    dictionary = define_dictionary_scope(builder, root, root)
    before_parent = _anchor(builder)
    before_current = _anchor(builder)
    before_context = define_context(builder, before_parent, before_current)

    open_form = _anchor(builder)
    close_form = _anchor(builder)
    grammar_one = _anchor(builder)
    grammar_two = _anchor(builder)
    theory_one = _anchor(builder)
    theory_two = _anchor(builder)
    form_sequence_one = _anchor(builder)
    form_sequence_two = _anchor(builder)
    result_one = _anchor(builder)
    result_two = _anchor(builder)
    after_one = define_context(builder, before_parent, result_one)
    after_two = define_context(builder, before_parent, result_two)

    roles = {
        name: _anchor(builder)
        for name in (
            "source",
            "dictionary",
            "grammar",
            "theory",
            "form-sequence",
            "open-form",
            "close-form",
            "before-context",
            "result",
        )
    }

    act_one = define_act_header(builder, interpreter, role_dictionary, after_one)
    act_two = define_act_header(builder, interpreter, role_dictionary, after_two)

    common_fields = (
        (roles["source"], source),
        (roles["dictionary"], dictionary),
        (roles["open-form"], open_form),
        (roles["close-form"], close_form),
        (roles["before-context"], before_context),
    )
    for role, value in common_fields:
        define_act_field(builder, act_one, role, value)
        define_act_field(builder, act_two, role, value)

    for role, value in (
        (roles["grammar"], grammar_one),
        (roles["theory"], theory_one),
        (roles["form-sequence"], form_sequence_one),
        (roles["result"], result_one),
    ):
        define_act_field(builder, act_one, role, value)
    for role, value in (
        (roles["grammar"], grammar_two),
        (roles["theory"], theory_two),
        (roles["form-sequence"], form_sequence_two),
        (roles["result"], result_two),
    ):
        define_act_field(builder, act_two, role, value)

    selecting_parent = _anchor(builder)
    selection_one = define_context(builder, selecting_parent, act_one)
    selection_two = define_context(builder, selecting_parent, act_two)
    network = builder.freeze(root)
    snapshot = network.snapshot()

    assert act_one is not act_two
    assert act_values(network, act_one, roles["source"]) == (source,)
    assert act_values(network, act_two, roles["source"]) == (source,)
    assert act_values(network, act_one, roles["before-context"]) == (before_context,)
    assert act_values(network, act_two, roles["before-context"]) == (before_context,)
    assert act_values(network, act_one, roles["grammar"]) == (grammar_one,)
    assert act_values(network, act_two, roles["grammar"]) == (grammar_two,)
    assert act_values(network, act_one, roles["theory"]) == (theory_one,)
    assert act_values(network, act_two, roles["theory"]) == (theory_two,)
    assert act_values(network, act_one, roles["form-sequence"]) == (form_sequence_one,)
    assert act_values(network, act_two, roles["form-sequence"]) == (form_sequence_two,)
    assert act_values(network, act_one, roles["result"]) == (result_one,)
    assert act_values(network, act_two, roles["result"]) == (result_two,)
    assert current_of_context(network, selection_one) is act_one
    assert current_of_context(network, selection_two) is act_two
    assert network.snapshot() == snapshot


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
    ordinary = builder.ensure(left, right)
    network = builder.freeze(root)

    with pytest.raises(FoundationStateError):
        current_of_context(network, ordinary)
    with pytest.raises(FoundationStateError):
        act_header(network, ordinary)
