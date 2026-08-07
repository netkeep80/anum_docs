"""Experimental occurrence/slot models for issue #79.

Candidate C1 separates the visible ``[]`` schema from local PatternSlot identity.
Candidate C1a adds one deterministic elaboration hypothesis: every definition
scope has an arity ``n`` and anonymous empty-square occurrences consume a cyclic
positional stream ``1..n, 1..n, ...``.

Nothing in this module is part of the accepted reference model. The point is to
make the hypothesis executable and challengeable before theoretical acceptance.
"""

from dataclasses import dataclass

from core.mtc_ast import (
    BundleForm,
    Definition,
    EndProjection,
    Equality,
    Expression,
    Inequality,
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
    scope: str
    index: int


@dataclass(frozen=True)
class BoundOccurrence:
    ordinal: int
    span: SourceSpan
    slot: PatternSlot


@dataclass(frozen=True)
class CandidateTemplate:
    """Expected slot annotation for one challenge case."""

    name: str
    source: str
    slot_ids: tuple[int, ...]

    def elaborate_expected(self) -> tuple[BoundOccurrence, ...]:
        ast = parse_formula(self.source)
        spans = empty_square_spans(ast)
        _validate_slot_ids(self.name, spans, self.slot_ids)
        return _bind(self.name, spans, self.slot_ids)

    def elaborate_automatic(self) -> tuple[BoundOccurrence, ...]:
        return elaborate_cyclic_positions(self.name, self.source)

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


def elaborate_cyclic_positions(
    scope: str,
    source: str,
) -> tuple[BoundOccurrence, ...]:
    """Apply experimental Candidate C1a to one definition source.

    Arity inference:

    1. If the definition target contains ``[]`` occurrences, each target
       position establishes one slot from left to right.
    2. Otherwise a single equality establishes arity from the placeholders on
       its left side (recursive-equation case such as the associative root).
    3. Otherwise a bundle of binary judgments establishes arity from all
       placeholder occurrences of its first judgment (relation case such as
       ``(=)``).

    Once arity is known, RHS/value occurrences consume a cyclic slot stream.
    Grouping does not reset the stream.
    """

    ast = parse_formula(source)
    if not isinstance(ast, Definition):
        raise ValueError(f"{scope}: cyclic slot elaboration requires Definition")

    target_spans = empty_square_spans(ast.target)
    value_spans = empty_square_spans(ast.value)

    if target_spans:
        arity = len(target_spans)
        target_ids = tuple(range(1, arity + 1))
    else:
        arity = infer_definition_arity(ast.value)
        target_ids = ()

    if not value_spans and not target_spans:
        return ()
    if arity <= 0:
        raise ValueError(f"{scope}: cannot infer positional arity")

    value_ids = tuple((index % arity) + 1 for index in range(len(value_spans)))
    pairs = list(zip(target_spans, target_ids)) + list(zip(value_spans, value_ids))
    pairs.sort(key=lambda item: (item[0].start, item[0].end))

    return tuple(
        BoundOccurrence(
            ordinal=ordinal,
            span=span,
            slot=PatternSlot(scope, slot_id),
        )
        for ordinal, (span, slot_id) in enumerate(pairs, 1)
    )


def infer_definition_arity(value: Expression) -> int:
    """Infer local arity for target-less Candidate C1a definitions."""

    if isinstance(value, (Equality, Inequality)):
        return len(empty_square_spans(value.left))

    if isinstance(value, BundleForm) and value.items:
        first = value.items[0]
        if isinstance(first, (Equality, Inequality)):
            return len(empty_square_spans(first.left)) + len(
                empty_square_spans(first.right)
            )

    return 0


def empty_square_spans(expression: Expression) -> tuple[SourceSpan, ...]:
    spans: list[SourceSpan] = []
    _collect_empty_squares(expression, spans)
    spans.sort(key=lambda span: (span.start, span.end))
    return tuple(spans)


def validate_candidate() -> tuple[str, ...]:
    errors: list[str] = []

    for item in CANDIDATE_TEMPLATES:
        try:
            expected = item.elaborate_expected()
            automatic = item.elaborate_automatic()
        except ValueError as exc:
            errors.append(str(exc))
            continue

        expected_ids = tuple(occurrence.slot.index for occurrence in expected)
        automatic_ids = tuple(occurrence.slot.index for occurrence in automatic)
        if automatic_ids != expected_ids:
            errors.append(
                f"{item.name}: automatic slots {automatic_ids} != expected {expected_ids}"
            )

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

    root_slot = root.elaborate_expected()[0].slot
    pair_slot = pair.elaborate_expected()[0].slot
    if root_slot == pair_slot:
        errors.append("slots from different templates must never bind globally")

    return tuple(errors)


def _validate_slot_ids(
    name: str,
    spans: tuple[SourceSpan, ...],
    slot_ids: tuple[int, ...],
) -> None:
    if len(spans) != len(slot_ids):
        raise ValueError(
            f"{name}: source has {len(spans)} empty-square occurrences, "
            f"annotation has {len(slot_ids)}"
        )
    if slot_ids and set(slot_ids) != set(range(1, max(slot_ids) + 1)):
        raise ValueError(f"{name}: slot IDs must be contiguous from 1")


def _bind(
    scope: str,
    spans: tuple[SourceSpan, ...],
    slot_ids: tuple[int, ...],
) -> tuple[BoundOccurrence, ...]:
    return tuple(
        BoundOccurrence(
            ordinal=ordinal,
            span=span,
            slot=PatternSlot(scope, slot_id),
        )
        for ordinal, (span, slot_id) in enumerate(zip(spans, slot_ids), 1)
    )


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

    if isinstance(expression, (LinkForm, Equality, Inequality)):
        _collect_empty_squares(expression.left, spans)
        _collect_empty_squares(expression.right, spans)
        return

    if isinstance(expression, Definition):
        _collect_empty_squares(expression.target, spans)
        _collect_empty_squares(expression.value, spans)
