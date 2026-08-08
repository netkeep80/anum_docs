"""Load the canonical ``.mtc`` root library through the typed L2 parser."""

from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from core.mtc_ast import Definition, Equality, Expression, Inequality, format_expression
from core.mtc_definitions import (
    DefinitionEnvironment,
    DefinitionProvenance,
    DefinitionRegistrationKind,
)
from core.mtc_parser import ParseDiagnostic, parse_formula, parse_formula_result


INFINITY_SYMBOL = "∞"
SQUARE_ABIT_FORMS = ("([)", "(])", "[1]", "[0]")


class FormulaKind(Enum):
    """Syntactic top-level category of one root-library expression."""

    DEFINITION = "definition"
    EQUATION = "equation"
    NON_EQUATION = "non_equation"
    EXPRESSION = "expression"


@dataclass(frozen=True)
class RootFormula:
    """One root formula together with source location and its typed AST."""

    text: str
    source_path: str
    line_no: int
    ast: Expression | None
    diagnostics: tuple[ParseDiagnostic, ...]
    kind: FormulaKind

    @property
    def is_valid(self) -> bool:
        return self.ast is not None and not self.diagnostics


@dataclass(frozen=True)
class RootLibrary:
    """Loaded canonical root-library surface."""

    formulas: tuple[RootFormula, ...]
    definitions: DefinitionEnvironment

    def texts(self) -> list[str]:
        return [formula.text for formula in self.formulas]

    def definition_targets(self) -> list[str]:
        return [
            format_expression(entry.definition.target)
            for entry in self.definitions.entries()
        ]

    def square_abits(self) -> list[str]:
        """Return the four L2 forms that introduce square abits."""

        targets = set(self.definition_targets())
        return [symbol for symbol in SQUARE_ABIT_FORMS if symbol in targets]


def load_root_library(path: str | Path) -> RootLibrary:
    """Load all non-comment lines through the single typed L2 parser path."""

    source_path = str(path)
    formulas: list[RootFormula] = []

    with open(path, "r", encoding="utf-8") as source:
        for line_no, raw_line in enumerate(source, 1):
            stripped = raw_line.strip()
            if not stripped or stripped.startswith("#"):
                continue

            parse_result = parse_formula_result(stripped)
            formulas.append(
                RootFormula(
                    text=stripped,
                    source_path=source_path,
                    line_no=line_no,
                    ast=parse_result.ast,
                    diagnostics=parse_result.diagnostics,
                    kind=classify_formula_kind(parse_result.ast),
                )
            )

    formula_tuple = tuple(formulas)
    return RootLibrary(
        formulas=formula_tuple,
        definitions=build_definition_environment(formula_tuple),
    )


def build_definition_environment(
    formulas: tuple[RootFormula, ...] | list[RootFormula],
) -> DefinitionEnvironment:
    """Build the root lexical environment from top-level typed definitions only."""

    environment = DefinitionEnvironment()
    for formula in formulas:
        if not isinstance(formula.ast, Definition):
            continue

        result = environment.register(
            formula.ast,
            provenance=DefinitionProvenance(
                source_path=formula.source_path,
                line_no=formula.line_no,
            ),
        )
        if result.kind is DefinitionRegistrationKind.NON_ADDRESSABLE:
            # Root loading preserves the parsed formula; validation reports the
            # non-addressable introduction as an invalid root definition.
            continue

    return environment


def classify_formula_kind(expression: Expression | str | None) -> FormulaKind:
    """Classify by AST type, never by rescanning top-level operator text."""

    if isinstance(expression, str):
        expression = parse_formula(expression)
    if isinstance(expression, Definition):
        return FormulaKind.DEFINITION
    if isinstance(expression, Equality):
        return FormulaKind.EQUATION
    if isinstance(expression, Inequality):
        return FormulaKind.NON_EQUATION
    return FormulaKind.EXPRESSION
