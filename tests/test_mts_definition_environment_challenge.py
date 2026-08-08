"""Historical environment challenge replayed through the canonical v0.3 core."""

import inspect
import json
from pathlib import Path

import pytest

from core.mtc_ast import Definition, Symbol, format_expression, structural_key
from core.mtc_definitions import (
    DefinitionEnvironment,
    DefinitionId,
    DefinitionLookupKind,
    DefinitionRegistrationKind,
)
from core.mtc_interpreter import ContextFrame, InterpretationError, interpret_constraints
from core.mtc_parser import parse_formula
from core.root_library import load_root_library

ROOT = Path(__file__).parents[1]
CHALLENGE = ROOT / "contracts" / "mts-definition-environment-challenge-v0.3.json"
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.2.json"
MTS_PROOF = ROOT / "contracts" / "mts-proof-v0.2.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def definition(source: str) -> Definition:
    value = parse_formula(source)
    assert isinstance(value, Definition)
    return value


def target(name: str):
    return definition(f"{name} : x").target


def walk(
    environment: DefinitionEnvironment,
    start: str,
) -> tuple[list[str], list[str], list[str]]:
    """Challenge-only Symbol-RHS traversal over canonical environment identities."""

    first_lookup = environment.lookup(target(start))
    if first_lookup.kind is not DefinitionLookupKind.MATCH:
        return [], [], []
    assert first_lookup.entry is not None

    visited: list[str] = []
    active: list[DefinitionId] = []
    done: set[DefinitionId] = set()
    cycles: list[str] = []
    external: list[str] = []

    def visit(entry) -> None:
        visited.append(format_expression(entry.definition.target))
        active.append(entry.identity)
        body = entry.definition.value
        if isinstance(body, Symbol):
            next_lookup = environment.lookup(target(body.name))
            if next_lookup.kind is DefinitionLookupKind.NO_MATCH:
                external.append(body.name)
            elif next_lookup.kind is DefinitionLookupKind.MATCH:
                assert next_lookup.entry is not None
                next_entry = next_lookup.entry
                if next_entry.identity in active:
                    cycles.append(format_expression(next_entry.definition.target))
                elif next_entry.identity not in done:
                    visit(next_entry)
        active.pop()
        done.add(entry.identity)

    visit(first_lookup.entry)
    return visited, cycles, external


class NoMemory:
    def __getattr__(self, name):
        raise AssertionError(f"unexpected L4 access: {name}")


def test_challenge_remains_historical_non_normative_evidence():
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


def test_root_has_ten_distinct_production_definition_ids_and_no_conflicts():
    library = load_root_library(ROOT_PROGRAM)
    entries = library.definitions.entries()
    assert len(entries) == len({entry.identity for entry in entries}) == 10
    assert library.definitions.conflicts() == ()


def test_conflict_shadowing_parent_fallback_and_context_independence():
    root = DefinitionEnvironment()
    root_a = root.register(definition("a : b"))
    assert root_a.entry is not None
    duplicate = root.register(definition("a : c"))
    assert duplicate.kind is DefinitionRegistrationKind.CONFLICT
    assert root.lookup(target("a")).kind is DefinitionLookupKind.CONFLICT

    clean_root = DefinitionEnvironment()
    root_entry = clean_root.register(definition("a : b"))
    assert root_entry.entry is not None
    child = clean_root.child(0)
    assert child.lookup(target("a")).entry == root_entry.entry
    child_a = child.register(definition("a : c"))
    assert child_a.entry is not None
    assert child_a.entry.identity != root_entry.entry.identity
    assert child.lookup(target("a")).entry == child_a.entry

    assert set(inspect.signature(DefinitionEnvironment.lookup).parameters) == {
        "self",
        "target",
    }
    frames = [
        ContextFrame(1, 2),
        ContextFrame(10, 20),
        ContextFrame(100, 200, ContextFrame(1, 2)),
    ]
    assert [child.lookup(target("a")).entry for _frame in frames] == [child_a.entry] * 3


def test_source_span_is_provenance_not_addressable_target_identity():
    first = definition("a : b")
    shifted = definition("  a : c")
    assert first.target.span != shifted.target.span
    assert structural_key(first.target) == structural_key(shifted.target)

    environment = DefinitionEnvironment()
    registration = environment.register(first)
    assert registration.entry is not None
    assert environment.lookup(shifted.target).entry == registration.entry


def test_anonymous_and_context_pronoun_targets_are_not_globalized():
    environment = DefinitionEnvironment()
    anonymous_a = definition("[] : a")
    anonymous_b = definition("  [] : b")
    assert anonymous_a.target.span != anonymous_b.target.span
    assert structural_key(anonymous_a.target) == structural_key(anonymous_b.target)

    for item in (
        anonymous_a,
        anonymous_b,
        definition("◁ : a"),
        definition("▷ : b"),
    ):
        registration = environment.register(item)
        assert registration.kind is DefinitionRegistrationKind.NON_ADDRESSABLE
        assert environment.lookup(item.target).kind is DefinitionLookupKind.NON_ADDRESSABLE


def test_symbol_rhs_self_mutual_chain_and_missing_traversal_is_finite_and_deterministic():
    cases = [
        (["a : a"], "a", (["a"], ["a"], [])),
        (["a : b", "b : a"], "a", (["a", "b"], ["a"], [])),
        (["a : b", "b : c", "c : d"], "a", (["a", "b", "c"], [], ["d"])),
        (["a : b"], "z", ([], [], [])),
    ]
    for sources, start, expected in cases:
        environment = DefinitionEnvironment()
        ids = []
        for source in sources:
            registration = environment.register(definition(source))
            assert registration.entry is not None
            ids.append(registration.entry.identity)
        assert walk(environment, start) == expected
        assert walk(environment, start) == expected

        replay = DefinitionEnvironment()
        replay_ids = []
        for source in sources:
            registration = replay.register(definition(source))
            assert registration.entry is not None
            replay_ids.append(registration.entry.identity)
        assert replay_ids == ids
        assert walk(replay, start) == expected


def test_definition_opening_does_not_turn_into_interpretation_or_l4_effect():
    expr = definition("a : b")
    with pytest.raises(InterpretationError, match="Definition"):
        interpret_constraints(
            expr,
            ContextFrame(1, 2),
            NoMemory(),
            symbols={"a": 1, "b": 2},
        )
