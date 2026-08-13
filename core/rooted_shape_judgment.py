"""Read-only rooted shape judgments for canonical MTS links.

The functions in this module inspect an already validated ``LinkNetwork``. They
never call a builder or materialize a missing pair. Runtime handles are used only
as access coordinates after the network has established rooted canonical
identity; forged and foreign handles are rejected by ``LinkNetwork.link``.
"""
from __future__ import annotations

from .rooted_link_network import LinkNetwork, LinkRef


def shape(
    network: LinkNetwork,
    ref: LinkRef,
    start: LinkRef,
    end: LinkRef,
) -> bool:
    """Return whether ``ref`` has exactly the expected ordered poles.

    This is the executable form of ``Shape(X; A, B)``. The three handles must
    belong to the same already validated canonical network. Calling the judgment
    cannot create ``A ⟼ B`` when that pair is absent.
    """

    link = network.link(ref)
    network.link(start)
    network.link(end)
    return link.start is start and link.end is end


def start_self(network: LinkNetwork, ref: LinkRef, end: LinkRef) -> bool:
    """Return ``StartSelf(X; e)``: ``start(X)=X`` and ``end(X)=e``."""

    return shape(network, ref, ref, end)


def end_self(network: LinkNetwork, ref: LinkRef, start: LinkRef) -> bool:
    """Return ``EndSelf(X; b)``: ``start(X)=b`` and ``end(X)=X``."""

    return shape(network, ref, start, ref)


def full_self(network: LinkNetwork, ref: LinkRef) -> bool:
    """Return ``FullSelf(X)``: both poles of ``X`` are ``X`` itself.

    A valid ``LinkNetwork`` guarantees that this can hold only for its root.
    """

    return shape(network, ref, ref, ref)
