"""Typed transport model for current ``*.anum`` sources.

The model deliberately contains no denotation or projection semantics. L3 stream
meaning is defined only by ``core.anum_protocol`` / ``anum-stream-deserialization/v0.3``.
"""

from dataclasses import dataclass
from enum import Enum


class Abit(str, Enum):
    """The four transmitted abits. Root is not an abit."""

    OPEN = "["
    CLOSE = "]"
    LINK = "1"
    UNLINK = "0"


@dataclass(frozen=True)
class AnumSource:
    """Raw *.anum source in a declared non-quaternary mode."""

    text: str
    format: str


@dataclass(frozen=True)
class AnumToken:
    """One parsed quaternary abit and its absolute source offset."""

    abit: Abit
    offset: int


@dataclass(frozen=True)
class AnumForm:
    """A raw quaternary stream as a sequence of four-valued transport abits."""

    tokens: tuple[AnumToken, ...]

    def values(self) -> tuple[str, ...]:
        return tuple(token.abit.value for token in self.tokens)
