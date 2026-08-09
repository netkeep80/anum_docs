"""Foundation-v2 source front-end over exact-occurrence link networks.

The trusted operation in this module is *replay of selected evidence*.  Candidate
segmentation/token search is intentionally outside the trusted core.  A caller
supplies exact byte-protocol refs, an exact source occurrence, selected spans,
explicit dictionary memberships and explicit grammar/theory admission.

Host byte offsets and dataclasses are transport/checker machinery.  They are not
semantic identity.  The semantic evidence is represented by ordinary links.
No function here materializes the application relation described by source text.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence

from .exact_link_network import LinkNetwork, LinkNetworkBuilder, OccurrenceRef
from .foundation_v2_state import define_membership, define_source_occurrence


class SourceReplayError(ValueError):
    """Selected source evidence is incomplete, forged or inconsistent."""


@dataclass(frozen=True)
class SourceOccurrence:
    """Transport handle for one exact source occurrence and its canonical content."""

    raw_bytes: bytes
    content: OccurrenceRef
    source: OccurrenceRef


@dataclass(frozen=True)
class SegmentSpec:
    """Untrusted selected span plus already-existing semantic evidence refs."""

    start: int
    end: int
    form: OccurrenceRef
    dictionary_membership: OccurrenceRef


@dataclass(frozen=True)
class SegmentEvidence:
    """Exact link evidence for one selected source slice."""

    start: int
    end: int
    slice_content: OccurrenceRef
    span: OccurrenceRef
    slice_evidence: OccurrenceRef
    lexeme: OccurrenceRef
    resolution: OccurrenceRef
    dictionary_membership: OccurrenceRef
    selection: OccurrenceRef
    form: OccurrenceRef


@dataclass(frozen=True)
class SourceFrontEndEvidence:
    """Replayable selected segmentation/resolution for one exact source occurrence."""

    raw_bytes: bytes
    content: OccurrenceRef
    source: OccurrenceRef
    dictionary: OccurrenceRef
    grammar: OccurrenceRef
    theory: OccurrenceRef
    segments: tuple[SegmentEvidence, ...]
    selection_sequence: OccurrenceRef
    form_sequence: OccurrenceRef
    grammar_membership: OccurrenceRef
    theory_membership: OccurrenceRef


class SourceFrontEndBuilder:
    """Untrusted construction helper for canonical source/evidence fixtures.

    ``byte_refs`` are the exact occurrences selected by the lower canonical byte
    protocol.  This layer does not redefine the ``[bbbbbbbb]`` carrier; it folds
    those exact byte refs into canonical source-content histories.
    """

    def __init__(
        self,
        builder: LinkNetworkBuilder,
        root: OccurrenceRef,
        byte_refs: Mapping[int, OccurrenceRef],
    ) -> None:
        if set(byte_refs) != set(range(256)):
            raise SourceReplayError("byte vocabulary must contain exactly 0..255")
        self._builder = builder
        self._root = root
        self._byte_refs = dict(byte_refs)
        self._content_cache: dict[bytes, OccurrenceRef] = {b"": root}
        self._sources: dict[OccurrenceRef, SourceOccurrence] = {}

    def content_ref(self, data: bytes) -> OccurrenceRef:
        """Return one canonical R-seeded history ref for exact bytes in this builder."""

        data = bytes(data)
        if data in self._content_cache:
            return self._content_cache[data]

        for size in range(1, len(data) + 1):
            prefix = data[:size]
            if prefix in self._content_cache:
                continue
            previous = self._content_cache[prefix[:-1]]
            byte_ref = self._byte_refs[prefix[-1]]
            current = self._builder.reserve()
            self._builder.define(current, previous, byte_ref)
            self._content_cache[prefix] = current
        return self._content_cache[data]

    def source_occurrence(self, data: bytes) -> SourceOccurrence:
        """Create a fresh exact ``S = S ⟼ C`` occurrence over canonical content C."""

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
        dictionary: OccurrenceRef,
        grammar: OccurrenceRef,
        theory: OccurrenceRef,
    ) -> SourceFrontEndEvidence:
        """Build exact evidence for one caller-selected segmentation.

        The function does not choose spans, perform longest-match, parse glyphs or
        invent dictionary entries.  ``SegmentSpec.dictionary_membership`` must
        already identify the dictionary evidence that trusted replay will check.
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
            selection = self._new_link(spec.dictionary_membership, resolution)
            segment_evidence.append(
                SegmentEvidence(
                    start=spec.start,
                    end=spec.end,
                    slice_content=slice_content,
                    span=span,
                    slice_evidence=slice_evidence,
                    lexeme=lexeme,
                    resolution=resolution,
                    dictionary_membership=spec.dictionary_membership,
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

    def _new_link(self, start: OccurrenceRef, end: OccurrenceRef) -> OccurrenceRef:
        ref = self._builder.reserve()
        self._builder.define(ref, start, end)
        return ref

    def _fold(self, values: tuple[OccurrenceRef, ...]) -> OccurrenceRef:
        current = self._root
        for value in values:
            current = self._new_link(current, value)
        return current


def replay_source_front_end(
    network: LinkNetwork,
    evidence: SourceFrontEndEvidence,
    byte_refs: Mapping[int, OccurrenceRef],
) -> tuple[OccurrenceRef, ...]:
    """Replay selected UTF-8/astring → D/G/T evidence without effects.

    Returns the exact resolved forms in source order.  This function does not
    search for alternative segmentations and does not create any link.
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

    forms: list[OccurrenceRef] = []
    selections: list[OccurrenceRef] = []
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

        _verify_dictionary_membership(
            network,
            segment.dictionary_membership,
            evidence.dictionary,
            segment.slice_content,
            segment.form,
        )

        selection = network.link(segment.selection)
        if (
            selection.start is not segment.dictionary_membership
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
    byte_refs: Mapping[int, OccurrenceRef],
) -> dict[OccurrenceRef, int]:
    inverse: dict[OccurrenceRef, int] = {}
    for value, ref in byte_refs.items():
        if ref in inverse:
            raise SourceReplayError("byte vocabulary refs must be occurrence-distinct")
        inverse[ref] = value
    return inverse


def _decode_content(
    network: LinkNetwork,
    content: OccurrenceRef,
    root: OccurrenceRef,
    inverse_bytes: Mapping[OccurrenceRef, int],
) -> tuple[bytes, tuple[OccurrenceRef, ...]]:
    if content is root:
        return b"", (root,)

    reversed_bytes: list[int] = []
    reversed_prefix_refs: list[OccurrenceRef] = [content]
    current = content
    visited: set[OccurrenceRef] = set()

    while current is not root:
        if current in visited:
            raise SourceReplayError("cyclic canonical source-content history")
        visited.add(current)
        link = network.link(current)
        try:
            value = inverse_bytes[link.end]
        except KeyError as exc:
            raise SourceReplayError("source content contains a non-byte occurrence") from exc
        reversed_bytes.append(value)
        current = link.start
        reversed_prefix_refs.append(current)

    return (
        bytes(reversed(reversed_bytes)),
        tuple(reversed(reversed_prefix_refs)),
    )


def _verify_dictionary_membership(
    network: LinkNetwork,
    membership_ref: OccurrenceRef,
    dictionary: OccurrenceRef,
    slice_content: OccurrenceRef,
    form: OccurrenceRef,
) -> None:
    membership = network.link(membership_ref)
    if membership.start is not dictionary:
        raise SourceReplayError("dictionary membership belongs to another dictionary")
    entry = network.link(membership.end)
    if entry.start is not slice_content or entry.end is not form:
        raise SourceReplayError("dictionary entry does not resolve selected slice to selected form")


def _verify_direct_membership(
    network: LinkNetwork,
    membership_ref: OccurrenceRef,
    container: OccurrenceRef,
    value: OccurrenceRef,
    label: str,
) -> None:
    membership = network.link(membership_ref)
    if membership.start is not container or membership.end is not value:
        raise SourceReplayError(f"forged {label} membership")


def _verify_fold(
    network: LinkNetwork,
    final: OccurrenceRef,
    values: tuple[OccurrenceRef, ...],
    root: OccurrenceRef,
) -> None:
    current = final
    for expected in reversed(values):
        link = network.link(current)
        if link.end is not expected:
            raise SourceReplayError("ordered sequence evidence contains the wrong occurrence")
        current = link.start
    if current is not root:
        raise SourceReplayError("ordered sequence evidence does not terminate at exact root")
