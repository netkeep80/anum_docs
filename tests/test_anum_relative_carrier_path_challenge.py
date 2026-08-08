"""Portable non-production challenge for focused relative Anum carrier paths."""

from dataclasses import dataclass
import json
from pathlib import Path

import pytest

from core.anum_denotation import DenotationKind
from core.anum_model import Abit, ProjectionContext
from core.anum_parser import parse_raw_quaternary
from core.anum_recursive_denotation import denotate_recursive_anum
from core.semantic_carrier import CarrierGraph, LinkNode


ROOT = Path(__file__).parents[1]
CHALLENGE = ROOT / "contracts" / "anum-relative-carrier-path-challenge-v0.3.json"
CORPUS = ROOT / "contracts" / "anum-relative-carrier-path-conformance-v0.3.json"
DECISION = ROOT / "contracts" / "anum-relative-context-decision-v0.3.json"
RECURSIVE = ROOT / "contracts" / "anum-recursive-denotation-v0.2.json"


class RelativePathError(ValueError):
    pass


@dataclass(frozen=True)
class RelativeSelectionObservation:
    selected_index: int
    raw_path: str


def challenge() -> dict:
    return json.loads(CHALLENGE.read_text(encoding="utf-8"))


def corpus() -> dict:
    return json.loads(CORPUS.read_text(encoding="utf-8"))


def graph_for_assignment(assignment: dict[str, int]) -> CarrierGraph:
    symbolic = corpus()["symbolicCarrier"]
    nodes: list[LinkNode | None] = [None] * len(assignment)
    for name, index in assignment.items():
        record = symbolic["nodes"][name]
        nodes[index] = LinkNode(
            start=assignment[record["start"]],
            end=assignment[record["end"]],
        )
    assert all(node is not None for node in nodes)
    return CarrierGraph(
        nodes=tuple(node for node in nodes if node is not None),
        root=assignment[symbolic["focus"]],
    )


def traverse(raw: str, graph: CarrierGraph, focus: int) -> RelativeSelectionObservation:
    if focus < 0 or focus >= len(graph.nodes):
        raise RelativePathError("invalid-focus")

    form = parse_raw_quaternary(raw)
    current = focus
    for token in form.tokens:
        if token.abit is Abit.OPEN:
            current = graph.nodes[current].start
        elif token.abit is Abit.CLOSE:
            current = graph.nodes[current].end
        else:
            raise RelativePathError("unresolved-relative-abit")
    return RelativeSelectionObservation(selected_index=current, raw_path=raw)


def normalize(index: int, assignment: dict[str, int]) -> str:
    reverse = {value: key for key, value in assignment.items()}
    return reverse[index]


def test_challenge_is_non_normative_and_follows_focused_carrier_decision():
    data = challenge()
    decision = json.loads(DECISION.read_text(encoding="utf-8"))
    recursive = json.loads(RECURSIVE.read_text(encoding="utf-8"))

    assert data["schema"] == "anum-relative-carrier-path-challenge/v0.3"
    assert data["status"] == "candidate-challenge"
    assert data["dependsOn"] == [decision["schema"], recursive["schema"]]
    assert data["conformanceCorpus"] == "contracts/anum-relative-carrier-path-conformance-v0.3.json"
    assert data["acceptedContractLinkAllowed"] is False
    assert data["productionRelativeSemanticsChangeAllowed"] is False
    assert decision["preferredCandidate"]["firstChallengeSubset"]["accepted"] is False


def test_same_symbolic_carrier_observes_same_paths_under_different_local_indices():
    assignments = corpus()["indexAssignments"]
    assert len(assignments) >= 2

    for vector in corpus()["positivePaths"]:
        observations = []
        raw_indices = []
        for assignment in assignments:
            graph = graph_for_assignment(assignment)
            result = traverse(vector["raw"], graph, graph.root)
            observations.append(normalize(result.selected_index, assignment))
            raw_indices.append(result.selected_index)
            assert result.raw_path == vector["raw"]

        assert observations == [vector["selected"]] * len(assignments)
        if vector["selected"] != "F":
            assert len(set(raw_indices)) > 1


def test_short_role_compositions_match_candidate_meaning():
    assignment = corpus()["indexAssignments"][0]
    graph = graph_for_assignment(assignment)
    expected = {item["raw"]: item["selected"] for item in corpus()["positivePaths"]}

    assert normalize(traverse("[", graph, graph.root).selected_index, assignment) == expected["["]
    assert normalize(traverse("]", graph, graph.root).selected_index, assignment) == expected["]"]
    assert normalize(traverse("[[", graph, graph.root).selected_index, assignment) == expected["[["]
    assert normalize(traverse("]]", graph, graph.root).selected_index, assignment) == expected["]]" ]
    assert normalize(traverse("[]", graph, graph.root).selected_index, assignment) == expected["[]"]
    assert normalize(traverse("][", graph, graph.root).selected_index, assignment) == expected["]["]


def test_cycles_terminate_by_finite_path_length_without_unfolding_graph():
    assignment = corpus()["indexAssignments"][0]
    graph = graph_for_assignment(assignment)

    assert normalize(traverse("[[[[", graph, graph.root).selected_index, assignment) == "SS"
    assert normalize(traverse("]]]]", graph, graph.root).selected_index, assignment) == "EE"
    assert normalize(traverse("[][]", graph, graph.root).selected_index, assignment) == "F"

    subset = challenge()["pathSubset"]
    assert subset["terminationMeasure"] == "remaining raw token count"
    assert subset["graphUnfolding"] is False


def test_distinct_paths_can_select_same_node_without_collapsing_raw_identity():
    assignment = corpus()["indexAssignments"][0]
    graph = graph_for_assignment(assignment)
    ambiguity = corpus()["ambiguityCases"][0]

    observations = [
        traverse(raw, graph, graph.root)
        for raw in ambiguity["paths"]
    ]
    assert {normalize(item.selected_index, assignment) for item in observations} == {
        ambiguity["selected"]
    }
    assert {item.raw_path for item in observations} == set(ambiguity["paths"])

    inverse = challenge()["inverseFindingGate"]
    assert inverse["canonicalInverseAccepted"] is False
    assert inverse["selectedNodeOnlySufficientForInverse"] is False
    assert inverse["pathPreservingReplayIsCanonicalSemanticInverse"] is False


def test_invalid_focus_and_unresolved_0_1_are_typed_failures():
    assignment = corpus()["indexAssignments"][0]
    graph = graph_for_assignment(assignment)

    for vector in corpus()["negativeCases"]:
        with pytest.raises(RelativePathError, match=vector["expect"]):
            traverse("[", graph, vector["focus"])

    for raw in corpus()["unresolvedPaths"]:
        with pytest.raises(RelativePathError, match="unresolved-relative-abit"):
            traverse(raw, graph, graph.root)


def test_current_production_relative_remains_raw_for_isolation_vectors():
    for raw in corpus()["productionIsolationVectors"]:
        value = denotate_recursive_anum(
            parse_raw_quaternary(raw),
            ProjectionContext.RELATIVE,
        )
        assert value.kind is DenotationKind.RAW
        assert value.raw == raw


def test_root_and_quote_behavior_are_not_reused_as_relative_path_rules():
    for raw in ("[]", "]["):
        form = parse_raw_quaternary(raw)
        root = denotate_recursive_anum(form, ProjectionContext.ROOT)
        quote = denotate_recursive_anum(form, ProjectionContext.QUOTE)
        relative = denotate_recursive_anum(form, ProjectionContext.RELATIVE)

        assert root.kind is DenotationKind.STRUCTURAL
        assert quote.kind is DenotationKind.QUOTED_RAW
        assert relative.kind is DenotationKind.RAW

    vetoes = challenge()["negativeVetoes"]
    assert "do not import root 0/1 aliases into relative context" in vetoes
    assert "do not apply root-opening-collapse to relative traversal" in vetoes
    assert "do not treat quote envelope removal as relative traversal" in vetoes


def test_result_models_and_inverse_remain_unaccepted_after_forward_path_evidence():
    models = {item["id"]: item for item in challenge()["resultModels"]}
    assert set(models) == {"A", "B", "C"}
    assert models["A"]["disposition"] == "challenge"
    assert models["B"]["disposition"] == "challenge"
    assert models["C"]["disposition"] == "defer"
    assert all(item["accepted"] is False for item in models.values())


def test_no_persistent_or_contextframe_identity_is_observable():
    non_observables = set(corpus()["nonObservables"])
    assert "raw integer node index" in non_observables
    assert "persistent LinkRef" in non_observables
    assert "physical address" in non_observables
    assert "MemoryView state" in non_observables
    assert "L2 ContextFrame parent" in non_observables

    context = challenge()["contextUnderChallenge"]
    assert context["focusIsPersistentIdentity"] is False
    assert context["usesMemoryView"] is False
    assert context["usesL2ContextFrameParent"] is False
