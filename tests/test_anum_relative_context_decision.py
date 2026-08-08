"""Executable evidence for the non-normative relative-context decision v0.3."""

import json
from pathlib import Path

import pytest

from core.anum_denotation import DenotationKind
from core.anum_model import Abit, ProjectionContext
from core.anum_parser import parse_raw_quaternary
from core.anum_recursive_denotation import denotate_recursive_anum
from core.semantic_carrier import CarrierGraph, LinkNode


ROOT = Path(__file__).parents[1]
DECISION = ROOT / "contracts" / "anum-relative-context-decision-v0.3.json"
CHALLENGE = ROOT / "contracts" / "anum-relative-context-challenge-v0.3.json"
RECURSIVE = ROOT / "contracts" / "anum-recursive-denotation-v0.2.json"


class RelativeCandidateError(ValueError):
    pass


def decision() -> dict:
    return json.loads(DECISION.read_text(encoding="utf-8"))


def carrier() -> CarrierGraph:
    """Finite cyclic/shared graph with distinct observations for all short paths."""

    return CarrierGraph(
        nodes=(
            LinkNode(start=1, end=2),
            LinkNode(start=3, end=0),
            LinkNode(start=0, end=4),
            LinkNode(start=3, end=1),
            LinkNode(start=2, end=4),
        ),
        root=0,
    )


def candidate_traverse(raw: str, graph: CarrierGraph, focus: int) -> int:
    """Decision-only bracket path model; production RELATIVE remains RAW."""

    if focus < 0 or focus >= len(graph.nodes):
        raise RelativeCandidateError("relative focus is outside carrier graph")
    form = parse_raw_quaternary(raw)
    current = focus
    for token in form.tokens:
        if token.abit is Abit.OPEN:
            current = graph.nodes[current].start
        elif token.abit is Abit.CLOSE:
            current = graph.nodes[current].end
        else:
            raise RelativeCandidateError("0/1 are unresolved in bracket-path challenge subset")
    return current


def test_decision_is_non_normative_and_selects_only_focused_l1_carrier():
    data = decision()
    challenge = json.loads(CHALLENGE.read_text(encoding="utf-8"))
    recursive = json.loads(RECURSIVE.read_text(encoding="utf-8"))
    models = {model["id"]: model for model in data["models"]}

    assert data["schema"] == "anum-relative-context-decision/v0.3"
    assert data["status"] == "candidate-decision"
    assert data["dependsOn"] == [recursive["schema"], challenge["schema"]]
    assert data["acceptedContractLinkAllowed"] is False
    assert data["productionRelativeSemanticsChangeAllowed"] is False
    assert set(models) == {"A", "B", "C", "D", "E", "F"}
    assert models["F"]["verdict"] == "preferred-candidate"
    assert all(model["accepted"] is False for model in models.values())
    assert models["C"]["verdict"] == "reject-as-structural-model"
    assert models["E"]["verdict"] == "reject"


def test_bracket_path_candidate_has_expected_role_composition():
    graph = carrier()
    expected = {
        "[": 1,
        "]": 2,
        "[[": 3,
        "]]": 4,
        "[]": 0,
        "][": 0,
    }
    for raw, selected in expected.items():
        assert candidate_traverse(raw, graph, graph.root) == selected


def test_cycles_terminate_by_finite_raw_length_without_graph_unfolding():
    graph = carrier()

    assert candidate_traverse("[[[[", graph, 0) == 3
    assert candidate_traverse("]]]]", graph, 0) == 4
    assert candidate_traverse("[][][][]", graph, 0) == 0

    preferred = decision()["preferredCandidate"]["firstChallengeSubset"]
    assert preferred["terminatesByRawLength"] is True
    assert preferred["cycleUnfoldingRequired"] is False
    assert preferred["accepted"] is False


def test_distinct_paths_may_select_same_node_without_becoming_identical_raw():
    graph = carrier()

    assert candidate_traverse("[]", graph, 0) == 0
    assert candidate_traverse("][", graph, 0) == 0
    assert "[]" != "]["

    inverse = decision()["inverseBoundary"]
    assert inverse["canonicalInverseAccepted"] is False
    assert inverse["mustNotChooseShortestPathImplicitly"] is True
    assert inverse["mustNotUseBackendIdentityToDisambiguate"] is True


def test_invalid_focus_and_0_1_are_explicit_candidate_failures():
    graph = carrier()
    with pytest.raises(RelativeCandidateError, match="outside carrier"):
        candidate_traverse("[", graph, 99)

    for raw in ("0", "1", "[0", "1]"):
        with pytest.raises(RelativeCandidateError, match="0/1 are unresolved"):
            candidate_traverse(raw, graph, graph.root)


def test_current_production_relative_semantics_remain_raw_for_decision_vectors():
    for raw in ("[", "]", "[[", "]]", "[]", "][", "0", "1", "[0", "1]"):
        value = denotate_recursive_anum(
            parse_raw_quaternary(raw),
            ProjectionContext.RELATIVE,
        )
        assert value.kind is DenotationKind.RAW
        assert value.raw == raw


def test_focused_carrier_is_l1_description_local_not_l4_identity():
    graph = carrier()
    assert graph.root == 0
    assert graph.nodes[graph.root] == LinkNode(start=1, end=2)

    identity = decision()["identityBoundary"]
    assert identity["focusNodeIndexIsDescriptionLocal"] is True
    assert identity["focusNodeIndexIsPersistentLinkId"] is False
    assert identity["equalSubgraphsNeedNotIntern"] is True
    assert identity["carrierIsomorphismIsNotL2Equality"] is True

    separation = decision()["contextSeparation"]
    assert separation["relativeStructuralTraversalUsesL2ContextFrameParent"] is False
    assert separation["relativeStructuralTraversalUsesMemoryView"] is False
    assert separation["relativeStructuralTraversalMayMaterialize"] is False


def test_next_gate_is_non_production_focused_carrier_path_challenge():
    gate = decision()["nextGate"]
    assert gate["artifact"] == "anum-relative-carrier-path-challenge/v0.3"
    assert gate["status"] == "candidate-challenge"
    assert gate["mustNotChangeProductionRelativeSemantics"] is True
    assert "current production RELATIVE remains RAW" in gate["requiredVectors"]
    assert "inverse ambiguity is reported rather than guessed" in gate["requiredVectors"]
