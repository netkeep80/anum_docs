"""Foundation-v2 source front-end over the canonical MTS link network.

The trusted operation in this module is *replay of selected evidence*. Candidate
segmentation/token search is intentionally outside the trusted core. A caller
supplies byte-protocol refs, a source record, selected spans, visible scoped-
dictionary declaration evidence and explicit grammar/theory admission.

Host byte offsets and dataclasses are transport/checker machinery. They are not
semantic identity. Every link whose poles are already known is obtained through
the canonical pair operation; replay never materializes the application relation
described by source text.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence

from .rooted_link_network import (
    LinkNetwork,
    LinkNetworkBuilder,
    LinkNetworkError,
    LinkRef,
    read_rooted_sequence,
)
from .foundation_v2_state import (
    DictionaryLookupError,
    define_membership,
    define_source_occurrence,
    verify_visible_dictionary_occurrence,
)


class SourceReplayError(ValueError):
    """Selected source evidence is incomplete, forged or inconsistent."""


@dataclass(frozen=True)
class SourceOccurrence:
    """Transport record for one source link and its canonical content."""

    raw_bytes: bytes
    content: LinkRef
    source: LinkRef


@dataclass(frozen=True)
class SegmentSpec:
    """Untrusted selected span plus already-existing semantic evidence refs."""

    start: int
    end: int
    form: LinkRef
    dictionary_occurrence: LinkRef


@dataclass(frozen=True)
class SegmentEvidence:
    """Link evidence for one selected source slice."""

    start: int
    end: int
    slice_content: LinkRef
    span: LinkRef
    slice_evidence: LinkRef
    lexeme: LinkRef
    resolution: LinkRef
    dictionary_occurrence: LinkRef
    selection: LinkRef
    form: LinkRef


@dataclass(frozen=True)
class SourceFrontEndEvidence:
    """Replayable selected segmentation/resolution for one source record."""

    raw_bytes: bytes
    content: LinkRef
    source: LinkRef
    dictionary: LinkRef
    grammar: LinkRef
    theory: LinkRef
    segments: tuple[SegmentEvidence, ...]
    selection_sequence: LinkRef
    form_sequence: LinkRef
    grammar_membership: LinkRef
    theory_membership: LinkRef


class SourceFrontEndBuilder:
    """Untrusted construction helper for canonical source/evidence fixtures.

    ``byte_refs`` are the links selected by the lower canonical byte protocol.
    This layer does not redefine the ``[bbbbbbbb]`` carrier; it folds those byte
    refs into canonical source-content histories.
    """

    def __init__(
        self,
        builder: LinkNetworkBuilder,
        root: LinkRef,
        byte_refs: Mapping[int, LinkRef],
    ) -> None:
        if set(byte_refs) != set(range(256)):
            raise SourceReplayError("byte vocabulary must contain exactly 0..255")
        self._builder = builder
        self._root = root
        self._byte_refs = dict(byte_refs)
        self._content_cache: dict[bytes, LinkRef] = {b"": root}
        self._sources: dict[LinkRef, SourceOccurrence] = {}

    def content_ref(self, data: bytes) -> LinkRef:
        """Return the canonical R-seeded history link for exact bytes."""

        data = bytes(data)
        if data in self._content_cache:
            return self._content_cache[data]

        for size in range(1, len(data) + 1):
            prefix = data[:size]
            if prefix in self._content_cache:
                continue
            previous = self._content_cache[prefix[:-1]]
            byte_ref = self._byte_refs[prefix[-1]]
            current = self._builder.ensure(previous, byte_ref)
            self._content_cache[prefix] = current
        return self._content_cache[data]

    def source_occurrence(self, data: bytes) -> SourceOccurrence:
        """Return canonical source form ``S = S ⟼ C`` for content C.

        Equal content reuses the same source link. Distinct source uses are
        represented by selection/history evidence, not duplicate source links.
        """

        raw_bytes = bytes(data)
        content = self.content_ref(raw_bytes)
        source = define_source_occurrence(self._builder, content)
        result = SourceOccurrence(raw_bytes=raw_bytes, content=content, source=source)
        self._sources[source] = result
        return result

    def build_selected_evidence(
        self,
        source: SourceOccurrence,
        specs: Sequence[SegmentSpec],
        *,
        dictionary: LinkRef,
        grammar: LinkRef,
        theory: LinkRef,
    ) -> SourceFrontEndEvidence:
        """Build canonical evidence for one caller-selected segmentation.

        The function does not choose spans, perform longest-match, parse glyphs or
        invent dictionary definitions. ``SegmentSpec.dictionary_occurrence`` must
        already identify declaration evidence that trusted scoped lookup will
        prove visible from ``dictionary``.
        """

        if self._sources.get(source.source) != source:
            raise SourceReplayError("source occurrence was not issued by this builder")
        _validate_spans(source.raw_bytes, specs)

        prefix_refs = tuple(
            self.content_ref(source.raw_bytes[:offset])
            for offset in range(len(source.raw_bytes) + 1)
        )
        segment_evidence: list[SegmentEvidence] = []

        for spec in specs:
            slice_content = self.content_ref(source.raw_bytes[spec.start : spec.end])
            span = self._new_link(prefix_refs[spec.start], prefix_refs[spec.end])
            slice_evidence = self._new_link(span, slice_content)
            lexeme = self._new_link(source.source, slice_evidence)
            resolution = self._new_link(lexeme, spec.form)
            selection = self._new_link(spec.dictionary_occurrence, resolution)
            segment_evidence.append(
                SegmentEvidence(
                    start=spec.start,
                    end=spec.end,
                    slice_content=slice_content,
                    span=span,
                    slice_evidence=slice_evidence,
                    lexeme=lexeme,
                    resolution=resolution,
                    dictionary_occurrence=spec.dictionary_occurrence,
                    selection=selection,
                    form=spec.form,
                )
            )

        selection_sequence = self._fold(
            tuple(segment.selection for segment in segment_evidence)
        )
        form_sequence = self._fold(tuple(segment.form for segment in segment_evidence))
        grammar_membership = define_membership(self._builder, grammar, form_sequence)
        theory_membership = define_membership(self._builder, theory, form_sequence)

        return SourceFrontEndEvidence(
            raw_bytes=source.raw_bytes,
            content=source.content,
            source=source.source,
            dictionary=dictionary,
            grammar=grammar,
            theory=theory,
            segments=tuple(segment_evidence),
            selection_sequence=selection_sequence,
            form_sequence=form_sequence,
            grammar_membership=grammar_membership,
            theory_membership=theory_membership,
        )

    def _new_link(self, start: LinkRef, end: LinkRef) -> LinkRef:
        return self._builder.ensure(start, end)

    def _fold(self, values: tuple[LinkRef, ...]) -> LinkRef:
        current = self._root
        for value in values:
            current = self._new_link(current, value)
        return current


def replay_source_front_end(
    network: LinkNetwork,
    evidence: SourceFrontEndEvidence,
    byte_refs: Mapping[int, LinkRef],
) -> tuple[LinkRef, ...]:
    """Replay selected UTF-8/astring → scoped D/G/T evidence without effects.

    Returns resolved forms in source order. This function does not search for
    alternative segmentations and does not create any link.
    """

    if set(byte_refs) != set(range(256)):
        raise SourceReplayError("byte vocabulary must contain exactly 0..255")
    inverse_bytes = _inverse_byte_vocabulary(byte_refs)
    before = network.snapshot()

    source_link = network.link(evidence.source)
    if source_link.start is not evidence.source or source_link.end is not evidence.content:
        raise SourceReplayError("source occurrence does not match S = S ⟼ C")

    decoded, prefix_refs = _decode_content(
        network,
        evidence.content,
        network.root,
        inverse_bytes,
    )
    if decoded != evidence.raw_bytes:
        raise SourceReplayError("canonical source content does not match raw bytes")
    _validate_segment_evidence_spans(evidence.raw_bytes, evidence.segments)

    forms: list[LinkRef] = []
    selections: list[LinkRef] = []
    for segment in evidence.segments:
        expected_slice = evidence.raw_bytes[segment.start : segment.end]
        slice_bytes, _ = _decode_content(
            network,
            segment.slice_content,
            network.root,
            inverse_bytes,
        )
        if slice_bytes != expected_slice:
            raise SourceReplayError("slice content does not match selected byte boundaries")

        span = network.link(segment.span)
        if (
            span.start is not prefix_refs[segment.start]
            or span.end is not prefix_refs[segment.end]
        ):
            raise SourceReplayError("forged source span boundaries")

        slice_evidence = network.link(segment.slice_evidence)
        if (
            slice_evidence.start is not segment.span
            or slice_evidence.end is not segment.slice_content
        ):
            raise SourceReplayError("forged slice-content evidence")

        lexeme = network.link(segment.lexeme)
        if lexeme.start is not evidence.source or lexeme.end is not segment.slice_evidence:
            raise SourceReplayError("forged lexeme occurrence")

        resolution = network.link(segment.resolution)
        if resolution.start is not segment.lexeme or resolution.end is not segment.form:
            raise SourceReplayError("forged lexeme resolution")

        try:
            verify_visible_dictionary_occurrence(
                network,
                evidence.dictionary,
                segment.dictionary_occurrence,
                segment.slice_content,
                segment.form,
            )
        except DictionaryLookupError as exc:
            raise SourceReplayError("selected scoped dictionary evidence is invalid") from exc

        selection = network.link(segment.selection)
        if (
            selection.start is not segment.dictionary_occurrence
            or selection.end is not segment.resolution
        ):
            raise SourceReplayError("forged selected dictionary evidence")

        forms.append(segment.form)
        selections.append(segment.selection)

    _verify_fold(network, evidence.selection_sequence, tuple(selections), network.root)
    _verify_fold(network, evidence.form_sequence, tuple(forms), network.root)
    _verify_direct_membership(
        network,
        evidence.grammar_membership,
        evidence.grammar,
        evidence.form_sequence,
        "grammar",
    )
    _verify_direct_membership(
        network,
        evidence.theory_membership,
        evidence.theory,
        evidence.form_sequence,
        "theory",
    )

    if network.snapshot() != before:
        raise SourceReplayError("source replay mutated the network")
    return tuple(forms)


def replay_source_subselection(
    network: LinkNetwork,
    evidence: SourceFrontEndEvidence,
    byte_refs: Mapping[int, LinkRef],
    *,
    start_segment: int,
    end_segment: int,
    selection_sequence: LinkRef,
    form_sequence: LinkRef,
    grammar: LinkRef,
    theory: LinkRef,
    grammar_membership: LinkRef,
    theory_membership: LinkRef,
) -> tuple[LinkRef, ...]:
    """Replay one contiguous subselection of an already-replayed source.

    Segment indices are checker coordinates only. Semantic evidence remains the
    segment selection links, their R-seeded ordered fold, the selected form fold
    and explicit G/T memberships. Empty ranges use the distinguished root.
    """

    before = network.snapshot()
    forms = replay_source_front_end(network, evidence, byte_refs)
    if (
        start_segment < 0
        or end_segment < start_segment
        or end_segment > len(evidence.segments)
    ):
        raise SourceReplayError("invalid source subselection segment range")

    segments = evidence.segments[start_segment:end_segment]
    selected_forms = forms[start_segment:end_segment]
    _verify_fold(
        network,
        selection_sequence,
        tuple(segment.selection for segment in segments),
        network.root,
    )
    _verify_fold(network, form_sequence, selected_forms, network.root)
    _verify_direct_membership(
        network,
        grammar_membership,
        grammar,
        form_sequence,
        "subselection grammar",
    )
    _verify_direct_membership(
        network,
        theory_membership,
        theory,
        form_sequence,
        "subselection theory",
    )

    if network.snapshot() != before:
        raise SourceReplayError("source subselection replay mutated the network")
    return selected_forms


def _validate_spans(raw_bytes: bytes, specs: Sequence[SegmentSpec]) -> None:
    boundaries = tuple((spec.start, spec.end) for spec in specs)
    _validate_boundaries(raw_bytes, boundaries)


def _validate_segment_evidence_spans(
    raw_bytes: bytes,
    segments: Sequence[SegmentEvidence],
) -> None:
    boundaries = tuple((segment.start, segment.end) for segment in segments)
    _validate_boundaries(raw_bytes, boundaries)


def _validate_boundaries(raw_bytes: bytes, boundaries: Sequence[tuple[int, int]]) -> None:
    if not boundaries:
        if raw_bytes:
            raise SourceReplayError("non-empty source requires selected segments")
        return
    expected_start = 0
    for start, end in boundaries:
        if start != expected_start or end <= start or end > len(raw_bytes):
            raise SourceReplayError("segments must form one exact contiguous source partition")
        expected_start = end
    if expected_start != len(raw_bytes):
        raise SourceReplayError("selected segments do not cover the complete source")


def _inverse_byte_vocabulary(
    byte_refs: Mapping[int, LinkRef],
) -> dict[LinkRef, int]:
    inverse: dict[LinkRef, int] = {}
    for value, ref in byte_refs.items():
        if ref in inverse:
            raise SourceReplayError("byte vocabulary refs must be distinct")
        inverse[ref] = value
    return inverse


def _decode_content(
    network: LinkNetwork,
    content: LinkRef,
    root: LinkRef,
    inverse_bytes: Mapping[LinkRef, int],
) -> tuple[bytes, tuple[LinkRef, ...]]:
    if root is not network.root:
        raise SourceReplayError("source content root does not match network root")
    try:
        sequence = read_rooted_sequence(network, content)
    except LinkNetworkError as exc:
        raise SourceReplayError(
            "source content is not a finite R-rooted sequence"
        ) from exc

    decoded: list[int] = []
    for value_ref in sequence.values:
        try:
            decoded.append(inverse_bytes[value_ref])
        except KeyError as exc:
            raise SourceReplayError("source content contains a non-byte occurrence") from exc
    return bytes(decoded), sequence.prefixes


def _verify_direct_membership(
    network: LinkNetwork,
    membership_ref: LinkRef,
    container: LinkRef,
    value: LinkRef,
    label: str,
) -> None:
    membership = network.link(membership_ref)
    if membership.start is not container or membership.end is not value:
        raise SourceReplayError(f"forged {label} membership")


def _verify_fold(
    network: LinkNetwork,
    final: LinkRef,
    values: tuple[LinkRef, ...],
    root: LinkRef,
) -> None:
    current = final
    for expected in reversed(values):
        link = network.link(current)
        if link.end is not expected:
            raise SourceReplayError("ordered sequence evidence contains the wrong link")
        current = link.start
    if current is not root:
        raise SourceReplayError("ordered sequence evidence does not terminate at root")
