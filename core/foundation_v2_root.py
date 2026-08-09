"""Foundation-v2 production-facing exact root/bootstrap.

This module constructs the distinguished five-link root directly in the exact-
occurrence substrate. It deliberately does *not* parse the historical ten-
formula root program and does not use token, AST, ContextFrame, graph-isomorphism
or pair-interning identity.

The ontological/ostensive reading precedes this implementation carrier::

    ∞
    ♂∞  == O = O ⟼ R
    ∞♀  == C = R ⟼ C
    L   == O ⟼ C
    U   == C ⟼ O

``[ ] 1 0`` are the root Anum/bootstrap vocabulary mapped to already-distinguished
exact occurrences. The glyph mapping does not recognize or create semantic
roles; topology and the explicitly supplied refs exist first.
"""
from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Mapping

from .exact_link_network import (
    LinkNetwork,
    LinkNetworkBuilder,
    LinkNetworkError,
    OccurrenceRef,
)


class FoundationRootError(ValueError):
    """The supplied five exact refs do not form the Foundation-v2 root kernel."""


@dataclass(frozen=True)
class FoundationRootRefs:
    """Host handles for the five distinguished exact bootstrap occurrences.

    Field names are API handles, not semantic tags stored on links. The semantic
    structure is verified from the exact ordered poles in :class:`LinkNetwork`.
    """

    root: OccurrenceRef  # R = ∞
    opening: OccurrenceRef  # O = O ⟼ R  == ♂∞
    closing: OccurrenceRef  # C = R ⟼ C  == ∞♀
    linked: OccurrenceRef  # L = O ⟼ C
    unlinked: OccurrenceRef  # U = C ⟼ O

    def as_tuple(self) -> tuple[OccurrenceRef, ...]:
        return (self.root, self.opening, self.closing, self.linked, self.unlinked)


@dataclass(frozen=True)
class FoundationRootKernel:
    """One exact five-occurrence bootstrap network and its distinguished refs."""

    network: LinkNetwork
    refs: FoundationRootRefs


def build_root_kernel() -> FoundationRootKernel:
    """Construct one fresh exact ``R/O/C/L/U`` bootstrap network.

    Every call creates a fresh runtime identity scope. Equal topology from two
    calls therefore does not imply cross-network exact occurrence identity.
    """

    builder = LinkNetworkBuilder()
    root = builder.reserve()
    opening = builder.reserve()
    closing = builder.reserve()
    linked = builder.reserve()
    unlinked = builder.reserve()

    builder.define(root, root, root)
    builder.define(opening, opening, root)
    builder.define(closing, root, closing)
    builder.define(linked, opening, closing)
    builder.define(unlinked, closing, opening)

    kernel = FoundationRootKernel(
        network=builder.freeze(root),
        refs=FoundationRootRefs(
            root=root,
            opening=opening,
            closing=closing,
            linked=linked,
            unlinked=unlinked,
        ),
    )
    validate_root_kernel(kernel)
    return kernel


def validate_root_kernel(kernel: FoundationRootKernel) -> None:
    """Validate supplied exact refs without shape-searching for a root.

    Validation starts from explicitly distinguished refs. It does not scan a
    graph for "something self-closed" and call that root, does not infer identity
    by isomorphism, and does not depend on runtime slot/allocation order.
    """

    if not isinstance(kernel, FoundationRootKernel):
        raise FoundationRootError("expected FoundationRootKernel")

    network = kernel.network
    refs = kernel.refs
    if len(set(refs.as_tuple())) != 5:
        raise FoundationRootError("root bootstrap refs must be five distinct occurrences")
    if len(network.refs) != 5:
        raise FoundationRootError("root bootstrap network must contain exactly five occurrences")
    if network.root is not refs.root:
        raise FoundationRootError("distinguished network root is not exact R")

    expected = (
        (refs.root, refs.root, refs.root),
        (refs.opening, refs.opening, refs.root),
        (refs.closing, refs.root, refs.closing),
        (refs.linked, refs.opening, refs.closing),
        (refs.unlinked, refs.closing, refs.opening),
    )
    try:
        for ref, start, end in expected:
            actual = network.link(ref)
            if actual.start is not start or actual.end is not end:
                raise FoundationRootError(
                    "exact root/bootstrap topology does not match R/O/C/L/U"
                )
    except LinkNetworkError as exc:
        raise FoundationRootError(
            "root/bootstrap contains a foreign or invalid exact ref"
        ) from exc


def root_vocabulary(kernel: FoundationRootKernel) -> Mapping[str, OccurrenceRef]:
    """Return explicit root protocol vocabulary over already-built exact refs.

    The returned glyphs are transport/source vocabulary. They are not consulted
    by :func:`validate_root_kernel`, so spelling cannot manufacture R/O/C/L/U.
    """

    validate_root_kernel(kernel)
    refs = kernel.refs
    return MappingProxyType(
        {
            "∞": refs.root,
            "[": refs.opening,
            "]": refs.closing,
            "1": refs.linked,
            "0": refs.unlinked,
        }
    )


def root_role_refs(kernel: FoundationRootKernel) -> Mapping[str, OccurrenceRef]:
    """Expose conventional R/O/C/L/U labels as non-semantic API/debug handles."""

    validate_root_kernel(kernel)
    refs = kernel.refs
    return MappingProxyType(
        {
            "R": refs.root,
            "O": refs.opening,
            "C": refs.closing,
            "L": refs.linked,
            "U": refs.unlinked,
        }
    )
