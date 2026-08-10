from __future__ import annotations

from dataclasses import replace

import pytest

from core.exact_link_network import LinkNetworkBuilder
from core.foundation_v2_interpreter import (
    ColonEffectEvidence,
    ColonRoleRefs,
    InterpreterReplayError,
    replay_colon_effect,
)
from core.foundation_v2_state import (
    DictionaryConflictError,
    DictionaryLookupError,
    define_act_field,
    define_act_header,
    define_context,
    define_dictionary_effect,
    define_dictionary_scope,
    lookup_scoped_dictionary,
    verify_visible_dictionary_occurrence,
)


ROLE_NAMES = (
    "source",
    "source-content",
    "form",
    "before-dictionary",
    "entry",
    "definition-occurrence",
    "history-before",
    "history-after",
    "after-dictionary",
    "context",
)


def _anchor(builder: LinkNetworkBuilder):
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


def _roles(builder: LinkNetworkBuilder) -> ColonRoleRefs:
    refs = {name: _anchor(builder) for name in ROLE_NAMES}
    return ColonRoleRefs(
        source=refs["source"],
        source_content=refs["source-content"],
        form=refs["form"],
        before_dictionary=refs["before-dictionary"],
        entry=refs["entry"],
        definition_occurrence=refs["definition-occurrence"],
        history_before=refs["history-before"],
        history_after=refs["history-after"],
        after_dictionary=refs["after-dictionary"],
        context=refs["context"],
    )


def _role_items(roles: ColonRoleRefs):
    return (
        (roles.source, "source"),
        (roles.source_content, "source-content"),
        (roles.form, "form"),
        (roles.before_dictionary, "before-dictionary"),
        (roles.entry, "entry"),
        (roles.definition_occurrence, "definition-occurrence"),
        (roles.history_before, "history-before"),
        (roles.history_after, "history-after"),
        (roles.after_dictionary, "after-dictionary"),
        (roles.context, "context"),
    )


def _build_role_dictionary(builder, root, roles):
    dictionary = define_dictionary_scope(builder, root, root)
    history = root
    for role_ref, _ in _role_items(roles):
        role_name_content = _anchor(builder)
        effect = define_dictionary_effect(
            builder,
            dictionary,
            root,
            history,
            role_name_content,
            role_ref,
        )
        dictionary = effect.after_scope
        history = effect.history_after
    return dictionary


def _colon_fixture(
    *,
    before_dictionary=None,
    parent_scope=None,
    history_before=None,
    source_content=None,
    form=None,
    builder=None,
    root=None,
):
    if builder is None:
        builder = LinkNetworkBuilder()
    if root is None:
        root = _anchor(builder)
    if parent_scope is None:
        parent_scope = root
    if history_before is None:
        history_before = root
    if before_dictionary is None:
        before_dictionary = define_dictionary_scope(
            builder, parent_scope, history_before
        )
    if source_content is None:
        source_content = _anchor(builder)
    if form is None:
        form = _anchor(builder)

    source = builder.ensure_start_self_closed(source_content)
    effect = define_dictionary_effect(
        builder,
        before_dictionary,
        parent_scope,
        history_before,
        source_content,
        form,
    )

    interpreter = _anchor(builder)
    context_parent = _anchor(builder)
    context_current = _anchor(builder)
    context = define_context(builder, context_parent, context_current)
    roles = _roles(builder)
    role_dictionary = _build_role_dictionary(builder, root, roles)
    act = define_act_header(builder, interpreter, role_dictionary, context)

    expected_fields = (
        (roles.source, source),
        (roles.source_content, source_content),
        (roles.form, form),
        (roles.before_dictionary, before_dictionary),
        (roles.entry, effect.entry),
        (roles.definition_occurrence, effect.occurrence),
        (roles.history_before, history_before),
        (roles.history_after, effect.history_after),
        (roles.after_dictionary, effect.after_scope),
        (roles.context, context),
    )
    for role, value in expected_fields:
        define_act_field(builder, act, role, value)

    evidence = ColonEffectEvidence(
        interpreter=interpreter,
        source=source,
        source_content=source_content,
        form=form,
        before_dictionary=before_dictionary,
        entry=effect.entry,
        definition_occurrence=effect.occurrence,
        history_after=effect.history_after,
        after_dictionary=effect.after_scope,
        context=context,
        act=act,
        role_dictionary=role_dictionary,
        roles=roles,
    )
    return builder, root, evidence, effect


def test_colon_replays_one_persistent_definition_without_mutation() -> None:
    builder, root, evidence, effect = _colon_fixture()
    network = builder.freeze(root)
    before = network.snapshot()

    assert replay_colon_effect(network, evidence) is effect.after_scope
    resolution = lookup_scoped_dictionary(
        network, effect.after_scope, evidence.source_content
    )
    assert resolution is not None
    assert resolution.form is evidence.form
    assert resolution.occurrences == (effect.occurrence,)
    assert network.snapshot() == before


def test_repeated_identical_definition_in_new_history_has_two_structural_events() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    source_content = _anchor(builder)
    form = _anchor(builder)
    base = define_dictionary_scope(builder, root, root)
    first = define_dictionary_effect(
        builder, base, root, root, source_content, form
    )
    builder, _, evidence, second = _colon_fixture(
        builder=builder,
        root=root,
        before_dictionary=first.after_scope,
        parent_scope=root,
        history_before=first.history_after,
        source_content=source_content,
        form=form,
    )
    network = builder.freeze(root)

    assert second.occurrence is not first.occurrence
    assert replay_colon_effect(network, evidence) is second.after_scope
    resolution = lookup_scoped_dictionary(
        network, second.after_scope, source_content
    )
    assert resolution is not None
    assert resolution.form is form
    assert resolution.occurrences == (second.occurrence, first.occurrence)


def test_distinct_local_forms_conflict_instead_of_last_write_wins() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    source_content = _anchor(builder)
    form_one = _anchor(builder)
    form_two = _anchor(builder)
    base = define_dictionary_scope(builder, root, root)
    first = define_dictionary_effect(
        builder, base, root, root, source_content, form_one
    )
    builder, _, evidence, second = _colon_fixture(
        builder=builder,
        root=root,
        before_dictionary=first.after_scope,
        parent_scope=root,
        history_before=first.history_after,
        source_content=source_content,
        form=form_two,
    )
    network = builder.freeze(root)

    with pytest.raises(DictionaryConflictError):
        lookup_scoped_dictionary(network, second.after_scope, source_content)
    with pytest.raises(InterpreterReplayError, match="valid visible mapping"):
        replay_colon_effect(network, evidence)


def test_child_scope_shadows_parent_and_missing_name_falls_through() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    source_x = _anchor(builder)
    source_y = _anchor(builder)
    parent_x = _anchor(builder)
    parent_y = _anchor(builder)
    child_x = _anchor(builder)

    parent0 = define_dictionary_scope(builder, root, root)
    p1 = define_dictionary_effect(builder, parent0, root, root, source_x, parent_x)
    p2 = define_dictionary_effect(
        builder, p1.after_scope, root, p1.history_after, source_y, parent_y
    )
    child0 = define_dictionary_scope(builder, p2.after_scope, root)
    child1 = define_dictionary_effect(
        builder, child0, p2.after_scope, root, source_x, child_x
    )
    network = builder.freeze(root)

    resolved_x = lookup_scoped_dictionary(network, child1.after_scope, source_x)
    resolved_y = lookup_scoped_dictionary(network, child1.after_scope, source_y)
    assert resolved_x is not None and resolved_x.form is child_x
    assert resolved_y is not None and resolved_y.form is parent_y


def test_global_unreachable_occurrence_does_not_count_as_visibility() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    source_content = _anchor(builder)
    form = _anchor(builder)
    visible_base = define_dictionary_scope(builder, root, root)
    other_history = _anchor(builder)
    other_base = define_dictionary_scope(builder, root, other_history)
    other = define_dictionary_effect(
        builder, other_base, root, other_history, source_content, form
    )
    network = builder.freeze(root)

    with pytest.raises(DictionaryLookupError):
        verify_visible_dictionary_occurrence(
            network,
            visible_base,
            other.occurrence,
            source_content,
            form,
        )


def test_colon_rejects_occurrence_bound_to_wrong_before_snapshot() -> None:
    builder, root, evidence, _ = _colon_fixture()
    wrong_history = _anchor(builder)
    wrong_before = define_dictionary_scope(builder, root, wrong_history)
    forged_occurrence = builder.ensure(wrong_before, evidence.entry)
    forged = replace(evidence, definition_occurrence=forged_occurrence)
    network = builder.freeze(root)

    with pytest.raises(InterpreterReplayError, match="exact D_before"):
        replay_colon_effect(network, forged)


def test_colon_rejects_changed_parent_in_after_scope() -> None:
    builder, root, evidence, _ = _colon_fixture()
    wrong_parent = define_dictionary_scope(builder, root, root)
    forged_after = define_dictionary_scope(
        builder, wrong_parent, evidence.history_after
    )
    forged = replace(evidence, after_dictionary=forged_after)
    network = builder.freeze(root)

    with pytest.raises(InterpreterReplayError, match="changed lexical parent"):
        replay_colon_effect(network, forged)


def test_colon_rejects_forged_history_append() -> None:
    builder, root, evidence, _ = _colon_fixture()
    unrelated = _anchor(builder)
    forged_history = builder.ensure(unrelated, evidence.definition_occurrence)
    forged = replace(evidence, history_after=forged_history)
    network = builder.freeze(root)

    with pytest.raises(InterpreterReplayError, match="one exact append"):
        replay_colon_effect(network, forged)
