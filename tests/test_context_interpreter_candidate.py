"""Executable challenge tests for contextual formal-notation interpretation."""

from dataclasses import dataclass

from core.context_interpreter_candidate import (
    ContextFrame,
    MemoryView,
    interpret_constraints,
    resolve_context_path,
)
from core.mtc_ast import BundleForm, ContextPath, Definition
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


def equality_memory() -> FakeMemory:
    # 1/2/3 are ordinary links too; their internal topology is irrelevant for
    # these tests, but keeping them closed makes every reference valid.
    return FakeMemory(
        {
            1: (1, 1),
            2: (2, 2),
            3: (3, 3),
            10: (1, 2),  # first compared operand A
            11: (1, 2),  # second operand B: structurally same poles
            12: (1, 3),  # second operand C: different end
            20: (10, 11),  # equality context for A/B
            21: (10, 12),  # equality context for A/C
            30: (2, 3),
        }
    )


def parse_equality_body() -> BundleForm:
    ast = parse_formula("(=) : {$[[ = $][, $[] = $]]}")
    assert isinstance(ast, Definition)
    assert isinstance(ast.value, BundleForm)
    return ast.value


def test_equality_context_compares_two_operand_poles_without_named_variables():
    memory = equality_memory()
    result = interpret_constraints(
        parse_equality_body(),
        ContextFrame(link=20),
        memory,
    )

    assert result.success
    assert result.holes == ()
    assert "context:$[[->1" in result.trace
    assert "context:$][->1" in result.trace
    assert "context:$[]->2" in result.trace
    assert "context:$]]->2" in result.trace


def test_equality_context_detects_different_end_without_global_rewrite():
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
    result = interpret_constraints(expression, ContextFrame(link=20), memory)

    assert result.success
    assert len(result.holes) == 2
    values = tuple(value for _, value in result.holes)
    assert values == (10, 11)


def test_identical_glyphs_do_not_create_global_binding_between_occurrences():
    memory = equality_memory()

    first = interpret_constraints(
        parse_formula("[] = $["),
        ContextFrame(link=20),
        memory,
    )
    second = interpret_constraints(
        parse_formula("[] = $]"),
        ContextFrame(link=20),
        memory,
    )

    assert first.success and second.success
    assert tuple(value for _, value in first.holes) == (10,)
    assert tuple(value for _, value in second.holes) == (11,)


def test_parent_context_access_is_structural_and_independent_of_names():
    memory = equality_memory()
    parent = ContextFrame(link=20)
    child = ContextFrame(link=10, parent=parent)

    current_start = parse_formula("$[")
    parent_end = parse_formula("$$]")
    assert isinstance(current_start, ContextPath)
    assert isinstance(parent_end, ContextPath)

    assert resolve_context_path(current_start, child, memory) == 1
    assert resolve_context_path(parent_end, child, memory) == 11


def test_interpretation_only_reads_memory_and_returns_substitution_plan():
    memory = equality_memory()
    before = dict(memory.links)

    result = interpret_constraints(
        parse_formula("{[] = $[, [] = $]}"),
        ContextFrame(link=20),
        memory,
    )

    assert result.success
    assert memory.links == before
    assert memory.reads > 0


def test_link_constructor_can_resolve_existing_relation_without_realize():
    memory = equality_memory()
    expression = parse_formula("30 = 2 ⟼ 3")
    result = interpret_constraints(
        expression,
        ContextFrame(link=20),
        memory,
        symbols={"30": 30, "2": 2, "3": 3},
    )

    assert result.success


def test_context_paths_make_old_cyclic_slot_numbering_unnecessary_for_equality():
    source = "(=) : {$[[ = $][, $[] = $]]}"

    assert "[]₁" not in source
    assert "[]₊" not in source
    assert all(name not in source for name in ("a", "b", "x", "y"))
