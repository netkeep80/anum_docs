from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from core.exact_link_network import LinkNetworkBuilder
from core.foundation_v2_materialization import (
    SequenceAtom,
    SequenceDescription,
    materialize_sequence,
)
from core.foundation_v2_source import (
    SegmentSpec,
    SourceFrontEndBuilder,
    SourceReplayError,
    replay_source_front_end,
)
from core.foundation_v2_state import define_dictionary_effect, define_dictionary_scope


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
    grammar = _anchor(builder)
    theory = _anchor(builder)
    return builder, root, byte_refs, front_end, grammar, theory


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


def test_multibyte_arrow_is_one_selected_slice_and_replay_is_read_only() -> None:
    builder, root, byte_refs, front_end, grammar, theory = _base_fixture()
    form_a = _anchor(builder)
    form_arrow = _anchor(builder)
    form_b = _anchor(builder)
    raw = "a⟼b".encode("utf-8")
    arrow = "⟼".encode("utf-8")
    source = front_end.source_occurrence(raw)
    dictionary, occurrences = _dictionary_with(
        builder,
        root,
        front_end,
        ((b"a", form_a), (arrow, form_arrow), (b"b", form_b)),
    )
    evidence = front_end.build_selected_evidence(
        source,
        (
            SegmentSpec(0, 1, form_a, occurrences[0]),
            SegmentSpec(1, 1 + len(arrow), form_arrow, occurrences[1]),
            SegmentSpec(1 + len(arrow), len(raw), form_b, occurrences[2]),
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
    builder, root, byte_refs, front_end, grammar, theory = _base_fixture()
    form_one = _anchor(builder)
    form_two = _anchor(builder)
    source = front_end.source_occurrence(b"x")
    dictionary_one, occurrences_one = _dictionary_with(
        builder, root, front_end, ((b"x", form_one),)
    )
    dictionary_two, occurrences_two = _dictionary_with(
        builder, root, front_end, ((b"x", form_two),)
    )
    evidence_one = front_end.build_selected_evidence(
        source,
        (SegmentSpec(0, 1, form_one, occurrences_one[0]),),
        dictionary=dictionary_one,
        grammar=grammar,
        theory=theory,
    )
    evidence_two = front_end.build_selected_evidence(
        source,
        (SegmentSpec(0, 1, form_two, occurrences_two[0]),),
        dictionary=dictionary_two,
        grammar=grammar,
        theory=theory,
    )
    network = builder.freeze(root)

    assert replay_source_front_end(network, evidence_one, byte_refs) == (form_one,)
    assert replay_source_front_end(network, evidence_two, byte_refs) == (form_two,)
    assert evidence_one.content is evidence_two.content
    assert evidence_one.source is evidence_two.source


def test_dictionary_resolved_exact_link_is_direct_sequence_value() -> None:
    builder, root, byte_refs, front_end, grammar, theory = _base_fixture()
    a = _anchor(builder)
    b = _anchor(builder)
    prefix = _anchor(builder)
    existing = builder.reserve()
    builder.define(existing, a, b)

    raw = b"existing"
    source = front_end.source_occurrence(raw)
    dictionary, occurrences = _dictionary_with(
        builder,
        root,
        front_end,
        ((raw, existing),),
    )
    evidence = front_end.build_selected_evidence(
        source,
        (SegmentSpec(0, len(raw), existing, occurrences[0]),),
        dictionary=dictionary,
        grammar=grammar,
        theory=theory,
    )
    network = builder.freeze(root)

    before = network.snapshot()
    resolved = replay_source_front_end(network, evidence, byte_refs)
    assert resolved == (existing,)
    assert network.snapshot() == before

    materialized = materialize_sequence(
        network,
        SequenceDescription(
            root=root,
            items=(SequenceAtom(prefix), SequenceAtom(resolved[0])),
        ),
    )

    assert len(materialized.created) == 1
    outer = materialized.created[0]
    assert outer.start is prefix
    assert outer.end is existing
    assert materialized.after.link(existing) is network.link(existing)
    assert network.snapshot() == before


def test_ambiguous_segmentations_are_both_replayable_without_longest_match() -> None:
    builder, root, byte_refs, front_end, grammar, theory = _base_fixture()
    form_a = _anchor(builder)
    form_b = _anchor(builder)
    form_ab = _anchor(builder)
    source = front_end.source_occurrence(b"ab")
    dictionary, occurrences = _dictionary_with(
        builder,
        root,
        front_end,
        ((b"a", form_a), (b"b", form_b), (b"ab", form_ab)),
    )

    split = front_end.build_selected_evidence(
        source,
        (
            SegmentSpec(0, 1, form_a, occurrences[0]),
            SegmentSpec(1, 2, form_b, occurrences[1]),
        ),
        dictionary=dictionary,
        grammar=grammar,
        theory=theory,
    )
    whole = front_end.build_selected_evidence(
        source,
        (SegmentSpec(0, 2, form_ab, occurrences[2]),),
        dictionary=dictionary,
        grammar=grammar,
        theory=theory,
    )
    network = builder.freeze(root)

    assert replay_source_front_end(network, split, byte_refs) == (form_a, form_b)
    assert replay_source_front_end(network, whole, byte_refs) == (form_ab,)


def test_visible_historical_occurrence_is_valid_under_later_snapshot() -> None:
    builder, root, byte_refs, front_end, grammar, theory = _base_fixture()
    form_x = _anchor(builder)
    form_y = _anchor(builder)
    source = front_end.source_occurrence(b"x")
    dictionary, occurrences = _dictionary_with(
        builder,
        root,
        front_end,
        ((b"x", form_x), (b"y", form_y)),
    )
    evidence = front_end.build_selected_evidence(
        source,
        (SegmentSpec(0, 1, form_x, occurrences[0]),),
        dictionary=dictionary,
        grammar=grammar,
        theory=theory,
    )
    network = builder.freeze(root)

    assert replay_source_front_end(network, evidence, byte_refs) == (form_x,)


def test_forged_span_boundary_is_rejected() -> None:
    builder, root, byte_refs, front_end, grammar, theory = _base_fixture()
    form = _anchor(builder)
    source = front_end.source_occurrence(b"x")
    dictionary, occurrences = _dictionary_with(
        builder, root, front_end, ((b"x", form),)
    )
    evidence = front_end.build_selected_evidence(
        source,
        (SegmentSpec(0, 1, form, occurrences[0]),),
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


def test_occurrence_not_visible_from_selected_dictionary_is_rejected() -> None:
    builder, root, byte_refs, front_end, grammar, theory = _base_fixture()
    form = _anchor(builder)
    source = front_end.source_occurrence(b"x")
    dictionary, _ = _dictionary_with(builder, root, front_end, ((b"x", form),))
    _, other_occurrences = _dictionary_with(
        builder, root, front_end, ((b"x", form),)
    )
    evidence = front_end.build_selected_evidence(
        source,
        (SegmentSpec(0, 1, form, other_occurrences[0]),),
        dictionary=dictionary,
        grammar=grammar,
        theory=theory,
    )
    network = builder.freeze(root)

    with pytest.raises(SourceReplayError, match="scoped dictionary evidence"):
        replay_source_front_end(network, evidence, byte_refs)


def test_forged_grammar_or_theory_admission_is_rejected() -> None:
    builder, root, byte_refs, front_end, grammar, theory = _base_fixture()
    form = _anchor(builder)
    source = front_end.source_occurrence(b"x")
    dictionary, occurrences = _dictionary_with(
        builder, root, front_end, ((b"x", form),)
    )
    evidence = front_end.build_selected_evidence(
        source,
        (SegmentSpec(0, 1, form, occurrences[0]),),
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
    builder, root, _, front_end, grammar, theory = _base_fixture()
    form = _anchor(builder)
    source = front_end.source_occurrence(b"ab")
    dictionary, occurrences = _dictionary_with(
        builder, root, front_end, ((b"a", form),)
    )

    with pytest.raises(SourceReplayError, match="contiguous source partition"):
        front_end.build_selected_evidence(
            source,
            (SegmentSpec(1, 2, form, occurrences[0]),),
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
    grammar = _anchor(builder)
    theory = _anchor(builder)
    form = _anchor(builder)
    dictionary, occurrences = _dictionary_with(
        builder, root, front_end, ((b"x", form),)
    )
    evidence = front_end.build_selected_evidence(
        source,
        (SegmentSpec(0, 1, form, occurrences[0]),),
        dictionary=dictionary,
        grammar=grammar,
        theory=theory,
    )
    network = builder.freeze(root)

    with pytest.raises(SourceReplayError, match="occurrence-distinct"):
        replay_source_front_end(network, evidence, byte_refs)


def test_trusted_source_module_has_no_flat_dictionary_or_legacy_parser_path() -> None:
    source = (ROOT / "core/foundation_v2_source.py").read_text(encoding="utf-8")
    assert "dictionary_membership" not in source
    assert "mtc_parser" not in source
    assert "mtc_ast" not in source
    assert "TokenKind" not in source
    assert "longest" not in source.lower().replace("longest-match", "")
