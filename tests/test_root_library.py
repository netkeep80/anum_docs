"""Tests for the typed canonical MTS root library."""

from pathlib import Path

from core.mtc_ast import Definition, Equality, Inequality, RoundForm
from core.reference_model import StatementStatus
from core.root_library import FormulaKind, SQUARE_ABIT_FORMS, load_root_library
from core.validate_root import validate_root_library


ROOT_FORMULAS = Path(__file__).with_name("mtc_formulas.mtc")


def test_loads_all_root_formulas_as_typed_ast():
    library = load_root_library(ROOT_FORMULAS)

    assert len(library.formulas) == 34
    assert all(formula.ast is not None for formula in library.formulas)
    assert all(formula.is_valid for formula in library.formulas)


def test_source_locations_are_preserved():
    first = load_root_library(ROOT_FORMULAS).formulas[0]

    assert first.text == "∞ : [] = [] ⟼ []"
    assert first.source_path.endswith("mtc_formulas.mtc")
    assert first.line_no > 0
    assert first.ast is not None
    assert first.ast.span.start == 0
    assert first.ast.span.end == len(first.text)


def test_root_contains_current_key_formulas_only():
    texts = set(load_root_library(ROOT_FORMULAS).texts())

    assert "∞ : [] = [] ⟼ []" in texts
    assert "() : ♀() ⟼ ()♂" in texts
    assert "([) : (♀∞)" in texts
    assert "(]) : (∞♂)" in texts
    assert "(⟼) : (♀∞ ⟼ ∞♂)" in texts
    assert "(↛) : (∞♂ ⟼ ♀∞)" in texts
    assert "[1] : (⟼)" in texts
    assert "[0] : (↛)" in texts
    assert "♀[] : ♀[] = ♀[] ⟼ []" in texts
    assert "[]♂ : []♂ = [] ⟼ []♂" in texts
    assert "(=) : {♀[] = ♀[], []♂ = []♂}" in texts
    assert "(!=) : ¬(=)" in texts
    assert "{} != []" in texts

    retired_equality = "(=) : {" + "[]♀ = []♀, ♂[] = ♂[]}"
    assert retired_equality not in texts


def test_difference_registry_is_built_only_from_definition_ast_nodes():
    registry = load_root_library(ROOT_FORMULAS).registry

    for symbol in (
        "∞",
        "()",
        "([)",
        "(])",
        "(⟼)",
        "(↛)",
        "[1]",
        "[0]",
        "♀[]",
        "[]♂",
        "(=)",
        "(!=)",
    ):
        entry = registry.lookup(symbol)
        assert entry is not None
        assert entry.status is StatementStatus.DEFINITION
        assert isinstance(entry.source_formula.ast, Definition)


def test_square_abit_forms_are_exactly_four_and_infinity_is_not_one():
    library = load_root_library(ROOT_FORMULAS)

    assert set(library.square_abits()) == set(SQUARE_ABIT_FORMS)
    assert set(SQUARE_ABIT_FORMS) == {"([)", "(])", "[1]", "[0]"}
    assert "∞" not in library.square_abits()


def test_formula_kinds_come_from_top_level_ast_type():
    library = load_root_library(ROOT_FORMULAS)
    kinds = {formula.text: formula.kind for formula in library.formulas}
    asts = {formula.text: formula.ast for formula in library.formulas}

    assert kinds["∞ : [] = [] ⟼ []"] is FormulaKind.DEFINITION
    assert kinds["[] = ∞"] is FormulaKind.EQUATION
    assert kinds["(=) : {♀[] = ♀[], []♂ = []♂}"] is FormulaKind.DEFINITION
    assert kinds["(!=) : ¬(=)"] is FormulaKind.DEFINITION
    assert kinds["[][] : [] ⟼ []"] is FormulaKind.DEFINITION
    assert kinds["[][] = [] ⟼ []"] is FormulaKind.EQUATION
    assert kinds["{} != []"] is FormulaKind.NON_EQUATION
    assert kinds["[][][] != []([][])"] is FormulaKind.NON_EQUATION

    assert isinstance(asts["∞ : [] = [] ⟼ []"], Definition)
    assert isinstance(asts["[] = ∞"], Equality)
    assert isinstance(asts["{} != []"], Inequality)


def test_colon_inside_round_form_is_not_registered_as_top_level_definition(tmp_path):
    formula_path = tmp_path / "nested_colon.mtc"
    formula_path.write_text("(a : b)\n", encoding="utf-8")

    library = load_root_library(formula_path)

    assert library.formulas[0].kind is FormulaKind.EXPRESSION
    assert isinstance(library.formulas[0].ast, RoundForm)
    assert isinstance(library.formulas[0].ast.content, Definition)
    assert library.registry.symbols() == []


def test_literal_square_abit_definitions_keep_canonical_text():
    registry = load_root_library(ROOT_FORMULAS).registry

    assert registry.lookup("([)").introduction == "(♀∞)"
    assert registry.lookup("(])").introduction == "(∞♂)"


def test_root_library_validates():
    result = validate_root_library(ROOT_FORMULAS)

    assert result.is_valid, result.messages
    assert result.status == "valid"


def test_duplicate_definitions_are_reported(tmp_path):
    formula_path = tmp_path / "duplicate_defs.mtc"
    formula_path.write_text(
        "∞ : [] = [] ⟼ []\n∞ : []\n",
        encoding="utf-8",
    )

    result = validate_root_library(formula_path)

    assert not result.is_valid
    assert any("Повторное введение различия" in message for message in result.messages)


def test_parser_errors_are_aggregated_with_source_location(tmp_path):
    formula_path = tmp_path / "invalid.mtc"
    formula_path.write_text("{[]\n", encoding="utf-8")

    result = validate_root_library(formula_path)

    assert not result.is_valid
    assert any("invalid.mtc:1:3" in message for message in result.messages)
