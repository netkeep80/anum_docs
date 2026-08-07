"""Challenge tests for the two binary contextual pronouns of MTS v0.2."""

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
from core.mtc_parser import MTCParseError, parse_formula


def test_current_context_has_exactly_two_primitive_pronouns():
    start = parse_formula("$[")
    end = parse_formula("$]")

    assert isinstance(start, ContextPronoun)
    assert isinstance(end, ContextPronoun)
    assert start.up == 0 and start.pole is ContextPole.START
    assert end.up == 0 and end.pole is ContextPole.END


def test_repeated_dollar_moves_to_ancestor_context_like_jsonrvm():
    parent_start = parse_formula("$$[")
    grandparent_end = parse_formula("$$$]")

    assert isinstance(parent_start, ContextPronoun)
    assert isinstance(grandparent_end, ContextPronoun)
    assert parent_start.up == 1
    assert parent_start.pole is ContextPole.START
    assert grandparent_end.up == 2
    assert grandparent_end.pole is ContextPole.END


def test_deeper_structure_uses_existing_mts_projection_operators():
    first_start = parse_formula("♀$[")
    first_end = parse_formula("$[♂")
    second_start = parse_formula("♀$]")
    second_end = parse_formula("$]♂")

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


def test_general_context_path_language_is_not_part_of_candidate():
    # `$[[` is parsed as `$[` followed by a normal L2 square form start and
    # therefore cannot silently become a special context-path primitive.
    with pytest.raises(MTCParseError):
        parse_formula("$[[")

    with pytest.raises(MTCParseError):
        parse_formula("$][")


def test_bare_context_anchor_is_rejected():
    with pytest.raises(MTCParseError, match="контекстных местоимений"):
        parse_formula("$")


def test_equality_meaning_uses_only_two_context_pronouns_and_existing_mts_forms():
    source = "(=) : {♀$[ = ♀$], $[♂ = $]♂}"
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
    for source in ("$[", "$]", "$$[", "$$]", "$$$[", "♀$[", "$]♂"):
        original = parse_formula(source)
        canonical = format_expression(original)
        reparsed = parse_formula(canonical)
        assert canonical == source
        assert structural_key(reparsed) == structural_key(original)
