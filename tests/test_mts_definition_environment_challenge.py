"""Non-normative executable challenge for DefinitionEnvironment v0.3."""

from dataclasses import dataclass, fields, is_dataclass
import inspect
import json
from pathlib import Path

import pytest

from core.mtc_ast import (
    ContextPronoun,
    Definition,
    Expression,
    Form,
    SquareForm,
    Symbol,
    format_expression,
    structural_key,
)
from core.mtc_interpreter import ContextFrame, InterpretationError, interpret_constraints
from core.mtc_parser import parse_formula
from core.root_library import load_root_library

ROOT = Path(__file__).parents[1]
CHALLENGE = ROOT / "contracts" / "mts-definition-environment-challenge-v0.3.json"
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.2.json"
MTS_PROOF = ROOT / "contracts" / "mts-proof-v0.2.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


@dataclass(frozen=True, order=True)
class ScopeId:
    path: tuple[int, ...]


@dataclass(frozen=True, order=True)
class DefinitionId:
    scope: ScopeId
    ordinal: int


@dataclass(frozen=True)
class Entry:
    identity: DefinitionId
    definition: Definition


class NonAddressableTarget(ValueError):
    pass


def _contains_non_addressable_target(value: object) -> bool:
    if isinstance(value, ContextPronoun):
        return True
    if isinstance(value, SquareForm) and value.content is None:
        return True
    if isinstance(value, tuple):
        return any(_contains_non_addressable_target(item) for item in value)
    if isinstance(value, Expression) and is_dataclass(value):
        for item in fields(value):
            if item.name == "span":
                continue
            if _contains_non_addressable_target(getattr(value, item.name)):
                return True
    return False


def target_key(target: Form) -> object:
    """Challenge-only lookup key for addressable closed target forms."""

    if _contains_non_addressable_target(target):
        raise NonAddressableTarget(
            "definition target contains occurrence-local or deictic form"
        )
    return structural_key(target)


class Environment:
    def __init__(self, scope: ScopeId, parent: "Environment | None" = None):
        self.scope = scope
        self.parent = parent
        self.entries: dict[object, Entry] = {}

    def child(self, index: int) -> "Environment":
        return Environment(ScopeId(self.scope.path + (index,)), self)

    def register(self, source: str) -> Entry:
        return self.register_definition(definition(source))

    def register_definition(self, value: Definition) -> Entry:
        key = target_key(value.target)
        if key in self.entries:
            raise ValueError("same-scope conflict")
        entry = Entry(DefinitionId(self.scope, len(self.entries)), value)
        self.entries[key] = entry
        return entry

    def lookup(self, target: Form) -> Entry | None:
        key = target_key(target)
        current: Environment | None = self
        while current is not None:
            if key in current.entries:
                return current.entries[key]
            current = current.parent
        return None


def definition(source: str) -> Definition:
    value = parse_formula(source)
    assert isinstance(value, Definition)
    return value


def target(name: str) -> Form:
    return definition(f"{name} : x").target


def walk(env: Environment, start: str) -> tuple[list[str], list[str], list[str]]:
    """Challenge-only Symbol-RHS graph walk; not general body resolution."""

    first = env.lookup(target(start))
    if first is None:
        return [], [], []

    visited: list[str] = []
    active: list[DefinitionId] = []
    done: set[DefinitionId] = set()
    cycles: list[str] = []
    external: list[str] = []

    def visit(entry: Entry) -> None:
        visited.append(format_expression(entry.definition.target))
        active.append(entry.identity)
        body = entry.definition.value
        if isinstance(body, Symbol):
            next_entry = env.lookup(target(body.name))
            if next_entry is None:
                external.append(body.name)
            elif next_entry.identity in active:
                cycles.append(format_expression(next_entry.definition.target))
            elif next_entry.identity not in done:
                visit(next_entry)
        active.pop()
        done.add(entry.identity)

    visit(first)
    return visited, cycles, external


class NoMemory:
    def __getattr__(self, name):
        raise AssertionError(f"unexpected L4 access: {name}")


def test_challenge_is_non_normative_unlinked_and_records_addressability_finding():
    data = json.loads(CHALLENGE.read_text(encoding="utf-8"))
    assert data["status"] == "candidate-challenge"
    assert data["productionInterpreterChangeAllowed"] is False
    assert data["challengeFinding"]["genericStructuralKeyForEveryFormIsSufficient"] is False
    assert data["challengeFinding"]["acceptedProductionRule"] is False
    assert "mts-definition-environment-challenge" not in MTS_CONTRACT.read_text(
        encoding="utf-8"
    )
    assert "mts-definition-environment-challenge" not in MTS_PROOF.read_text(
        encoding="utf-8"
    )


def test_root_has_ten_distinct_definition_ids_and_all_targets_are_addressable():
    library = load_root_library(ROOT_PROGRAM)
    env = Environment(ScopeId(()))
    ids = []
    for formula in library.formulas:
        assert isinstance(formula.ast, Definition)
        ids.append(env.register_definition(formula.ast).identity)
    assert len(ids) == len(set(ids)) == 10


def test_conflict_shadowing_parent_fallback_and_context_independence():
    root = Environment(ScopeId(()))
    root_a = root.register("a : b")
    with pytest.raises(ValueError, match="same-scope conflict"):
        root.register("a : c")

    child = root.child(0)
    assert child.lookup(target("a")) == root_a
    child_a = child.register("a : c")
    assert child_a.identity != root_a.identity
    assert child.lookup(target("a")) == child_a

    assert set(inspect.signature(Environment.lookup).parameters) == {"self", "target"}
    frames = [
        ContextFrame(1, 2),
        ContextFrame(10, 20),
        ContextFrame(100, 200, ContextFrame(1, 2)),
    ]
    assert [child.lookup(target("a")) for _frame in frames] == [child_a] * 3


def test_source_span_is_provenance_not_addressable_target_identity():
    first = definition("a : b")
    shifted = definition("  a : c")
    assert first.target.span != shifted.target.span
    assert structural_key(first.target) == structural_key(shifted.target)

    env = Environment(ScopeId(()))
    entry = env.register_definition(first)
    assert env.lookup(shifted.target) == entry


def test_anonymous_occurrence_shape_cannot_become_a_global_definition_address():
    first = definition("[] : a")
    shifted = definition("  [] : b")

    assert first.target.span != shifted.target.span
    assert structural_key(first.target) == structural_key(shifted.target)

    env = Environment(ScopeId(()))
    with pytest.raises(NonAddressableTarget, match="occurrence-local or deictic"):
        env.register_definition(first)
    with pytest.raises(NonAddressableTarget, match="occurrence-local or deictic"):
        env.register_definition(shifted)


def test_context_pronoun_target_is_not_silently_promoted_to_global_name():
    env = Environment(ScopeId(()))
    with pytest.raises(NonAddressableTarget, match="occurrence-local or deictic"):
        env.register("◁ : a")
    with pytest.raises(NonAddressableTarget, match="occurrence-local or deictic"):
        env.register("▷ : b")


def test_self_mutual_chain_and_missing_are_finite_and_deterministic():
    cases = [
        (["a : a"], "a", (["a"], ["a"], [])),
        (["a : b", "b : a"], "a", (["a", "b"], ["a"], [])),
        (["a : b", "b : c", "c : d"], "a", (["a", "b", "c"], [], ["d"])),
        (["a : b"], "z", ([], [], [])),
    ]
    for sources, start, expected in cases:
        env = Environment(ScopeId(()))
        ids = [env.register(source).identity for source in sources]
        assert walk(env, start) == expected
        assert walk(env, start) == expected

        replay = Environment(ScopeId(()))
        replay_ids = [replay.register(source).identity for source in sources]
        assert replay_ids == ids
        assert walk(replay, start) == expected


def test_lookup_is_not_production_definition_execution_or_l4_effect():
    expr = definition("a : b")
    with pytest.raises(InterpretationError, match="Definition"):
        interpret_constraints(
            expr,
            ContextFrame(1, 2),
            NoMemory(),
            symbols={"a": 1, "b": 2},
        )
