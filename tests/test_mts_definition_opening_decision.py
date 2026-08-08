"""Executable evidence for the non-normative one-step definition-opening decision."""

from dataclasses import dataclass, fields, is_dataclass
import inspect
import json
from pathlib import Path

import pytest

from core.mtc_ast import (
    BundleForm,
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
DECISION = ROOT / "contracts" / "mts-definition-opening-decision-v0.3.json"
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.2.json"
MTS_PROOF = ROOT / "contracts" / "mts-proof-v0.2.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


@dataclass(frozen=True, order=True)
class DefinitionId:
    scope_path: tuple[int, ...]
    ordinal: int


@dataclass(frozen=True)
class OpeningMatch:
    definition_id: DefinitionId
    target_key: object
    body: Expression
    source_definition: Definition


class NonAddressableTarget(ValueError):
    pass


class DefinitionConflict(ValueError):
    pass


def decision() -> dict:
    return json.loads(DECISION.read_text(encoding="utf-8"))


def definition(source: str) -> Definition:
    value = parse_formula(source)
    assert isinstance(value, Definition)
    return value


def _contains_non_addressable(value: object) -> bool:
    if isinstance(value, ContextPronoun):
        return True
    if isinstance(value, SquareForm) and value.content is None:
        return True
    if isinstance(value, tuple):
        return any(_contains_non_addressable(item) for item in value)
    if isinstance(value, Expression) and is_dataclass(value):
        for item in fields(value):
            if item.name == "span":
                continue
            if _contains_non_addressable(getattr(value, item.name)):
                return True
    return False


def target_key(target: Form) -> object:
    if _contains_non_addressable(target):
        raise NonAddressableTarget(
            "definition target contains occurrence-local or deictic form"
        )
    return structural_key(target)


class Environment:
    def __init__(
        self,
        scope_path: tuple[int, ...] = (),
        parent: "Environment | None" = None,
    ) -> None:
        self.scope_path = scope_path
        self.parent = parent
        self.entries: dict[object, tuple[DefinitionId, Definition]] = {}

    def child(self, index: int) -> "Environment":
        return Environment(self.scope_path + (index,), self)

    def register(self, value: Definition) -> DefinitionId:
        key = target_key(value.target)
        if key in self.entries:
            raise DefinitionConflict("same-scope target conflict")
        identity = DefinitionId(self.scope_path, len(self.entries))
        self.entries[key] = (identity, value)
        return identity

    def lookup(self, target: Form) -> tuple[DefinitionId, Definition] | None:
        key = target_key(target)
        current: Environment | None = self
        while current is not None:
            entry = current.entries.get(key)
            if entry is not None:
                return entry
            current = current.parent
        return None


def open_definition(target: Form, environment: Environment) -> OpeningMatch | None:
    """Challenge-only preferred model: lookup, return exact typed RHS, stop."""

    key = target_key(target)
    found = environment.lookup(target)
    if found is None:
        return None
    identity, source = found
    return OpeningMatch(
        definition_id=identity,
        target_key=key,
        body=source.value,
        source_definition=source,
    )


def _contains_node(value: object, node_type: type) -> bool:
    if isinstance(value, node_type):
        return True
    if isinstance(value, tuple):
        return any(_contains_node(item, node_type) for item in value)
    if isinstance(value, Expression) and is_dataclass(value):
        return any(
            _contains_node(getattr(value, item.name), node_type)
            for item in fields(value)
            if item.name != "span"
        )
    return False


class NoMemory:
    def __getattr__(self, name):
        raise AssertionError(f"unexpected L4 access: {name}")


def test_decision_is_non_normative_and_only_model_a_is_preferred():
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
    assert "mts-definition-opening" not in mts_text
    assert "mts-definition-opening" not in proof_text


def test_all_ten_root_definitions_open_once_to_exact_registered_typed_rhs():
    library = load_root_library(ROOT_PROGRAM)
    environment = Environment()
    identities: list[DefinitionId] = []

    for formula in library.formulas:
        assert isinstance(formula.ast, Definition)
        identities.append(environment.register(formula.ast))

    assert len(identities) == len(set(identities)) == 10

    for formula in library.formulas:
        assert isinstance(formula.ast, Definition)
        result = open_definition(formula.ast.target, environment)
        assert result is not None
        assert result.body is formula.ast.value
        assert structural_key(result.body) == structural_key(formula.ast.value)
        assert format_expression(result.body) == format_expression(formula.ast.value)


def test_infinity_opening_preserves_context_pronouns_without_resolving_them():
    library = load_root_library(ROOT_PROGRAM)
    environment = Environment()
    infinity: Definition | None = None

    for formula in library.formulas:
        assert isinstance(formula.ast, Definition)
        environment.register(formula.ast)
        if format_expression(formula.ast.target) == "∞":
            infinity = formula.ast

    assert infinity is not None
    result = open_definition(infinity.target, environment)
    assert result is not None
    assert isinstance(result.body, BundleForm)
    assert _contains_node(result.body, ContextPronoun)

    boundary = decision()["contextBoundary"]
    assert boundary["openingResolvesContextPronouns"] is False
    assert boundary["openingEvaluatesBody"] is False
    assert boundary["laterInterpretationIsPartOfOpening"] is False


def test_opening_uniformly_returns_form_and_constraint_bundle_rhs_without_evaluation():
    environment = Environment()
    form_definition = definition("a : b")
    bundle_definition = definition("c : {◁ = c, ▷ = c}")
    environment.register(form_definition)
    environment.register(bundle_definition)

    form_result = open_definition(form_definition.target, environment)
    bundle_result = open_definition(bundle_definition.target, environment)

    assert form_result is not None
    assert bundle_result is not None
    assert isinstance(form_result.body, Symbol)
    assert form_result.body.name == "b"
    assert isinstance(bundle_result.body, BundleForm)
    assert _contains_node(bundle_result.body, ContextPronoun)


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
    environment = Environment()
    self_definition = definition("a : a")
    mutual_a = definition("b : c")
    mutual_b = definition("c : b")
    for item in (self_definition, mutual_a, mutual_b):
        environment.register(item)

    self_result = open_definition(self_definition.target, environment)
    b_result = open_definition(mutual_a.target, environment)
    c_result = open_definition(mutual_b.target, environment)

    assert self_result is not None and isinstance(self_result.body, Symbol)
    assert self_result.body.name == "a"
    assert b_result is not None and isinstance(b_result.body, Symbol)
    assert b_result.body.name == "c"
    assert c_result is not None and isinstance(c_result.body, Symbol)
    assert c_result.body.name == "b"
    assert decision()["recursionBoundary"]["singleStepNeedsCycleMarker"] is False
    assert decision()["recursionBoundary"]["multiStepTraversalMustTrackDefinitionId"] is True


def test_lexical_shadowing_changes_definition_id_and_body_but_not_target_shape():
    root = Environment()
    root_definition = definition("a : b")
    root_id = root.register(root_definition)

    child = root.child(0)
    inherited = open_definition(root_definition.target, child)
    assert inherited is not None
    assert inherited.definition_id == root_id
    assert isinstance(inherited.body, Symbol) and inherited.body.name == "b"

    child_definition = definition("a : c")
    child_id = child.register(child_definition)
    shadowed = open_definition(child_definition.target, child)
    assert shadowed is not None
    assert child_id != root_id
    assert shadowed.definition_id == child_id
    assert shadowed.target_key == structural_key(root_definition.target)
    assert isinstance(shadowed.body, Symbol) and shadowed.body.name == "c"


def test_missing_and_non_addressable_targets_remain_explicit_negative_results():
    environment = Environment()
    existing = definition("a : b")
    environment.register(existing)

    missing = definition("z : q")
    assert open_definition(missing.target, environment) is None

    for source in ("[] : a", "◁ : a", "▷ : b"):
        item = definition(source)
        with pytest.raises(NonAddressableTarget):
            environment.register(item)
        with pytest.raises(NonAddressableTarget):
            open_definition(item.target, environment)


def test_same_scope_duplicate_remains_conflict_not_implicit_redefinition():
    environment = Environment()
    environment.register(definition("a : b"))
    with pytest.raises(DefinitionConflict):
        environment.register(definition("a : c"))


def test_successful_opening_is_not_equality_rewrite_proof_or_production_execution():
    source = definition("a : b")
    environment = Environment()
    environment.register(source)
    result = open_definition(source.target, environment)

    assert result is not None
    assert isinstance(result.body, Symbol)
    assert result.body.name == "b"

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
