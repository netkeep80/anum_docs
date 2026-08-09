"""Non-normative root-relative Anum meaning challenge for issue #206.

This challenge asks what accepted recursive Anum actually preserves.  It treats
root-relative structural description as a candidate meaning layer, while making
sharing, cycle and source-spelling losses explicit rather than hiding them.
"""

from __future__ import annotations

from dataclasses import dataclass, fields
import json
from pathlib import Path

import pytest

from core.anum_denotation import (
    AnumDenotation,
    DenotationNode,
    DenotationRef,
    StructuralDenotation,
    canonical_denotation_json,
)
from core.anum_model import ProjectionContext
from core.anum_pair_denotation import PROTOCOL_ONE_ANCHOR, PROTOCOL_ZERO_ANCHOR
from core.anum_parser import parse_raw_quaternary
from core.anum_recursive_denotation import canonical_recursive_anum, denotate_recursive_anum


ROOT = Path(__file__).resolve().parents[1]
CHALLENGE = ROOT / "contracts/anum-root-relative-meaning-challenge-v0.7.json"
CORPUS = ROOT / "contracts/anum-recursive-denotation-conformance-v0.2.json"

ROOT_REF = 0
OPEN_REF = 1
CLOSE_REF = 2
LINK_REF = 3
UNLINK_REF = 4


@dataclass(frozen=True)
class Link:
    start: int
    end: int


class RootRelativeGraph:
    """Replace protocol anchors by the five-link root kernel for inspection."""

    def __init__(self) -> None:
        self.links: dict[int, Link] = {
            ROOT_REF: Link(ROOT_REF, ROOT_REF),
            OPEN_REF: Link(OPEN_REF, ROOT_REF),
            CLOSE_REF: Link(ROOT_REF, CLOSE_REF),
            LINK_REF: Link(OPEN_REF, CLOSE_REF),
            UNLINK_REF: Link(CLOSE_REF, OPEN_REF),
        }
        self._next_ref = 5

    def add_occurrence(self, start: int, end: int) -> int:
        ref = self._next_ref
        self._next_ref += 1
        self.links[ref] = Link(start, end)
        return ref


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def root_relative_occurrence_graph(value) -> tuple[RootRelativeGraph, int]:
    structural = value.structural
    assert structural is not None
    graph = RootRelativeGraph()
    node_refs: dict[int, int] = {}

    def map_ref(ref: DenotationRef) -> int:
        if ref.anchor is not None:
            if ref.anchor == PROTOCOL_ONE_ANCHOR:
                return LINK_REF
            if ref.anchor == PROTOCOL_ZERO_ANCHOR:
                return UNLINK_REF
            raise ValueError(f"unexpected protocol anchor: {ref.anchor}")
        assert ref.node is not None
        return node_refs[ref.node]

    for node in structural.nodes:
        node_refs[node.id] = graph.add_occurrence(map_ref(node.start), map_ref(node.end))

    return graph, map_ref(structural.root)


def test_contract_is_non_normative_and_does_not_equate_source_with_semantic_link():
    contract = read(CHALLENGE)

    assert contract["schema"] == "anum-root-relative-meaning-challenge/v0.7"
    assert contract["status"] == "candidate-challenge"
    assert contract["accepted"] is False
    assert contract["issue"] == 206
    assert contract["criticalBoundary"]["sourceStringEqualsSemanticLink"] is False
    assert contract["criticalBoundary"]["generalArbitraryLinkMeaningSolved"] is False
    assert contract["veto"]["meaningTagAllowed"] is False
    assert contract["veto"]["productionChangeAllowed"] is False


def test_all_accepted_root_structural_vectors_round_trip_to_their_canonical_anum():
    corpus = read(CORPUS)
    tested = 0

    for case in corpus["cases"]:
        if case["context"] != "root" or case["expected"]["kind"] != "structural":
            continue
        value = denotate_recursive_anum(
            parse_raw_quaternary(case["raw"]), ProjectionContext.ROOT
        )
        assert value.structural is not None
        assert canonical_recursive_anum(value) == case["canonicalRaw"]
        tested += 1

    assert tested == 8


def test_distinct_source_spellings_can_have_identical_structural_denotation():
    pairs = [("[]", "1"), ("][", "0")]

    for first_raw, second_raw in pairs:
        first = denotate_recursive_anum(
            parse_raw_quaternary(first_raw), ProjectionContext.ROOT
        )
        second = denotate_recursive_anum(
            parse_raw_quaternary(second_raw), ProjectionContext.ROOT
        )
        assert canonical_denotation_json(first) == canonical_denotation_json(second)
        assert first_raw != second_raw
        assert canonical_recursive_anum(first) == second_raw


def test_recursive_raw_uses_only_four_abits_but_denotation_leaves_use_only_link_unlink_protocols():
    corpus = read(CORPUS)
    allowed_source = set("01[]")

    for case in corpus["cases"]:
        assert set(case["raw"]) <= allowed_source
        if case["expected"]["kind"] != "structural":
            continue
        value = denotate_recursive_anum(
            parse_raw_quaternary(case["raw"]), ProjectionContext(case["context"])
        )
        if value.structural is None:
            continue
        assert set(value.structural.anchors) <= {
            PROTOCOL_ZERO_ANCHOR,
            PROTOCOL_ONE_ANCHOR,
        }


def test_brackets_encode_occurrence_nesting_but_are_not_semantic_leaf_anchors():
    value = denotate_recursive_anum(
        parse_raw_quaternary("[01][10]"), ProjectionContext.ROOT
    )
    structural = value.structural
    assert structural is not None

    assert structural.anchors == (PROTOCOL_ZERO_ANCHOR, PROTOCOL_ONE_ANCHOR)
    assert len(structural.nodes) == 3
    assert all("[" not in anchor and "]" not in anchor for anchor in structural.anchors)


def test_protocol_leaves_can_be_rebased_onto_root_kernel_link_unlink_meanings():
    value = denotate_recursive_anum(
        parse_raw_quaternary("[01]1"), ProjectionContext.ROOT
    )
    graph, root = root_relative_occurrence_graph(value)

    assert graph.links[ROOT_REF] == Link(ROOT_REF, ROOT_REF)
    assert graph.links[LINK_REF] == Link(OPEN_REF, CLOSE_REF)
    assert graph.links[UNLINK_REF] == Link(CLOSE_REF, OPEN_REF)
    assert graph.links[root].end == LINK_REF
    nested = graph.links[root].start
    assert graph.links[nested] == Link(UNLINK_REF, LINK_REF)


def test_denotation_nodes_have_no_embedded_meaning_metadata():
    assert [field.name for field in fields(DenotationNode)] == ["id", "start", "end"]


def test_explicit_shared_node_identity_is_rejected_by_recursive_inverse():
    zero = DenotationRef.anchor_ref(PROTOCOL_ZERO_ANCHOR)
    one = DenotationRef.anchor_ref(PROTOCOL_ONE_ANCHOR)
    shared = DenotationRef.node_ref(0)
    value = StructuralDenotation(
        anchors=(PROTOCOL_ZERO_ANCHOR, PROTOCOL_ONE_ANCHOR),
        nodes=(
            DenotationNode(id=0, start=zero, end=one),
            DenotationNode(id=1, start=shared, end=shared),
        ),
        root=DenotationRef.node_ref(1),
    )

    with pytest.raises(ValueError, match="shared node"):
        canonical_recursive_anum(AnumDenotation.structural_result(value))


def test_occurrence_expanded_equal_copies_are_encodable():
    zero = DenotationRef.anchor_ref(PROTOCOL_ZERO_ANCHOR)
    one = DenotationRef.anchor_ref(PROTOCOL_ONE_ANCHOR)
    value = StructuralDenotation(
        anchors=(PROTOCOL_ZERO_ANCHOR, PROTOCOL_ONE_ANCHOR),
        nodes=(
            DenotationNode(id=0, start=zero, end=one),
            DenotationNode(id=1, start=zero, end=one),
            DenotationNode(
                id=2,
                start=DenotationRef.node_ref(0),
                end=DenotationRef.node_ref(1),
            ),
        ),
        root=DenotationRef.node_ref(2),
    )

    encoded = canonical_recursive_anum(AnumDenotation.structural_result(value))
    assert encoded == "[01][01]"


def test_structural_denotation_rejects_direct_node_self_cycle():
    zero = DenotationRef.anchor_ref(PROTOCOL_ZERO_ANCHOR)

    with pytest.raises(ValueError, match="earlier node"):
        StructuralDenotation(
            anchors=(PROTOCOL_ZERO_ANCHOR,),
            nodes=(
                DenotationNode(
                    id=0,
                    start=DenotationRef.node_ref(0),
                    end=zero,
                ),
            ),
            root=DenotationRef.node_ref(0),
        )


def test_structural_denotation_rejects_forward_reference_needed_for_mutual_cycle():
    zero = DenotationRef.anchor_ref(PROTOCOL_ZERO_ANCHOR)

    with pytest.raises(ValueError, match="earlier node"):
        StructuralDenotation(
            anchors=(PROTOCOL_ZERO_ANCHOR,),
            nodes=(
                DenotationNode(
                    id=0,
                    start=DenotationRef.node_ref(1),
                    end=zero,
                ),
                DenotationNode(
                    id=1,
                    start=DenotationRef.node_ref(0),
                    end=zero,
                ),
            ),
            root=DenotationRef.node_ref(1),
        )


def test_root_self_cycle_is_finite_kernel_fixed_point_not_recursive_tree_unfolding():
    graph = RootRelativeGraph()

    assert graph.links[ROOT_REF] == Link(ROOT_REF, ROOT_REF)
    assert ROOT_REF not in {LINK_REF, UNLINK_REF}
    contract = read(CHALLENGE)
    assert contract["criticalBoundary"]["rootSelfCycleIsUnfoldedInfinitely"] is False
    assert contract["cycles"]["cycleSupportWouldRequireAnotherFiniteReferenceOrSelfClosureMechanism"] is True


def test_challenge_states_occurrence_tree_boundary_instead_of_hiding_sharing_loss():
    contract = read(CHALLENGE)

    assert contract["criticalBoundary"]["canonicalAnumPreservesOccurrenceTree"] is True
    assert contract["criticalBoundary"]["canonicalAnumPreservesExplicitSharingIdentity"] is False
    assert contract["sharing"]["explicitSharedNodeInverseMustReject"] is True
    assert contract["sharing"]["occurrenceExpandedCopyCanEncode"] is True
    assert contract["veto"]["sharingLossMayBeHidden"] is False


def test_general_cycle_and_higher_theory_meaning_remain_open():
    contract = read(CHALLENGE)

    assert contract["notDecided"] == [
        "whether to call canonical Anum the meaning of a link or only its root-relative structural description",
        "the finite representation of arbitrary cyclic/shared asets",
        "how self-closure signs integrate with general cycle serialization",
        "how dictionaries/theories contribute higher contextual meaning",
        "production serialization changes",
    ]
