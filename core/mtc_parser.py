"""Strict tokenizer and typed parser for the L2 formal notation of MTS."""

from dataclasses import dataclass
from enum import Enum, auto

from core.mtc_ast import (
    BundleForm,
    ContextPole,
    ContextPronoun,
    Definition,
    EndProjection,
    Equality,
    Expression,
    Form,
    Inequality,
    Inversion,
    LinkForm,
    Literal,
    RoundForm,
    Sequence,
    SourceSpan,
    SquareForm,
    StartProjection,
    StaticDiagnostic,
    Symbol,
    validate_expression,
)
from core.reference_model import operator as reference_operator


class TokenKind(Enum):
    SYMBOL = auto()
    CONTEXT = auto()
    COLON = auto()
    ARROW = auto()
    EQUAL = auto()
    NOT_EQUAL = auto()
    NOT = auto()
    START = auto()
    END = auto()
    LPAREN = auto()
    RPAREN = auto()
    LBRACKET = auto()
    RBRACKET = auto()
    LBRACE = auto()
    RBRACE = auto()
    COMMA = auto()
    EOF = auto()


@dataclass(frozen=True)
class Token:
    kind: TokenKind
    value: str
    span: SourceSpan


@dataclass(frozen=True)
class ParseDiagnostic:
    message: str
    span: SourceSpan


@dataclass(frozen=True)
class ParseResult:
    text: str
    ast: Expression | None
    tokens: tuple[Token, ...]
    diagnostics: tuple[ParseDiagnostic, ...]

    @property
    def is_valid(self) -> bool:
        return self.ast is not None and not self.diagnostics


class MTCParseError(ValueError):
    """Syntax/type error with an exact source range."""

    def __init__(self, message: str, span: SourceSpan):
        super().__init__(f"{message} (позиция {span.start})")
        self.message = message
        self.span = span


_SINGLE_CHAR_TOKENS = {
    "$": TokenKind.CONTEXT,
    ":": TokenKind.COLON,
    "⟼": TokenKind.ARROW,
    "=": TokenKind.EQUAL,
    "¬": TokenKind.NOT,
    "♀": TokenKind.START,
    "♂": TokenKind.END,
    "(": TokenKind.LPAREN,
    ")": TokenKind.RPAREN,
    "[": TokenKind.LBRACKET,
    "]": TokenKind.RBRACKET,
    "{": TokenKind.LBRACE,
    "}": TokenKind.RBRACE,
    ",": TokenKind.COMMA,
}

_LITERAL_IN_CONTAINER = {
    TokenKind.ARROW,
    TokenKind.EQUAL,
    TokenKind.NOT_EQUAL,
    TokenKind.COLON,
    TokenKind.LBRACKET,
    TokenKind.RBRACKET,
}

_FORM_STARTS = {
    TokenKind.SYMBOL,
    TokenKind.CONTEXT,
    TokenKind.LPAREN,
    TokenKind.LBRACKET,
    TokenKind.LBRACE,
    TokenKind.NOT,
    TokenKind.START,
}

_PRECEDENCE_DEFINITION = reference_operator(":").precedence
_PRECEDENCE_JUDGMENT = reference_operator("=").precedence
_PRECEDENCE_LINK = reference_operator("⟼").precedence
_PRECEDENCE_SEQUENCE = 50
_PRECEDENCE_INVERSION = reference_operator("¬").precedence
_PRECEDENCE_PROJECTION = reference_operator("♀").precedence


def tokenize(text: str) -> tuple[Token, ...]:
    tokens: list[Token] = []
    position = 0

    while position < len(text):
        char = text[position]
        if char.isspace():
            position += 1
            continue

        if text.startswith("!=", position):
            tokens.append(Token(TokenKind.NOT_EQUAL, "!=", SourceSpan(position, position + 2)))
            position += 2
            continue

        kind = _SINGLE_CHAR_TOKENS.get(char)
        if kind is not None:
            tokens.append(Token(kind, char, SourceSpan(position, position + 1)))
            position += 1
            continue

        start = position
        while position < len(text):
            if text[position].isspace():
                break
            if text.startswith("!=", position):
                break
            if text[position] in _SINGLE_CHAR_TOKENS:
                break
            position += 1

        if position == start:
            raise MTCParseError(
                f"Не удалось прочитать символ {text[position]!r}",
                SourceSpan(position, position + 1),
            )

        tokens.append(Token(TokenKind.SYMBOL, text[start:position], SourceSpan(start, position)))

    tokens.append(Token(TokenKind.EOF, "", SourceSpan(len(text), len(text))))
    return tuple(tokens)


def parse_formula(text: str) -> Expression:
    tokens = tokenize(text)
    ast = _Parser(text, tokens).parse()
    diagnostics = validate_expression(ast)
    if diagnostics:
        first = diagnostics[0]
        raise MTCParseError(first.message, first.span)
    return ast


def parse_formula_result(text: str) -> ParseResult:
    try:
        tokens = tokenize(text)
    except MTCParseError as error:
        return ParseResult(text, None, (), (ParseDiagnostic(error.message, error.span),))

    try:
        ast = _Parser(text, tokens).parse()
    except MTCParseError as error:
        return ParseResult(text, None, tokens, (ParseDiagnostic(error.message, error.span),))

    diagnostics = tuple(
        _convert_static_diagnostic(item) for item in validate_expression(ast)
    )
    return ParseResult(text, ast, tokens, diagnostics)


class _Parser:
    def __init__(self, text: str, tokens: tuple[Token, ...]):
        self.text = text
        self.tokens = tokens
        self.position = 0

    @property
    def current(self) -> Token:
        return self.tokens[self.position]

    def peek(self, offset: int = 1) -> Token:
        return self.tokens[min(self.position + offset, len(self.tokens) - 1)]

    def parse(self) -> Expression:
        expression = self.parse_expression(0)
        if self.current.kind is not TokenKind.EOF:
            raise MTCParseError(f"Неожиданный токен {self.current.value!r}", self.current.span)
        return expression

    def parse_expression(self, minimum_precedence: int) -> Expression:
        left = self.parse_prefix_or_primary()

        while True:
            if self.current.kind is TokenKind.END and _PRECEDENCE_PROJECTION >= minimum_precedence:
                end = self.take(TokenKind.END)
                left_form = self.require_form(left, "Оператор ♂ применяется только к форме")
                left = EndProjection(left_form, SourceSpan(left_form.span.start, end.span.end))
                continue

            if self.current.kind in _FORM_STARTS and _PRECEDENCE_SEQUENCE >= minimum_precedence:
                if not isinstance(left, Form):
                    break
                right = self.parse_expression(_PRECEDENCE_SEQUENCE + 1)
                right_form = self.require_form(right, "Элемент последовательности должен быть формой")
                items = left.items + (right_form,) if isinstance(left, Sequence) else (left, right_form)
                left = Sequence(items, SourceSpan(left.span.start, right_form.span.end))
                continue

            kind = self.current.kind
            if kind is TokenKind.COLON:
                precedence, right_associative = _PRECEDENCE_DEFINITION, True
            elif kind in (TokenKind.EQUAL, TokenKind.NOT_EQUAL):
                precedence, right_associative = _PRECEDENCE_JUDGMENT, False
            elif kind is TokenKind.ARROW:
                precedence, right_associative = _PRECEDENCE_LINK, False
            else:
                break

            if precedence < minimum_precedence:
                break

            operator = self.take()
            right = self.parse_expression(precedence if right_associative else precedence + 1)

            if kind is TokenKind.COLON:
                target = self.require_form(left, "Левая часть определения должна быть формой")
                left = Definition(target, right, SourceSpan(target.span.start, right.span.end))
                continue

            left_form = self.require_form(left, f"Левый операнд {operator.value} должен быть формой")
            right_form = self.require_form(right, f"Правый операнд {operator.value} должен быть формой")
            span = SourceSpan(left_form.span.start, right_form.span.end)

            if kind is TokenKind.ARROW:
                left = LinkForm(left_form, right_form, span)
            elif kind is TokenKind.EQUAL:
                left = Equality(left_form, right_form, span)
            else:
                left = Inequality(left_form, right_form, span)

        return left

    def parse_prefix_or_primary(self) -> Form:
        token = self.current
        if token.kind is TokenKind.NOT:
            self.take()
            value = self.require_form(
                self.parse_expression(_PRECEDENCE_INVERSION),
                "Оператор ¬ применяется только к форме",
            )
            return Inversion(value, SourceSpan(token.span.start, value.span.end))

        if token.kind is TokenKind.START:
            self.take()
            value = self.require_form(
                self.parse_expression(_PRECEDENCE_PROJECTION),
                "Оператор ♀ применяется только к форме",
            )
            return StartProjection(value, SourceSpan(token.span.start, value.span.end))

        return self.parse_primary()

    def parse_primary(self) -> Form:
        token = self.current
        if token.kind is TokenKind.SYMBOL:
            self.take()
            return Symbol(token.value, token.span)
        if token.kind is TokenKind.CONTEXT:
            return self.parse_context_pronoun()
        if token.kind is TokenKind.LPAREN:
            return self.parse_round_form()
        if token.kind is TokenKind.LBRACKET:
            return self.parse_square_form()
        if token.kind is TokenKind.LBRACE:
            return self.parse_bundle_form()
        raise MTCParseError(f"Ожидалась форма, получено {token.value!r}", token.span)

    def parse_context_pronoun(self) -> ContextPronoun:
        """Parse one of exactly two contextual roles: ``$+ [`` or ``$+ ]``."""

        opening = self.take(TokenKind.CONTEXT)
        dollar_count = 1
        previous = opening

        while (
            self.current.kind is TokenKind.CONTEXT
            and self.current.span.start == previous.span.end
        ):
            previous = self.take()
            dollar_count += 1

        token = self.current
        if (
            token.kind not in (TokenKind.LBRACKET, TokenKind.RBRACKET)
            or token.span.start != previous.span.end
        ):
            raise MTCParseError(
                "После `$` ожидается одно из двух контекстных местоимений: `[` или `]`",
                SourceSpan(opening.span.start, previous.span.end),
            )

        pole_token = self.take()
        pole = ContextPole.START if pole_token.kind is TokenKind.LBRACKET else ContextPole.END
        return ContextPronoun(
            up=dollar_count - 1,
            pole=pole,
            span=SourceSpan(opening.span.start, pole_token.span.end),
        )

    def parse_round_form(self) -> RoundForm:
        opening = self.take(TokenKind.LPAREN)
        if self.current.kind is TokenKind.RPAREN:
            closing = self.take()
            return RoundForm(None, SourceSpan(opening.span.start, closing.span.end))

        literal = self.try_parse_single_literal(TokenKind.RPAREN)
        if literal is not None:
            closing = self.take(TokenKind.RPAREN)
            return RoundForm(literal, SourceSpan(opening.span.start, closing.span.end))

        content = self.parse_expression(0)
        closing = self.take(TokenKind.RPAREN)
        return RoundForm(content, SourceSpan(opening.span.start, closing.span.end))

    def parse_square_form(self) -> SquareForm:
        opening = self.take(TokenKind.LBRACKET)
        if self.current.kind is TokenKind.RBRACKET:
            closing = self.take()
            return SquareForm(None, SourceSpan(opening.span.start, closing.span.end))

        literal = self.try_parse_single_literal(TokenKind.RBRACKET)
        if literal is not None:
            closing = self.take(TokenKind.RBRACKET)
            return SquareForm(literal, SourceSpan(opening.span.start, closing.span.end))

        content = self.parse_expression(0)
        closing = self.take(TokenKind.RBRACKET)
        return SquareForm(content, SourceSpan(opening.span.start, closing.span.end))

    def parse_bundle_form(self) -> BundleForm:
        opening = self.take(TokenKind.LBRACE)
        if self.current.kind is TokenKind.RBRACE:
            closing = self.take()
            return BundleForm((), SourceSpan(opening.span.start, closing.span.end))

        items: list[Expression] = []
        while True:
            items.append(self.parse_expression(0))
            if self.current.kind is TokenKind.COMMA:
                self.take()
                continue
            closing = self.take(TokenKind.RBRACE)
            return BundleForm(tuple(items), SourceSpan(opening.span.start, closing.span.end))

    def try_parse_single_literal(self, closing_kind: TokenKind) -> Literal | None:
        if self.current.kind in _LITERAL_IN_CONTAINER and self.peek().kind is closing_kind:
            token = self.take()
            return Literal(token.value, token.span)
        return None

    def take(self, expected_kind: TokenKind | None = None) -> Token:
        token = self.current
        if expected_kind is not None and token.kind is not expected_kind:
            expected = _token_kind_description(expected_kind)
            actual = token.value or "конец строки"
            raise MTCParseError(f"Ожидалось {expected}, получено {actual!r}", token.span)
        self.position += 1
        return token

    @staticmethod
    def require_form(expression: Expression, message: str) -> Form:
        if not isinstance(expression, Form):
            raise MTCParseError(message, expression.span)
        return expression


def _token_kind_description(kind: TokenKind) -> str:
    descriptions = {
        TokenKind.RPAREN: "')'",
        TokenKind.RBRACKET: "']'",
        TokenKind.RBRACE: "'}'",
    }
    return descriptions.get(kind, kind.name)


def _convert_static_diagnostic(diagnostic: StaticDiagnostic) -> ParseDiagnostic:
    return ParseDiagnostic(diagnostic.message, diagnostic.span)
