"""Executable challenge tests for contextual formal-notation interpretation."""

from dataclasses import dataclass

from core.context_interpreter_candidate import (
    ContextFrame,
    MemoryView,
    interpret_constraints,
    resolve_context_pronoun,
)
from core.mtc_ast import BundleForm, ContextPronoun, Definition
from core.mtc_parser import parse_formula


@dataclass
class FakeMemory(MemoryView):
    links: dict[int, tuple[int, int]]
    reads: int = 0

    def poles(self, link: int) -> tuple[int, int]:
        self.reads += 1
        return self.links[link]

    def find_link(self, start: int, end: int) -> int | None:
        self.reads += 1
        for link, poles in self.links.items():
            if poles == (start, end):
                return link
        return None

    def find_start_projection(self, form: int) -> int | None:
        self.reads += 1
        for link, poles in self.links.items():
            if poles == (link, form):
                return link
        return None

    def find_end_projection(self, form: int) -> int | None:
        self.reads += 1
        for link, poles in self.links.items():
            if poles == (form, link):
                return link
        return None


def equality_memory() -> FakeMemory:
    return FakeMemory(
        {
            # Minimal closed primitive links.
            1: (1, 1),
            2: (2, 2),
            3: (3, 3),
            # Two compared forms. Canonical memory does not store a second Link
            # with the same pair: equal form identity is the same LinkRef.
            10: (1, 2),
            12: (1, 3),
            # Self-closed start/end forms used by ♀F and F♂.
            110: (110, 10),
            112: (112, 12),
            210: (10, 210),
            212: (12, 212),
            # Context links whose poles are the compared forms.
            20: (10, 10),
            21: (10, 12),
            22: (10, 12),
            # Existing ordinary link for LinkForm lookup test.
            30: (2, 3),
        }
    )


def parse_equality_body() -> BundleForm:
    ast = parse_formula("(=) : {♀$[ = ♀$], $[♂ = $]♂}")
    assert isinstance(ast, Definition)
    assert isinstance(ast.value, BundleForm)
    return ast.value


def test_equality_context_compares_corresponding_forms_without_named_variables():
    memory = equality_memory()
    result = interpret_constraints(
        parse_equality_body(),
        ContextFrame(link=20),
        memory,
    )

    assert result.success
    assert result.holes == ()
    assert result.aliases == ()
    assert "context:$[->10" in result.trace
    assert "context:$]->10" in result.trace
    assert "start:10->110" in result.trace
    assert "end:10->210" in result.trace


def test_equality_context_detects_structurally_different_operand():
    memory = equality_memory()
    result = interpret_constraints(
        parse_equality_body(),
        ContextFrame(link=21),
        memory,
    )

    assert not result.success
    assert result.holes == ()


def test_each_empty_square_occurrence_is_an_independent_local_hole():
    memory = equality_memory()
    expression = parse_formula("{[] = $[, [] = $]}")
    result = interpret_constraints(expression, ContextFrame(link=22), memory)

    assert result.success
    assert len(result.holes) == 2
    values = tuple(value for _, value in result.holes)
    assert values == (10, 12)


def test_identical_empty_form_glyphs_do_not_bind_globally_between_calls():
    memory = equality_memory()

    first = interpret_constraints(
        parse_formula("[] = $["),
        ContextFrame(link=22),
        memory,
    )
    second = interpret_constraints(
        parse_formula("[] = $]"),
        ContextFrame(link=22),
        memory,
    )

    assert first.success and second.success
    assert tuple(value for _, value in first.holes) == (10,)
    assert tuple(value for _, value in second.holes) == (12,)


def test_parent_context_access_is_structural_and_independent_of_names():
    memory = equality_memory()
    parent = ContextFrame(link=22)
    child = ContextFrame(link=10, parent=parent)

    current_start = parse_formula("$[")
    parent_end = parse_formula("$$]")
    assert isinstance(current_start, ContextPronoun)
    assert isinstance(parent_end, ContextPronoun)

    assert resolve_context_pronoun(current_start, child, memory) == 1
    assert resolve_context_pronoun(parent_end, child, memory) == 12


def test_interpretation_only_reads_memory_and_returns_substitution_plan():
    memory = equality_memory()
    before = dict(memory.links)

    result = interpret_constraints(
        parse_formula("{[] = $[, [] = $]}"),
        ContextFrame(link=22),
        memory,
    )

    assert result.success
    assert memory.links == before
    assert memory.reads > 0


def test_link_constructor_resolves_existing_relation_without_realize():
    memory = equality_memory()
    expression = parse_formula("30 = 2 ⟼ 3")
    result = interpret_constraints(
        expression,
        ContextFrame(link=20),
        memory,
        symbols={"30": 30, "2": 2, "3": 3},
    )

    assert result.success
    assert "link:2,3->30" in result.trace


def test_two_anonymous_holes_can_be_locally_aliased_without_becoming_global():
    memory = equality_memory()
    result = interpret_constraints(
        parse_formula("[] = []"),
        ContextFrame(link=20),
        memory,
    )

    assert result.success
    assert result.holes == ()
    assert len(result.aliases) == 1


def test_two_pronouns_make_old_cyclic_slot_numbering_unnecessary_for_equality():
    source = "(=) : {♀$[ = ♀$], $[♂ = $]♂}"

    assert "[]₁" not in source
    assert "[]₂" not in source
    assert all(name not in source for name in (" a ", " b ", " x ", " y "))
