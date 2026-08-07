"""Conformance tests for the strict typed L2 MTS front-end."""

from pathlib import Path

import pytest

from core.mtc_ast import (
    BundleForm,
    Definition,
    EndProjection,
    Equality,
    Inequality,
    LinkForm,
    Literal,
    RoundForm,
    Sequence,
    SquareForm,
    StartProjection,
    Symbol,
    format_expression,
    structural_key,
)
from core.mtc_parser import MTCParseError, TokenKind, parse_formula, parse_formula_result, tokenize


ROOT_FIXTURE = Path(__file__).with_name("mtc_formulas.mtc")


def fixture_formulas() -> list[str]:
    return [
        line.strip()
        for line in ROOT_FIXTURE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def test_root_fixture_has_34_typed_formulas():
    formulas = fixture_formulas()
    assert len(formulas) == 34
    assert all(parse_formula_result(formula).is_valid for formula in formulas)


def test_definition_rhs_can_be_a_judgment():
    ast = parse_formula("∞ : [] = [] ⟼ []")

    assert isinstance(ast, Definition)
    assert isinstance(ast.target, Symbol)
    assert ast.target.name == "∞"
    assert isinstance(ast.value, Equality)
    assert isinstance(ast.value.left, SquareForm)
    assert isinstance(ast.value.right, LinkForm)


def test_equality_definition_bundle_contains_typed_judgments():
    ast = parse_formula("(=) : {♀[] = ♀[], []♂ = []♂}")

    assert isinstance(ast, Definition)
    assert isinstance(ast.target, RoundForm)
    assert isinstance(ast.target.content, Literal)
    assert ast.target.content.value == "="
    assert isinstance(ast.value, BundleForm)
    assert len(ast.value.items) == 2
    assert all(isinstance(item, Equality) for item in ast.value.items)


def test_literal_square_boundary_glyphs_inside_round_forms_are_not_containers():
    left = parse_formula("([) : (♀∞)")
    right = parse_formula("(]) : (∞♂)")

    assert isinstance(left, Definition)
    assert isinstance(right, Definition)
    assert isinstance(left.target, RoundForm)
    assert isinstance(right.target, RoundForm)
    assert isinstance(left.target.content, Literal)
    assert isinstance(right.target.content, Literal)
    assert left.target.content.value == "["
    assert right.target.content.value == "]"


def test_empty_and_abit_square_forms_are_distinct_ast_nodes():
    empty = parse_formula("[]")
    one = parse_formula("[1]")

    assert isinstance(empty, SquareForm)
    assert empty.content is None
    assert isinstance(one, SquareForm)
    assert isinstance(one.content, Symbol)
    assert one.content.name == "1"


def test_start_and_end_projection_have_opposite_fixity():
    start = parse_formula("♀[]")
    end = parse_formula("[]♂")

    assert isinstance(start, StartProjection)
    assert isinstance(end, EndProjection)
    assert isinstance(start.value, SquareForm)
    assert isinstance(end.value, SquareForm)


def test_arrow_is_left_associative_as_required_by_reference_model():
    ast = parse_formula("[] ⟼ [] ⟼ []")

    assert isinstance(ast, LinkForm)
    assert isinstance(ast.left, LinkForm)
    assert isinstance(ast.right, SquareForm)


def test_juxtaposition_builds_sequence_without_string_reinterpretation():
    ast = parse_formula("[]([][])")

    assert isinstance(ast, Sequence)
    assert len(ast.items) == 2
    assert isinstance(ast.items[0], SquareForm)
    assert isinstance(ast.items[1], RoundForm)
    assert isinstance(ast.items[1].content, Sequence)


def test_bundle_expansion_keeps_link_items_typed():
    ast = parse_formula("[]{[], [][]} = {[] ⟼ [], [] ⟼ [][]}")

    assert isinstance(ast, Equality)
    assert isinstance(ast.left, Sequence)
    assert isinstance(ast.right, BundleForm)
    assert all(isinstance(item, LinkForm) for item in ast.right.items)


def test_inequality_is_a_judgment_not_a_form():
    ast = parse_formula("{} != []")
    assert isinstance(ast, Inequality)


def test_source_spans_point_to_original_subexpressions():
    text = "  ♀[] : ♀[] = []"
    ast = parse_formula(text)

    assert isinstance(ast, Definition)
    assert text[ast.span.start : ast.span.end] == "♀[] : ♀[] = []"
    assert text[ast.target.span.start : ast.target.span.end] == "♀[]"


def test_tokenizer_recognizes_multi_character_not_equal_before_single_tokens():
    tokens = tokenize("[] != {}")
    significant = [token for token in tokens if token.kind is not TokenKind.EOF]
    assert [token.value for token in significant] == ["[", "]", "!=", "{", "}"]


def test_nested_definition_is_not_a_top_level_definition_node():
    ast = parse_formula("(a : b)")

    assert isinstance(ast, RoundForm)
    assert isinstance(ast.content, Definition)


def test_l3_raw_closing_opening_pair_is_not_silently_accepted_as_l2():
    with pytest.raises(MTCParseError) as error:
        parse_formula("][")

    assert error.value.span.start == 0


def test_unclosed_container_reports_exact_position():
    result = parse_formula_result("{[]")

    assert not result.is_valid
    assert result.ast is None
    assert result.diagnostics
    assert result.diagnostics[0].span.start == 3
    assert ")" not in result.diagnostics[0].message


def test_dangling_arrow_is_rejected_at_end_of_formula():
    result = parse_formula_result("[] ⟼")

    assert not result.is_valid
    assert result.diagnostics[0].span.start == len("[] ⟼")


def test_root_fixture_round_trips_through_canonical_printer():
    for source in fixture_formulas():
        original = parse_formula(source)
        canonical = format_expression(original)
        reparsed = parse_formula(canonical)
        assert structural_key(reparsed) == structural_key(original), (source, canonical)
