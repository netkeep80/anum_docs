"""Rooted read-only direct-deixis skeleton for the Foundation-v2 candidate.

The accepted historical direct-deixis operation observes only an ordered
structural path plus explicit ``(up, pole)`` pronoun payload. Operator names,
source offsets and runtime handles are not part of that result. This module
therefore challenges the historical typed-AST authority with a smaller rooted
carrier:

* ``NODE`` carries an R-rooted ordered sequence of child skeleton links;
* ``OPAQUE`` is the single non-deictic leaf value;
* ``PRONOUN`` carries an R-rooted sequence of zero or more UP markers followed
  by exactly one START/END pole marker.

All objects are ordinary canonical links in :mod:`rooted_link_network`. A path
is only a checker coordinate induced by an ordered child occurrence. Reusing
one semantic subtree in two child positions therefore yields two paths without
creating a second semantic link. Query/replay is read-only and never performs
``ensure`` or any other materialization operation.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable

from .rooted_link_network import (
    LinkNetwork,
    LinkNetworkBuilder,
    LinkNetworkError,
    LinkNetworkEvolutionBuilder,
    LinkRef,
    RootedSequence,
    read_rooted_sequence,
)


class DirectDeixisReplayError(ValueError):
    """Malformed or non-rooted direct-deixis skeleton evidence."""


class DeicticPole(str, Enum):
    START = "◁"
    END = "▷"


@dataclass(frozen=True, order=True)
class DeicticOccurrence:
    """One explicit pronoun occurrence; ``path`` is a checker coordinate only."""

    path: tuple[int, ...]
    up: int
    pole: DeicticPole


@dataclass(frozen=True)
class DirectDeixisVocabulary:
    """Canonical rooted role links for the minimal deictic skeleton."""

    node_tag: LinkRef
    opaque_tag: LinkRef
    pronoun_tag: LinkRef
    up_step: LinkRef
    start_pole: LinkRef
    end_pole: LinkRef


Builder = LinkNetworkBuilder | LinkNetworkEvolutionBuilder


def build_direct_deixis_vocabulary(builder: Builder) -> DirectDeixisVocabulary:
    """Construct/reuse one rooted role vocabulary without technical-ID semantics."""

    root = builder.ensure_root()
    start_pole = builder.ensure_start_self_closed(root)
    end_pole = builder.ensure_end_self_closed(root)
    node_tag = builder.ensure(start_pole, end_pole)
    opaque_tag = builder.ensure(end_pole, start_pole)
    pronoun_tag = builder.ensure(node_tag, opaque_tag)
    up_step = builder.ensure(opaque_tag, node_tag)
    return DirectDeixisVocabulary(
        node_tag=node_tag,
        opaque_tag=opaque_tag,
        pronoun_tag=pronoun_tag,
        up_step=up_step,
        start_pole=start_pole,
        end_pole=end_pole,
    )


class DirectDeixisSkeletonBuilder:
    """Untrusted construction helper for challenge fixtures and future producers."""

    def __init__(self, builder: Builder, vocabulary: DirectDeixisVocabulary) -> None:
        self._builder = builder
        self._vocabulary = vocabulary
        self._root = builder.ensure_root()

    def opaque(self) -> LinkRef:
        """Return the shared semantic leaf for any non-deictic opaque form."""

        return self._builder.ensure(self._vocabulary.opaque_tag, self._root)

    def node(self, children: Iterable[LinkRef]) -> LinkRef:
        """Return one structural node over an ordered R-rooted child sequence."""

        child_sequence = self._fold(tuple(children))
        return self._builder.ensure(self._vocabulary.node_tag, child_sequence)

    def pronoun(self, up: int, pole: DeicticPole) -> LinkRef:
        """Return one canonical PRONOUN node for ``up`` and START/END pole."""

        if isinstance(up, bool) or not isinstance(up, int) or up < 0:
            raise DirectDeixisReplayError("pronoun up-count must be a non-negative integer")
        if not isinstance(pole, DeicticPole):
            raise DirectDeixisReplayError("pronoun pole must be DeicticPole.START or END")

        pole_ref = (
            self._vocabulary.start_pole
            if pole is DeicticPole.START
            else self._vocabulary.end_pole
        )
        metadata = self._fold((self._vocabulary.up_step,) * up + (pole_ref,))
        return self._builder.ensure(self._vocabulary.pronoun_tag, metadata)

    def _fold(self, values: tuple[LinkRef, ...]) -> LinkRef:
        current = self._root
        for value in values:
            current = self._builder.ensure(current, value)
        return current


def analyze_direct_deixis_carrier(
    network: LinkNetwork,
    carrier: LinkRef,
    vocabulary: DirectDeixisVocabulary,
) -> tuple[DeicticOccurrence, ...]:
    """Replay direct-deixis over one already-existing rooted skeleton carrier."""

    _validate_vocabulary(network, vocabulary)
    before = network.snapshot()
    occurrences: list[DeicticOccurrence] = []
    try:
        _visit(network, carrier, vocabulary, (), set(), occurrences)
    finally:
        if network.snapshot() != before:
            raise DirectDeixisReplayError("direct-deixis query mutated the network")
    return tuple(occurrences)


def _visit(
    network: LinkNetwork,
    carrier: LinkRef,
    vocabulary: DirectDeixisVocabulary,
    path: tuple[int, ...],
    active: set[LinkRef],
    occurrences: list[DeicticOccurrence],
) -> None:
    if carrier in active:
        raise DirectDeixisReplayError("direct-deixis skeleton contains a traversal cycle")

    active.add(carrier)
    try:
        link = network.link(carrier)
        if link.start is vocabulary.opaque_tag:
            if link.end is not network.root:
                raise DirectDeixisReplayError("malformed OPAQUE skeleton leaf")
            return

        if link.start is vocabulary.pronoun_tag:
            up, pole = _decode_pronoun(network, link.end, vocabulary)
            occurrences.append(DeicticOccurrence(path=path, up=up, pole=pole))
            return

        if link.start is vocabulary.node_tag:
            children = _read_sequence(network, link.end, "NODE children")
            for index, child in enumerate(children.values):
                _visit(
                    network,
                    child,
                    vocabulary,
                    path + (index,),
                    active,
                    occurrences,
                )
            return

        raise DirectDeixisReplayError("link is not a direct-deixis skeleton node")
    except LinkNetworkError as exc:
        raise DirectDeixisReplayError("invalid direct-deixis skeleton link") from exc
    finally:
        active.remove(carrier)


def _decode_pronoun(
    network: LinkNetwork,
    metadata: LinkRef,
    vocabulary: DirectDeixisVocabulary,
) -> tuple[int, DeicticPole]:
    sequence = _read_sequence(network, metadata, "PRONOUN metadata")
    if not sequence.values:
        raise DirectDeixisReplayError("PRONOUN metadata must end in one pole marker")

    pole_ref = sequence.values[-1]
    if pole_ref is vocabulary.start_pole:
        pole = DeicticPole.START
    elif pole_ref is vocabulary.end_pole:
        pole = DeicticPole.END
    else:
        raise DirectDeixisReplayError("PRONOUN metadata has an invalid pole marker")

    prefix = sequence.values[:-1]
    if any(value is not vocabulary.up_step for value in prefix):
        raise DirectDeixisReplayError("PRONOUN metadata contains a non-UP prefix value")
    return len(prefix), pole


def _read_sequence(network: LinkNetwork, final: LinkRef, label: str) -> RootedSequence:
    try:
        return read_rooted_sequence(network, final)
    except LinkNetworkError as exc:
        raise DirectDeixisReplayError(f"{label} is not a finite R-rooted sequence") from exc


def _validate_vocabulary(
    network: LinkNetwork,
    vocabulary: DirectDeixisVocabulary,
) -> None:
    refs = (
        vocabulary.node_tag,
        vocabulary.opaque_tag,
        vocabulary.pronoun_tag,
        vocabulary.up_step,
        vocabulary.start_pole,
        vocabulary.end_pole,
    )
    if len(set(refs)) != len(refs):
        raise DirectDeixisReplayError("direct-deixis vocabulary links must be distinct")

    root = network.root
    expected = (
        (vocabulary.start_pole, vocabulary.start_pole, root),
        (vocabulary.end_pole, root, vocabulary.end_pole),
        (vocabulary.node_tag, vocabulary.start_pole, vocabulary.end_pole),
        (vocabulary.opaque_tag, vocabulary.end_pole, vocabulary.start_pole),
        (vocabulary.pronoun_tag, vocabulary.node_tag, vocabulary.opaque_tag),
        (vocabulary.up_step, vocabulary.opaque_tag, vocabulary.node_tag),
    )
    try:
        for ref, start, end in expected:
            link = network.link(ref)
            if link.start is not start or link.end is not end:
                raise DirectDeixisReplayError("invalid rooted direct-deixis vocabulary")
    except LinkNetworkError as exc:
        raise DirectDeixisReplayError("invalid rooted direct-deixis vocabulary") from exc
