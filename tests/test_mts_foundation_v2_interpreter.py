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
    replay_flat_source_subselection_continuation,
    replay_flat_source_subselection_reading,
    replay_relation_step,
)
from core.foundation_v2_source import SegmentSpec, SourceFrontEndBuilder
from core.foundation_v2_state import (
    define_act_field,
    define_act_header,
    define_context,
    define_dictionary_effect,
    define_dictionary_scope,
    define_membership,
)


ROOT = Path(__file__).resolve().parents[1]


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


def _byte_vocabulary(builder: LinkNetworkBuilder):
    return {value: _anchor(builder) for value in range(256)}


def _fold(builder: LinkNetworkBuilder, root, values):
    current = root
    for value in values:
        current = builder.ensure(current, value)
    return current


def _define_mapping(builder, root, before, history, source_content, form):
    effect = define_dictionary_effect(
        builder, before, root, history, source_content, form
    )
    return effect.after_scope, effect.history_after, effect.occurrence


def _relation_roles(builder: LinkNetworkBuilder) -> RelationStepRoleRefs:
    refs = [_anchor(builder) for _ in range(11)]
    return RelationStepRoleRefs(*refs)


def _flat_roles(builder: LinkNetworkBuilder) -> FlatSequenceReadingRoleRefs:
    refs = [_anchor(builder) for _ in range(9)]
    return FlatSequenceReadingRoleRefs(*refs)


def _role_dictionary(builder, root, front_end, roles):
    role_refs = tuple(roles.__dict__.values())
    dictionary = define_dictionary_scope(builder, root, root)
    history = root
    for index, role in enumerate(role_refs):
        dictionary, history, _ = _define_mapping(
            builder,
            root,
            dictionary,
            history,
            front_end.content_ref(f"role-{index}".encode()),
            role,
        )
    return dictionary


def _relation_fixture(form_kind: str = "start-open", *, conflict_field=False):
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    byte_refs = _byte_vocabulary(builder)
    front = SourceFrontEndBuilder(builder, root, byte_refs)

    grammar = _anchor(builder)
    theory = _anchor(builder)
    interpreter = _anchor(builder)
    parent = _anchor(builder)
    binding = _anchor(builder)
    fixed = _anchor(builder)

    if form_kind == "start-open":
        form = builder.ensure_start_self_closed(fixed)
        result_start, result_end = binding, fixed
    elif form_kind == "end-open":
        form = builder.ensure_end_self_closed(fixed)
        result_start, result_end = fixed, binding
    elif form_kind == "complete":
        form = builder.ensure(fixed, _anchor(builder))
        result_start, result_end = binding, builder._links[form.slot].end
    else:
        raise AssertionError(form_kind)

    source = front.source_occurrence(b"x")
    dictionary = define_dictionary_scope(builder, root, root)
    dictionary, _, occurrence = _define_mapping(
        builder,
        root,
        dictionary,
        root,
        front.content_ref(b"x"),
        form,
    )
    source_evidence = front.build_selected_evidence(
        source,
        (SegmentSpec(0, 1, form, occurrence),),
        dictionary=dictionary,
        grammar=grammar,
        theory=theory,
    )

    before_context = define_context(builder, parent, binding)
    result = builder.ensure(result_start, result_end)
    after_context = define_context(builder, parent, result)
    roles = _relation_roles(builder)
    role_dictionary = _role_dictionary(builder, root, front, roles)
    act = define_act_header(builder, interpreter, role_dictionary, after_context)

    values = (
        source_evidence.source,
        source_evidence.selection_sequence,
        source_evidence.form_sequence,
        dictionary,
        grammar,
        theory,
        form,
        before_context,
        binding,
        result,
        after_context,
    )
    for role, value in zip(roles.__dict__.values(), values, strict=True):
        define_act_field(builder, act, role, value)
    if conflict_field:
        define_act_field(builder, act, roles.result, fixed)

    network = builder.freeze(root)
    return network, byte_refs, RelationStepEvidence(
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
    ), fixed


def _flat_fixture(*, conflict_result_field=False):
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    byte_refs = _byte_vocabulary(builder)
    front = SourceFrontEndBuilder(builder, root, byte_refs)

    a = _anchor(builder)
    b = _anchor(builder)
    carrier_a = builder.ensure(root, a)
    carrier_ab = builder.ensure(carrier_a, b)
    pair_result = builder.ensure(a, b)

    source = front.source_occurrence(b"ab")
    dictionary = define_dictionary_scope(builder, root, root)
    history = root
    occurrences = {}
    for raw, form in ((b"a", a), (b"b", b), (b"ab", carrier_ab)):
        dictionary, history, occurrence = _define_mapping(
            builder,
            root,
            dictionary,
            history,
            front.content_ref(raw),
            form,
        )
        occurrences[raw] = occurrence

    pair_grammar = _anchor(builder)
    pair_theory = _anchor(builder)
    carrier_grammar = _anchor(builder)
    carrier_theory = _anchor(builder)
    pair_source = front.build_selected_evidence(
        source,
        (
            SegmentSpec(0, 1, a, occurrences[b"a"]),
            SegmentSpec(1, 2, b, occurrences[b"b"]),
        ),
        dictionary=dictionary,
        grammar=pair_grammar,
        theory=pair_theory,
    )
    carrier_source = front.build_selected_evidence(
        source,
        (SegmentSpec(0, 2, carrier_ab, occurrences[b"ab"]),),
        dictionary=dictionary,
        grammar=carrier_grammar,
        theory=carrier_theory,
    )

    interpreter = _anchor(builder)
    parent = _anchor(builder)
    before_context = define_context(builder, parent, _anchor(builder))
    pair_after = define_context(builder, parent, pair_result)
    carrier_after = define_context(builder, parent, carrier_ab)
    roles = _flat_roles(builder)
    role_dictionary = _role_dictionary(builder, root, front, roles)

    def reading(source_evidence, result, after_context):
        act = define_act_header(builder, interpreter, role_dictionary, after_context)
        values = (
            source_evidence.source,
            source_evidence.selection_sequence,
            source_evidence.form_sequence,
            source_evidence.dictionary,
            source_evidence.grammar,
            source_evidence.theory,
            before_context,
            result,
            after_context,
        )
        for role, value in zip(roles.__dict__.values(), values, strict=True):
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

    pair = reading(pair_source, pair_result, pair_after)
    carrier = reading(carrier_source, carrier_ab, carrier_after)
    if conflict_result_field:
        define_act_field(builder, pair.act, roles.result, carrier_ab)
    return builder.freeze(root), byte_refs, pair, carrier, carrier_ab


def test_start_self_closed_relation_replays_read_only() -> None:
    network, byte_refs, evidence, fixed = _relation_fixture("start-open")
    snapshot = network.snapshot()

    assert replay_relation_step(network, evidence, byte_refs) is evidence.result
    assert network.link(evidence.form).start is evidence.form
    assert network.link(evidence.form).end is fixed
    assert (network.link(evidence.result).start, network.link(evidence.result).end) == (
        evidence.binding,
        fixed,
    )
    assert network.snapshot() == snapshot


def test_end_self_closed_relation_replays_symmetrically() -> None:
    network, byte_refs, evidence, fixed = _relation_fixture("end-open")

    assert replay_relation_step(network, evidence, byte_refs) is evidence.result
    assert network.link(evidence.form).start is fixed
    assert network.link(evidence.form).end is evidence.form
    assert (network.link(evidence.result).start, network.link(evidence.result).end) == (
        fixed,
        evidence.binding,
    )


def test_relation_result_is_canonical_for_its_poles() -> None:
    network, byte_refs, evidence, fixed = _relation_fixture("start-open")

    assert network.find(evidence.binding, fixed) is evidence.result
    assert replay_relation_step(network, evidence, byte_refs) is evidence.result


def test_structurally_different_forged_result_rejects() -> None:
    network, byte_refs, evidence, _ = _relation_fixture("start-open")
    evolution = network.evolve()
    other_end = evolution.ensure_start_self_closed(evidence.result)
    other_result = evolution.ensure(evidence.binding, other_end)
    evolved = evolution.freeze()

    with pytest.raises(InterpreterReplayError):
        replay_relation_step(
            evolved,
            replace(evidence, result=other_result),
            byte_refs,
        )


def test_forged_binding_rejects_even_when_source_is_valid() -> None:
    network, byte_refs, evidence, fixed = _relation_fixture("start-open")
    with pytest.raises(InterpreterReplayError, match="binding is not exact current"):
        replay_relation_step(network, replace(evidence, binding=fixed), byte_refs)


def test_complete_form_is_not_silently_treated_as_partial() -> None:
    network, byte_refs, evidence, _ = _relation_fixture("complete")
    with pytest.raises(InterpreterReplayError, match="not exactly one-pole"):
        replay_relation_step(network, evidence, byte_refs)


def test_forged_source_or_act_evidence_rejects() -> None:
    network, byte_refs, evidence, fixed = _relation_fixture("start-open")
    forged_source = replace(evidence.source_evidence, dictionary=fixed)
    with pytest.raises(InterpreterReplayError, match="source-front-end evidence"):
        replay_relation_step(
            network,
            replace(evidence, source_evidence=forged_source),
            byte_refs,
        )

    network2, byte_refs2, conflicting, _ = _relation_fixture(
        "start-open", conflict_field=True
    )
    with pytest.raises(InterpreterReplayError, match="field 'result'"):
        replay_relation_step(network2, conflicting, byte_refs2)


def test_same_source_can_have_two_structurally_distinct_flat_readings() -> None:
    network, byte_refs, pair, carrier, carrier_ab = _flat_fixture()
    snapshot = network.snapshot()

    assert pair.source_evidence.source is carrier.source_evidence.source
    assert pair.source_evidence.form_sequence is not carrier.source_evidence.form_sequence
    pair_result = replay_flat_sequence_reading(network, pair, byte_refs)
    carrier_result = replay_flat_sequence_reading(network, carrier, byte_refs)
    assert network.link(pair_result).start is not network.root
    assert pair_result is not carrier_ab
    assert carrier_result is carrier_ab
    assert network.snapshot() == snapshot


def test_flat_reading_rejects_result_from_other_segmentation() -> None:
    network, byte_refs, pair, _, carrier_ab = _flat_fixture()
    with pytest.raises(InterpreterReplayError):
        replay_flat_sequence_reading(
            network,
            replace(pair, result=carrier_ab),
            byte_refs,
        )


def test_flat_reading_rejects_conflicting_result_field() -> None:
    network, byte_refs, pair, _, _ = _flat_fixture(conflict_result_field=True)
    with pytest.raises(InterpreterReplayError, match="field 'result'"):
        replay_flat_sequence_reading(network, pair, byte_refs)


def test_flat_subselection_reading_and_continuation_are_read_only() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    byte_refs = _byte_vocabulary(builder)
    front = SourceFrontEndBuilder(builder, root, byte_refs)
    prefix = _anchor(builder)
    a = _anchor(builder)
    b = _anchor(builder)
    pair = builder.ensure(a, b)
    prefix_a = builder.ensure(prefix, a)
    continued = builder.ensure(prefix_a, b)

    source = front.source_occurrence(b"ab")
    dictionary = define_dictionary_scope(builder, root, root)
    history = root
    occurrences = []
    for raw, form in ((b"a", a), (b"b", b)):
        dictionary, history, occurrence = _define_mapping(
            builder,
            root,
            dictionary,
            history,
            front.content_ref(raw),
            form,
        )
        occurrences.append(occurrence)
    grammar = _anchor(builder)
    theory = _anchor(builder)
    source_evidence = front.build_selected_evidence(
        source,
        (
            SegmentSpec(0, 1, a, occurrences[0]),
            SegmentSpec(1, 2, b, occurrences[1]),
        ),
        dictionary=dictionary,
        grammar=grammar,
        theory=theory,
    )
    selection = source_evidence.selection_sequence
    forms = source_evidence.form_sequence
    grammar_membership = define_membership(builder, grammar, forms)
    theory_membership = define_membership(builder, theory, forms)

    interpreter = _anchor(builder)
    parent = _anchor(builder)
    roles = _flat_roles(builder)
    role_dictionary = _role_dictionary(builder, root, front, roles)

    def evidence(before_current, result):
        before_context = define_context(builder, parent, before_current)
        after_context = define_context(builder, parent, result)
        act = define_act_header(builder, interpreter, role_dictionary, after_context)
        values = (
            source,
            selection,
            forms,
            dictionary,
            grammar,
            theory,
            before_context,
            result,
            after_context,
        )
        for role, value in zip(roles.__dict__.values(), values, strict=True):
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

    reading = evidence(_anchor(builder), pair)
    continuation = evidence(prefix, continued)
    network = builder.freeze(root)
    snapshot = network.snapshot()

    assert replay_flat_source_subselection_reading(
        network,
        reading,
        byte_refs,
        start_segment=0,
        end_segment=2,
        selection_sequence=selection,
        form_sequence=forms,
        grammar=grammar,
        theory=theory,
        grammar_membership=grammar_membership,
        theory_membership=theory_membership,
    ) is pair
    assert replay_flat_source_subselection_continuation(
        network,
        continuation,
        byte_refs,
        start_segment=0,
        end_segment=2,
        selection_sequence=selection,
        form_sequence=forms,
        grammar=grammar,
        theory=theory,
        grammar_membership=grammar_membership,
        theory_membership=theory_membership,
    ) is continued
    assert network.snapshot() == snapshot


def test_interpreter_module_has_no_legacy_parser_or_materializer_dependency() -> None:
    source = (ROOT / "core/foundation_v2_interpreter.py").read_text(encoding="utf-8")
    assert "mtc_parser" not in source
    assert "mtc_ast" not in source
    assert "mtc_interpreter" not in source
    assert "materialize(" not in source
