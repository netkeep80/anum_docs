"""Foundation-v2 root/bootstrap over rooted ostensive MTS identity.

The five-link kernel is constructed from the four semantic forms rather than
from arbitrary runtime identities:

    R = R ⟼ R      # ∞
    O = O ⟼ R      # ♂∞
    C = R ⟼ C      # ∞♀
    L = O ⟼ C
    U = C ⟼ O

The root is the unique fully self-closed link. O and C are distinguished by the
orientation of one-sided self-closure relative to already-distinguished R. L and
U are then distinguished by the ordered pair of already-distinguished O/C.

``[ ] 1 0`` are transport/root-vocabulary glyphs mapped only after this semantic
kernel exists. Runtime handles are access coordinates, not semantic identity.
"""
from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Mapping

from .rooted_link_network import (
    LinkNetwork,
    LinkNetworkBuilder,
    LinkNetworkError,
    LinkRef,
)


class FoundationRootError(ValueError):
    """The supplied refs do not form the rooted five-link MTS kernel."""


@dataclass(frozen=True)
class FoundationRootRefs:
    """Technical access handles for the five structurally distinguished links."""

    root: LinkRef
    opening: LinkRef
    closing: LinkRef
    linked: LinkRef
    unlinked: LinkRef

    def as_tuple(self) -> tuple[LinkRef, ...]:
        return (self.root, self.opening, self.closing, self.linked, self.unlinked)


@dataclass(frozen=True)
class FoundationRootKernel:
    network: LinkNetwork
    refs: FoundationRootRefs


def build_root_kernel() -> FoundationRootKernel:
    """Construct the canonical ``R/O/C/L/U`` kernel from ostensive forms."""

    builder = LinkNetworkBuilder()
    root = builder.ensure_root()
    opening = builder.ensure_start_self_closed(root)
    closing = builder.ensure_end_self_closed(root)
    linked = builder.ensure(opening, closing)
    unlinked = builder.ensure(closing, opening)

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
    """Validate the exact rooted genealogy without relying on slot order."""

    if not isinstance(kernel, FoundationRootKernel):
        raise FoundationRootError("expected FoundationRootKernel")

    network = kernel.network
    refs = kernel.refs
    if len(set(refs.as_tuple())) != 5:
        raise FoundationRootError("root bootstrap must contain five distinct links")
    if len(network.refs) != 5:
        raise FoundationRootError("root bootstrap network must contain exactly five links")
    if network.root is not refs.root:
        raise FoundationRootError("distinguished network root is not R")

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
                    "root/bootstrap topology does not match R/O/C/L/U"
                )
    except LinkNetworkError as exc:
        raise FoundationRootError("root/bootstrap contains an invalid handle") from exc

    fully_self_closed = [
        ref
        for ref in network.refs
        if network.link(ref).start is ref and network.link(ref).end is ref
    ]
    if fully_self_closed != [refs.root]:
        raise FoundationRootError("R must be the unique fully self-closed link")

    if network.find(refs.root, refs.root) is not refs.root:
        raise FoundationRootError("R⟼R must resolve to R")
    if network.find(refs.opening, refs.root) is not refs.opening:
        raise FoundationRootError("O⟼R must resolve to O")
    if network.find(refs.root, refs.closing) is not refs.closing:
        raise FoundationRootError("R⟼C must resolve to C")
    if network.find(refs.opening, refs.closing) is not refs.linked:
        raise FoundationRootError("O⟼C must resolve to L")
    if network.find(refs.closing, refs.opening) is not refs.unlinked:
        raise FoundationRootError("C⟼O must resolve to U")


def root_vocabulary(kernel: FoundationRootKernel) -> Mapping[str, LinkRef]:
    """Return root protocol vocabulary over already-distinguished links."""

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


def root_role_refs(kernel: FoundationRootKernel) -> Mapping[str, LinkRef]:
    """Expose conventional R/O/C/L/U names as technical API/debug handles."""

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
