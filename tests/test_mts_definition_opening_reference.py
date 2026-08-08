"""Production conformance for accepted MTS definition opening v0.3."""

import inspect
import json
from pathlib import Path

import pytest

from core.mtc_ast import ContextPronoun, Definition, Expression, Form, format_expression
from core.mtc_definitions import (
    DefinitionEnvironment,
    DefinitionLookupKind,
    DefinitionRegistrationKind,
    open_definition,
)
from core.mtc_interpreter import ContextFrame, InterpretationError, interpret_constraints
from core.mtc_parser import parse_formula
from core.root_library import load_root_library


ROOT = Path(__file__).parents[1]
CONTRACT = ROOT / "contracts" / "mts-definition-opening-v0.3.json"
CORPUS = ROOT / "contracts" / "mts-definition-opening-conformance-v0.3.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def contract() -> dict:
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def corpus() -> dict:
    return json.loads(CORPUS.read_text(encoding="utf-8"))


def definition(source: str) -> Definition:
    value = parse_formula(source)
    assert isinstance(value, Definition)
    return value


def query_target(source: str) -> Form:
    return definition(f"{source} : __query__").target


def result_data(target: Form, environment: DefinitionEnvironment) -> dict:
    result = open_definition(target, environment)
    if result.kind is DefinitionLookupKind.MATCH:
        assert result.definition_id is not None
        assert result.body is not None
        return {
            "kind": "match",
            "definitionId": {
                "scopePath": list(result.definition_id.scope_path),
                "ordinal": result.definition_id.ordinal,
            },
            "body": format_expression(result.body),
        }
    return {"kind": result.kind.value}


def build_scenario_environments(
    scenario: dict,
) -> tuple[dict[tuple[int, ...], DefinitionEnvironment], str | None]:
    environments: dict[tuple[int, ...], DefinitionEnvironment] = {}

    for scope in sorted(
        scenario["scopes"], key=lambda item: (len(item["path"]), item["path"])
    ):
        path = tuple(scope["path"])
        parent_path = scope.get("parent")
        parent = environments.get(tuple(parent_path)) if parent_path is not None else None
        environment = DefinitionEnvironment(path, parent)
        environments[path] = environment

        for source in scope["definitions"]:
            registration = environment.register(definition(source))
            if registration.kind is DefinitionRegistrationKind.CONFLICT:
                return environments, "conflict"
            if registration.kind is DefinitionRegistrationKind.NON_ADDRESSABLE:
                return environments, "non-addressable"

    return environments, None


def replay_scenario(scenario: dict) -> dict:
    environments, failure = build_scenario_environments(scenario)
    if failure is not None:
        return {"kind": failure}
    return result_data(
        query_target(scenario["target"]),
        environments[tuple(scenario["lookupScope"])],
    )


def contains_context_pronoun(value: object) -> bool:
    if isinstance(value, ContextPronoun):
        return True
    if isinstance(value, tuple):
        return any(contains_context_pronoun(item) for item in value)
    fields = getattr(value, "__dataclass_fields__", None)
    if isinstance(value, Expression) and fields:
        return any(
            contains_context_pronoun(getattr(value, name))
            for name in fields
            if name != "span"
        )
    return False


class NoMemory:
    def __getattr__(self, name):
        raise AssertionError(f"unexpected L4 access: {name}")


def test_production_root_environment_replays_every_portable_root_vector_exactly():
    library = load_root_library(ROOT_PROGRAM)
    vectors = corpus()["rootOpenings"]

    assert len(library.formulas) == len(library.definitions.entries()) == len(vectors) == 10
    assert library.definitions.conflicts() == ()

    for vector in vectors:
        target = query_target(vector["target"])
        actual = result_data(target, library.definitions)
        assert actual == vector["expected"]

        if vector.get("mustContainUnresolvedContextPronoun"):
            lookup = library.definitions.lookup(target)
            assert lookup.kind is DefinitionLookupKind.MATCH
            assert lookup.entry is not None
            assert contains_context_pronoun(lookup.entry.definition.value)


def test_production_environment_replays_all_custom_positive_and_negative_vectors():
    for scenario in corpus()["scenarios"]:
        assert replay_scenario(scenario) == scenario["expected"], scenario["id"]


def test_one_step_opening_stops_at_exact_returned_body_for_self_and_mutual_recursion():
    scenarios = {
        item["id"]: item
        for item in corpus()["scenarios"]
        if item.get("mustStopAfterOneOpening")
    }
    assert set(scenarios) == {
        "self-one-step",
        "mutual-a-one-step",
        "mutual-b-one-step",
    }

    for scenario in scenarios.values():
        actual = replay_scenario(scenario)
        assert actual == scenario["expected"]
        assert set(actual) == {"kind", "definitionId", "body"}


def test_opening_surface_has_no_context_memory_symbol_binding_or_proof_input():
    assert set(inspect.signature(open_definition).parameters) == {
        "target",
        "environment",
    }
    operation = contract()["operation"]
    assert operation["doesNotTake"] == [
        "ContextFrame",
        "MemoryView",
        "symbol-to-LinkRef bindings",
        "proof state",
    ]
    assert operation["readsL4"] is False
    assert operation["writesL4"] is False
    assert operation["evaluatesBody"] is False
    assert operation["resolvesContextPronouns"] is False


def test_production_opening_does_not_change_interpret_constraints_definition_boundary():
    source = definition("a : b")
    environment = DefinitionEnvironment()
    registration = environment.register(source)
    assert registration.kind is DefinitionRegistrationKind.REGISTERED
    result = open_definition(source.target, environment)
    assert result.kind is DefinitionLookupKind.MATCH
    assert result.body is source.value

    with pytest.raises(InterpretationError, match="Definition"):
        interpret_constraints(
            source,
            ContextFrame(1, 2),
            NoMemory(),
            symbols={"a": 1, "b": 2},
        )


def test_non_addressable_target_is_rejected_before_any_global_lookup_identity():
    environment = DefinitionEnvironment()
    for source in ("[] : a", "◁ : a", "▷ : a"):
        item = definition(source)
        registration = environment.register(item)
        assert registration.kind is DefinitionRegistrationKind.NON_ADDRESSABLE
        result = open_definition(item.target, environment)
        assert result.kind is DefinitionLookupKind.NON_ADDRESSABLE


def test_conflict_in_nearest_scope_blocks_parent_fallback_and_is_not_redefinition():
    root = DefinitionEnvironment()
    assert root.register(definition("a : root")).kind is DefinitionRegistrationKind.REGISTERED

    child = root.child(0)
    first = child.register(definition("a : child1"))
    duplicate = child.register(definition("a : child2"))
    assert first.kind is DefinitionRegistrationKind.REGISTERED
    assert duplicate.kind is DefinitionRegistrationKind.CONFLICT

    result = open_definition(query_target("a"), child)
    assert result.kind is DefinitionLookupKind.CONFLICT
    assert result.body is None
    assert result.definition_id is None


def test_whitespace_and_source_span_do_not_change_closed_target_lookup():
    environment = DefinitionEnvironment()
    first = definition("a : b")
    shifted = definition("   a : c")
    assert first.target.span != shifted.target.span
    registration = environment.register(first)
    assert registration.kind is DefinitionRegistrationKind.REGISTERED

    result = open_definition(shifted.target, environment)
    assert result.kind is DefinitionLookupKind.MATCH
    assert result.definition_id == registration.entry.identity
    assert result.body is first.value
