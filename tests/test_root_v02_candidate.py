"""Challenges for the minimal non-normative MTS root v0.2 candidate."""

from pathlib import Path

from core.mtc_ast import (
    BundleForm,
    ContextPronoun,
    Definition,
    EndProjection,
    Equality,
    Expression,
    Form,
    Inequality,
    Inversion,
    LinkForm,
    RoundForm,
    Sequence,
    SquareForm,
    StartProjection,
    structural_key,
)
from core.mtc_parser import parse_formula_result
from core.root_library import FormulaKind, load_root_library


CANDIDATE = Path(__file__).with_name("fixtures") / "mtc_root_v02_candidate.mtc"


def candidate_formulas() -> list[str]:
    return [
        line.strip()
        for line in CANDIDATE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def candidate_asts() -> list[Expression]:
    results = [parse_formula_result(source) for source in candidate_formulas()]
    assert all(result.is_valid for result in results), [
        (result.text, result.diagnostics) for result in results if not result.is_valid
    ]
    return [result.ast for result in results if result.ast is not None]


def walk(expression: Expression):
    yield expression

    if isinstance(expression, (RoundForm, SquareForm)):
        if expression.content is not None:
            yield from walk(expression.content)
        return

    if isinstance(expression, BundleForm):
        for item in expression.items:
            yield from walk(item)
        return

    if isinstance(expression, Sequence):
        for item in expression.items:
            yield from walk(item)
        return

    if isinstance(expression, (StartProjection, EndProjection, Inversion)):
        yield from walk(expression.value)
        return

    if isinstance(expression, (LinkForm, Equality, Inequality)):
        yield from walk(expression.left)
        yield from walk(expression.right)
        return

    if isinstance(expression, Definition):
        yield from walk(expression.target)
        yield from walk(expression.value)


def test_candidate_root_is_only_ten_named_semantic_definitions():
    formulas = candidate_formulas()
    asts = candidate_asts()

    assert len(formulas) == 10
    assert len(asts) == 10
    assert all(isinstance(ast, Definition) for ast in asts)


def test_candidate_root_uses_existing_canonical_root_library_without_special_path():
    library = load_root_library(CANDIDATE)

    assert len(library.formulas) == 10
    assert all(formula.is_valid for formula in library.formulas)
    assert all(formula.kind is FormulaKind.DEFINITION for formula in library.formulas)
    assert len(library.registry.entries()) == 10
    assert library.registry.duplicates() == []


def test_candidate_root_targets_are_unique():
    definitions = [ast for ast in candidate_asts() if isinstance(ast, Definition)]
    keys = [structural_key(definition.target) for definition in definitions]

    assert len(keys) == len(set(keys))


def test_candidate_root_contains_no_anonymous_empty_holes():
    # `[]` is a query-time anonymous form in C3. The closed root program itself
    # therefore must not depend on accidental anonymous occurrences.
    anonymous = [
        node
        for ast in candidate_asts()
        for node in walk(ast)
        if isinstance(node, SquareForm) and node.content is None
    ]

    assert anonymous == []


def test_candidate_root_contains_no_sequence_sugar():
    sequences = [
        node
        for ast in candidate_asts()
        for node in walk(ast)
        if isinstance(node, Sequence)
    ]

    assert sequences == []


def test_aroot_definition_is_contextual_self_closure_not_empty_form_rewrite():
    definition = candidate_asts()[0]
    assert isinstance(definition, Definition)
    assert isinstance(definition.value, BundleForm)
    assert len(definition.value.items) == 2

    for item in definition.value.items:
        assert isinstance(item, Equality)
        assert isinstance(item.left, ContextPronoun)
        assert isinstance(item.right, Form)


def test_equality_definition_uses_only_context_pronouns_for_operand_identity():
    definition = candidate_asts()[-2]
    assert isinstance(definition, Definition)
    assert isinstance(definition.value, BundleForm)

    pronouns = [
        node
        for node in walk(definition.value)
        if isinstance(node, ContextPronoun)
    ]
    assert len(pronouns) == 4
    assert {pronoun.pole.value for pronoun in pronouns} == {"[", "]"}
    assert all(pronoun.up == 0 for pronoun in pronouns)


def test_old_global_empty_equals_root_axiom_is_not_in_candidate():
    text = "\n".join(candidate_formulas())
    assert "[] = ∞" not in text
    assert "∞ = ∞ ⟼ ∞" not in text
    assert "[][] = [] ⟼ []" not in text
