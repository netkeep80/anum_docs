"""Raw parsing and deterministic serialization for ``*.anum``.

This L3 module deliberately does not decide denotation. Raw syntax, contextual
validation and projection are separate stages. The strict quaternary layer does
not apply ordinary bracket-balance rules: ``][``, ``[[`` and ``]]`` are valid
raw carriers.
"""

from core.anum_model import Abit, AnumForm, AnumSource, AnumToken


ANUM_FORMAT_HEADER = "# anum-format:"
FORMAT_QUATERNARY = "quaternary"
FORMAT_STRING = "string"
SUPPORTED_FORMATS = (FORMAT_QUATERNARY, FORMAT_STRING)

_ABIT_BY_SYMBOL = {abit.value: abit for abit in Abit}


class IncrementalQuaternaryDecoder:
    """Stateful raw decoder whose result is equivalent to batch parsing.

    Completion of higher-level anum forms is context-dependent and is therefore
    not invented here. ``feed`` emits newly recognized abits and ``finish``
    returns the complete raw carrier accumulated so far.
    """

    def __init__(self):
        self._offset = 0
        self._in_comment = False
        self._tokens: list[AnumToken] = []

    @property
    def offset(self) -> int:
        return self._offset

    def feed(self, chunk: str) -> tuple[AnumToken, ...]:
        emitted: list[AnumToken] = []

        for index, char in enumerate(chunk):
            absolute_offset = self._offset + index

            if self._in_comment:
                if char in "\r\n":
                    self._in_comment = False
                continue

            if char == "#":
                self._in_comment = True
                continue

            if char.isspace():
                continue

            abit = _ABIT_BY_SYMBOL.get(char)
            if abit is None:
                raise ValueError(
                    "Недопустимый символ в quaternary anum в позиции "
                    f'{absolute_offset}: "{char}"'
                )

            token = AnumToken(abit=abit, offset=absolute_offset)
            self._tokens.append(token)
            emitted.append(token)

        self._offset += len(chunk)
        return tuple(emitted)

    def finish(self) -> AnumForm:
        return AnumForm(tokens=tuple(self._tokens))


def parse_raw_quaternary(text: str) -> AnumForm:
    """Parse strict raw quaternary text into abits without semantic validation."""

    decoder = IncrementalQuaternaryDecoder()
    decoder.feed(text)
    return decoder.finish()


def parse_anum_file(text: str) -> AnumForm | AnumSource:
    """Parse a complete ``*.anum`` container.

    Without an explicit header the file is raw quaternary. String mode keeps
    symbolic names as a separate source for explicit dictionary compilation.
    """

    format_name, body = _split_format_header(text)

    if format_name == FORMAT_QUATERNARY:
        return parse_raw_quaternary(body)
    if format_name == FORMAT_STRING:
        return AnumSource(text=body.strip(), format=FORMAT_STRING)

    raise ValueError(f'Неизвестный формат anum: "{format_name}"')


def normalize_raw_form(form: AnumForm) -> str:
    """Return the compact quaternary representation of one raw carrier."""

    return "".join(form.values())


def serialize_quaternary_anum(
    form: AnumForm,
    *,
    include_header: bool = False,
) -> str:
    """Serialize a raw carrier deterministically."""

    body = normalize_raw_form(form)
    if not include_header:
        return body
    return f"# anum-format: quaternary\n{body}\n"


def _split_format_header(text: str) -> tuple[str, str]:
    offset = 0
    for line in text.splitlines(keepends=True):
        stripped = line.strip()
        next_offset = offset + len(line)

        if not stripped:
            offset = next_offset
            continue

        if stripped.startswith("#"):
            if stripped.startswith(ANUM_FORMAT_HEADER):
                format_name = stripped[len(ANUM_FORMAT_HEADER):].strip()
                return format_name, text[next_offset:]
            offset = next_offset
            continue

        break

    return FORMAT_QUATERNARY, text
