"""Tests for the typed canonical MTS root library."""

from pathlib import Path

from core.mtc_ast import Definition, RoundForm, format_expression
from core.mtc_definitions import DefinitionLookupKind, open_definition
from core.root_library import FormulaKind, SQUARE_ABIT_FORMS, load_root_library
from core.validate_root import validate_root_library


ROOT_FORMULAS = Path(__file__).with_name("mtc_formulas.mtc")


CANONICAL_DEFINITIONS = {
    "∞": "{◁ = ∞, ▷ = ∞}",
    "()": "♀() ⟼ ()♂",
    "([)": "(♀∞)",
    "(])": "(∞♂)",
    "(⟼)": "(♀∞ ⟼ ∞♂)",
    "(↛)": "(∞♂ ⟼ ♀∞)",
    "[1]": "(⟼)",
    "[0]": "(↛)",
    "(=)": "{♀◁ = ♀▷, ◁♂ = ▷♂}",
    "(!=)": "¬(=)",
}


def test_loads_ten_root_formulas_as_typed_definitions():
    library = load_root_library(ROOT_FORMULAS)

    assert len(library.formulas) == 10
    assert all(formula.ast is not None for formula in library.formulas)
    assert all(formula.is_valid for formula in library.formulas)
    assert all(formula.kind is FormulaKind.DEFINITION for formula in library.formulas)


def test_source_locations_are_preserved():
    first = load_root_library(ROOT_FORMULAS).formulas[0]

    assert first.text == "∞ : {◁ = ∞, ▷ = ∞}"
    assert first.source_path.endswith("mtc_formulas.mtc")
    assert first.line_no > 0
    assert first.ast is not None
    assert first.ast.span.start == 0
    assert first.ast.span.end == len(first.text)


def test_root_contains_only_canonical_named_definitions():
    library = load_root_library(ROOT_FORMULAS)
    texts = set(library.texts())

    assert texts == {
        f"{target} : {value}" for target, value in CANONICAL_DEFINITIONS.items()
    }

    assert "[] = ∞" not in texts
    assert "[][] = [] ⟼ []" not in texts
    assert "{} != []" not in texts


def test_definition_environment_matches_canonical_definition_surface():
    library = load_root_library(ROOT_FORMULAS)
    entries = library.definitions.entries()

    assert set(library.definition_targets()) == set(CANONICAL_DEFINITIONS)
    assert library.definitions.conflicts() == ()
    assert len(entries) == 10

    by_target = {
        format_expression(entry.definition.target): entry
        for entry in entries
    }
    for ordinal, (target, introduction) in enumerate(CANONICAL_DEFINITIONS.items()):
        entry = by_target[target]
        assert entry.identity.scope_path == ()
        assert entry.identity.ordinal == ordinal
        assert format_expression(entry.definition.value) == introduction
        assert isinstance(entry.definition, Definition)
        assert entry.provenance.source_path is not None
        assert entry.provenance.line_no is not None

        opening = open_definition(entry.definition.target, library.definitions)
        assert opening.kind is DefinitionLookupKind.MATCH
        assert opening.definition_id == entry.identity
        assert opening.body is entry.definition.value


def test_square_abit_forms_are_exactly_four_and_infinity_is_not_one():
    library = load_root_library(ROOT_FORMULAS)

    assert set(library.square_abits()) == set(SQUARE_ABIT_FORMS)
    assert set(SQUARE_ABIT_FORMS) == {"([)", "(])", "[1]", "[0]"}
    assert "∞" not in library.square_abits()


def test_every_top_level_root_formula_is_a_definition():
    library = load_root_library(ROOT_FORMULAS)
    assert {formula.kind for formula in library.formulas} == {FormulaKind.DEFINITION}
    assert all(isinstance(formula.ast, Definition) for formula in library.formulas)


def test_colon_inside_round_form_is_not_registered_as_top_level_definition(tmp_path):
    formula_path = tmp_path / "nested_colon.mtc"
    formula_path.write_text("(a : b)\n", encoding="utf-8")

    library = load_root_library(formula_path)

    assert library.formulas[0].kind is FormulaKind.EXPRESSION
    assert isinstance(library.formulas[0].ast, RoundForm)
    assert isinstance(library.formulas[0].ast.content, Definition)
    assert library.definitions.entries() == ()


def test_literal_square_abit_definitions_keep_canonical_text():
    library = load_root_library(ROOT_FORMULAS)
    by_target = {
        format_expression(entry.definition.target): entry
        for entry in library.definitions.entries()
    }

    assert format_expression(by_target["([)"].definition.value) == "(♀∞)"
    assert format_expression(by_target["(])"].definition.value) == "(∞♂)"


def test_root_library_validates():
    result = validate_root_library(ROOT_FORMULAS)

    assert result.is_valid, result.messages
    assert result.status == "valid"


def test_duplicate_definitions_are_reported(tmp_path):
    formula_path = tmp_path / "duplicate_defs.mtc"
    formula_path.write_text(
        "∞ : {◁ = ∞, ▷ = ∞}\n∞ : []\n",
        encoding="utf-8",
    )

    result = validate_root_library(formula_path)

    assert not result.is_valid
    assert any("Повторное введение различия" in message for message in result.messages)


def test_non_addressable_root_definition_is_reported(tmp_path):
    formula_path = tmp_path / "non_addressable.mtc"
    formula_path.write_text("[] : a\n", encoding="utf-8")

    result = validate_root_library(formula_path)

    assert not result.is_valid
    assert any("Неадресуемая левая часть" in message for message in result.messages)


def test_parser_errors_are_aggregated_with_source_location(tmp_path):
    formula_path = tmp_path / "invalid.mtc"
    formula_path.write_text("{[]\n", encoding="utf-8")

    result = validate_root_library(formula_path)

    assert not result.is_valid
    assert any("invalid.mtc:1:3" in message for message in result.messages)
