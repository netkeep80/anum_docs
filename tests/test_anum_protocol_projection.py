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


def test_grouping_preserves_depth_that_generic_materializer_does_not_encode() -> None:
    kernel = build_root_kernel()
    root = kernel.refs.root
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

    assert one_level == SequenceDescription(
        root=root,
        items=(SequenceGroup((SequenceAtom(a), SequenceAtom(b))),),
    )
    assert two_levels == SequenceDescription(
        root=root,
        items=(
            SequenceGroup(
                (SequenceGroup((SequenceAtom(a), SequenceAtom(b))),)
            ),
        ),
    )
    assert one_level != two_levels

    one_materialized = materialize_sequence(network, one_level)
    two_materialized = materialize_sequence(network, two_levels)

    # Grouping retains exact O/C depth, while the generic nested-sequence
    # materializer still has no rule that encodes it as an extra carrier level.
    assert len(one_materialized.created) == 1
    assert len(two_materialized.created) == 1
    assert (
        one_materialized.created[0].start,
        one_materialized.created[0].end,
    ) == (a, b)
    assert (
        two_materialized.created[0].start,
        two_materialized.created[0].end,
    ) == (a, b)
    assert find_links(
        two_materialized.after,
        start=root,
        end=two_materialized.result,
    ) == ()


def test_user_examples_decompose_into_pass_deserialize_encode_and_left_fold() -> None:
    kernel = build_root_kernel()
    builder = kernel.network.evolve()
    root = kernel.refs.root
    a = kernel.refs.unlinked
    b = kernel.refs.linked

    carrier_a = builder.reserve()
    carrier_ab = builder.reserve()
    builder.define(carrier_a, root, a)
    builder.define(carrier_ab, carrier_a, b)
    before = builder.freeze()

    empty = materialize_sequence(before, SequenceDescription(root=root, items=()))
    singleton = materialize_sequence(
        before,
        SequenceDescription(root=root, items=(SequenceAtom(a),)),
    )
    assert empty.result is root and empty.created == ()
    assert singleton.result is a and singleton.created == ()

    # pass: an already-existing exact carrier is one value and creates nothing.
    passed = materialize_sequence(
        before,
        SequenceDescription(root=root, items=(SequenceAtom(carrier_ab),)),
    )
    assert passed.result is carrier_ab
    assert passed.created == ()

    # des: corrected left fold does not use R as an operand for nonempty input.
    deserialized = materialize_sequence(
        before,
        SequenceDescription(
            root=root,
            items=(SequenceAtom(a), SequenceAtom(b)),
        ),
    )
    x = deserialized.result
    assert len(deserialized.created) == 1
    assert (deserialized.created[0].start, deserialized.created[0].end) == (a, b)

    # enc: an explicit ordinary link effect R⟼value, never a bracket opcode.
    encoded_builder = deserialized.after.evolve()
    carrier_x = encoded_builder.reserve()
    literal_second = encoded_builder.reserve()
    recursive_second = encoded_builder.reserve()
    encoded_builder.define(carrier_x, root, x)
    encoded_builder.define(literal_second, root, carrier_ab)
    encoded_builder.define(recursive_second, root, carrier_x)
    encoded = encoded_builder.freeze()

    # [ab] -> enc(des(ab)); [[ab]] -> enc(pass(C_ab)).
    assert encoded.link(carrier_x).start is root
    assert encoded.link(carrier_x).end is x
    assert encoded.link(literal_second).start is root
    assert encoded.link(literal_second).end is carrier_ab

    # The older recursive-reencoding hypothesis is a distinct topology.
    assert encoded.link(recursive_second).start is root
    assert encoded.link(recursive_second).end is carrier_x
    assert carrier_ab is not carrier_x
    assert encoded.link(literal_second) != encoded.link(recursive_second)

    # ab[ab] -> des(a,b,des(a,b)); inner/outer a⟼b stay exact-distinct.
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
    inner_ab, outer_ab, mixed_result = mixed.created
    assert (inner_ab.start, inner_ab.end) == (a, b)
    assert (outer_ab.start, outer_ab.end) == (a, b)
    assert inner_ab.ref is not outer_ab.ref
    assert mixed_result.start is outer_ab.ref
    assert mixed_result.end is inner_ab.ref
    assert mixed.result is mixed_result.ref

    # [[ab]]ab -> des(enc(pass(C_ab)),a,b), using the literal second level.
    outer = materialize_sequence(
        encoded,
        SequenceDescription(
            root=root,
            items=(
                SequenceAtom(literal_second),
                SequenceAtom(a),
                SequenceAtom(b),
            ),
        ),
    )
    first, full = outer.created
    assert first.start is literal_second
    assert first.end is a
    assert full.start is first.ref
    assert full.end is b
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