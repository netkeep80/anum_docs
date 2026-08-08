"""Focused unit tests for the canonical MTS v0.3 definition environment."""

import pytest

from core.mtc_ast import Definition, RoundForm, SquareForm
from core.mtc_definitions import (
    DefinitionEnvironment,
    DefinitionLookupKind,
    DefinitionRegistrationKind,
    definition_target_key,
    open_definition,
)
from core.mtc_parser import parse_formula


def definition(source: str) -> Definition:
    value = parse_formula(source)
    assert isinstance(value, Definition)
    return value


def test_empty_round_root_form_is_addressable_but_empty_square_is_not():
    round_definition = definition("() : a")
    square_definition = definition("[] : a")

    assert isinstance(round_definition.target, RoundForm)
    assert round_definition.target.content is None
    assert definition_target_key(round_definition.target) is not None

    assert isinstance(square_definition.target, SquareForm)
    assert square_definition.target.content is None
    assert definition_target_key(square_definition.target) is None


def test_root_scope_path_is_uniquely_empty():
    root = DefinitionEnvironment()
    assert root.scope_path == ()
    assert root.parent is None

    with pytest.raises(ValueError, match="root definition scope path must be empty"):
        DefinitionEnvironment((7,))


def test_child_index_denotes_one_lexical_scope_object_per_parent():
    root = DefinitionEnvironment()
    child = root.child(0)

    assert root.child(0) is child
    assert child.scope_path == (0,)
    assert child.parent is root

    with pytest.raises(ValueError, match="already exists"):
        DefinitionEnvironment((0,), root)


def test_different_sibling_indices_produce_distinct_definition_id_spaces():
    root = DefinitionEnvironment()
    left = root.child(0)
    right = root.child(1)

    left_registration = left.register(definition("a : left"))
    right_registration = right.register(definition("a : right"))
    assert left_registration.entry is not None
    assert right_registration.entry is not None
    assert left_registration.entry.identity.scope_path == (0,)
    assert right_registration.entry.identity.scope_path == (1,)
    assert left_registration.entry.identity != right_registration.entry.identity


def test_direct_child_scope_must_extend_parent_by_exactly_one_index():
    root = DefinitionEnvironment()

    with pytest.raises(ValueError, match="extend parent"):
        DefinitionEnvironment((), root)
    with pytest.raises(ValueError, match="extend parent"):
        DefinitionEnvironment((0, 1), root)
    with pytest.raises(ValueError, match="non-negative"):
        root.child(-1)


def test_nearest_scope_conflict_blocks_parent_fallback():
    root = DefinitionEnvironment()
    assert root.register(definition("a : root")).kind is DefinitionRegistrationKind.REGISTERED

    child = root.child(0)
    assert child.register(definition("a : first")).kind is DefinitionRegistrationKind.REGISTERED
    assert child.register(definition("a : second")).kind is DefinitionRegistrationKind.CONFLICT

    result = open_definition(definition("a : query").target, child)
    assert result.kind is DefinitionLookupKind.CONFLICT
    assert result.body is None
    assert result.definition_id is None


def test_non_addressable_registration_does_not_consume_definition_ordinal():
    environment = DefinitionEnvironment()
    assert environment.register(definition("[] : ignored")).kind is DefinitionRegistrationKind.NON_ADDRESSABLE

    registered = environment.register(definition("a : value"))
    assert registered.entry is not None
    assert registered.entry.identity.ordinal == 0
