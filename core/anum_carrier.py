"""Read-only rooted-link carrier input for ANUM issue #333.

This module does not change the accepted raw/channel
``anum-stream-deserialization/v0.3`` surface.  It proves a second input path:
an already-existing R-rooted link sequence is unfolded to the four transmitted
abits and then delegated to the existing ``deserialize_stream`` stack machine.
No second OPEN/CLOSE/VALUE semantics and no materialization are introduced.
"""
from __future__ import annotations

from dataclasses import dataclass

from core.anum_model import Abit
from core.anum_protocol import StreamDenotation, deserialize_stream
from core.rooted_link_network import (
    LinkNetwork,
    LinkNetworkError,
    LinkRef,
    read_rooted_sequence,
)


class CarrierInputError(ValueError):
    """The selected link/vocabulary is not a readable quaternary carrier."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class AnumCarrierVocabulary:
    """Technical handles for the four already-distinguished root abits."""

    opening: LinkRef
    closing: LinkRef
    linked: LinkRef
    unlinked: LinkRef

    def as_tuple(self) -> tuple[LinkRef, ...]:
        return (self.opening, self.closing, self.linked, self.unlinked)


def _validate_vocabulary(
    network: LinkNetwork,
    vocabulary: AnumCarrierVocabulary,
) -> None:
    if not isinstance(vocabulary, AnumCarrierVocabulary):
        raise CarrierInputError("invalid-vocabulary")

    root = network.root
    if len(set((root, *vocabulary.as_tuple()))) != 5:
        raise CarrierInputError("invalid-vocabulary")

    expected = (
        (vocabulary.opening, vocabulary.opening, root),
        (vocabulary.closing, root, vocabulary.closing),
        (vocabulary.linked, vocabulary.opening, vocabulary.closing),
        (vocabulary.unlinked, vocabulary.closing, vocabulary.opening),
    )
    try:
        for ref, start, end in expected:
            link = network.link(ref)
            if link.start is not start or link.end is not end:
                raise CarrierInputError("invalid-vocabulary")
    except LinkNetworkError as exc:
        raise CarrierInputError("invalid-vocabulary") from exc


def decode_carrier_stream(
    network: LinkNetwork,
    carrier: LinkRef,
    vocabulary: AnumCarrierVocabulary,
) -> str:
    """Recover the canonical quaternary source sequence from an existing link.

    The *carrier role* is explicit: the selected link is read through its start
    history.  It is not automatically treated as one abit merely because the
    same semantic Link can also occur as a vocabulary value in another context.
    """

    _validate_vocabulary(network, vocabulary)
    try:
        sequence = read_rooted_sequence(network, carrier)
    except LinkNetworkError as exc:
        raise CarrierInputError("not-rooted-sequence") from exc

    inverse = {
        vocabulary.opening: Abit.OPEN.value,
        vocabulary.closing: Abit.CLOSE.value,
        vocabulary.linked: Abit.LINK.value,
        vocabulary.unlinked: Abit.UNLINK.value,
    }
    source: list[str] = []
    for value_ref in sequence.values:
        try:
            source.append(inverse[value_ref])
        except KeyError as exc:
            raise CarrierInputError("non-abit") from exc
    return "".join(source)


def deserialize_carrier(
    network: LinkNetwork,
    carrier: LinkRef,
    vocabulary: AnumCarrierVocabulary,
) -> StreamDenotation:
    """Deserialize an existing carrier through the accepted raw stack machine."""

    return deserialize_stream(decode_carrier_stream(network, carrier, vocabulary))
