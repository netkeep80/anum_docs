"""Regression challenges for the global-collapse blocker discovered in #79."""

from dataclasses import dataclass

from core.context_interpreter_candidate import ContextFrame, MemoryView, interpret_constraints
from core.mtc_ast import LinkForm, RoundForm, SquareForm, structural_key
from core.mtc_parser import parse_formula


@dataclass
class ChallengeMemory(MemoryView):
    links: dict[int, tuple[int, int]]

    def poles(self, link: int) -> tuple[int, int]:
        return self.links[link]

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
    return ChallengeMemory({1: (1, 1), 2: (2, 2), 3: (3, 3), 10: (2, 3)})


def test_old_empty_equals_root_statement_is_local_binding_not_global_rewrite():
    first = interpret_constraints(
        parse_formula("[] = ∞"),
        ContextFrame(start=2, end=3),
        memory(),
        symbols={"∞": 1},
    )
    assert first.success
    assert tuple(value for _, value in first.holes) == (1,)

    second = interpret_constraints(
        parse_formula("[] = ◁"),
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

    result = interpret_constraints(ast, ContextFrame(start=2, end=3), memory())
    assert result.success
    assert len(result.aliases) == 1
    assert result.holes == ()


def test_semantic_occurrence_ids_do_not_depend_on_source_offsets_or_whitespace():
    compact = interpret_constraints(
        parse_formula("{[]=◁,[]=▷}"),
        ContextFrame(start=2, end=3),
        memory(),
    )
    spaced = interpret_constraints(
        parse_formula("{  [] = ◁ ,   [] = ▷  }"),
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
    assert isinstance(right.right, RoundForm)
    assert isinstance(right.right.content, LinkForm)
    assert structural_key(left) != structural_key(right)


def test_existing_link_can_be_decomposed_directly_into_two_anonymous_substitutions():
    result = interpret_constraints(
        parse_formula("10 = [] ⟼ []"),
        ContextFrame(start=2, end=3),
        memory(),
        symbols={"10": 10},
    )

    assert result.success
    assert tuple(value for _, value in result.holes) == (2, 3)
    assert "decompose:10->2,3" in result.trace


def test_nested_link_pattern_can_decompose_associative_memory_without_realize():
    store = ChallengeMemory(
        {1: (1, 1), 2: (2, 2), 3: (3, 3), 10: (2, 3), 20: (10, 1)}
    )
    before = dict(store.links)

    result = interpret_constraints(
        parse_formula("20 = ([] ⟼ []) ⟼ []"),
        ContextFrame(start=2, end=3),
        store,
        symbols={"20": 20},
    )

    assert result.success
    assert tuple(value for _, value in result.holes) == (2, 3, 1)
    assert "decompose:20->10,1" in result.trace
    assert "decompose:10->2,3" in result.trace
    assert store.links == before


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
