"""Typed data model for the L3 Anum protocol v0.1."""

from dataclasses import dataclass
from enum import Enum


class Abit(str, Enum):
    """Four base abits of the quaternary anum protocol."""

    OPEN = "["
    CLOSE = "]"
    LINK = "1"
    UNLINK = "0"


class ProjectionContext(str, Enum):
    """Explicit context used when projecting one raw quaternary carrier."""

    ROOT = "root"
    QUOTE = "quote"
    RELATIVE = "relative"


class ProjectionKind(str, Enum):
    """Result category of one L3 projection step."""

    PROTOCOL_VALUE = "protocol-value"
    BOUNDARY_FORM = "boundary-form"
    QUOTED_RAW = "quoted-raw"
    RAW = "raw"


@dataclass(frozen=True)
class AnumSource:
    """Raw *.anum source in a declared non-quaternary mode."""

    text: str
    format: str


@dataclass(frozen=True)
class AnumToken:
    """One parsed quaternary abit and its absolute offset in the parsed stream."""

    abit: Abit
    offset: int


@dataclass(frozen=True)
class AnumForm:
    """A raw quaternary carrier as a sequence of abits."""

    tokens: tuple[AnumToken, ...]

    def values(self) -> tuple[str, ...]:
        return tuple(token.abit.value for token in self.tokens)


@dataclass(frozen=True)
class AnumValidation:
    """Context validation result kept separate from raw syntax parsing."""

    context: ProjectionContext
    is_valid: bool
    messages: tuple[str, ...] = ()


@dataclass(frozen=True)
class AnumProjection:
    """One explicit context projection of a raw carrier."""

    context: ProjectionContext
    source: str
    kind: ProjectionKind
    protocol_value: str | None = None
    arrow_form: str | None = None
    projected: AnumForm | None = None
    note: str = ""
