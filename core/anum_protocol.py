"""Current pure L3 Anum stream deserialization.

Implements accepted ``anum-stream-deserialization/v0.3`` directly. The input is
a raw/channel sequence over exactly four abits ``[ ] 1 0``. Root ``R`` is an
implicit context basis, not a fifth transmitted value. This module performs no
L4 lookup, materialization or deletion and does not implement historical v0.2
boundary projection, quote or relative-context semantics.
"""

from dataclasses import dataclass

from core.anum_model import Abit, AnumForm, AnumSource
from core.anum_parser import FORMAT_STRING, normalize_raw_form, parse_raw_quaternary


ROOT = "R"
OPENING = "O"
CLOSING = "C"
LINKED = "L"
UNLINKED = "U"

_TRANSPORT_VALUE = {
    Abit.LINK: LINKED,
    Abit.UNLINK: UNLINKED,
}
_ROOT_PAIRS = {
    (ROOT, ROOT): ROOT,
    (OPENING, ROOT): OPENING,
    (ROOT, CLOSING): CLOSING,
    (OPENING, CLOSING): LINKED,
    (CLOSING, OPENING): UNLINKED,
}


class StreamError(ValueError):
    """Deterministic current-stream rejection with a contract error code."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class StreamDenotation:
    """Effect-free result of one complete stream deserialization."""

    denotation: str
    resolved_values: tuple[str, ...]
    operations: tuple[str, ...]


@dataclass(frozen=True)
class StreamValidation:
    """Validation result obtained by running the current stack boundary."""

    is_valid: bool
    error: str | None = None


@dataclass
class _Frame:
    started: bool = False
    current: str = ROOT


def semantic_link(start: str, end: str) -> str:
    """Return the canonical semantic link expression for one ordered pole pair.

    The five root-basis links are reused rather than copied. Other complete
    ordered pairs have one deterministic structural expression. This function
    is pure and does not assert that any physical memory record exists.
    """

    return _ROOT_PAIRS.get((start, end), f"({start}⟼{end})")


def _append(frame: _Frame, value: str) -> None:
    if not frame.started:
        frame.current = value
        frame.started = True
    else:
        frame.current = semantic_link(frame.current, value)


def deserialize_stream(source: str) -> StreamDenotation:
    """Deserialize one compact raw/channel stream using the accepted stack machine."""

    frames = [_Frame()]
    operations: list[str] = []
    resolved: list[str] = []

    for token in source:
        if token == Abit.OPEN.value:
            frames.append(_Frame())
            operations.append("OPEN")
            continue

        if token == Abit.CLOSE.value:
            if len(frames) == 1:
                raise StreamError("unexpected-close")
            inner = frames.pop()
            returned = ROOT if not inner.started else semantic_link(ROOT, inner.current)
            _append(frames[-1], returned)
            operations.append("CLOSE")
            continue

        if token in (Abit.LINK.value, Abit.UNLINK.value):
            abit = Abit(token)
            value = _TRANSPORT_VALUE[abit]
            resolved.append(value)
            _append(frames[-1], value)
            operations.append("VALUE")
            continue

        raise StreamError("non-abit")

    if len(frames) != 1:
        raise StreamError("unclosed-open")

    root_frame = frames[0]
    result = root_frame.current if root_frame.started else ROOT
    return StreamDenotation(
        denotation=result,
        resolved_values=tuple(resolved),
        operations=tuple(operations),
    )


def deserialize_anum(form: AnumForm) -> StreamDenotation:
    """Deserialize a parsed quaternary form without reinterpreting source offsets."""

    return deserialize_stream(normalize_raw_form(form))


def validate_anum(form: AnumForm) -> StreamValidation:
    """Validate the current stack boundary without producing an L4 effect."""

    try:
        deserialize_anum(form)
    except StreamError as exc:
        return StreamValidation(is_valid=False, error=exc.code)
    return StreamValidation(is_valid=True)


class AnumDictionary:
    """Explicit symbolic-name to raw quaternary transport dictionary.

    Names are not abits and gain no semantics by themselves. Compilation only
    produces a raw quaternary stream; current denotation remains a separate
    explicit ``deserialize_anum`` operation.
    """

    def __init__(self):
        self._entries: dict[str, AnumForm] = {}

    def register(self, name: str, form: AnumForm) -> None:
        if not name or any(char.isspace() for char in name):
            raise ValueError("Имя словаря anum должно быть непустым и без пробелов")
        if name in self._entries:
            raise ValueError(f"Имя anum уже определено в словаре: {name}")
        self._entries[name] = form

    def resolve(self, name: str) -> AnumForm:
        try:
            return self._entries[name]
        except KeyError as exc:
            raise KeyError(f"Неизвестное имя anum: {name}") from exc

    def compile(self, source: AnumSource) -> AnumForm:
        if source.format != FORMAT_STRING:
            raise ValueError("AnumDictionary.compile ожидает string anum source")

        names = source.text.split()
        raw = "".join(normalize_raw_form(self.resolve(name)) for name in names)
        return parse_raw_quaternary(raw)
