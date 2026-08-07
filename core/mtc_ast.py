"""Typed abstract syntax tree for the L2 formal notation of MTS."""

from dataclasses import dataclass
from enum import Enum


@dataclass(frozen=True)
class SourceSpan:
    """Half-open source range ``[start, end)`` inside one formula."""

    start: int
    end: int


class Expression:
    """Base class for every parseable L2 expression."""


class Form(Expression):
    """Expression whose value is an L1 form."""


class Judgment(Expression):
    """Expression that states a relation between forms."""


class ContextPole(str, Enum):
    """The two atomic pronouns of a binary interpretation context."""

    START = "◁"
    END = "▷"


@dataclass(frozen=True)
class Symbol(Form):
    name: str
    span: SourceSpan


@dataclass(frozen=True)
class Literal(Form):
    """Literal operator/boundary glyph inside a container, e.g. ``(=)``."""

    value: str
    span: SourceSpan


@dataclass(frozen=True)
class ContextPronoun(Form):
    """Deictic reference to one pole of current/ancestor execution context.

    The binary context has exactly two primitive one-code-point pronouns::

        ◁   current.start
        ▷   current.end

    Context ascent is a separate unary marker and never changes the pronoun::

        ↑◁   parent.start
        ↑▷   parent.end
        ↑↑◁  grandparent.start

    ``up=0`` means the current context; ``up=1`` means its parent. Square
    brackets remain completely independent L2/L3 delimiters. Deeper link
    structure is expressed by existing MTS operators, e.g. ``♀◁`` and ``▷♂``.
    """

    up: int
    pole: ContextPole
    span: SourceSpan


@dataclass(frozen=True)
class RoundForm(Form):
    content: Expression | None
    span: SourceSpan


@dataclass(frozen=True)
class SquareForm(Form):
    content: Expression | None
    span: SourceSpan


@dataclass(frozen=True)
class BundleForm(Form):
    """Curly form. Items may be forms or judgments in the current fixture."""

    items: tuple[Expression, ...]
    span: SourceSpan


@dataclass(frozen=True)
class Sequence(Form):
    """Juxtaposition of two or more forms, e.g. ``[][]``."""

    items: tuple[Form, ...]
    span: SourceSpan


@dataclass(frozen=True)
class StartProjection(Form):
    value: Form
    span: SourceSpan


@dataclass(frozen=True)
class EndProjection(Form):
    value: Form
    span: SourceSpan


@dataclass(frozen=True)
class Inversion(Form):
    value: Form
    span: SourceSpan


@dataclass(frozen=True)
class LinkForm(Form):
    left: Form
    right: Form
    span: SourceSpan


@dataclass(frozen=True)
class Equality(Judgment):
    left: Form
    right: Form
    span: SourceSpan


@dataclass(frozen=True)
class Inequality(Judgment):
    left: Form
    right: Form
    span: SourceSpan


@dataclass(frozen=True)
class Definition(Expression):
    """L2 introduction ``target : expression``.

    The right-hand side is intentionally ``Expression`` rather than ``Form``:
    a definition may introduce a sign through a local bundle of constraints.
    ``:`` opens an interpretation scope; it is not a global assignment.
    """

    target: Form
    value: Expression
    span: SourceSpan


@dataclass(frozen=True)
class StaticDiagnostic:
    message: str
    span: SourceSpan


_PRECEDENCE_DEFINITION = 10
_PRECEDENCE_JUDGMENT = 20
_PRECEDENCE_LINK = 40
_PRECEDENCE_SEQUENCE = 50
_PRECEDENCE_INVERSION = 60
_PRECEDENCE_PROJECTION = 70
_PRECEDENCE_ATOM = 100


def precedence(expression: Expression) -> int:
    """Return canonical formatting precedence for one AST node."""

    if isinstance(expression, Definition):
        return _PRECEDENCE_DEFINITION
    if isinstance(expression, (Equality, Inequality)):
        return _PRECEDENCE_JUDGMENT
    if isinstance(expression, LinkForm):
        return _PRECEDENCE_LINK
    if isinstance(expression, Sequence):
        return _PRECEDENCE_SEQUENCE
    if isinstance(expression, Inversion):
        return _PRECEDENCE_INVERSION
    if isinstance(expression, (StartProjection, EndProjection)):
        return _PRECEDENCE_PROJECTION
    return _PRECEDENCE_ATOM


def format_expression(expression: Expression) -> str:
    """Format AST into a deterministic canonical L2 string."""

    return _format(expression, 0)


def structural_key(expression: Expression | None):
    """Return a source-span-independent structural representation.

    This is used by round-trip tests and proof/debug tooling. It is not a
    semantic equality operation.
    """

    if expression is None:
        return None
    if isinstance(expression, Symbol):
        return ("symbol", expression.name)
    if isinstance(expression, Literal):
        return ("literal", expression.value)
    if isinstance(expression, ContextPronoun):
        return ("context-pronoun", expression.up, expression.pole.value)
    if isinstance(expression, RoundForm):
        return ("round", structural_key(expression.content))
    if isinstance(expression, SquareForm):
        return ("square", structural_key(expression.content))
    if isinstance(expression, BundleForm):
        return ("bundle", tuple(structural_key(item) for item in expression.items))
    if isinstance(expression, Sequence):
        return ("sequence", tuple(structural_key(item) for item in expression.items))
    if isinstance(expression, StartProjection):
        return ("start", structural_key(expression.value))
    if isinstance(expression, EndProjection):
        return ("end", structural_key(expression.value))
    if isinstance(expression, Inversion):
        return ("inversion", structural_key(expression.value))
    if isinstance(expression, LinkForm):
        return ("link", structural_key(expression.left), structural_key(expression.right))
    if isinstance(expression, Equality):
        return ("equality", structural_key(expression.left), structural_key(expression.right))
    if isinstance(expression, Inequality):
        return ("inequality", structural_key(expression.left), structural_key(expression.right))
    if isinstance(expression, Definition):
        return ("definition", structural_key(expression.target), structural_key(expression.value))
    raise TypeError(f"Unsupported AST node: {type(expression).__name__}")


def validate_expression(expression: Expression) -> tuple[StaticDiagnostic, ...]:
    """Validate typed invariants that are independent of L1 evaluation."""

    diagnostics: list[StaticDiagnostic] = []
    _validate(expression, diagnostics)
    return tuple(diagnostics)


def _validate(expression: Expression, diagnostics: list[StaticDiagnostic]) -> None:
    if isinstance(expression, (Symbol, Literal)):
        return

    if isinstance(expression, ContextPronoun):
        if expression.up < 0:
            diagnostics.append(
                StaticDiagnostic(
                    "Глубина контекстного местоимения не может быть отрицательной",
                    expression.span,
                )
            )
        return

    if isinstance(expression, RoundForm):
        if expression.content is not None:
            _validate(expression.content, diagnostics)
        return

    if isinstance(expression, SquareForm):
        if expression.content is not None:
            if not isinstance(expression.content, Form):
                diagnostics.append(
                    StaticDiagnostic(
                        "Квадратная форма L2 должна содержать форму, а не суждение/определение",
                        expression.content.span,
                    )
                )
            _validate(expression.content, diagnostics)
        return

    if isinstance(expression, BundleForm):
        for item in expression.items:
            _validate(item, diagnostics)
        return

    if isinstance(expression, Sequence):
        if len(expression.items) < 2:
            diagnostics.append(
                StaticDiagnostic(
                    "Последовательность должна содержать минимум две формы",
                    expression.span,
                )
            )
        for item in expression.items:
            if not isinstance(item, Form):
                diagnostics.append(
                    StaticDiagnostic(
                        "Элемент последовательности должен быть формой",
                        item.span,
                    )
                )
            _validate(item, diagnostics)
        return

    if isinstance(expression, (StartProjection, EndProjection, Inversion)):
        if not isinstance(expression.value, Form):
            diagnostics.append(
                StaticDiagnostic(
                    "Унарный оператор применяется только к форме",
                    expression.value.span,
                )
            )
        _validate(expression.value, diagnostics)
        return

    if isinstance(expression, LinkForm):
        _validate_binary_form_operands(expression.left, expression.right, "⟼", diagnostics)
        return

    if isinstance(expression, Equality):
        _validate_binary_form_operands(expression.left, expression.right, "=", diagnostics)
        return

    if isinstance(expression, Inequality):
        _validate_binary_form_operands(expression.left, expression.right, "!=", diagnostics)
        return

    if isinstance(expression, Definition):
        if not isinstance(expression.target, Form):
            diagnostics.append(
                StaticDiagnostic(
                    "Левая часть определения должна быть формой",
                    expression.target.span,
                )
            )
        _validate(expression.target, diagnostics)
        _validate(expression.value, diagnostics)
        return

    raise TypeError(f"Unsupported AST node: {type(expression).__name__}")


def _validate_binary_form_operands(
    left: Form,
    right: Form,
    operator: str,
    diagnostics: list[StaticDiagnostic],
) -> None:
    if not isinstance(left, Form):
        diagnostics.append(
            StaticDiagnostic(
                f"Левый операнд {operator} должен быть формой",
                left.span,
            )
        )
    if not isinstance(right, Form):
        diagnostics.append(
            StaticDiagnostic(
                f"Правый операнд {operator} должен быть формой",
                right.span,
            )
        )
    _validate(left, diagnostics)
    _validate(right, diagnostics)


def _format(expression: Expression, parent_precedence: int) -> str:
    current_precedence = precedence(expression)

    if isinstance(expression, Symbol):
        text = expression.name
    elif isinstance(expression, Literal):
        text = expression.value
    elif isinstance(expression, ContextPronoun):
        text = "↑" * expression.up + expression.pole.value
    elif isinstance(expression, RoundForm):
        text = f"({_format(expression.content, 0) if expression.content is not None else ''})"
    elif isinstance(expression, SquareForm):
        text = f"[{_format(expression.content, 0) if expression.content is not None else ''}]"
    elif isinstance(expression, BundleForm):
        text = "{" + ", ".join(_format(item, 0) for item in expression.items) + "}"
    elif isinstance(expression, Sequence):
        text = "".join(
            _format(item, _PRECEDENCE_SEQUENCE + 1) for item in expression.items
        )
    elif isinstance(expression, StartProjection):
        text = "♀" + _format(expression.value, _PRECEDENCE_PROJECTION)
    elif isinstance(expression, EndProjection):
        text = _format(expression.value, _PRECEDENCE_PROJECTION) + "♂"
    elif isinstance(expression, Inversion):
        text = "¬" + _format(expression.value, _PRECEDENCE_INVERSION)
    elif isinstance(expression, LinkForm):
        text = (
            f"{_format(expression.left, _PRECEDENCE_LINK)} ⟼ "
            f"{_format(expression.right, _PRECEDENCE_LINK + 1)}"
        )
    elif isinstance(expression, Equality):
        text = (
            f"{_format(expression.left, _PRECEDENCE_JUDGMENT)} = "
            f"{_format(expression.right, _PRECEDENCE_JUDGMENT + 1)}"
        )
    elif isinstance(expression, Inequality):
        text = (
            f"{_format(expression.left, _PRECEDENCE_JUDGMENT)} != "
            f"{_format(expression.right, _PRECEDENCE_JUDGMENT + 1)}"
        )
    elif isinstance(expression, Definition):
        text = (
            f"{_format(expression.target, _PRECEDENCE_DEFINITION)} : "
            f"{_format(expression.value, _PRECEDENCE_DEFINITION)}"
        )
    else:
        raise TypeError(f"Unsupported AST node: {type(expression).__name__}")

    if current_precedence < parent_precedence:
        return f"({text})"
    return text
