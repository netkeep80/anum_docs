"""Load the canonical ``.mtc`` root library through the typed L2 parser."""

from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from core.mtc_ast import Definition, Equality, Expression, Inequality, format_expression
from core.mtc_parser import ParseDiagnostic, parse_formula, parse_formula_result
from core.reference_model import StatementStatus


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
class DifferenceEntry:
    """Difference introduced by a top-level ``target : expression``."""

    symbol: str
    introduction: str
    status: StatementStatus
    source_formula: RootFormula


class DifferenceRegistry:
    """Registry built only from typed top-level ``Definition`` nodes."""

    def __init__(self):
        self._entries: dict[str, DifferenceEntry] = {}
        self._duplicates: list[
            tuple[str, DifferenceEntry, DifferenceEntry]
        ] = []

    def register(self, entry: DifferenceEntry) -> None:
        existing = self._entries.get(entry.symbol)
        if existing is not None:
            self._duplicates.append((entry.symbol, existing, entry))
            return
        self._entries[entry.symbol] = entry

    def lookup(self, symbol: str) -> DifferenceEntry | None:
        return self._entries.get(symbol)

    def symbols(self) -> list[str]:
        return list(self._entries)

    def entries(self) -> list[DifferenceEntry]:
        return list(self._entries.values())

    def duplicates(self) -> list[tuple[str, DifferenceEntry, DifferenceEntry]]:
        return list(self._duplicates)


@dataclass(frozen=True)
class RootLibrary:
    """Loaded canonical root-library surface."""

    formulas: tuple[RootFormula, ...]
    registry: DifferenceRegistry

    def texts(self) -> list[str]:
        return [formula.text for formula in self.formulas]

    def square_abits(self) -> list[str]:
        """Return the four L2 forms that introduce square abits."""

        return [
            symbol
            for symbol in SQUARE_ABIT_FORMS
            if self.registry.lookup(symbol) is not None
        ]


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
        registry=build_difference_registry(formula_tuple),
    )


def build_difference_registry(
    formulas: tuple[RootFormula, ...] | list[RootFormula],
) -> DifferenceRegistry:
    """Build the registry from actual ``Definition`` AST nodes only."""

    registry = DifferenceRegistry()
    for formula in formulas:
        if not isinstance(formula.ast, Definition):
            continue

        registry.register(
            DifferenceEntry(
                symbol=format_expression(formula.ast.target),
                introduction=format_expression(formula.ast.value),
                status=StatementStatus.DEFINITION,
                source_formula=formula,
            )
        )

    return registry


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
