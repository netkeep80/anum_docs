"""Conformance tests for contextual L3 Anum protocol v0.2."""

import pytest

from core.anum_model import ProjectionContext, ProjectionKind
from core.anum_parser import normalize_raw_form, parse_raw_quaternary
from core.anum_protocol import (
    has_quote_envelope,
    project_anum,
    quote_anum,
    unquote_anum,
    validate_anum,
)
from core.foundation_v2_materialization import (
    SequenceAtom,
    SequenceDescription,
    SequenceGroup,
    find_links,
    materialize_sequence,
    replay_resolved_sequence_grouping,
)
from core.foundation_v2_root import build_root_kernel
from core.foundation_v2_source import (
    SegmentSpec,
    SourceFrontEndBuilder,
    replay_source_front_end,
)
from core.foundation_v2_state import define_dictionary_effect, define_dictionary_scope


def _anchor(builder):
    ref = builder.reserve()
    builder.define(ref, ref, ref)
    return ref


def _byte_vocabulary(builder):
    return {value: _anchor(builder) for value in range(256)}


def _dictionary_with(builder, root, front_end, mappings):
    dictionary = define_dictionary_scope(builder, root, root)
    parent = root
    history = root
    occurrences = []
    for raw_slice, form in mappings:
        effect = define_dictionary_effect(
            builder,
            dictionary,
            parent,
            history,
            front_end.content_ref(raw_slice),
            form,
        )
        occurrences.append(effect.occurrence)
        dictionary = effect.after_scope
        history = effect.history_after
    return dictionary, tuple(occurrences)


def test_root_context_projects_open_close_to_canonical_link_value():
    projection = project_anum(parse_raw_quaternary("[]"), ProjectionContext.ROOT)

    assert projection.kind is ProjectionKind.PROTOCOL_VALUE
    assert projection.source == "[]"
    assert projection.arrow_form == "♀∞ ⟼ ∞♂"
    assert projection.protocol_value == "1"
    assert "accepted MTS v0.2" in projection.note


def test_root_context_projects_close_open_to_canonical_unlink_value():
    projection = project_anum(parse_raw_quaternary("]["), ProjectionContext.ROOT)

    assert projection.kind is ProjectionKind.PROTOCOL_VALUE
    assert projection.source == "]["
    assert projection.arrow_form == "∞♂ ⟼ ♀∞"
    assert projection.protocol_value == "0"
    assert "accepted MTS v0.2" in projection.note


def test_open_open_and_close_close_remain_boundary_forms_without_value():
    open_open = project_anum(parse_raw_quaternary("[["), ProjectionContext.ROOT)
    close_close = project_anum(parse_raw_quaternary("]]"), ProjectionContext.ROOT)

    assert open_open.kind is ProjectionKind.BOUNDARY_FORM
    assert open_open.arrow_form == "♀∞ ⟼ ♀∞"
    assert open_open.protocol_value is None

    assert close_close.kind is ProjectionKind.BOUNDARY_FORM
    assert close_close.arrow_form == "∞♂ ⟼ ∞♂"
    assert close_close.protocol_value is None


def test_relative_context_preserves_all_boundary_forms_raw():
    for source in ("[[", "[]", "][", "]]"):
        projection = project_anum(
            parse_raw_quaternary(source),
            ProjectionContext.RELATIVE,
        )
        assert projection.kind is ProjectionKind.RAW
        assert projection.protocol_value is None
        assert normalize_raw_form(projection.projected) == source


def test_quote_context_preserves_unwrapped_raw_payload():
    source = parse_raw_quaternary("][")
    projection = project_anum(source, ProjectionContext.QUOTE)

    assert projection.kind is ProjectionKind.QUOTED_RAW
    assert normalize_raw_form(projection.projected) == "]["
    assert projection.protocol_value is None


def test_real_quote_envelope_raises_description_level_one_step():
    raw = parse_raw_quaternary("][")
    quoted = quote_anum(raw)
    quoted_twice = quote_anum(quoted)

    assert normalize_raw_form(raw) == "]["
    assert normalize_raw_form(quoted) == "[][]"
    assert normalize_raw_form(quoted_twice) == "[[][]]"
    assert has_quote_envelope(quoted)

    first = project_anum(quoted_twice, ProjectionContext.QUOTE)
    second = project_anum(first.projected, ProjectionContext.QUOTE)

    assert normalize_raw_form(first.projected) == "[][]"
    assert normalize_raw_form(second.projected) == "]["


def test_quote_envelope_can_select_carrier_or_deserialized_denotation() -> None:
    historical_pair = parse_raw_quaternary("01")
    assert normalize_raw_form(quote_anum(historical_pair)) == "[01]"

    kernel = build_root_kernel()
    builder = kernel.network.evolve()
    root = kernel.refs.root
    opening = kernel.refs.opening
    closing = kernel.refs.closing
    unlinked = kernel.refs.unlinked
    linked = kernel.refs.linked

    carrier_head = builder.reserve()
    carrier = builder.reserve()
    builder.define(carrier_head, root, unlinked)
    builder.define(carrier, carrier_head, linked)

    byte_refs = _byte_vocabulary(builder)
    front_end = SourceFrontEndBuilder(builder, root, byte_refs)
    source = front_end.source_occurrence(b"[01]")
    dictionary, occurrences = _dictionary_with(
        builder,
        root,
        front_end,
        (
            (b"[", opening),
            (b"0", unlinked),
            (b"1", linked),
            (b"01", carrier),
            (b"]", closing),
        ),
    )

    deserialize_grammar = _anchor(builder)
    deserialize_theory = _anchor(builder)
    carrier_grammar = _anchor(builder)
    carrier_theory = _anchor(builder)

    deserialize_evidence = front_end.build_selected_evidence(
        source,
        (
            SegmentSpec(0, 1, opening, occurrences[0]),
            SegmentSpec(1, 2, unlinked, occurrences[1]),
            SegmentSpec(2, 3, linked, occurrences[2]),
            SegmentSpec(3, 4, closing, occurrences[4]),
        ),
        dictionary=dictionary,
        grammar=deserialize_grammar,
        theory=deserialize_theory,
    )
    carrier_evidence = front_end.build_selected_evidence(
        source,
        (
            SegmentSpec(0, 1, opening, occurrences[0]),
            SegmentSpec(1, 3, carrier, occurrences[3]),
            SegmentSpec(3, 4, closing, occurrences[4]),
        ),
        dictionary=dictionary,
        grammar=carrier_grammar,
        theory=carrier_theory,
    )
    network = builder.freeze()
    before = network.snapshot()

    assert find_links(network, start=unlinked, end=linked) == ()

    deserialize_forms = replay_source_front_end(
        network, deserialize_evidence, byte_refs
    )
    carrier_forms = replay_source_front_end(network, carrier_evidence, byte_refs)
    assert deserialize_forms == (opening, unlinked, linked, closing)
    assert carrier_forms == (opening, carrier, closing)

    deserialize_description = replay_resolved_sequence_grouping(
        network,
        deserialize_forms,
        open_form=opening,
        close_form=closing,
    )
    carrier_description = replay_resolved_sequence_grouping(
        network,
        carrier_forms,
        open_form=opening,
        close_form=closing,
    )
    assert deserialize_description == SequenceDescription(
        root=root,
        items=(SequenceGroup((SequenceAtom(unlinked), SequenceAtom(linked))),),
    )
    assert carrier_description == SequenceDescription(
        root=root,
        items=(SequenceGroup((SequenceAtom(carrier),)),),
    )
    assert network.snapshot() == before

    deserialized = materialize_sequence(network, deserialize_description)
    passed_carrier = materialize_sequence(network, carrier_description)

    assert len(deserialized.created) == 1
    assert deserialized.created[0].start is unlinked
    assert deserialized.created[0].end is linked
    assert deserialized.result is deserialized.created[0].ref
    assert deserialized.result is not carrier

    assert passed_carrier.created == ()
    assert passed_carrier.result is carrier
    assert find_links(passed_carrier.after, start=unlinked, end=linked) == ()
    assert passed_carrier.after.link(carrier) is network.link(carrier)
    assert network.snapshot() == before


def test_unquote_requires_explicit_outer_envelope():
    with pytest.raises(ValueError, match="quote-оболочку"):
        unquote_anum(parse_raw_quaternary("]["))


def test_context_validation_is_separate_from_raw_parser():
    raw = parse_raw_quaternary("][[]]10")

    for context in ProjectionContext:
        result = validate_anum(raw, context)
        assert result.is_valid
        assert result.context is context


def test_general_root_carrier_remains_raw_until_denotation_is_defined():
    raw = parse_raw_quaternary("[01]][")
    projection = project_anum(raw, ProjectionContext.ROOT)

    assert projection.kind is ProjectionKind.RAW
    assert normalize_raw_form(projection.projected) == "[01]]["
    assert "no general root denotation" in projection.note
