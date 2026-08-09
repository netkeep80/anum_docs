"""Foundation-v2 bracket-only relative Anum reading over exact occurrences.

The relative context is an already-existing exact ``K``.  Its current value is
the initial focus.  After that selection, every ``[`` step follows the start
pole of the current exact occurrence and every ``]`` step follows the end pole.
Context ancestry is deliberately not part of path traversal.

This is one explicit relative reading mode of a canonical bracket carrier, not
an intrinsic opcode meaning of the root abits.  Root and quote readings are not
implemented or changed here.  ``0`` and ``1`` remain undefined in this first
relative subset and therefore fail closed.
"""
from __future__ import annotations

from .exact_link_network import LinkNetwork, LinkNetworkError, OccurrenceRef
from .foundation_v2_state import FoundationStateError, current_of_context


class RelativeAnumError(ValueError):
    """The selected relative context or bracket path is invalid."""


def replay_relative_bracket_path(
    network: LinkNetwork,
    context: OccurrenceRef,
    carrier: str,
) -> OccurrenceRef:
    """Read one finite bracket path relative to exact ``current(K)``.

    ``""`` selects the exact focus itself.  ``[`` and ``]`` then traverse one
    existing start/end pole per character.  No link is searched by shape,
    created, deleted or interned.  A cyclic carrier remains finite because the
    number of traversal steps is exactly the finite carrier length.
    """

    if not isinstance(carrier, str):
        raise RelativeAnumError("relative bracket carrier must be text")

    before = network.snapshot()
    try:
        cursor = current_of_context(network, context)
        for position, abit in enumerate(carrier):
            if abit not in "[]":
                raise RelativeAnumError(
                    "relative bracket subset accepts only '[' and ']' "
                    f"(invalid character at position {position})"
                )
            link = network.link(cursor)
            cursor = link.start if abit == "[" else link.end
        return cursor
    except (FoundationStateError, LinkNetworkError) as exc:
        raise RelativeAnumError("invalid exact relative context or path") from exc
    finally:
        if network.snapshot() != before:
            raise RelativeAnumError("relative path replay mutated the network")
