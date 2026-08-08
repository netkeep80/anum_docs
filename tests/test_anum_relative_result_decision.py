"""Executable evidence for the non-normative relative-result decision v0.3."""

from dataclasses import dataclass
import json
from pathlib import Path

from core.anum_denotation import DenotationKind
from core.anum_model import Abit, ProjectionContext
from core.anum_parser import parse_raw_quaternary
from core.anum_recursive_denotation import denotate_recursive_anum
from core.semantic_carrier import (
    CarrierGraph,
    LinkNode,
    carrier_isomorphic,
    reachable_indices,
)


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


def canonical_rooted_subcarrier(graph: CarrierGraph, root: int) -> CarrierGraph:
    """Drop unreachable context and deterministically reindex rooted topology."""

    rooted = CarrierGraph(nodes=graph.nodes, root=root)
    order = reachable_indices(rooted)
    mapping = {old: new for new, old in enumerate(order)}
    nodes = tuple(
        LinkNode(
            start=mapping[graph.nodes[old].start],
            end=mapping[graph.nodes[old].end],
        )
        for old in order
    )
    return CarrierGraph(nodes=nodes, root=0)


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
        focused=canonical_rooted_subcarrier(graph, selected),
        raw_path_provenance=raw,
    )


def replay_serialize(result: CandidateRelativeResult) -> str:
    """Source replay from provenance; deliberately not a semantic inverse."""

    return result.raw_path_provenance


def semantic_inverse_without_provenance(_focused: CarrierGraph) -> None:
    """The candidate explicitly has no general canonical inverse."""

    return None


def test_decision_is_non_normative_and_selects_canonical_focused_carrier():
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

    result = data["preferredCandidate"]["result"]
    assert result["denotationPayload"] == "canonical reachable rooted L1 subcarrier from selected focus"
    assert "deterministic BFS" in result["canonicalization"]
    assert result["pathParticipatesInDenotationIdentity"] is False


def test_same_symbolic_selection_has_exact_canonical_payload_across_node_numberings():
    assignments = read(PATH_CORPUS)["indexAssignments"]
    left = build_carrier(assignments[0])
    right = build_carrier(assignments[1])

    for vector in read(PATH_CORPUS)["positivePaths"]:
        left_result = candidate_select(vector["raw"], left)
        right_result = candidate_select(vector["raw"], right)
        assert left_result.focused == right_result.focused, vector["raw"]
        assert carrier_isomorphic(left_result.focused, right_result.focused), vector["raw"]
        assert left_result.raw_path_provenance == right_result.raw_path_provenance == vector["raw"]


def test_distinct_paths_to_same_focus_share_canonical_payload_but_not_provenance():
    graph = build_carrier(read(PATH_CORPUS)["indexAssignments"][0])
    results = [candidate_select(raw, graph) for raw in ("[]", "][", "[][]")]

    assert all(results[0].focused == result.focused for result in results[1:])
    assert [result.raw_path_provenance for result in results] == ["[]", "][", "[][]"]

    preferred = read(DECISION)["preferredCandidate"]
    assert preferred["sameFocusDifferentPaths"] == "same canonical denotation payload, distinct provenance"
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


def test_canonical_payload_drops_unreachable_context_nodes():
    with_extra = CarrierGraph(
        nodes=(
            LinkNode(start=0, end=0),
            LinkNode(start=1, end=1),
        ),
        root=0,
    )
    without_extra = CarrierGraph(
        nodes=(LinkNode(start=0, end=0),),
        root=0,
    )

    canonical_extra = canonical_rooted_subcarrier(with_extra, with_extra.root)
    canonical_plain = canonical_rooted_subcarrier(without_extra, without_extra.root)
    assert canonical_extra == canonical_plain == without_extra
    assert read(DECISION)["preferredCandidate"]["unreachableContextNodes"] == "removed from canonical denotation payload"


def test_canonicalization_preserves_cycles_and_sharing():
    graph = CarrierGraph(
        nodes=(
            LinkNode(start=1, end=1),
            LinkNode(start=1, end=2),
            LinkNode(start=1, end=2),
        ),
        root=0,
    )
    canonical = canonical_rooted_subcarrier(graph, graph.root)

    assert canonical.root == 0
    assert canonical.nodes == (
        LinkNode(start=1, end=1),
        LinkNode(start=1, end=2),
        LinkNode(start=1, end=2),
    )
    assert carrier_isomorphic(graph, canonical)


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


def test_next_gate_challenges_canonical_result_and_undefined_inverse_before_production():
    gate = read(DECISION)["nextGate"]

    assert gate["artifact"] == "anum-relative-result-inverse-challenge/v0.3"
    assert gate["status"] == "candidate-challenge"
    assert gate["mustNotChangeProductionRelativeSemantics"] is True
    assert "same symbolic carrier under two local index assignments yields byte-equivalent canonical focused payload" in gate["requiredVectors"]
    assert "unreachable context nodes are removed by deterministic rooted canonicalization" in gate["requiredVectors"]
    assert "dropping provenance makes general inverse explicitly undefined" in gate["requiredVectors"]
    assert "no shortest or lexicographic path is synthesized" in gate["requiredVectors"]
