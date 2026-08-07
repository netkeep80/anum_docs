"""Challenge tests for binary contextual pronouns in L2 formal notation."""

import pytest

from core.mtc_ast import (
    BundleForm,
    ContextPath,
    ContextPole,
    Definition,
    Equality,
    RoundForm,
    format_expression,
    structural_key,
)
from core.mtc_parser import MTCParseError, parse_formula


def test_current_context_has_exactly_two_primitive_one_step_pronouns():
    start = parse_formula("$[")
    end = parse_formula("$]")

    assert start == ContextPath(
        up=0,
        steps=(ContextPole.START,),
        span=start.span,
    )
    assert end == ContextPath(
        up=0,
        steps=(ContextPole.END,),
        span=end.span,
    )


def test_context_path_is_binary_navigation_not_named_variable():
    start_start = parse_formula("$[[")
    start_end = parse_formula("$[]")
    end_start = parse_formula("$][")
    end_end = parse_formula("$]]")

    assert start_start.steps == (ContextPole.START, ContextPole.START)
    assert start_end.steps == (ContextPole.START, ContextPole.END)
    assert end_start.steps == (ContextPole.END, ContextPole.START)
    assert end_end.steps == (ContextPole.END, ContextPole.END)


def test_repeated_dollar_moves_to_parent_context_like_jsonrvm():
    current = parse_formula("$[")
    parent = parse_formula("$$[")
    grandparent_end_start = parse_formula("$$$][")

    assert current.up == 0
    assert parent.up == 1
    assert grandparent_end_start.up == 2
    assert grandparent_end_start.steps == (ContextPole.END, ContextPole.START)


def test_context_path_uses_source_adjacency_as_lexical_boundary():
    ast = parse_formula("$[] []")

    # `$[]` is one context path. The separated `[]` starts a new form and the
    # normal juxtaposition machinery handles the pair.
    from core.mtc_ast import Sequence, SquareForm

    assert isinstance(ast, Sequence)
    assert isinstance(ast.items[0], ContextPath)
    assert ast.items[0].steps == (ContextPole.START, ContextPole.END)
    assert isinstance(ast.items[1], SquareForm)


def test_bare_context_anchor_is_rejected_because_dyad_has_two_role_pronouns():
    with pytest.raises(MTCParseError, match="После `\\$` ожидается путь"):
        parse_formula("$")


def test_equality_meaning_can_be_written_without_named_variables_or_implicit_slots():
    source = "(=) : {$[[ = $][, $[] = $]]}"
    ast = parse_formula(source)

    assert isinstance(ast, Definition)
    assert isinstance(ast.target, RoundForm)
    assert isinstance(ast.value, BundleForm)
    assert len(ast.value.items) == 2
    assert all(isinstance(item, Equality) for item in ast.value.items)

    first = ast.value.items[0]
    second = ast.value.items[1]
    assert isinstance(first, Equality)
    assert isinstance(second, Equality)

    assert first.left.steps == (ContextPole.START, ContextPole.START)
    assert first.right.steps == (ContextPole.END, ContextPole.START)
    assert second.left.steps == (ContextPole.START, ContextPole.END)
    assert second.right.steps == (ContextPole.END, ContextPole.END)


def test_context_path_round_trip_is_structural():
    for source in ("$[", "$]", "$[[", "$[]", "$][", "$]]", "$$][", "$$$[]"):
        original = parse_formula(source)
        canonical = format_expression(original)
        reparsed = parse_formula(canonical)
        assert canonical == source
        assert structural_key(reparsed) == structural_key(original)
