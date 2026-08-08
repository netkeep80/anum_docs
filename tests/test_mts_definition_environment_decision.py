"""Executable gate for the non-normative DefinitionEnvironment v0.3 decision.

This suite deliberately models only identity, lexical lookup and finite recursion
state. It does not add production ``:`` semantics, form matching, proof rules or
L4 effects.
"""

from dataclasses import dataclass
import json
from pathlib import Path

import pytest

from core.mtc_ast import Definition, Form, SourceSpan, Symbol, structural_key
from core.mtc_interpreter import ContextFrame
from core.mtc_parser import parse_formula
from core.root_library import load_root_library


ROOT = Path(__file__).parents[1]
DECISION = ROOT / "contracts" / "mts-definition-environment-decision-v0.3.json"
CHALLENGE = ROOT / "contracts" / "mts-definition-resolution-challenge-v0.3.json"
MTS_CONTRACT = ROOT / "contracts" / "mts-contract-v0.2.json"
MTS_PROOF = ROOT / "contracts" / "mts-proof-v0.2.json"
ROOT_PROGRAM = ROOT / "tests" / "mtc_formulas.mtc"


@dataclass(frozen=True, order=True)
class ScopeId:
    """Challenge-only deterministic lexical scope identity."""

    path: tuple[int, ...]


@dataclass(frozen=True, order=True)
class DefinitionId:
    """Challenge-only introduction identity; never a target or storage identity."""

    scope: ScopeId
    ordinal: int


@dataclass(frozen=True)
class CandidateEntry:
    identity: DefinitionId
    target_key: object
    definition: Definition
    provenance: str


class SameScopeConflict(ValueError):
    pass


class CandidateEnvironment:
    """Tiny test-local model selected by the decision, not production semantics."""

    def __init__(self, scope: ScopeId, parent: "CandidateEnvironment | None" = None):
        self.scope = scope
        self.parent = parent
        self._entries: dict[object, CandidateEntry] = {}

    def child(self, index: int) -> "CandidateEnvironment":
        return CandidateEnvironment(ScopeId(self.scope.path + (index,)), parent=self)

    def register(self, definition: Definition, *, provenance: str) -> CandidateEntry:
        key = structural_key(definition.target)
        if key in self._entries:
            raise SameScopeConflict(f"duplicate target key in scope {self.scope.path}: {key!r}")

        entry = CandidateEntry(
            identity=DefinitionId(self.scope, len(self._entries)),
            target_key=key,
            definition=definition,
            provenance=provenance,
        )
        self._entries[key] = entry
        return entry

    def lookup(self, target: Form) -> CandidateEntry | None:
        key = structural_key(target)
        scope: CandidateEnvironment | None = self
        while scope is not None:
            entry = scope._entries.get(key)
            if entry is not None:
                return entry
            scope = scope.parent
        return None

    def entries(self) -> tuple[CandidateEntry, ...]:
        return tuple(self._entries.values())


def decision() -> dict:
    return json.loads(DECISION.read_text(encoding="utf-8"))


def definition(source: str) -> Definition:
    expression = parse_formula(source)
    assert isinstance(expression, Definition)
    return expression


def _lookup_with_irrelevant_context(
    environment: CandidateEnvironment,
    target: Form,
    frame: ContextFrame,
) -> CandidateEntry | None:
    """Make the candidate context boundary executable: lookup ignores ContextFrame."""

    del frame
    return environment.lookup(target)


def _walk_definition_ids(
    start: DefinitionId,
    edges: dict[DefinitionId, tuple[DefinitionId, ...]],
) -> tuple[tuple[DefinitionId, ...], tuple[tuple[DefinitionId, DefinitionId], ...]]:
    """Finite graph replay keyed only by DefinitionId, with explicit cycle refs."""

    visited: list[DefinitionId] = []
    active: set[DefinitionId] = set()
    completed: set[DefinitionId] = set()
    cycles: list[tuple[DefinitionId, DefinitionId]] = []

    def walk(current: DefinitionId) -> None:
        visited.append(current)
        active.add(current)
        for dependency in edges.get(current, ()):  # graph edges are supplied, not inferred here
            if dependency in active:
                edge = (current, dependency)
                if edge not in cycles:
                    cycles.append(edge)
                continue
            if dependency not in completed:
                walk(dependency)
        active.remove(current)
        completed.add(current)

    walk(start)
    return tuple(visited), tuple(cycles)


def test_decision_is_non_normative_and_depends_on_the_merged_challenge():
    data = decision()
    challenge = json.loads(CHALLENGE.read_text(encoding="utf-8"))
    mts_contract_text = MTS_CONTRACT.read_text(encoding="utf-8")
    mts_proof_text = MTS_PROOF.read_text(encoding="utf-8")

    assert data["schema"] == "mts-definition-environment-decision/v0.3"
    assert data["status"] == "candidate-decision"
    assert data["dependsOn"] == ["mts-contract/v0.2", challenge["schema"]]
    assert data["acceptedContractLinkAllowed"] is False
    assert data["productionInterpreterChangeAllowed"] is False
    assert "mts-definition-environment-decision" not in mts_contract_text
    assert "mts-definition-environment-decision" not in mts_proof_text


def test_only_scoped_introduction_identity_is_the_preferred_candidate():
    models = {model["id"]: model for model in decision()["identityModels"]}

    assert set(models) == {"A", "B", "C", "D", "E"}
    assert models["A"]["verdict"] == "reject"
    assert models["B"]["verdict"] == "reject"
    assert models["C"]["verdict"] == "reject-as-identity-keep-as-lookup-key"
    assert models["D"]["verdict"] == "reject-for-L2-environment"
    assert models["E"]["verdict"] == "preferred-candidate"
    assert all(model["accepted"] is False for model in models.values())

    selected = models["E"]
    assert selected["definitionId"]["shape"] == "DefinitionId(scopeId, ordinal)"
    assert selected["definitionId"]["persistentStorageIdentity"] is False
    assert selected["targetKey"]["role"] == "lookup discriminant only"
    assert selected["targetKey"]["semanticEquality"] is False
    assert selected["provenance"]["participatesInDefinitionIdentity"] is False


def test_all_ten_root_definitions_get_distinct_replay_local_definition_ids():
    library = load_root_library(ROOT_PROGRAM)
    environment = CandidateEnvironment(ScopeId(()))

    entries = []
    for index, formula in enumerate(library.formulas):
        assert isinstance(formula.ast, Definition)
        entries.append(
            environment.register(
                formula.ast,
                provenance=f"{formula.source_path}:{formula.line_no}:{index}",
            )
        )

    assert len(entries) == 10
    assert len(library.registry.entries()) == 10
    assert library.registry.duplicates() == []
    assert len({entry.identity for entry in entries}) == 10
    assert [entry.identity.ordinal for entry in entries] == list(range(10))
    assert all(entry.identity.scope == ScopeId(()) for entry in entries)


def test_target_structure_is_lookup_key_but_never_introduction_identity():
    left = Symbol("a", SourceSpan(0, 1))
    same_shape_different_span = Symbol("a", SourceSpan(100, 101))

    assert structural_key(left) == structural_key(same_shape_different_span)

    root = CandidateEnvironment(ScopeId(()))
    child = root.child(0)
    root_entry = root.register(definition("a : b"), provenance="root")
    child_entry = child.register(definition("a : c"), provenance="child")

    assert root_entry.target_key == child_entry.target_key
    assert root_entry.identity != child_entry.identity
    assert root.lookup(same_shape_different_span) == root_entry
    assert child.lookup(same_shape_different_span) == child_entry


def test_same_scope_duplicate_conflicts_instead_of_silently_replacing_identity():
    environment = CandidateEnvironment(ScopeId(()))
    first = environment.register(definition("a : b"), provenance="first")

    with pytest.raises(SameScopeConflict, match="duplicate target key"):
        environment.register(definition("a : c"), provenance="second")

    assert environment.lookup(definition("a : z").target) == first
    assert len(environment.entries()) == 1


def test_explicit_child_shadowing_and_parent_fallback_are_deterministic():
    root = CandidateEnvironment(ScopeId(()))
    root_a = root.register(definition("a : rootValue"), provenance="root-a")
    root_b = root.register(definition("b : rootB"), provenance="root-b")
    child = root.child(7)
    child_a = child.register(definition("a : childValue"), provenance="child-a")

    assert child.lookup(definition("a : ignored").target) == child_a
    assert child.lookup(definition("b : ignored").target) == root_b
    assert root.lookup(definition("a : ignored").target) == root_a
    assert child_a.identity.scope == ScopeId((7,))
    assert root_a.identity.scope == ScopeId(())


def test_nested_context_frame_cannot_change_definition_lookup():
    root = CandidateEnvironment(ScopeId(()))
    child = root.child(1)
    root_entry = root.register(definition("a : b"), provenance="root")
    target = definition("a : ignored").target

    frame_a = ContextFrame(start=1, end=2)
    frame_b = ContextFrame(start=100, end=200, parent=ContextFrame(start=10, end=20))

    assert _lookup_with_irrelevant_context(child, target, frame_a) == root_entry
    assert _lookup_with_irrelevant_context(child, target, frame_b) == root_entry
    assert decision()["contextModel"]["definitionLookupDependsOnContextFrame"] is False
    assert decision()["scopeModel"]["contextFrameIsDefinitionScope"] is False


def test_self_and_mutual_recursion_are_finite_when_state_is_definition_id():
    root = CandidateEnvironment(ScopeId(()))
    a = root.register(definition("a : a"), provenance="a").identity
    b = root.register(definition("b : a"), provenance="b").identity

    visited, cycles = _walk_definition_ids(a, {a: (a,)})
    assert visited == (a,)
    assert cycles == ((a, a),)

    visited, cycles = _walk_definition_ids(a, {a: (b,), b: (a,)})
    assert visited == (a, b)
    assert cycles == ((b, a),)

    recursion = decision()["finiteRecursionModel"]
    assert recursion["stateKey"] == "DefinitionId"
    assert recursion["textualUnfolding"] is False
    assert recursion["normalFormRequired"] is False


def test_resolution_boundary_does_not_smuggle_in_equality_proof_or_l4_effects():
    result = decision()["resolutionResultCandidate"]
    vetoes = set(decision()["negativeVetoes"])

    assert result["returnsEquality"] is False
    assert result["returnsProofArtifact"] is False
    assert result["mutatesMemory"] is False
    assert result["rewritesCallerAst"] is False
    assert "successful lookup implies A = F" in vetoes
    assert "successful lookup rewrites all A occurrences" in vetoes
    assert "definition lookup realizes missing L4 links" in vetoes


def test_next_gate_requires_environment_challenge_before_any_semantic_acceptance():
    gate = decision()["nextGate"]

    assert gate["artifact"] == "mts-definition-environment-challenge/v0.3"
    assert gate["status"] == "candidate-challenge"
    assert gate["mustNotChangeProductionSemantics"] is True
    assert {
        "all ten canonical root definitions register with ten distinct DefinitionId values",
        "same structural target in one scope is conflict",
        "same structural target in child scope has distinct DefinitionId and explicit nearest-scope shadowing",
        "nested ContextFrame does not affect definition lookup",
        "self recursion emits cycle-ref by DefinitionId",
        "mutual recursion emits finite cycle-ref graph by DefinitionId",
        "no L4 reads, realize or delete",
    }.issubset(set(gate["requiredVectors"]))
