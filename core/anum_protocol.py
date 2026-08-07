"""Contextual L3 Anum protocol v0.1.

The protocol keeps raw syntax, validation and projection separate. The current
``[] -> 0`` / ``][ -> 1`` root projection remains the experimental issue #61
projection; this module makes the context and unresolved boundary forms explicit
rather than silently normalizing them.
"""

from core.anum_model import (
    Abit,
    AnumForm,
    AnumProjection,
    AnumSource,
    AnumValidation,
    ProjectionContext,
    ProjectionKind,
)
from core.anum_parser import FORMAT_STRING, normalize_raw_form, parse_raw_quaternary


ALPHA = "α"
BETA = "β"

_BOUNDARY_PROJECTIONS = {
    (Abit.OPEN, Abit.OPEN): (
        f"{ALPHA} ⟼ {ALPHA}",
        None,
        "open-open boundary form; no root protocol value is assigned in v0.1",
    ),
    (Abit.OPEN, Abit.CLOSE): (
        f"{ALPHA} ⟼ {BETA}",
        "0",
        "experimental root container / non-materializing projection",
    ),
    (Abit.CLOSE, Abit.OPEN): (
        f"{BETA} ⟼ {ALPHA}",
        "1",
        "experimental root bridge / materializing-transition projection",
    ),
    (Abit.CLOSE, Abit.CLOSE): (
        f"{BETA} ⟼ {BETA}",
        None,
        "close-close boundary form; no root protocol value is assigned in v0.1",
    ),
}


class AnumDictionary:
    """Explicit string-name to quaternary-carrier dictionary.

    Names are not abits and are never encoded through UTF-8 implicitly. String
    mode becomes quaternary only through this registry.
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


def validate_anum(
    form: AnumForm,
    context: ProjectionContext,
) -> AnumValidation:
    """Validate a parsed raw carrier for one explicit context.

    V0.1 intentionally adds no hidden root-start or bracket-balance restrictions:
    every sequence already accepted by the raw quaternary parser is a valid raw
    carrier. Context-specific semantic restrictions can be added only after they
    are accepted by the protocol specification.
    """

    if not isinstance(context, ProjectionContext):
        raise TypeError("context должен быть ProjectionContext")
    return AnumValidation(context=context, is_valid=True)


def project_anum(
    form: AnumForm,
    context: ProjectionContext,
) -> AnumProjection:
    """Project a raw carrier in one explicit L3 context."""

    validation = validate_anum(form, context)
    if not validation.is_valid:
        return AnumProjection(
            context=context,
            source=normalize_raw_form(form),
            kind=ProjectionKind.RAW,
            projected=form,
            note="; ".join(validation.messages),
        )

    if context is ProjectionContext.QUOTE:
        if has_quote_envelope(form):
            projected = unquote_anum(form)
            return AnumProjection(
                context=context,
                source=normalize_raw_form(form),
                kind=ProjectionKind.QUOTED_RAW,
                projected=projected,
                note="one explicit quote envelope was removed",
            )
        return AnumProjection(
            context=context,
            source=normalize_raw_form(form),
            kind=ProjectionKind.QUOTED_RAW,
            projected=form,
            note="quote context preserves raw payload without root projection",
        )

    if context is ProjectionContext.RELATIVE:
        return AnumProjection(
            context=context,
            source=normalize_raw_form(form),
            kind=ProjectionKind.RAW,
            projected=form,
            note="relative semantics are intentionally preserved as raw in v0.1",
        )

    return _project_root(form)


def quote_anum(form: AnumForm) -> AnumForm:
    """Add one real quaternary quote envelope ``[ ... ]``."""

    return parse_raw_quaternary(f"[{normalize_raw_form(form)}]")


def has_quote_envelope(form: AnumForm) -> bool:
    return (
        len(form.tokens) >= 2
        and form.tokens[0].abit is Abit.OPEN
        and form.tokens[-1].abit is Abit.CLOSE
    )


def unquote_anum(form: AnumForm) -> AnumForm:
    """Remove exactly one quote envelope in an explicitly quoted context."""

    if not has_quote_envelope(form):
        raise ValueError("Ачисло не содержит внешнюю quote-оболочку [ ... ]")
    inner = "".join(token.abit.value for token in form.tokens[1:-1])
    return parse_raw_quaternary(inner)


def _project_root(form: AnumForm) -> AnumProjection:
    source = normalize_raw_form(form)

    if len(form.tokens) == 1:
        abit = form.tokens[0].abit
        if abit in (Abit.LINK, Abit.UNLINK):
            return AnumProjection(
                context=ProjectionContext.ROOT,
                source=source,
                kind=ProjectionKind.PROTOCOL_VALUE,
                protocol_value=abit.value,
                note="explicit protocol-value abit",
            )

    if len(form.tokens) == 2:
        left, right = (token.abit for token in form.tokens)
        boundary = _BOUNDARY_PROJECTIONS.get((left, right))
        if boundary is not None:
            arrow_form, protocol_value, note = boundary
            return AnumProjection(
                context=ProjectionContext.ROOT,
                source=source,
                kind=(
                    ProjectionKind.PROTOCOL_VALUE
                    if protocol_value is not None
                    else ProjectionKind.BOUNDARY_FORM
                ),
                protocol_value=protocol_value,
                arrow_form=arrow_form,
                note=note,
            )

    return AnumProjection(
        context=ProjectionContext.ROOT,
        source=source,
        kind=ProjectionKind.RAW,
        projected=form,
        note="no general root denotation is assigned to this raw carrier in v0.1",
    )
