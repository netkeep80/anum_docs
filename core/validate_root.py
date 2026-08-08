"""Structural validation of the canonical typed MTS root library."""

from dataclasses import dataclass
from pathlib import Path

from core.mtc_ast import Definition, format_expression
from core.mtc_definitions import definition_target_key
from core.root_library import RootLibrary, SQUARE_ABIT_FORMS, load_root_library


@dataclass(frozen=True)
class RootValidationResult:
    status: str
    messages: tuple[str, ...]
    library: RootLibrary

    @property
    def is_valid(self) -> bool:
        return self.status == "valid"


def validate_root_library(path: str | Path) -> RootValidationResult:
    library = load_root_library(path)
    messages: list[str] = []

    if not library.formulas:
        messages.append("Корневая библиотека не содержит формул")

    for formula in library.formulas:
        for diagnostic in formula.diagnostics:
            messages.append(
                f"{formula.source_path}:{formula.line_no}:"
                f"{diagnostic.span.start}: {diagnostic.message}"
            )
        if isinstance(formula.ast, Definition) and definition_target_key(formula.ast.target) is None:
            messages.append(
                f"Неадресуемая левая часть корневого определения "
                f"{format_expression(formula.ast.target)}: "
                f"{formula.source_path}:{formula.line_no}"
            )

    for conflict in library.definitions.conflicts():
        first = conflict.first.provenance
        second = conflict.duplicate_provenance
        symbol = format_expression(conflict.first.definition.target)
        messages.append(
            f"Повторное введение различия {symbol}: "
            f"{first.source_path}:{first.line_no} и "
            f"{second.source_path}:{second.line_no}"
        )

    targets = set(library.definition_targets())
    required_symbols = ("∞", "()", "([)", "(])", "(⟼)", "(↛)", "[1]", "[0]", "(=)")
    for symbol in required_symbols:
        if symbol not in targets:
            messages.append(f"Не найдено корневое различие: {symbol}")

    square_abits = set(library.square_abits())
    expected_abits = set(SQUARE_ABIT_FORMS)
    if square_abits != expected_abits:
        messages.append(
            f"Квадратные абиты должны быть {sorted(expected_abits)}, "
            f"получено {sorted(square_abits)}"
        )

    return RootValidationResult(
        status="invalid" if messages else "valid",
        messages=tuple(messages),
        library=library,
    )
