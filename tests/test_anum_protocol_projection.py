"""Conformance tests for contextual L3 Anum protocol and Foundation-v2 bridge."""

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
from core.foundation_v2_source import SegmentSpec, SourceFrontEndBuilder, replay_source_front_end
from core.foundation_v2_state import define_dictionary_effect, define_dictionary_scope


def _anchor(builder):
    """Return a fresh value distinguished from the rooted MTS structure."""

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


def _byte_vocabulary(builder):
    return {value: _anchor(builder) for value in range(256)}


def _dictionary_with(builder, root, front_end, mappings):
    dictionary = define_dictionary_scope(builder, root, root)
    history = root
    occurrences = []
    for raw_slice, form in mappings:
        effect = define_dictionary_effect(
            builder,
            dictionary,
            root,
            history,
            front_end.content_ref(raw_slice),
            form,
        )
        occurrences.append(effect.occurrence)
        dictionary = effect.after_scope
        history = effect.history_after
    return dictionary, tuple(occurrences)


def test_root_context_projects_open_close_to_historical_protocol_value():
    projection = project_anum(parse_raw_quaternary("[]"), ProjectionContext.ROOT)

    assert projection.kind is ProjectionKind.PROTOCOL_VALUE
    assert projection.source == "[]"
    assert projection.arrow_form == "♀∞ ⟼ ∞♂"
    assert projection.protocol_value == "1"
    assert "accepted MTS v0.2" in projection.note


def test_root_context_projects_close_open_to_historical_unlink_value():
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


def test_relative_and_quote_contexts_preserve_raw_boundary_content():
    for source in ("[[", "[]", "][", "]]"):
        relative = project_anum(
            parse_raw_quaternary(source),
            ProjectionContext.RELATIVE,
        )
        assert relative.kind is ProjectionKind.RAW
        assert relative.protocol_value is None
        assert normalize_raw_form(relative.projected) == source

    quoted_raw = project_anum(parse_raw_quaternary("]["), ProjectionContext.QUOTE)
    assert quoted_raw.kind is ProjectionKind.QUOTED_RAW
    assert normalize_raw_form(quoted_raw.projected) == "]["


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

    carrier_head = builder.ensure(root, unlinked)
    carrier = builder.ensure(carrier_head, linked)

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

    deserialize_forms = replay_source_front_end(network, deserialize_evidence, byte_refs)
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
    assert (deserialized.created[0].start, deserialized.created[0].end) == (
        unlinked,
        linked,
    )
    assert deserialized.result is not carrier
    assert passed_carrier.created == ()
    assert passed_carrier.result is carrier
    assert find_links(passed_carrier.after, start=unlinked, end=linked) == ()
    assert network.snapshot() == before


def test_grouping_depth_is_syntactic_even_when_current_materializer_denotes_same_value() -> None:
    kernel = build_root_kernel()
    opening = kernel.refs.opening
    closing = kernel.refs.closing
    a = kernel.refs.unlinked
    b = kernel.refs.linked
    network = kernel.network

    one_level = replay_resolved_sequence_grouping(
        network,
        (opening, a, b, closing),
        open_form=opening,
        close_form=closing,
    )
    two_levels = replay_resolved_sequence_grouping(
        network,
        (opening, opening, a, b, closing, closing),
        open_form=opening,
        close_form=closing,
    )

    assert one_level != two_levels
    one_materialized = materialize_sequence(network, one_level)
    two_materialized = materialize_sequence(network, two_levels)
    assert len(one_materialized.created) == 1
    assert len(two_materialized.created) == 1
    assert one_materialized.result.slot == two_materialized.result.slot


def test_user_examples_use_canonical_reuse_instead_of_inner_outer_duplicate() -> None:
    kernel = build_root_kernel()
    builder = kernel.network.evolve()
    root = kernel.refs.root
    a = kernel.refs.unlinked
    b = kernel.refs.linked

    carrier_a = builder.ensure(root, a)
    carrier_ab = builder.ensure(carrier_a, b)
    before = builder.freeze()

    empty = materialize_sequence(before, SequenceDescription(root=root, items=()))
    singleton = materialize_sequence(
        before,
        SequenceDescription(root=root, items=(SequenceAtom(a),)),
    )
    assert empty.result is root and empty.created == ()
    assert singleton.result is a and singleton.created == ()

    passed = materialize_sequence(
        before,
        SequenceDescription(root=root, items=(SequenceAtom(carrier_ab),)),
    )
    assert passed.result is carrier_ab
    assert passed.created == ()

    deserialized = materialize_sequence(
        before,
        SequenceDescription(root=root, items=(SequenceAtom(a), SequenceAtom(b))),
    )
    x = deserialized.result
    assert len(deserialized.created) == 1
    assert (deserialized.created[0].start, deserialized.created[0].end) == (a, b)

    encoded_builder = deserialized.after.evolve()
    carrier_x = encoded_builder.ensure(root, x)
    literal_second = encoded_builder.ensure(root, carrier_ab)
    recursive_second = encoded_builder.ensure(root, carrier_x)
    encoded = encoded_builder.freeze()

    assert (encoded.link(carrier_x).start, encoded.link(carrier_x).end) == (root, x)
    assert (encoded.link(literal_second).start, encoded.link(literal_second).end) == (
        root,
        carrier_ab,
    )
    assert (encoded.link(recursive_second).start, encoded.link(recursive_second).end) == (
        root,
        carrier_x,
    )
    assert carrier_ab is not carrier_x
    assert literal_second is not recursive_second

    mixed = materialize_sequence(
        before,
        SequenceDescription(
            root=root,
            items=(
                SequenceAtom(a),
                SequenceAtom(b),
                SequenceGroup((SequenceAtom(a), SequenceAtom(b))),
            ),
        ),
    )
    assert len(mixed.created) == 2
    ab, loop_ab = mixed.created
    assert (ab.start, ab.end) == (a, b)
    assert (loop_ab.start, loop_ab.end) == (ab.ref, ab.ref)
    assert mixed.result is loop_ab.ref

    outer = materialize_sequence(
        encoded,
        SequenceDescription(
            root=root,
            items=(SequenceAtom(literal_second), SequenceAtom(a), SequenceAtom(b)),
        ),
    )
    first, full = outer.created
    assert (first.start, first.end) == (literal_second, a)
    assert (full.start, full.end) == (first.ref, b)
    assert outer.result is full.ref


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
