from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from core.exact_link_network import LinkNetworkBuilder
from core.foundation_v2_source import (
    SegmentSpec,
    SourceFrontEndBuilder,
    SourceReplayError,
    replay_source_front_end,
)
from core.foundation_v2_state import define_dictionary_membership


ROOT = Path(__file__).resolve().parents[1]


def _anchor(builder: LinkNetworkBuilder):
    ref = builder.reserve()
    builder.define(ref, ref, ref)
    return ref


def _byte_vocabulary(builder: LinkNetworkBuilder):
    return {value: _anchor(builder) for value in range(256)}


def _base_fixture():
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    byte_refs = _byte_vocabulary(builder)
    front_end = SourceFrontEndBuilder(builder, root, byte_refs)
    dictionary = _anchor(builder)
    grammar = _anchor(builder)
    theory = _anchor(builder)
    return builder, root, byte_refs, front_end, dictionary, grammar, theory


def _membership(builder, front_end, dictionary, raw_slice, form):
    content = front_end.content_ref(raw_slice)
    _, membership = define_dictionary_membership(builder, dictionary, content, form)
    return membership


def test_multibyte_arrow_is_one_selected_slice_and_replay_is_read_only() -> None:
    (
        builder,
        root,
        byte_refs,
        front_end,
        dictionary,
        grammar,
        theory,
    ) = _base_fixture()
    form_a = _anchor(builder)
    form_arrow = _anchor(builder)
    form_b = _anchor(builder)
    raw = "a⟼b".encode("utf-8")
    arrow = "⟼".encode("utf-8")
    source = front_end.source_occurrence(raw)

    membership_a = _membership(builder, front_end, dictionary, b"a", form_a)
    membership_arrow = _membership(builder, front_end, dictionary, arrow, form_arrow)
    membership_b = _membership(builder, front_end, dictionary, b"b", form_b)
    evidence = front_end.build_selected_evidence(
        source,
        (
            SegmentSpec(0, 1, form_a, membership_a),
            SegmentSpec(1, 1 + len(arrow), form_arrow, membership_arrow),
            SegmentSpec(1 + len(arrow), len(raw), form_b, membership_b),
        ),
        dictionary=dictionary,
        grammar=grammar,
        theory=theory,
    )
    network = builder.freeze(root)

    before = network.snapshot()
    assert replay_source_front_end(network, evidence, byte_refs) == (
        form_a,
        form_arrow,
        form_b,
    )
    assert network.snapshot() == before
    assert evidence.segments[1].start == 1
    assert evidence.segments[1].end == 1 + len(arrow)
    assert not any(
        network.link(ref).start is form_a and network.link(ref).end is form_b
        for ref in network.refs
    )


def test_same_bytes_can_resolve_differently_under_explicit_dictionaries() -> None:
    builder, root, byte_refs, front_end, _, grammar, theory = _base_fixture()
    dictionary_one = _anchor(builder)
    dictionary_two = _anchor(builder)
    form_one = _anchor(builder)
    form_two = _anchor(builder)
    source = front_end.source_occurrence(b"x")

    membership_one = _membership(builder, front_end, dictionary_one, b"x", form_one)
    membership_two = _membership(builder, front_end, dictionary_two, b"x", form_two)
    evidence_one = front_end.build_selected_evidence(
        source,
        (SegmentSpec(0, 1, form_one, membership_one),),
        dictionary=dictionary_one,
        grammar=grammar,
        theory=theory,
    )
    evidence_two = front_end.build_selected_evidence(
        source,
        (SegmentSpec(0, 1, form_two, membership_two),),
        dictionary=dictionary_two,
        grammar=grammar,
        theory=theory,
    )
    network = builder.freeze(root)

    assert replay_source_front_end(network, evidence_one, byte_refs) == (form_one,)
    assert replay_source_front_end(network, evidence_two, byte_refs) == (form_two,)
    assert evidence_one.content is evidence_two.content
    assert evidence_one.source is evidence_two.source


def test_ambiguous_segmentations_are_both_replayable_without_longest_match() -> None:
    (
        builder,
        root,
        byte_refs,
        front_end,
        dictionary,
        grammar,
        theory,
    ) = _base_fixture()
    form_a = _anchor(builder)
    form_b = _anchor(builder)
    form_ab = _anchor(builder)
    source = front_end.source_occurrence(b"ab")

    membership_a = _membership(builder, front_end, dictionary, b"a", form_a)
    membership_b = _membership(builder, front_end, dictionary, b"b", form_b)
    membership_ab = _membership(builder, front_end, dictionary, b"ab", form_ab)

    split = front_end.build_selected_evidence(
        source,
        (
            SegmentSpec(0, 1, form_a, membership_a),
            SegmentSpec(1, 2, form_b, membership_b),
        ),
        dictionary=dictionary,
        grammar=grammar,
        theory=theory,
    )
    whole = front_end.build_selected_evidence(
        source,
        (SegmentSpec(0, 2, form_ab, membership_ab),),
        dictionary=dictionary,
        grammar=grammar,
        theory=theory,
    )
    network = builder.freeze(root)

    assert replay_source_front_end(network, split, byte_refs) == (form_a, form_b)
    assert replay_source_front_end(network, whole, byte_refs) == (form_ab,)


def test_forged_span_boundary_is_rejected() -> None:
    (
        builder,
        root,
        byte_refs,
        front_end,
        dictionary,
        grammar,
        theory,
    ) = _base_fixture()
    form = _anchor(builder)
    source = front_end.source_occurrence(b"x")
    membership = _membership(builder, front_end, dictionary, b"x", form)
    evidence = front_end.build_selected_evidence(
        source,
        (SegmentSpec(0, 1, form, membership),),
        dictionary=dictionary,
        grammar=grammar,
        theory=theory,
    )
    forged_span = _anchor(builder)
    forged_segment = replace(evidence.segments[0], span=forged_span)
    forged = replace(evidence, segments=(forged_segment,))
    network = builder.freeze(root)

    with pytest.raises(SourceReplayError, match="span boundaries"):
        replay_source_front_end(network, forged, byte_refs)


def test_membership_from_wrong_dictionary_is_rejected() -> None:
    builder, root, byte_refs, front_end, dictionary, grammar, theory = _base_fixture()
    other_dictionary = _anchor(builder)
    form = _anchor(builder)
    source = front_end.source_occurrence(b"x")
    wrong_membership = _membership(builder, front_end, other_dictionary, b"x", form)
    evidence = front_end.build_selected_evidence(
        source,
        (SegmentSpec(0, 1, form, wrong_membership),),
        dictionary=dictionary,
        grammar=grammar,
        theory=theory,
    )
    network = builder.freeze(root)

    with pytest.raises(SourceReplayError, match="another dictionary"):
        replay_source_front_end(network, evidence, byte_refs)


def test_forged_grammar_or_theory_admission_is_rejected() -> None:
    (
        builder,
        root,
        byte_refs,
        front_end,
        dictionary,
        grammar,
        theory,
    ) = _base_fixture()
    form = _anchor(builder)
    source = front_end.source_occurrence(b"x")
    membership = _membership(builder, front_end, dictionary, b"x", form)
    evidence = front_end.build_selected_evidence(
        source,
        (SegmentSpec(0, 1, form, membership),),
        dictionary=dictionary,
        grammar=grammar,
        theory=theory,
    )
    unrelated = _anchor(builder)
    forged_grammar_membership = builder.reserve()
    builder.define(forged_grammar_membership, grammar, unrelated)
    forged = replace(evidence, grammar_membership=forged_grammar_membership)
    network = builder.freeze(root)

    with pytest.raises(SourceReplayError, match="grammar membership"):
        replay_source_front_end(network, forged, byte_refs)


def test_noncontiguous_or_partial_selected_partition_is_rejected_before_freeze() -> None:
    (
        builder,
        _,
        _,
        front_end,
        dictionary,
        grammar,
        theory,
    ) = _base_fixture()
    form = _anchor(builder)
    source = front_end.source_occurrence(b"ab")
    membership = _membership(builder, front_end, dictionary, b"a", form)

    with pytest.raises(SourceReplayError, match="contiguous source partition"):
        front_end.build_selected_evidence(
            source,
            (SegmentSpec(1, 2, form, membership),),
            dictionary=dictionary,
            grammar=grammar,
            theory=theory,
        )


def test_duplicate_byte_refs_are_rejected_as_noncanonical_vocabulary() -> None:
    builder = LinkNetworkBuilder()
    root = _anchor(builder)
    shared = _anchor(builder)
    byte_refs = {value: _anchor(builder) for value in range(256)}
    byte_refs[1] = shared
    byte_refs[2] = shared
    front_end = SourceFrontEndBuilder(builder, root, byte_refs)
    source = front_end.source_occurrence(b"x")
    dictionary = _anchor(builder)
    grammar = _anchor(builder)
    theory = _anchor(builder)
    form = _anchor(builder)
    membership = _membership(builder, front_end, dictionary, b"x", form)
    evidence = front_end.build_selected_evidence(
        source,
        (SegmentSpec(0, 1, form, membership),),
        dictionary=dictionary,
        grammar=grammar,
        theory=theory,
    )
    network = builder.freeze(root)

    with pytest.raises(SourceReplayError, match="occurrence-distinct"):
        replay_source_front_end(network, evidence, byte_refs)


def test_trusted_source_module_has_no_legacy_parser_or_ast_dependency() -> None:
    source = (ROOT / "core/foundation_v2_source.py").read_text(encoding="utf-8")
    assert "mtc_parser" not in source
    assert "mtc_ast" not in source
    assert "TokenKind" not in source
    assert "longest" not in source.lower().replace("longest-match", "")
