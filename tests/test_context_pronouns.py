"""Challenge tests for the two atomic contextual pronouns of MTS v0.2."""

import pytest

from core.mtc_ast import (
    BundleForm,
    ContextPole,
    ContextPronoun,
    Definition,
    EndProjection,
    Equality,
    RoundForm,
    StartProjection,
    format_expression,
    structural_key,
)
from core.mtc_parser import MTCParseError, TokenKind, parse_formula, tokenize


def test_current_context_has_exactly_two_primitive_one_character_pronouns():
    start = parse_formula("◁")
    end = parse_formula("▷")

    assert isinstance(start, ContextPronoun)
    assert isinstance(end, ContextPronoun)
    assert start.up == 0 and start.pole is ContextPole.START
    assert end.up == 0 and end.pole is ContextPole.END
    assert len(ContextPole.START.value) == 1
    assert len(ContextPole.END.value) == 1


def test_context_ascent_is_separate_from_pronoun_identity():
    parent_start = parse_formula("↑◁")
    grandparent_end = parse_formula("↑↑▷")

    assert isinstance(parent_start, ContextPronoun)
    assert isinstance(grandparent_end, ContextPronoun)
    assert parent_start.up == 1
    assert parent_start.pole is ContextPole.START
    assert grandparent_end.up == 2
    assert grandparent_end.pole is ContextPole.END


def test_context_ascent_is_whitespace_insensitive_but_prints_canonically():
    parsed = parse_formula("↑ ↑  ◁")
    assert isinstance(parsed, ContextPronoun)
    assert parsed.up == 2
    assert format_expression(parsed) == "↑↑◁"


def test_deeper_structure_uses_existing_mts_projection_operators():
    first_start = parse_formula("♀◁")
    first_end = parse_formula("◁♂")
    second_start = parse_formula("♀▷")
    second_end = parse_formula("▷♂")

    assert isinstance(first_start, StartProjection)
    assert isinstance(first_start.value, ContextPronoun)
    assert first_start.value.pole is ContextPole.START

    assert isinstance(first_end, EndProjection)
    assert isinstance(first_end.value, ContextPronoun)
    assert first_end.value.pole is ContextPole.START

    assert isinstance(second_start, StartProjection)
    assert isinstance(second_start.value, ContextPronoun)
    assert second_start.value.pole is ContextPole.END

    assert isinstance(second_end, EndProjection)
    assert isinstance(second_end.value, ContextPronoun)
    assert second_end.value.pole is ContextPole.END


def test_square_brackets_are_lexed_independently_of_context_pronouns():
    tokens = tokenize("◁[]▷")
    assert [token.kind for token in tokens[:-1]] == [
        TokenKind.CONTEXT_START,
        TokenKind.LBRACKET,
        TokenKind.RBRACKET,
        TokenKind.CONTEXT_END,
    ]
    assert [token.value for token in tokens[:-1]] == ["◁", "[", "]", "▷"]


def test_bracket_scanner_never_needs_pronoun_lookbehind():
    plain = tokenize("[][]")
    surrounded = tokenize("◁[][]▷")

    assert [token.kind for token in plain[:-1]] == [
        TokenKind.LBRACKET,
        TokenKind.RBRACKET,
        TokenKind.LBRACKET,
        TokenKind.RBRACKET,
    ]
    assert [
        token.kind
        for token in surrounded[:-1]
        if token.kind in (TokenKind.LBRACKET, TokenKind.RBRACKET)
    ] == [
        TokenKind.LBRACKET,
        TokenKind.RBRACKET,
        TokenKind.LBRACKET,
        TokenKind.RBRACKET,
    ]


def test_bare_context_ascent_is_rejected():
    with pytest.raises(MTCParseError, match="местоимение `◁` или `▷`"):
        parse_formula("↑")


def test_equality_meaning_uses_only_two_context_pronouns_and_existing_mts_forms():
    source = "(=) : {♀◁ = ♀▷, ◁♂ = ▷♂}"
    ast = parse_formula(source)

    assert isinstance(ast, Definition)
    assert isinstance(ast.target, RoundForm)
    assert isinstance(ast.value, BundleForm)
    assert len(ast.value.items) == 2
    assert all(isinstance(item, Equality) for item in ast.value.items)

    starts = ast.value.items[0]
    ends = ast.value.items[1]
    assert isinstance(starts, Equality)
    assert isinstance(ends, Equality)
    assert isinstance(starts.left, StartProjection)
    assert isinstance(starts.right, StartProjection)
    assert isinstance(ends.left, EndProjection)
    assert isinstance(ends.right, EndProjection)


def test_context_pronoun_round_trip_is_structural():
    for source in ("◁", "▷", "↑◁", "↑▷", "↑↑◁", "♀◁", "▷♂"):
        original = parse_formula(source)
        canonical = format_expression(original)
        reparsed = parse_formula(canonical)
        assert canonical == source
        assert structural_key(reparsed) == structural_key(original)
