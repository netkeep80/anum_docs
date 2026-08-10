from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from core.exact_link_network import LinkNetworkBuilder
from core.foundation_v2_interpreter import (
    FlatSequenceReadingEvidence,
    FlatSequenceReadingRoleRefs,
    InterpreterReplayError,
    RelationStepEvidence,
    RelationStepRoleRefs,
    replay_flat_sequence_reading,
    replay_relation_step,
)
from core.foundation_v2_source import SegmentSpec, SourceFrontEndBuilder
from core.foundation_v2_state import (
    define_act_field,
    define_act_header,
    define_context,
    define_dictionary_effect,
    define_dictionary_scope,
)


ROOT = Path(__file__).resolve().parents[1]
ROLE_NAMES = (
    "source",
    "source-selection",
    "form-sequence",
    "dictionary",
    "grammar",
    "theory",
    "form",
    "before-context",
    "binding",
    "result",
    "after-context",
)
FLAT_ROLE_NAMES = (
    "source",
    "source-selection",
    "form-sequence",
    "dictionary",
    "grammar",
    "theory",
    "before-context",
    "result",
    "after-context",
)


def _anchor(builder: LinkNetworkBuilder):
    ref = builder.reserve()
    builder.define(ref, ref, ref)
    return ref


def _byte_vocabulary(builder: LinkNetworkBuilder):
    return {value: _anchor(builder) for value in range(256)}


def _new_link(builder: LinkNetworkBuilder, start, end):
    ref = builder.reserve()
    builder.define(ref, start, end)
    return ref


def _roles(builder: LinkNetworkBuilder) -> RelationStepRoleRefs:
    refs = {name: _anchor(builder) for name in ROLE_NAMES}
    return RelationStepRoleRefs(
        source=refs["source"],
        source_selection=refs["source-selection"],
        form_sequence=refs["form-sequence"],
        dictionary=refs["dictionary"],
        grammar=refs["grammar"],
        theory=refs["theory"],
        form=refs["form"],
        before_context=refs["before-context"],
        binding=refs["binding"],
        result=refs["result"],
        after_context=refs["after-context"],
    )


def _role_items(roles: RelationStepRoleRefs):
    return (
        ("source", roles.source),
        ("source-selection", roles.source_selection),
        ("form-sequence", roles.form_sequence),
        ("dictionary", roles.dictionary),
        ("grammar", roles.grammar),
        ("theory", roles.theory),
        ("form", roles.form),
        ("before-context", roles.before_context),
        ("binding", roles.binding),
        ("result", roles.result),
        ("after-context", roles.after_context),
    )


def _flat_roles(builder: LinkNetworkBuilder) -> FlatSequenceReadingRoleRefs:
    refs = {name: _anchor(builder) for name in FLAT_ROLE_NAMES}
    return FlatSequenceReadingRoleRefs(
        source=refs["source"],
        source_selection=refs["source-selection"],
        form_sequence=refs["form-sequence"],
        dictionary=refs["dictionary"],
        grammar=refs["grammar"],
        theory=refs["theory"],
        before_context=refs["before-context"],
        result=refs["result"],
        after_context=refs["after-context"],
    )


def _flat_role_items(roles: FlatSequenceReadingRoleRefs):
    return (
        ("source", roles.source),
        ("source-selection", roles.source_selection),
        ("form-sequence", roles.form_sequence),
        ("dictionary", roles.dictionary),
        ("grammar", roles.grammar),
        ("theory", roles.theory),
        ("before-context", roles.before_context),
        ("result", roles.result),
        ("after-context", roles.after_context),
    )


def _define_scoped_mapping(builder, root, before, history, source_content, form):
    effect = define_dictionary_effect(
        builder, before, root, history, source_content, form
    )
    return effect.after_scope, effect.history_after, effect.occurrence


def _fixture(
    form_kind: str = "start-open",
    *,
    duplicate_result: bool = False,
    forge_result_field: bool = False,
):
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    byte_refs = _byte_vocabulary(builder)
    front_end = SourceFrontEndBuilder(builder, root, byte_refs)

    grammar = _anchor(builder)
    theory = _anchor(builder)
    interpreter = _anchor(builder)
    parent = _anchor(builder)
    binding = _anchor(builder)
    fixed_pole = _anchor(builder)

    if form_kind == "start-open":
        form = builder.reserve()
        builder.define(form, form, fixed_pole)
        result_start, result_end = binding, fixed_pole
    elif form_kind == "end-open":
        form = builder.reserve()
        builder.define(form, fixed_pole, form)
        result_start, result_end = fixed_pole, binding
    elif form_kind == "complete":
        other = _anchor(builder)
        form = _new_link(builder, fixed_pole, other)
        result_start, result_end = binding, other
    else:
        raise AssertionError(form_kind)

    source = front_end.source_occurrence(b"x")
    slice_content = front_end.content_ref(b"x")
    dictionary = define_dictionary_scope(builder, root, root)
    dictionary, _, dictionary_occurrence = _define_scoped_mapping(
        builder, root, dictionary, root, slice_content, form
    )
    source_evidence = front_end.build_selected_evidence(
        source,
        (SegmentSpec(0, 1, form, dictionary_occurrence),),
        dictionary=dictionary,
        grammar=grammar,
        theory=theory,
    )

    before_context = define_context(builder, parent, binding)
    result = _new_link(builder, result_start, result_end)
    duplicate = None
    if duplicate_result:
        duplicate = _new_link(builder, result_start, result_end)
        result = duplicate
    after_context = define_context(builder, parent, result)

    roles = _roles(builder)
    role_dictionary = define_dictionary_scope(builder, root, root)
    role_history = root
    for role_name, role_ref in _role_items(roles):
        role_dictionary, role_history, _ = _define_scoped_mapping(
            builder,
            root,
            role_dictionary,
            role_history,
            front_end.content_ref(role_name.encode("utf-8")),
            role_ref,
        )

    act = define_act_header(builder, interpreter, role_dictionary, after_context)
    expected_fields = (
        (roles.source, source_evidence.source),
        (roles.source_selection, source_evidence.selection_sequence),
        (roles.form_sequence, source_evidence.form_sequence),
        (roles.dictionary, dictionary),
        (roles.grammar, grammar),
        (roles.theory, theory),
        (roles.form, form),
        (roles.before_context, before_context),
        (roles.binding, binding),
        (roles.result, result),
        (roles.after_context, after_context),
    )
    for role, value in expected_fields:
        define_act_field(builder, act, role, value)
    if forge_result_field:
        define_act_field(builder, act, roles.result, fixed_pole)

    network = builder.freeze(root)
    evidence = RelationStepEvidence(
        source_evidence=source_evidence,
        interpreter=interpreter,
        form=form,
        before_context=before_context,
        binding=binding,
        result=result,
        after_context=after_context,
        act=act,
        role_dictionary=role_dictionary,
        roles=roles,
    )
    return network, byte_refs, evidence, duplicate, fixed_pole


def _flat_reading_fixture(*, duplicate_pair_result_field: bool = False):
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    byte_refs = _byte_vocabulary(builder)
    front_end = SourceFrontEndBuilder(builder, root, byte_refs)

    a = _anchor(builder)
    b = _anchor(builder)
    carrier_a = _new_link(builder, root, a)
    carrier_ab = _new_link(builder, carrier_a, b)
    pair_result = _new_link(builder, a, b)

    source = front_end.source_occurrence(b"ab")
    dictionary = define_dictionary_scope(builder, root, root)
    history = root
    occurrences = {}
    for raw, form in ((b"a", a), (b"b", b), (b"ab", carrier_ab)):
        dictionary, history, occurrence = _define_scoped_mapping(
            builder,
            root,
            dictionary,
            history,
            front_end.content_ref(raw),
            form,
        )
        occurrences[raw] = occurrence

    pair_grammar = _anchor(builder)
    pair_theory = _anchor(builder)
    carrier_grammar = _anchor(builder)
    carrier_theory = _anchor(builder)
    pair_source = front_end.build_selected_evidence(
        source,
        (
            SegmentSpec(0, 1, a, occurrences[b"a"]),
            SegmentSpec(1, 2, b, occurrences[b"b"]),
        ),
        dictionary=dictionary,
        grammar=pair_grammar,
        theory=pair_theory,
    )
    carrier_source = front_end.build_selected_evidence(
        source,
        (SegmentSpec(0, 2, carrier_ab, occurrences[b"ab"]),),
        dictionary=dictionary,
        grammar=carrier_grammar,
        theory=carrier_theory,
    )

    interpreter = _anchor(builder)
    parent = _anchor(builder)
    prior = _anchor(builder)
    before_context = define_context(builder, parent, prior)
    pair_after = define_context(builder, parent, pair_result)
    carrier_after = define_context(builder, parent, carrier_ab)

    roles = _flat_roles(builder)
    role_dictionary = define_dictionary_scope(builder, root, root)
    role_history = root
    for role_name, role_ref in _flat_role_items(roles):
        role_dictionary, role_history, _ = _define_scoped_mapping(
            builder,
            root,
            role_dictionary,
            role_history,
            front_end.content_ref(role_name.encode("utf-8")),
            role_ref,
        )

    def reading(source_evidence, result, after_context):
        act = define_act_header(builder, interpreter, role_dictionary, after_context)
        fields = (
            (roles.source, source_evidence.source),
            (roles.source_selection, source_evidence.selection_sequence),
            (roles.form_sequence, source_evidence.form_sequence),
            (roles.dictionary, source_evidence.dictionary),
            (roles.grammar, source_evidence.grammar),
            (roles.theory, source_evidence.theory),
            (roles.before_context, before_context),
            (roles.result, result),
            (roles.after_context, after_context),
        )
        for role, value in fields:
            define_act_field(builder, act, role, value)
        return FlatSequenceReadingEvidence(
            source_evidence=source_evidence,
            interpreter=interpreter,
            before_context=before_context,
            result=result,
            after_context=after_context,
            act=act,
            role_dictionary=role_dictionary,
            roles=roles,
        )

    pair_reading = reading(pair_source, pair_result, pair_after)
    carrier_reading = reading(carrier_source, carrier_ab, carrier_after)
    if duplicate_pair_result_field:
        define_act_field(builder, pair_reading.act, roles.result, carrier_ab)

    network = builder.freeze(root)
    return network, byte_refs, pair_reading, carrier_reading, carrier_ab


def test_start_open_relation_replays_from_exact_current_read_only() -> None:
    network, byte_refs, evidence, _, fixed_pole = _fixture("start-open")
    before = network.snapshot()

    assert replay_relation_step(network, evidence, byte_refs) is evidence.result
    result = network.link(evidence.result)
    assert result.start is evidence.binding
    assert result.end is fixed_pole
    assert network.snapshot() == before


def test_end_open_relation_replays_symmetrically() -> None:
    network, byte_refs, evidence, _, fixed_pole = _fixture("end-open")

    assert replay_relation_step(network, evidence, byte_refs) is evidence.result
    result = network.link(evidence.result)
    assert result.start is fixed_pole
    assert result.end is evidence.binding


def test_selected_duplicate_same_pole_result_remains_exact_and_valid() -> None:
    network, byte_refs, evidence, selected_duplicate, _ = _fixture(
        "start-open", duplicate_result=True
    )
    assert selected_duplicate is evidence.result

    same_poles = [
        ref
        for ref in network.refs
        if network.link(ref).start is evidence.binding
        and network.link(ref).end is network.link(evidence.form).end
    ]
    assert len(same_poles) == 2
    assert replay_relation_step(network, evidence, byte_refs) is selected_duplicate


def test_forged_binding_rejects_even_when_source_is_valid() -> None:
    network, byte_refs, evidence, _, fixed_pole = _fixture("start-open")
    forged = replace(evidence, binding=fixed_pole)

    with pytest.raises(InterpreterReplayError, match="binding is not exact current"):
        replay_relation_step(network, forged, byte_refs)


def test_other_same_pole_result_rejects_when_after_context_selects_original() -> None:
    network, byte_refs, evidence, _, _ = _fixture(
        "start-open", duplicate_result=True
    )
    expected_poles = network.link(evidence.result)
    other = next(
        ref
        for ref in network.refs
        if ref is not evidence.result
        and network.link(ref).start is expected_poles.start
        and network.link(ref).end is expected_poles.end
    )
    forged = replace(evidence, result=other)

    with pytest.raises(InterpreterReplayError, match="after-context current"):
        replay_relation_step(network, forged, byte_refs)


def test_completed_form_is_not_silently_treated_as_partial() -> None:
    network, byte_refs, evidence, _, _ = _fixture("complete")

    with pytest.raises(InterpreterReplayError, match="not exactly one-pole"):
        replay_relation_step(network, evidence, byte_refs)


def test_forged_source_evidence_rejects_before_relation_resolution() -> None:
    network, byte_refs, evidence, _, fixed_pole = _fixture("start-open")
    forged_source = replace(evidence.source_evidence, dictionary=fixed_pole)
    forged = replace(evidence, source_evidence=forged_source)

    with pytest.raises(InterpreterReplayError, match="source-front-end evidence"):
        replay_relation_step(network, forged, byte_refs)


def test_conflicting_actual_act_field_rejects() -> None:
    network, byte_refs, evidence, _, _ = _fixture(
        "start-open", forge_result_field=True
    )

    with pytest.raises(InterpreterReplayError, match="field 'result'"):
        replay_relation_step(network, evidence, byte_refs)


def test_forged_act_header_rejects() -> None:
    network, byte_refs, evidence, _, fixed_pole = _fixture("start-open")
    forged = replace(evidence, role_dictionary=fixed_pole)

    with pytest.raises(InterpreterReplayError, match="header does not match"):
        replay_relation_step(network, forged, byte_refs)


def test_same_source_has_two_verified_flat_readings_without_hidden_mode() -> None:
    network, byte_refs, pair_reading, carrier_reading, carrier_ab = (
        _flat_reading_fixture()
    )
    before = network.snapshot()

    assert pair_reading.source_evidence.source is carrier_reading.source_evidence.source
    assert pair_reading.source_evidence.dictionary is carrier_reading.source_evidence.dictionary
    assert pair_reading.source_evidence.form_sequence is not carrier_reading.source_evidence.form_sequence
    assert pair_reading.source_evidence.grammar is not carrier_reading.source_evidence.grammar
    assert pair_reading.source_evidence.theory is not carrier_reading.source_evidence.theory

    pair_result = replay_flat_sequence_reading(network, pair_reading, byte_refs)
    carrier_result = replay_flat_sequence_reading(network, carrier_reading, byte_refs)

    pair_link = network.link(pair_result)
    assert pair_link.start is not network.root
    assert pair_result is not carrier_ab
    assert carrier_result is carrier_ab
    assert network.snapshot() == before


def test_flat_reading_rejects_result_from_other_valid_segmentation() -> None:
    network, byte_refs, pair_reading, _, carrier_ab = _flat_reading_fixture()
    forged = replace(pair_reading, result=carrier_ab)

    with pytest.raises(InterpreterReplayError, match="does not start"):
        replay_flat_sequence_reading(network, forged, byte_refs)


def test_flat_reading_rejects_duplicate_exact_act_result_field() -> None:
    network, byte_refs, pair_reading, _, _ = _flat_reading_fixture(
        duplicate_pair_result_field=True
    )

    with pytest.raises(InterpreterReplayError, match="field 'result'"):
        replay_flat_sequence_reading(network, pair_reading, byte_refs)


def test_interpreter_replay_has_no_legacy_parser_ast_or_interpreter_dependency() -> None:
    source = (ROOT / "core/foundation_v2_interpreter.py").read_text(encoding="utf-8")
    assert "mtc_parser" not in source
    assert "mtc_ast" not in source
    assert "mtc_interpreter" not in source
    assert "TokenKind" not in source
