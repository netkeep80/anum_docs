"""Historical opening decision evidence replayed through the canonical v0.3 core."""

from dataclasses import fields, is_dataclass
import inspect
import json
from pathlib import Path

import pytest

from core.mtc_ast import BundleForm, ContextPronoun, Definition, Expression, Symbol, format_expression
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
DECISION = ROOT / "contracts" / "mts-definition-opening-decision-v0.3.json"
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.2.json"
MTS_PROOF = ROOT / "contracts" / "mts-proof-v0.2.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


def decision() -> dict:
    return json.loads(DECISION.read_text(encoding="utf-8"))


def definition(source: str) -> Definition:
    value = parse_formula(source)
    assert isinstance(value, Definition)
    return value


def contains_node(value: object, node_type: type) -> bool:
    if isinstance(value, node_type):
        return True
    if isinstance(value, tuple):
        return any(contains_node(item, node_type) for item in value)
    if isinstance(value, Expression) and is_dataclass(value):
        return any(
            contains_node(getattr(value, item.name), node_type)
            for item in fields(value)
            if item.name != "span"
        )
    return False


class NoMemory:
    def __getattr__(self, name):
        raise AssertionError(f"unexpected L4 access: {name}")


def test_decision_remains_historical_non_normative_evidence():
    data = decision()
    models = {model["id"]: model for model in data["models"]}
    mts_text = MTS_CONTRACT.read_text(encoding="utf-8")
    proof_text = MTS_PROOF.read_text(encoding="utf-8")

    assert data["schema"] == "mts-definition-opening-decision/v0.3"
    assert data["status"] == "candidate-decision"
    assert data["acceptedContractLinkAllowed"] is False
    assert data["productionInterpreterChangeAllowed"] is False
    assert data["proofRuleAccepted"] is False
    assert models["A"]["verdict"] == "preferred-candidate"
    assert all(model["accepted"] is False for model in models.values())
    assert all(models[item]["verdict"].startswith("reject") for item in "BCDE")
    assert "mts-definition-opening/v0.3" not in mts_text
    assert "mts-definition-opening/v0.3" not in proof_text


def test_all_ten_root_definitions_open_once_through_canonical_core():
    library = load_root_library(ROOT_PROGRAM)
    assert len(library.definitions.entries()) == 10

    for formula in library.formulas:
        assert isinstance(formula.ast, Definition)
        result = open_definition(formula.ast.target, library.definitions)
        assert result.kind is DefinitionLookupKind.MATCH
        assert result.body is formula.ast.value
        assert format_expression(result.body) == format_expression(formula.ast.value)


def test_infinity_opening_preserves_context_pronouns_without_resolving_them():
    library = load_root_library(ROOT_PROGRAM)
    infinity = next(
        formula.ast
        for formula in library.formulas
        if isinstance(formula.ast, Definition)
        and format_expression(formula.ast.target) == "∞"
    )
    result = open_definition(infinity.target, library.definitions)
    assert result.kind is DefinitionLookupKind.MATCH
    assert isinstance(result.body, BundleForm)
    assert contains_node(result.body, ContextPronoun)

    boundary = decision()["contextBoundary"]
    assert boundary["openingResolvesContextPronouns"] is False
    assert boundary["openingEvaluatesBody"] is False
    assert boundary["laterInterpretationIsPartOfOpening"] is False


def test_form_and_constraint_bundle_rhs_are_returned_without_evaluation():
    environment = DefinitionEnvironment()
    form_definition = definition("a : b")
    bundle_definition = definition("c : {◁ = c, ▷ = c}")
    assert environment.register(form_definition).kind is DefinitionRegistrationKind.REGISTERED
    assert environment.register(bundle_definition).kind is DefinitionRegistrationKind.REGISTERED

    form_result = open_definition(form_definition.target, environment)
    bundle_result = open_definition(bundle_definition.target, environment)
    assert isinstance(form_result.body, Symbol) and form_result.body.name == "b"
    assert isinstance(bundle_result.body, BundleForm)
    assert contains_node(bundle_result.body, ContextPronoun)


def test_opening_has_no_context_memory_symbols_or_proof_state_inputs():
    assert set(inspect.signature(open_definition).parameters) == {
        "target",
        "environment",
    }
    operation = decision()["preferredOperation"]
    assert operation["doesNotTake"] == [
        "ContextFrame",
        "MemoryView",
        "symbol-to-LinkRef bindings",
        "proof state",
    ]
    assert operation["readsL4"] is False
    assert operation["mutatesL4"] is False


def test_self_and_mutual_definitions_stop_after_exactly_one_opening():
    environment = DefinitionEnvironment()
    definitions = [definition("a : a"), definition("b : c"), definition("c : b")]
    for item in definitions:
        assert environment.register(item).kind is DefinitionRegistrationKind.REGISTERED

    expected = {"a": "a", "b": "c", "c": "b"}
    for item in definitions:
        result = open_definition(item.target, environment)
        assert result.kind is DefinitionLookupKind.MATCH
        assert isinstance(result.body, Symbol)
        assert result.body.name == expected[format_expression(item.target)]

    assert decision()["recursionBoundary"]["singleStepNeedsCycleMarker"] is False
    assert decision()["recursionBoundary"]["multiStepTraversalMustTrackDefinitionId"] is True


def test_shadowing_missing_non_addressable_and_duplicate_results_are_explicit():
    root = DefinitionEnvironment()
    root_def = definition("a : b")
    root_registration = root.register(root_def)
    assert root_registration.entry is not None

    child = root.child(0)
    inherited = open_definition(root_def.target, child)
    assert inherited.definition_id == root_registration.entry.identity

    child_def = definition("a : c")
    child_registration = child.register(child_def)
    assert child_registration.entry is not None
    shadowed = open_definition(child_def.target, child)
    assert shadowed.definition_id == child_registration.entry.identity
    assert isinstance(shadowed.body, Symbol) and shadowed.body.name == "c"

    assert open_definition(definition("z : q").target, root).kind is DefinitionLookupKind.NO_MATCH

    for source in ("[] : a", "◁ : a", "▷ : b"):
        item = definition(source)
        assert root.register(item).kind is DefinitionRegistrationKind.NON_ADDRESSABLE
        assert open_definition(item.target, root).kind is DefinitionLookupKind.NON_ADDRESSABLE

    duplicate_root = DefinitionEnvironment()
    assert duplicate_root.register(definition("a : b")).kind is DefinitionRegistrationKind.REGISTERED
    assert duplicate_root.register(definition("a : c")).kind is DefinitionRegistrationKind.CONFLICT
    assert open_definition(definition("a : z").target, duplicate_root).kind is DefinitionLookupKind.CONFLICT


def test_successful_opening_is_not_equality_rewrite_proof_or_interpretation():
    source = definition("a : b")
    environment = DefinitionEnvironment()
    environment.register(source)
    result = open_definition(source.target, environment)
    assert result.kind is DefinitionLookupKind.MATCH
    assert isinstance(result.body, Symbol) and result.body.name == "b"

    operation = decision()["preferredOperation"]
    assert operation["returnsEquality"] is False
    assert operation["returnsProofArtifact"] is False
    assert operation["rewritesCallerAst"] is False

    with pytest.raises(InterpretationError, match="Definition"):
        interpret_constraints(
            source,
            ContextFrame(1, 2),
            NoMemory(),
            symbols={"a": 1, "b": 2},
        )
