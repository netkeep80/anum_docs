"""Executable evidence for the non-normative relative-result decision v0.3."""

from dataclasses import dataclass
import json
from pathlib import Path

from core.anum_denotation import DenotationKind
from core.anum_model import Abit, ProjectionContext
from core.anum_parser import parse_raw_quaternary
from core.anum_recursive_denotation import denotate_recursive_anum
from core.semantic_carrier import CarrierGraph, LinkNode, carrier_isomorphic


ROOT = Path(__file__).parents[1]
DECISION = ROOT / "contracts" / "anum-relative-result-decision-v0.3.json"
PATH_CHALLENGE = ROOT / "contracts" / "anum-relative-carrier-path-challenge-v0.3.json"
PATH_CORPUS = ROOT / "contracts" / "anum-relative-carrier-path-conformance-v0.3.json"


@dataclass(frozen=True)
class CandidateRelativeResult:
    focused: CarrierGraph
    raw_path_provenance: str


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def build_carrier(assignment: dict[str, int]) -> CarrierGraph:
    symbolic = read(PATH_CORPUS)["symbolicCarrier"]
    nodes: list[LinkNode | None] = [None] * len(assignment)
    for name, poles in symbolic["nodes"].items():
        nodes[assignment[name]] = LinkNode(
            start=assignment[poles["start"]],
            end=assignment[poles["end"]],
        )
    assert all(node is not None for node in nodes)
    return CarrierGraph(
        nodes=tuple(node for node in nodes if node is not None),
        root=assignment[symbolic["focus"]],
    )


def candidate_select(raw: str, graph: CarrierGraph) -> CandidateRelativeResult:
    form = parse_raw_quaternary(raw)
    selected = graph.root
    for token in form.tokens:
        if token.abit is Abit.OPEN:
            selected = graph.nodes[selected].start
        elif token.abit is Abit.CLOSE:
            selected = graph.nodes[selected].end
        else:
            raise ValueError("relative 0/1 are deferred")
    return CandidateRelativeResult(
        focused=CarrierGraph(nodes=graph.nodes, root=selected),
        raw_path_provenance=raw,
    )


def replay_serialize(result: CandidateRelativeResult) -> str:
    """Source replay from provenance; deliberately not a semantic inverse."""

    return result.raw_path_provenance


def semantic_inverse_without_provenance(_focused: CarrierGraph) -> None:
    """The candidate explicitly has no general canonical inverse."""

    return None


def test_decision_is_non_normative_and_selects_focused_carrier_with_provenance():
    data = read(DECISION)
    challenge = read(PATH_CHALLENGE)
    models = {model["id"]: model for model in data["models"]}

    assert data["schema"] == "anum-relative-result-decision/v0.3"
    assert data["status"] == "candidate-decision"
    assert data["dependsOn"] == [
        "anum-relative-context-decision/v0.3",
        challenge["schema"],
    ]
    assert data["acceptedContractLinkAllowed"] is False
    assert data["productionRelativeSemanticsChangeAllowed"] is False
    assert models["A"]["verdict"] == "reject"
    assert models["B"]["verdict"] == "reject-as-identity-model"
    assert models["C"]["verdict"] == "preferred-candidate"
    assert models["D"]["verdict"] == "reject"
    assert all(model["accepted"] is False for model in models.values())


def test_same_symbolic_selection_is_portable_across_local_node_numberings():
    assignments = read(PATH_CORPUS)["indexAssignments"]
    left = build_carrier(assignments[0])
    right = build_carrier(assignments[1])

    for vector in read(PATH_CORPUS)["positivePaths"]:
        left_result = candidate_select(vector["raw"], left)
        right_result = candidate_select(vector["raw"], right)
        assert carrier_isomorphic(left_result.focused, right_result.focused), vector["raw"]
        assert left_result.raw_path_provenance == right_result.raw_path_provenance == vector["raw"]


def test_distinct_paths_to_same_focus_share_denotation_payload_but_not_provenance():
    graph = build_carrier(read(PATH_CORPUS)["indexAssignments"][0])
    results = [candidate_select(raw, graph) for raw in ("[]", "][", "[][]")]

    assert all(carrier_isomorphic(results[0].focused, result.focused) for result in results[1:])
    assert [result.raw_path_provenance for result in results] == ["[]", "][", "[][]"]

    preferred = read(DECISION)["preferredCandidate"]
    assert preferred["sameFocusDifferentPaths"] == "same denotation payload, distinct provenance"
    assert preferred["result"]["pathParticipatesInDenotationIdentity"] is False


def test_source_replay_is_available_from_provenance_but_is_not_semantic_inverse():
    graph = build_carrier(read(PATH_CORPUS)["indexAssignments"][0])

    for raw in ("[", "]", "[[", "]]", "[]", "][", "[][]"):
        result = candidate_select(raw, graph)
        assert replay_serialize(result) == raw
        assert semantic_inverse_without_provenance(result.focused) is None

    inverse = read(DECISION)["inverseDecision"]
    assert inverse["generalCanonicalSemanticInverse"] == "undefined in this candidate"
    assert inverse["sourcePreservingReplaySerialization"] == "allowed only when path provenance is retained"
    assert inverse["sourceReplayIsCanonicalSemanticInverse"] is False
    assert inverse["shortestPathSelection"].startswith("forbidden")
    assert inverse["lexicographicPathSelection"].startswith("forbidden")
    assert inverse["backendIdentityDisambiguation"] is False


def test_focused_payload_ignores_unreachable_context_nodes_for_conformance():
    graph = build_carrier(read(PATH_CORPUS)["indexAssignments"][0])
    result = candidate_select("[[", graph)

    # The selected SS node reaches only SS and S, despite the original context
    # also containing F/E/EE. Carrier conformance is rooted at the selection.
    reachable_variant = CarrierGraph(
        nodes=(
            LinkNode(start=0, end=1),
            LinkNode(start=0, end=1),
        ),
        root=0,
    )
    assert carrier_isomorphic(result.focused, reachable_variant)
    assert read(DECISION)["preferredCandidate"]["unreachableContextNodes"] == "not observable through the focus-rooted denotation payload"


def test_relative_bits_and_mixed_carriers_remain_deferred():
    graph = build_carrier(read(PATH_CORPUS)["indexAssignments"][0])
    for raw in read(PATH_CORPUS)["unresolvedPaths"]:
        try:
            candidate_select(raw, graph)
        except ValueError as error:
            assert "0/1 are deferred" in str(error)
        else:
            raise AssertionError(f"relative path unexpectedly accepted: {raw}")

    scope = read(DECISION)["scope"]
    assert scope["relative0"] == "deferred"
    assert scope["relative1"] == "deferred"
    assert scope["mixedBracketBitCarriers"] == "deferred"
    assert scope["relativeEquality"] == "deferred"


def test_production_relative_semantics_remain_raw():
    for raw in ("[", "]", "[[", "]]", "[]", "][", "0", "1", "[0"):
        result = denotate_recursive_anum(
            parse_raw_quaternary(raw),
            ProjectionContext.RELATIVE,
        )
        assert result.kind is DenotationKind.RAW
        assert result.raw == raw

    assert read(DECISION)["scope"]["productionRelativeRemainsRaw"] is True


def test_next_gate_challenges_result_and_undefined_inverse_before_production():
    gate = read(DECISION)["nextGate"]

    assert gate["artifact"] == "anum-relative-result-inverse-challenge/v0.3"
    assert gate["status"] == "candidate-challenge"
    assert gate["mustNotChangeProductionRelativeSemantics"] is True
    assert "dropping provenance makes general inverse explicitly undefined" in gate["requiredVectors"]
    assert "no shortest or lexicographic path is synthesized" in gate["requiredVectors"]
