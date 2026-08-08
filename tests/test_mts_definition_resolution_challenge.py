"""Executable challenge gate for controlled MTS definition resolution v0.3.

This suite deliberately does not add production definition semantics. It freezes
v0.2 boundaries and exercises a tiny test-local finite graph model so recursive
and mutually recursive definitions cannot be "solved" by naive infinite text
substitution while the real identity/context semantics are still under study.
"""

from dataclasses import fields, is_dataclass
import json
from pathlib import Path

import pytest

from core.mtc_ast import Definition, Expression, Symbol
from core.mtc_interpreter import (
    ContextFrame,
    InterpretationError,
    MemoryView,
    interpret_constraints,
)
from core.mtc_parser import parse_formula
from core.root_library import load_root_library


ROOT = Path(__file__).parents[1]
CHALLENGE = ROOT / "contracts" / "mts-definition-resolution-challenge-v0.3.json"
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.2.json"
MTS_PROOF = ROOT / "contracts" / "mts-proof-v0.2.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


class NoReadMemory(MemoryView):
    """Prove the current Definition boundary performs no hidden L4 reads."""

    def poles(self, link: int) -> tuple[int, int]:
        raise AssertionError("definition challenge unexpectedly read L4 poles")

    def find_link(self, start: int, end: int) -> int | None:
        raise AssertionError("definition challenge unexpectedly searched L4 links")

    def find_start_projection(self, form: int) -> int | None:
        raise AssertionError("definition challenge unexpectedly read start projection")

    def find_end_projection(self, form: int) -> int | None:
        raise AssertionError("definition challenge unexpectedly read end projection")


def challenge() -> dict:
    return json.loads(CHALLENGE.read_text(encoding="utf-8"))


def _symbol_dependencies(expression: Expression) -> list[str]:
    """Collect symbol occurrences for synthetic symbol-target challenge cases only."""

    result: list[str] = []

    def visit(value) -> None:
        if isinstance(value, Symbol):
            if value.name not in result:
                result.append(value.name)
            return
        if isinstance(value, tuple):
            for item in value:
                visit(item)
            return
        if isinstance(value, Expression) and is_dataclass(value):
            for field in fields(value):
                if field.name == "span":
                    continue
                visit(getattr(value, field.name))

    visit(expression)
    return result


def _walk_synthetic_definition_graph(sources: list[str], start: str) -> dict:
    """Test-local candidate: finite DFS with explicit cycle edges, never unfolding text."""

    definitions: dict[str, Definition] = {}
    for source in sources:
        expression = parse_formula(source)
        assert isinstance(expression, Definition)
        assert isinstance(expression.target, Symbol)
        definitions[expression.target.name] = expression

    if start not in definitions:
        return {
            "visited": [],
            "cycleEdges": [],
            "externalLeaves": [],
            "missingStart": True,
        }

    visited: list[str] = []
    completed: set[str] = set()
    active: set[str] = set()
    cycle_edges: list[list[str]] = []
    external_leaves: list[str] = []

    def walk(name: str) -> None:
        visited.append(name)
        active.add(name)
        definition = definitions[name]

        for dependency in _symbol_dependencies(definition.value):
            if dependency in active:
                edge = [name, dependency]
                if edge not in cycle_edges:
                    cycle_edges.append(edge)
                continue
            if dependency in definitions:
                if dependency not in completed:
                    walk(dependency)
                continue
            if dependency not in external_leaves:
                external_leaves.append(dependency)

        active.remove(name)
        completed.add(name)

    walk(start)
    return {
        "visited": visited,
        "cycleEdges": cycle_edges,
        "externalLeaves": external_leaves,
        "missingStart": False,
    }


def test_challenge_is_non_normative_and_not_linked_from_v02_contracts():
    data = challenge()
    mts_contract_text = MTS_CONTRACT.read_text(encoding="utf-8")
    mts_proof_text = MTS_PROOF.read_text(encoding="utf-8")

    assert data["schema"] == "mts-definition-resolution-challenge/v0.3"
    assert data["status"] == "candidate-challenge"
    assert data["dependsOn"] == "mts-contract/v0.2"
    assert data["acceptedContractLinkAllowed"] is False
    assert data["productionInterpreterChangeAllowed"] is False
    assert "mts-definition-resolution-challenge" not in mts_contract_text
    assert "mts-definition-resolution-challenge" not in mts_proof_text


def test_current_root_library_remains_ten_typed_definitions_without_duplicates():
    library = load_root_library(ROOT_PROGRAM)

    assert len(library.formulas) == 10
    assert len(library.registry.entries()) == 10
    assert library.registry.duplicates() == []
    assert all(isinstance(formula.ast, Definition) for formula in library.formulas)


def test_definition_is_parsed_and_registered_but_not_executed_by_current_interpreter():
    expression = parse_formula("a : b")
    assert isinstance(expression, Definition)

    with pytest.raises(InterpretationError, match="Definition"):
        interpret_constraints(
            expression,
            ContextFrame(start=1, end=2),
            NoReadMemory(),
            symbols={"a": 1, "b": 2},
        )


def test_global_rewrite_and_eager_normalization_models_are_explicitly_rejected():
    models = {model["id"]: model for model in challenge()["candidateModels"]}

    assert models["global-textual-rewrite"]["disposition"] == "reject"
    assert models["eager-recursive-normalization"]["disposition"] == "reject"
    assert models["global-textual-rewrite"]["accepted"] is False
    assert models["eager-recursive-normalization"]["accepted"] is False

    assert models["finite-definition-graph-resolution"]["disposition"] == "challenge"
    assert models["contextual-coinductive-resolution"]["disposition"] == "challenge"
    assert models["finite-definition-graph-resolution"]["accepted"] is False
    assert models["contextual-coinductive-resolution"]["accepted"] is False


def test_synthetic_finite_graph_candidate_terminates_on_direct_chain_and_cycles():
    for case in challenge()["finiteGraphChallengeCases"]:
        result = _walk_synthetic_definition_graph(case["definitions"], case["start"])
        assert result == {
            "visited": case["expectedVisited"],
            "cycleEdges": case["expectedCycleEdges"],
            "externalLeaves": case["expectedExternalLeaves"],
            "missingStart": case["expectedMissingStart"],
        }


def test_synthetic_graph_model_is_explicitly_not_general_definition_identity():
    veto = challenge()["identityVeto"]

    assert veto["displayTextIsRuntimeIdentity"] is False
    assert veto["sourceSpanIsRuntimeIdentity"] is False
    assert veto["anonymousOccurrenceMayBecomeGlobalBySpelling"] is False
    assert veto["candidateSyntheticGraphCasesUseSymbolTargetsOnly"] is True


def test_definition_resolution_challenge_forbids_implicit_effects():
    assert challenge()["effectVeto"] == {
        "definitionResolutionMayRealize": False,
        "definitionResolutionMayDelete": False,
        "lookupEqualsRealize": False,
        "interpretEqualsRealize": False,
    }


def test_release_gate_requires_acceptance_before_production_or_l5_rule_changes():
    data = challenge()
    release_gate = data["releaseGate"]

    assert data["rootProgramMustRemainUnchanged"] is True
    assert "accept a versioned semantic contract before modifying the single production interpreter" in release_gate
    assert "only then expose the accepted operation as a candidate L5 proof rule" in release_gate
