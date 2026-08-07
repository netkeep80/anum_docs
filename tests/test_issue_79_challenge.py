"""Regression challenges for the global-collapse blocker discovered in #79."""

from dataclasses import dataclass

import pytest

from core.context_interpreter_candidate import (
    ContextFrame,
    InterpretationError,
    MemoryView,
    interpret_constraints,
)
from core.mtc_ast import LinkForm, SquareForm, structural_key
from core.mtc_parser import parse_formula


@dataclass
class ChallengeMemory(MemoryView):
    links: dict[int, tuple[int, int]]

    def find_link(self, start: int, end: int) -> int | None:
        for link, poles in self.links.items():
            if poles == (start, end):
                return link
        return None

    def find_start_projection(self, form: int) -> int | None:
        for link, poles in self.links.items():
            if poles == (link, form):
                return link
        return None

    def find_end_projection(self, form: int) -> int | None:
        for link, poles in self.links.items():
            if poles == (form, link):
                return link
        return None


def memory() -> ChallengeMemory:
    return ChallengeMemory(
        {
            1: (1, 1),  # ∞ carrier
            2: (2, 2),
            3: (3, 3),
            10: (2, 3),
        }
    )


def test_old_empty_equals_root_statement_is_local_binding_not_global_rewrite():
    first = interpret_constraints(
        parse_formula("[] = ∞"),
        ContextFrame(start=2, end=3),
        memory(),
        symbols={"∞": 1},
    )

    assert first.success
    assert tuple(value for _, value in first.holes) == (1,)

    # A new parse/interpretation has a fresh anonymous occurrence. Nothing from
    # the previous equality is a global rewrite rule for the glyph `[]`.
    second = interpret_constraints(
        parse_formula("[] = $["),
        ContextFrame(start=2, end=3),
        memory(),
    )

    assert second.success
    assert tuple(value for _, value in second.holes) == (2,)


def test_two_empty_glyphs_are_two_occurrences_before_any_binding():
    ast = parse_formula("[] = []")
    assert isinstance(ast.left, SquareForm)
    assert isinstance(ast.right, SquareForm)
    assert ast.left.span != ast.right.span

    result = interpret_constraints(
        ast,
        ContextFrame(start=2, end=3),
        memory(),
    )
    assert result.success
    assert len(result.aliases) == 1
    assert result.holes == ()


def test_semantic_occurrence_ids_do_not_depend_on_source_offsets_or_whitespace():
    compact = interpret_constraints(
        parse_formula("{[]=$[,[]=$]}"),
        ContextFrame(start=2, end=3),
        memory(),
    )
    spaced = interpret_constraints(
        parse_formula("{  [] = $[ ,   [] = $]  }"),
        ContextFrame(start=2, end=3),
        memory(),
    )

    assert compact.success and spaced.success
    assert compact.holes == spaced.holes
    assert tuple(value for _, value in compact.holes) == (2, 3)


def test_left_and_right_association_remain_structurally_distinct_queries():
    left = parse_formula("[] ⟼ [] ⟼ []")
    right = parse_formula("[] ⟼ ([] ⟼ [])")

    assert isinstance(left, LinkForm)
    assert isinstance(left.left, LinkForm)
    assert isinstance(right, LinkForm)
    assert isinstance(right.right, LinkForm)
    assert structural_key(left) != structural_key(right)


def test_unbound_anonymous_poles_are_not_silently_materialized_to_resolve_link():
    with pytest.raises(InterpretationError, match="анонимной формы"):
        interpret_constraints(
            parse_formula("10 = [] ⟼ []"),
            ContextFrame(start=2, end=3),
            memory(),
            symbols={"10": 10},
        )


def test_explicit_grounded_link_query_can_resolve_without_mutation():
    store = memory()
    before = dict(store.links)

    result = interpret_constraints(
        parse_formula("10 = 2 ⟼ 3"),
        ContextFrame(start=2, end=3),
        store,
        symbols={"10": 10, "2": 2, "3": 3},
    )

    assert result.success
    assert store.links == before
