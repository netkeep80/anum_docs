"""Executable challenges for selected definitions of root v0.2 candidate."""

from dataclasses import dataclass
from pathlib import Path

from core.context_interpreter_candidate import (
    ContextFrame,
    MemoryView,
    interpret_constraints,
)
from core.mtc_ast import BundleForm, Definition, Symbol
from core.mtc_parser import parse_formula


CANDIDATE = Path(__file__).with_name("fixtures") / "mtc_root_v02_candidate.mtc"


@dataclass
class ReadOnlyMemory(MemoryView):
    reads: int = 0

    def find_link(self, start: int, end: int) -> int | None:
        self.reads += 1
        return None

    def find_start_projection(self, form: int) -> int | None:
        self.reads += 1
        return None

    def find_end_projection(self, form: int) -> int | None:
        self.reads += 1
        return None


def definition(target_source: str) -> Definition:
    for line in CANDIDATE.read_text(encoding="utf-8").splitlines():
        source = line.strip()
        if not source or source.startswith("#"):
            continue
        ast = parse_formula(source)
        if isinstance(ast, Definition) and _target_name(ast) == target_source:
            return ast
    raise AssertionError(f"Definition not found: {target_source}")


def _target_name(ast: Definition) -> str | None:
    if isinstance(ast.target, Symbol):
        return ast.target.name
    return None


def test_aroot_rule_accepts_full_self_closure_without_memory_mutation():
    aroot = definition("∞")
    assert isinstance(aroot.value, BundleForm)

    memory = ReadOnlyMemory()
    result = interpret_constraints(
        aroot.value,
        ContextFrame(start=1, end=1),
        memory,
        symbols={"∞": 1},
    )

    assert result.success
    assert result.holes == ()
    assert memory.reads == 0


def test_aroot_rule_rejects_candidate_whose_end_is_not_itself():
    aroot = definition("∞")
    memory = ReadOnlyMemory()

    result = interpret_constraints(
        aroot.value,
        ContextFrame(start=1, end=2),
        memory,
        symbols={"∞": 1},
    )

    assert not result.success
    assert memory.reads == 0


def test_aroot_rule_rejects_candidate_whose_start_is_not_itself():
    aroot = definition("∞")
    memory = ReadOnlyMemory()

    result = interpret_constraints(
        aroot.value,
        ContextFrame(start=2, end=1),
        memory,
        symbols={"∞": 1},
    )

    assert not result.success
    assert memory.reads == 0
