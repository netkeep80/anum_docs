"""Experimental occurrence/slot model for issue #79.

This module is deliberately NOT part of the accepted reference model. It makes
Candidate C1 executable: the visible empty square form ``[]`` is a schema, while
individual occurrences inside one definition template may be assigned local
``PatternSlot`` identities.

The missing theoretical decision is the elaboration rule that derives slot IDs
from unannotated source. Until that rule is accepted, templates below are explicit
challenge fixtures rather than normative semantics.
"""

from dataclasses import dataclass

from core.mtc_ast import (
    BundleForm,
    Definition,
    EndProjection,
    Equality,
    Expression,
    Inversion,
    LinkForm,
    RoundForm,
    Sequence,
    SourceSpan,
    SquareForm,
    StartProjection,
)
from core.mtc_parser import parse_formula


@dataclass(frozen=True, order=True)
class PatternSlot:
    """One locally scoped placeholder identity inside a template."""

    scope: str
    index: int


@dataclass(frozen=True)
class BoundOccurrence:
    """One concrete ``[]`` occurrence bound to a local slot."""

    ordinal: int
    span: SourceSpan
    slot: PatternSlot


@dataclass(frozen=True)
class CandidateTemplate:
    """Explicit slot annotation for one current root-template challenge case."""

    name: str
    source: str
    slot_ids: tuple[int, ...]

    def elaborate(self) -> tuple[BoundOccurrence, ...]:
        ast = parse_formula(self.source)
        spans = empty_square_spans(ast)
        if len(spans) != len(self.slot_ids):
            raise ValueError(
                f"{self.name}: source has {len(spans)} empty-square occurrences, "
                f"annotation has {len(self.slot_ids)}"
            )
        if self.slot_ids and set(self.slot_ids) != set(range(1, max(self.slot_ids) + 1)):
            raise ValueError(f"{self.name}: slot IDs must be contiguous from 1")
        return tuple(
            BoundOccurrence(
                ordinal=ordinal,
                span=span,
                slot=PatternSlot(self.name, slot_id),
            )
            for ordinal, (span, slot_id) in enumerate(zip(spans, self.slot_ids), 1)
        )

    @property
    def arity(self) -> int:
        return max(self.slot_ids, default=0)


CANDIDATE_TEMPLATES = (
    CandidateTemplate(
        name="associative-root",
        source="∞ : [] = [] ⟼ []",
        slot_ids=(1, 1, 1),
    ),
    CandidateTemplate(
        name="pair-sequence",
        source="[][] : [] ⟼ []",
        slot_ids=(1, 2, 1, 2),
    ),
    CandidateTemplate(
        name="triple-sequence",
        source="[][][] : ([][]) ⟼ []",
        slot_ids=(1, 2, 3, 1, 2, 3),
    ),
    CandidateTemplate(
        name="grouped-triple",
        source="[]([][]) : [] ⟼ ([][])",
        slot_ids=(1, 2, 3, 1, 2, 3),
    ),
    CandidateTemplate(
        name="equality-meaning",
        source="(=) : {♀[] = ♀[], []♂ = []♂}",
        slot_ids=(1, 2, 1, 2),
    ),
)


def template(name: str) -> CandidateTemplate:
    for item in CANDIDATE_TEMPLATES:
        if item.name == name:
            return item
    raise KeyError(name)


def empty_square_spans(expression: Expression) -> tuple[SourceSpan, ...]:
    """Collect visible ``[]`` AST occurrences in deterministic source order."""

    spans: list[SourceSpan] = []
    _collect_empty_squares(expression, spans)
    spans.sort(key=lambda span: (span.start, span.end))
    return tuple(spans)


def validate_candidate() -> tuple[str, ...]:
    """Check only internal consistency of Candidate C1 annotations."""

    errors: list[str] = []
    for item in CANDIDATE_TEMPLATES:
        try:
            item.elaborate()
        except ValueError as exc:
            errors.append(str(exc))

    root = template("associative-root")
    pair = template("pair-sequence")
    triple = template("triple-sequence")
    equality = template("equality-meaning")

    if root.arity != 1:
        errors.append("associative-root must model one repeated local pattern slot")
    if pair.arity != 2:
        errors.append("pair-sequence must model two positional slots")
    if triple.arity != 3:
        errors.append("triple-sequence must model three positional slots")
    if equality.slot_ids != (1, 2, 1, 2):
        errors.append("equality-meaning must preserve two operand columns")

    root_slot = root.elaborate()[0].slot
    pair_slot = pair.elaborate()[0].slot
    if root_slot == pair_slot:
        errors.append("slots from different templates must never bind globally")

    return tuple(errors)


def _collect_empty_squares(expression: Expression, spans: list[SourceSpan]) -> None:
    if isinstance(expression, SquareForm):
        if expression.content is None:
            spans.append(expression.span)
        else:
            _collect_empty_squares(expression.content, spans)
        return

    if isinstance(expression, RoundForm):
        if expression.content is not None:
            _collect_empty_squares(expression.content, spans)
        return

    if isinstance(expression, BundleForm):
        for item in expression.items:
            _collect_empty_squares(item, spans)
        return

    if isinstance(expression, Sequence):
        for item in expression.items:
            _collect_empty_squares(item, spans)
        return

    if isinstance(expression, (StartProjection, EndProjection, Inversion)):
        _collect_empty_squares(expression.value, spans)
        return

    if isinstance(expression, (LinkForm, Equality)):
        _collect_empty_squares(expression.left, spans)
        _collect_empty_squares(expression.right, spans)
        return

    if isinstance(expression, Definition):
        _collect_empty_squares(expression.target, spans)
        _collect_empty_squares(expression.value, spans)
